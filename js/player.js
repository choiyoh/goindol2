/** Player: walk, variable jump, crouch-walk, club attack (timing from hero sheet meta). */

import {
  WALK_SPEED, WALK_ACCEL, WALK_FRICTION, CROUCH_SPEED_MUL,
  GRAVITY, JUMP_VY, JUMP_HOLD_EXTRA_VY, JUMP_HOLD_TIME, JUMP_HOLD_GRAV_SCALE, MAX_FALL,
  COYOTE_TIME, JUMP_BUFFER_TIME, TOUCH_JUMP_GRACE, TOUCH_JUMP_CATCHUP,
  STAND_W, STAND_H, CROUCH_W, CROUCH_H,
  ATTACK_DURATION, CROUCH_ATTACK_DURATION,
  INVULN_TIME, HEARTS_PER_LIFE, TILE, TERRAIN,
} from './config.js';
import { collideTiles, isSolidTerrain } from './collision.js';

export function createPlayer(start) {
  // Tiled rect: x,y = top-left; feet center = (x + w/2, y + h)
  const feetX = start ? start.x + (start.w || 16) / 2 : 56;
  const feetY = start ? start.y + (start.h || 32) : 352;
  return {
    x: feetX,
    y: feetY,
    vx: 0,
    vy: 0,
    w: STAND_W,
    h: STAND_H,
    facing: 1,
    onGround: false,
    crouching: false,
    jumpHeld: false,
    jumpTouch: false,
    jumpBank: 0,
    jumpTime: 0,
    canJump: true,
    /** Coyote window remaining (s). */
    coyoteT: 0,
    /** Buffered jump press remaining (s). */
    jumpBufferT: 0,
    attackT: 0,
    attacking: false,
    /** 'attack' | 'crouchattack' — locked at swing start. */
    attackKind: 'attack',
    /** Swing length (s) for the current attack, from sheet frameMs total. */
    attackDuration: ATTACK_DURATION,
    /** Increments every swing; entities use it to take damage once per swing. */
    attackSwing: 0,
    invuln: 0,
    /** True from a damaging hit until invuln ends (drives hurt pose). */
    hurt: false,
    weapon: 'club',
    hasLighter: false,
    alive: true,
    respawnX: feetX,
    respawnY: feetY,
    /** Visual sprite may be taller (e.g. 41px); collision uses w/h hitbox only. */
    spriteH: 41,
    /** Filled by initHeroAnim: { state, frame, t }. */
    anim: { state: 'idle', frame: 0, t: 0 },
  };
}

/**
 * True if standing hitbox (~20×34) centered on feet would intersect solid
 * ceiling / breakable blocks. Crouch key release must pass this to stand up.
 */
export function hasStandHeadroom(level, player, solidBlocks) {
  const halfW = STAND_W / 2;
  const left = player.x - halfW + 1;
  const right = player.x + halfW - 1;
  const top = player.y - STAND_H;
  // Only the band above current crouch top matters (already clear below CROUCH_H)
  const crouchTop = player.y - CROUCH_H;

  for (let ty = Math.floor(top / TILE); ty <= Math.floor((crouchTop - 0.01) / TILE); ty++) {
    for (let tx = Math.floor(left / TILE); tx <= Math.floor(right / TILE); tx++) {
      const id = level.tileAt(tx, ty);
      if (isSolidTerrain(id) || id === TERRAIN.SPIKES) return false;
    }
  }
  for (const b of solidBlocks) {
    if (
      right > b.x &&
      left < b.x + b.w &&
      crouchTop > b.y &&
      top < b.y + b.h
    ) {
      return false;
    }
  }
  return true;
}

/**
 * @param hero optional loaded hero sheets; when given, attack duration comes from
 *   hero.attack / hero.crouchattack frameMs totals (else config fallback).
 * Club hitbox is NOT computed here — main.js calls getClubHitbox(player, hero).
 */
