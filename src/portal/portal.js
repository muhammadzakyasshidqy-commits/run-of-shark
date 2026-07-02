// Portal analytics abstraction — a single set of call sites the game uses for gameplay/celebration
// events, backed by a plug-in "backend" (CrazyGames now, Poki later — both want the SAME
// gameplayStart/gameplayStop/happytime signals). Enforces the platform RULES:
//   - never fire gameplayStart twice in a row (must Stop in between)
//   - never fire gameplayStop without a preceding Start
//   - fire NOTHING while an ad is running
// If no backend is attached (itch.io / Cloudflare without the SDK), everything is a safe no-op.

let backend = null;   // { gameplayStart(), gameplayStop(), happytime(), loadingStart(), loadingStop() }
let playing = false;
let adActive = false;

export function attachBackend(b) { backend = b || null; }
export function detachBackend() { backend = null; playing = false; adActive = false; }
export function setAdActive(v) { adActive = !!v; }

export function gameplayStart() {
  if (adActive || playing) return;          // no double-start; nothing during an ad
  playing = true;
  try { backend?.gameplayStart?.(); } catch { /* ignore SDK hiccups */ }
}

export function gameplayStop() {
  if (adActive || !playing) return;         // no stop-without-start; nothing during an ad
  playing = false;
  try { backend?.gameplayStop?.(); } catch { /* ignore */ }
}

export function happytime() {
  if (adActive) return;
  try { backend?.happytime?.(); } catch { /* ignore */ }
}

export function loadingStart() { try { backend?.loadingStart?.(); } catch { /* ignore */ } }
export function loadingStop() { try { backend?.loadingStop?.(); } catch { /* ignore */ } }

// test/debug introspection
export function _state() { return { playing, adActive, hasBackend: !!backend }; }
