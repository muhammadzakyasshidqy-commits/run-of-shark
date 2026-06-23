import { chromium } from 'playwright';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:900,height:600} });
await p.goto('http://localhost:5173/', { waitUntil:'networkidle' });
await p.evaluate(async()=>{ const m=await import('/src/assets/Assets.js'); await m.loadAssets(); });
await p.evaluate(()=>{ document.getElementById('ui-root').style.display='none'; });
const info = await p.evaluate(async()=>{
  const g=window.__ROS.game; g.enterHub(); g.running=false; g.paused=true; g._loop=()=>{};
  for(let k=0;k<4;k++) await new Promise(r=>requestAnimationFrame(r));
  g.scene.fog=null; const h=g.scene.children.find(c=>c.isHemisphereLight); if(h)h.intensity=1.5;
  g.camera.position.set(7,4,40); g.camera.lookAt(0,0.5,37);
  g.renderer.render(g.scene,g.camera);
  // is boat GLB? find the boat object near (0,0.5,37)
  return { ok:true };
});
await sleep(100); await p.screenshot({ path:'boat-new.png' });
await b.close(); console.log(JSON.stringify(info));
