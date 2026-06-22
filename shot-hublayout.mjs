import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(600);
await p.evaluate(() => { document.getElementById('ui-root').style.display = 'none'; window.__ROS.game._loop = () => {}; });
// top-down (true map view); highestLevel=1 so levels 2-6 show locks
await p.evaluate(async () => {
  const g = window.__ROS.game; g.save.data.highestLevel = 1; g.enterHub(); g.paused = true; g.scene.fog = null;
  // Map orientation: up=-Z so the BACK of the island (tower+garage) is at the TOP of the image,
  // the FRONT (dock) at the bottom, and +X to the right (no mirroring).
  g.camera.up.set(0, 0, -1);
  g.camera.position.set(0, 120, -12); g.camera.lookAt(0, 0, -12);
  for (let k = 0; k < 6; k++) { g.renderer.render(g.scene, g.camera); await new Promise(r => requestAnimationFrame(r)); }
});
await sleep(150); await p.screenshot({ path: 'hub-topdown.png' });
// close-up of the tower so the numbered slots + locks are readable
await p.evaluate(async () => {
  const g = window.__ROS.game; g.camera.position.set(0, 12, -16); g.camera.lookAt(0, 11, -32);
  for (let k = 0; k < 6; k++) { g.renderer.render(g.scene, g.camera); await new Promise(r => requestAnimationFrame(r)); }
});
await sleep(150); await p.screenshot({ path: 'tower-locks.png' });
await b.close(); console.log('shots saved');
