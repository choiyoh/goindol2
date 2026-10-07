/**
 * Enemy AI + turtle sheet (hand-drawn homage art only).
 *
 * Behavior 10 (turtle): idle/burrowed → emerge → walk patrol in spawn_area.
 * Walk speed ~45 px/s (anim-matched crawl; meta suggestedWalkSpeedPx is px/tick @ ORIG_HZ).
 * Sheet faces LEFT; facing > 0 flips horizontally around feet anchor.
 */

import { SCREEN_W, ORIG_HZ, TILE, GRAVITY, MAX_FALL } from './config.js';
import { aabbOverlap, isSolidTerrain, isOneWay } from './collision.js';
import { hurtPlayer } from './player.js';
import { spawnDirt, spawnSpark } from './fx.js';

const ASSET_BASE = './assets/enemies/';

/** Crawl pace matched to walkFrameMs 150 + footSlide feel (not 7*ORIG_HZ). */
export const TURTLE_WALK_SPEED = 45;

const EMERGE_SEC = 0.4;
const HURT_FLASH_SEC = 0.12;
const FLIP_SEC = 0.4;
/** Activate when player within this of area/enemy OR enemy within ±SCREEN_W of cam. */
const WAKE_PLAYER_DIST = 200;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

/**
 * Load turtle.png + turtle.json.
 * @returns {Promise<{image, cell, anchor, facing, frames, walkFrameMs, flippedFrameMs, hitboxRelAnchor, drawHeightPx}>}
 */
export async function loadTurtleSheet() {
  const [meta, image] = await Promise.all([
    fetch(`${ASSET_BASE}turtle.json`).then(async (r) => {
      if (!r.ok) throw new Error(`turtle.json ${r.status}`);
      return r.json();
    }),
    loadImage(`${ASSET_BASE}turtle.png`),
  ]);
  return { ...meta, image };
}

/**
 * World-space AABB from hitboxRelAnchor (feet-relative).
 * Same mirror convention as getClubHitbox; turtle box is centered so facing cancels.
 */
export function getTurtleHitbox(e, sheet) {
  const box = (sheet && sheet.hitboxRelAnchor) || e.hitboxRelAnchor;
  if (!box) {
    // Fallback: approx body above feet
    return { x: e.x - 16, y: e.y - 13, w: 32, h: 13 };
  }
  const x = e.facing < 0 ? e.x + box.x : e.x - box.x - box.w;
  return { x, y: e.y + box.y, w: box.w, h: box.h };
}

/**
 * Generic enemy hitbox for contact/club/stomp.
 * Second arg: either the sheets object {turtle,bear,spider} or (legacy) the turtle sheet.
 */
export function getEnemyHitbox(e, sheets) {
  const S = sheets && (sheets.turtle || sheets.bear || sheets.spider) ? sheets : { turtle: sheets };
  if (e.kind === 'turtle') return getTurtleHitbox(e, S.turtle);
  if (e.kind === 'bear' || e.kind === 'bear_ground') return getBearHitbox(e, S.bear);
  if (e.kind === 'spider') return getSpiderHitbox(e, S.spider);
  if (e.kind === 'small_dino') return getJumperHitbox(e, S.dino, DINO_BOX);
  if (e.kind === 'panther' || e.kind === 'leopard') return getJumperHitbox(e, S.leopard, LEOPARD_BOX);
  // Non-turtle: still stored as feet-center after level parse
  return { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h };
}

function areaOf(e) {
  return e.areaBounds;
}

function shouldWake(e, player, camX) {
  const a = areaOf(e);
  const refX = a ? a.x + a.w / 2 : e.x;
  const nearPlayer =
    Math.abs(player.x - refX) < WAKE_PLAYER_DIST ||
    Math.abs(player.x - e.x) < WAKE_PLAYER_DIST;
  const onScreen =
    e.x > camX - SCREEN_W && e.x < camX + SCREEN_W * 2;
  return nearPlayer || onScreen;
}

function startWalk(e) {
  e.aiState = 'walk';
  e.drawYOff = 0;
  e.animFrame = 0;
  e.animT = 0;
  // Prefer walking toward player if known later; default left (sheet facing)
  if (e.vx === 0) {
    e.facing = -1;
    e.vx = -TURTLE_WALK_SPEED;
  } else {
    e.facing = e.vx < 0 ? -1 : 1;
  }
}

/**
 * Update behavior-10 turtles. Mutual exclusion: entities.js skips turtle AI
 * but still handles generic enemies; turtles are fully handled here
 * (contact, club, stomp, death).
 *
 * @param {object} level
 * @param {object} player
 * @param {object} game
 * @param {object|null} attackHitbox
 * @param {number} dt
 * @param {object|null} turtleSheet
 * @param {number} camX
 * @returns {string[]} flash messages
 */
