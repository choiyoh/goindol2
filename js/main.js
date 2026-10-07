/**
 * 고인돌2 homage MVP — canvas game loop + screen flow.
 * States: title → difficulty → play → clear | gameover → title/difficulty.
 * Level: ./stage1.json → ../homage/stage1.json only. Never loads /data/.
 */

import { SCREEN_W, SCREEN_H, PLAY_H, LIVES_START, HEARTS_PER_LIFE } from './config.js';
import { createInput } from './input.js';
import { loadLevel } from './level.js';
import { createPlayer, updatePlayer, killPlayer, respawnPlayer } from './player.js';
import { createCamera, updateCamera } from './camera.js';
import { updatePlatforms } from './platforms.js';
import { solidSecrets, updateEntities } from './entities.js';
import { loadEnemySheets, initEnemyAi, updateEnemies } from './enemies.js';
import { drawFrame } from './render.js';
import { loadTileset } from './tiles.js';
import { loadBackground } from './background.js';
import { loadItemsSheet, loadPropsSheet } from './props.js';
import { loadHero, initHeroAnim, updateHeroAnim, getClubHitbox } from './hero.js';
import { loadHud } from './hud.js';
import { loadFx, updateFx } from './fx.js';
import {
  loadTitleAssets,
  drawTitleScreen,
  drawDifficultyScreen,
  drawResultScreen,
  DIFF_OPTIONS,
} from './screens.js';

/**
 * Ignore canvas taps briefly after a state change so a finger that was mashing
 * the (now hidden) touch pad doesn't instantly skip the results screen.
 */
const TAP_GUARD_MS = { title: 150, difficulty: 150, clear: 600, gameover: 600 };

/** Difficulty: top half of canvas = BEGINNER, bottom half = EXPERT (fat finger-friendly). Text stays at MENU_Y. */
function menuRowAt(y) {
  // Split at midpoint between row centers (112.5 / 126.5) → y=120.
  // Gives ~7px slack above/below each label so BEGINNER glyphs aren't clipped into EXPERT.
  return y < 120 ? 0 : 1;
}

const statusEl = document.getElementById('status');
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

/** Min CSS width reserved on EACH side for the virtual pad in coarse landscape. */
const PAD_GUTTER_MIN = 96;
/** Portrait coarse: pad stack occupies the bottom 42% + 24px (see index.html). */
const PAD_PORTRAIT_FRAC = 0.42;
const PAD_PORTRAIT_EXTRA = 24;
const EDGE = 4; // CSS px breathing room

/**
 * Prefer integer *device-pixel* scaling (GM). Portrait exception: if that
 * wastes >15% of available width, fill with fractional CSS scale + pixelated
 * (DPR≈2.6 makes shimmer ~0.4 CSS px). Landscape stays integer. Bitmap 320×200.
 * Position is snapped to the device grid too, and the resulting box is
 * exported as CSS vars (--cv-*, --gutter) so the touch pad can sit beside it.
 */
function fitCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const landscape = vw > vh;
  const statusH = statusEl ? statusEl.offsetHeight + EDGE * 2 : 0;

  let areaTop = statusH;
  let availW = vw - EDGE * 2;
  let availH = vh - statusH - EDGE;
  if (coarse && landscape) {
    // Status floats in the left gutter; pads take both side gutters.
    areaTop = EDGE;
    availW = vw - PAD_GUTTER_MIN * 2;
    availH = vh - EDGE * 2;
  } else if (coarse) {
    // Portrait: canvas top-aligned above the bottom pad stack.
    availH = vh - statusH - (vh * PAD_PORTRAIT_FRAC + PAD_PORTRAIT_EXTRA) - EDGE;
  }

  const maxCss = Math.max(0, Math.min(availW / SCREEN_W, availH / SCREEN_H));
  const deviceScale = Math.max(1, Math.floor(maxCss * dpr + 1e-6));
  let cssScale = deviceScale / dpr;
  // Portrait: if integer device scale wastes >15% of available width, fill width
  // with fractional CSS scale (pixelated). At DPR≈2.6 the unevenness is ~0.4 CSS px.
  // Landscape keeps integer device-pixel scale.
  if (!landscape) {
    const intW = SCREEN_W * cssScale;
    const waste = availW > 0 ? 1 - intW / availW : 0;
    if (waste > 0.15) {
      cssScale = maxCss; // fill the limiting axis (usually width on cover portrait)
    }
  }
  const w = SCREEN_W * cssScale;
  const h = SCREEN_H * cssScale;
  const snap = (v) => Math.round(v * dpr) / dpr;
  const left = snap(Math.max(0, (vw - w) / 2));
  const top = coarse && !landscape
    ? snap(areaTop)
    : snap(areaTop + Math.max(0, (vh - areaTop - (coarse && landscape ? EDGE : 0) - h) / 2));

  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.style.left = `${left}px`;
  canvas.style.top = `${top}px`;
  const root = document.documentElement.style;
  root.setProperty('--cv-left', `${left}px`);
  root.setProperty('--cv-top', `${top}px`);
  root.setProperty('--cv-w', `${w}px`);
  root.setProperty('--cv-h', `${h}px`);
  root.setProperty('--gutter', `${Math.max(0, left)}px`);
  canvas.dataset.deviceScale = String(deviceScale);
}

fitCanvas();
window.addEventListener('resize', fitCanvas);
window.addEventListener('orientationchange', fitCanvas);
if (window.visualViewport) window.visualViewport.addEventListener('resize', fitCanvas);
// DPR changes (browser zoom, moving between screens/fold states) don't always fire resize.
(function watchDpr() {
  const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  const onChange = () => { fitCanvas(); watchDpr(); };
  if (mq.addEventListener) mq.addEventListener('change', onChange, { once: true });
})();

const LEVEL_URLS = ['./stage1.json', '../homage/stage1.json'];

