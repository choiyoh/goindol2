/**
 * Hand-drawn tileset — lookup ported 1:1 from goindol2/hand/tiles/preview.py.
 * Meta: assets/tiles/tileset.json (tile 16, columns 16, maskBits T1 R2 B4 L8).
 */

const BASE = './assets/tiles/';

/** Neighbour counts as "solid" (blocked) for autotile masks. */
const isSolid = (v) => v === 1 || v === 2 || v === 5;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

export async function loadTileset() {
  const [meta, image] = await Promise.all([
    fetch(`${BASE}tileset.json`).then((r) => {
      if (!r.ok) throw new Error(`Failed to load tileset.json: ${r.status}`);
      return r.json();
    }),
    loadImage(`${BASE}tileset.png`),
  ]);
  return { meta, image, tile: meta.tile || 16, columns: meta.columns || 16 };
}

/** Source [col,row] for terrain id at (tx,ty), or null. level.tileAt treats outside as ROCK (solid). */
export function tileSrc(level, id, tx, ty) {
  const at = (x, y) => level.tileAt(x, y);
  const v = (tx * 7 + ty * 13) & 1;
  const m = (isSolid(at(tx, ty - 1)) ? 0 : 1)
    | (isSolid(at(tx + 1, ty)) ? 0 : 2)
    | (isSolid(at(tx, ty + 1)) ? 0 : 4)
    | (isSolid(at(tx - 1, ty)) ? 0 : 8);
  switch (id) {
    case 2:
    case 5: // hidden drawn exactly like rock (secrecy); transparency deferred
      return [m, v];
    case 1:
      return [v * 8 + (m >> 1), 2];
    case 3: {
      const l = at(tx - 1, ty) === 3;
      const r = at(tx + 1, ty) === 3;
      return [l && r ? 1 : l ? 2 : r ? 0 : 3, 3];
    }
    case 4:
      return [4 + v, 3];
    default:
      return null;
  }
}

export function drawTile(ctx, tileset, level, id, tx, ty, px, py) {
  const src = tileSrc(level, id, tx, ty);
  if (!src) return false;
  const T = tileset.tile;
  ctx.drawImage(tileset.image, src[0] * T, src[1] * T, T, T, px, py, T, T);
  return true;
}