export function updateTurtles(level, player, game, attackHitbox, dt, turtleSheet, camX) {
  const msgs = [];
  const walkMs = (turtleSheet && turtleSheet.walkFrameMs) || 150;
  const flipMs = (turtleSheet && turtleSheet.flippedFrameMs) || 120;
  const walkFrames =
    (turtleSheet && turtleSheet.frames && turtleSheet.frames.walk) || [0, 1, 2, 3];
  const flipFrames =
    (turtleSheet && turtleSheet.frames && turtleSheet.frames.flipped) || [5, 6];
  const hurtFrame =
    turtleSheet && turtleSheet.frames ? turtleSheet.frames.hurt : 4;

  for (const e of level.entities.enemies) {
    if (e.kind !== 'turtle') continue;
    if (!e.alive) continue;
    if (e.expertOnly && !game.expert) continue;

    // --- death flip ---
    if (e.aiState === 'flip') {
      e.flipT += dt;
      e.animT += dt;
      const frameDur = flipMs / 1000;
      while (e.animT >= frameDur) {
        e.animT -= frameDur;
        e.animFrame = (e.animFrame + 1) % flipFrames.length;
      }
      e.spriteFrame = flipFrames[e.animFrame % flipFrames.length];
      if (e.flipT >= FLIP_SEC) {
        e.alive = false;
      }
      continue;
    }

    // --- wake from idle ---
    if (e.aiState === 'idle') {
      if (!shouldWake(e, player, camX ?? 0)) continue;
      e.aiState = 'emerge';
      e.emergeT = 0;
      e.drawYOff = 14; // start buried (drawHeightPx)
      e.spriteFrame = walkFrames[0];
      e.vx = 0;
      spawnDirt(e.x, e.y); // dirt at feet when emerge starts
    }

    // --- emerge ---
    if (e.aiState === 'emerge') {
      e.emergeT += dt;
      const t = Math.min(1, e.emergeT / EMERGE_SEC);
      e.drawYOff = 14 * (1 - t);
      e.spriteFrame = walkFrames[0];
      if (t >= 1) startWalk(e);
      // no contact while emerging from deep underground early; allow near end
      if (t < 0.5) continue;
    }

    // --- hurt flash ---
    if (e.aiState === 'hurt') {
      e.hurtT -= dt;
      e.spriteFrame = hurtFrame;
      e.vx = 0;
      if (e.hurtT <= 0) {
        // resume previous walk direction
        e.aiState = 'walk';
        e.vx = (e.facing < 0 ? -1 : 1) * TURTLE_WALK_SPEED;
        e.animFrame = 0;
        e.animT = 0;
      }
    }

    // --- walk patrol ---
    if (e.aiState === 'walk') {
      const a = areaOf(e);
      const halfW = 16; // body half for edge clamp
      let left = a ? a.x + halfW : e.x - 40;
      let right = a ? a.x + a.w - halfW : e.x + 40;
      e.x += e.vx * dt;
      if (e.x <= left) {
        e.x = left;
        e.facing = 1;
        e.vx = TURTLE_WALK_SPEED;
      } else if (e.x >= right) {
        e.x = right;
        e.facing = -1;
        e.vx = -TURTLE_WALK_SPEED;
      }
      e.animT += dt;
      const frameDur = walkMs / 1000;
      while (e.animT >= frameDur) {
        e.animT -= frameDur;
        e.animFrame = (e.animFrame + 1) % walkFrames.length;
      }
      e.spriteFrame = walkFrames[e.animFrame % walkFrames.length];
      e.drawYOff = 0;
    }

    // Keep feet on area ground (bottom)
    const a = areaOf(e);
    if (a) e.y = a.y + a.h;

    // --- contact / stomp / club (skip while fully idle/burrowed) ---
    if (e.aiState === 'idle') continue;

    const hb = getTurtleHitbox(e, turtleSheet);

    if (player.invuln <= 0 && player.alive) {
      if (
        aabbOverlap(
          player.x - player.w / 2,
          player.y - player.h,
          player.w,
          player.h,
          hb.x,
          hb.y,
          hb.w,
          hb.h,
        )
      ) {
        // Stomp: falling onto top
        if (player.vy > 0 && player.y - player.vy * dt < hb.y + 4) {
          beginFlip(e, game);
          player.vy = -180;
          player.onGround = false;
          continue;
        }
        if (e.aiState !== 'flip') hurtPlayer(player, game);
      }
    }

    if (attackHitbox && e.alive && e.aiState !== 'flip' && e._lastSwing !== attackHitbox.swingId) {
      if (
        aabbOverlap(
          attackHitbox.x,
          attackHitbox.y,
          attackHitbox.w,
          attackHitbox.h,
          hb.x,
          hb.y,
          hb.w,
          hb.h,
        )
      ) {
        e._lastSwing = attackHitbox.swingId;
        e.hp -= attackHitbox.damage;
        spawnSpark(
          attackHitbox.x + attackHitbox.w / 2,
          attackHitbox.y + attackHitbox.h / 2,
          attackHitbox.swingId,
        );
        if (e.hp <= 0) {
          beginFlip(e, game);
        } else {
          e.aiState = 'hurt';
          e.hurtT = HURT_FLASH_SEC;
          e.spriteFrame = hurtFrame;
          e.vx = 0;
        }
      }
    }
  }

  return msgs;
}

