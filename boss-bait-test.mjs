// Step 2 acceptance: boss is consistently beatable when the player BAITS correctly,
// but lands almost no hits when playing "asal" (no baiting). Also confirms an aim
// telegraph appears during the telegraph state.
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(500);

const run = await p.evaluate(async () => {
  const g = window.__ROS.game; const dt = 1 / 60;
  const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  // SKILLED: bait the boss into the nearest hazard each cycle (charge/wave forward, roar behind)
  const skilled = () => {
    g.startLevel(4); g.cinematic = null; g.controlLocked = false; g.onCine(null); g.level.bossCtrl.begin(); g.paused = true;
    const c = g.level.bossCtrl, boss = g.level.boss, pl = g.player, Hs = g.level.hazards;
    let hits = 0, prev = boss.hp, frames = 0, sawAim = false;
    while (!c.defeated && frames < 9000 && pl.alive) {
      const hz = Hs.reduce((a, b) => (d(boss.pos, a.pos) < d(boss.pos, b.pos) ? a : b));
      const dirx = hz.pos.x - boss.pos.x, dz = hz.pos.z - boss.pos.z, L = Math.hypot(dirx, dz) || 1;
      if (c.state === 'idle' || c.state === 'recover' || c.state === 'frozen') { pl.pos.x = hz.pos.x; pl.pos.z = hz.pos.z - 2; }
      else if (c.state === 'telegraph') {
        if (c.aimLine && c.aimLine.visible) sawAim = true;
        if (c.attack === 'charge' || c.attack === 'wave') { pl.pos.x = boss.pos.x + (dirx / L) * (L - 2); pl.pos.z = boss.pos.z + (dz / L) * (L - 2); }
        else { pl.pos.x = boss.pos.x - (dirx / L) * 6; pl.pos.z = boss.pos.z - (dz / L) * 6; }
      } else { pl.pos.x += -c.lockDir.z * 3; pl.pos.z += c.lockDir.x * 3; }
      pl.invuln = 99; g.level.update(dt, pl);
      if (boss.hp < prev) { hits++; prev = boss.hp; }
      frames++;
    }
    return { defeated: c.defeated, hits, seconds: +(frames * dt).toFixed(1), sawAim };
  };

  // NAIVE: a clueless player with REAL HP (no invuln cheat) who just wanders and never
  // deliberately puts a rock behind them. Should mostly die, landing few/no hits.
  const naive = () => {
    g.startLevel(4); g.cinematic = null; g.controlLocked = false; g.onCine(null); g.level.bossCtrl.begin(); g.paused = true;
    const c = g.level.bossCtrl, boss = g.level.boss, pl = g.player;
    let hits = 0, prev = boss.hp, frames = 0, res = null; const cap = 40 * 60;
    while (!c.defeated && frames < cap && !res) {
      // wander slowly near the spawn; do NOT bait, do NOT dodge cleverly
      const inp = { x: Math.sin(frames / 40) * 0.6, z: Math.cos(frames / 40) * 0.6, len: 0.6, sprint: false };
      pl.update(dt, inp, 'level');
      res = g.level.update(dt, pl);
      if (boss.hp < prev) { hits++; prev = boss.hp; }
      frames++;
    }
    return { hits, defeated: c.defeated, result: res, seconds: +(frames * dt).toFixed(1) };
  };

  // run naive a few times (movement is deterministic but boss attack picks are random)
  const naiveRuns = [naive(), naive(), naive()];
  return { skilled: skilled(), naiveRuns };
});

console.log('===BOSS_BAIT_JSON===');
console.log(JSON.stringify({ ...run, errors: errs }, null, 2));
await b.close();
