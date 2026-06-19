// Pure-logic unit tests (no browser): daily streak rules + save merge.
import { claimDaily, dailyStatus, dailyReward } from './src/economy/daily.js';
import { mergeSaves } from './src/save/SaveManager.js';
import { rotateInput } from './src/systems/cameraRelative.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  got=${JSON.stringify(got)}${ok ? '' : ' want=' + JSON.stringify(want)}`);
  ok ? pass++ : fail++;
};

// --- DAILY STREAK ---
// Day 100 first claim -> streak 1
const sd = { dailyStreak: 0 };
let r = claimDaily(sd, 100);
eq('daily first claim -> streak 1', [r.ok, r.streak, r.reward], [true, 1, 50]);
// same day again -> blocked
r = claimDaily(sd, 100);
eq('daily same day blocked', r.ok, false);
// next consecutive day -> streak 2, reward 75
r = claimDaily(sd, 101);
eq('daily consecutive -> streak 2', [r.ok, r.streak, r.reward], [true, 2, 75]);
// skip a day (gap) -> reset to 1
r = claimDaily(sd, 105);
eq('daily missed day -> reset to 1', [r.ok, r.streak, r.reward], [true, 1, 50]);
// build to streak 5 -> gem bonus
const sd2 = { dailyStreak: 0 };
claimDaily(sd2, 1); claimDaily(sd2, 2); claimDaily(sd2, 3); claimDaily(sd2, 4);
r = claimDaily(sd2, 5);
eq('daily streak 5 -> +1 gem', [r.streak, r.gems], [5, 1]);
eq('dailyStatus available after new day', dailyStatus(sd2, 6).available, true);
eq('dailyStatus unavailable same day', dailyStatus(sd2, 5).available, false);

// --- MERGE SAVES (cloud sync never drops progress) ---
const local = { coins: 100, highestLevel: 3, ownedSkins: ['blue', 'green'], upgrades: { speed: 2, luck: 0 } };
const remote = { coins: 50, highestLevel: 5, ownedSkins: ['blue', 'pirate'], upgrades: { speed: 1, luck: 3 } };
const m = mergeSaves(local, remote);
eq('merge takes max coins', m.coins, 100);
eq('merge takes max level', m.highestLevel, 5);
eq('merge unions skins', m.ownedSkins.sort(), ['blue', 'green', 'pirate']);
eq('merge max upgrade speed', m.upgrades.speed, 2);
eq('merge max upgrade luck', m.upgrades.luck, 3);

// --- CAMERA-RELATIVE rotation layer (independent of Input core) ---
const r2 = (o) => [+o.x.toFixed(3), +o.z.toFixed(3)];
// yaw 0 == identity (so classic mapping + input-test stay valid)
eq('camrel yaw0 identity (fwd)', r2(rotateInput(0, 1, 0)), [0, 1]);
eq('camrel yaw0 identity (right)', r2(rotateInput(-1, 0, 0)), [-1, 0]);
// yaw 90deg: forward(0,1) -> +X ; right intent rotates accordingly
eq('camrel yaw90 forward->+X', r2(rotateInput(0, 1, Math.PI / 2)), [1, 0]);
eq('camrel yaw90 (1,0)->(0,-1)', r2(rotateInput(1, 0, Math.PI / 2)), [0, -1]);
// yaw 180deg: forward flips to -Z
eq('camrel yaw180 forward->-Z', r2(rotateInput(0, 1, Math.PI)), [0, -1]);
// magnitude preserved
const rm = rotateInput(0.6, -0.4, 1.0); eq('camrel preserves length', +Math.hypot(rm.x, rm.z).toFixed(3), +Math.hypot(0.6, -0.4).toFixed(3));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
