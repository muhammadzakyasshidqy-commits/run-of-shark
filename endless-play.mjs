// Endless mode in-browser: solvable depths, coins+record awarded on win, auto-advance, and NO
// resource leak across endless transitions (the leak-fix must hold here too).
import { chromium } from 'playwright';
const PORT = process.argv[2] || '5178';
const b = await chromium.launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await p.evaluate(async () => { const m = await import('/src/assets/Assets.js'); await m.loadAssets(); });
await new Promise(r => setTimeout(r, 400));

const out = await p.evaluate(async () => {
  const g = window.__ROS.game; const s = window.__ROS.economy.s;
  const { makeEndlessLevel } = await import('/src/config.js');
  const { ACHIEVEMENTS } = await import('/src/config.js');
  s.upgrades = { speed: 6, resistance: 3, sprint: 4 }; s.equippedVehicle = 'jetski'; s.ownedVehicles = ['jetski'];
  s.highestLevel = 7; s.levelsCleared = 6; s.highestEndless = 0; s.coins = 0;
  s.achievements = ACHIEVEMENTS.map(a => a.id); // pre-claim so one-time bonuses don't skew the endless reward
  const dt = 1 / 60;
  // dodging bot: head to goal, weave from nearest shark
  const runToWin = (maxS = 45) => {
    const goal = g.level.car || g.level.submarine; let T = 0;
    for (let i = 0; i < 60 * maxS; i++) {
      const gx = goal.position.x, gz = goal.position.z;
      let dx = gx - g.player.pos.x, dz = gz - g.player.pos.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      let ax = 0, nd = 1e9, near = null;
      for (const sh of (g.level.sharks || [])) { const d = Math.hypot(sh.pos.x - g.player.pos.x, sh.pos.z - g.player.pos.z); if (d < nd) { nd = d; near = sh; } }
      if (near && nd < 9) ax = g.player.pos.x < near.pos.x ? -1.3 : 1.3;
      let ix = dx + ax, iz = dz; const il = Math.hypot(ix, iz) || 1;
      g.player.update(dt, { x: ix / il, z: iz / il, len: 1, sprint: true }, 'level');
      g.effects.update(dt, T);
      const r = g.level.update(dt, g.player); T += dt;
      if (r) return { r, T: +T.toFixed(1) };
    }
    return { r: 'timeout', T: maxS };
  };
  const results = {};
  // solvability at a few depths
  for (const depth of [7, 12, 20, 40]) {
    g.startEndless(depth); g.cinematic = null; g.controlLocked = false; g.player.pos.set(0, 1.3, -60);
    results['depth' + depth] = runToWin();
  }
  // WIN flow: coins + record + auto-advance
  s.coins = 0; s.highestEndless = 0;
  g.startEndless(7); g.cinematic = null; g.controlLocked = false; g.player.pos.set(0, 1.3, -60);
  const w = runToWin();
  // trigger the real win handler path by calling _endlessWin (Level already returned 'win')
  const coinsBefore = s.coins;
  g._endlessWin();
  const coinsAfterWin = s.coins, recordAfter = s.highestEndless;
  // step the cutscene to force auto-advance
  for (let i = 0; i < 60 * 2 && g.cinematic; i++) g.cinematic(dt);
  const advancedTo = g.endlessLevel;
  results.winFlow = { winResult: w.r, coinsAwarded: coinsAfterWin - coinsBefore, record: recordAfter, autoAdvancedTo: advancedTo };

  // anti-farm: dying mid-level keeps NO pickup coins (endless pays on win only)
  s.coins = 1000; g.startEndless(7); g.cinematic = null; g.controlLocked = false;
  g.player.pos.set(0, 1.3, 20);
  for (let i = 0; i < 120; i++) { g.player.update(dt, { x: 0, z: 1, len: 1, sprint: false }, 'level'); g.level.update(dt, g.player); }
  const coinsWhileDiving = s.coins;
  results.antiFarm = { coinsUnchangedDuringDive: coinsWhileDiving === 1000, coins: coinsWhileDiving };

  // LEAK across endless transitions — cycle the SAME depth so any growth is a true leak
  const snap = () => ({ geo: g.renderer.info.memory.geometries, tex: g.renderer.info.memory.textures });
  const render = () => g.renderer.render(g.scene, g.camera);
  g.startEndless(15); for (let k = 0; k < 3; k++) { render(); await new Promise(r => requestAnimationFrame(r)); }
  const base = snap();
  for (let i = 0; i < 20; i++) { g.startEndless(15); for (let k = 0; k < 3; k++) { render(); await new Promise(r => requestAnimationFrame(r)); } }
  const after = snap();
  results.leak = { base, after };
  return results;
});

let pass = 0, fail = 0;
const ok = (n, c, e = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${e}`); c ? pass++ : fail++; };
for (const depth of [7, 12, 20, 40]) ok(`Depth ${depth} solvable (geared dodge)`, out['depth' + depth].r === 'win', `t=${out['depth' + depth].T}s`);
ok('win awards coins (bonus + pickups)', out.winFlow.coinsAwarded >= 16, `+${out.winFlow.coinsAwarded}`);
ok('record saved on clear', out.winFlow.record === 7);
ok('auto-advances to next depth', out.winFlow.autoAdvancedTo === 8);
ok('anti-farm: no coins banked while diving (endless pays on win)', out.antiFarm.coinsUnchangedDuringDive === true);
ok('no geometry leak over 20 same-depth transitions', out.leak.after.geo - out.leak.base.geo < 40, `geo ${out.leak.base.geo}->${out.leak.after.geo}`);
ok('no texture leak over 20 same-depth transitions', out.leak.after.tex - out.leak.base.tex < 10, `tex ${out.leak.base.tex}->${out.leak.after.tex}`);
ok('no page errors', errs.length === 0, errs.join('; '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