function beginFlip(e, game) {
  e.aiState = 'flip';
  e.flipT = 0;
  e.animFrame = 0;
  e.animT = 0;
  e.vx = 0;
  e.drawYOff = 0;
  game.score += e.score || 200;
}

/**
 * Draw turtle sprite at feet (e.x, e.y + drawYOff for emerge).
 * Sheet faces left; facing > 0 → horizontal flip.
 */
export function drawTurtle(ctx, e, camX, camY, sheet) {
  if (!sheet || !sheet.image) return;
  const [cellW, cellH] = sheet.cell;
  const [ax, ay] = sheet.anchor;
  const frame = e.spriteFrame ?? 0;
  const sx = frame * cellW;
  const feetX = Math.round(e.x - camX);
  const feetY = Math.round(e.y + (e.drawYOff || 0) - camY);

  ctx.save();
  ctx.translate(feetX, feetY);
  // Sheet default facing is LEFT. facing > 0 (right) → flip.
  if (e.facing > 0) ctx.scale(-1, 1);
  ctx.drawImage(sheet.image, sx, 0, cellW, cellH, -ax, -ay, cellW, cellH);
  ctx.restore();
}

/** Documented: ORIG_HZ conversion of suggestedWalkSpeedPx would be ~163 px/s — too fast. */
export const TURTLE_SPEED_NOTE =
  `Turtle walk ${TURTLE_WALK_SPEED} px/s (anim-matched); meta suggestedWalkSpeedPx*ORIG_HZ≈${(7 * ORIG_HZ).toFixed(0)} unused.`;

/* ======================================================================
 * Bear + spider (hand-drawn homage sheets: bear.png/json, spider.png/json)
 * ====================================================================== */

/** Kinds owned by enemies.js (entities.js skips these). */
export const ENEMY_KINDS_OWNED = new Set(['turtle', 'bear', 'bear_ground', 'spider', 'small_dino', 'panther', 'leopard']);

/** Bear speeds from meta note: slow ≈21 px/s @140ms, fast ≈33 px/s @90ms. */
export const BEAR_SLOW_SPEED = 21;
export const BEAR_FAST_SPEED = 33;
const BEAR_EMERGE_SEC = 0.5;
const BEAR_DEATH_SEC = 0.45;
const BEAR_DROP_WAKE_DIST = 120; // player |dx| to sky-drop area centre
const BEAR_DROP_PATROL = 56; // ±px around landing (intersected with area)
const SPIDER_BOB_PERIOD = 3.0; // s, vertical oscillation (behavior 2)
const SPIDER_SWING_PERIOD = 2.4; // s, ≈2π√(80/592)
const SPIDER_DEATH_SEC = 0.7;
export const WEB_COLOR = '#e8e8f0';

async function loadSheet(name) {
  const [meta, image] = await Promise.all([
    fetch(`${ASSET_BASE}${name}.json`).then(async (r) => {
      if (!r.ok) throw new Error(`${name}.json ${r.status}`);
      return r.json();
    }),
    loadImage(`${ASSET_BASE}${name}.png`),
  ]);
  return { ...meta, image };
}

export const loadBearSheet = () => loadSheet('bear');
export const loadSpiderSheet = () => loadSheet('spider');

export const loadDinoSheet = () => loadSheet('dino');
export const loadLeopardSheet = () => loadSheet('leopard');

/** @returns {Promise<{turtle, bear, spider, dino, leopard}>} */
export async function loadEnemySheets() {
  const [turtle, bear, spider, dino, leopard] = await Promise.all([
    loadTurtleSheet(), loadBearSheet(), loadSpiderSheet(), loadDinoSheet(), loadLeopardSheet(),
  ]);
  return { turtle, bear, spider, dino, leopard };
}

// ---------- tile probes ----------
function solidTop(level, x, y) {
  const id = level.tileAt(Math.floor(x / TILE), Math.floor(y / TILE));
  return isSolidTerrain(id) || isOneWay(id);
}

/** Ceiling bottom (px) above `y` at column x within maxUp px, else null. */
function ceilingAbove(level, x, y, maxUp = 64) {
  const tx = Math.floor(x / TILE);
  for (let ty = Math.floor((y - 1) / TILE); ty >= 0 && y - (ty + 1) * TILE <= maxUp; ty--) {
    if (isSolidTerrain(level.tileAt(tx, ty))) return (ty + 1) * TILE;
  }
  return null;
}

/**
 * Initialise per-kind AI fields. Call once after loadLevel (needs level for tile probes).
 * Turtles keep their existing fields (aiState 'idle' = burrowed).
 */
