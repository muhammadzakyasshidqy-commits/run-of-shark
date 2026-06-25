// SaveManager — local JSON save with auto-save + cloud-ready hooks.
// A CloudProvider can be injected later (Supabase, etc.) without touching callers.

const KEY = 'run-of-shark:save:v1';

const DEFAULT_SAVE = {
  version: 1,
  player: { name: 'Guest', guest: true },
  coins: 0,
  cash: 0,
  gems: 0,
  bank: 0,
  bankLevel: 1,
  upgrades: { speed: 0, sprint: 0, stamina: 0, luck: 0, magnet: 0, resistance: 0 },
  ownedSkins: ['blue', 'green', 'purple', 'orange'],
  ownedAccessories: [],
  ownedVehicles: [],
  equippedSkin: 'blue',
  equippedAccessory: null,
  highestLevel: 1,
  levelsCleared: 0,
  bossesBeaten: 0,
  totalCoins: 0,
  achievements: [],
  dailyStreak: 0,
  lastDaily: 0,
  // joySensitivity + invertY apply to the movement joystick (kept). The camera is fully
  // automatic now, so there are no manual camera settings.
  settings: { music: true, sfx: true, volume: 0.8, joySensitivity: 1, invertY: false },
};

export class SaveManager {
  constructor(cloudProvider = null) {
    this.cloud = cloudProvider;
    this.data = this.load();
    this._dirty = false;
    // Auto-save loop.
    setInterval(() => this.flush(), 4000);
    window.addEventListener('beforeunload', () => this.flush());
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULT_SAVE);
      const parsed = JSON.parse(raw);
      const d = structuredClone(DEFAULT_SAVE);
      // DEEP-merge the nested objects so an OLD save (missing a newer settings/upgrades/player
      // key) inherits the default for that key instead of dropping it (a shallow spread would
      // replace the whole nested object and leave new fields undefined).
      return {
        ...d, ...parsed,
        settings: { ...d.settings, ...(parsed.settings || {}) },
        upgrades: { ...d.upgrades, ...(parsed.upgrades || {}) },
        player: { ...d.player, ...(parsed.player || {}) },
      };
    } catch (e) {
      console.warn('Save load failed, using defaults', e);
      return structuredClone(DEFAULT_SAVE);
    }
  }

  markDirty() { this._dirty = true; }

  flush() {
    if (!this._dirty) return;
    this.save();
    this._dirty = false;
  }

  save() {
    // localStorage is ALWAYS written first and is the source of truth. The cloud push
    // is best-effort: if it rejects (offline / not signed in / not configured) we swallow
    // it so a cloud failure can never lose local progress.
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('Local save write failed', e);
    }
    if (this.cloud?.push) {
      Promise.resolve().then(() => this.cloud.push(this.data)).catch(() => { /* fallback: local only */ });
    }
  }

  // Pull a cloud save and merge it with local, keeping whichever is further along.
  // On ANY failure (no provider, not configured, offline, not authed) local is untouched.
  async syncFromCloud() {
    if (!this.cloud?.pull) return { ok: false, reason: 'no_provider' };
    try {
      const remote = await this.cloud.pull();
      if (!remote) return { ok: false, reason: 'no_remote_data' };
      this.data = mergeSaves(this.data, remote);
      this.save();
      return { ok: true, merged: true };
    } catch (e) {
      return { ok: false, reason: 'pull_failed', error: String(e?.message || e) };
    }
  }

  reset() {
    this.data = structuredClone(DEFAULT_SAVE);
    this.save();
  }
}

// Merge two saves, preferring the more-advanced values. Never drops progress from
// either side (owned items are unioned; progression takes the max).
export function mergeSaves(local, remote) {
  const out = { ...structuredClone(DEFAULT_SAVE), ...local };
  const maxNum = (k) => { out[k] = Math.max(local?.[k] || 0, remote?.[k] || 0); };
  ['coins', 'cash', 'gems', 'bank', 'bankLevel', 'highestLevel', 'levelsCleared', 'bossesBeaten', 'totalCoins', 'dailyStreak'].forEach(maxNum);
  const union = (k) => { out[k] = Array.from(new Set([...(local?.[k] || []), ...(remote?.[k] || [])])); };
  ['ownedSkins', 'ownedAccessories', 'ownedVehicles', 'achievements'].forEach(union);
  // per-stat upgrades: take the higher level of each
  out.upgrades = { ...out.upgrades };
  for (const key of Object.keys(out.upgrades)) out.upgrades[key] = Math.max(local?.upgrades?.[key] || 0, remote?.upgrades?.[key] || 0);
  return out;
}
