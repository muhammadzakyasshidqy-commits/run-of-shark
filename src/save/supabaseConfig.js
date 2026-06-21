// Three ways to provide credentials (later overrides earlier):
//   1) Hard-code below (commit-time)        — SUPABASE.url / SUPABASE.anonKey
//   2) localStorage (set via Settings UI)    — key 'run-of-shark:supabase'
//   3) Runtime global                        — window.__SUPABASE = { url, anonKey }
// Get url/anonKey from: Supabase dashboard -> Project Settings -> API
//   url = "Project URL", anonKey = "anon public" key (safe in a browser client).
// Leave all blank to stay in guest / local-only mode (cloud disabled, no errors).
export const SUPABASE = {
  url: '',
  anonKey: '',
  table: 'saves',
};

export const SUPABASE_LS_KEY = 'run-of-shark:supabase';

export function resolveSupabaseConfig() {
  let ls = {};
  try { if (typeof localStorage !== 'undefined') ls = JSON.parse(localStorage.getItem(SUPABASE_LS_KEY) || '{}'); } catch { /* ignore */ }
  const rt = (typeof window !== 'undefined' && window.__SUPABASE) || {};
  return { ...SUPABASE, ...ls, ...rt };
}

// Persist creds from the Settings UI; pass empty strings to clear (back to guest mode).
export function saveSupabaseConfig({ url, anonKey } = {}) {
  try {
    if (url || anonKey) localStorage.setItem(SUPABASE_LS_KEY, JSON.stringify({ url: url || '', anonKey: anonKey || '' }));
    else localStorage.removeItem(SUPABASE_LS_KEY);
  } catch { /* ignore */ }
}
