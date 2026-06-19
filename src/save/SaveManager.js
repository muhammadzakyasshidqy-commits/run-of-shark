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
      return { ...structuredClone(DEFAULT_SAVE), ...parsed };
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
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
      if (this.cloud?.push) this.cloud.push(this.data).catch(() => {});
    } catch (e) {
      console.warn('Save write failed', e);
    }
  }

  reset() {
    this.data = structuredClone(DEFAULT_SAVE);
    this.save();
  }
}
