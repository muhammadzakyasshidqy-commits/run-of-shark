// Item 1: metal ship hidden at level start, revealed only after reaching the submarine.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:5173/', { waitUntil:'networkidle' });
await p.evaluate(async()=>{ const m=await import('/src/assets/Assets.js'); await m.loadAssets(); });
const out = [];
for (const lvl of [0,1,2,3]) {  // dive levels L1-L4
  const r = await p.evaluate(async (idx)=>{
    const g=window.__ROS.game; g.startLevel(idx); g.cinematic=null; g.controlLocked=false;
    const atStart = g.level.ship.visible;
    // teleport player onto the submarine to trigger the win->_subToShip reveal
    const sub=g.level.submarine; g.player.pos.set(sub.position.x, 0.2, sub.position.z);
    // run a few frames so Level.update returns 'win' and Game reveals the ship
    for(let i=0;i<10;i++){ g._loop(); await new Promise(r=>requestAnimationFrame(r)); }
    const afterReach = g.level.ship.visible;
    return { idx:idx+1, atStart, afterReach };
  }, lvl);
  out.push(r);
}
console.log('===SHIP_REVEAL==='); console.log(JSON.stringify({out, errors:errs}, null, 2));
await b.close();
