// Phase diver: verify the GLB humanoid renders at human scale, plays Swim/Walk clips, faces
// movement, and is tinted to the skin colour.
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await p.evaluate(async () => { const m = await import('/src/assets/Assets.js'); await m.loadAssets(); });
await p.evaluate(() => { document.getElementById('ui-root').style.display = 'none'; });

async function frame(label, fn) {
  const info = await p.evaluate(async (fnStr) => {
    const g = window.__ROS.game;
    // eslint-disable-next-line no-eval
    const r = await (eval('(' + fnStr + ')'))(g);
    g.running = false; g.paused = true; g._loop = () => {};
    for (let k = 0; k < 4; k++) await new Promise((res) => requestAnimationFrame(res));
    g.scene.fog = null; const a = g.scene.children.find((c) => c.isHemisphereLight); if (a) a.intensity = 1.5;
    g.scene.background && g.scene.background.set && g.scene.background.set(0x6fb4e0);
    const pl = g.player; pl.pos.set(0, 0.2, 0);
    g.camera.position.set(3.4, 1.6, 4.2); g.camera.lookAt(0, 0.9, 0);
    g.renderer.render(g.scene, g.camera);
    return r;
  }, fn.toString());
  await sleep(120); await p.screenshot({ path: label + '.png' });
  return info;
}

// LEVEL swim: step the player forward so Swim_Fwd_Loop plays + advances
const swim = await frame('diver-swim', (g) => {
  g.startLevel(0); g.cinematic = null; g.controlLocked = false; g.running = true; g.paused = false;
  const pl = g.player; const input = { x: 0, z: 1, len: 1, sprint: false };
  for (let i = 0; i < 90; i++) pl.update(1 / 60, input, 'level');
  return { mixer: !!pl.mesh.userData.mixer, roty: +pl.mesh.rotation.y.toFixed(2), y: +pl.mesh.position.y.toFixed(2) };
});

// HUB walk
const walk = await frame('diver-walk', (g) => {
  g.enterHub(); g.running = true; g.paused = false; g.controlLocked = false;
  const pl = g.player; const input = { x: 1, z: 0, len: 1, sprint: false };
  for (let i = 0; i < 60; i++) pl.update(1 / 60, input, 'hub');
  return { mixer: !!pl.mesh.userData.mixer, roty: +pl.mesh.rotation.y.toFixed(2) };
});

console.log(JSON.stringify({ swim, walk, errors: errs }, null, 2));
await b.close();
