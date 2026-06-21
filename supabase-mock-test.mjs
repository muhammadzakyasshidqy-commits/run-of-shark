// Step 4: prove the cloud sync FLOW with an in-memory mock (no real Supabase needed):
// save()->push stores it; syncFromCloud()->pull retrieves+merges; config resolves from
// localStorage; guest mode safe when unconfigured; push failure falls back to local.
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(500);

const out = await p.evaluate(async () => {
  const { SaveManager } = await import('/src/save/SaveManager.js');
  const cfg = await import('/src/save/supabaseConfig.js');
  const r = {};

  // --- in-memory mock provider that behaves like SupabaseProvider ---
  const store = {};
  const mock = {
    signedIn: false,
    isConfigured: () => true,
    signIn: async () => { mock.signedIn = true; return { ok: true, pending: true }; },
    push: async (d) => { store.data = JSON.parse(JSON.stringify(d)); return { ok: true }; },
    pull: async () => (store.data ? JSON.parse(JSON.stringify(store.data)) : null),
  };

  // 1) push: save() writes to the cloud store (best-effort, after local)
  localStorage.removeItem('run-of-shark:save:v1');
  const sm = new SaveManager(mock);
  sm.data.coins = 999; sm.data.highestLevel = 4; sm.markDirty(); sm.save();
  await new Promise((res) => setTimeout(res, 30));
  r.pushedCoins = store.data && store.data.coins;

  // 2) pull+merge into a FRESH manager (simulates another device / reload)
  localStorage.removeItem('run-of-shark:save:v1');
  const sm2 = new SaveManager(mock);
  const before = sm2.data.coins;
  const sync = await sm2.syncFromCloud();
  r.freshBefore = before; r.pulledCoins = sm2.data.coins; r.pulledLevel = sm2.data.highestLevel; r.syncOk = sync.ok;

  // 3) push FAILS -> no throw, local still written
  const failing = { push: () => Promise.reject(new Error('offline')), pull: () => Promise.reject(new Error('offline')) };
  const sm3 = new SaveManager(failing);
  sm3.data.coins = 555; sm3.markDirty();
  let threw = false; try { sm3.save(); } catch { threw = true; }
  await new Promise((res) => setTimeout(res, 20));
  r.pushFailThrew = threw;
  r.localAfterFail = JSON.parse(localStorage.getItem('run-of-shark:save:v1')).coins;
  const failSync = await sm3.syncFromCloud();
  r.failSyncReason = failSync.reason;

  // 4) config resolves from localStorage (what the Settings UI writes)
  cfg.saveSupabaseConfig({ url: 'https://demo.supabase.co', anonKey: 'demo-anon-key' });
  const resolved = cfg.resolveSupabaseConfig();
  r.resolvedUrl = resolved.url; r.resolvedKey = resolved.anonKey;
  cfg.saveSupabaseConfig({ url: '', anonKey: '' }); // clear
  r.clearedConfigured = !!(cfg.resolveSupabaseConfig().url);

  // 5) guest safe: real provider unconfigured -> isConfigured false, no cloud calls
  r.guestUnconfigured = window.__ROS.cloud.isConfigured();
  return r;
});

console.log('===SUPABASE_MOCK_JSON===');
console.log(JSON.stringify({ ...out, errors: errs }, null, 2));
await b.close();
