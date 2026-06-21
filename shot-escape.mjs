import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 560 } });
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(600);
await p.evaluate(() => { document.getElementById('ui-root').style.display = 'none'; window.__ROS.game._loop = () => {}; });
await p.evaluate(async () => {
  const g = window.__ROS.game; const dt = 1 / 60;
  g.startLevel(5); g.cinematic = null; g.controlLocked = false; g.paused = true;
  g.scene.fog = null;
  const car = g.level.car; g.player.pos.x = car.position.x; g.player.pos.z = car.position.z;
  g.level.update(dt, g.player); g._escapeCutscene();
  // advance ~1.6s of the cutscene only (mid-chase), then render
  for (let f = 0; f < 95; f++) { g.cinematic(dt); }
  for (let k = 0; k < 6; k++) { g.renderer.render(g.scene, g.camera); await new Promise(r => requestAnimationFrame(r)); }
});
await sleep(150); await p.screenshot({ path: 'escape.png' });
await b.close(); console.log('shot saved');
