/** Parallax background — assets/bg/bg.json (sky→far→mid, 320×176, tiled on X). */

import { SCREEN_W, PLAY_H } from './config.js';

const BASE = './assets/bg/';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

export async function loadBackground() {
  const res = await fetch(`${BASE}bg.json`);
  if (!res.ok) throw new Error(`Failed to load bg.json: ${res.status}`);
  const meta = await res.json();
  const [w, h] = meta.size || [SCREEN_W, PLAY_H];
  const layers = await Promise.all(
    (meta.layers || []).map(async (l) => ({
      image: await loadImage(BASE + l.image),
      parallaxX: l.parallaxX ?? 0,
      parallaxY: l.parallaxY ?? 0,
    })),
  );
  return { w, h, tileX: meta.tileX !== false, layers };
}

const mod = (a, n) => ((a % n) + n) % n;

/** Draw all layers back-to-front. Returns false if nothing drawn (caller fills sky). */
export function drawBackground(ctx, bg, camX, camY) {
  if (!bg || !bg.layers.length) return false;
  for (const l of bg.layers) {
    let y = -Math.floor(camY * l.parallaxY);
    if (y < -16) y = -16;
    if (y > 0) y = 0;
    const x0 = -mod(Math.floor(camX * l.parallaxX), bg.w);
    if (bg.tileX) {
      for (let x = x0; x < SCREEN_W; x += bg.w) ctx.drawImage(l.image, x, y);
    } else {
      ctx.drawImage(l.image, -Math.floor(camX * l.parallaxX), y);
    }
  }
  return true;
}
