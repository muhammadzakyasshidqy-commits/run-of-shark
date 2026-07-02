// Browser integration for the CrazyGames SDK: (A) SDK ABSENT -> ad-free, no ad button; (B) SDK
// PRESENT (mock) -> ad button shown, adFinished grants coins / adError does not, and
// gameplayStart/Stop fire correctly (no double) as the player enters/leaves active gameplay.
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = process.argv[2] || '5181';
const b = await chromium.launch();
let pass = 0, fail = 0;
const ok = (n, c, e = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${e}`); c ? pass++ : fail++; };

// ---------- (A) SDK ABSENT ----------
{
  const p = await b.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/crazygames-sdk-v3.js', (r) => r.abort());   // simulate itch.io: SDK not available
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await sleep(1500);
  const r = await p.evaluate(() => ({ ready: !!window.__ROS?.game, sdk: !!(window.CrazyGames && window.CrazyGames.SDK), avail: window.__ROS?.ads?.available }));
  ok('SDK absent -> game still boots', r.ready === true, JSON.stringify(r));
  ok('SDK absent -> window.CrazyGames not present', r.sdk === false);
  ok('SDK absent -> ads NOT available (fallback)', r.avail === false);
  // menu should have NO "Free Coins (Watch Ad)" button
  await p.evaluate(() => window.__ROS.ui.showMenu());
  await sleep(200);
  const adBtn = await p.evaluate(() => [...document.querySelectorAll('.btn')].some((x) => /Watch Ad/i.test(x.textContent)));
  ok('SDK absent -> no Watch-Ad button in menu', adBtn === false);
  ok('SDK absent -> 0 page errors', errs.length === 0, errs.join('; '));
  await p.close();
}

// ---------- (B) SDK PRESENT (mock) ----------
{
  const p = await b.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/crazygames-sdk-v3.js', (r) => r.abort());   // block the real one; we inject a mock
  await p.addInitScript(() => {
    window.__g = 0; window.__s = 0; window.__happy = 0; window.__ADRESULT = 'finished';
    window.CrazyGames = { SDK: {
      environment: 'local',
      init: () => Promise.resolve(),
      game: { gameplayStart: () => { window.__g++; }, gameplayStop: () => { window.__s++; }, happytime: () => { window.__happy++; } },
      ad: {
        requestAd: (type, cb) => { cb.adStarted && cb.adStarted(); (window.__ADRESULT === 'error') ? cb.adError(new Error('x')) : cb.adFinished(); },
        hasAdblock: () => Promise.resolve(false),
      },
    } };
  });
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await sleep(1200);
  const avail = await p.evaluate(() => window.__ROS?.ads?.available);
  ok('SDK present -> ads available', avail === true);
  // adFinished -> reward
  const finRes = await p.evaluate(async () => { const e = window.__ROS.economy; const before = e.s.coins; window.__ADRESULT = 'finished'; const r = await window.__ROS.ads.rewarded(); return { granted: r, gained: e.s.coins - before, rewarded: r }; });
  ok('adFinished -> rewarded() true', finRes.rewarded === true);
  // adError -> NO reward
  const errRes = await p.evaluate(async () => { window.__ADRESULT = 'error'; const r = await window.__ROS.ads.rewarded(); return r; });
  ok('adError -> rewarded() false (no free reward)', errRes === false);
  // Watch-Ad button present in menu now
  await p.evaluate(() => window.__ROS.ui.showMenu());
  await sleep(200);
  const adBtn = await p.evaluate(() => [...document.querySelectorAll('.btn')].some((x) => /Watch Ad/i.test(x.textContent)));
  ok('SDK present -> Watch-Ad button shown in menu', adBtn === true);

  // gameplayStart/Stop analytics: enter active gameplay -> exactly one start; pause -> one stop.
  const gp = await p.evaluate(async () => {
    const g = window.__ROS.game;
    g.startLevel(0); g.cinematic = null; g.controlLocked = false; g.paused = false; g.running = true;
    await new Promise((r) => requestAnimationFrame(r)); await new Promise((r) => requestAnimationFrame(r));
    const afterStart = { g: window.__g, s: window.__s };
    g.pause(true);
    await new Promise((r) => requestAnimationFrame(r)); await new Promise((r) => requestAnimationFrame(r));
    const afterPause = { g: window.__g, s: window.__s };
    // resume then pause again — still no double
    g.pause(false); g.controlLocked = false;
    await new Promise((r) => requestAnimationFrame(r)); await new Promise((r) => requestAnimationFrame(r));
    g.pause(true);
    await new Promise((r) => requestAnimationFrame(r)); await new Promise((r) => requestAnimationFrame(r));
    return { afterStart, afterPause, final: { g: window.__g, s: window.__s } };
  });
  ok('gameplayStart fired on entering gameplay', gp.afterStart.g >= 1, JSON.stringify(gp.afterStart));
  ok('gameplayStop fired on pause', gp.afterPause.s >= 1, JSON.stringify(gp.afterPause));
  ok('no double start/stop (start==stop after 2 cycles)', gp.final.g === gp.final.s, JSON.stringify(gp.final));
  ok('SDK present -> 0 page errors', errs.length === 0, errs.join('; '));
  await p.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
