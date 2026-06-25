// Areas C+D: economy correctness (buy/equip deduct + persist), bank math, wheel/daily/achievement
// payouts, and exploit checks (negative spend, double-buy, overspend).
import { Economy } from './src/economy/Economy.js';
import { SKINS, ACCESSORIES, VEHICLES, UPGRADES, WHEEL_PRIZES, ACHIEVEMENTS } from './src/config.js';
import { claimDaily } from './src/economy/daily.js';

const mkSave = (over = {}) => ({ markDirty() {}, data: {
  coins: 0, cash: 0, gems: 0, totalCoins: 0, bank: 0, bankLevel: 1,
  upgrades: {}, achievements: [], ownedSkins: ['blue'], equippedSkin: 'blue',
  ownedAccessories: [], equippedAccessory: null, ownedVehicles: [], equippedVehicle: null,
  levelsCleared: 0, bossesBeaten: 0, bankLevelHistory: [], ...over } });
let pass = 0, fail = 0;
const ok = (n, c, e = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${e}`); c ? pass++ : fail++; };

// ---- buy skin: deduct + own + cannot double-buy + cannot overspend ----
{ const e = new Economy(mkSave({ coins: 1000 }));
  const sk = SKINS.find(x => x.cost > 0);
  ok('buy skin deducts + owns', e.buySkin(sk.id) && e.s.coins === 1000 - sk.cost && e.s.ownedSkins.includes(sk.id), `coins=${e.s.coins}`);
  const c1 = e.s.coins; ok('cannot re-buy owned skin', e.buySkin(sk.id) === false && e.s.coins === c1);
  const e2 = new Economy(mkSave({ coins: 0 })); ok('cannot buy skin with no coins', e2.buySkin(sk.id) === false && e2.s.coins === 0);
}
// ---- accessory ----
{ const e = new Economy(mkSave({ coins: 5000 }));
  const a = ACCESSORIES[0];
  ok('buy accessory deducts+owns', e.buyAccessory(a.id) && e.s.coins === 5000 - a.cost && e.s.ownedAccessories.includes(a.id));
  ok('no double accessory', e.buyAccessory(a.id) === false);
}
// ---- vehicle: auto-equip first, equip persists ----
{ const e = new Economy(mkSave({ coins: 50000 }));
  const v = VEHICLES[0];
  ok('buy vehicle deducts + auto-equips first', e.buyVehicle(v.id) && e.s.equippedVehicle === v.id && e.s.coins === 50000 - v.cost);
  const v2 = VEHICLES[1]; e.buyVehicle(v2.id); e.equipVehicle(v2.id);
  ok('equip switches vehicle', e.s.equippedVehicle === v2.id);
  ok('cannot equip unowned vehicle', e.equipVehicle('nope') === false);
}
// ---- upgrade: cost grows, capped at max ----
{ const e = new Economy(mkSave({ coins: 1e9 }));
  const c0 = e.upgradeCost('speed'); e.buyUpgrade('speed'); const c1 = e.upgradeCost('speed');
  ok('upgrade cost grows', c1 > c0, `c0=${c0} c1=${c1}`);
  for (let i = 0; i < 20; i++) e.buyUpgrade('speed');
  ok('upgrade caps at max', (e.s.upgrades.speed || 0) === UPGRADES.speed.max, `lvl=${e.s.upgrades.speed}`);
  ok('buying at max returns false', e.buyUpgrade('speed') === false);
}
// ---- bank: convert / deposit / withdraw / capacity ----
{ const e = new Economy(mkSave({ coins: 1000 }));
  const got = e.convertCoinsToCash(1000);
  ok('convert 1000 coins -> 100 cash', got === 100 && e.s.cash === 100 && e.s.coins === 0, `cash=${e.s.cash} coins=${e.s.coins}`);
  e.deposit(100); ok('deposit 100 -> vault 100, cash 0', e.s.bank === 100 && e.s.cash === 0);
  e.withdraw(40); ok('withdraw 40 -> vault 60, cash 40', e.s.bank === 60 && e.s.cash === 40);
  ok('cannot withdraw more than vault', e.withdraw(1000) === 60 && e.s.cash === 100 && e.s.bank === 0);
  // capacity cap on deposit
  const e2 = new Economy(mkSave({ cash: 99999, bankLevel: 1 }));
  const dep = e2.deposit(99999); ok('deposit capped at capacity', e2.s.bank === e2.bankCapacity && dep === e2.bankCapacity, `bank=${e2.s.bank}/${e2.bankCapacity}`);
}
// ---- bank upgrade ----
{ const e = new Economy(mkSave({ cash: 100000, bankLevel: 1 }));
  const before = e.s.bankLevel; const cost = e.bankUpgradeCost(); ok('bank upgrade deducts cash + raises level', e.upgradeBank() && e.s.bankLevel === before + 1 && e.s.cash === 100000 - cost);
}
// ---- wheel prizes apply correctly (pre-unlock all achievements so their bonuses don't skew) ----
{ const e = new Economy(mkSave({ achievements: ACHIEVEMENTS.map(a => a.id) }));
  const c0 = e.s.coins, g0 = e.s.gems, ca0 = e.s.cash;
  WHEEL_PRIZES.forEach(pz => pz.apply(e));
  // sum of all prizes: +50+150+300 coins, +1+5 gems, +25 cash
  ok('wheel prizes pay coins', e.s.coins - c0 === 500, `dc=${e.s.coins - c0}`);
  ok('wheel prizes pay gems', e.s.gems - g0 === 6, `dg=${e.s.gems - g0}`);
  ok('wheel prizes pay cash', e.s.cash - ca0 === 25, `dca=${e.s.cash - ca0}`);
}
// ---- achievement reward fires once ----
{ const e = new Economy(mkSave({ coins: 0 })); e.s.levelsCleared = 1; e.checkAchievements();
  const got = e.s.achievements.includes('first_escape'); const c1 = e.s.coins;
  e.checkAchievements(); ok('achievement reward paid once (not repeatable)', got && e.s.coins === c1 && c1 >= 100, `coins=${c1}`);
}
// ---- daily streak payout ----
{ const sd = { dailyStreak: 0 }; const r = claimDaily(sd, 1000); ok('daily claim pays + cannot reclaim', r.ok && r.reward === 50 && claimDaily(sd, 1000).ok === false); }

// ---- EXPLOIT checks ----
{ const e = new Economy(mkSave({ coins: 100 }));
  ok('cannot spend more coins than held', e.spendCoins(200) === false && e.s.coins === 100);
  ok('convert with too few coins yields 0', new Economy(mkSave({ coins: 5 })).convertCoinsToCash(100) === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
