// Objective perf snapshot: draw calls + triangles + headless FPS per level.
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 412, height: 915 } });
await p.goto('http://localhost:5173/?debug=1', { waitUntil: 'networkidle' });
await sleep(500);
const sample = async (idx, boss) => p.evaluate(async ({ idx, boss }) => {
  const g = window.__ROS.game;
  g.startLevel(idx); g.cinematic = null; g.controlLocked = false;
  if (boss) g.level.bossCtrl.begin();
  else if (g.level._sharkQueue) g.level._sharkQueue.forEach((q) => { q.spawned = true; g.level._spawnShark(q.type); });
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 300));
  const info = g.renderer.info.render;
  const fps = await new Promise((res) => { let f = 0; const t0 = performance.now(); const tk = () => { f++; if (performance.now() - t0 < 2000) requestAnimationFrame(tk); else res(Math.round((f * 1000) / (performance.now() - t0))); }; requestAnimationFrame(tk); });
  return { calls: info.calls, triangles: info.triangles, fps };
}, { idx, boss });
console.log('Level3 (corals + sharks):', JSON.stringify(await sample(2, false)));
console.log('Level4 (split route)   :', JSON.stringify(await sample(3, false)));
console.log('Level5 (boss arena)    :', JSON.stringify(await sample(4, true)));
await b.close();
