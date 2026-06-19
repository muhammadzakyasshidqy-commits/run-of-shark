import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 960, height: 600 } });
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(600);
await p.evaluate(() => { document.getElementById('ui-root').style.display = 'none'; window.__ROS.game._loop = () => {}; });
await sleep(100);

// Overview from above-front
await p.evaluate(async () => {
  const g = window.__ROS.game; g.enterHub(); g.paused = true; g.scene.fog = null;
  g.camera.position.set(0, 70, 70); g.camera.lookAt(0, 0, -15);
  for (let i = 0; i < 8; i++) { g.renderer.render(g.scene, g.camera); await new Promise(r => requestAnimationFrame(r)); }
});
await sleep(200);
await p.screenshot({ path: 'hub-overview.png' });

// Ground-level near the player spawn, looking at the tower/bank/shop
await p.evaluate(async () => {
  const g = window.__ROS.game;
  g.player.pos.set(0, 0.2, 18);
  g.camera.position.set(-18, 8, 24); g.camera.lookAt(0, 2, -10);
  for (let i = 0; i < 8; i++) { g.renderer.render(g.scene, g.camera); await new Promise(r => requestAnimationFrame(r)); }
});
await sleep(200);
await p.screenshot({ path: 'hub-ground.png' });
await b.close();
console.log('hub shots saved');
