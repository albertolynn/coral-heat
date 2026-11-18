// Keyboard and mouse state: held keys as a set, one-frame action edges for
// the keys that trigger things (interact, pause, confirm), and the mouse
// position in logical view pixels. Menus read clicks through takeClicks();
// the game reads held keys and the mouse directly.

export const ACT_INTERACT = 1;
export const ACT_PAUSE = 2;
export const ACT_CONFIRM = 4;

const KEY_ACTIONS = {
  KeyF: ACT_INTERACT,
  KeyE: ACT_INTERACT,
  Escape: ACT_PAUSE,
  KeyP: ACT_PAUSE,
  Enter: ACT_CONFIRM,
};

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseX = 640;
  let mouseY = 360;
  let mouseDown = false;
  let clicks = [];

  window.addEventListener('keydown', (event) => {
    if (!event.repeat) {
      held.add(event.code);
      const action = KEY_ACTIONS[event.code];
      if (action) actions |= action;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = ((event.clientX - rect.left) / rect.width) * 1280;
    mouseY = ((event.clientY - rect.top) / rect.height) * 720;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouseDown = true;
      clicks.push({ x: mouseX, y: mouseY });
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Is a key (by KeyboardEvent.code) currently held? */
    down(code) {
      return held.has(code);
    },
    /** The movement axes from WASD and the arrow keys: -1, 0 or 1 each. */
    moveAxis() {
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
    /** Read and clear the one-frame action edges. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Read and clear the mouse clicks since the last call. */
    takeClicks() {
      const taken = clicks;
      clicks = [];
      return taken;
    },
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
  };
}
