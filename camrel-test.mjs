// Camera system (simplified): proves the ONE behaviour —
//  (a) camera-relative movement: joystick "forward" goes along the camera's facing,
//  (b) automatic chase camera: it ends up behind the heading for any direction.
// (Drag-to-look and Classic mode were removed; no longer tested.)
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(500);

// (a) camera-relative movement under a fixed camera yaw
const moveAtYaw = (yaw) => p.evaluate(async (yaw) => {
  const g = window.__ROS.game;
  g.startLevel(0); g.cinematic = null; g.controlLocked = false; g.paused = false; g.running = true;
  g.camYaw = yaw; g.player.invuln = 1e9;
  const orig = g.input.read.bind(g.input);
  g.input.read = () => ({ x: 0, z: 1, len: 1, sprint: false }); // hold "forward"
  const p0 = { x: g.player.pos.x, z: g.player.pos.z };
  await new Promise((r) => setTimeout(r, 450));
  const p1 = { x: g.player.pos.x, z: g.player.pos.z };
  g.input.read = orig;
  // expected world dir for "forward" at this yaw = camForward = (sin yaw, cos yaw)
  const dx = p1.x - p0.x, dz = p1.z - p0.z, d = Math.hypot(dx, dz) || 1;
  const dot = (dx / d) * Math.sin(yaw) + (dz / d) * Math.cos(yaw);
  return { errDeg: +(Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI).toFixed(1) };
}, yaw);

// (b) auto chase camera ends behind the movement heading
const behind = await p.evaluate(() => {
  const g = window.__ROS.game;
  g.startLevel(0); g.cinematic = null; g.controlLocked = false; g.paused = true;
  const out = {};
  for (const [name, yaw] of Object.entries({ '+Z': 0, '+X': Math.PI / 2, '-Z': Math.PI, '-X': -Math.PI / 2 })) {
    g.camYaw = yaw - 0.6; g.player.pos.set(0, 0.2, 0);
    const mv = { x: Math.sin(yaw), z: Math.cos(yaw), len: 1 };
    for (let i = 0; i < 180; i++) g._updateCamera(1 / 60, mv);
    const cp = g.camera.position, fwd = [Math.sin(yaw), Math.cos(yaw)];
    const bx = g.player.pos.x - cp.x, bz = g.player.pos.z - cp.z, bl = Math.hypot(bx, bz);
    const dot = (bx / bl) * fwd[0] + (bz / bl) * fwd[1];
    out[name] = +(Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI).toFixed(1);
  }
  return out;
});

const out = {
  camRel_yaw0: await moveAtYaw(0),
  camRel_yaw90: await moveAtYaw(Math.PI / 2),
  camRel_yawNeg90: await moveAtYaw(-Math.PI / 2),
  autoChaseBehindDeg: behind,
  noDragHandler: await p.evaluate(() => typeof window.__ROS.game._initCameraControls === 'undefined'),
};
console.log('===CAMREL_TEST_JSON===');
console.log(JSON.stringify(out, null, 2));
await b.close();
