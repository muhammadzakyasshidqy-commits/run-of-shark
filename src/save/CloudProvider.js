// CloudProvider — optional cloud save (Supabase). Auth method: EMAIL MAGIC LINK.
//
// Why magic link: it is the least-code auth flow — a single `signInWithOtp({email})`
// call, no password UI, no extra screens. Supabase emails the link; when the user
// returns, the SDK restores the session automatically. Perfect for "minimal scope".
//
// IMPORTANT: every method is guarded. If Supabase isn't configured, isn't installed,
// or the network is down, methods reject/return null cleanly so SaveManager keeps
// using localStorage. The cloud is strictly additive — it never owns the only copy.
//
// interface CloudProvider { isConfigured():bool; signIn(email):Promise; push(data):Promise; pull():Promise<object|null> }
import { resolveSupabaseConfig } from './supabaseConfig.js';

export class SupabaseProvider {
  constructor(config = resolveSupabaseConfig()) {
    this.config = config;
    this.client = null;
    this._initPromise = null;
  }

  isConfigured() { return !!(this.config.url && this.config.anonKey); }

  // Lazily create the client. The SDK is loaded from a CDN ESM URL only when cloud
  // is actually used, so the project builds and runs with NO npm dependency on Supabase
  // (keeps guest mode zero-cost). Override the CDN via config.sdkUrl if you prefer.
  async _init() {
    if (this.client) return this.client;
    if (!this.isConfigured()) throw new Error('supabase_not_configured');
    if (!this._initPromise) {
      this._initPromise = (async () => {
        const url = this.config.sdkUrl || 'https://esm.sh/@supabase/supabase-js@2';
        const mod = await import(/* @vite-ignore */ url);
        this.client = mod.createClient(this.config.url, this.config.anonKey);
        return this.client;
      })();
    }
    return this._initPromise;
  }

  async signIn(email) {
    const c = await this._init();
    const redirect = typeof location !== 'undefined' ? location.origin : undefined;
    const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
    if (error) throw error;
    return { ok: true, pending: true }; // user must click the emailed link
  }

  async _userId() {
    const c = await this._init();
    const { data } = await c.auth.getUser();
    return data?.user?.id || null;
  }

  async push(data) {
    const c = await this._init();
    const uid = await this._userId();
    if (!uid) throw new Error('not_authenticated');
    const { error } = await c.from(this.config.table).upsert({ id: uid, data, updated_at: new Date().toISOString() });
    if (error) throw error;
    return { ok: true };
  }

  async pull() {
    const c = await this._init();
    const uid = await this._userId();
    if (!uid) return null;
    const { data, error } = await c.from(this.config.table).select('data').eq('id', uid).single();
    if (error) return null;
    return data?.data ?? null;
  }
}
