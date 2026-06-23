import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
const out = await p.evaluate(async () => {
  await window.__ROS.assetsReady();
  const mod = await import('/src/assets/Assets.js');
  const r = {};
  for (const n of ['fish_shark', 'fish_manta', 'car_sports']) {
    r[n] = { has: mod.hasModel(n), anims: (mod.modelAnimations(n) || []).map(a => ({ name: a.name, dur: +a.duration.toFixed(2) })) };
  }
  return r;
});
console.log(JSON.stringify(out, null, 2));
await b.close();
