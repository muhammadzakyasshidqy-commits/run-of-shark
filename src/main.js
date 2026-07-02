// main.js — bootstrap: wire managers together and boot the UI.
import { SaveManager } from './save/SaveManager.js';
import { Economy } from './economy/Economy.js';
import { AudioManager } from './audio/AudioManager.js';
import { AdManager } from './ads/AdManager.js';
import { SupabaseProvider } from './save/CloudProvider.js';
import { Game } from './Game.js';
import { UI } from './ui/UI.js';
import { loadAssets, assetsReady } from './assets/Assets.js';
import * as portal from './portal/portal.js';
import { setupCrazyGames } from './portal/crazygames.js';

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');

// Cloud is optional + guarded — guest/local mode works unchanged if unconfigured.
const cloud = new SupabaseProvider();
const save = new SaveManager(cloud);
const economy = new Economy(save);
const audio = new AudioManager(save.data.settings);
const ads = new AdManager(/* pass AdMob/GameDistribution/CrazyGames provider here */);

const game = new Game({ canvas, uiRoot, economy, audio, save });
const ui = new UI({ root: uiRoot, game, economy, save, audio, ads, cloud });

// If cloud is configured and a session already exists, merge cloud progress in.
// Any failure is swallowed — local save remains the fallback.
if (cloud.isConfigured()) {
  save.syncFromCloud().then((r) => { if (r.ok) { economy.onChange(); ui.showMenu(); } }).catch(() => {});
}

// Preload 3D GLB assets in the background while the player is on the menu, so the hub/levels
// open with the real models. Falls back to primitives if a model is still loading or failed.
loadAssets();

// Unlock audio on first interaction (browser autoplay policy).
const unlock = () => { audio.unlock(); window.removeEventListener('pointerdown', unlock); };
window.addEventListener('pointerdown', unlock);

// CrazyGames SDK v3 (if hosted there): enables real rewarded/midgame ads + analytics. On any other
// host (itch.io / Cloudflare) it stays OFF and the game runs ad-free — see portal/crazygames.js.
// Wire the Game's portal hooks: gameplayStart/Stop (on state change) + happytime at big moments.
game.onGameplay = (active) => { if (active) portal.gameplayStart(); else portal.gameplayStop(); };
game.onHappy = () => portal.happytime();
setupCrazyGames({ ads, game, audio })
  .then((r) => { if (r.enabled && document.querySelector('.menu-grid')) ui.showMenu(); }) // reveal the ad button once ready
  .catch(() => {});

// Expose for debugging + tests.
window.__ROS = { game, economy, save, ui, cloud, assetsReady, ads, portal };
