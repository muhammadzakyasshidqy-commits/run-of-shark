// Spawn-in-bounds: every coin/treasure/power-up (and coral) must land inside the player's
// reachable area (X within ±WORLD.size, Z within [beachZ, WORLD.size]) — with a margin from the
// clamp wall. Builds each level many times and checks every spawned item's position.
import { Level } from './src/levels/Level.js';
import { WORLD, LEVELS, makeEndlessLevel } from './src/config.js';

const fakeScene = { add() {}, remove() {} };
const fakeAudio = new Proxy({}, { get: () => () => {} });
const fakeEffects = { burst() {}, tsunami: null, spawnTsunami() { this.tsunami = { position: { z: 0 }, material: {} }; return this.tsunami; } };
const econ = { coinMultiplier: () => 1, addCoins() {}, statValue: () => 1, accessoryMagnetBonus: () => 0 };

let pass = 0, fail = 0;
const ok = (n, c, e = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${e}`); c ? pass++ : fail++; };

const S = WORLD.size, MARGIN = 4;
// L6 (tsunami) builds a makeSign (needs DOM) and spawns no coins/power-ups anyway — checked in
// the browser playtest instead. Everything else (incl. endless) is checked here.
const defs = [...LEVELS.filter((d) => !d.tsunami), makeEndlessLevel(7), makeEndlessLevel(20), makeEndlessLevel(50)];

for (const def of defs) {
  let coinMaxX = 0, puMaxX = 0, coralMaxX = 0, coinOut = 0, puOut = 0, coralOut = 0, zOut = 0, total = 0;
  for (let rep = 0; rep < 30; rep++) {
    const lv = new Level(fakeScene, def, econ, fakeAudio, fakeEffects);
    const check = (m, kind) => {
      total++;
      const x = Math.abs(m.position.x), z = m.position.z;
      if (x > S) { if (kind === 'coin') coinOut++; else if (kind === 'pu') puOut++; else coralOut++; }
      if (z < WORLD.beachZ || z > S) zOut++;
      if (kind === 'coin') coinMaxX = Math.max(coinMaxX, x);
      else if (kind === 'pu') puMaxX = Math.max(puMaxX, x);
      else coralMaxX = Math.max(coralMaxX, x);
    };
    lv.coins.forEach((m) => check(m, 'coin'));
    (lv.powerups || []).forEach((m) => check(m, 'pu'));
    lv.corals.forEach((m) => check(m, 'coral'));
  }
  const tag = def.endless ? `Endless ${def.id}` : `L${def.id}`;
  ok(`${tag}: coins in ±S (maxX=${coinMaxX.toFixed(0)}/${S})`, coinOut === 0);
  ok(`${tag}: power-ups in ±S (maxX=${puMaxX.toFixed(0)})`, puOut === 0);
  ok(`${tag}: corals in ±S (maxX=${coralMaxX.toFixed(0)})`, coralOut === 0);
  ok(`${tag}: all Z in [beachZ, S]`, zOut === 0, `zOut=${zOut}`);
  ok(`${tag}: coins within margin ±(S-${MARGIN})`, coinMaxX <= S - MARGIN, `maxX=${coinMaxX.toFixed(0)} limit=${S - MARGIN}`);
  ok(`${tag}: power-ups within margin`, puMaxX <= S - MARGIN);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
