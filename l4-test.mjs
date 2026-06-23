import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:5173/', { waitUntil:'networkidle' });
await p.evaluate(async()=>{ const m=await import('/src/assets/Assets.js'); await m.loadAssets(); });
const out = await p.evaluate(async ()=>{
  const g=window.__ROS.game;
  function runLane(laneX, vehicle){
    g.economy.s.equippedVehicle = vehicle;
    g.startLevel(3); g.cinematic=null; g.controlLocked=false; g.running=true; g.paused=false;
    const pl=g.player; const sub=g.level.submarine;
    pl.pos.set(laneX*0.4, 1.35, pl.pos.z);
    let minShark=999, result=null;
    for(let i=0;i<2000;i++){
      // nearest shark
      let nd=999; for(const s of g.level.sharks){ if(s.active){ const d=Math.hypot(s.pos.x-pl.pos.x,s.pos.z-pl.pos.z); if(d<nd)nd=d; } }
      if(nd<minShark)minShark=nd;
      const dz=sub.position.z-pl.pos.z; const targetX = dz>25 ? laneX : sub.position.x;
      const dx=targetX-pl.pos.x; const len=Math.hypot(dx,dz)||1;
      const sprint = (nd<18 && pl.stamina>12);                 // sprint only when threatened + have stamina
      pl.update(1/60, {x:dx/len, z:dz/len, len:1, sprint}, 'level');
      const r=g.level.update(1/60, pl);
      if(r){ result=r; break; }
    }
    return { result, minShark:+minShark.toFixed(1), distLeft:+Math.hypot(sub.position.x-pl.pos.x, sub.position.z-pl.pos.z).toFixed(1) };
  }
  return {
    left_base: runLane(-16, null), right_base: runLane(16, null),
    left_scooter: runLane(-16, 'scooter'), right_scooter: runLane(16, 'scooter'),
  };
});
console.log('===L4==='); console.log(JSON.stringify({out, errs}, null, 2));
await b.close();