export function initEnemyAi(e, level) {
  const p = e.props || {};
  if (e.kind === 'turtle') {
    e.aiState = 'idle';
    return e;
  }
  if (e.kind === 'bear' || e.kind === 'bear_ground') {
    const fast = e.kind === 'bear_ground';
    e.speed = fast ? BEAR_FAST_SPEED : BEAR_SLOW_SPEED;
    e.fast = fast;
    e.facing = -1;
    e.vx = 0;
    e.vy = 0;
    e.animFrame = 0;
    e.animT = 0;
    e.spriteFrame = 0;
    e.drawYOff = 0;
    e.deathT = 0;
    if (e.behavior === 9) {
      e.aiState = 'idle'; // standing, drawn; starts walking on wake
      e.patrolMin = p.patrolMinX ?? e.x - 48;
      e.patrolMax = p.patrolMaxX ?? e.x + 48;
    } else if (e.behavior === 0) {
      e.aiState = 'sky'; // hidden above
      const a = e.areaBounds;
      e.homeX = e.x;
      e.y = a ? a.y + 34 : e.y - 128; // drop in just under the area top
    } else if (e.behavior === 10) {
      e.aiState = 'buried';
      if (e.areaBounds) e.y = e.areaBounds.y + e.areaBounds.h;
    } else {
      e.aiState = 'idle';
      e.patrolMin = e.x - 48;
      e.patrolMax = e.x + 48;
    }
    return e;
  }
  if (e.kind === 'small_dino' || e.kind === 'panther' || e.kind === 'leopard') {
    initJumper(e);
    return e;
  }
  if (e.kind === 'spider') {
    e.spriteFrame = 0;
    e.animFrame = 0;
    e.animT = 0;
    e.facing = 1;
    e.angle = 0;
    e.t = 0;
    e.deathT = 0;
    e.vy = 0;
    if (e.behavior === 4) {
      e.aiState = 'swing';
      e.pivotX = e.x;
      e.pivotY = p.anchorY ?? e.y - 96;
      e.ropeLen = p.ropeLen ?? 80;
      e.swingDeg = p.swingDeg ?? 50;
      e.x = e.pivotX;
      e.y = e.pivotY + e.ropeLen;
    } else {
      e.aiState = 'bob';
      const minY = p.minY ?? e.y - 40;
      const maxY = p.maxY ?? e.y + 40;
      e.minY = Math.min(minY, maxY);
      e.maxY = Math.max(minY, maxY);
      // web anchor (top of body) starts at placeholder top
      const startY = Math.max(e.minY, Math.min(e.maxY, e.y - e.h));
      const mid = (e.minY + e.maxY) / 2;
      const amp = (e.maxY - e.minY) / 2 || 1;
      e.phase = Math.asin(Math.max(-1, Math.min(1, (startY - mid) / amp)));
      e.y = startY;
      // Web attach = ceiling just above top of travel, else minY (art: line UP from anchor)
      const ceil = level ? ceilingAbove(level, e.x, e.minY + 0.5, 64) : null;
      e.webAttachY = ceil ?? e.minY;
    }
    return e;
  }
  return e;
}

// ---------- hitboxes ----------
export function getBearHitbox(e, sheet) {
  const box = (sheet && sheet.hitboxRelAnchor) || { x: -24, y: -30, w: 46, h: 30 };
  const x = e.facing < 0 ? e.x + box.x : e.x - box.x - box.w;
  return { x, y: e.y + (e.drawYOff || 0) + box.y, w: box.w, h: box.h };
}

/** Spider: e.x,e.y = web anchor (top of body). Hitbox hangs below, rotated with rope. */
export function getSpiderHitbox(e, sheet) {
  const box = (sheet && sheet.hitboxRelAnchor) || { x: -6, y: 1, w: 12, h: 11 };
  const a = e.angle || 0;
  if (!a) return { x: e.x + box.x, y: e.y + box.y, w: box.w, h: box.h };
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  // rotate centre offset by -a (sprite hangs along rope pointing away from pivot)
  const rx = cx * Math.cos(a) + cy * Math.sin(a);
  const ry = -cx * Math.sin(a) + cy * Math.cos(a);
  return { x: e.x + rx - box.w / 2, y: e.y + ry - box.h / 2, w: box.w, h: box.h };
}

// ---------- shared contact / club / stomp ----------
/**
 * @returns {'stomp'|'club'|'hurtPlayer'|null}
 */
function resolveCombat(e, hb, stompTop, player, game, attackHitbox, dt) {
  if (player.invuln <= 0 && player.alive) {
    if (aabbOverlap(
      player.x - player.w / 2, player.y - player.h, player.w, player.h,
      hb.x, hb.y, hb.w, hb.h,
    )) {
      if (player.vy > 0 && player.y - player.vy * dt < stompTop + 4) {
        player.vy = -180;
        player.onGround = false;
        return 'stomp';
      }
      hurtPlayer(player, game);
    }
  }
  if (attackHitbox && e._lastSwing !== attackHitbox.swingId) {
    if (aabbOverlap(
      attackHitbox.x, attackHitbox.y, attackHitbox.w, attackHitbox.h,
      hb.x, hb.y, hb.w, hb.h,
    )) {
      e._lastSwing = attackHitbox.swingId;
      e.hp -= attackHitbox.damage;
      spawnSpark(
        attackHitbox.x + attackHitbox.w / 2,
        attackHitbox.y + attackHitbox.h / 2,
        attackHitbox.swingId,
      );
      return 'club';
    }
  }
  return null;
}

