// Functional-accessory proof (numbers): equip each accessory and assert its effect is ACTIVE on
// a real Player/Economy — HP, swim speed, sprint, magnet radius, coin multiplier.
import { Economy } from './src/economy/Economy.js';
import { Player } from './src/entities/Player.js';
import { UPGRADES } from './src/config.js';

const fakeScene = { add() {}, remove() {} };
const mkSave = (over = {}) => ({
  markDirty() {}, data: {
    coins: 0, cash: 0, gems: 0, totalCoins: 0, bank: 0, bankLevel: 1,
    upgrades: {}, achievements: [], ownedSkins: ['blue'], equippedSkin: 'blue',
    ownedAccessories: [], equippedAccessory: null,
    ownedVehicles: [], equippedVehicle: null, ...over,
  },
});
const econ = (acc) => new Economy(mkSave({ equippedAccessory: acc }));

let pass = 0, fail = 0;
const near = (a, b) => Math.abs(a - b) < 1e-3;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${extra}`); cond ? pass++ : fail++; };

// speed with no sprint = base * (1 + vehicleBonus + accSpeedBonus)
const lvlSpeed = (e) => { const p = new Player(fakeScene, e, 0x2ec4ff); p.update(1 / 60, { x: 0, z: 1, len: 1, sprint: false }, 'level'); return p._lastSpeed; };
const baseSpeed = UPGRADES.speed.base; // 9

// --- baseline (no accessory) ---
const e0 = econ(null);
ok('baseline HP = 3', new Player(fakeScene, e0, 0x2ec4ff).hp === 3);
ok('baseline magnet = 3', near(new Player(fakeScene, e0, 0x2ec4ff).magnetRadius, UPGRADES.magnet.base));
ok('baseline speed = 9', near(lvlSpeed(e0), baseSpeed), `got=${lvlSpeed(e0)}`);
ok('baseline coinMult = 1.0', near(e0.coinMultiplier(), 1.0));

// --- Diving Helmet: +2 HP ---
ok('helmet -> HP 5', new Player(fakeScene, econ('helmet'), 0x2ec4ff).hp === 5);

// --- Military Helmet: +1 HP, +0.15 sprint ---
const eMil = econ('milhelmet');
ok('milhelmet -> HP 4', new Player(fakeScene, eMil, 0x2ec4ff).hp === 4);
{ const p = new Player(fakeScene, eMil, 0x2ec4ff); p.stamina = 100; p.update(1 / 60, { x: 0, z: 1, len: 1, sprint: true }, 'level');
  const expect = baseSpeed * (UPGRADES.sprint.base + 0.15); ok('milhelmet -> sprint includes +0.15', near(p._lastSpeed, expect), `got=${p._lastSpeed.toFixed(2)} expect=${expect.toFixed(2)}`); }

// --- Backpack: +3 magnet, +15% coin ---
ok('backpack -> magnet 6', near(new Player(fakeScene, econ('backpack'), 0x2ec4ff).magnetRadius, UPGRADES.magnet.base + 3));
ok('backpack -> coinMult 1.15', near(econ('backpack').coinMultiplier(), 1.15));

// --- Sunglasses: +2 magnet, +5% coin ---
ok('sunglasses -> magnet 5', near(new Player(fakeScene, econ('sunglasses'), 0x2ec4ff).magnetRadius, UPGRADES.magnet.base + 2));
ok('sunglasses -> coinMult 1.05', near(econ('sunglasses').coinMultiplier(), 1.05));

// --- Crown: +30% coin ---
ok('crown -> coinMult 1.30', near(econ('crown').coinMultiplier(), 1.30));
// --- Pirate Hat: +18% coin, +1 magnet ---
ok('piratehat -> coinMult 1.18', near(econ('piratehat').coinMultiplier(), 1.18));

// --- Jetpack: +18% swim speed, dash flag ---
const eJet = econ('jetpack');
ok('jetpack -> swim speed +18%', near(lvlSpeed(eJet), baseSpeed * 1.18), `got=${lvlSpeed(eJet).toFixed(2)} expect=${(baseSpeed * 1.18).toFixed(2)}`);
ok('jetpack -> hasDash true', eJet.hasDash() === true);
// dash burst: while sprinting, speed spikes well above plain sprint at least once within cooldown
{ const p = new Player(fakeScene, eJet, 0x2ec4ff); p.stamina = 100; let peak = 0;
  for (let i = 0; i < 60; i++) { p.update(1 / 60, { x: 0, z: 1, len: 1, sprint: true }, 'level'); peak = Math.max(peak, p._lastSpeed); }
  const plainSprint = baseSpeed * 1.18 * (UPGRADES.sprint.base + 0.35);
  ok('jetpack -> dash burst exceeds plain sprint', peak > plainSprint * 1.5, `peak=${peak.toFixed(1)} plainSprint=${plainSprint.toFixed(1)}`); }

// accessory effect does NOT leak into HUB mode (speed unchanged on land)
{ const p = new Player(fakeScene, eJet, 0x2ec4ff); p.update(1 / 60, { x: 0, z: 1, len: 1, sprint: false }, 'hub'); ok('jetpack speed bonus is dive-only (hub unaffected)', near(p._lastSpeed, baseSpeed), `got=${p._lastSpeed.toFixed(2)}`); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
