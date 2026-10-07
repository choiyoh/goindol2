/** Moving platforms — distance/direction from entities; timing TBD for playtest. */

import { ORIG_HZ } from './config.js';
import { aabbOverlap } from './collision.js';

export function updatePlatforms(platforms, dt, player) {
  const carry = { dx: 0, dy: 0 };
  let onPlat = null;

  for (const p of platforms) {
    if (p.fallen) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) {
        p.fallen = false;
        p.x = p.originX;
        p.y = p.originY;
        p.fallTimer = 0;
        p.riding = false;
      }
      continue;
    }

    const prevX = p.x;
    const prevY = p.y;

    if (p.dropdown) {
      // fall after delay while ridden — timing TBD (delay in original ticks)
      if (p.riding) {
        p.fallTimer += dt;
        const delaySec = (p.delay || 0) / ORIG_HZ;
        if (p.fallTimer >= delaySec) {
          // drop: move down quickly then despawn/respawn
          p.y += 120 * dt;
          if (p.y > p.originY + 200) {
            p.fallen = true;
            p.respawnTimer = (p.respawnTicks || 70) / ORIG_HZ;
            p.riding = false;
          }
        }
      } else {
        p.fallTimer = 0;
      }
    } else if (p.selfMoving && p.distance > 0) {
      // speed: original px/tick → px/s
      const speed = (p.speedTick || 2) * ORIG_HZ;
      p.travel += p.travelDir * speed * dt;
      if (p.pingpong) {
        if (p.travel >= p.distance) {
          p.travel = p.distance;
          p.travelDir = -1;
        } else if (p.travel <= 0) {
          p.travel = 0;
          p.travelDir = 1;
        }
      } else {
        if (p.travel > p.distance) p.travel = 0;
        if (p.travel < 0) p.travel = p.distance;
      }
      p.x = p.originX + p.dx * p.travel;
      p.y = p.originY + p.dy * p.travel;
    }

    const movedX = p.x - prevX;
    const movedY = p.y - prevY;

    // ride check: feet near top, falling or grounded
    if (player && !p.fallen) {
      const feetX = player.x;
      const feetY = player.y;
      const halfW = player.w / 2;
      const onTop =
        feetY >= p.y - 2 &&
        feetY <= p.y + 6 &&
        feetX + halfW > p.x &&
        feetX - halfW < p.x + p.w &&
        player.vy >= -10;

      if (onTop && (player.onGround || player.vy >= 0)) {
        player.y = p.y;
        player.vy = 0;
        player.onGround = true;
        player.x += movedX;
        player.y += movedY;
        // re-snap after carry
        player.y = p.y;
        p.riding = true;
        onPlat = p;
        carry.dx += movedX;
        carry.dy += movedY;
      } else if (p.riding && onPlat !== p) {
        // lost contact
        const still =
          feetX + halfW > p.x &&
          feetX - halfW < p.x + p.w &&
          Math.abs(feetY - p.y) < 8;
        if (!still) p.riding = false;
      }
    }
  }

  return { carry, onPlat };
}

export function platformSolids(platforms) {
  return platforms
    .filter((p) => !p.fallen)
    .map((p) => ({ x: p.x, y: p.y, w: p.w, h: Math.max(4, p.h * 0.35), oneWay: true }));
}