function stepAnim(e, dt, frameMs, frames) {
  e.animT += dt;
  const d = frameMs / 1000;
  while (e.animT >= d) {
    e.animT -= d;
    e.animFrame = (e.animFrame + 1) % frames.length;
  }
  e.spriteFrame = frames[e.animFrame % frames.length];
}

// ---------- bears ----------
function bearWalk(e, level, dt, sheet) {
  const frames = (sheet && sheet.frames && sheet.frames.walk) || [0, 1, 2, 3];
  const ms = e.fast ? (sheet?.fastWalkFrameMs ?? 90) : (sheet?.walkFrameMs ?? 140);
  if (e.vx === 0) e.vx = e.facing * e.speed;
  const nx = e.x + e.vx * dt;
  let flip = false;
  if (nx <= e.patrolMin) { e.x = e.patrolMin; flip = e.vx < 0; }
  else if (nx >= e.patrolMax) { e.x = e.patrolMax; flip = e.vx > 0; }
  else if (!solidTop(level, nx, e.y + 1)) flip = true; // ledge guard
  else e.x = nx;
  if (flip) {
    e.facing = e.vx < 0 ? 1 : -1;
    e.vx = e.facing * e.speed;
  }
  stepAnim(e, dt, ms, frames);
}

function bearKill(e, game) {
  e.aiState = 'dead';
  e.deathT = 0;
  e.vx = 0;
  e.drawYOff = 0;
  game.score += e.score || 100;
}

export function updateBears(level, player, game, attackHitbox, dt, sheet, camX) {
  const hurtFrame = sheet?.frames?.hurt ?? 4;
  const walk0 = sheet?.frames?.walk?.[0] ?? 0;
  const stompRel = sheet?.stompTopY ?? -30;
  const buryPx = sheet?.drawHeightPx ?? 31;
  for (const e of level.entities.enemies) {
    if (e.kind !== 'bear' && e.kind !== 'bear_ground') continue;
    if (!e.alive || (e.expertOnly && !game.expert)) continue;

    if (e.aiState === 'dead') {
      e.deathT += dt;
      e.spriteFrame = hurtFrame;
      if (e.deathT >= BEAR_DEATH_SEC) e.alive = false;
      continue;
    }

    switch (e.aiState) {
      case 'idle': // behavior 9 standing until on-screen/near
        e.spriteFrame = walk0;
        if (shouldWake(e, player, camX ?? 0)) {
          e.aiState = 'walk';
          e.vx = e.facing * e.speed;
        }
        break;
      case 'sky': {
        const a = e.areaBounds;
        const cx = a ? a.x + a.w / 2 : e.x;
        if (Math.abs(player.x - cx) < BEAR_DROP_WAKE_DIST) {
          e.aiState = 'fall';
          e.vy = 0;
          e.spriteFrame = walk0;
        } else continue; // hidden, no contact
        break;
      }
      case 'fall': {
        e.spriteFrame = walk0;
        e.vy = Math.min(MAX_FALL, e.vy + GRAVITY * dt);
        const ny = e.y + e.vy * dt;
        // land on first solid/one-way tile top crossed this step
        let landed = null;
        for (let ty = Math.floor(e.y / TILE); ty <= Math.floor(ny / TILE); ty++) {
          const top = ty * TILE;
          if (top >= e.y - 0.01 && top <= ny && solidTop(level, e.x, top + 1)) { landed = top; break; }
        }
        const a = e.areaBounds;
        const floor = a ? a.y + a.h + 64 : level.pixelH;
        if (landed == null && ny >= floor) landed = floor;
        if (landed != null) {
          e.y = landed;
          e.vy = 0;
          e.aiState = 'walk';
          const lo = e.x - BEAR_DROP_PATROL;
          const hi = e.x + BEAR_DROP_PATROL;
          e.patrolMin = a ? Math.max(lo, a.x + 22) : lo;
          e.patrolMax = a ? Math.min(hi, a.x + a.w - 22) : hi;
          e.facing = player.x < e.x ? -1 : 1;
          e.vx = e.facing * e.speed;
        } else e.y = ny;
        break;
      }
      case 'buried':
        if (!shouldWake(e, player, camX ?? 0)) continue;
        e.aiState = 'emerge';
        e.emergeT = 0;
        e.drawYOff = buryPx;
        e.spriteFrame = walk0;
        spawnDirt(e.x, e.y); // dirt at feet when bear_ground emerge starts
      // fallthrough
      case 'emerge': {
        e.emergeT += dt;
        const t = Math.min(1, e.emergeT / BEAR_EMERGE_SEC);
        e.drawYOff = buryPx * (1 - t);
        e.spriteFrame = walk0;
        if (t >= 1) {
          const a = e.areaBounds;
          e.patrolMin = a ? a.x + 22 : e.x - 48;
          e.patrolMax = a ? a.x + a.w - 22 : e.x + 48;
          e.drawYOff = 0;
          e.aiState = 'walk';
          e.facing = player.x < e.x ? -1 : 1;
          e.vx = e.facing * e.speed;
          e.animFrame = 0;
          e.animT = 0;
        }
        if (t < 0.5) continue;
        break;
      }
      case 'hurt':
        e.hurtT -= dt;
        e.spriteFrame = hurtFrame;
        if (e.hurtT <= 0) {
          e.aiState = 'walk';
          e.vx = e.facing * e.speed;
        }
        break;
      case 'walk':
        bearWalk(e, level, dt, sheet);
        break;
      default:
        break;
    }

    const hb = getBearHitbox(e, sheet);
    const r = resolveCombat(e, hb, e.y + (e.drawYOff || 0) + stompRel, player, game, attackHitbox, dt);
    if (r === 'stomp' || (r === 'club' && e.hp <= 0)) bearKill(e, game);
    else if (r === 'club') {
      e.aiState = 'hurt';
      e.hurtT = HURT_FLASH_SEC;
      e.spriteFrame = hurtFrame;
    }
  }
}

