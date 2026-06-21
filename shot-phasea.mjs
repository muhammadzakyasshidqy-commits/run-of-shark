import { chromium } from 'playwright';
import * as fs from 'fs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 960, height: 560 } });
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(600);
await p.evaluate(() => { document.getElementById('ui-root').style.display = 'none'; window.__ROS.game._loop = () => {}; });

// Brighten for a clear screenshot: lighter sky, no fog, extra ambient light.
const brighten = async () => p.evaluate(async () => {
  const T = await import('https://esm.sh/three@0.169.0').catch(() => null);
});

// SHOT 1: dive intro — player on the wooden boat heading out
await p.evaluate(async () => {
  const g = window.__ROS.game; const dt = 1 / 60;
  g.startLevel(0); g.scene.fog = null; g.scene.background.set(0x5aa0d0);
  const amb = g.scene.children.find(c => c.isHemisphereLight); if (amb) amb.intensity = 1.6;
  for (let f = 0; f < 55; f++) g.cinematic && g.cinematic(dt); // mid dive-out
  const boat = g.level.boat;
  g.camera.position.set(boat.position.x - 7, 5, boat.position.z - 11); g.camera.lookAt(boat.position.x, 1.5, boat.position.z + 4);
  for (let k = 0; k < 6; k++) { g.renderer.render(g.scene, g.camera); await new Promise(r => requestAnimationFrame(r)); }
});
await sleep(120); await p.screenshot({ path: 'phasea-boat.png' });

// SHOT 2: swimming with the shark chasing from behind
await p.evaluate(async () => {
  const g = window.__ROS.game; const dt = 1 / 60;
  while (g.cinematic) g.cinematic(dt); // finish dive intro
  g.paused = true; const pl = g.player; pl.invuln = 1e9;
  pl.pos.set(0, 0.2, -40);
  for (let f = 0; f < 120; f++) { pl.update(dt, { x: 0, z: 1, len: 1, sprint: false }, 'level'); pl.pos.x = 0; g.level.update(dt, pl); }
  const sh = g.level.sharks[0]; if (sh) { sh.pos.set(pl.pos.x + 1.5, -0.4, pl.pos.z - 6); sh.aggression = 1; }
  g.camera.position.set(pl.pos.x - 6, 5, pl.pos.z - 13); g.camera.lookAt(pl.pos.x, 1, pl.pos.z + 4);
  for (let k = 0; k < 6; k++) { g.renderer.render(g.scene, g.camera); await new Promise(r => requestAnimationFrame(r)); }
});
await sleep(120); await p.screenshot({ path: 'phasea-swim.png' });
await b.close(); console.log('shots saved');
