/**
 * Hand-drawn HUD strip (assets/hud/) — panel + digits/hearts/club icons.
 * Lighter icon reuses items.png lighter frame. Falls back to solid bar + monospace.
 */

import { SCREEN_W, PLAY_H, HUD_H, COLORS } from './config.js';

const BASE = './assets/hud/';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

/**
 * @returns {Promise<{image: HTMLImageElement, rects: object, layout: object}>}
 */
export async function loadHud() {
  const [meta, image] = await Promise.all([
    fetch(`${BASE}hud.json`).then((r) => {
      if (!r.ok) throw new Error(`hud.json ${r.status}`);
      return r.json();
    }),
    loadImage(`${BASE}hud.png`),
  ]);
  return {
    image,
    rects: meta.rects || {},
    layout: meta.layout || {},
  };
}

function blitRect(ctx, image, rect, dx, dy) {
  if (!rect) return;
  const [sx, sy, sw, sh] = rect;
  ctx.drawImage(image, sx, sy, sw, sh, Math.round(dx), Math.round(dy), sw, sh);
}

/** Draw digit sprite d_0..d_9 (clamped 0–9). */
function blitDigit(ctx, hud, digit, dx, dy) {
  const n = Math.max(0, Math.min(9, digit | 0));
  blitRect(ctx, hud.image, hud.rects[`d_${n}`], dx, dy);
}

/**
 * Sprite HUD at y=PLAY_H. Falls back to solid fill + monospace if hud/items missing.
 * Flash / clear / game-over overlays always drawn on top.
 */
export function drawHud(ctx, player, game, flashMsg, hud, items) {
  const y = PLAY_H;

  if (hud && hud.image && hud.rects && hud.rects.panel) {
    blitRect(ctx, hud.image, hud.rects.panel, 0, y);

    const L = hud.layout.lives || { head: [8, 4], x: [26, 8], num: [34, 8] };
    blitRect(ctx, hud.image, hud.rects.head, L.head[0], y + L.head[1]);
    blitRect(ctx, hud.image, hud.rects.d_x, L.x[0], y + L.x[1]);
    blitDigit(ctx, hud, Math.max(0, game.lives | 0), L.num[0], y + L.num[1]);

    const S = hud.layout.score || { num: [78, 8], digits: 7, advance: 8 };
    const digits = S.digits || 7;
    const advance = S.advance || 8;
    const scoreStr = String(Math.max(0, game.score | 0)).padStart(digits, '0').slice(-digits);
    for (let i = 0; i < digits; i++) {
      blitDigit(ctx, hud, scoreStr.charCodeAt(i) - 48, S.num[0] + i * advance, y + S.num[1]);
    }

    const H = hud.layout.hearts || { pos: [181, 7], step: 15, count: 3 };
    const count = H.count || 3;
    for (let i = 0; i < count; i++) {
      const name = i < game.hearts ? 'heart_full' : 'heart_empty';
      blitRect(ctx, hud.image, hud.rects[name], H.pos[0] + i * (H.step || 15), y + H.pos[1]);
    }

    const W = hud.layout.weapon || { icon: [244, 4], lighter: [296, 4] };
    blitRect(ctx, hud.image, hud.rects.club, W.icon[0], y + W.icon[1]);
    if (player.hasLighter && items && items.image && items.frames && items.frames.lighter != null) {
      const cw = items.cellW || 16;
      const ch = items.cellH || 16;
      const idx = items.frames.lighter;
      ctx.drawImage(
        items.image,
        idx * cw, 0, cw, ch,
        Math.round(W.lighter[0]), Math.round(y + W.lighter[1]), cw, ch,
      );
    }
  } else {
    // Fallback: solid bar + monospace text
    ctx.fillStyle = COLORS.hudBg;
    ctx.fillRect(0, y, SCREEN_W, HUD_H);
    ctx.fillStyle = COLORS.hudText;
    ctx.font = '10px monospace';
    ctx.textBaseline = 'middle';
    const cy = y + HUD_H / 2;
    ctx.fillText(`LIVES×${Math.max(0, game.lives)}`, 6, cy);
    ctx.fillText(`SCORE ${String(game.score | 0).padStart(7, '0')}`, 80, cy);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < game.hearts ? '#e04060' : '#402028';
      ctx.fillRect(200 + i * 14, cy - 5, 12, 10);
    }
    ctx.fillStyle = '#d0b090';
    ctx.fillText(player.weapon === 'club' ? 'CLUB' : player.weapon, 250, cy);
    if (player.hasLighter) {
      ctx.fillStyle = COLORS.lighter;
      ctx.fillRect(290, cy - 5, 10, 10);
    }
  }

  if (flashMsg) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(40, 60, 240, 24);
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(flashMsg, SCREEN_W / 2, 72);
    ctx.textAlign = 'left';
  }

  // STAGE CLEAR / GAME OVER are drawn by screens.js result states (not HUD overlays).
}

