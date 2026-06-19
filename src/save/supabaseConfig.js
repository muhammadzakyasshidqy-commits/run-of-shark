// Fill these in to enable cloud save. Leave blank to stay in guest/local-only mode.
// Get them from: Supabase dashboard -> Project Settings -> API.
//   url     = "Project URL"
//   anonKey = "anon public" key  (safe to expose in a browser client)
//
// You can also override at runtime without editing this file:
//   window.__SUPABASE = { url: '...', anonKey: '...' }
export const SUPABASE = {
  url: '',
  anonKey: '',
  table: 'saves',
};

export function resolveSupabaseConfig() {
  const rt = (typeof window !== 'undefined' && window.__SUPABASE) || {};
  return { ...SUPABASE, ...rt };
}
