/**
 * Hero sprite sheets: load meta + anim + draw with feet-center anchor.
 *
 * Sheets (assets/hero/, hand-drawn homage art only):
 *   idle         2f breath, frameMs [500,500], loop
 *   walk         8f @ suggestedFpsAt117pxPerSec
 *   crouchwalk   4f @ crouchSpeed / footSlidePerFrame
 *   attack       4f stand club, frameMs [30,60,160,100], hitFrame 2, no loop (hit ~90ms, total ~350ms)
 *   crouchattack 4f crouch club, frameMs [120,60,160,120], hitFrame 2, no loop
 *   air_hurt     4 single poses: jump_up 0, jump_top 1, fall 2, hurt 3
 *
 * State priority: attack > hurt > air (jump_up / jump_top / fall) > crouch > walk > idle.
 *
 * Attack frames are driven by player.attackT (owned by player.js) + sheet.frameMs,
 * so the drawn frame and the club hitbox can never drift apart.
 */

import {
  WALK_SPEED, CROUCH_SPEED_MUL, CLUB_DAMAGE, CLUB_CROUCH_MULT,
} from './config.js';

const ASSET_BASE = './assets/hero/';

/** Optional debug: faint hitbox outline (body + club). Default off. */
export let showHitbox = false;

export function setShowHitbox(v) {
  showHitbox = !!v;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

async function loadJson(name) {
  const r = await fetch(`${ASSET_BASE}${name}`);
  if (!r.ok) throw new Error(`${name} ${r.status}`);
  return r.json();
}

/**
 * Add derived timing (seconds) to a sheet with frameMs:
 *   frameSec[], totalSec, and for attack sheets hitStartSec / hitEndSec
 *   (the window of hitFrame inside the swing).
 */
function withTiming(meta) {
  if (!Array.isArray(meta.frameMs)) return meta;
  const frameSec = meta.frameMs.map((ms) => ms / 1000);
  const totalSec = frameSec.reduce((a, b) => a + b, 0);
  const out = { ...meta, frameSec, totalSec };
  if (Number.isInteger(meta.hitFrame)) {
    let start = 0;
    for (let i = 0; i < meta.hitFrame; i++) start += frameSec[i];
    out.hitStartSec = start;
    out.hitEndSec = start + frameSec[meta.hitFrame];
  }
  return out;
}

/**
 * Load idle / walk / crouchwalk / attack / crouchattack sheets + JSON meta.
 * @returns {Promise<{idle, walk, crouchwalk, attack, crouchattack, air_hurt}>}
 */
export async function loadHero() {
  const names = ['idle', 'walk', 'crouchwalk', 'attack', 'crouchattack', 'air_hurt'];
  const loaded = await Promise.all(
    names.map(async (n) => {
      const [meta, image] = await Promise.all([
        loadJson(`hero_${n}.json`),
        loadImage(`${ASSET_BASE}hero_${n}.png`),
      ]);
      const sheet = { ...withTiming(meta), image };
      // air_hurt uses a name→index map in "frames"; keep it as frameIndex
      if (typeof meta.frames === 'object' && meta.frames !== null) {
        sheet.frameIndex = meta.frames;
        sheet.frames = Math.max(1, Math.floor(image.width / meta.cell[0]));
      }
      return [n, sheet];
    }),
  );
  return Object.fromEntries(loaded);
}

/** Attach anim state to a player object. */
export function initHeroAnim(player) {
  player.anim = { state: 'idle', frame: 0, t: 0 };
}

/** Attack sheet for player's locked attack kind ('attack' | 'crouchattack'). */
export function attackSheet(hero, kind) {
  return kind === 'crouchattack' ? hero.crouchattack : hero.attack;
}

/** |vy| below this (px/s) counts as jump apex (jump_top pose). */
export const AIR_APEX_VY = 40;

/** Pose name on the air_hurt sheet for current vertical speed. */
export function airPose(vy) {
  if (vy < -AIR_APEX_VY) return 'jump_up';
  if (Math.abs(vy) < AIR_APEX_VY) return 'jump_top';
  return 'fall';
}

/** Frame index inside a non-looping frameMs sheet at time t (sec); clamps to last. */
export function frameAtTime(sheet, t) {
  let acc = 0;
  for (let i = 0; i < sheet.frameSec.length; i++) {
    acc += sheet.frameSec[i];
    if (t < acc) return i;
  }
  return sheet.frameSec.length - 1;
}

/**
 * Pick sheet + advance frames.
 * - Attacking: state = player.attackKind, frame derived from player.attackT
 *   (locked until player.js clears player.attacking; never switches to walk mid-swing).
 * - Idle: 2-frame breath using idle.frameMs.
 * - Walk FPS = meta.suggestedFpsAt117pxPerSec (25).
 * - Crouch-walk FPS = (WALK_SPEED * crouchMul) / footSlidePerFrame (~7.5).
 */
export function updateHeroAnim(player, hero, dt) {
  if (!player.alive || !player.anim) return;

  // single-pose states on the air_hurt sheet: 'hurt' | 'jump_up' | 'jump_top' | 'fall'
  let state;
  if (player.attacking) {
    // attack overrides air / hurt poses
    state = player.attackKind === 'crouchattack' ? 'crouchattack' : 'attack';
  } else if (player.hurt && player.invuln > 0) {
    // hit knockback: hold hurt pose through the invuln blink window
    state = 'hurt';
  } else if (!player.onGround && !player.crouching) {
    state = airPose(player.vy);
  } else {
    const moving = Math.abs(player.vx) > 8;
    if (player.crouching) {
      state = moving && player.onGround ? 'crouchwalk' : 'crouchidle';
    } else if (moving) {
      state = 'walk';
    } else {
      state = 'idle';
    }
  }

  if (state !== player.anim.state) {
    player.anim.state = state;
    player.anim.frame = 0;
    player.anim.t = 0;
  }

  if (AIR_HURT_STATES.has(state)) {
    const idx = hero.air_hurt.frameIndex || {};
    player.anim.frame = idx[state] ?? 0;
    return;
  }

  if (state === 'attack' || state === 'crouchattack') {
    player.anim.frame = frameAtTime(hero[state], player.attackT);
    player.anim.t = player.attackT;
    return;
  }

  if (state === 'idle') {
    // breath: per-frame durations from meta.frameMs
    const meta = hero.idle;
    const frameSec = meta.frameSec || [Infinity];
    player.anim.t += dt;
    let guard = 8;
    while (player.anim.t >= frameSec[player.anim.frame % frameSec.length] && guard--) {
      player.anim.t -= frameSec[player.anim.frame % frameSec.length];
      player.anim.frame = (player.anim.frame + 1) % meta.frames;
    }
    return;
  }

  let fps = 0;
  let frames = 1;
  if (state === 'walk') {
    const meta = hero.walk;
    fps =
      meta.suggestedFpsAt117pxPerSec ??
      WALK_SPEED / meta.footSlidePerFrame;
    frames = meta.frames;
  } else if (state === 'crouchwalk') {
    const meta = hero.crouchwalk;
    const crouchSpeed = WALK_SPEED * CROUCH_SPEED_MUL;
    fps = crouchSpeed / meta.footSlidePerFrame;
    frames = meta.frames;
  } else {
    // crouchidle — hold frame 0 of crouchwalk
    return;
  }

  player.anim.t += dt;
  const frameDur = 1 / fps;
  while (player.anim.t >= frameDur) {
    player.anim.t -= frameDur;
    player.anim.frame = (player.anim.frame + 1) % frames;
  }
}

/**
 * World-space club AABB while the current swing is on its hitFrame, else null.
 * clubHitboxRelAnchor is relative to the feet anchor (player.x, player.y):
 *   facing > 0: (x + hx,      y + hy, w, h)
 *   facing < 0: (x - hx - w,  y + hy, w, h)
 * Damage: CLUB_DAMAGE, ×CLUB_CROUCH_MULT for crouchattack.
 * swingId lets entities apply damage once per swing.
 */
export function getClubHitbox(player, hero) {
  if (!player.alive || !player.attacking || !hero) return null;
  const sheet = attackSheet(hero, player.attackKind);
  const box = sheet && sheet.clubHitboxRelAnchor;
  if (!box) return null;
  if (frameAtTime(sheet, player.attackT) !== sheet.hitFrame) return null;

  const x = player.facing < 0 ? player.x - box.x - box.w : player.x + box.x;
  const crouch = player.attackKind === 'crouchattack';
  return {
    x,
    y: player.y + box.y,
    w: box.w,
    h: box.h,
    damage: CLUB_DAMAGE * (crouch ? CLUB_CROUCH_MULT : 1),
    facing: player.facing,
    swingId: player.attackSwing,
  };
}

const AIR_HURT_STATES = new Set(['hurt', 'jump_up', 'jump_top', 'fall']);

function sheetForState(hero, state) {
  if (AIR_HURT_STATES.has(state)) return hero.air_hurt;
  if (state === 'walk') return hero.walk;
  if (state === 'crouchwalk' || state === 'crouchidle') return hero.crouchwalk;
  if (state === 'attack') return hero.attack;
  if (state === 'crouchattack') return hero.crouchattack;
  return hero.idle;
}

/**
 * Draw hero sprite anchored at feet (player.x, player.y).
 * Facing flip when facing < 0 (mirrors around the feet anchor).
 */
export function drawHero(ctx, player, camX, camY, hero) {
  if (!hero || !player.anim) return;

  const state = player.anim.state;
  const sheet = sheetForState(hero, state);
  const [cellW, cellH] = sheet.cell;
  const [ax, ay] = sheet.anchor;
  const frame = state === 'crouchidle' ? 0 : player.anim.frame % sheet.frames;
  const bobArr = sheet.bodyBobPx || [0];
  const bob = bobArr[frame % bobArr.length] || 0;
  const sx = frame * cellW;

  const feetX = Math.round(player.x - camX);
  const feetY = Math.round(player.y - camY);

  ctx.save();
  ctx.translate(feetX, feetY);
  if (player.facing < 0) ctx.scale(-1, 1);
  // bodyBobPx > 0 lifts the sprite (screen y decreases)
  ctx.drawImage(
    sheet.image,
    sx,
    0,
    cellW,
    cellH,
    -ax,
    -ay - bob,
    cellW,
    cellH,
  );
  ctx.restore();
}

/**
 * Faint collision hitbox for debug (stand 20×34 / crouch 20×24) and,
 * when on hitFrame, the club hitbox in red.
 */
export function drawHitboxDebug(ctx, player, camX, camY, hero) {
  if (!showHitbox) return;
  const px = Math.round(player.x - player.w / 2 - camX);
  const py = Math.round(player.y - player.h - camY);
  ctx.strokeStyle = 'rgba(255,255,0,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, player.w - 1, player.h - 1);
  const club = getClubHitbox(player, hero);
  if (club) {
    ctx.strokeStyle = 'rgba(255,40,40,0.6)';
    ctx.strokeRect(
      Math.round(club.x - camX) + 0.5,
      Math.round(club.y - camY) + 0.5,
      club.w - 1,
      club.h - 1,
    );
  }
}