async function fetchLevel() {
  let lastErr;
  for (const url of LEVEL_URLS) {
    try {
      return await loadLevel(url);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Could not load stage1.json');
}

function setStatus(t) {
  if (statusEl) statusEl.textContent = t;
}

async function main() {
  setStatus('Loading stage1…');
  let level = await fetchLevel();
  setStatus('Loading hero…');
  const hero = await loadHero();
  setStatus('Loading enemies…');
  const sheets = await loadEnemySheets();
  setStatus('Loading tiles…');
  let tileset = null;
  try {
    tileset = await loadTileset();
  } catch (e) {
    console.warn('Tileset failed, using procedural terrain', e);
  }
  setStatus('Loading background…');
  let bg = null;
  try {
    bg = await loadBackground();
  } catch (e) {
    console.warn('Background failed, using solid sky', e);
  }
  setStatus('Loading items…');
  let itemSheets = { items: null, props: null };
  try {
    const [items, props] = await Promise.all([loadItemsSheet(), loadPropsSheet()]);
    itemSheets = { items, props };
  } catch (e) {
    console.warn('Items/props sheets failed, using rect stubs', e);
  }
  setStatus('Loading HUD…');
  let hud = null;
  try {
    hud = await loadHud();
  } catch (e) {
    console.warn('HUD sheet failed, using text fallback', e);
  }
  setStatus('Loading FX…');
  try {
    await loadFx();
  } catch (e) {
    console.warn('FX sheet failed, particles will be silent', e);
  }
  setStatus('Loading title…');
  let titleAssets = null;
  try {
    titleAssets = await loadTitleAssets();
  } catch (e) {
    console.warn('Title assets failed', e);
  }

  for (const e of level.entities.enemies) initEnemyAi(e, level);
  window.__game = { level, sheets, tileset, itemSheets, bg, hud, titleAssets };

  const input = createInput();
  let player = createPlayer(level.entities.playerStart);
  initHeroAnim(player);
  const cam = createCamera();

  /** @type {'title'|'difficulty'|'play'|'clear'|'gameover'} */
  let state = 'title';
  /** 0 = BEGINNER, 1 = EXPERT — persisted across results → replay. */
  let diffSelect = 0;

  const game = {
    lives: LIVES_START,
    hearts: HEARTS_PER_LIFE,
    score: 0,
    cleared: false,
    /** DESIGN §2.11: Beginner/Expert — Expert spawns expert_only enemies. */
    expert: false,
    difficulty: 'BEGINNER',
    paused: false,
    deathTimer: 0,
    flashMsg: '',
    flashT: 0,
    itemsTaken: 0,
    itemsTotal: level.entities.items.length,
  };

  Object.assign(window.__game, { game, player, cam, state });
  let starting = false;

  setStatus('Title · Space/Enter/tap start · P pause in play');

  // Canvas-tap bookkeeping: when did we enter the current state, and is the pad shown?
  let tapState = null;
  let tapStateSince = 0;
  let padVisible = null;

  /** One-shot canvas tap for this frame, respecting the post-transition guard. */
  function menuTap(now) {
    if (!input.pressed.tap) return null;
    if (now - tapStateSince < (TAP_GUARD_MS[state] || 0)) return null;
    return input.tap;
  }

  let last = performance.now();
  let acc = 0;
  const STEP = 1 / 60;

  function flash(msg) {
    game.flashMsg = msg;
    game.flashT = 1.6;
  }

  function applyDifficulty(index) {
    const i = index === 1 ? 1 : 0;
    diffSelect = i;
    game.difficulty = DIFF_OPTIONS[i];
    game.expert = i === 1; // EXPERT → expert_only enemies (stage1: turtle + small_dino)
  }

  async function startPlay() {
    if (starting) return;
    starting = true;
    applyDifficulty(diffSelect);
    setStatus('Loading stage…');
    try {
    level = await fetchLevel();
    for (const e of level.entities.enemies) initEnemyAi(e, level);
    player = createPlayer(level.entities.playerStart);
    initHeroAnim(player);
    cam.x = Math.max(0, player.x - SCREEN_W * 0.4);
    cam.y = Math.max(0, player.y - PLAY_H * 0.65);
    // Reset run stats; keep difficulty / expert
    game.lives = LIVES_START;
    game.hearts = HEARTS_PER_LIFE;
    game.score = 0;
    game.cleared = false;
    game.paused = false;
    game.deathTimer = 0;
    game.flashMsg = '';
    game.flashT = 0;
    game._goalHint = false;
    game.itemsTaken = 0;
    game.itemsTotal = level.entities.items.length;
    Object.assign(window.__game, { level, game, player, cam });
    state = 'play';
    setStatus(
      `${level.name} · ${game.difficulty} · ←→ move · ↑/Z jump · ↓ crouch · Space club · P pause`,
    );
    } finally {
      starting = false;
    }
  }

  function confirmPressed() {
    return !!(input.pressed.attack || input.pressed.jump);
  }

  function frame(now) {
    const rawDt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += rawDt;

    input.beginFrame();
    window.__game.state = state;
    window.__game.player = player;
    window.__game.level = level;
    window.__game.game = game;

    if (state !== tapState) {
      tapState = state;
      tapStateSince = now;
    }
    // Virtual pad only in play; menus/results hide it so taps reach the canvas.
    const wantPad = state === 'play';
    if (wantPad !== padVisible) {
      padVisible = wantPad;
      input.setTouchPadVisible(wantPad);
    }

    // --- menu / result states (no play sim) ---
    if (state === 'title') {
      if (confirmPressed() || menuTap(now)) {
        state = 'difficulty';
        setStatus('Difficulty · ↑↓/W S select · Space/Enter confirm · tap top/bottom half');
      }
      drawTitleScreen(ctx, titleAssets, now);
      requestAnimationFrame(frame);
      return;
    }

    if (state === 'difficulty') {
      // up/jump or W = previous; down/S = next
      if (input.pressed.jump) diffSelect = (diffSelect + DIFF_OPTIONS.length - 1) % DIFF_OPTIONS.length;
      if (input.pressed.down) diffSelect = (diffSelect + 1) % DIFF_OPTIONS.length;
      if (input.pressed.attack) {
        // Confirm only with attack/Space/Enter (not jump, so W doesn't start)
        startPlay().catch((err) => {
          console.error(err);
          setStatus(`Error: ${err.message}`);
          state = 'difficulty';
        });
      }
      // Tap a row: select AND confirm (immediate start). Taps off the rows do nothing.
      const t = menuTap(now);
      const tapRow = t ? menuRowAt(t.y) : -1;
      if (tapRow >= 0 && !input.pressed.attack) {
        diffSelect = tapRow;
        startPlay().catch((err) => {
          console.error(err);
          setStatus(`Error: ${err.message}`);
          state = 'difficulty';
        });
      }
      drawDifficultyScreen(ctx, titleAssets, diffSelect, now);
      requestAnimationFrame(frame);
      return;
    }

    if (state === 'clear' || state === 'gameover') {
      if (input.pressed.attack || menuTap(now)) {
        // Clear → difficulty (keep selection); game over → title
        state = state === 'clear' ? 'difficulty' : 'title';
        setStatus(
          state === 'difficulty'
            ? 'Difficulty · ↑↓/W S select · Space/Enter confirm · tap top/bottom half'
            : 'Title · Space/Enter/tap start',
        );
      }
      drawResultScreen(ctx, titleAssets, state, game);
      requestAnimationFrame(frame);
      return;
    }

    // --- play ---
    if (input.pressed.pause) game.paused = !game.paused;

    while (acc >= STEP) {
      const dt = STEP;
      acc -= STEP;

      if (game.flashT > 0) {
        game.flashT -= dt;
        if (game.flashT <= 0) game.flashMsg = '';
      }
      updateFx(dt);

      if (game.paused) continue;

      // Stage clear → results
      if (game.cleared) {
        state = 'clear';
        setStatus('STAGE CLEAR · Space/tap → difficulty');
        acc = 0;
        break;
      }

      if (!player.alive) {
        game.deathTimer -= dt;
        if (game.deathTimer <= 0) {
          if (game.lives > 0) {
            respawnPlayer(player, game);
          } else {
            state = 'gameover';
            setStatus('GAME OVER · Space/tap → title');
            acc = 0;
            break;
          }
        }
        continue;
      }

      if (input.pressed.suicide) {
        killPlayer(player, game);
        flash('Life forfeited');
        continue;
      }

      const solids = solidSecrets(level.entities.secrets);

      // Player vs tiles/secrets first, then move platforms with the rider in the
      // SAME call so the carry uses this frame's movedX/movedY (C1 fix).
      const { hitSpike } = updatePlayer(player, input, level, dt, solids, hero);
      updatePlatforms(level.entities.platforms, dt, player);
      // Anim after the rider pass so onGround on moving platforms is final (no fall-pose flicker)
      updateHeroAnim(player, hero, dt);
      // Club hitbox from sheet meta (clubHitboxRelAnchor) only while on hitFrame
      const attackHitbox = getClubHitbox(player, hero);

      if (hitSpike) {
        killPlayer(player, game);
        flash('Spikes!');
      } else if (player.y > level.pixelH + 8) {
        killPlayer(player, game);
        flash('Fell!');
      }

      const msgs = updateEntities(level, player, game, attackHitbox, dt);
      for (const m of msgs) flash(m);

      const tMsgs = updateEnemies(
        level, player, game, attackHitbox, dt, cam, sheets,
      );
      for (const m of tMsgs) flash(m);

      updateCamera(cam, player, level, dt);
    }

    if (state === 'clear' || state === 'gameover') {
      drawResultScreen(ctx, titleAssets, state, game);
    } else {
      drawFrame(ctx, level, player, cam, game, game.flashMsg, hero, sheets, tileset, itemSheets, now, bg, hud);
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error(err);
  setStatus(`Error: ${err.message}`);
});
