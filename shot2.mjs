import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 560 } });
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(600);
await p.evaluate(() => { document.getElementById('ui-root').style.display = 'none'; window.__ROS.game._loop = () => {}; });
await sleep(100);

// SPAWN: establishing shot — camera south of the beach looking north over the spawn
await p.evaluate(async () => {
  const g = window.__ROS.game;
  g.startLevel(0); g.cinematic = null; g.controlLocked = false; g.paused = true; g.scene.fog = null;
  const pl = g.player; pl.pos.set(0, 0.2, g.constructor ? -86 : -86); pl.mesh.rotation.y = 0;
  g.camera.position.set(14, 9, -112); g.camera.lookAt(2, 0.5, -84);
  for (let i = 0; i < 10; i++) { g.renderer.render(g.scene, g.camera); await new Promise(r => requestAnimationFrame(r)); }
});
await sleep(200);
await p.screenshot({ path: 'shot-spawn.png' });

// BOUNDARY: look toward the +X world edge to show the buoy line
await p.evaluate(async () => {
  const g = window.__ROS.game; const S = 120;
  g.scene.fog = null;
  g.camera.position.set(S - 35, 26, 40); g.camera.lookAt(S, 0, 60);
  for (let i = 0; i < 8; i++) { g.renderer.render(g.scene, g.camera); await new Promise(r => requestAnimationFrame(r)); }
});
await sleep(200);
await p.screenshot({ path: 'shot-boundary.png' });
await b.close();
console.log('shots saved');
