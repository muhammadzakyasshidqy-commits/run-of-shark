// Player-POV proof that every sign reads correctly (not reversed/sideways) from the approach.
import { chromium } from 'playwright';
const PORT = process.argv[2] || '5178';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 560 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await p.evaluate(async () => { const m = await import('/src/assets/Assets.js'); await m.loadAssets(); });
await sleep(400);
await p.evaluate(() => { const u = document.getElementById('ui-root'); if (u) u.style.display = 'none'; });
await p.evaluate(async () => { const g = window.__ROS.game; g.save.data.highestLevel = 6; g.enterHub(); g.running = false; g.paused = true; g._loop = () => {}; for (let k = 0; k < 5; k++) await new Promise(r => requestAnimationFrame(r)); if (g.scene.fog) g.scene.fog.far = 420; });
async function cam(name, cx, cy, cz, lx, ly, lz) {
  await p.evaluate(async ({ cx, cy, cz, lx, ly, lz }) => { const g = window.__ROS.game; g.camera.up.set(0, 1, 0); g.camera.position.set(cx, cy, cz); g.camera.lookAt(lx, ly, lz); g.renderer.render(g.scene, g.camera); }, { cx, cy, cz, lx, ly, lz });
  await sleep(110); await p.screenshot({ path: `docs/proof/${name}.png` });
}
// approach each sign from where the player would walk up
await cam('sign-bank', -22, 4.5, -16, -36, 4.4, -16);          // BANK + $ + ATM (face +X)
await cam('sign-wheel', -24, 7.5, 4, -36, 7.4, 4);             // LUCKY WHEEL (face +X)
await cam('sign-shops', 25, 4, -4, 41, 3.6, -4);              // GEAR kiosk (face -X)
await cam('sign-skins', 25, 4, -20, 41, 3.6, -20);           // SKINS kiosk
await cam('sign-garage', 30, 7, -34, 30, 6.4, -50);          // GARAGE header (face +Z)
await cam('sign-tower', 0, 4, -22, 0, 3, -34);               // LEVELS (face +Z)
await cam('sign-dock', 0, 4, 12, 0, 2.4, 22);                // DOCK — START DIVE (face -Z)
console.log(JSON.stringify({ errors: errs }));
await b.close();
