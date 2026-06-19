// FASE 2 verification — drives the REAL Level 5 boss fight deterministically and
// records every HP drop, which attack caused it, and total time. Also verifies the
// fail-state (deliberately getting hit -> lose). Steps the sim with fixed dt (game paused).
import { chromium } from 'playwright';
const URL = 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage();
const logs = [];
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await sleep(600);

// ---- TEST A: beat the boss using ONLY the hazard-bait mechanic ----
const beat = await page.evaluate(async () => {
  const g = window.__ROS.game;
  g.startLevel(4); // Level 5 (index 4)
  // skip the intro cutscene for the headless run, then start the FSM
  g.cinematic = null; g.controlLocked = false; g.onCine(null);
  g.level.bossCtrl.begin();
  g.paused = true; // we step manually

  const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const c = g.level.bossCtrl, boss = g.level.boss, p = g.player, Hs = g.level.hazards;
  const dt = 1 / 60;
  let prevHp = boss.hp; const hits = []; const usedTimer = (boss.maxHp); // sanity
  let frames = 0; const cap = 9000;
  let defeatedByCallback = false;
  g.level.onBossDefeated = () => { defeatedByCallback = true; };

  while (!c.defeated && frames < cap && p.alive) {
    const hz = Hs.reduce((a, b) => (d(boss.pos, a.pos) < d(boss.pos, b.pos) ? a : b));
    const dirx = hz.pos.x - boss.pos.x, dz = hz.pos.z - boss.pos.z, L = Math.hypot(dirx, dz) || 1;
    if (c.state === 'idle' || c.state === 'recover' || c.state === 'frozen') {
      p.pos.x = hz.pos.x; p.pos.z = hz.pos.z - 2; p.invuln = 99;
    } else if (c.state === 'telegraph') {
      if (c.attack === 'charge' || c.attack === 'wave') { p.pos.x = boss.pos.x + (dirx / L) * (L - 2); p.pos.z = boss.pos.z + (dz / L) * (L - 2); }
      else { p.pos.x = boss.pos.x - (dirx / L) * 6; p.pos.z = boss.pos.z - (dz / L) * 6; }
      p.invuln = 99;
    } else { // charge / roar / wave executing -> dodge perpendicular
      p.pos.x += -c.lockDir.z * 3; p.pos.z += c.lockDir.x * 3; p.invuln = 99;
    }
    const attackBefore = c.attack;
    g.level.update(dt, p);
    if (boss.hp < prevHp) { hits.push({ attack: attackBefore, hpAfter: boss.hp, atSec: +(frames * dt).toFixed(2) }); prevHp = boss.hp; }
    frames++;
  }
  return {
    maxHp: boss.maxHp, finalHp: boss.hp, defeated: c.defeated, defeatedByCallback,
    totalHits: hits.length, hits, totalSimSeconds: +(frames * dt).toFixed(2),
    bossActiveStillTrue: boss.active, controllerStateAtEnd: c.state,
  };
});

// ---- TEST B: source-of-truth — confirm NO survive-timer path exists ----
const codeCheck = await page.evaluate(() => {
  const fn = window.__ROS.game.level.update.toString();
  return { mentionsElapsed35: /elapsed\s*>\s*35/.test(fn), mentionsWonByTimer: /wonByTimer/.test(fn) };
});

// ---- TEST C: fail-state — stand still and take hits -> must end in lose ----
const fail = await page.evaluate(async () => {
  const g = window.__ROS.game;
  g.startLevel(4);
  g.cinematic = null; g.controlLocked = false; g.onCine(null);
  g.level.bossCtrl.begin();
  g.paused = true;
  const boss = g.level.boss, p = g.player; const dt = 1 / 60;
  p.pos.set(boss.pos.x, 0.2, boss.pos.z); // hug the boss, never dodge, never invuln-cheat
  let frames = 0, result = null; const hp0 = p.hp;
  const noInput = { x: 0, z: 0, len: 0, sprint: false };
  while (frames < 4000 && !result) {
    p.update(dt, noInput);                  // mirror the real loop (decrements invuln)
    p.pos.set(boss.pos.x, 0.2, boss.pos.z); // refuse to dodge — sit on the boss
    result = g.level.update(dt, p);
    frames++;
  }
  return { startHp: hp0, endHp: p.hp, alive: p.alive, result, seconds: +(frames * dt).toFixed(2) };
});

console.log('===BOSS_TEST_JSON===');
console.log(JSON.stringify({ beat, codeCheck, fail, pageErrors: logs }, null, 2));
await browser.close();
