import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:5173/', { waitUntil:'networkidle' });
await p.evaluate(async () => { const m = await import('/src/assets/Assets.js'); await m.loadAssets(); });
const r = await p.evaluate(() => {
  const g = window.__ROS.game; g.enterHub();
  const pl = g.player;
  // recolor to red + attach a head item (crown) and a body item (backpack)
  pl.applyAppearance(0xc0392b, 'crown');
  let mainHex=null, accAttached=false, accParentIsBone=false;
  pl.mesh.traverse(o=>{ if(o.isMesh && o.userData.outfit && o.material && o.material.name==='M_Main') mainHex=o.material.color.getHexString(); });
  accAttached = !!pl._accessory;
  accParentIsBone = !!(pl._accessory && pl._accessory.parent && pl._accessory.parent.isBone);
  // swap to backpack (body item)
  pl.applyAppearance(0xc0392b, 'backpack');
  const bodyAttached = !!pl._accessory;
  return { mainHex, accAttached, accParentIsBone, bodyAttached };
});
console.log(JSON.stringify({r,errs},null,2));
await b.close();
