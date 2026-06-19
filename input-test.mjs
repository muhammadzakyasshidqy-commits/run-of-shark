// Verifies the joystick fix with NUMBERS, not vibes:
//  A) constant "up" stick -> player Z increases monotonically (no reversal)
//  B) sub-deadzone jitter near centre -> ZERO movement (no oscillation)
//  C) above-deadzone jitter same direction -> still monotonic (no reversal)
//  D) debug unlock visible only with ?debug=1; progression untouched
//  E) invert-Y + sensitivity settings take effect
import { chromium } from 'playwright';
const URL = 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'networkidle' });
await sleep(500);

// Drive the REAL input path (_applyStick -> read) + player.update, recording positions.
const move = await page.evaluate(async () => {
  const g = window.__ROS.game;
  g.startLevel(0);
  g.cinematic = null; g.controlLocked = false; g.paused = true; // step manually
  const p = g.player, input = g.input, dt = 1 / 60;
  const run = (apply, frames) => {
    const zs = [], xs = [];
    for (let i = 0; i < frames; i++) {
      apply(i);
      p.update(dt, input.read());
      zs.push(+p.pos.z.toFixed(4)); xs.push(+p.pos.x.toFixed(4));
    }
    return { zs, xs };
  };
  const monotonic = (a) => { let up = true, down = true; for (let i = 1; i < a.length; i++) { if (a[i] < a[i - 1] - 1e-6) up = false; if (a[i] > a[i - 1] + 1e-6) down = false; } return { up, down, total: +(a[a.length - 1] - a[0]).toFixed(3) }; };

  // reset pos to mid-arena each run
  const reset = () => p.pos.set(0, 0.2, 0);

  // A) hold UP (finger above centre => dy negative)
  reset();
  const A = run(() => input._applyStick(0, -40), 120);

  // B) sub-deadzone jitter near centre (|offset| < 7.5px)
  reset();
  const B = run((i) => input._applyStick((i % 2 ? 3 : -4), (i % 2 ? -2 : 3)), 120);

  // C) above-deadzone, same UP direction but jittery magnitude
  reset();
  const C = run((i) => input._applyStick((i % 2 ? 2 : -2), (i % 2 ? -22 : -30)), 120);

  // E) sensitivity High vs Low total distance over same frames + invertY flips sign
  reset(); g.save.data.settings.joySensitivity = 0.6; g.save.data.settings.invertY = false;
  const low = run(() => input._applyStick(0, -40), 60);
  reset(); g.save.data.settings.joySensitivity = 1.5;
  const high = run(() => input._applyStick(0, -40), 60);
  reset(); g.save.data.settings.joySensitivity = 1; g.save.data.settings.invertY = true;
  const inv = run(() => input._applyStick(0, -40), 60);
  g.save.data.settings.invertY = false;

  return {
    A_up: monotonic(A.zs), A_zDelta: +(A.zs[A.zs.length - 1] - A.zs[0]).toFixed(3),
    B_zMoved: +(B.zs[B.zs.length - 1] - B.zs[0]).toFixed(4), B_xMoved: +(B.xs[B.xs.length - 1] - B.xs[0]).toFixed(4),
    C_up: monotonic(C.zs),
    E_lowDist: +(low.zs[low.zs.length - 1] - low.zs[0]).toFixed(3),
    E_highDist: +(high.zs[high.zs.length - 1] - high.zs[0]).toFixed(3),
    E_invertSign: +(inv.zs[inv.zs.length - 1] - inv.zs[0]).toFixed(3),
  };
});

// D) debug unlock — check level select with and without ?debug=1
const dbg = await page.evaluate(() => {
  // simulate normal player: highestLevel = 1
  window.__ROS.save.data.highestLevel = 1;
  window.__ROS.ui.debugUnlock = false;
  window.__ROS.ui.showLevels();
  const normalPlayable = [...document.querySelectorAll('.item')].map((it) => !!it.querySelector('.btn'));
  window.__ROS.ui.debugUnlock = true;
  window.__ROS.ui.showLevels();
  const debugPlayable = [...document.querySelectorAll('.item')].map((it) => !!it.querySelector('.btn'));
  const savedHighest = window.__ROS.save.data.highestLevel; // must be unchanged
  return { normalPlayable, debugPlayable, savedHighest };
});

console.log('===INPUT_TEST_JSON===');
console.log(JSON.stringify({ move, dbg }, null, 2));
await browser.close();
