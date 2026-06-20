// Step 3 re-verification: per-level (L1-4) coral solid-blocking + L4 split routes.
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(500);

const rows = [];
for (let i = 0; i < 4; i++) {
  const row = await p.evaluate((i) => {
    const g = window.__ROS.game;
    g.startLevel(i); g.cinematic = null; g.controlLocked = false; g.paused = true;
    const lvl = g.level, pl = g.player, dt = 1 / 60;
    const corals = lvl.solids.filter((s) => s.type === 'circle');
    const expectStop = corals.length ? corals[0].r + lvl.playerRadius : null; // 0.75 + 0.5 = 1.25
    let minDist = null, penetrated = null;
    if (corals.length) {
      const c = corals[0];
      pl.pos.set(c.pos.x - 6, 0.2, c.pos.z);          // approach head-on, drive THROUGH
      const dists = [];
      for (let f = 0; f < 200; f++) { pl.pos.x += 9 * dt; lvl.resolveCollisions(pl); dists.push(Math.hypot(pl.pos.x - c.pos.x, pl.pos.z - c.pos.z)); }
      minDist = +Math.min(...dists).toFixed(3);
      penetrated = minDist < expectStop - 0.06;
    }
    return { id: lvl.def.id, name: lvl.def.name, coralCount: corals.length, coralRadius: corals[0] && corals[0].r, expectStop, minDist, penetrated };
  }, i);
  rows.push(row);
}

// L4 split: both lanes completable + centre blocked
const split = await p.evaluate(async () => {
  const g = window.__ROS.game;
  const drive = (startX, viaX) => {
    g.startLevel(3); g.cinematic = null; g.controlLocked = false; g.paused = true;
    const lvl = g.level, pl = g.player, dt = 1 / 60;
    lvl.state = 'escape'; lvl.collected = lvl.def.coinsToWin; lvl.sharks.forEach((s) => (s.active = false));
    pl.hp = 99; pl.invuln = 1e9; const sub = lvl.submarine.position;
    pl.pos.set(startX, 0.2, -50); const wps = [[viaX, 80], [sub.x, sub.z]]; let wp = 0, res = null;
    for (let f = 0; f < 3000 && !res; f++) {
      const [tx, tz] = wps[Math.min(wp, wps.length - 1)];
      const dx = tx - pl.pos.x, dz = tz - pl.pos.z, d = Math.hypot(dx, dz) || 1;
      pl.pos.x += (dx / d) * 12 * dt; pl.pos.z += (dz / d) * 12 * dt;
      if (d < 2 && wp < wps.length - 1) wp++;
      res = lvl.update(dt, pl);
    }
    return res;
  };
  // centre block probe
  g.startLevel(3); g.cinematic = null; g.controlLocked = false; g.paused = true;
  const lvl = g.level, pl = g.player, dt = 1 / 60;
  const box = lvl.solids.find((s) => s.type === 'box');
  pl.pos.set(0, 0.2, box.pos.z - box.hz - 4); let tunneled = false;
  for (let f = 0; f < 600; f++) { pl.pos.z += 10 * dt; pl.pos.x = 0; lvl.resolveCollisions(pl); if (Math.abs(pl.pos.x) < box.hx && pl.pos.z > box.pos.z + box.hz) tunneled = true; }
  return { hasDivider: !!box, dividerHalfX: box && box.hx, centreTunneled: tunneled, leftLane: drive(-18, -18), rightLane: drive(18, 18) };
});

console.log('===CORALSPLIT_JSON===');
console.log(JSON.stringify({ rows, split, errors: errs }, null, 2));
await b.close();
