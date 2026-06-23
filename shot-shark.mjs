// Phase shark: verify the GLB shark spawns, faces its movement (+X snout), and renders.
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await p.evaluate(async () => { const m = await import('/src/assets/Assets.js'); await m.loadAssets(); });
await p.evaluate(() => { document.getElementById('ui-root').style.display = 'none'; });

// Start L2 (fast shark, delay ~1s), let it spawn + chase, then freeze and frame the shark.
const info = await p.evaluate(async () => {
  const g = window.__ROS.game;
  g.startLevel(1); g.cinematic = null; g.controlLocked = false;
  g.player.pos.set(0, 0.2, -10);                 // put player mid-water so the shark closes in
  await new Promise((r) => setTimeout(r, 2600));  // let the real loop run the chase
  // Kill the game loop: a noop _loop reschedules nothing, so after the pending frames flush no
  // follow-cam render can overwrite ours.
  g.running = false; g.paused = true; g._loop = () => {};
  for (let k = 0; k < 4; k++) await new Promise((r) => requestAnimationFrame(r)); // flush pending frames
  g.scene.fog = null;
  const a = g.scene.children.find((c) => c.isHemisphereLight); if (a) a.intensity = 1.5;
  g.scene.background && g.scene.background.set && g.scene.background.set(0x5aa0d0);
  const sh = g.level.sharks && g.level.sharks[0];
  const headingY = sh ? +sh.mesh.rotation.y.toFixed(2) : null;
  if (sh) { sh.pos.set(0, -0.2, 0); sh.aggression = 1; sh.mesh.rotation.y = 0; /* face +X */ if (sh.mesh.userData.mixer) sh.mesh.userData.mixer.update(0.3); }
  // final frame: set camera then render LAST (no trailing await), so the canvas holds our view
  g.camera.position.set(0, 2.2, 8.5); g.camera.lookAt(0, 0.2, 0);
  g.renderer.render(g.scene, g.camera);
  return { hasShark: !!sh, isGLB: !!(sh && sh.mesh.userData.mixer), chaseHeadingY: headingY };
});
await sleep(150); await p.screenshot({ path: 'shark-chase.png' });
console.log(JSON.stringify({ info, errors: errs }, null, 2));
await b.close();
