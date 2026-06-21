// Phase G: per-device-class control test (phone / iPad / desktop).
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const URL = 'http://localhost:5173/';

async function runDevice(name, ctxOpts, kind) {
  const ctx = await browser.newContext(ctxOpts);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await sleep(500);
  // enter a level so the joystick should show (on touch) and movement is live
  await p.evaluate(() => { window.__ROS.game.enterHub(); });
  await sleep(600);
  const joyShown = await p.evaluate(() => { const j = document.getElementById('joystick'); return j && !j.classList.contains('hidden') && getComputedStyle(j).display !== 'none'; });

  let moved = 0;
  if (kind === 'touch') {
    // tap-drag the on-screen joystick upward
    await p.evaluate(() => { const g = window.__ROS.game; g.startLevel(0); g.cinematic = null; g.controlLocked = false; });
    await sleep(300);
    moved = await p.evaluate(async () => {
      const g = window.__ROS.game, inp = g.input;
      const z0 = g.player.pos.z;
      // simulate joystick push via the real _applyStick path (up)
      for (let i = 0; i < 60; i++) { inp._applyStick(0, -40); g.player.update(1/60, inp.read(), 'level'); }
      return +(g.player.pos.z - z0).toFixed(2);
    });
  } else {
    // desktop: keyboard W then mouse-drag
    await p.evaluate(() => { const g = window.__ROS.game; g.startLevel(0); g.cinematic = null; g.controlLocked = false; g.paused = true; });
    await sleep(200);
    const kbd = await p.evaluate(async () => {
      const g = window.__ROS.game; const z0 = g.player.pos.z;
      g.input.keys.add('w'); for (let i = 0; i < 60; i++) g.player.update(1/60, g.input.read(), 'level'); g.input.keys.delete('w');
      return +(g.player.pos.z - z0).toFixed(2);
    });
    const mouse = await p.evaluate(async () => {
      const g = window.__ROS.game; g.input._mouseDrag = { ox: 400, oy: 400 }; g.input._applyStick(0, -40); // drag up
      const z0 = g.player.pos.z; for (let i = 0; i < 60; i++) g.player.update(1/60, g.input.read(), 'level');
      g.input._mouseDrag = null; g.input._applyStick(0, 0);
      return +(g.player.pos.z - z0).toFixed(2);
    });
    moved = { kbd, mouse };
  }
  await ctx.close();
  return { name, joyShown, moved, errors: errs.length };
}

const out = [];
out.push(await runDevice('Phone ~380', { viewport: { width: 380, height: 780 }, hasTouch: true, isMobile: true }, 'touch'));
out.push(await runDevice('iPad ~820', { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }, 'touch'));
out.push(await runDevice('Desktop', { viewport: { width: 1280, height: 800 }, hasTouch: false }, 'desktop'));
console.log('===DEVICE_TEST_JSON===');
console.log(JSON.stringify(out, null, 2));
await browser.close();
