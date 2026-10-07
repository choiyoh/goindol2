/** Load & parse homage stage1.json (Tiled). Never touches /data/. */

import { TILE, TERRAIN, SCREEN_W } from './config.js';

function propsOf(obj) {
  const out = {};
  for (const p of obj.properties || []) out[p.name] = p.value;
  return out;
}

function mapProps(map) {
  const out = {};
  for (const p of map.properties || []) out[p.name] = p.value;
  return out;
}

/**
 * @returns {Promise<Level>}
 */
export async function loadLevel(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const raw = await res.json();
  return parseLevel(raw);
}

export function parseLevel(raw) {
  const mp = mapProps(raw);
  const tilesLayer = raw.layers.find((l) => l.name === 'tiles' && l.type === 'tilelayer');
  const frontLayer = raw.layers.find((l) => l.name === 'front' && l.type === 'tilelayer');
  const collisionLayer = raw.layers.find((l) => l.name === 'collision' && l.type === 'tilelayer');
  const entLayer = raw.layers.find((l) => l.name === 'entities' && l.type === 'objectgroup');

  if (!tilesLayer) throw new Error('Missing tiles layer');

  const width = tilesLayer.width;
  const height = tilesLayer.height;
  // tileIdMode: layer values ARE terrain IDs 0–5
  const tiles = Int8Array.from(tilesLayer.data);
  const front = frontLayer ? Int8Array.from(frontLayer.data) : new Int8Array(width * height);
  const collision = collisionLayer
    ? Int16Array.from(collisionLayer.data)
    : null;

  const entities = {
    playerStart: null,
    checkpoints: [],
    lighter: null,
    goalLight: null,
    platforms: [],
    enemies: [],
    spawnAreas: [],
    items: [],
    gates: [],
    secrets: [],
    decos: [],
    sections: [],
  };

  for (const o of entLayer?.objects || []) {
    const type = o.type || o.class || '';
    const p = propsOf(o);
    const base = {
      id: o.id,
      name: o.name || type,
      type,
      x: o.x,
      y: o.y,
      w: o.width || TILE,
      h: o.height || TILE,
      props: p,
    };

    switch (type) {
      case 'player_start':
        entities.playerStart = base;
        break;
      case 'checkpoint':
        entities.checkpoints.push({ ...base, index: p.index ?? 0, active: false });
        break;
      case 'lighter':
        entities.lighter = { ...base, taken: false, score: p.score ?? 0 };
        break;
      case 'goal_light':
        entities.goalLight = { ...base, cleared: false };
        break;
      case 'platform':
        entities.platforms.push(makePlatform(base, p));
        break;
      case 'enemy': {
        // Map object x,y is top-left of placeholder; store feet-center like player.
        const feetX = base.x + base.w / 2;
        const feetY = base.y + base.h;
        entities.enemies.push({
          id: base.id,
          name: base.name,
          type: base.type,
          kind: p.kind || 'enemy',
          behavior: p.behavior ?? 9,
          hp: p.hp ?? 15,
          score: p.score ?? 100,
          expertOnly: !!p.expert_only,
          areaId: p.area ?? null,
          // behavior params (pass-through; enemies.js initEnemyAi consumes)
          patrolMinX: p.patrolMinX,
          patrolMaxX: p.patrolMaxX,
          minY: p.minY,
          maxY: p.maxY,
          anchorY: p.anchorY,
          ropeLen: p.ropeLen,
          swingDeg: p.swingDeg,
          vjp: p.vjp,
          triggerDist: p.triggerDist,
          alive: true,
          // feet-center position (collision / draw anchor)
          x: feetX,
          y: feetY,
          w: base.w,
          h: base.h,
          props: p,
          // AI runtime (behavior 10 turtle fills these)
          aiState: 'idle',
          facing: -1,
          animFrame: 0,
          animT: 0,
          vx: 0,
          emergeT: 0,
          hurtT: 0,
          flipT: 0,
          drawYOff: 0,
          spriteFrame: 0,
          areaBounds: null,
        });
        break;
      }
      case 'spawn_area':
        entities.spawnAreas.push({ ...base, areaType: p.areaType ?? 0 });
        break;
      case 'item':
        entities.items.push({
          ...base,
          kind: p.kind || 'item',
          score: p.score ?? 0,
          letter: p.letter,
          taken: false,
        });
        break;
      case 'gate':
        entities.gates.push({
          ...base,
          outX: p.outX,
          outY: p.outY,
          screen: p.screen ?? 0,
          scrollLock: !!p.scrollLock,
        });
        break;
      case 'secret':
        entities.secrets.push({
          ...base,
          kind: p.kind || 'small',
          hits: p.hits ?? 1,
          hp: p.hp ?? 0,
          solid: !!p.solid,
          required: !!p.required,
          count: p.count,
          value: p.value,
          contains: p.contains,
          broken: false,
          damageTaken: 0,
        });
        break;
      case 'deco':
        entities.decos.push({ ...base, kind: p.kind, text: p.text });
        break;
      case 'section':
        entities.sections.push({ ...base, section: p.section });
        break;
      default:
        break;
    }
  }

  entities.checkpoints.sort((a, b) => a.index - b.index);

  // Resolve spawn_area bounds onto enemies that reference area id
  const areaById = new Map(entities.spawnAreas.map((a) => [a.id, a]));
  for (const e of entities.enemies) {
    if (e.areaId == null) continue;
    const a = areaById.get(e.areaId);
    if (!a) continue;
    e.areaBounds = { x: a.x, y: a.y, w: a.w, h: a.h };
    // Snap feet to area ground (bottom) — placeholders already sit there
    e.y = a.y + a.h;
  }

  // I1: keep the goal on screen — bump scroll limit at runtime (map file untouched).
  let scrollLimitTile = mp.scrollLimitTile ?? width;
  const goal = entities.goalLight;
  if (goal) {
    const need = Math.ceil((goal.x + goal.w + SCREEN_W * 0.25) / TILE);
    if (scrollLimitTile < need) scrollLimitTile = Math.min(width, need);
  }

  return {
    width,
    height,
    pixelW: width * TILE,
    pixelH: height * TILE,
    tiles,
    front,
    collision,
    scrollLimitTile,
    scrollLimitTileMap: mp.scrollLimitTile ?? width,
    scrollFlags: mp.scrollFlags ?? 0,
    name: mp.name || 'stage1',
    clearRule: mp.clearRule || '',
    entities,
    tileAt(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) return TERRAIN.ROCK;
      return tiles[ty * width + tx];
    },
  };
}

/**
 * Platforms use GM distance/direction from entities.
 * Timing: speed is stored as original px/tick; we convert with ORIG_HZ.
 * Ping-pong travel is approximate — mark timing TBD for playtest.
 */
function makePlatform(base, p) {
  const dir = p.dir ?? 0; // 0=R 2=D 4=L 6=U
  const speedTick = p.speed ?? 2;
  const distance = p.distance ?? 0;
  const dx = dir === 0 ? 1 : dir === 4 ? -1 : 0;
  const dy = dir === 2 ? 1 : dir === 6 ? -1 : 0;
  return {
    ...base,
    dir,
    speedTick,
    distance,
    dropdown: !!p.dropdown,
    delay: p.delay ?? 0,
    selfMoving: p.selfMoving !== false,
    pingpong: p.pingpong !== false,
    respawnTicks: p.respawnTicks ?? 70,
    dx,
    dy,
    // runtime
    originX: base.x,
    originY: base.y,
    travel: 0, // 0..distance, pingpong
    travelDir: 1,
    fallTimer: 0,
    fallen: false,
    respawnTimer: 0,
    riding: false,
    // NOTE: timing TBD for playtest — path geometry from distance/dir is authoritative
    timingNote: 'TBD-playtest',
  };
}
