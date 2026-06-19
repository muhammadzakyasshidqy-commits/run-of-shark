// CloudProvider — optional cloud-save interface (Supabase-compatible).
// Inject into SaveManager(new SupabaseProvider(...)) when you add a backend.
//
// interface CloudProvider { push(data): Promise<void>; pull(): Promise<object|null> }

export class SupabaseProvider {
  // Example skeleton — fill in with @supabase/supabase-js when ready.
  // import { createClient } from '@supabase/supabase-js'
  constructor({ url, anonKey, table = 'saves' } = {}) {
    this.config = { url, anonKey, table };
    this.userId = null; // set after login (guest or username)
    this.client = null; // createClient(url, anonKey)
  }

  async push(data) {
    if (!this.client || !this.userId) return;
    // await this.client.from(this.config.table).upsert({ id: this.userId, data });
  }

  async pull() {
    if (!this.client || !this.userId) return null;
    // const { data } = await this.client.from(this.config.table).select('data').eq('id', this.userId).single();
    // return data?.data ?? null;
    return null;
  }
}
