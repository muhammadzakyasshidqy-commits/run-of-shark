// Step 6: reaching the car in L6 triggers a 3D escape cutscene (car moves, tsunami chases,
// player hidden, control locked) BEFORE the credits — not an instant text cut.
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(500);

const out = await p.evaluate(async () => {
  const g = window.__ROS.game; const dt = 1 / 60;
  g.startLevel(5); g.cinematic = null; g.controlLocked = false; g.paused = false; g.running = true;
  g.player.invuln = 1e9; g.player.alive = true;
  // drive onto the car to trigger 'win'
  const car = g.level.car; const r = { hasCar: !!car, hasBeam: !!(car && car.userData.beam) };
  let triggered = false, winCalled = false;
  const origWin = g.onWin; g.onWin = (i) => { winCalled = true; origWin && origWin(i); };
  for (let f = 0; f < 300 && !g.cinematic; f++) {
    g.player.pos.x = car.position.x; g.player.pos.z = car.position.z;
    // step one real frame by invoking the loop's update path manually is complex; instead
    // call level.update directly to get 'win', then the loop intercepts on next rAF.
    if (g.level.update(dt, g.player) === 'win') { g._escapeCutscene(); triggered = true; break; }
  }
  r.cutsceneStarted = triggered && !!g.cinematic;
  r.controlLocked = g.controlLocked;
  const carZ0 = car.position.z;
  const tsu = g.effects.tsunami; const tsuZ0 = tsu ? tsu.position.z : null;
  // advance well into the DRIVE phase (~3s; beat 1 "get in" is ~1.4s, then the car floors it)
  for (let f = 0; f < 180; f++) g.cinematic && g.cinematic(dt);
  r.carDroveToCity = +(car.position.z - carZ0).toFixed(2);            // positive: fled +Z into the city
  r.tsunamiChased = tsu ? +(tsu.position.z - tsuZ0).toFixed(2) : null; // positive: wave surged +Z too
  r.tsunamiBehindCar = tsu ? tsu.position.z < car.position.z : null;   // wave stays BEHIND (lower z)
  r.playerHiddenDuringDrive = g.player.mesh.visible === false;         // diver is "in the car"
  // run cutscene to completion
  let frames = 0; while (g.cinematic && frames < 600) { g.cinematic(dt); frames++; }
  r.endedToWin = winCalled;
  r.endingTextShown = !!document.querySelector('.cine-text') || !!document.querySelector('.screen');
  return r;
});

console.log('===ESCAPE_TEST_JSON===');
console.log(JSON.stringify({ ...out, errors: errs }, null, 2));
await b.close();
