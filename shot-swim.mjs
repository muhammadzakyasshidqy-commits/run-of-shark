import { chromium } from 'playwright';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1000,height:600} });
await p.goto('http://localhost:5173/', { waitUntil:'networkidle' });
await p.evaluate(async()=>{ const m=await import('/src/assets/Assets.js'); await m.loadAssets(); });
await p.evaluate(()=>{ document.getElementById('ui-root').style.display='none'; });
const info = await p.evaluate(async()=>{
  const g=window.__ROS.game; g.startLevel(0); g.cinematic=null; g.controlLocked=false; g.running=true; g.paused=false;
  const pl=g.player; const input={x:0,z:1,len:1,sprint:false};
  pl.mesh.rotation.y=0;
  for(let i=0;i<120;i++){ pl.mesh.rotation.y=0; pl.update(1/60,input,'level'); } // settle float + swim
  g.running=false; g.paused=true; g._loop=()=>{};
  for(let k=0;k<4;k++) await new Promise(r=>requestAnimationFrame(r));
  g.scene.fog=null; const h=g.scene.children.find(c=>c.isHemisphereLight); if(h)h.intensity=1.5; g.scene.background&&g.scene.background.set&&g.scene.background.set(0x4a90c0);
  const py=pl.mesh.position.y;
  g.camera.position.set(5,py+1.2,pl.pos.z-5); g.camera.lookAt(0,py,pl.pos.z+2);
  g.renderer.render(g.scene,g.camera);
  return { playerY:+py.toFixed(2) };
});
await sleep(120); await p.screenshot({ path:'swim-float.png' });
await b.close(); console.log(JSON.stringify(info));
