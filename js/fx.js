/**
 * Hand-drawn FX sheet (assets/fx/) — dirt (emerge / break) + spark (club hit).
 * Module-level particle list: {kind,x,y,t,frame}. Falls back to no-op if load fails.
 */

const BASE = './assets/fx/';

/** @type {{image: HTMLImageElement, dirt: object, spark: object}|null} */
let sheet = null;

/** @type {{kind: string, x: number, y: number, t: number, frame: number}[]} */
const particles = [];

/** Last swingId that already spawned a spark (once per swing). */
let lastSparkSwing = -1;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

/**
 * @returns {Promise<{image, dirt, spark}|null>}
 */
export async function loadFx() {
  const [meta, image] = await Promise.all([
    fetch(`${BASE}fx.json`).then((r) => {
      if (!r.ok) throw new Error(`fx.json ${r.status}`);
      return r.json();
    }),
    loadImage(`${BASE}fx.png`),
  ]);
  sheet = {
    image,
    dirt: meta.dirt,
    spark: meta.spark,
  };
  return sheet;
}

export function clearFx() {
  particles.length = 0;
  lastSparkSwing = -1;
}

/** Dirt puff at world feet / ground point (anchor bottom-center). */
export function spawnDirt(x, y) {
  particles.push({ kind: 'dirt', x, y, t: 0, frame: 0 });
}

/**
 * Spark at world point (club hitbox center). Once per swing when swingId given.
 * @param {number} [swingId]
 */
export function spawnSpark(x, y, swingId) {
  if (swingId != null) {
    if (swingId === lastSparkSwing) return;
    lastSparkSwing = swingId;
  }
  particles.push({ kind: 'spark', x, y, t: 0, frame: 0 });
}

function defFor(kind) {
  if (!sheet) return null;
  return kind === 'dirt' ? sheet.dirt : kind === 'spark' ? sheet.spark : null;
}

/** Advance particles by dt (seconds); drop finished. */
export function updateFx(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.t += dt;
    const def = defFor(p.kind);
    const frameMs = (def && def.frameMs) || (p.kind === 'dirt' ? 60 : 40);
    const frames = (def && def.frames) || (p.kind === 'dirt' ? 5 : 3);
    p.frame = Math.floor((p.t * 1000) / frameMs);
    if (p.frame >= frames) particles.splice(i, 1);
  }
}

/**
 * Draw active particles in world space (call inside playfield clip, after entities).
 * No-op if sheet failed to load (particles still age out via updateFx).
 */
export function drawFx(ctx, camX, camY) {
  if (!sheet || !sheet.image) return;
  for (const p of particles) {
    const def = defFor(p.kind);
    if (!def) continue;
    const [cw, ch] = def.cell;
    const [ax, ay] = def.anchor;
    const sx = (def.x0 || 0) + p.frame * cw;
    const sy = def.y || 0;
    const dx = Math.round(p.x - camX - ax);
    const dy = Math.round(p.y - camY - ay);
    ctx.drawImage(sheet.image, sx, sy, cw, ch, dx, dy, cw, ch);
  }
}

export function fxParticleCount() {
  return particles.length;
}
