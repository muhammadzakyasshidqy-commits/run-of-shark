// Proves the physical wheel STOPS with the chosen prize segment under the top pointer.
// For each index: spinWheel(i) -> read final wheel.rotation.z -> compute which segment
// is at the top (+Y, angle pi/2) -> must equal i.
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(500);
await p.getByText('ENTER ISLAND', { exact: false }).click();
await sleep(1500);

const res = await p.evaluate(async () => {
  const g = window.__ROS.game, N = 6, TWO_PI = Math.PI * 2;
  const wheel = g.hub.wheelObj.userData.wheel;
  const out = [];
  for (let i = 0; i < N; i++) {
    await g.hub.spinWheel(i, N);              // real animated spin
    const rz = wheel.rotation.z;
    // segment under the top pointer: find seg whose centre+rz ≡ pi/2 (mod 2π)
    let best = -1, bestErr = 9;
    for (let s = 0; s < N; s++) {
      const centre = ((s + 0.5) / N) * TWO_PI;
      let d = (centre + rz) - Math.PI / 2;
      d = Math.atan2(Math.sin(d), Math.cos(d));  // wrap to [-π,π]
      if (Math.abs(d) < bestErr) { bestErr = Math.abs(d); best = s; }
    }
    out.push({ chosen: i, landedSegment: best, errDeg: +(bestErr * 180 / Math.PI).toFixed(2) });
  }
  return out;
});

console.log('===WHEEL_TEST_JSON===');
console.log(JSON.stringify({ results: res, allMatch: res.every(r => r.chosen === r.landedSegment), errors: errs }, null, 2));
await b.close();
