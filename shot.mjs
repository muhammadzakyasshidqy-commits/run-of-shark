import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 560 } });
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(600);
await p.evaluate(() => {
  document.getElementById('ui-root').style.display = 'none';
  window.__ROS.game._loop = () => {}; // stop the engine's own RAF loop from overriding our camera
});
await sleep(100);

// MODEL INSPECTION: tight clean view of player + a couple sharks
await p.evaluate(async () => {
  const g = window.__ROS.game;
  g.startLevel(2); g.cinematic = null; g.controlLocked = false; g.paused = true;
  g.scene.fog = null; g.water.visible = false;
  g.scene.traverse((o) => { if (o.isPoints) o.visible = false; });
  g.level.corals.forEach((c) => g.scene.remove(c)); // declutter
  g.level.coins.forEach((c) => g.scene.remove(c));
  const p = g.player; p.pos.set(-2.2, 0.4, -60);
  g.level._spawnShark('hammerhead'); const s1 = g.level.sharks.at(-1); s1.pos.set(3, 0.4, -60); s1.speed = 0; s1.aggression = 1;
  g.camera.position.set(0.4, 1.4, -54); g.camera.lookAt(0.4, 0.7, -60);
  for (let i = 0; i < 40; i++) {
    p.pos.set(-2.2, 0.4, -60); p.mesh.rotation.y = 0.6; p.update(1 / 60, { x: 0, z: 0, len: 0, sprint: false }); p.pos.set(-2.2, 0.4, -60); p.mesh.rotation.y = 0.6;
    s1.pos.set(3, 0.4, -60); s1.mesh.rotation.y = -Math.PI / 2; s1.aggressionTarget = 1; s1.update(1 / 60, { x: -10, z: -60 }); s1.pos.set(3, 0.4, -60); s1.mesh.rotation.y = -Math.PI / 2;
    g.renderer.render(g.scene, g.camera); await new Promise(r => requestAnimationFrame(r));
  }
});
await sleep(200);
await p.screenshot({ path: 'shot-models.png' });

// BOSS close-up (clean)
await p.evaluate(async () => {
  const g = window.__ROS.game;
  g.startLevel(4); g.cinematic = null; g.controlLocked = false; g.level.bossCtrl.begin(); g.paused = true;
  g.scene.fog = null; g.water.visible = false;
  const boss = g.level.boss; boss.pos.set(0, 0, 70); boss.aggression = 1; boss.aggressionTarget = 1;
  g.camera.position.set(-9, 4, 60); g.camera.lookAt(0, 0, 70);
  for (let i = 0; i < 30; i++) { boss.update(1 / 60, { x: 0, z: 80 }); g.renderer.render(g.scene, g.camera); await new Promise(r => requestAnimationFrame(r)); }
});
await sleep(200);
await p.screenshot({ path: 'shot-boss.png' });
await b.close();
console.log('shots saved');
