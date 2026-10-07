/** Tile AABB collision: solid, one-way, spikes. */

import { TILE, TERRAIN } from './config.js';

export function isSolidTerrain(id) {
  return id === TERRAIN.GRASS || id === TERRAIN.ROCK || id === TERRAIN.HIDDEN;
}

export function isOneWay(id) {
  return id === TERRAIN.ONEWAY;
}

export function isSpike(id) {
  return id === TERRAIN.SPIKES;
}

/**
 * Axis-separated resolve for a feet-anchored body.
 * body: { x, y (feet center), w, h, vx, vy, onGround, crouching }
 * Returns { x, y, vx, vy, onGround, hitSpike, hitCeiling }
 */
export function collideTiles(level, body, solidBlocks = []) {
  let { x, y, w, h, vx, vy } = body;
  let onGround = false;
  let hitSpike = false;
  let hitCeiling = false;

  const halfW = w / 2;

  // --- horizontal ---
  x += vx;
  {
    const left = x - halfW;
    const right = x + halfW;
    const top = y - h;
    const bottom = y - 0.001;

    if (vx > 0) {
      const tx = Math.floor(right / TILE);
      for (let ty = Math.floor(top / TILE); ty <= Math.floor(bottom / TILE); ty++) {
        const id = level.tileAt(tx, ty);
        if (isSpike(id)) hitSpike = true;
        if (isSolidTerrain(id)) {
          x = tx * TILE - halfW;
          vx = 0;
          break;
        }
      }
      for (const b of solidBlocks) {
        if (overlap(x - halfW, y - h, w, h, b.x, b.y, b.w, b.h)) {
          x = b.x - halfW;
          vx = 0;
        }
      }
    } else if (vx < 0) {
      const tx = Math.floor(left / TILE);
      for (let ty = Math.floor(top / TILE); ty <= Math.floor(bottom / TILE); ty++) {
        const id = level.tileAt(tx, ty);
        if (isSpike(id)) hitSpike = true;
        if (isSolidTerrain(id)) {
          x = (tx + 1) * TILE + halfW;
          vx = 0;
          break;
        }
      }
      for (const b of solidBlocks) {
        if (overlap(x - halfW, y - h, w, h, b.x, b.y, b.w, b.h)) {
          x = b.x + b.w + halfW;
          vx = 0;
        }
      }
    }
  }

  // --- vertical ---
  const prevY = y;
  y += vy;
  {
    const left = x - halfW + 1;
    const right = x + halfW - 1;
    const top = y - h;
    const bottom = y;

    if (vy > 0) {
      // falling — land on solid tops & one-ways & solidBlocks & platforms handled outside
      const ty = Math.floor(bottom / TILE);
      const prevBottom = prevY;
      for (let tx = Math.floor(left / TILE); tx <= Math.floor(right / TILE); tx++) {
        const id = level.tileAt(tx, ty);
        if (isSpike(id)) {
          // spikes kill when feet enter their tile from above
          const spikeTop = ty * TILE;
          if (prevBottom <= spikeTop + 2 && bottom >= spikeTop) hitSpike = true;
        }
        if (isSolidTerrain(id) || isOneWay(id)) {
          const topFace = ty * TILE;
          // one-way: only if we crossed the top face from above
          if (isOneWay(id) && prevBottom > topFace + 0.5) continue;
          if (prevBottom <= topFace + 0.5 && bottom >= topFace) {
            y = topFace;
            vy = 0;
            onGround = true;
          }
        }
      }
      for (const b of solidBlocks) {
        const topFace = b.y;
        if (
          prevBottom <= topFace + 0.5 &&
          bottom >= topFace &&
          right > b.x &&
          left < b.x + b.w
        ) {
          y = topFace;
          vy = 0;
          onGround = true;
        }
      }
    } else if (vy < 0) {
      // rising — hit ceilings (solid only, not one-way)
      const ty = Math.floor(top / TILE);
      for (let tx = Math.floor(left / TILE); tx <= Math.floor(right / TILE); tx++) {
        const id = level.tileAt(tx, ty);
        if (isSpike(id)) hitSpike = true;
        if (isSolidTerrain(id)) {
          y = (ty + 1) * TILE + h;
          vy = 0;
          hitCeiling = true;
          break;
        }
      }
      for (const b of solidBlocks) {
        if (overlap(x - halfW, y - h, w, h, b.x, b.y, b.w, b.h)) {
          y = b.y + b.h + h;
          vy = 0;
          hitCeiling = true;
        }
      }
    }
  }

  // resting on ground check when vy≈0
  if (!onGround && Math.abs(vy) < 1) {
    const left = x - halfW + 1;
    const right = x + halfW - 1;
    const probe = y + 1;
    const ty = Math.floor(probe / TILE);
    for (let tx = Math.floor(left / TILE); tx <= Math.floor(right / TILE); tx++) {
      const id = level.tileAt(tx, ty);
      const topFace = ty * TILE;
      if ((isSolidTerrain(id) || isOneWay(id)) && Math.abs(y - topFace) < 1.5) {
        y = topFace;
        onGround = true;
        break;
      }
    }
    for (const b of solidBlocks) {
      if (
        Math.abs(y - b.y) < 1.5 &&
        right > b.x &&
        left < b.x + b.w
      ) {
        y = b.y;
        onGround = true;
      }
    }
  }

  // spike overlap anywhere in hitbox
  if (!hitSpike) {
    const left = x - halfW;
    const right = x + halfW;
    const top = y - h;
    const bottom = y;
    for (let ty = Math.floor(top / TILE); ty <= Math.floor(bottom / TILE); ty++) {
      for (let tx = Math.floor(left / TILE); tx <= Math.floor(right / TILE); tx++) {
        if (isSpike(level.tileAt(tx, ty))) {
          hitSpike = true;
          break;
        }
      }
    }
  }

  return { x, y, vx, vy, onGround, hitSpike, hitCeiling };
}

function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return overlap(ax, ay, aw, ah, bx, by, bw, bh);
}
