// Centralized input state for keyboard and mouse.
//
// Keys are tracked as a live "down" set plus per-frame "pressed" / "released"
// edge sets. Call `endFrame()` once at the end of each rendered frame to clear
// the edge sets. Mouse position is stored in canvas pixel coordinates.

export function createInput(canvas) {
  const down = new Set();
  const pressed = new Set();
  const released = new Set();

  const mouse = { x: 0, y: 0, left: false, right: false };
  const mousePressed = { left: false, right: false };

  // Map physical keys to logical action names for convenience.
  const ACTIONS = {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    dash: ['Space', 'ShiftLeft', 'ShiftRight'],
    light: ['KeyJ'],
    heavy: ['KeyK'],
    confirm: ['Enter', 'Space'],
    pause: ['Escape', 'KeyP'],
  };

  function onKeyDown(e) {
    // Avoid the page scrolling when using space/arrows to play.
    if (
      ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)
    ) {
      e.preventDefault();
    }
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
  }

  function onKeyUp(e) {
    down.delete(e.code);
    released.add(e.code);
  }

  function updateMouse(e) {
    const rect = canvas.getBoundingClientRect();
    // Account for CSS scaling of the canvas element.
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    mouse.x = (e.clientX - rect.left) * scaleX;
    mouse.y = (e.clientY - rect.top) * scaleY;
  }

  function onMouseMove(e) {
    updateMouse(e);
  }

  function onMouseDown(e) {
    updateMouse(e);
    if (e.button === 0) {
      if (!mouse.left) mousePressed.left = true;
      mouse.left = true;
    }
    if (e.button === 2) {
      if (!mouse.right) mousePressed.right = true;
      mouse.right = true;
    }
  }

  function onMouseUp(e) {
    if (e.button === 0) mouse.left = false;
    if (e.button === 2) mouse.right = false;
  }

  function onContextMenu(e) {
    e.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', onContextMenu);

  const anyOf = (set, codes) => codes.some((c) => set.has(c));

  return {
    mouse,

    // Held this frame.
    isDown: (action) => anyOf(down, ACTIONS[action] ?? [action]),
    // Went down this frame (rising edge).
    wasPressed: (action) => anyOf(pressed, ACTIONS[action] ?? [action]),
    // Went up this frame (falling edge).
    wasReleased: (action) => anyOf(released, ACTIONS[action] ?? [action]),

    mousePressed: (button = 'left') => mousePressed[button],

    // Clear per-frame edge state. Call after each rendered frame.
    endFrame() {
      pressed.clear();
      released.clear();
      mousePressed.left = false;
      mousePressed.right = false;
    },

    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
  };
}
