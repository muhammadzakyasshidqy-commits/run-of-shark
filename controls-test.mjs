import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:5173/', { waitUntil:'networkidle' });
await p.evaluate(async()=>{ const m=await import('/src/assets/Assets.js'); await m.loadAssets(); });
const r = await p.evaluate(async ()=>{
  const g=window.__ROS.game; const set=g.save.data.settings;
  g.startLevel(0); g.cinematic=null;
  const pl=g.player; pl.pos.set(0,1,0);
  const dist=()=>Math.hypot(g.camera.position.x-pl.pos.x, g.camera.position.z-pl.pos.z);
  const snap=()=>{ for(let i=0;i<3;i++) g._updateCamera(1, false); return +dist().toFixed(1); }; // dt=1 => snap to target
  set.cameraFollow=true;
  set.cameraDistance='near'; const dNear=snap();
  set.cameraDistance='medium'; const dMed=snap();
  set.cameraDistance='far'; const dFar=snap();
  // auto-follow: turn player, step with follow ON vs OFF, see if camYaw tracks
  set.cameraDistance='medium';
  pl.mesh.rotation.y=2.0;
  set.cameraFollow=false; g.camYaw=0; for(let i=0;i<30;i++) g._updateCamera(0.1, true); const yawOff=+g.camYaw.toFixed(2);
  set.cameraFollow=true;  g.camYaw=0; for(let i=0;i<30;i++) g._updateCamera(0.1, true); const yawOn=+g.camYaw.toFixed(2);
  return { dNear, dMed, dFar, yawOff_shouldStay0:yawOff, yawOn_shouldApproach2:yawOn };
});
console.log(JSON.stringify({r, errors:errs},null,2));
await b.close();
