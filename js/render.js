/** Canvas renderer — hand-drawn tileset terrain + hero/enemy/item/prop sprites. */

import {
  SCREEN_W, PLAY_H, TILE, TERRAIN, COLORS,
} from './config.js';
import { drawHero, drawHitboxDebug } from './hero.js';
import { drawTile } from './tiles.js';
import { drawBackground } from './background.js';
import { drawTurtle, drawBear, drawSpider, drawDino, drawLeopard } from './enemies.js';
import {
  drawItem, drawPropRect, drawPlatformProp, drawBreakableProp,
  drawCheckpointProp, drawGoalProp,
} from './props.js';
import { drawHud } from './hud.js';
import { drawFx } from './fx.js';

/**
 * @param {object} [itemSheets] { items, props } from loadItemsSheet / loadPropsSheet
 * @param {number} [timeMs] performance.now() (or game time) for bob / goal flicker
 */
export function drawFrame(ctx, level, player, cam, game, flashMsg, hero, sheets, tileset, itemSheets, timeMs, bg, hud) {
  const S = sheets && sheets.turtle !== undefined ? sheets : { turtle: sheets };
  const items = itemSheets && itemSheets.items;
  const props = itemSheets && itemSheets.props;
  const t = timeMs != null ? timeMs : 0;
  // playfield
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, SCREEN_W, PLAY_H);
  ctx.clip();

  const camX = Math.floor(cam.x);
  const camY = Math.floor(cam.y);

  // Parallax sky→far→mid; solid sky only as fallback if bg failed to load
  if (!drawBackground(ctx, bg, camX, camY)) {
    ctx.fillStyle = COLORS.sky;
    ctx.fillRect(0, 0, SCREEN_W, PLAY_H);
  }
  const tx0 = Math.max(0, Math.floor(camX / TILE) - 1);
  const ty0 = Math.max(0, Math.floor(camY / TILE) - 1);
  const tx1 = Math.min(level.width - 1, Math.ceil((camX + SCREEN_W) / TILE) + 1);
  const ty1 = Math.min(level.height - 1, Math.ceil((camY + PLAY_H) / TILE) + 1);

  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const id = level.tiles[ty * level.width + tx];
      if (!id) continue;
      const px = tx * TILE - camX;
      const py = ty * TILE - camY;
      if (tileset) drawTile(ctx, tileset, level, id, tx, ty, px, py);
      else drawTerrain(ctx, id, px, py); // fallback if tileset failed to load
    }
  }

  const E = level.entities;

  // spawn areas (faint)
  for (const s of E.spawnAreas) {
    ctx.fillStyle = 'rgba(128,96,160,0.25)';
    ctx.fillRect(s.x - camX, s.y - camY, s.w, s.h);
    ctx.strokeStyle = COLORS.spawn;
    ctx.strokeRect(s.x - camX + 0.5, s.y - camY + 0.5, s.w - 1, s.h - 1);
  }

  // platforms
  for (const p of E.platforms) {
    if (p.fallen) continue;
    const dx = p.x - camX;
    const dy = p.y - camY;
    if (!drawPlatformProp(ctx, props, dx, dy, p.w, p.h)) {
      ctx.fillStyle = COLORS.platform;
      ctx.fillRect(dx, dy, p.w, p.h);
      ctx.fillStyle = '#d0b090';
      ctx.fillRect(dx, dy, p.w, 3);
    }
  }

  // secrets (breakable + faint markers for small/big)
  for (const s of E.secrets) {
    if (s.kind === 'breakable' && !s.broken) {
      const dx = s.x - camX;
      const dy = s.y - camY;
      if (!drawBreakableProp(ctx, props, s, dx, dy)) {
        ctx.fillStyle = COLORS.secret;
        ctx.fillRect(dx, dy, s.w, s.h);
        ctx.strokeStyle = '#604020';
        ctx.strokeRect(dx + 0.5, dy + 0.5, s.w - 1, s.h - 1);
      }
    } else if (s.kind !== 'breakable' && !s.broken) {
      // no dedicated frames — keep faint marker (drops deferred)
      ctx.fillStyle = 'rgba(255,220,100,0.35)';
      ctx.fillRect(s.x - camX + 4, s.y - camY + 4, 8, 8);
    }
  }

  // items
  for (const it of E.items) {
    if (it.taken) continue;
    const dx = it.x - camX;
    const dy = it.y - camY;
    if (!drawItem(ctx, items, it.kind, it.letter, dx, dy, t)) {
      ctx.fillStyle = itemColor(it.kind);
      ctx.fillRect(dx + 2, dy + 2, it.w - 4, it.h - 4);
    }
  }

  // lighter (items sheet frame)
  if (E.lighter && !E.lighter.taken) {
    const L = E.lighter;
    const dx = L.x - camX;
    const dy = L.y - camY;
    if (!drawItem(ctx, items, 'lighter', null, dx, dy, t)) {
      ctx.fillStyle = COLORS.lighter;
      ctx.fillRect(dx + 2, dy + 2, L.w - 4, L.h - 4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(dx + 6, dy + 4, 4, 4);
    }
  }

  // checkpoints
  for (const cp of E.checkpoints) {
    const dx = cp.x - camX;
    const dy = cp.y - camY;
    if (!drawCheckpointProp(ctx, props, cp, dx, dy)) {
      ctx.fillStyle = cp.active ? COLORS.checkpointOn : COLORS.checkpoint;
      ctx.fillRect(dx, dy, cp.w, cp.h);
    }
  }

  // goal
  if (E.goalLight) {
    const G = E.goalLight;
    const lit = !!(player.hasLighter || G.cleared);
    const dx = G.x - camX;
    const dy = G.y - camY;
    if (!drawGoalProp(ctx, props, G, dx, dy, lit, t)) {
      ctx.fillStyle = lit ? COLORS.goalLit : COLORS.goal;
      ctx.fillRect(dx, dy, G.w, G.h);
      ctx.fillStyle = '#202020';
      ctx.fillRect(dx + 4, dy + 8, G.w - 8, 10);
    }
  }

  // enemies (turtle sprites; other kinds keep rect stub at feet)
  for (const e of E.enemies) {
    if (!e.alive) continue;
    if (e.expertOnly && !game.expert) continue;
    if (e.kind === 'turtle') {
      if (e.aiState === 'idle') continue; // burrowed — not drawn
      drawTurtle(ctx, e, camX, camY, S.turtle);
    } else if ((e.kind === 'bear' || e.kind === 'bear_ground') && S.bear) {
      drawBear(ctx, e, camX, camY, S.bear);
    } else if (e.kind === 'spider' && S.spider) {
      drawSpider(ctx, e, camX, camY, S.spider);
    } else if (e.kind === 'small_dino' && S.dino) {
      drawDino(ctx, e, camX, camY, S.dino);
    } else if ((e.kind === 'panther' || e.kind === 'leopard') && S.leopard) {
      drawLeopard(ctx, e, camX, camY, S.leopard);
    } else {
      const ex = e.x - e.w / 2;
      const ey = e.y - e.h;
      ctx.fillStyle = COLORS.enemy;
      ctx.fillRect(ex - camX, ey - camY, e.w, e.h);
      ctx.fillStyle = '#401010';
      ctx.fillRect(ex - camX + 2, ey - camY + 2, 4, 4);
    }
  }

  // gates
  for (const g of E.gates) {
    const dx = g.x - camX;
    const dy = g.y - camY;
    if (!drawPropRect(ctx, props, 'gate', dx, dy, g.w, g.h)) {
      ctx.strokeStyle = 'rgba(100,200,255,0.5)';
      ctx.strokeRect(dx + 0.5, dy + 0.5, g.w - 1, g.h - 1);
    }
  }

  // deco signs
  for (const d of E.decos) {
    const dx = d.x - camX;
    const dy = d.y - camY;
    if (!drawPropRect(ctx, props, 'sign', dx, dy, d.w || 16, d.h || 16)) {
      ctx.fillStyle = COLORS.deco;
      ctx.fillRect(dx + 2, dy, 12, 16);
    }
  }

  // player (hero sprites; optional faint hitbox via setShowHitbox)
  if (player.alive) {
    const blink = player.invuln > 0 && Math.floor(player.invuln * 20) % 2 === 0;
    if (!blink) {
      if (hero) {
        drawHero(ctx, player, camX, camY, hero);
      } else {
        // fallback rect if assets failed
        const px = Math.round(player.x - player.w / 2 - camX);
        const py = Math.round(player.y - player.h - camY);
        ctx.fillStyle = player.crouching ? COLORS.playerCrouch : COLORS.player;
        ctx.fillRect(px, py, player.w, player.h);
      }
      // (club is part of the hero art; no geometric club overlay)
      drawHitboxDebug(ctx, player, camX, camY, hero);
    }
  }

  // FX particles (world space, after entities)
  drawFx(ctx, camX, camY);

  ctx.restore();

  // HUD (sprite panel or monospace fallback)
  drawHud(ctx, player, game, flashMsg, hud, items);
}

