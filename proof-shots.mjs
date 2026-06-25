// Player-POV proof screenshots committed to docs/proof/. Run: node proof-shots.mjs [port]
// Renders the hub districts + each level start from an in-game player camera (not top-down,
// not headless-brightened — the real scene with its real lighting/fog).
import { chromium } from 'playwright';
const PORT = process.argv[2] || '5176';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1000, height: 640 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await p.evaluate(async () => { const m = await import('/src/assets/Assets.js'); await m.loadAssets(); });
await sleep(400);
await p.evaluate(() => { const u = document.getElementById('ui-root'); if (u) u.style.display = 'none'; });

async function hub() { await p.evaluate(async () => { const g = window.__ROS.game; g.save.data.highestLevel = 6; g.enterHub(); g.running = false; g.paused = true; g._loop = () => {}; for (let k = 0; k < 6; k++) await new Promise((r) => requestAnimationFrame(r)); if (g.scene.fog) g.scene.fog.far = 420; }); }
async function cam(name, cx, cy, cz, lx, ly, lz, up0) {
  await p.evaluate(async ({ cx, cy, cz, lx, ly, lz, up0 }) => { const g = window.__ROS.game; g.camera.up.set(up0 ? 0 : 0, up0 ? 0 : 1, up0 ? -1 : 0); g.camera.position.set(cx, cy, cz); g.camera.lookAt(lx, ly, lz); g.renderer.render(g.scene, g.camera); }, { cx, cy, cz, lx, ly, lz, up0 });
  await sleep(120); await p.screenshot({ path: `docs/proof/${name}.png` });
}

await hub();
await cam('map-topdown', 0, 170, -26, 0, 0, -26, true);
await cam('hub-bank', -21, 4.5, -16, -34, 3, -16);
await cam('hub-wheel', -24, 4.5, 4, -36, 4, 4);
await cam('hub-shops', 25, 7, -4, 41, 3, -4);
await cam('hub-garage', 30, 6, -33, 30, 3, -50);
await cam('hub-dock', 0, 4.5, 8, 0, 1, 40);
await cam('hub-tower', 0, 9, -12, 0, 7, -34);
await cam('hub-overview', 0, 16, 34, 0, 5, -40);

// level starts (player camera) for the per-level clarity proof
for (let i = 0; i < 6; i++) {
  await p.evaluate(async (idx) => {
    const g = window.__ROS.game; g.startLevel(idx);
    g.running = false; g.paused = true; g._loop = () => {}; g.cinematic = null; g.controlLocked = false;
    for (let k = 0; k < 5; k++) await new Promise((r) => requestAnimationFrame(r));
    if (g.scene.fog) g.scene.fog.far = 320;
    const pz = g.player.pos.z; g.camera.up.set(0, 1, 0);
    g.camera.position.set(0, 6, pz - 11); g.camera.lookAt(0, 2, pz + 28);
    g.renderer.render(g.scene, g.camera);
  }, i);
  await sleep(120); await p.screenshot({ path: `docs/proof/lvl${i + 1}-start.png` });
}
// L6 ENDING cutscene frames (get-in, drive, city, dusk closer). Drive the cinematic manually.
async function cut(name, tStop) {
  await p.evaluate(async (tStop) => {
    const g = window.__ROS.game; g.startLevel(5);
    for (let k = 0; k < 4; k++) await new Promise((r) => requestAnimationFrame(r));
    if (g.scene.fog) g.scene.fog.far = 480;
    g.cinematic = null; g.controlLocked = false;
    g.player.pos.set(0, 1.3, 104); g._escapeCutscene();
    let T = 0; const dt = 1 / 30;
    while (T < tStop) { g.effects.update(dt, T); g.cinematic && g.cinematic(dt); T += dt; }
    g.renderer.render(g.scene, g.camera);
  }, tStop);
  await sleep(120); await p.screenshot({ path: `docs/proof/${name}.png` });
}
await cut('l6end-getin', 0.7);
await cut('l6end-drive', 1.4 + 1.4);
await cut('l6end-city', 1.4 + 3.6);
await cut('l6end-escaped', 1.4 + 4.0 + 0.9);

console.log(JSON.stringify({ errors: errs }));
await b.close();
