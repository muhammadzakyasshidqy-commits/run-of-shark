// Area B: per-level gameplay audit. For each level: can we WIN (dodging bot)? does LOSE fire?
// can the player get STUCK (wedged at a wall/corner/coral)? do sharks/boss get AI-STUCK (frozen)?
import { chromium } from 'playwright';
const PORT = process.argv[2] || '5177';
const b = await chromium.launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await p.evaluate(async () => { const m = await import('/src/assets/Assets.js'); await m.loadAssets(); });
await new Promise(r => setTimeout(r, 400));

const report = await p.evaluate(async () => {
  const g = window.__ROS.game; const s = window.__ROS.economy.s;
  s.upgrades = { speed: 4, resistance: 3 }; s.equippedVehicle = 'jetski'; s.ownedVehicles = ['jetski'];
  const dt = 1 / 60;
  const out = [];
  const goalOf = () => (g.level.car || g.level.submarine);

  for (let idx = 0; idx < 6; idx++) {
    const row = { level: idx + 1 };
    // ---------- WIN run (dodging bot) ----------
    g.startLevel(idx); g.cinematic = null; g.controlLocked = false; g.paused = false;
    if (idx === 4) g.player.pos.set(0, 0.2, 60); // boss arena: stand in arena
    else g.player.pos.set(0, 1.3, -60);
    let T = 0, result = null;
    const goal = goalOf();
    for (let i = 0; i < 60 * 50; i++) {
      // head toward goal, weave from nearest shark
      const gx = goal.position.x, gz = goal.position.z;
      let dx = gx - g.player.pos.x, dz = gz - g.player.pos.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      let ax = 0, az = 0; let nd = 1e9, near = null;
      for (const sh of (g.level.sharks || [])) { const d = Math.hypot(sh.pos.x - g.player.pos.x, sh.pos.z - g.player.pos.z); if (d < nd) { nd = d; near = sh; } }
      if (near && nd < 9) { ax = g.player.pos.x < near.pos.x ? -1.2 : 1.2; }
      let ix = dx + ax, iz = dz + az; const il = Math.hypot(ix, iz) || 1;
      g.player.update(dt, { x: ix / il, z: iz / il, len: 1, sprint: true }, 'level');
      g.effects.update(dt, T);
      const r = g.level.update(dt, g.player); T += dt;
      if (r === 'win') { result = 'win'; break; }
      if (r === 'lose') { result = 'lose'; break; }
      if (idx === 4 && T > 25) { result = 'boss-timeout(see boss-bait-test)'; break; }
    }
    row.win = result; row.winTime = +T.toFixed(1);

    // ---------- LOSE check: stand still next to a shark, expect to be caught ----------
    g.startLevel(idx); g.cinematic = null; g.controlLocked = false;
    g.player.pos.set(0, 1.3, 0); g.player.hp = 1; g.player.invuln = 0;
    let lost = false;
    for (let i = 0; i < 60 * 20; i++) {
      // do not move; pull a shark onto us
      if (g.level.sharks && g.level.sharks[0]) g.level.sharks[0].pos.set(0.5, -0.4, 0.5);
      g.player.update(dt, { x: 0, z: 0, len: 0, sprint: false }, 'level');
      if (g.level.update(dt, g.player) === 'lose') { lost = true; break; }
    }
    row.loseWorks = lost;

    // ---------- STUCK check: shove the player into the far +x/+z CORNER and into walls,
    // then push the other way and confirm they can still move (not permanently wedged) ----------
    g.startLevel(idx); g.cinematic = null; g.controlLocked = false;
    g.player.pos.set(118, 1.3, 100);
    for (let i = 0; i < 120; i++) g.player.update(dt, { x: 1, z: 1, len: 1, sprint: false }, 'level'); // jam into corner
    const jammed = { x: g.player.pos.x, z: g.player.pos.z };
    for (let i = 0; i < 120; i++) g.player.update(dt, { x: -1, z: -1, len: 1, sprint: false }, 'level'); // push back out
    const moved = Math.hypot(g.player.pos.x - jammed.x, g.player.pos.z - jammed.z);
    row.canEscapeCorner = moved > 5;
    row.posFinite = Number.isFinite(g.player.pos.x) && Number.isFinite(g.player.pos.z);

    // ---------- AI-stuck check: run sharks a while, ensure they keep moving ----------
    g.startLevel(idx); g.cinematic = null; g.controlLocked = false;
    g.player.pos.set(0, 1.3, 40);
    const sh0 = (g.level.sharks && g.level.sharks[0]); let p0 = sh0 ? sh0.pos.clone() : null; let movedSum = 0;
    for (let i = 0; i < 60 * 6; i++) {
      g.player.update(dt, { x: Math.sin(i / 30), z: 1, len: 1, sprint: false }, 'level');
      g.level.update(dt, g.player);
      const sh = (g.level.sharks && g.level.sharks[0]);
      if (sh && p0) { movedSum += Math.hypot(sh.pos.x - p0.x, sh.pos.z - p0.z); p0 = sh.pos.clone(); }
    }
    row.sharkMoves = sh0 ? +(movedSum).toFixed(0) : 'n/a';
    out.push(row);
  }
  return out;
});
console.log(JSON.stringify({ report, errors: errs }, null, 2));
await b.close();
