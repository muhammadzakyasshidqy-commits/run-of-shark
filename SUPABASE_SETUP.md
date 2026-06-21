# Cloud Save Setup (Supabase) — owner steps

Cloud save is **optional**. With no credentials the game stays in **guest mode** (localStorage
only) and never errors. To turn it on:

## 1. Create a Supabase project
1. Go to https://supabase.com → New project (free tier is fine).
2. Open **Project Settings → API** and copy:
   - **Project URL** → this is `url`
   - **anon `public` key** → this is `anonKey` (safe to expose in a browser client)

## 2. Create the `saves` table + Row Level Security
Open **SQL Editor** in Supabase and run:

```sql
-- One row per user; payload is the whole save JSON.
create table if not exists public.saves (
  id          uuid primary key references auth.users (id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.saves enable row level security;

-- A signed-in user may read/write ONLY their own row (id = auth.uid()).
create policy "own save - select" on public.saves
  for select using (auth.uid() = id);
create policy "own save - insert" on public.saves
  for insert with check (auth.uid() = id);
create policy "own save - update" on public.saves
  for update using (auth.uid() = id) with check (auth.uid() = id);
```

This matches the code: `CloudProvider.push()` upserts `{ id: user.id, data, updated_at }` and
`pull()` selects `data` where `id = user.id` (`src/save/CloudProvider.js:54,63`).

## 3. Allow the magic-link redirect
**Authentication → URL Configuration → Redirect URLs**: add your site, e.g.
`https://run-of-shark.pages.dev` (and `http://localhost:5173` for local dev).
The code requests `emailRedirectTo: location.origin` (`CloudProvider.js:42`).

## 4. Paste the credentials (pick ONE)
- **In-game (easiest):** Menu → ⚙️ Settings → **🔧 Cloud Save Setup** → paste URL + anon key.
  Stored in `localStorage['run-of-shark:supabase']` and read by `resolveSupabaseConfig()`.
- **Commit-time:** edit `src/save/supabaseConfig.js` → fill `SUPABASE.url` / `SUPABASE.anonKey`.
- **Runtime:** `window.__SUPABASE = { url: '...', anonKey: '...' }` before the app boots.

## 5. Use it
Settings → **☁️ Account → Login** → enter email → click the magic link in your inbox.
After returning, progress syncs: `SaveManager.save()` pushes (best-effort) and
`SaveManager.syncFromCloud()` pulls + merges (keeps the more-advanced values).

**Safety:** every cloud call is guarded — if creds are blank, the network is down, or you're
not signed in, the game silently keeps using the local save (never crashes, never loses data).
