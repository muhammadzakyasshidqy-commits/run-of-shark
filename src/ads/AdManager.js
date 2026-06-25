// AdManager — provider-agnostic ad abstraction.
// No ad network is hardcoded. Plug in AdMob / GameDistribution / CrazyGames later
// by implementing the AdProvider interface and passing it to setProvider().

// interface AdProvider {
//   showRewarded(): Promise<boolean>   // resolves true if reward earned
//   showInterstitial(): Promise<void>
// }

class NullProvider {
  // No real ad network: NEVER grant a reward. (Returning true let players spam the "watch ad"
  // buttons for unlimited currency with no ad — a real exploit on Cloudflare Pages where no ad
  // SDK is loaded.) The UI also HIDES ad buttons while AdManager.available is false.
  async showRewarded() { return false; }
  async showInterstitial() { return; }
}

export class AdManager {
  constructor(provider = null) {
    this.provider = provider || new NullProvider();
    this.available = !!provider;     // true ONLY when a real ad provider is plugged in
    this._lastInterstitial = 0;
    this.interstitialCooldownMs = 90_000;
  }

  setProvider(provider) { this.provider = provider; this.available = !!provider; }

  // Returns true if the player should receive the reward. With no real provider this is always
  // false (anti-exploit) — a genuine reward needs an actual finished ad from a plugged-in SDK.
  async rewarded() {
    if (!this.available) return false;
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
