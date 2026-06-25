// Anti-exploit: with NO real ad provider, rewarded() must NEVER grant a reward, and the manager
// must report itself unavailable (so the UI hides the watch-ad buttons).
import { AdManager } from './src/ads/AdManager.js';

let pass = 0, fail = 0;
const ok = (n, c, e = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${e}`); c ? pass++ : fail++; };

const noProvider = new AdManager();
ok('no provider -> not available', noProvider.available === false);
ok('no provider -> rewarded() is false (anti-spam)', (await noProvider.rewarded()) === false);
// spamming it stays false (cannot farm currency)
let grants = 0; for (let i = 0; i < 50; i++) { if (await noProvider.rewarded()) grants++; }
ok('50 spam clicks grant 0 rewards', grants === 0, `granted=${grants}`);

// a real provider that finishes an ad DOES grant
const realProvider = { showRewarded: async () => true, showInterstitial: async () => {} };
const withProvider = new AdManager(realProvider);
ok('real provider -> available', withProvider.available === true);
ok('real provider finished ad -> rewarded true', (await withProvider.rewarded()) === true);

// a real provider where the user SKIPS the ad grants nothing
const skipProvider = new AdManager({ showRewarded: async () => false, showInterstitial: async () => {} });
ok('real provider, ad skipped -> no reward', (await skipProvider.rewarded()) === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