// ---------- spiders ----------
export function updateSpiders(level, player, game, attackHitbox, dt, sheet) {
  const frames = sheet?.frames?.wiggle || [0, 1, 2, 3];
  const hurtFrame = sheet?.frames?.hurt ?? 4;
  const ms = sheet?.frameMs ?? 110;
  for (const e of level.entities.enemies) {
    if (e.kind !== 'spider') continue;
    if (!e.alive || (e.expertOnly && !game.expert)) continue;

    if (e.aiState === 'dead') {
      // web snaps: fall with gravity
      e.deathT += dt;
      e.vy = Math.min(MAX_FALL, e.vy + GRAVITY * dt);
      e.y += e.vy * dt;
      e.spriteFrame = hurtFrame;
      if (e.deathT >= SPIDER_DEATH_SEC) e.alive = false;
      continue;
    }

    e.t += dt;
    if (e.aiState === 'swing') {
      const a = Math.sin((2 * Math.PI * e.t) / SPIDER_SWING_PERIOD) * (e.swingDeg * Math.PI) / 180;
      e.angle = a;
      e.x = e.pivotX + Math.sin(a) * e.ropeLen;
      e.y = e.pivotY + Math.cos(a) * e.ropeLen;
    } else {
      const mid = (e.minY + e.maxY) / 2;
      const amp = (e.maxY - e.minY) / 2;
      e.y = mid + amp * Math.sin(e.phase + (2 * Math.PI * e.t) / SPIDER_BOB_PERIOD);
    }

    if (e.hurtT > 0) {
      e.hurtT -= dt;
      e.spriteFrame = hurtFrame;
    } else stepAnim(e, dt, ms, frames);

    const hb = getSpiderHitbox(e, sheet);
    const r = resolveCombat(e, hb, hb.y, player, game, attackHitbox, dt);
    if (r === 'stomp' || (r === 'club' && e.hp <= 0)) {
      e.aiState = 'dead';
      e.deathT = 0;
      e.vy = 0;
      game.score += e.score || 300;
    } else if (r === 'club') {
      e.hurtT = HURT_FLASH_SEC;
    }
  }
}

/**
 * One call for every enemies.js-owned kind (turtle → updateTurtles unchanged).
 * @param {object} sheets {turtle, bear, spider}
 */
export function updateEnemies(level, player, game, attackHitbox, dt, cam, sheets) {
  const camX = cam ? cam.x : 0;
  const msgs = updateTurtles(level, player, game, attackHitbox, dt, sheets.turtle, camX) || [];
  updateBears(level, player, game, attackHitbox, dt, sheets.bear, camX);
  updateSpiders(level, player, game, attackHitbox, dt, sheets.spider);
  updateJumpers(level, player, game, attackHitbox, dt, sheets);
  return msgs;
}

// ---------- drawing ----------
/** Bear at feet anchor; sheet faces left, facing>0 flips. Emerge clips below ground + dirt. */
export function drawBear(ctx, e, camX, camY, sheet) {
  if (!sheet || !sheet.image) return;
  if (e.aiState === 'sky' || e.aiState === 'buried') return;
  if (e.aiState === 'dead' && Math.floor(e.deathT * 20) % 2 === 0) return; // blink
  const [cellW, cellH] = sheet.cell;
  const [ax, ay] = sheet.anchor;
  const sx = (e.spriteFrame ?? 0) * cellW;
  const groundY = Math.round(e.y - camY);
  const feetX = Math.round(e.x - camX);
  const feetY = Math.round(e.y + (e.drawYOff || 0) - camY);
  ctx.save();
  if (e.aiState === 'emerge') {
    ctx.beginPath();
    ctx.rect(feetX - cellW, groundY - cellH - 8, cellW * 2, cellH + 8);
    ctx.clip();
  }
  ctx.translate(feetX, feetY);
  if (e.facing > 0) ctx.scale(-1, 1);
  ctx.drawImage(sheet.image, sx, 0, cellW, cellH, -ax, -ay, cellW, cellH);
  ctx.restore();
}

function pixelLine(ctx, x0, y0, x1, y1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0;
    ctx.fillRect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), 1, 1);
  }
}

