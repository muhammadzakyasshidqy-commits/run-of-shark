// Endless generator: valid + bounded + deterministic defs for shallow..extreme depths, and a
// sane anti-farm bonus curve.
import { makeEndlessLevel, endlessClearBonus, ENDLESS_START } from './src/config.js';

const TYPES = ['normal', 'fast', 'mutant', 'hammerhead', 'ghost'];
let pass = 0, fail = 0;
const ok = (n, c, e = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${e}`); c ? pass++ : fail++; };

for (const n of [7, 8, 12, 50, 100, 500, 9999]) {
  const d = makeEndlessLevel(n);
  ok(`n=${n} id+endless+depth`, d.id === n && d.endless === true && d.depth === n);
  ok(`n=${n} has 1..5 sharks`, Array.isArray(d.sharks) && d.sharks.length >= 1 && d.sharks.length <= 5, `count=${d.sharks.length}`);
  ok(`n=${n} shark types valid`, d.sharks.every(s => TYPES.includes(s.type)));
  ok(`n=${n} delays positive`, d.sharks.every(s => s.delay > 0));
  ok(`n=${n} speedMult bounded 1..1.75`, d.speedMult > 1 && d.speedMult <= 1.75, `sm=${d.speedMult}`);
  ok(`n=${n} coinsToWin bounded`, d.coinsToWin >= 1 && d.coinsToWin <= 22, `c=${d.coinsToWin}`);
  ok(`n=${n} objective string`, typeof d.objective === 'string' && d.objective.length > 0);
  ok(`n=${n} not boss/tsunami`, !d.boss && !d.tsunami);
}
// determinism
ok('deterministic per depth', JSON.stringify(makeEndlessLevel(123)) === JSON.stringify(makeEndlessLevel(123)));
// clamping
ok('clamps below start', makeEndlessLevel(3).id === ENDLESS_START);
ok('clamps above 9999', makeEndlessLevel(999999).id === 9999);
// variety: a maze depth + a split depth exist within a window
{ let maze = false, split = false; for (let n = 7; n < 27; n++) { const d = makeEndlessLevel(n); if (d.maze) maze = true; if (d.splitRoute) split = true; } ok('maze + split variety appear', maze && split); }
// bonus curve grows but sub-linear (deep pays more per-level than shallow, but not explosively)
{ const b7 = endlessClearBonus(7), b50 = endlessClearBonus(50), b500 = endlessClearBonus(500);
  ok('bonus grows with depth', b7 < b50 && b50 < b500, `b7=${b7} b50=${b50} b500=${b500}`);
  ok('bonus sub-linear (not exploitable)', b500 < endlessClearBonus(50) * 10, `b500=${b500}`); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
