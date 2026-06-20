import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 560 } });
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(600);
await p.evaluate(() => { document.getElementById('ui-root').style.display = 'none'; window.__ROS.game._loop = () => {}; });
await p.evaluate(async () => {
  const g = window.__ROS.game; g.startLevel(4); g.cinematic = null; g.controlLocked = false; g.paused = true;
  g.scene.fog = null; g.water.visible = false;
  const c = g.level.bossCtrl, boss = g.level.boss, pl = g.player, Hs = g.level.hazards, dt = 1 / 60;
  c._forceAttack = 'charge'; c.begin();
  // place player so a hazard is behind them (bait), advance until telegraph shows aim line
  const hz = Hs[0];
  let frames = 0;
  while (frames < 600) {
    const dirx = hz.pos.x - boss.pos.x, dz = hz.pos.z - boss.pos.z, L = Math.hypot(dirx, dz) || 1;
    pl.pos.x = boss.pos.x + (dirx / L) * (L - 2); pl.pos.z = boss.pos.z + (dz / L) * (L - 2); pl.invuln = 99;
    g.level.update(dt, pl); frames++;
    if (c.state === 'telegraph' && c.aimLine.visible && c.timer < c.telegraphTime - 0.3) break;
  }
  const mid = { x: (boss.pos.x + hz.pos.x) / 2, z: (boss.pos.z + hz.pos.z) / 2 };
  g.camera.position.set(mid.x + 14, 20, mid.z - 18); g.camera.lookAt(mid.x, 0, mid.z);
  for (let k = 0; k < 6; k++) { g.renderer.render(g.scene, g.camera); await new Promise(r => requestAnimationFrame(r)); }
});
await sleep(120); await p.screenshot({ path: 'shot-telegraph.png' });
await b.close(); console.log('shot saved');
