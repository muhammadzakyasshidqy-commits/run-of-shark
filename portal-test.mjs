// Portal analytics guards + CrazyGames ad provider wiring, with a MOCK SDK (no network/DOM).
import * as portal from './src/portal/portal.js';
import { AdManager } from './src/ads/AdManager.js';

let pass = 0, fail = 0;
const ok = (n, c, e = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${e}`); c ? pass++ : fail++; };

// ---- portal double-fire + ad-active guards ----
const calls = { start: 0, stop: 0, happy: 0 };
portal.attachBackend({ gameplayStart: () => calls.start++, gameplayStop: () => calls.stop++, happytime: () => calls.happy++ });
portal.gameplayStart(); portal.gameplayStart(); portal.gameplayStart();
ok('gameplayStart fires once (no double-start)', calls.start === 1, `start=${calls.start}`);
portal.gameplayStop(); portal.gameplayStop();
ok('gameplayStop fires once (no double-stop)', calls.stop === 1, `stop=${calls.stop}`);
ok('gameplayStop without an active start is ignored', (portal.gameplayStop(), calls.stop === 1));
// nothing fires during an ad
portal.setAdActive(true);
portal.gameplayStart(); portal.happytime();
ok('no gameplayStart during an ad', calls.start === 1);
ok('no happytime during an ad', calls.happy === 0);
portal.setAdActive(false);
portal.happytime();
ok('happytime fires when no ad', calls.happy === 1);
portal.detachBackend();
ok('no backend -> calls are safe no-ops', (portal.gameplayStart(), portal._state().hasBackend === false));

// ---- CrazyGames provider via setupCrazyGames (mock SDK on global.window) ----
const makeSDK = (env, adResult) => ({
  environment: env,
  init: async () => {},
  game: { gameplayStart() {}, gameplayStop() {}, happytime() {} },
  ad: {
    requestAd(type, cb) { cb.adStarted && cb.adStarted(); adResult === 'finished' ? cb.adFinished() : cb.adError(new Error('no ad')); },
    async hasAdblock() { return false; },
  },
});
const fakeGame = { pause() {} };
const fakeAudio = { mute() {} };
const { setupCrazyGames } = await import('./src/portal/crazygames.js');

// env 'disabled' (e.g., itch.io / Cloudflare) -> ads stay OFF
{ global.window = { CrazyGames: { SDK: makeSDK('disabled', 'finished') } };
  const ads = new AdManager(); const r = await setupCrazyGames({ ads, game: fakeGame, audio: fakeAudio });
  ok("env 'disabled' -> ads NOT enabled", r.enabled === false && ads.available === false); }

// no SDK at all -> ads OFF
{ global.window = {}; const ads = new AdManager(); const r = await setupCrazyGames({ ads, game: fakeGame, audio: fakeAudio });
  ok('no SDK -> ads NOT enabled', r.enabled === false && ads.available === false); }

// env 'local', ad FINISHED -> reward granted (true)
{ global.window = { CrazyGames: { SDK: makeSDK('local', 'finished') } };
  const ads = new AdManager(); await setupCrazyGames({ ads, game: fakeGame, audio: fakeAudio });
  ok("env 'local' -> ads available", ads.available === true);
  ok('adFinished -> rewarded() true', (await ads.rewarded()) === true); }

// env 'crazygames', ad ERROR -> NO reward (false) — anti-exploit invariant
{ global.window = { CrazyGames: { SDK: makeSDK('crazygames', 'error') } };
  const ads = new AdManager(); await setupCrazyGames({ ads, game: fakeGame, audio: fakeAudio });
  ok("env 'crazygames' -> ads available", ads.available === true);
  ok('adError -> rewarded() false (no free reward)', (await ads.rewarded()) === false); }

// mute+pause bracket the ad (mock records)
{ let muted = [], paused = [];
  global.window = { CrazyGames: { SDK: makeSDK('local', 'finished') } };
  const ads = new AdManager(); await setupCrazyGames({ ads, game: { pause: (v) => paused.push(v) }, audio: { mute: (v) => muted.push(v) } });
  await ads.rewarded();
  ok('ad muted then unmuted', muted[0] === true && muted[muted.length - 1] === false, JSON.stringify(muted));
  ok('ad paused then resumed', paused[0] === true && paused[paused.length - 1] === false, JSON.stringify(paused)); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
