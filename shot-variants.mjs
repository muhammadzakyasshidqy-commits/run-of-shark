// Show the shark variants together: normal (grey), boss (big dark shark), kraken (manta-ray).
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await p.evaluate(async () => { const m = await import('/src/assets/Assets.js'); await m.loadAssets(); });
await p.evaluate(() => { document.getElementById('ui-root').style.display = 'none'; });

const info = await p.evaluate(async () => {
  const g = window.__ROS.game;
  const Models = await import('/src/entities/Models.js');
  const { SHARK_TYPES } = await import('/src/config.js');
  g.startLevel(0); g.cinematic = null; g.running = false; g.paused = true; g._loop = () => {};
  for (let k = 0; k < 4; k++) await new Promise((r) => requestAnimationFrame(r));
  g.scene.fog = null; const a = g.scene.children.find((c) => c.isHemisphereLight); if (a) a.intensity = 1.5;
  g.scene.background && g.scene.background.set && g.scene.background.set(0x5aa0d0);

  const out = [];
  const place = (type, x) => {
    const d = SHARK_TYPES[type];
    const m = Models.makeShark(d.color, d.scale, type);
    m.position.set(x, -0.3, 0); m.rotation.y = 0; // face +X (side-on)
    if (m.userData.mixer) m.userData.mixer.update(0.4);
    g.scene.add(m);
    out.push({ type, isGLB: !!m.userData.mixer, scale: d.scale });
  };
  place('normal', -9); place('boss', 0); place('kraken', 12);
  g.camera.position.set(0, 6, 22); g.camera.lookAt(1, -0.5, 0);
  g.renderer.render(g.scene, g.camera);
  return out;
});
await sleep(120); await p.screenshot({ path: 'shark-variants.png' });
console.log(JSON.stringify({ info, errors: errs }, null, 2));
await b.close();
