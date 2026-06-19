// AdManager — provider-agnostic ad abstraction.
// No ad network is hardcoded. Plug in AdMob / GameDistribution / CrazyGames later
// by implementing the AdProvider interface and passing it to setProvider().

// interface AdProvider {
//   showRewarded(): Promise<boolean>   // resolves true if reward earned
//   showInterstitial(): Promise<void>
// }

class NullProvider {
  async showRewarded() { return true; }       // no-op grants reward in dev
  async showInterstitial() { return; }
}

export class AdManager {
  constructor(provider = null) {
    this.provider = provider || new NullProvider();
    this._lastInterstitial = 0;
    this.interstitialCooldownMs = 90_000;
  }

  setProvider(provider) { this.provider = provider; }

  // Returns true if the player should receive the reward.
  async rewarded() {
    try { return await this.provider.showRewarded(); }
    catch { return false; }
  }

  async interstitial() {
    const now = Date.now();
    if (now - this._lastInterstitial < this.interstitialCooldownMs) return;
    this._lastInterstitial = now;
    try { await this.provider.showInterstitial(); } catch { /* ignore */ }
  }
}
