/** Keyboard + basic touch zones + one-shot canvas taps (menus). */

const GAME_W = 320;
const GAME_H = 200;

const KEY_MAP = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'jump',
  ArrowDown: 'down',
  KeyA: 'left',
  KeyD: 'right',
  KeyW: 'jump',
  KeyS: 'down',
  KeyZ: 'jump',
  KeyK: 'jump',
  Space: 'attack',
  Enter: 'attack',
  NumpadEnter: 'attack',
  KeyX: 'attack',
  KeyJ: 'attack',
  KeyP: 'pause',
  KeyR: 'suicide',
};

export function createInput() {
  const down = {
    left: false,
    right: false,
    jump: false,
    down: false,
    attack: false,
    pause: false,
    suicide: false,
  };
  const pressed = { ...down, tap: false }; // edge: true for one frame after press
  const _edge = { ...down };

  // Which device produced the current jump press ('key' | 'touch'). Touch
  // releases arrive late, so player.js gives touch jumps a short-tap grace.
  const source = { jump: 'key' };

  function set(btn, value, src = 'key') {
    if (!btn || !(btn in down)) return;
    if (value && !down[btn]) {
      _edge[btn] = true;
      if (btn in source) source[btn] = src;
    }
    down[btn] = value;
  }

  function onKey(e, value) {
    const btn = KEY_MAP[e.code];
    if (!btn) return;
    e.preventDefault();
    set(btn, value);
  }

  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', () => {
    for (const k of Object.keys(down)) down[k] = false;
  });

  // Touch zones
  const touchRoot = document.getElementById('touch');
  const activeTouches = new Map(); // touchId -> btn

  function btnFromTarget(el) {
    while (el && el !== touchRoot) {
      if (el.dataset && el.dataset.btn) return el.dataset.btn;
      el = el.parentElement;
    }
    return null;
  }

  function refreshTouchButtons() {
    const held = new Set(activeTouches.values());
    for (const btn of ['left', 'right', 'jump', 'down', 'attack']) {
      const want = held.has(btn);
      if (want !== down[btn]) set(btn, want, 'touch');
    }
  }

  if (touchRoot) {
    touchRoot.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const btn = btnFromTarget(document.elementFromPoint(t.clientX, t.clientY));
        if (btn) activeTouches.set(t.identifier, btn);
      }
      refreshTouchButtons();
    }, { passive: false });

    touchRoot.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const btn = btnFromTarget(document.elementFromPoint(t.clientX, t.clientY));
        if (btn) activeTouches.set(t.identifier, btn);
        else activeTouches.delete(t.identifier);
      }
      refreshTouchButtons();
    }, { passive: false });

    const end = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) activeTouches.delete(t.identifier);
      refreshTouchButtons();
    };
    touchRoot.addEventListener('touchend', end, { passive: false });
    touchRoot.addEventListener('touchcancel', end, { passive: false });
  }

  /** Release every virtual-pad button (e.g. when the pad is hidden mid-hold). */
  function releaseTouchButtons() {
    if (activeTouches.size === 0) return;
    activeTouches.clear();
    refreshTouchButtons();
  }

  // --- Canvas taps (title / difficulty / results) ---
  // One-shot: queued by the DOM event, exposed for exactly one frame via
  // pressed.tap + tapX/tapY (game space 320×200), cleared in beginFrame.
  const canvas = document.getElementById('game');
  let _tapEdge = false;
  let _tapX = 0;
  let _tapY = 0;
  const tap = { x: 0, y: 0 };

  function queueTap(clientX, clientY) {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const gx = ((clientX - r.left) / r.width) * GAME_W;
    const gy = ((clientY - r.top) / r.height) * GAME_H;
    _tapX = Math.max(0, Math.min(GAME_W - 1, gx));
    _tapY = Math.max(0, Math.min(GAME_H - 1, gy));
    _tapEdge = true;
  }

  if (canvas) {
    if (window.PointerEvent) {
      // pointerdown covers touch, mouse and pen without synthetic duplicates.
      canvas.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        queueTap(e.clientX, e.clientY);
      });
    } else {
      // Legacy fallback: touchstart (preventDefault suppresses compat mouse events) + mousedown.
      canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        if (t) queueTap(t.clientX, t.clientY);
      }, { passive: false });
      canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        queueTap(e.clientX, e.clientY);
      });
    }
  }

  return {
    down,
    /** Device of the latest press per button ('key' | 'touch'); currently jump only. */
    source,
    /** Game-space position of this frame's tap (valid when pressed.tap). */
    tap,
    /**
     * Show/hide the #touch virtual pad (menus hide it so it can't steal taps).
     * Hiding also releases any held pad buttons so nothing stays stuck.
     */
    setTouchPadVisible(visible) {
      document.body.classList.toggle('menu-mode', !visible);
      if (!visible) releaseTouchButtons();
    },
    /** Call once per frame after reading; copies edges then clears. */
    beginFrame() {
      for (const k of Object.keys(pressed)) {
        pressed[k] = _edge[k];
        _edge[k] = false;
      }
      pressed.tap = _tapEdge;
      tap.x = _tapX;
      tap.y = _tapY;
      _tapEdge = false;
    },
    pressed,
  };
}
