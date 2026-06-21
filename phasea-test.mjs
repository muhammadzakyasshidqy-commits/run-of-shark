// Phase A: dive intro plays -> control returns; shark chases from the start (spawns behind);
// win = reach submarine with ZERO coins collected (no coin gate); sub->ship cutscene then win.
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(500);

const out = await p.evaluate(async () => {
  const g = window.__ROS.game; const dt = 1 / 60;
  g.startLevel(0); // Level 1
  const r = {};
  r.objectiveText = g.level.objectiveText;
  r.startState = g.level.state;                 // should be 'escape' (chase), not 'collect'
  r.diveIntroActive = !!g.cinematic && g.controlLocked;
  // run the dive intro to completion
  let guard = 0; while (g.cinematic && guard < 600) { g.cinematic(dt); guard++; }
  r.controlAfterIntro = g.controlLocked;        // false
  r.playerZAfterDive = +g.player.pos.z.toFixed(1);

  // now drive the chase manually (paused) — DO NOT collect any coins
  g.paused = true; const pl = g.player; pl.invuln = 1e9;
  const coinsBefore = g.level.collected;
  let firstSharkZ = null, sharkSeenBy = null;
  for (let f = 0; f < 240; f++) { // ~4s
    g.level.update(dt, pl);
    if (g.level.sharks.length && firstSharkZ === null) { firstSharkZ = +g.level.sharks[0].pos.z.toFixed(1); sharkSeenBy = +(f * dt).toFixed(1); }
  }
  r.sharkSpawned = g.level.sharks.length > 0;
  r.sharkSpawnedAtSec = sharkSeenBy;
  r.sharkBehindStart = firstSharkZ !== null && firstSharkZ < r.playerZAfterDive; // spawned behind the dive point
  r.coinsCollected = g.level.collected - coinsBefore;

  // reach the submarine WITHOUT collecting coins -> level.update must return 'win'
  const sub = g.level.submarine.position;
  let res = null;
  for (let f = 0; f < 300 && res !== 'win'; f++) { pl.pos.x = sub.x; pl.pos.z = sub.z; pl.alive = true; res = g.level.update(dt, pl); }
  r.wonByReachingSub = res === 'win';
  r.wonWithZeroCoins = (g.level.collected === 0);
  return r;
});

console.log('===PHASEA_TEST_JSON===');
console.log(JSON.stringify({ ...out, errors: errs }, null, 2));
await b.close();
