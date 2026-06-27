// Daily Missions — built on daily.js's dayIndex(). Each day the player gets 3 seeded missions
// (same for that player that day, fresh the next day). Progress is driven by REAL gameplay events
// (coins collected, dives played/cleared, endless depth, wheel spins). Pure functions operating on
// the save object so they're easy to unit-test with a controllable "today".
import { dayIndex } from './daily.js';

// Mission templates. `track` names the event type; bump<event> feeds progress.
const POOL = [
  { type: 'collect_coins', tmin: 80, tmax: 160, step: 20, label: (t) => `Collect ${t} coins in dives`, reward: { coins: 90 } },
  { type: 'clear_levels',  tmin: 2,  tmax: 3,   step: 1,  label: (t) => `Clear ${t} dives`,            reward: { coins: 130 } },
  { type: 'play_levels',   tmin: 3,  tmax: 4,   step: 1,  label: (t) => `Play ${t} dives`,             reward: { coins: 70 } },
  { type: 'endless_depth', tmin: 8,  tmax: 13,  step: 1,  label: (t) => `Reach Endless Depth ${t}`,    reward: { coins: 110, gems: 1 } },
  { type: 'spin_wheel',    tmin: 1,  tmax: 2,   step: 1,  label: (t) => `Spin the Lucky Wheel ${t}x`,  reward: { coins: 60 } },
];
const ALL_DONE_BONUS = { coins: 150, gems: 1 };

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick 3 DISTINCT missions for the day, seeded by the day index (reproducible).
export function generateMissions(today) {
  const rng = mulberry32(((today + 1) * 2654435761) >>> 0);
  const pool = POOL.slice();
  const picks = [];
  while (picks.length < 3 && pool.length) {
    const tpl = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    const steps = Math.floor((tpl.tmax - tpl.tmin) / tpl.step) + 1;
    const target = tpl.tmin + Math.floor(rng() * steps) * tpl.step;
    picks.push({ id: tpl.type, type: tpl.type, target, progress: 0, claimed: false, label: tpl.label(target), reward: tpl.reward });
  }
  return picks;
}

// Make sure save.data.missions matches today; regenerate (and reset progress) on a new day.
export function ensureDailyMissions(save, today = dayIndex()) {
  const m = save.data.missions;
  if (!m || m.day !== today) {
    save.data.missions = { day: today, list: generateMissions(today), bonusClaimed: false };
    save.markDirty();
  }
  return save.data.missions;
}

// Feed a gameplay event into matching missions. mode 'add' increments; 'max' sets a high-water mark
// (used for endless depth). Capped at the target. No effect on already-claimed missions.
export function bumpMission(save, type, amount = 1, mode = 'add') {
  if (!save?.data) return;
  const m = ensureDailyMissions(save);
  let changed = false;
  for (const ms of m.list) {
    if (ms.type !== type || ms.claimed) continue;
    const nv = mode === 'max' ? Math.min(ms.target, Math.max(ms.progress, amount)) : Math.min(ms.target, ms.progress + amount);
    if (nv !== ms.progress) { ms.progress = nv; changed = true; }
  }
  if (changed) save.markDirty();
}

// Claim a completed mission's reward (once). Completing ALL three pays a one-time bonus.
export function claimMission(save, economy, id) {
  const m = ensureDailyMissions(save);
  const ms = m.list.find((x) => x.id === id);
  if (!ms || ms.claimed || ms.progress < ms.target) return false;
  ms.claimed = true;
  if (ms.reward.coins) economy.addCoins(ms.reward.coins);
  if (ms.reward.gems) economy.addGems(ms.reward.gems);
  if (m.list.every((x) => x.claimed) && !m.bonusClaimed) {
    m.bonusClaimed = true;
    economy.addCoins(ALL_DONE_BONUS.coins); economy.addGems(ALL_DONE_BONUS.gems);
  }
  save.markDirty();
  return true;
}

export const ALL_DONE = ALL_DONE_BONUS;
