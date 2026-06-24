// Shark stays in the sea: a shark chasing a player who flees onto the BEACH must stop at the
// water's edge (Shark.SEA_EDGE_Z), never crossing onto the dry sand (WORLD.beachZ).
import { Shark } from './src/entities/Shark.js';
import { WORLD } from './src/config.js';

const fakeScene = { add() {}, remove() {} };
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${extra}`); cond ? pass++ : fail++; };

// normal shark, chase a target sitting ON the dry sand (beachZ)
const sh = new Shark(fakeScene, 'normal', 1);
sh.pos.set(0, -0.5, WORLD.beachZ + 22);          // spawn point (in water)
const target = { x: 0, z: WORLD.beachZ };          // player on the sand
for (let i = 0; i < 600; i++) sh.update(1 / 60, target); // ~10s of chasing

ok('shark stops at sea edge (z >= SEA_EDGE_Z)', sh.pos.z >= Shark.SEA_EDGE_Z - 1e-6, `z=${sh.pos.z.toFixed(2)} edge=${Shark.SEA_EDGE_Z}`);
ok('shark never reaches the sand (z > beachZ + 10)', sh.pos.z > WORLD.beachZ + 10, `z=${sh.pos.z.toFixed(2)} beachZ=${WORLD.beachZ}`);

// boss also respects the edge
const boss = new Shark(fakeScene, 'boss', 1);
boss.pos.set(0, -0.4, WORLD.beachZ + 30);
for (let i = 0; i < 600; i++) boss.update(1 / 60, { x: 0, z: WORLD.beachZ });
ok('boss stops at sea edge', boss.pos.z >= Shark.SEA_EDGE_Z - 1e-6, `z=${boss.pos.z.toFixed(2)}`);

// sanity: when the player is OUT in deep water, the shark still closes in normally
const sh2 = new Shark(fakeScene, 'normal', 1);
sh2.pos.set(0, -0.5, 60);
for (let i = 0; i < 120; i++) sh2.update(1 / 60, { x: 0, z: 20 });
ok('shark still chases in open water', sh2.pos.z < 60 && sh2.pos.z > 18, `z=${sh2.pos.z.toFixed(2)}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
