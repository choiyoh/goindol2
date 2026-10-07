/** Physics & display constants — DESIGN.md §4–5, 60 Hz with dt. */

export const SCREEN_W = 320;
export const SCREEN_H = 200;
export const PLAY_H = 176;
export const HUD_H = 24;
export const TILE = 16;

/** Walk ~117 px/s (DESIGN §5). */
export const WALK_SPEED = 117;
/** Accel/decel ~0.2s to max (DESIGN §5). */
export const WALK_ACCEL = 612;
export const WALK_FRICTION = 612;

/** Crouch-walk speed multiplier (DESIGN / tunnels). */
export const CROUCH_SPEED_MUL = 0.55;

/**
 * Jump tuned to short ≈36px / full ≈56px (DESIGN §5 + stage1_notes).
 * g≈592, v_short≈206, v_full≈257 at 60Hz equivalent.
 */
export const GRAVITY = 592;
export const JUMP_VY = 206;
export const JUMP_HOLD_EXTRA_VY = 64; // extra impulse spread over JUMP_HOLD_TIME while held → full ≈56px (sim-tuned; gravity acts during the window)
export const JUMP_HOLD_TIME = 0.15; // window over which the extra impulse is spread while held
/**
 * Touch-only short-tap grace: touchend lands ~50–80ms after the finger lifts,
 * so a pad tap used to collect part of the hold impulse (~40px). For touch
 * jumps the hold impulse is banked (not applied) for the first
 * TOUCH_JUMP_GRACE s; release inside it → pure short jump (≈36px). Still held
 * after it → banked impulse is applied at once × TOUCH_JUMP_CATCHUP, which
 * offsets the height lost by applying it late (full hold stays ≈57px).
 * Keyboard jumps are untouched.
 */
export const TOUCH_JUMP_GRACE = 0.07;
export const TOUCH_JUMP_CATCHUP = 1.1;
export const JUMP_HOLD_GRAV_SCALE = 1; // impulse-only variable jump: no slow-mo gravity
/** Coyote time after leaving a ledge, and jump-press buffer before landing (s). */
export const COYOTE_TIME = 0.08;
export const JUMP_BUFFER_TIME = 0.10;
export const MAX_FALL = 280; // px/s ≈12 px/tick @23Hz

/** Hitboxes — feet-center anchor (DESIGN §6 / task spec). */
export const STAND_W = 20;
export const STAND_H = 34;
export const CROUCH_W = 20;
export const CROUCH_H = 24;

export const LIVES_START = 3;
export const HEARTS_PER_LIFE = 3;
export const INVULN_TIME = 1.0;

/**
 * Club attack timing — FALLBACK ONLY. At runtime the hero sheet meta overrides
 * these (hero_attack.json / hero_crouchattack.json frameMs + hitFrame):
 *   stand  frameMs [30,60,160,100] → total 350ms, hit window 90–250ms (frame 2)
 *   crouch frameMs [120,60,160,120] → total 460ms, hit window 180–340ms (frame 2)
 * Club hitbox comes from clubHitboxRelAnchor (feet-relative), see hero.js getClubHitbox.
 */
export const ATTACK_DURATION = 0.35;
export const ATTACK_ACTIVE_START = 0.09;
export const ATTACK_ACTIVE_END = 0.25;
export const CROUCH_ATTACK_DURATION = 0.46;
export const CLUB_DAMAGE = 25;
export const CLUB_CROUCH_MULT = 4;

/** Original tick rate for platform speed conversion (px/tick → px/s). */
export const ORIG_HZ = 70 / 3; // ≈23.333

export const TERRAIN = {
  EMPTY: 0,
  GRASS: 1,
  ROCK: 2,
  ONEWAY: 3,
  SPIKES: 4,
  HIDDEN: 5,
};

export const COLORS = {
  sky: '#70b0e0',
  empty: null,
  grass: '#208030',
  grassTop: '#20c060',
  rock: '#706050',
  rockDark: '#504030',
  oneway: '#e0c020',
  spikes: '#a00020',
  hidden: '#908070',
  player: '#e0a080',
  playerCrouch: '#c08060',
  playerHurt: '#ffffff',
  club: '#804020',
  lighter: '#f0e020',
  goal: '#e04040',
  goalLit: '#40e060',
  checkpoint: '#80c0ff',
  checkpointOn: '#40ff80',
  platform: '#b09070',
  enemy: '#a06040',
  item: '#f0a0c0',
  secret: '#c0a060',
  deco: '#d0d0a0',
  hudBg: '#606070',
  hudText: '#f0f0f0',
  spawn: '#8060a0',
};
