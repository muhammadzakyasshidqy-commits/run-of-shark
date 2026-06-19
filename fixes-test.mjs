// Proves bug-1 (shark facing) and bug-2 (chase camera) with DEGREES, not adjectives.
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(500);

const deg = (r) => (r * 180) / Math.PI;

// ---- BUG 1: shark snout faces the actual movement direction (~0°, not 90/180) ----
const facing = await p.evaluate(() => {
  const g = window.__ROS.game;
  g.startLevel(2); g.cinematic = null; g.controlLocked = false; g.paused = true;
  const s = g.level._spawnShark ? (g.level._spawnShark('normal'), g.level.sharks.at(-1)) : null;
  const dirs = { '+Z': [0, 1], '+X': [1, 0], '-Z': [0, -1], '-X': [-1, 0], 'diag': [0.7, 0.7] };
  const res = {};
  for (const [name, [dx, dz]] of Object.entries(dirs)) {
    s._face(dx, dz);
    const ry = s.mesh.rotation.y;
    const facingVec = [Math.cos(ry), -Math.sin(ry)];           // local +X rotated onto XZ
    const mv = [dx, dz]; const ml = Math.hypot(...mv);
    const dot = (facingVec[0] * mv[0] + facingVec[1] * mv[1]) / ml;
    res[name] = +(Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI).toFixed(1);
  }
  // boss faceTarget too
  const bc = (() => { g.startLevel(4); g.cinematic = null; g.controlLocked = false; g.paused = true; return g.level.bossCtrl; })();
  const boss = g.level.boss; const bres = {};
  for (const [name, [dx, dz]] of Object.entries({ '+Z': [0, 1], '+X': [1, 0], '-X': [-1, 0] })) {
    bc.lockDir.set(dx, 0, dz); bc._faceTarget();
    const ry = boss.mesh.rotation.y; const fv = [Math.cos(ry), -Math.sin(ry)];
    const dot = fv[0] * dx + fv[1] * dz;
    bres[name] = +(Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI).toFixed(1);
  }
  return { sharkAngleErrDeg: res, bossAngleErrDeg: bres };
});

// ---- BUG 2: chase camera sits BEHIND the heading and is dynamic per direction ----
const cam = await p.evaluate(() => {
  const g = window.__ROS.game;
  g.startLevel(0); g.cinematic = null; g.controlLocked = false; g.paused = true;
  const p = g.player; const THREE = window.__ROS; // not needed
  const headings = { '+Z': 0, '+X': Math.PI / 2, '-Z': Math.PI, '-X': -Math.PI / 2 };
  const res = {}; const camPositions = {};
  for (const [name, yaw] of Object.entries(headings)) {
    p.mesh.rotation.y = yaw; g.camYaw = yaw - 0.6; // start slightly off so we test convergence
    p.pos.set(0, 0.2, 0);
    for (let i = 0; i < 180; i++) { p.mesh.rotation.y = yaw; g._chaseCamera(1 / 60, true); }
    const cp = g.camera.position; const fwd = [Math.sin(yaw), Math.cos(yaw)];
    // vector from camera to player (should align with the heading forward = "behind")
    const bx = p.pos.x - cp.x, bz = p.pos.z - cp.z, bl = Math.hypot(bx, bz);
    const dot = (bx / bl) * fwd[0] + (bz / bl) * fwd[1];
    res[name] = +(Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI).toFixed(1);
    camPositions[name] = [+cp.x.toFixed(1), +cp.z.toFixed(1)];
  }
  // dynamic check: camera offset differs across headings (not world-fixed)
  const uniq = new Set(Object.values(camPositions).map((v) => v.join(','))).size;
  return { behindAngleErrDeg: res, camPositions, distinctCamOffsets: uniq };
});

console.log('===FIXES_TEST_JSON===');
console.log(JSON.stringify({ facing, cam }, null, 2));
await b.close();
