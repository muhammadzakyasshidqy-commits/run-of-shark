// Browser feature tests: coral collision, split-route geometry+completion,
// lucky wheel economy effect, achievement triggers, cloud-fallback safety.
import { chromium } from 'playwright';
const URL = 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle' });
await sleep(500);

// ---------- ITEM 1: CORAL COLLISION ----------
const coral = await page.evaluate(async () => {
  const g = window.__ROS.game;
  g.startLevel(2); g.cinematic = null; g.controlLocked = false; g.paused = true;
  const lvl = g.level, p = g.player;
  const c = lvl.solids.find((s) => s.type === 'circle');
  const expectedStop = c.r + lvl.playerRadius; // 0.75 + 0.5 = 1.25
  // approach the coral head-on from -X, driving past its centre each frame
  p.pos.set(c.pos.x - 6, 0.2, c.pos.z);
  const dt = 1 / 60, dists = [];
  for (let i = 0; i < 200; i++) {
    p.pos.x += 9 * dt;                 // drive straight toward/through the coral
    lvl.resolveCollisions(p);
    dists.push(+Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z).toFixed(3));
  }
  const minDist = Math.min(...dists);
  const finalDist = dists[dists.length - 1];
  const penetrated = minDist < expectedStop - 0.06;
  return { coralR: c.r, playerR: lvl.playerRadius, expectedStop: +expectedStop.toFixed(3), minDist, finalDist, penetrated };
});

// ---------- ITEM 2: SPLIT ROUTE (Level 4) ----------
const split = await page.evaluate(async () => {
  const g = window.__ROS.game;
  const drive = (startX, viaX) => {
    g.startLevel(3); g.cinematic = null; g.controlLocked = false; g.paused = true;
    const lvl = g.level, p = g.player;
    lvl.state = 'escape'; lvl.collected = lvl.def.coinsToWin; // allow win on reaching sub
    lvl.sharks.forEach((s) => (s.active = false));
    p.hp = 99; p.invuln = 1e9;
    const sub = lvl.submarine.position;
    p.pos.set(startX, 0.2, -50);
    const dt = 1 / 60; let result = null;
    // waypoints: go up the chosen lane, then converge to the submarine
    const wps = [[viaX, 80], [sub.x, sub.z]];
    let wp = 0;
    for (let i = 0; i < 3000 && !result; i++) {
      const [tx, tz] = wps[Math.min(wp, wps.length - 1)];
      const dx = tx - p.pos.x, dz = tz - p.pos.z, d = Math.hypot(dx, dz) || 1;
      p.pos.x += (dx / d) * 12 * dt; p.pos.z += (dz / d) * 12 * dt;
      if (d < 2 && wp < wps.length - 1) wp++;
      result = lvl.update(dt, p);
    }
    return result;
  };
  // center-blocked probe: try to push straight up through the divider at x=0
  g.startLevel(3); g.cinematic = null; g.controlLocked = false; g.paused = true;
  const lvl = g.level, p = g.player;
  const box = lvl.solids.find((s) => s.type === 'box');
  p.pos.set(0, 0.2, box.pos.z - box.hz - 4); const dt = 1 / 60; let crossed = false, maxAbsX = 0;
  for (let i = 0; i < 600; i++) {
    p.pos.z += 10 * dt;                 // push straight north through the wall
    p.pos.x = 0 + 0;                    // keep trying to stay centered
    lvl.resolveCollisions(p);
    maxAbsX = Math.max(maxAbsX, Math.abs(p.pos.x));
    // did we get through the wall's z-span while staying near center? that would be a tunnel
    if (Math.abs(p.pos.x) < box.hx && p.pos.z > box.pos.z + box.hz) crossed = true;
  }
  return {
    hasDivider: !!box, dividerHx: box?.hx,
    centerTunneled: crossed, pushedOffCenterBy: +maxAbsX.toFixed(2),
    leftRouteResult: drive(-18, -18),
    rightRouteResult: drive(18, 18),
  };
});

// ---------- ITEM 4a: LUCKY WHEEL applies to economy (deterministic via Math.random stub) ----------
const wheel = await page.evaluate(async () => {
  const g = window.__ROS.game, ui = window.__ROS.ui, e = window.__ROS.economy;
  const realRand = Math.random;
  const spinWith = (rv) => {
    Math.random = () => rv;
    e.s.gems = 5; e.s.coins = 0; e.s.cash = 0;
    const before = { coins: e.s.coins, cash: e.s.cash, gems: e.s.gems };
    ui.showWheel();
    [...document.querySelectorAll('.btn')].find((b) => b.textContent.includes('Spin (')).click();
    return { before, after: { coins: e.s.coins, cash: e.s.cash, gems: e.s.gems } };
  };
  const first = spinWith(0);       // index 0 -> "+50 Coins"
  const last = spinWith(0.99);     // index 5 -> "+25 Cash"
  Math.random = realRand;
  return { first, last };
});

// ---------- ITEM 4b: ACHIEVEMENTS trigger from real progress ----------
const achv = await page.evaluate(() => {
  const e = window.__ROS.economy, s = e.s;
  s.achievements = []; s.totalCoins = 0; s.levelsCleared = 0; s.bossesBeaten = 0;
  e.checkAchievements();
  const atZero = [...s.achievements];
  s.totalCoins = 100; e.checkAchievements();
  const after100 = s.achievements.includes('coins_100');
  s.levelsCleared = 1; e.checkAchievements();
  const afterClear = s.achievements.includes('first_escape');
  s.bossesBeaten = 1; e.checkAchievements();
  const afterBoss = s.achievements.includes('first_boss');
  return { atZero, after100, afterClear, afterBoss };
});

// ---------- ITEM 5: CLOUD FALLBACK never loses local save ----------
const cloud = await page.evaluate(async () => {
  const { SaveManager } = await import('/src/save/SaveManager.js');
  localStorage.removeItem('run-of-shark:save:v1');
  // a) push rejects -> local still written, no throw
  const failing = { push: () => Promise.reject(new Error('offline')), pull: () => Promise.reject(new Error('offline')) };
  const sm = new SaveManager(failing);
  sm.data.coins = 777; sm.markDirty();
  let threw = false; try { sm.save(); } catch { threw = true; }
  await new Promise((r) => setTimeout(r, 20));
  const local = JSON.parse(localStorage.getItem('run-of-shark:save:v1'));
  // b) syncFromCloud pull fails -> local untouched
  const beforeCoins = sm.data.coins;
  const sync = await sm.syncFromCloud();
  // c) syncFromCloud with higher remote -> merged
  sm.cloud = { push: () => Promise.resolve(), pull: () => Promise.resolve({ highestLevel: 6, coins: 10 }) };
  const sync2 = await sm.syncFromCloud();
  // d) default provider unconfigured -> guest
  const configured = window.__ROS.cloud.isConfigured();
  return {
    pushRejectThrew: threw, localPersistedCoins: local?.coins,
    syncFailReason: sync.reason, coinsUnchangedAfterFail: sm.data.coins >= beforeCoins,
    mergedHighestLevel: sm.data.highestLevel, mergeKeptLocalCoins: sm.data.coins,
    defaultConfigured: configured,
  };
});

console.log('===FEATURE_TEST_JSON===');
console.log(JSON.stringify({ coral, split, wheel, achv, cloud, pageErrors: errs }, null, 2));
await browser.close();
