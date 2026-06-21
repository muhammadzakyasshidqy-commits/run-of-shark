// Input — unified movement from keyboard (desktop) + virtual joystick (touch).
// read() returns a WORLD-SPACE vector {x, z} already aligned to the (fixed) camera,
// so callers move the player directly without touching camera state.
//
// Why world-space + fixed mapping: the follow camera has a constant orientation
// (fixed offset, fixed look direction, no yaw), so there is no camera->input
// feedback loop. We map screen intent to world once, with correct signs:
//   screen-up    -> +Z (away from camera / "forward")
//   screen-right -> -X (camera viewer-right = cross(forward,up) = -X here)
const RADIUS = 50;     // joystick travel radius in px
const DEADZONE = 0.15; // inner 15% of the stick is treated as neutral (kills jitter)

export class Input {
  constructor(uiRoot, settings = {}) {
    this.settings = settings;       // { joySensitivity, invertY } — read live each frame
    this.sprint = false;
    this.keys = new Set();
    this._sx = 0;                   // stick X, screen-right positive, deadzone-corrected
    this._sy = 0;                   // stick Y, screen-UP positive, deadzone-corrected
    this._joyActive = false;
    this._joyId = null;

    this._touchSeen = false;        // becomes true once any real touch occurs (hybrid devices)
    this._mouseDrag = null;         // {ox, oy} for desktop pointer-drag-to-move

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      if (e.key === 'Shift') this.sprint = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      if (e.key === 'Shift') this.sprint = false;
    });
    window.addEventListener('touchstart', () => { if (!this._touchSeen) { this._touchSeen = true; if (this._touchWanted) this.setTouchVisible(true); } }, { passive: true, capture: true });

    this._buildTouch(uiRoot);
    this._initMouseDrag();
  }

  // Robust touch detection: media query OR touch event support OR touch points OR a touch
  // already seen. Covers phones, tablets/iPad, and hybrid laptops where one signal lies.
  _isTouchCapable() {
    try {
      return matchMedia('(hover: none), (pointer: coarse)').matches ||
        ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0 || this._touchSeen;
    } catch { return this._touchSeen; }
  }

  // Desktop fallback: drag with the MOUSE/pen anywhere on the play area to move (for laptops
  // without a keyboard). Touch is handled by the on-screen joystick instead, so we ignore
  // pointerType 'touch' and any press that lands on a UI control.
  _initMouseDrag() {
    const onDown = (e) => {
      if (e.pointerType === 'touch') return;
      if (e.target && e.target.closest && e.target.closest('.btn,.screen,.card,.joystick,.sprint-btn,.item,.list')) return;
      this._mouseDrag = { ox: e.clientX, oy: e.clientY };
    };
    const onMove = (e) => {
      if (!this._mouseDrag || e.pointerType === 'touch') return;
      this._applyStick(e.clientX - this._mouseDrag.ox, e.clientY - this._mouseDrag.oy);
    };
    const onUp = () => { if (this._mouseDrag) { this._mouseDrag = null; this._sx = 0; this._sy = 0; if (this.nub) this.nub.style.transform = 'translate(0,0)'; } };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  // Convert a raw pixel offset from the stick centre into deadzone-corrected
  // stick components (_sx right+, _sy up+). Exposed for automated testing.
  _applyStick(dx, dy) {
    const len = Math.hypot(dx, dy);
    if (len === 0) { this._sx = 0; this._sy = 0; this.nub.style.transform = 'translate(0,0)'; return; }
    const cl = Math.min(len, RADIUS);
    // nub visual
    this.nub.style.transform = `translate(${(dx / len) * cl}px, ${(dy / len) * cl}px)`;
    const mag = cl / RADIUS;                 // 0..1
    if (mag < DEADZONE) { this._sx = 0; this._sy = 0; return; }
    // ramp magnitude from 0 at the deadzone edge to 1 at the rim (smooth, no snap)
    const ramp = (mag - DEADZONE) / (1 - DEADZONE);
    const ux = dx / len, uy = dy / len;      // unit direction (screen space, uy down+)
    this._sx = ux * ramp;
    this._sy = -uy * ramp;                   // invert screen-Y so pushing UP is positive
  }

  _buildTouch(uiRoot) {
    const joy = document.createElement('div');
    joy.className = 'joystick hidden';
    joy.id = 'joystick';
    const nub = document.createElement('div');
    nub.className = 'nub';
    joy.appendChild(nub);

    const sprintBtn = document.createElement('div');
    sprintBtn.className = 'sprint-btn hidden';
    sprintBtn.id = 'sprint-btn';
    sprintBtn.textContent = 'SPRINT';

    uiRoot.appendChild(joy);
    uiRoot.appendChild(sprintBtn);
    this.joy = joy; this.nub = nub; this.sprintBtn = sprintBtn;

    joy.addEventListener('touchstart', (e) => {
      this._joyActive = true;
      this._joyId = e.changedTouches[0].identifier;
      this._moveFrom(e.changedTouches[0]);
      e.preventDefault();
    }, { passive: false });

    const moveHandler = (e) => {
      if (!this._joyActive) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== this._joyId) continue;
        this._moveFrom(t);
      }
      e.preventDefault();
    };
    joy.addEventListener('touchmove', moveHandler, { passive: false });

    const endHandler = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._joyId) continue;
        this._joyActive = false; this._joyId = null;
        this._sx = 0; this._sy = 0;
        nub.style.transform = 'translate(0,0)';
      }
    };
    joy.addEventListener('touchend', endHandler);
    joy.addEventListener('touchcancel', endHandler);

    sprintBtn.addEventListener('touchstart', (e) => { this.sprint = true; e.preventDefault(); }, { passive: false });
    sprintBtn.addEventListener('touchend', () => { this.sprint = false; });
  }

  _moveFrom(t) {
    const rect = this.joy.getBoundingClientRect();
    this._applyStick(t.clientX - (rect.left + rect.width / 2), t.clientY - (rect.top + rect.height / 2));
  }

  setTouchVisible(v) {
    this._touchWanted = v;
    const show = v && this._isTouchCapable();
    this.joy.classList.toggle('hidden', !show);
    this.sprintBtn.classList.toggle('hidden', !show);
  }

  // Returns a normalized WORLD-SPACE movement vector combining keyboard + joystick.
  read() {
    const sens = this.settings.joySensitivity ?? 1;
    const invertY = !!this.settings.invertY;

    let sx = this._sx, sy = this._sy;        // stick: right+, up+
    if (this.keys.has('w') || this.keys.has('arrowup')) sy += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) sy -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) sx += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) sx -= 1;

    sx *= sens; sy *= sens;
    if (invertY) sy = -sy;

    let len = Math.hypot(sx, sy);
    if (len > 1) { sx /= len; sy /= len; len = 1; }

    // Map screen intent -> world (camera fixed): screen-right = -X, screen-up = +Z.
    return { x: -sx, z: sy, len, sprint: this.sprint };
  }
}
