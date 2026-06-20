// Reproduces the bug scenario through the REAL game loop (rAF), not a hand-rewrite:
//  (A) CONSTANT diagonal stick held ~2.5s -> player must walk a STRAIGHT line
//      (path collinear) and heading must CONVERGE (stop changing). Old code spun.
//  (B) SHARP turn (up -> hard left) -> heading settles without big overshoot.
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(500);

// (A) constant input -> straight line + heading convergence
const A = await p.evaluate(async () => {
  const g = window.__ROS.game;
  g.startLevel(0); g.cinematic = null; g.controlLocked = false; g.paused = false; g.running = true;
  g.player.invuln = 1e9; g.camYaw = 0;
  g.input.read = () => ({ x: 0.7, z: 0.7, len: 0.99, sprint: false }); // CONSTANT diagonal
  const pts = [], heads = [];
  const t0 = performance.now();
  await new Promise((res) => {
    const tick = () => {
      pts.push([g.player.pos.x, g.player.pos.z]);
      heads.push(g.player.mesh.rotation.y);
      if (performance.now() - t0 < 2500) requestAnimationFrame(tick); else res();
    };
    requestAnimationFrame(tick);
  });
  // straightness: max perpendicular distance of mid path from the line start->end
  const a = pts[Math.floor(pts.length * 0.3)], e = pts[pts.length - 1]; // ignore initial settle
  const vx = e[0] - a[0], vz = e[1] - a[1], L = Math.hypot(vx, vz) || 1;
  let maxPerp = 0;
  for (let i = Math.floor(pts.length * 0.3); i < pts.length; i++) {
    const px = pts[i][0] - a[0], pz = pts[i][1] - a[1];
    const perp = Math.abs((px * vz - pz * vx) / L);
    if (perp > maxPerp) maxPerp = perp;
  }
  // heading change over the LAST second (should be ~0)
  const last = heads.slice(Math.floor(heads.length * 0.6));
  const dHead = (a2, b2) => { let d = b2 - a2; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };
  const headDriftDeg = +(dHead(last[0], last[last.length - 1]) * 180 / Math.PI).toFixed(2);
  return { travelDist: +L.toFixed(1), maxPerpDeviation: +maxPerp.toFixed(3), headDriftLastSecDeg: headDriftDeg };
});

// (B) sharp turn settles
const B = await p.evaluate(async () => {
  const g = window.__ROS.game;
  g.startLevel(0); g.cinematic = null; g.controlLocked = false; g.paused = false; g.running = true;
  g.player.invuln = 1e9; g.camYaw = 0;
  let dir = { x: 0, z: 1 };
  g.input.read = () => ({ x: dir.x, z: dir.z, len: 1, sprint: false });
  const run = (ms) => new Promise((res) => { const t0 = performance.now(); const tk = () => (performance.now() - t0 < ms ? requestAnimationFrame(tk) : res()); requestAnimationFrame(tk); });
  await run(700);                       // go up
  dir = { x: -1, z: 0 };                // hard left
  const heads = [];
  const t0 = performance.now();
  await new Promise((res) => { const tk = () => { heads.push(g.camYaw); if (performance.now() - t0 < 1500) requestAnimationFrame(tk); else res(); }; requestAnimationFrame(tk); });
  const deg = (r) => r * 180 / Math.PI;
  const final = heads[heads.length - 1];
  // overshoot = how far past the final value it swung
  let maxOver = 0;
  for (const h of heads) { const o = Math.abs(deg(h)) - Math.abs(deg(final)); if (o > maxOver) maxOver = o; }
  return { settleYawDeg: +deg(final).toFixed(1), overshootDeg: +maxOver.toFixed(1) };
});

console.log('===CAMSTAB_TEST_JSON===');
console.log(JSON.stringify({ A, B }, null, 2));
await b.close();