/** Spider: 1px web from attach/pivot to anchor (top of body), sprite hangs from anchor. */
export function drawSpider(ctx, e, camX, camY, sheet) {
  if (!sheet || !sheet.image) return;
  const [cellW, cellH] = sheet.cell;
  const [ax, ay] = sheet.anchor;
  const sx = (e.spriteFrame ?? 0) * cellW;
  const px = Math.round(e.x - camX);
  const py = Math.round(e.y - camY);
  if (e.aiState !== 'dead') {
    ctx.fillStyle = WEB_COLOR;
    if (e.aiState === 'swing') {
      pixelLine(ctx, e.pivotX - camX, e.pivotY - camY, px, py);
    } else {
      const top = Math.round(e.webAttachY - camY);
      if (py > top) ctx.fillRect(px, top, 1, py - top);
    }
  }
  ctx.save();
  ctx.translate(px, py);
  if (e.angle) ctx.rotate(-e.angle);
  ctx.drawImage(sheet.image, sx, 0, cellW, cellH, -ax, -ay, cellW, cellH);
  ctx.restore();
}

/* ======================================================================
 * Behavior 8 jumpers: small_dino (dino.png) + panther/leopard (leopard.png)
 * Jump height = vjp*(vjp+1)/2 px (DESIGN 5장) → vy0 = √(2·g·h).
 * ====================================================================== */

const DINO_BOX = { x: -13, y: -24, w: 24, h: 24 };
const LEOPARD_BOX = { x: -26, y: -20, w: 48, h: 19 };
export const DINO_PREP_SEC = 0.15;
export const DINO_BITE_SEC = 0.2;
export const DINO_COOLDOWN_SEC = 0.6;
export const DINO_JUMP_VX = 60; // px/s toward player
export const DINO_HOME_RANGE = 48; // ±px from spawn
export const LEOPARD_LEAP_VX = 110;
export const LEOPARD_RUN_SPEED = 90;
const JUMPER_SIGHT_DY = 64;
const JUMPER_DEATH_SEC = 0.45;

export function jumpHeightPx(vjp) {
  return (vjp * (vjp + 1)) / 2;
}

function initJumper(e) {
  const isLeo = e.kind !== 'small_dino';
  e.isLeopard = isLeo;
  e.vjp = e.vjp ?? e.props?.vjp ?? (isLeo ? 9 : 8);
  e.triggerDist = e.triggerDist ?? e.props?.triggerDist ?? (isLeo ? 96 : 80);
  e.jumpVy = Math.sqrt(2 * GRAVITY * jumpHeightPx(e.vjp));
  e.homeX = e.x;
  e.facing = -1;
  e.vx = 0;
  e.vy = 0;
  e.stateT = 0;
  e.cooldown = 0;
  e.hurtT = 0;
  e.deathT = 0;
  e.animFrame = 0;
  e.animT = 0;
  e.spriteFrame = 0; // dino stand / leopard crouch are both frame 0
  e.aiState = isLeo ? 'lurk' : 'stand';
}

function getJumperHitbox(e, sheet, fallback) {
  const box = (sheet && sheet.hitboxRelAnchor) || fallback;
  const x = e.facing < 0 ? e.x + box.x : e.x - box.x - box.w;
  return { x, y: e.y + box.y, w: box.w, h: box.h };
}

/** Gravity + horizontal step; lands on solid/one-way tops, stops at walls. Returns true on landing. */
function airStep(e, level, dt) {
  // horizontal (wall at mid-body)
  if (e.vx) {
    const nx = e.x + e.vx * dt;
    const probeX = nx + Math.sign(e.vx) * 10;
    if (isSolidTerrain(level.tileAt(Math.floor(probeX / TILE), Math.floor((e.y - 8) / TILE)))) e.vx = 0;
    else e.x = nx;
  }
  e.vy = Math.min(MAX_FALL, e.vy + GRAVITY * dt);
  const ny = e.y + e.vy * dt;
  if (e.vy > 0) {
    for (let ty = Math.floor(e.y / TILE); ty <= Math.floor(ny / TILE); ty++) {
      const top = ty * TILE;
      if (top >= e.y - 0.01 && top <= ny && solidTop(level, e.x, top + 1)) {
        e.y = top;
        e.vy = 0;
        return true;
      }
    }
  }
  e.y = ny;
  return false;
}

function playerInSight(e, player) {
  return player.alive &&
    Math.abs(player.x - e.x) <= e.triggerDist &&
    Math.abs(player.y - e.y) <= JUMPER_SIGHT_DY;
}

