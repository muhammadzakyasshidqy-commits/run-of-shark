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
  g.economy.s.equippedAccessory = 'crown'; g.refreshPlayerAppearance();
  r.crownAttached = !!g.player._accessory && g.player._accessory.parent === g.player.mesh.userData.parts.head;
  g.economy.s.equippedAccessory = 'backpack'; g.refreshPlayerAppearance();
  r.backpackOnBody = !!g.player._accessory && g.player._accessory.parent === g.player.mesh;
  // unequip clears it
  g.economy.s.equippedAccessory = null; g.refreshPlayerAppearance();
  r.unequipClears = g.player._accessory === null;
  g.economy.s.equippedAccessory = 'crown'; g.refreshPlayerAppearance(); // put crown back for the shot

  // SWIM vs WALK animation: drive a few frames in each mode, record body lean + arm pose
  const drive = (mode) => {
    const inp = { x: 0, z: 1, len: 1, sprint: false };
    for (let i = 0; i < 40; i++) g.player.update(1 / 60, inp, mode);
    const parts = g.player.mesh.userData.parts;
    return { leanX: +g.player.mesh.rotation.x.toFixed(2), armL: +parts.shL.rotation.x.toFixed(2) };
  };
  r.swim = drive('level');
  r.walk = drive('hub');

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
