/**
 * Hand-drawn items + props sheets (assets/items/).
 * Items: 16×16 cell strip. Props: named rects (platform / breakable / sign / gate /
 * checkpoint / goal). Draw-only — collision sizes stay on entities.
 */

const BASE = './assets/items/';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

export async function loadItemsSheet() {
  const [meta, image] = await Promise.all([
    fetch(`${BASE}items.json`).then((r) => {
      if (!r.ok) throw new Error(`items.json ${r.status}`);
      return r.json();
    }),
    loadImage(`${BASE}items.png`),
  ]);
  const cell = meta.cell || [16, 16];
  return {
    image,
    cellW: cell[0],
    cellH: cell[1],
    frames: meta.frames || {},
  };
}

export async function loadPropsSheet() {
  const [meta, image] = await Promise.all([
    fetch(`${BASE}props.json`).then((r) => {
      if (!r.ok) throw new Error(`props.json ${r.status}`);
      return r.json();
    }),
    loadImage(`${BASE}props.png`),
  ]);
  return { image, rects: meta.rects || {} };
}

/** Resolve items.json frame key from entity kind (+ letter for B/O/U). */
export function itemFrameName(kind, letter) {
  if (kind === 'letter') {
    const L = (letter || 'B').toString().toUpperCase();
    return `letter_${L}`;
  }
  if (kind === 'lighter') return 'lighter';
  return kind;
}

/**
 * Draw a floating item (or lighter) from the items strip.
 * Optional bob: ±bobAmp px vertical, period bobPeriodMs (default ~600ms).
 */
export function drawItem(ctx, sheet, kind, letter, dx, dy, timeMs, opts) {
  if (!sheet || !sheet.image) return false;
  const name = itemFrameName(kind, letter);
  const idx = sheet.frames[name];
  if (idx == null) return false;
  const cw = sheet.cellW;
  const ch = sheet.cellH;
  const bobAmp = (opts && opts.bobAmp != null) ? opts.bobAmp : 1.5;
  const bobPeriod = (opts && opts.bobPeriodMs != null) ? opts.bobPeriodMs : 600;
  const t = timeMs != null ? timeMs : 0;
  const bob = Math.round(Math.sin((t / bobPeriod) * Math.PI * 2) * bobAmp);
  ctx.drawImage(
    sheet.image,
    idx * cw, 0, cw, ch,
    Math.round(dx), Math.round(dy + bob), cw, ch,
  );
  return true;
}

/** Draw a named props.json rect at (dx,dy), optionally stretched to dw×dh. */
export function drawPropRect(ctx, sheet, name, dx, dy, dw, dh) {
  if (!sheet || !sheet.image) return false;
  const r = sheet.rects[name];
  if (!r) return false;
  const tw = dw != null ? dw : r.w;
  const th = dh != null ? dh : r.h;
  ctx.drawImage(
    sheet.image,
    r.x, r.y, r.w, r.h,
    Math.round(dx), Math.round(dy), tw, th,
  );
  return true;
}

/**
 * Platform: tile/repeat the 32×16 source horizontally when object.w > 32.
 * Vine decoration is in the bottom of each tile — keep it per segment.
 */
export function drawPlatformProp(ctx, sheet, px, py, pw, ph) {
  if (!sheet || !sheet.image) return false;
  const r = sheet.rects.platform;
  if (!r) return false;
  const srcW = r.w;
  const srcH = r.h;
  const destH = ph != null ? ph : srcH;
  let x = 0;
  while (x < pw) {
    const slice = Math.min(srcW, pw - x);
    ctx.drawImage(
      sheet.image,
      r.x, r.y, slice, srcH,
      Math.round(px + x), Math.round(py), slice, destH,
    );
    x += srcW;
  }
  return true;
}

/** Breakable: hit variant when damageTaken >= hp/2 (or hits remaining half). */
export function drawBreakableProp(ctx, sheet, secret, dx, dy) {
  const hp = secret.hp || 1;
  const hit = (secret.damageTaken || 0) >= hp / 2;
  const name = hit ? 'breakable_hit' : 'breakable';
  return drawPropRect(ctx, sheet, name, dx, dy, secret.w, secret.h);
}

/** Checkpoint flag: on when active. */
export function drawCheckpointProp(ctx, sheet, cp, dx, dy) {
  const name = cp.active ? 'checkpoint_on' : 'checkpoint_off';
  return drawPropRect(ctx, sheet, name, dx, dy, cp.w, cp.h);
}

/**
 * Goal torch: unlit, or lit1/lit2 alternating every 200ms when hasLighter or cleared.
 */
export function drawGoalProp(ctx, sheet, goal, dx, dy, lit, timeMs) {
  let name = 'goal_unlit';
  if (lit) {
    const phase = Math.floor((timeMs || 0) / 200) % 2;
    name = phase === 0 ? 'goal_lit1' : 'goal_lit2';
  }
  return drawPropRect(ctx, sheet, name, dx, dy, goal.w, goal.h);
}
