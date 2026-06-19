// Browser integration test for the camera-relative LAYER + manual orbit drag.
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(500);

// Helper: start level, set mode + camYaw, feed a constant "forward" input, measure motion.
const moveUnder = async (mode, yaw) => p.evaluate(async ({ mode, yaw }) => {
  const g = window.__ROS.game;
  g.startLevel(0); g.cinematic = null; g.controlLocked = false; g.paused = false; g.running = true;
  g.save.data.settings.camMode = mode;
  g.camYaw = yaw; g._dragging = false; g._dragCooldown = 0;
  g.player.invuln = 1e9;
  const orig = g.input.read.bind(g.input);
  g.input.read = () => ({ x: 0, z: 1, len: 1, sprint: false }); // stick "forward"
  const p0 = { x: g.player.pos.x, z: g.player.pos.z };
  await new Promise((r) => setTimeout(r, 500));
  const p1 = { x: g.player.pos.x, z: g.player.pos.z };
  g.input.read = orig;
  return { dx: +(p1.x - p0.x).toFixed(2), dz: +(p1.z - p0.z).toFixed(2) };
}, { mode, yaw });

const out = {};
// Camera-relative: yaw 0 -> forward goes +Z ; yaw 90deg -> forward goes +X
out.camRel_yaw0 = await moveUnder('camera', 0);
out.camRel_yaw90 = await moveUnder('camera', Math.PI / 2);
out.camRel_yawNeg90 = await moveUnder('camera', -Math.PI / 2);
// Classic: passthrough world-fixed -> forward always +Z regardless of yaw
out.classic_yaw90 = await moveUnder('classic', Math.PI / 2);

// Manual orbit drag: real mouse drag on the canvas should change yaw + clamp pitch.
out.drag = await p.evaluate(() => ({ before: { yaw: +window.__ROS.game.camYaw.toFixed(3), pitch: +window.__ROS.game.camPitch.toFixed(3) } }));
await p.evaluate(() => {
  const g = window.__ROS.game; g.startLevel(0); g.running = true; g.paused = false; g.camYaw = 0; g.camPitch = 0.66;
  document.getElementById('ui-root').style.display = 'none'; // real game clears the menu via UI.startLevel; we bypassed it
});
const box = await p.$eval('#game-canvas', (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await p.mouse.move(box.x, box.y);
await p.mouse.down();
await p.mouse.move(box.x + 160, box.y + 400, { steps: 10 }); // drag right + far down (test pitch clamp)
await p.mouse.up();
await sleep(50);
out.dragAfter = await p.evaluate(() => ({ yaw: +window.__ROS.game.camYaw.toFixed(3), pitch: +window.__ROS.game.camPitch.toFixed(3), max: window.__ROS.game.camMaxPitch }));

console.log('===CAMREL_TEST_JSON===');
console.log(JSON.stringify(out, null, 2));
await b.close();