export function updatePlayer(player, input, level, dt, solidBlocks, hero) {
  if (!player.alive) return { hitSpike: false };

  // --- crouch / stand with headroom gate ---
  // Collision uses hitbox only (STAND 20×34 / CROUCH 20×24). Sprite may be 41px.
  const wantCrouch = input.down.down && player.onGround;
  if (wantCrouch) {
    player.crouching = true;
  } else if (player.crouching) {
    // Released crouch: only stand if standing hitbox clears ceiling
    if (hasStandHeadroom(level, player, solidBlocks)) {
      player.crouching = false;
    }
    // else stay crouched until headroom clears (even if key released)
  }

  player.w = player.crouching ? CROUCH_W : STAND_W;
  player.h = player.crouching ? CROUCH_H : STAND_H;

  // horizontal — crouch-walk required for 2-tile tunnels
  const speedMul = player.crouching ? CROUCH_SPEED_MUL : 1;
  const maxSp = WALK_SPEED * speedMul;
  let move = 0;
  if (input.down.left) move -= 1;
  if (input.down.right) move += 1;
  if (move !== 0) {
    // facing locked during a swing so the club doesn't flip mid-attack
    if (!player.attacking) player.facing = move;
    player.vx += move * WALK_ACCEL * dt;
    if (player.vx > maxSp) player.vx = maxSp;
    if (player.vx < -maxSp) player.vx = -maxSp;
  } else {
    const fr = WALK_FRICTION * dt;
    if (player.vx > fr) player.vx -= fr;
    else if (player.vx < -fr) player.vx += fr;
    else player.vx = 0;
  }

  // jump buffer latches before collide; actual jump fires AFTER collideTiles
  // so a press on the landing frame still counts (GM r2).
  if (input.pressed.jump) player.jumpBufferT = JUMP_BUFFER_TIME;
  else if (player.jumpBufferT > 0) player.jumpBufferT -= dt;

  // Variable hold boost from an earlier jump (not the landing-frame fire).
  if (player.jumpHeld) {
    if (input.down.jump && player.vy < 0 && player.jumpTime < JUMP_HOLD_TIME) {
      const step = Math.min(dt, JUMP_HOLD_TIME - player.jumpTime);
      player.jumpTime += step;
      const boost = JUMP_HOLD_EXTRA_VY * (step / JUMP_HOLD_TIME);
      if (player.jumpTouch && player.jumpTime < TOUCH_JUMP_GRACE - 1e-6) {
        // Touch: bank the boost until we know this isn't a (late-released) tap.
        player.jumpBank += boost;
      } else {
        player.vy -= boost + player.jumpBank * TOUCH_JUMP_CATCHUP;
        player.jumpBank = 0;
      }
    }
    if (!input.down.jump || player.jumpTime >= JUMP_HOLD_TIME || player.vy >= 0) {
      player.jumpHeld = false;
      player.jumpBank = 0; // released inside the grace → short jump
    }
  }

  let g = GRAVITY;
  if (player.jumpHeld && player.vy < 0) g *= JUMP_HOLD_GRAV_SCALE;
  const vyBefore = player.vy;
  player.vy += g * dt;
  if (player.vy > MAX_FALL) player.vy = MAX_FALL;
  // Trapezoid step so jump apex matches v²/(2g) independent of frame rate.
  const stepVy = (vyBefore + player.vy) * 0.5;

  // club attack — stand or crouch sheet chosen (and locked) at swing start.
  // attackT drives both the anim frame and the hitFrame window (hero.js).
  if (input.pressed.attack && !player.attacking) {
    const kind = player.crouching ? 'crouchattack' : 'attack';
    player.attacking = true;
    player.attackT = 0;
    player.attackKind = kind;
    player.attackSwing += 1;
    const sheet = hero && hero[kind];
    player.attackDuration =
      (sheet && sheet.totalSec) ||
      (kind === 'crouchattack' ? CROUCH_ATTACK_DURATION : ATTACK_DURATION);
  }
  if (player.attacking) {
    player.attackT += dt;
    if (player.attackT >= player.attackDuration) {
      player.attacking = false;
      player.attackT = 0;
    }
  }

  if (player.invuln > 0) player.invuln -= dt;
  if (player.invuln <= 0) player.hurt = false;

  // Grounded state entering this step (tiles last step, or set by a moving
  // platform's rider pass after last step). Used for the coyote leave frame.
  const wasOnGround = player.onGround;

  const resolved = collideTiles(
    level,
    {
      x: player.x,
      y: player.y,
      w: player.w,
      h: player.h,
      vx: player.vx * dt,
      vy: stepVy * dt,
      onGround: player.onGround,
    },
    solidBlocks,
  );

  player.x = resolved.x;
  player.y = resolved.y;
  if (resolved.vx === 0) player.vx = 0;
  if (resolved.vy === 0) player.vy = 0;
  player.onGround = resolved.onGround;

  // Coyote + buffered jump AFTER collide so landing-frame presses fire.
  // The leave-ground frame (grounded last step, airborne now) keeps the full
  // COYOTE_TIME — no dt subtract that frame — so the window is a true 80ms of
  // airborne steps after leaving (GM: was ~50ms because of the same-frame dec).
  if (player.onGround || wasOnGround) {
    player.coyoteT = COYOTE_TIME;
  } else if (player.coyoteT > 0) {
    player.coyoteT -= dt;
  }
  if (player.jumpBufferT > 0 && player.coyoteT > 0 && !player.crouching && player.vy >= 0) {
    player.vy = -JUMP_VY;
    player.onGround = false;
    player.jumpHeld = true;
    player.jumpTime = 0;
    player.jumpBank = 0;
    player.jumpTouch = !!(input.source && input.source.jump === 'touch');
    player.coyoteT = 0;
    player.jumpBufferT = 0;
  }

  // If we walked out from under a low ceiling while key released, try stand
  if (player.crouching && !input.down.down && player.onGround) {
    if (hasStandHeadroom(level, player, solidBlocks)) {
      player.crouching = false;
      player.w = STAND_W;
      player.h = STAND_H;
    }
  }

  return { hitSpike: resolved.hitSpike };
}

export function hurtPlayer(player, game) {
  if (player.invuln > 0 || !player.alive) return;
  game.hearts -= 1;
  player.invuln = INVULN_TIME;
  player.hurt = true;
  player.vx = -player.facing * 80;
  player.vy = -120;
  player.onGround = false;
  player.coyoteT = 0;
  player.jumpHeld = false;
  if (game.hearts <= 0) killPlayer(player, game);
}

export function killPlayer(player, game) {
  player.alive = false;
  game.lives -= 1;
  game.hearts = 0;
  game.deathTimer = 0.8;
}

export function respawnPlayer(player, game) {
  player.x = player.respawnX;
  player.y = player.respawnY;
  player.vx = 0;
  player.vy = 0;
  player.alive = true;
  player.crouching = false;
  player.w = STAND_W;
  player.h = STAND_H;
  player.attacking = false;
  player.attackT = 0;
  player.hurt = false; // respawn invuln blinks but is not a hurt pose
  player.invuln = INVULN_TIME;
  player.onGround = false;
  player.jumpHeld = false;
  player.coyoteT = 0;
  player.jumpBufferT = 0;
  game.hearts = HEARTS_PER_LIFE;
}