function drawTerrain(ctx, id, px, py) {
  switch (id) {
    case TERRAIN.GRASS:
      ctx.fillStyle = COLORS.rock;
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = COLORS.grassTop;
      ctx.fillRect(px, py, TILE, 4);
      ctx.fillStyle = COLORS.grass;
      ctx.fillRect(px, py + 4, TILE, 3);
      break;
    case TERRAIN.ROCK:
      ctx.fillStyle = COLORS.rock;
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = COLORS.rockDark;
      ctx.fillRect(px + 2, py + 2, 4, 4);
      break;
    case TERRAIN.ONEWAY:
      ctx.fillStyle = COLORS.oneway;
      ctx.fillRect(px, py, TILE, 5);
      ctx.fillStyle = 'rgba(224,192,32,0.25)';
      ctx.fillRect(px, py + 5, TILE, 4);
      break;
    case TERRAIN.SPIKES:
      ctx.fillStyle = COLORS.spikes;
      ctx.beginPath();
      ctx.moveTo(px, py + TILE);
      ctx.lineTo(px + 4, py + 2);
      ctx.lineTo(px + 8, py + TILE);
      ctx.lineTo(px + 12, py + 2);
      ctx.lineTo(px + TILE, py + TILE);
      ctx.closePath();
      ctx.fill();
      break;
    case TERRAIN.HIDDEN:
      ctx.fillStyle = COLORS.hidden;
      ctx.fillRect(px, py, TILE, TILE);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      break;
    default:
      break;
  }
}

function itemColor(kind) {
  switch (kind) {
    case 'heart': return '#e04060';
    case 'bone': return '#f0e0d0';
    case '1up': return '#40e080';
    case 'letter': return '#f0e040';
    case 'diamond': return '#60e0f0';
    default: return COLORS.item;
  }
}
