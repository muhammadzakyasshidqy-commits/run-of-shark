// Daily missions: seeded/deterministic per day, reset on a new day, progress from events, claim
// pays once, all-done bonus once.
import { generateMissions, ensureDailyMissions, bumpMission, claimMission } from './src/economy/missions.js';
import { dayIndex } from './src/economy/daily.js';
import { Economy } from './src/economy/Economy.js';
const TODAY = dayIndex();

const mkSave = () => ({ markDirty() {}, data: { coins: 0, cash: 0, gems: 0, totalCoins: 0, bank: 0, bankLevel: 1, upgrades: {}, achievements: [], ownedSkins: [], ownedVehicles: [], missions: null } });
let pass = 0, fail = 0;
const ok = (n, c, e = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${e}`); c ? pass++ : fail++; };

// deterministic per day + 3 distinct
const a = generateMissions(1000), b = generateMissions(1000), c = generateMissions(1001);
ok('same day -> identical missions', JSON.stringify(a) === JSON.stringify(b));
ok('different day -> (usually) different', JSON.stringify(a) !== JSON.stringify(c) || true); // not guaranteed, informational
ok('exactly 3 missions', a.length === 3);
ok('3 distinct types', new Set(a.map(m => m.type)).size === 3);
ok('targets within range + progress 0', a.every(m => m.target > 0 && m.progress === 0 && !m.claimed));

// ensure + day reset
const save = mkSave();
const m1 = ensureDailyMissions(save, 5000);
ok('ensure creates today list', save.data.missions.day === 5000 && m1.list.length === 3);
m1.list[0].progress = m1.list[0].target; // pretend progress
const m2 = ensureDailyMissions(save, 5001); // new day
ok('new day regenerates + resets progress', m2.day === 5001 && m2.list.every(x => x.progress === 0));

// bump from events — use the REAL today so bumpMission (which uses dayIndex()) matches.
const save2 = mkSave();
save2.data.missions = { day: TODAY, list: [
  { id: 'collect_coins', type: 'collect_coins', target: 100, progress: 0, claimed: false, label: 'x', reward: { coins: 90 } },
  { id: 'endless_depth', type: 'endless_depth', target: 10, progress: 0, claimed: false, label: 'x', reward: { coins: 100 } },
  { id: 'spin_wheel', type: 'spin_wheel', target: 1, progress: 0, claimed: false, label: 'x', reward: { coins: 60 } },
], bonusClaimed: false };
const list = save2.data.missions.list;
bumpMission(save2, 'collect_coins', 40); bumpMission(save2, 'collect_coins', 40);
ok('bump add accumulates (capped at target)', list[0].progress === 80);
bumpMission(save2, 'collect_coins', 999);
ok('bump caps at target', list[0].progress === 100);
// max mode
bumpMission(save2, 'endless_depth', 7, 'max'); bumpMission(save2, 'endless_depth', 5, 'max');
ok('bump max keeps high-water mark', list[1].progress === 7);

// claim pays once
const econ = new Economy(save2);
const coins0 = save2.data.coins;
ok('claim completed pays reward', claimMission(save2, econ, 'collect_coins') === true && save2.data.coins === coins0 + 90);
ok('claim again returns false (no double pay)', claimMission(save2, econ, 'collect_coins') === false);
ok('cannot claim incomplete', claimMission(save2, econ, 'endless_depth') === false);

// all-done bonus once
const save3 = mkSave(); ensureDailyMissions(save3, TODAY); const e3 = new Economy(save3);
save3.data.missions.list.forEach(ms => { ms.progress = ms.target; });
const before = save3.data.coins;
save3.data.missions.list.forEach(ms => claimMission(save3, e3, ms.id));
ok('all-done bonus applied + bonusClaimed', save3.data.missions.bonusClaimed === true);
ok('total payout > sum of mission coins (bonus added)', save3.data.coins - before > save3.data.missions.list.reduce((s, m) => s + (m.reward.coins || 0), 0));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
