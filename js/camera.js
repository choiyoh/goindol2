/** Camera: horizontal deadzone (DESIGN: no scroll until player past screen x≈226), clamp to scrollLimitTile. */

import { SCREEN_W, PLAY_H, TILE } from './config.js';

/** Player feet-x screen bounds before the camera scrolls. */
export const CAM_DEADZONE_LEFT = 80;
export const CAM_DEADZONE_RIGHT = 226;

export function createCamera() {
  return { x: 0, y: 0 };
}

export function updateCamera(cam, player, level, dt) {
  // --- horizontal deadzone: hard follow at the edges (no lag past the bounds) ---
  const sx = player.x - cam.x;
  if (sx > CAM_DEADZONE_RIGHT) cam.x = player.x - CAM_DEADZONE_RIGHT;
  else if (sx < CAM_DEADZONE_LEFT) cam.x = player.x - CAM_DEADZONE_LEFT;

  // --- vertical: soft follow ---
  const targetY = player.y - PLAY_H * 0.65;
  const ky = 1 - Math.pow(0.002, dt);
  cam.y += (targetY - cam.y) * Math.min(1, ky * 6);

  const maxX = Math.max(0, level.scrollLimitTile * TILE - SCREEN_W);
  const maxY = Math.max(0, level.pixelH - PLAY_H);
  if (cam.x < 0) cam.x = 0;
  if (cam.y < 0) cam.y = 0;
  if (cam.x > maxX) cam.x = maxX;
  if (cam.y > maxY) cam.y = maxY;
}
