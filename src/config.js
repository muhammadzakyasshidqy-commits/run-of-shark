// Central tuning + content data for RUN OF SHARK.
// Keeping data here keeps systems modular and easy to balance.

export const WORLD = {
  size: 120,          // playfield half-extent on X/Z
  waterLevel: 0,
  beachZ: -90,        // where the boat / beach sits
};

export const SHARK_TYPES = {
  normal:    { name: 'Normal Shark',    color: 0x6c7a89, speed: 7.5,  scale: 1.0 },
  fast:      { name: 'Fast Shark',      color: 0x4a90d9, speed: 10.5, scale: 0.9 },
  mutant:    { name: 'Mutant Shark',    color: 0x7bed9f, speed: 9.0,  scale: 1.15 },
  hammerhead:{ name: 'Hammerhead',      color: 0x95a5a6, speed: 8.5,  scale: 1.1 },
  ghost:     { name: 'Ghost Shark',     color: 0xdfe6e9, speed: 9.5,  scale: 1.0 },
  boss:      { name: 'Boss Shark',      color: 0x2d3436, speed: 8.0,  scale: 2.2 },
  kraken:    { name: 'Kraken Boss',     color: 0x130f40, speed: 9.0,  scale: 3.2 },
};

// Six levels matching the design brief.
export const LEVELS = [
  { id: 1, name: 'First Dive',     coinsToWin: 8,  sharks: [{ type: 'normal', delay: 4 }], corals: 6,  objective: 'Collect 8 treasures, then reach the YELLOW SUBMARINE' },
  { id: 2, name: 'Faster Waters',  coinsToWin: 12, sharks: [{ type: 'fast', delay: 3 }], corals: 10, objective: 'Coins are everywhere — grab 12 and escape the fast shark' },
  { id: 3, name: 'Coral Maze',     coinsToWin: 14, sharks: [{ type: 'normal', delay: 3 }, { type: 'fast', delay: 7 }], corals: 22, objective: 'Two sharks hunt you. Collect 14 and reach the sub' },
  { id: 4, name: 'Mutant Depths',  coinsToWin: 16, sharks: [{ type: 'mutant', delay: 2 }, { type: 'hammerhead', delay: 6 }], corals: 14, splitRoute: true,
    // Central divider wall splits the field into LEFT (risky/fast) and RIGHT (safe/slow) lanes.
    barriers: [{ x: 0, z: 35, hx: 2.5, hz: 50 }],
    objective: 'Pick a lane: LEFT (shark close) or RIGHT (longer, more coral)' },
  { id: 5, name: 'Boss Arena',     coinsToWin: 0,  boss: 'boss', bossHp: 5, hazards: 7, corals: 0, objective: 'Bait the BOSS into the sharp rocks!' },
  { id: 6, name: 'Final Escape',   coinsToWin: 0,  boss: 'kraken', tsunami: true, corals: 6, objective: 'Reach the LUXURY CAR before the TSUNAMI hits!' },
];

// Upgradeable player stats. value = base, perLevel = gain, cost grows.
export const UPGRADES = {
  speed:        { name: 'Swim Speed',       base: 9,   perLevel: 0.9, baseCost: 60,  max: 8, icon: '🏊' },
  sprint:       { name: 'Sprint Power',     base: 1.5, perLevel: 0.12, baseCost: 80,  max: 6, icon: '⚡' },
  stamina:      { name: 'Stamina',          base: 100, perLevel: 25,  baseCost: 70,  max: 6, icon: '🫁' },
  luck:         { name: 'Luck',             base: 1,   perLevel: 0.15, baseCost: 90,  max: 6, icon: '🍀' },
  magnet:       { name: 'Coin Magnet',      base: 3,   perLevel: 1.4, baseCost: 100, max: 6, icon: '🧲' },
  resistance:   { name: 'Shark Resistance', base: 0,   perLevel: 1,   baseCost: 120, max: 5, icon: '🛡️' },
};

export const SKINS = [
  { id: 'blue',    name: 'Blue',         color: 0x2ec4ff, cost: 0 },
  { id: 'green',   name: 'Green',        color: 0x06d6a0, cost: 0 },
  { id: 'purple',  name: 'Purple',       color: 0x9b59b6, cost: 0 },
  { id: 'orange',  name: 'Orange',       color: 0xff9f43, cost: 0 },
  { id: 'diver',   name: 'Diver',        color: 0x34495e, cost: 500 },
  { id: 'military',name: 'Military',     color: 0x4b5320, cost: 800 },
  { id: 'ninja',   name: 'Ninja',        color: 0x1a1a1a, cost: 1200 },
  { id: 'astro',   name: 'Astronaut',    color: 0xecf0f1, cost: 1800 },
  { id: 'pirate',  name: 'Pirate',       color: 0x8b4513, cost: 2200 },
  { id: 'hunter',  name: 'Shark Hunter', color: 0xc0392b, cost: 3000 },
  { id: 'golden',  name: 'Golden Suit',  color: 0xffd166, cost: 6000 },
];

export const ACCESSORIES = [
  { id: 'sunglasses', name: 'Sunglasses',     cost: 200 },
  { id: 'helmet',     name: 'Diving Helmet',  cost: 400 },
  { id: 'backpack',   name: 'Backpack',       cost: 600 },
  { id: 'crown',      name: 'Golden Crown',   cost: 2500 },
  { id: 'piratehat',  name: 'Pirate Hat',     cost: 900 },
  { id: 'milhelmet',  name: 'Military Helmet',cost: 1100 },
  { id: 'jetpack',    name: 'Jetpack',        cost: 4000 },
];

export const VEHICLES = [
  { id: 'atv',    name: 'ATV',        color: 0xe74c3c, cost: 1000 },
  { id: 'buggy',  name: 'Buggy',      color: 0xf39c12, cost: 2500 },
  { id: 'jeep',   name: 'Jeep',       color: 0x27ae60, cost: 5000 },
  { id: 'sports', name: 'Sports Car', color: 0x2980b9, cost: 12000 },
  { id: 'luxury', name: 'Luxury Car', color: 0xffd166, cost: 30000 },
];

export const ACHIEVEMENTS = [
  { id: 'first_escape', name: 'First Escape',  test: (s) => s.levelsCleared >= 1 },
  { id: 'coins_100',    name: '100 Coins',     test: (s) => s.totalCoins >= 100 },
  { id: 'coins_1000',   name: '1000 Coins',    test: (s) => s.totalCoins >= 1000 },
  { id: 'first_boss',   name: 'First Boss',    test: (s) => s.bossesBeaten >= 1 },
  { id: 'complete',     name: 'Complete Game', test: (s) => s.levelsCleared >= 6 },
  { id: 'max_speed',    name: 'Max Speed',     test: (s) => (s.upgrades?.speed || 0) >= UPGRADES.speed.max },
  { id: 'max_bank',     name: 'Max Bank',      test: (s) => s.bankLevel >= 5 },
  { id: 'all_skins',    name: 'All Skins',     test: (s) => (s.ownedSkins?.length || 0) >= SKINS.length },
];

export const WHEEL_PRIZES = [
  { label: '+50 Coins',  apply: (e) => e.addCoins(50) },
  { label: '+150 Coins', apply: (e) => e.addCoins(150) },
  { label: '+1 Gem',     apply: (e) => e.addGems(1) },
  { label: '+300 Coins', apply: (e) => e.addCoins(300) },
  { label: '+5 Gems',    apply: (e) => e.addGems(5) },
  { label: '+25 Cash',   apply: (e) => e.addCash(25) },
];