function updateDinoAi(e, level, player, dt, sheet) {
  const F = sheet?.frames || { stand: 0, crouch: 1, jump: 2, bite: 3, hurt: 4 };
  e.stateT += dt;
  if (e.cooldown > 0) e.cooldown -= dt;
  switch (e.aiState) {
    case 'stand':
      e.spriteFrame = F.stand;
      if (e.cooldown <= 0 && playerInSight(e, player)) {
        e.facing = player.x < e.x ? -1 : 1;
        e.aiState = 'prep';
        e.stateT = 0;
      }
      break;
    case 'prep':
      e.spriteFrame = F.crouch;
      if (e.stateT >= DINO_PREP_SEC) {
        e.facing = player.x < e.x ? -1 : 1;
        e.aiState = 'jump';
        e.stateT = 0;
        e.vy = -e.jumpVy;
        // stay within home range (avoid jumping into the spike trench)
        const tx = e.x + e.facing * DINO_JUMP_VX * (2 * e.jumpVy / GRAVITY);
        e.vx = Math.abs(tx - e.homeX) <= DINO_HOME_RANGE ? e.facing * DINO_JUMP_VX : 0;
      }
      break;
    case 'jump':
      e.spriteFrame = F.jump;
      if (airStep(e, level, dt)) {
        e.vx = 0;
        e.aiState = 'bite';
        e.stateT = 0;
      }
      break;
    case 'bite':
      e.spriteFrame = F.bite;
      if (e.stateT >= DINO_BITE_SEC) {
        e.aiState = 'stand';
        e.stateT = 0;
        e.cooldown = DINO_COOLDOWN_SEC;
      }
      break;
    default:
      break;
  }
}

function updateLeopardAi(e, level, player, dt, sheet) {
  const F = sheet?.frames || { crouch: 0, leap: 1, run: [2, 3], hurt: 4 };
  e.stateT += dt;
  switch (e.aiState) {
    case 'lurk':
      e.spriteFrame = F.crouch;
      if (playerInSight(e, player)) {
        e.facing = player.x < e.x ? -1 : 1;
        e.aiState = 'leap';
        e.stateT = 0;
        e.vy = -e.jumpVy;
        e.vx = e.facing * LEOPARD_LEAP_VX;
      }
      break;
    case 'leap':
      e.spriteFrame = F.leap;
      if (airStep(e, level, dt)) {
        e.aiState = 'run';
        e.stateT = 0;
        e.vx = e.facing * LEOPARD_RUN_SPEED;
        e.animFrame = 0;
        e.animT = 0;
      }
      break;
    case 'run': {
      e.vx = e.facing * LEOPARD_RUN_SPEED;
      const nx = e.x + e.vx * dt;
      const wall = isSolidTerrain(level.tileAt(Math.floor((nx + e.facing * 26) / TILE), Math.floor((e.y - 8) / TILE)));
      if (wall || !solidTop(level, nx, e.y + 1)) e.facing = -e.facing; // turn at walls/ledges/spikes
      else e.x = nx;
      stepAnim(e, dt, sheet?.runFrameMs ?? 90, F.run || [2, 3]);
      break;
    }
    case 'fall': // knocked off ground
      e.spriteFrame = F.leap;
      if (airStep(e, level, dt)) e.aiState = 'run';
      break;
    default:
      break;
  }
}

export function updateJumpers(level, player, game, attackHitbox, dt, sheets) {
  for (const e of level.entities.enemies) {
    const isDino = e.kind === 'small_dino';
    const isLeo = e.kind === 'panther' || e.kind === 'leopard';
    if (!isDino && !isLeo) continue;
    if (!e.alive || (e.expertOnly && !game.expert)) continue;
    const sheet = isDino ? sheets.dino : sheets.leopard;
    const hurtFrame = sheet?.frames?.hurt ?? 4;

    if (e.aiState === 'dead') {
      e.deathT += dt;
      e.spriteFrame = hurtFrame;
      if (e.deathT >= JUMPER_DEATH_SEC) e.alive = false;
      continue;
    }
    if (e.y > level.pixelH + 32) { e.alive = false; continue; }

    if (e.hurtT > 0) {
      // brief stagger: keep falling if airborne, otherwise freeze on hurt frame
      e.hurtT -= dt;
      if (e.vy !== 0 || !solidTop(level, e.x, e.y + 1)) airStep(e, level, dt);
      e.spriteFrame = hurtFrame;
    } else if (isDino) updateDinoAi(e, level, player, dt, sheet);
    else updateLeopardAi(e, level, player, dt, sheet);

    const hb = getJumperHitbox(e, sheet, isDino ? DINO_BOX : LEOPARD_BOX);
    const r = resolveCombat(e, hb, hb.y, player, game, attackHitbox, dt);
    if (r === 'stomp' || (r === 'club' && e.hp <= 0)) {
      e.aiState = 'dead';
      e.deathT = 0;
      game.score += e.score || 500;
    } else if (r === 'club') {
      e.hurtT = HURT_FLASH_SEC;
    }
  }
}

function drawFacingSprite(ctx, e, camX, camY, sheet) {
  if (!sheet || !sheet.image) return;
  if (e.aiState === 'dead' && Math.floor(e.deathT * 20) % 2 === 0) return;
  const [cellW, cellH] = sheet.cell;
  const [ax, ay] = sheet.anchor;
  ctx.save();
  ctx.translate(Math.round(e.x - camX), Math.round(e.y - camY));
  if (e.facing > 0) ctx.scale(-1, 1); // sheets face LEFT
  ctx.drawImage(sheet.image, (e.spriteFrame ?? 0) * cellW, 0, cellW, cellH, -ax, -ay, cellW, cellH);
  ctx.restore();
}

export const drawDino = drawFacingSprite;
export const drawLeopard = drawFacingSprite;
