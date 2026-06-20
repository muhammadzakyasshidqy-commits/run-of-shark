// Economy — coins, cash, gems + bank (deposit/withdraw/capacity upgrades).
import { UPGRADES, SKINS, ACCESSORIES, VEHICLES, ACHIEVEMENTS } from '../config.js';

const BANK_CAP = (level) => 1000 * Math.pow(2, level - 1); // 1000, 2000, 4000...
const BANK_UPGRADE_COST = (level) => 500 * level;

export class Economy {
  constructor(save) {
    this.save = save;
    this.onChange = () => {};
    this.onAchievement = () => {};
  }

  get s() { return this.save.data; }
  notify() { this.save.markDirty(); this.onChange(); this.checkAchievements(); }

  // --- currencies ---
  addCoins(n) { this.s.coins += n; this.s.totalCoins += Math.max(0, n); this.notify(); }
  addCash(n)  { this.s.cash += n; this.notify(); }
  addGems(n)  { this.s.gems += n; this.notify(); }

  spendCoins(n) { if (this.s.coins < n) return false; this.s.coins -= n; this.notify(); return true; }
  spendCash(n)  { if (this.s.cash < n) return false; this.s.cash -= n; this.notify(); return true; }
  spendGems(n)  { if (this.s.gems < n) return false; this.s.gems -= n; this.notify(); return true; }

  // Convert collected coins into bankable cash (10:1).
  convertCoinsToCash(coins) {
    if (this.s.coins < coins) coins = this.s.coins;
    const cash = Math.floor(coins / 10);
    if (cash <= 0) return 0;
    this.s.coins -= cash * 10;
    this.s.cash += cash;
    this.notify();
    return cash;
  }

  // --- bank ---
  get bankCapacity() { return BANK_CAP(this.s.bankLevel); }
  deposit(amount) {
    amount = Math.min(amount, this.s.cash, this.bankCapacity - this.s.bank);
    if (amount <= 0) return 0;
    this.s.cash -= amount; this.s.bank += amount; this.notify(); return amount;
  }
  withdraw(amount) {
    amount = Math.min(amount, this.s.bank);
    if (amount <= 0) return 0;
    this.s.bank -= amount; this.s.cash += amount; this.notify(); return amount;
  }
  bankUpgradeCost() { return BANK_UPGRADE_COST(this.s.bankLevel); }
  upgradeBank() {
    const cost = this.bankUpgradeCost();
    if (this.s.bankLevel >= 6 || !this.spendCash(cost)) return false;
    this.s.bankLevel += 1; this.notify(); return true;
  }

  // --- upgrades ---
  upgradeCost(key) {
    const def = UPGRADES[key];
    const lvl = this.s.upgrades[key] || 0;
    return Math.round(def.baseCost * Math.pow(1.6, lvl));
  }
  buyUpgrade(key) {
    const def = UPGRADES[key];
    const lvl = this.s.upgrades[key] || 0;
    if (lvl >= def.max) return false;
    if (!this.spendCoins(this.upgradeCost(key))) return false;
    this.s.upgrades[key] = lvl + 1; this.notify(); return true;
  }
  statValue(key) {
    const def = UPGRADES[key];
    return def.base + (this.s.upgrades[key] || 0) * def.perLevel;
  }

  // --- cosmetics / vehicles ---
  buySkin(id) {
    const skin = SKINS.find((x) => x.id === id);
    if (!skin || this.s.ownedSkins.includes(id)) return false;
    if (!this.spendCoins(skin.cost)) return false;
    this.s.ownedSkins.push(id); this.notify(); return true;
  }
  buyAccessory(id) {
    const a = ACCESSORIES.find((x) => x.id === id);
    if (!a || this.s.ownedAccessories.includes(id)) return false;
    if (!this.spendCoins(a.cost)) return false;
    this.s.ownedAccessories.push(id); this.notify(); return true;
  }
  buyVehicle(id) {
    const v = VEHICLES.find((x) => x.id === id);
    if (!v || this.s.ownedVehicles.includes(id)) return false;
    if (!this.spendCoins(v.cost)) return false;
    this.s.ownedVehicles.push(id); this.notify(); return true;
  }

  // --- achievements ---
  // Pays each achievement's one-time reward on unlock. Guarded against re-entry because
  // applying coins/gems triggers notify() -> checkAchievements() again.
  checkAchievements() {
    if (this._checkingAch) return;
    this._checkingAch = true;
    let rewarded = false;
    for (const a of ACHIEVEMENTS) {
      if (this.s.achievements.includes(a.id)) continue;
      if (a.test(this.s)) {
        this.s.achievements.push(a.id);
        if (a.reward) {
          if (a.reward.coins) { this.s.coins += a.reward.coins; this.s.totalCoins += a.reward.coins; rewarded = true; }
          if (a.reward.gems) { this.s.gems += a.reward.gems; rewarded = true; }
        }
        this.onAchievement(a);
      }
    }
    this._checkingAch = false;
    if (rewarded) { this.save.markDirty(); this.onChange(); }
  }
}
