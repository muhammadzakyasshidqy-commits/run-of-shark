import { chromium } from 'playwright';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:700,height:700} });
await p.goto('http://localhost:5173/', { waitUntil:'networkidle' });
await p.evaluate(async()=>{ const m=await import('/src/assets/Assets.js'); await m.loadAssets(); });
await p.evaluate(()=>{ document.getElementById('ui-root').style.display='none'; });
await p.evaluate(async()=>{
  const g=window.__ROS.game; g.enterHub();
  g.economy.s.equippedAccessory='crown'; g.refreshPlayerAppearance();
  const pl=g.player; pl.pos.set(0,0.2,0); pl.mesh.rotation.y=Math.PI; // face camera BEFORE updates
  for(let i=0;i<30;i++){ pl.mesh.rotation.y=Math.PI; pl.update(1/60,{x:0,z:0,len:0,sprint:false},'hub'); } // tracker runs under final rotation
  g.running=false; g.paused=true; g._loop=()=>{};
  for(let k=0;k<4;k++) await new Promise(r=>requestAnimationFrame(r));
  g.scene.fog=null; const a=g.scene.children.find(c=>c.isHemisphereLight); if(a)a.intensity=1.5;
  g.camera.position.set(0,1.4,3.0); g.camera.lookAt(0,1.15,0);
  g.renderer.render(g.scene,g.camera);
});
await sleep(120); await p.screenshot({ path:'diver-crown.png' });
await b.close(); console.log('ok');
