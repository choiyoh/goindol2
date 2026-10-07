/**
 * Entity stubs vs deferred (MVP):
 * STUBBED (drawn + basic interact):
 *   player_start, checkpoint, lighter, goal_light, platform,
 *   spawn_area (visual), item (pickup score stub), secret breakable (club damage),
 *   enemy (static hurt on touch; turtles → enemies.js), deco (sign marker)
 * DEFERRED (parsed, drawn faintly, no gameplay AI):
 *   other enemy behaviors / AI, spawn_area spawning, gate teleport,
 *   secret small/big food drops, section labels (debug only)
 */

import { aabbOverlap } from './collision.js';
import { TILE } from './config.js';
import { hurtPlayer } from './player.js';
import { ENEMY_KINDS_OWNED } from './enemies.js';
import { spawnDirt, spawnSpark } from './fx.js';

export function solidSecrets(secrets) {
  return secrets
    .filter((s) => s.solid && !s.broken)
    .map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h }));
}

export function updateEntities(level, player, game, attackHitbox, dt) {
  const ents = level.entities;
  const msgs = [];

  // checkpoints
  for (const cp of ents.checkpoints) {
    if (
      aabbOverlap(
        player.x - player.w / 2, player.y - player.h, player.w, player.h,
        cp.x, cp.y, cp.w, cp.h,
      )
    ) {
      if (!cp.active) {
        cp.active = true;
        player.respawnX = cp.x + cp.w / 2;
        player.respawnY = cp.y + cp.h;
        msgs.push(`Checkpoint ${cp.index}`);
      }
    }
  }

  // lighter
  if (ents.lighter && !ents.lighter.taken) {
    const L = ents.lighter;
    if (
      aabbOverlap(
        player.x - player.w / 2, player.y - player.h, player.w, player.h,
        L.x, L.y, L.w, L.h,
      )
    ) {
      L.taken = true;
      player.hasLighter = true;
      msgs.push('Got lighter!');
    }
  }

  // goal
  if (ents.goalLight && !ents.goalLight.cleared) {
    const G = ents.goalLight;
    if (
      aabbOverlap(
        player.x - player.w / 2, player.y - player.h, player.w, player.h,
        G.x, G.y, G.w, G.h,
      )
    ) {
      if (player.hasLighter) {
        G.cleared = true;
        game.cleared = true;
        msgs.push('STAGE CLEAR!');
      } else if (!game._goalHint) {
        game._goalHint = true;
        msgs.push('Need lighter!');
      }
    } else {
      game._goalHint = false;
    }
  }

  // items (score stub)
  for (const it of ents.items) {
    if (it.taken) continue;
    if (
      aabbOverlap(
        player.x - player.w / 2, player.y - player.h, player.w, player.h,
        it.x, it.y, it.w, it.h,
      )
    ) {
      it.taken = true;
      game.score += it.score || 0;
      game.itemsTaken = (game.itemsTaken || 0) + 1;
      if (it.kind === 'heart' && game.hearts < 3) game.hearts += 1;
      if (it.kind === '1up') game.lives += 1;
      if (it.kind === 'bone') {
        /* bone→energy stub: ignore partial bones for MVP */
      }
    }
  }

  // enemies — touch = lose heart (turtles handled in enemies.js)
  for (const e of ents.enemies) {
    if (ENEMY_KINDS_OWNED.has(e.kind)) continue; // enemies.js owns AI/contact/club
    if (!e.alive || (e.expertOnly && !game.expert)) continue;
    // Feet-center → top-left AABB for stub rect enemies
    const ex = e.x - e.w / 2;
    const ey = e.y - e.h;
    if (player.invuln > 0) {
      /* still allow club while invuln */
    } else if (
      aabbOverlap(
        player.x - player.w / 2, player.y - player.h, player.w, player.h,
        ex, ey, e.w, e.h,
      )
    ) {
      // stomp stub: if falling onto top, kill enemy
      if (player.vy > 0 && player.y - player.vy * dt < ey + 4) {
        e.alive = false;
        game.score += e.score || 100;
        player.vy = -180;
        player.onGround = false;
      } else {
        hurtPlayer(player, game);
      }
    }
    // club hit — once per swing (attackHitbox.swingId)
    if (attackHitbox && e.alive && e._lastSwing !== attackHitbox.swingId) {
      if (
        aabbOverlap(
          attackHitbox.x, attackHitbox.y, attackHitbox.w, attackHitbox.h,
          ex, ey, e.w, e.h,
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
          e.alive = false;
          game.score += e.score || 100;
        }
      }
    }
  }

  // breakable secrets
  if (attackHitbox) {
    for (const s of ents.secrets) {
      if (s.broken || s.kind !== 'breakable') continue;
      if (s._lastSwing === attackHitbox.swingId) continue; // once per swing
      if (
        aabbOverlap(
          attackHitbox.x, attackHitbox.y, attackHitbox.w, attackHitbox.h,
          s.x, s.y, s.w, s.h,
        )
      ) {
        s._lastSwing = attackHitbox.swingId;
        s.damageTaken += attackHitbox.damage;
        if (s.damageTaken >= (s.hp || 1)) {
          s.broken = true;
          spawnDirt(s.x + s.w / 2, s.y + s.h); // dirt at block center bottom
          msgs.push(s.required ? 'Path opened!' : 'Broke block');
        }
      }
    }
  }

  // gates — DEFERRED teleport; detect ↓ for future
  // (parsed & drawn only)

  return msgs;
}
