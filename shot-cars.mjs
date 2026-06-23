// Phase asset/cars: prove the 5 GLB cars load + render in the back showroom.
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

// wait for the GLB preload to finish, then report which models actually loaded
const loaded = await p.evaluate(async () => {
  await window.__ROS.assetsReady();
  const mod = await import('/src/assets/Assets.js');
  return ['car_atv', 'car_buggy', 'car_jeep', 'car_sports', 'car_luxury'].map((n) => ({ n, ok: mod.hasModel(n) }));
});

await p.evaluate(() => { document.getElementById('ui-root').style.display = 'none'; window.__ROS.game._loop = () => {}; });
await p.evaluate(async () => {
  const g = window.__ROS.game;
  g.save.data.ownedVehicles = ['atv', 'jeep']; // 2 owned (solid), 3 ghost — show both states
  g.enterHub(); g.paused = true; g.scene.fog = null;
  const a = g.scene.children.find((c) => c.isHemisphereLight); if (a) a.intensity = 1.4;
  // frame the back showroom from a high front-LEFT corner so the central Tower (z=-32) is
  // out of the sightline to the car row (z=-44)
  g.camera.position.set(-22, 12, -30); g.camera.lookAt(2, 1.2, -46);
  for (let k = 0; k < 8; k++) { g.renderer.render(g.scene, g.camera); await new Promise((r) => requestAnimationFrame(r)); }
});
await sleep(150); await p.screenshot({ path: 'cars-showroom.png' });

// a 3/4 close on the luxury car (rightmost, x≈11.6)
await p.evaluate(async () => {
  const g = window.__ROS.game; g.camera.position.set(16, 4, -38); g.camera.lookAt(11.6, 1.2, -44);
  for (let k = 0; k < 8; k++) { g.renderer.render(g.scene, g.camera); await new Promise((r) => requestAnimationFrame(r)); }
});
await sleep(150); await p.screenshot({ path: 'cars-luxury.png' });

console.log('===CARS_JSON===');
console.log(JSON.stringify({ loaded, errors: errs }, null, 2));
await b.close();
