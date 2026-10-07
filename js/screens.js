/**
 * Title / difficulty / result screens — font blit from assets/title/.
 * Layout from title.json: bg 320×200, logo y≈22, menu BEGINNER/EXPERT @ x=132 y=108 step 14.
 */

import { SCREEN_W, SCREEN_H } from './config.js';

const BASE = './assets/title/';

const DIFF_OPTIONS = ['BEGINNER', 'EXPERT'];
const MENU_X = 132;
const MENU_Y = 108;
const MENU_STEP = 14;
const CURSOR_GAP = 14;
const LOGO_Y = 22;
const BOB_PERIOD = 0.5;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

export async function loadTitleAssets() {
  const [fontMeta, bg, logo, cursor, fontImg] = await Promise.all([
    fetch(`${BASE}font.json`).then((r) => {
      if (!r.ok) throw new Error(`font.json ${r.status}`);
      return r.json();
    }),
    loadImage(`${BASE}title_bg.png`),
    loadImage(`${BASE}logo.png`),
    loadImage(`${BASE}cursor_bone.png`),
    loadImage(`${BASE}font.png`),
  ]);
  const chars = fontMeta.chars || '';
  const charIndex = Object.create(null);
  for (let i = 0; i < chars.length; i++) charIndex[chars[i]] = i;
  return {
    bg, logo, cursor, fontImg, fontMeta, charIndex,
    cellW: (fontMeta.cell && fontMeta.cell[0]) || 7,
    cellH: (fontMeta.cell && fontMeta.cell[1]) || 9,
    advance: fontMeta.advance || 7,
  };
}

export function drawText(ctx, assets, str, x, y) {
  if (!assets || !assets.fontImg) return;
  const s = String(str).toUpperCase();
  const { fontImg, charIndex, cellW, cellH, advance } = assets;
  let dx = Math.round(x);
  const dy = Math.round(y);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const idx = charIndex[ch];
    if (idx != null) {
      ctx.drawImage(fontImg, idx * cellW, 0, cellW, cellH, dx, dy, cellW, cellH);
    }
    dx += advance;
  }
}

export function textWidth(assets, str) {
  if (!assets) return 0;
  return String(str).length * (assets.advance || 7);
}

function drawBgLogo(ctx, assets) {
  ctx.drawImage(assets.bg, 0, 0);
  const lx = Math.round((SCREEN_W - assets.logo.width) / 2);
  ctx.drawImage(assets.logo, lx, LOGO_Y);
}

function isTouchUi() {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

function continueHint() {
  return isTouchUi() ? 'TAP TO START' : 'PRESS SPACE';
}

export function drawTitleScreen(ctx, assets, nowMs) {
  if (!assets) {
    ctx.fillStyle = '#101018';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    return;
  }
  drawBgLogo(ctx, assets);
  const hint = continueHint();
  const hx = Math.round((SCREEN_W - textWidth(assets, hint)) / 2);
  if (Math.floor((nowMs || 0) / 500) % 2 === 0) {
    drawText(ctx, assets, hint, hx, 150);
  }
}

export function drawDifficultyScreen(ctx, assets, selected, nowMs) {
  if (!assets) {
    ctx.fillStyle = '#101018';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    return;
  }
  drawBgLogo(ctx, assets);
  const sel = selected === 1 ? 1 : 0;
  for (let i = 0; i < DIFF_OPTIONS.length; i++) {
    drawText(ctx, assets, DIFF_OPTIONS[i], MENU_X, MENU_Y + i * MENU_STEP);
  }
  const bob = Math.floor((nowMs || 0) / (BOB_PERIOD * 1000)) % 2;
  const cx = MENU_X - CURSOR_GAP + bob;
  const cy = MENU_Y + sel * MENU_STEP + Math.round((assets.cellH - assets.cursor.height) / 2);
  ctx.drawImage(assets.cursor, cx, cy);
}

export function drawResultScreen(ctx, assets, kind, game) {
  if (!assets) {
    ctx.fillStyle = '#101018';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    return;
  }
  ctx.drawImage(assets.bg, 0, 0);
  const title = kind === 'clear' ? 'STAGE CLEAR!' : 'GAME OVER';
  const tx = Math.round((SCREEN_W - textWidth(assets, title)) / 2);
  drawText(ctx, assets, title, tx, 56);
  const scoreStr = `SCORE ${String(Math.max(0, (game && game.score) | 0)).padStart(7, '0')}`;
  const sx = Math.round((SCREEN_W - textWidth(assets, scoreStr)) / 2);
  drawText(ctx, assets, scoreStr, sx, 84);
  const taken = Math.max(0, (game && game.itemsTaken) | 0);
  const total = Math.max(0, (game && game.itemsTotal) | 0);
  const itemsStr = `ITEMS ${taken}/${total}`;
  const ix = Math.round((SCREEN_W - textWidth(assets, itemsStr)) / 2);
  drawText(ctx, assets, itemsStr, ix, 104);
  const hint = continueHint();
  const hx = Math.round((SCREEN_W - textWidth(assets, hint)) / 2);
  drawText(ctx, assets, hint, hx, 150);
}

export { DIFF_OPTIONS, MENU_X, MENU_Y, MENU_STEP };
