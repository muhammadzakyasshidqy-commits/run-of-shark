// Verifies: accessory attaches, skin recolours live, swim!=walk animation, achievement reward.
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 760, height: 520 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(500);

const data = await p.evaluate(async () => {
  const g = window.__ROS.game;
  g.startLevel(0); g.cinematic = null; g.controlLocked = false; g.paused = true;
  const r = {};

  // SKIN live recolour (no reload): green = 0x06d6a0
  g.economy.s.equippedSkin = 'green'; g.refreshPlayerAppearance();
  let outfitHex = null;
  g.player.mesh.traverse((o) => { if (o.isMesh && o.userData.outfit && outfitHex === null) outfitHex = o.material.color.getHex(); });
  r.skinGreenHex = '0x' + outfitHex.toString(16);

  // ACCESSORY attaches to the mesh
  const isGLB = !!g.player.mesh.userData.mixer;
  r.diverIsGLB = isGLB;
  g.economy.s.equippedAccessory = 'crown'; g.refreshPlayerAppearance();
  // GLB diver parents accessories to the model root; procedural parents head items to the head.
  r.crownAttached = !!g.player._accessory && (g.player._accessory.parent === g.player.mesh || g.player._accessory.parent === g.player.mesh.userData.parts.head);
  g.economy.s.equippedAccessory = 'backpack'; g.refreshPlayerAppearance();
  r.backpackOnBody = !!g.player._accessory && (g.player._accessory.parent === g.player.mesh || !!(g.player._accessory.parent && g.player._accessory.parent.isBone) || g.player._accessory.parent === g.player.mesh.userData.lean);
  // unequip clears it
  g.economy.s.equippedAccessory = null; g.refreshPlayerAppearance();
  r.unequipClears = g.player._accessory === null;
  g.economy.s.equippedAccessory = 'crown'; g.refreshPlayerAppearance(); // put crown back for the shot

  // SWIM vs WALK: prove distinct animation + no nose-dive (head stays near the surface).
  const headWorldY = () => {
    const h = g.player.mesh.userData.parts.head;
    g.player.mesh.updateWorldMatrix(true, true);   // matrices aren't auto-updated while paused
    const v = new (g.player.mesh.position.constructor)();
    h.getWorldPosition(v);
    return +v.y.toFixed(2);
  };
  const drive = (mode) => {
    const inp = { x: 0, z: 1, len: 1, sprint: false };
    g.player.pos.set(0, 0.2, -60);
    for (let i = 0; i < 60; i++) { g.player.pos.set(0, 0.2, -60); g.player.update(1 / 60, inp, mode); }
    const ud = g.player.mesh.userData;
    if (isGLB) return { clip: ud.currentClip, headWorldY: headWorldY() };
    return { leanX: +ud.lean.rotation.x.toFixed(2), armL: +ud.parts.shL.rotation.x.toFixed(2), headWorldY: headWorldY() };
  };
  // idle head height (no movement) for comparison
  g.player.pos.set(0, 0.2, -60); for (let i = 0; i < 5; i++) g.player.update(1 / 60, { x: 0, z: 0, len: 0, sprint: false }, 'hub');
  r.idleHeadY = headWorldY();
  r.swim = drive('level');
  r.walk = drive('hub');
  // animation differs between modes, and the head never nose-dives far below the surface
  r.swimDiffersFromWalk = isGLB ? (r.swim.clip !== r.walk.clip) : (r.swim.leanX !== r.walk.leanX);
  r.noNoseDive = r.swim.headWorldY > -1.5;

  // ACHIEVEMENT reward applies on unlock (coins_100 -> +60)
  g.economy.s.achievements = []; g.economy.s.totalCoins = 100; const c0 = g.economy.s.coins;
  g.economy.checkAchievements();
  r.achCoins100Delta = g.economy.s.coins - c0;
  return r;
});

// Screenshot: player wearing crown in a swim pose
await p.evaluate(() => { document.getElementById('ui-root').style.display = 'none'; window.__ROS.game._loop = () => {}; });
await p.evaluate(async () => {
  const g = window.__ROS.game; g.scene.fog = null; g.water.visible = false;
  const pl = g.player; pl.pos.set(0, 0.5, -60); pl.mesh.rotation.y = 0.5;
  for (let i = 0; i < 30; i++) pl.update(1 / 60, { x: 0.6, z: 0.6, len: 1, sprint: false }, 'level');
  g.camera.position.set(3, 1.6, -56.5); g.camera.lookAt(0, 0.8, -60);
  for (let i = 0; i < 6; i++) { g.renderer.render(g.scene, g.camera); await new Promise(r => requestAnimationFrame(r)); }
});
await sleep(150);
await p.screenshot({ path: 'player-acc.png' });

console.log('===GAMEPLAY_TEST_JSON===');
console.log(JSON.stringify({ ...data, errors: errs }, null, 2));
await b.close();
