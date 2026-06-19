# 🦈 RUN OF SHARK

A colorful low-poly browser game (Bridge Race-style) built with **Vite + Three.js**.
Dive from a boat, collect treasure, escape the shark, and reach the yellow submarine — across
6 levels ending in a giant cinematic tsunami escape in a luxury car.

**Mobile-first** (Android / iPhone / Desktop), targets 60 FPS, deploys to **Cloudflare Pages**, no paid services required.

---

## ▶ Quick Start

```bash
npm install
npm run dev          # open the printed URL (http://localhost:5173)
```

Build for production:

```bash
npm run build        # outputs to dist/
npm run preview      # preview the production build
```

## 🎮 Controls

| Action  | Desktop            | Mobile            |
|---------|--------------------|-------------------|
| Move    | WASD / Arrow keys  | Left joystick     |
| Sprint  | Shift              | SPRINT button     |
| Pause   | ⏸ button (top-right) | ⏸ button        |

**Goal:** collect the required treasure, then swim to the **yellow submarine** before the shark
catches you. Boss levels: survive the boss. Final level: reach the **luxury car** before the tsunami.

---

## 🗂 Project Structure

```
src/
  config.js            # all game data: levels, sharks, shop, skins, vehicles, achievements
  main.js              # bootstrap / wiring
  Game.js              # Three.js scene, render loop, follow camera, win/lose
  systems/Input.js     # keyboard + virtual joystick (unified vector)
  managers/            # (reserved for future managers)
  entities/            # Models.js (low-poly factory), Player.js, Shark.js
  levels/Level.js      # level builder + rules (collect → escape → submarine / boss / tsunami)
  effects/Effects.js   # bubbles, pickup bursts, tsunami wall, screen shake
  audio/AudioManager.js# procedural WebAudio SFX + music (zero audio files)
  ads/AdManager.js     # provider-agnostic ad abstraction (no network hardcoded)
  save/SaveManager.js  # local JSON auto-save + cloud-ready hook
  save/CloudProvider.js# Supabase-compatible cloud-save skeleton
  economy/Economy.js   # coins/cash/gems, bank, upgrades, achievements
  ui/UI.js             # all DOM screens + HUD
  ui/styles.css        # mobile-first styling
```

## 🧩 Systems Included

- **6 Levels** — escalating sharks, corals, split routes, boss arena, final tsunami.
- **7 shark types** incl. Boss Shark (charge/roar/wave AI) and final Kraken boss.
- **Economy** — coins → cash conversion, **bank** with deposit/withdraw/capacity upgrades, gems.
- **Shop** — player upgrades (speed/sprint/stamina/luck/magnet/resistance), skins, accessories, vehicles.
- **Progression** — achievements, daily rewards + streak, lucky wheel.
- **Save** — local JSON, auto-save every 4s, guest mode, Supabase-ready cloud hook.
- **Audio** — fully procedural (no downloads), music/SFX toggles + volume.
- **Ads** — abstraction layer; drop in AdMob / GameDistribution / CrazyGames later (see below).

---

## 📺 Adding an Ad Provider

No network is hardcoded. Implement the interface and inject it in `src/main.js`:

```js
class CrazyGamesProvider {
  async showRewarded()     { /* call SDK, resolve true if reward earned */ return true; }
  async showInterstitial() { /* call SDK */ }
}
const ads = new AdManager(new CrazyGamesProvider());
```

## ☁️ Adding Cloud Save (Supabase)

Fill in `src/save/CloudProvider.js`, then in `main.js`:

```js
const save = new SaveManager(new SupabaseProvider({ url, anonKey }));
```

---

## 🚀 Deploy to Cloudflare Pages

**Option A — Dashboard (Git):**
1. Push this folder to a GitHub repo.
2. Cloudflare Dashboard → Pages → *Create* → connect the repo.
3. Build command: `npm run build` · Output directory: `dist`.

**Option B — Wrangler CLI:**
```bash
npm run build
npx wrangler pages deploy dist --project-name run-of-shark
```

`wrangler.toml` is already configured (`pages_build_output_dir = "dist"`).

---

## ⚡ Performance Notes

- Pixel ratio capped at 2; antialias auto-disabled on high-DPI screens.
- Flat-shaded low-poly geometry, single shadow-casting light, fog for distance culling.
- `three` is split into its own chunk for better caching.
- Procedural audio/geometry means **no asset payload** — fast first load on 4GB Android devices.

## 📝 License

Made as a complete, ownable game project. Use it freely.
