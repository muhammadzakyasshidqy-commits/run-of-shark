import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 980, height: 600 } });
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(600);
await p.evaluate(() => { document.getElementById('ui-root').style.display = 'none'; window.__ROS.game._loop = () => {}; });
const bright = () => p.evaluate(() => { const g = window.__ROS.game; g.scene.fog = null; const a = g.scene.children.find(c => c.isHemisphereLight); if (a) a.intensity = 1.5; });

// HUB overview (Phases C/E/F: wooden boat+dock, garage showroom front-left, wheel+bank)
await p.evaluate(async () => { const g = window.__ROS.game; g.enterHub(); g.paused = true; });
await bright();
await p.evaluate(async () => { const g = window.__ROS.game; g.camera.position.set(0, 56, 64); g.camera.lookAt(0, 2, -10); for (let k = 0; k < 6; k++) { g.renderer.render(g.scene, g.camera); await new Promise(r => requestAnimationFrame(r)); } });
await sleep(120); await p.screenshot({ path: 'final-hub.png' });

// GARAGE showroom close (Phase E)
await p.evaluate(async () => { const g = window.__ROS.game; g.camera.position.set(-26, 7, 44); g.camera.lookAt(-26, 1, 30); for (let k = 0; k < 6; k++) { g.renderer.render(g.scene, g.camera); await new Promise(r => requestAnimationFrame(r)); } });
await sleep(120); await p.screenshot({ path: 'final-garage.png' });

// WHEEL + BANK close (Phase F)
await p.evaluate(async () => { const g = window.__ROS.game; g.camera.position.set(-34, 8, 22); g.camera.lookAt(-35, 3, -4); for (let k = 0; k < 6; k++) { g.renderer.render(g.scene, g.camera); await new Promise(r => requestAnimationFrame(r)); } });
await sleep(120); await p.screenshot({ path: 'final-wheelbank.png' });

// L3 CORAL MAZE (Phase D)
await p.evaluate(async () => { const g = window.__ROS.game; g.startLevel(2); g.cinematic = null; g.paused = true; g.scene.fog = null; g.scene.background.set(0x5aa0d0); const pl = g.player; pl.pos.set(0, 0.2, -10); g.camera.position.set(0, 40, -42); g.camera.lookAt(0, 0, 20); for (let k = 0; k < 6; k++) { g.renderer.render(g.scene, g.camera); await new Promise(r => requestAnimationFrame(r)); } });
await sleep(120); await p.screenshot({ path: 'final-maze.png' });
await b.close(); console.log('final shots saved');
