// Honest automated smoke test — drives the real game in headless Chromium,
// captures ALL console output, and probes actual mechanics (no claims, just observations).
import { chromium } from 'playwright';

const URL = 'http://localhost:5173/';
const logs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 915 } }); // phone-ish

page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));

const out = {};

await page.goto(URL, { waitUntil: 'networkidle' });
await sleep(800);

// 1) Canvas + WebGL present?
out.webgl = await page.evaluate(() => {
  const c = document.getElementById('game-canvas');
  const gl = c?.getContext('webgl2') || c?.getContext('webgl');
  return { hasCanvas: !!c, hasWebGL: !!gl, size: [c?.width, c?.height] };
});

// 2) FPS sample over 2s
out.fps = await page.evaluate(() => new Promise((res) => {
  let f = 0; const t0 = performance.now();
  const tick = () => { f++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(Math.round((f * 1000) / (performance.now() - t0))); };
  requestAnimationFrame(tick);
}));

// 3) Start Level 1 via the real UI buttons
await page.getByText('▶ PLAY', { exact: false }).click();
await sleep(300);
await page.getByText('Play', { exact: true }).first().click();
await sleep(1500); // let fade + start

out.afterStart = await page.evaluate(() => {
  const g = window.__ROS.game;
  return { running: g.running, hasPlayer: !!g.player, hasLevel: !!g.level, objective: g.level?.objectiveText };
});

// 4) Coin collection: teleport player onto each coin, let RAF tick, observe collected count
out.collect = await page.evaluate(async () => {
  const g = window.__ROS.game;
  const lvl = g.level, p = g.player;
  const before = lvl.collected;
  // walk player through up to 8 coin positions
  let steps = 0;
  while (lvl.coins.length > 0 && steps < 30) {
    const c = lvl.coins[0];
    p.pos.x = c.position.x; p.pos.z = c.position.z;
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    steps++;
  }
  return { before, after: lvl.collected, coinsLeft: lvl.coins.length };
});

// 5) Shark spawn + damage: force time, place shark on player, observe HP drop
out.sharkDamage = await page.evaluate(async () => {
  const g = window.__ROS.game, lvl = g.level, p = g.player;
  lvl.elapsed = 20; // past spawn delays
  await new Promise((r) => requestAnimationFrame(r));
  const spawned = lvl.sharks.length;
  const hp0 = p.hp;
  // jam a shark onto the player for a moment
  if (lvl.sharks[0]) { lvl.sharks[0].pos.x = p.pos.x; lvl.sharks[0].pos.z = p.pos.z; p.invuln = 0; }
  for (let i = 0; i < 6; i++) { if (lvl.sharks[0]) { lvl.sharks[0].pos.x = p.pos.x; lvl.sharks[0].pos.z = p.pos.z; } await new Promise((r) => requestAnimationFrame(r)); }
  return { sharksSpawned: spawned, hpBefore: hp0, hpAfter: p.hp };
});

// 6) Win Level 1 by reaching the submarine (real win condition)
out.win = await page.evaluate(async () => {
  const g = window.__ROS.game, lvl = g.level, p = g.player;
  let won = false; const orig = g.onWin; g.onWin = (i) => { won = true; orig(i); };
  lvl.state = 'escape'; p.alive = true; p.hp = 9; p.invuln = 99;
  lvl.sharks.forEach((s) => (s.active = false));
  const sub = lvl.submarine;
  for (let i = 0; i < 120 && !won; i++) {
    p.pos.x = sub.position.x; p.pos.z = sub.position.z;
    await new Promise((r) => requestAnimationFrame(r));
  }
  return { won };
});
await sleep(500);
out.afterWinScreen = await page.evaluate(() => !!document.querySelector('.title'));

// 7) Auto-save check: read save, reload, confirm persisted highestLevel/coins
out.saveBefore = await page.evaluate(() => {
  window.__ROS.save.flush();
  return JSON.parse(localStorage.getItem('run-of-shark:save:v1'));
});
await page.reload({ waitUntil: 'networkidle' });
await sleep(600);
out.saveAfterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('run-of-shark:save:v1')));

// 8) Boss Level 5: does HP decrease from player action, or is it a timer?
out.boss = await page.evaluate(async () => {
  const ui = window.__ROS.ui, g = window.__ROS.game;
  g.startLevel(4); // index 4 = Level 5
  await new Promise((r) => requestAnimationFrame(r));
  const boss = g.level.boss;
  const hpStart = boss.hp;
  // simulate 10s of pure survival without "doing damage mechanics"
  g.level.elapsed = 10;
  for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));
  const hpAfter10 = boss.hp;
  // jump to 36s -> should auto-win on timer
  let won = false; const orig = g.onWin; g.onWin = () => { won = true; };
  g.level.elapsed = 36; g.player.invuln = 99;
  for (let i = 0; i < 5 && !won; i++) await new Promise((r) => requestAnimationFrame(r));
  g.onWin = orig;
  return { hpStart, hpAfter10, hpUnchanged: hpStart === hpAfter10, wonByTimer: won, maxHp: boss.maxHp };
});

// 9) Ending cinematic: is it a real DOM sequence?
out.ending = await page.evaluate(async () => {
  const ui = window.__ROS.ui;
  ui._ending();
  await new Promise((r) => setTimeout(r, 400));
  const cine = document.querySelector('.cine-text');
  return { hasCineText: !!cine, firstLine: cine?.textContent || null };
});

out.console = logs;
console.log('===SMOKE_RESULT_JSON===');
console.log(JSON.stringify(out, null, 2));
await browser.close();
