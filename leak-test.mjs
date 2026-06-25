// Area I: GPU-resource leak guard. Switching hub<->levels repeatedly must NOT grow geometry or
// texture counts unbounded (procedural meshes + skinned-mesh boneTextures must be disposed; cached
// GLB resources must be preserved). Run: node leak-test.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] || '5177';
const b = await chromium.launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await p.evaluate(async () => { const m = await import('/src/assets/Assets.js'); await m.loadAssets(); });
await new Promise(r => setTimeout(r, 400));

const r = await p.evaluate(async () => {
  const g = window.__ROS.game; const render = () => g.renderer.render(g.scene, g.camera);
  const snap = () => ({ geo: g.renderer.info.memory.geometries, tex: g.renderer.info.memory.textures });
  g.enterHub(); for (let k = 0; k < 3; k++) { render(); await new Promise(r => requestAnimationFrame(r)); }
  const base = snap();
  for (let i = 0; i < 30; i++) {
    g.startLevel(i % 6); for (let k = 0; k < 3; k++) { render(); await new Promise(r => requestAnimationFrame(r)); }
    g.enterHub(); for (let k = 0; k < 3; k++) { render(); await new Promise(r => requestAnimationFrame(r)); }
  }
  const after = snap();
  // GLB clones must still work after all the disposing
  g.startLevel(0); for (let k = 0; k < 4; k++) { render(); await new Promise(r => requestAnimationFrame(r)); }
  let skinned = false; g.player.mesh.traverse(o => { if (o.isSkinnedMesh) skinned = true; });
  return { base, after, diverStillSkinned: skinned };
});

let pass = 0, fail = 0;
const ok = (n, c, e = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${e}`); c ? pass++ : fail++; };
// allow small slack for the persistent baseline (water/shadow), but no per-cycle accumulation
ok('geometry bounded across 30 scene switches', r.after.geo - r.base.geo < 80, `base=${r.base.geo} after=${r.after.geo}`);
ok('texture bounded across 30 scene switches', r.after.tex - r.base.tex < 20, `base=${r.base.tex} after=${r.after.tex}`);
ok('GLB diver still renders (cache not corrupted)', r.diverStillSkinned === true);
ok('no page errors', errs.length === 0, errs.join('; '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
