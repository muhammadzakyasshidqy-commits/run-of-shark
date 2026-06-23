import { chromium } from 'playwright';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1000,height:600} });
await p.goto('http://localhost:5173/', { waitUntil:'networkidle' });
await p.evaluate(async()=>{ const m=await import('/src/assets/Assets.js'); await m.loadAssets(); });
await p.evaluate(()=>{ document.getElementById('ui-root').style.display='none'; });
async function shot(name, camPos, lookAt){
  await p.evaluate(async (a)=>{
    const g=window.__ROS.game; g.enterHub(); g.running=false; g.paused=true; g._loop=()=>{};
    for(let k=0;k<4;k++) await new Promise(r=>requestAnimationFrame(r));
    g.scene.fog=null; const h=g.scene.children.find(c=>c.isHemisphereLight); if(h)h.intensity=1.45;
    g.camera.position.set(a.cp[0],a.cp[1],a.cp[2]); g.camera.lookAt(a.la[0],a.la[1],a.la[2]);
    g.renderer.render(g.scene,g.camera);
  }, {cp:camPos, la:lookAt});
  await sleep(100); await p.screenshot({ path:name+'.png' });
}
// left financial plaza (bank + wheel + ATM), viewed from the plaza (+X) looking -X
await shot('rv-leftplaza', [-12,9,-6], [-36,3,-6]);
// shops on the right, viewed from plaza looking +X
await shot('rv-shops', [12,9,-4], [40,3,-4]);
// dock + boat + sign, from above-front
await shot('rv-dock', [0,9,52], [0,1,30]);
// wheel close-up
await shot('rv-wheel', [-28,5,4], [-36,4,4]);
await b.close(); console.log('shots done');
