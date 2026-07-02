// CrazyGames SDK v3 wiring. Detects the SDK (loaded from index.html), inits it, and — ONLY when
// ads are actually available for this host — plugs a real rewarded/midgame ad provider into the
// AdManager and an analytics backend into the portal. Everywhere else (itch.io / Cloudflare, or if
// the SDK script is blocked / init fails) it stays OFF → the game runs ad-free, buttons hidden.
import * as portal from './portal.js';

// Returns the SDK if ads should be ENABLED here, else null.
//   - no SDK object (script absent/blocked)            -> null
//   - SDK.init() throws                                -> null
//   - environment 'disabled' (non-CrazyGames host)     -> null   (itch.io stays ad-free)
//   - environment 'crazygames' (real) / 'local' (demo) -> SDK
export async function initCrazyGamesSDK() {
  const SDK = (typeof window !== 'undefined' && window.CrazyGames && window.CrazyGames.SDK) || null;
  if (!SDK) return null;
  try { await SDK.init(); } catch { return null; }
  // WHITELIST: only turn ads on where they actually work — real CrazyGames, or localhost 'local'
  // demo for dev. Every other host (itch.io / Cloudflare / 'disabled' / 'uninitialized') stays
  // ad-free. (An unknown env or a missing `environment` field is treated as OFF.)
  let env; try { env = SDK.environment; } catch { env = undefined; }
  if (env !== 'crazygames' && env !== 'local') return null;
  return SDK;
}

export async function setupCrazyGames({ ads, game, audio }) {
  const SDK = await initCrazyGamesSDK();
  if (!SDK) return { enabled: false };

  // Analytics backend — only the SDK's real methods. Guards/no-double logic lives in portal.js.
  portal.attachBackend({
    gameplayStart: () => SDK.game.gameplayStart(),
    gameplayStop: () => SDK.game.gameplayStop(),
    happytime: () => SDK.game.happytime(),
    loadingStart: () => SDK.game.sdkGameLoadingStart && SDK.game.sdkGameLoadingStart(),
    loadingStop: () => SDK.game.sdkGameLoadingStop && SDK.game.sdkGameLoadingStop(),
  });

  const onAdStart = () => { portal.setAdActive(true); try { game.pause(true); } catch { /* menu */ } audio.mute(true); };
  const onAdEnd = () => { audio.mute(false); try { game.pause(false); } catch { /* menu */ } portal.setAdActive(false); };

  const provider = {
    // REWARDED: reward is granted ONLY from adFinished — adError/exception grant nothing (no free
    // path; this is the anti-exploit invariant from round 7).
    showRewarded() {
      return new Promise((resolve) => {
        portal.setAdActive(true);
        let done = false;
        const finish = (v) => { if (done) return; done = true; onAdEnd(); resolve(v); };
        try {
          SDK.ad.requestAd('rewarded', {
            adStarted: onAdStart,
            adFinished: () => finish(true),
            adError: () => finish(false),
          });
        } catch { finish(false); }
      });
    },
    // MIDGAME (interstitial) between levels — no reward, just an ad break.
    showInterstitial() {
      return new Promise((resolve) => {
        portal.setAdActive(true);
        let done = false;
        const finish = () => { if (done) return; done = true; audio.mute(false); portal.setAdActive(false); resolve(); };
        try {
          SDK.ad.requestAd('midgame', { adStarted: () => audio.mute(true), adFinished: finish, adError: finish });
        } catch { finish(); }
      });
    },
    async hasAdblock() { try { return await SDK.ad.hasAdblock(); } catch { return false; } },
  };
  ads.setProvider(provider);
  return { enabled: true, env: SDK.environment };
}
