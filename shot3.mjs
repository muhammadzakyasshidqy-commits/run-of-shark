import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 560 } });
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(600);
await p.evaluate(() => { document.getElementById('ui-root').style.display = 'none'; window.__ROS.game._loop = () => {}; });

// SWIM POSE (side view, crown on)
await p.evaluate(async () => {
  const g = window.__ROS.game; g.startLevel(0); g.cinematic=null; g.controlLocked=false; g.paused=true;
  g.scene.fog=null; g.water.visible=false;
  g.economy.s.equippedAccessory='crown'; g.refreshPlayerAppearance();
  const pl=g.player; pl.pos.set(0,1.2,-60); pl.mesh.rotation.y=Math.PI/2;
  for(let i=0;i<50;i++){pl.pos.set(0,1.2,-60); pl.mesh.rotation.y=Math.PI/2; pl.update(1/60,{x:1,z:0,len:1,sprint:false},'level'); pl.pos.set(0,1.2,-60);}
  g.camera.position.set(0,2.5,-54); g.camera.lookAt(0,1.0,-60);
  for(let k=0;k<6;k++){g.renderer.render(g.scene,g.camera);await new Promise(r=>requestAnimationFrame(r));}
});
await sleep(120); await p.screenshot({ path: 'shot-swim.png' });

// LUXURY CAR (level 6) close-up
await p.evaluate(async () => {
  const g = window.__ROS.game; g.startLevel(5); g.cinematic=null; g.controlLocked=false; g.paused=true; g.scene.fog=null; g.water.visible=false;
  const car=g.level.car.position;
  g.camera.position.set(car.x-8,4,car.z-9); g.camera.lookAt(car.x,1.5,car.z);
  for(let k=0;k<6;k++){g.renderer.render(g.scene,g.camera);await new Promise(r=>requestAnimationFrame(r));}
});
await sleep(120); await p.screenshot({ path: 'shot-luxury.png' });

// HUB overview (wheel + split shops + NPCs)
await p.evaluate(async () => {
  const g = window.__ROS.game; g.enterHub(); g.paused=true; g.scene.fog=null;
  g.camera.position.set(0,60,72); g.camera.lookAt(0,2,-16);
  for(let k=0;k<6;k++){g.renderer.render(g.scene,g.camera);await new Promise(r=>requestAnimationFrame(r));}
});
await sleep(120); await p.screenshot({ path: 'shot-hub3.png' });

// HUB ground: lucky wheel + a shop kiosk + NPC
await p.evaluate(async () => {
  const g = window.__ROS.game;
  g.camera.position.set(-34,6,18); g.camera.lookAt(-34,3,4);
  for(let k=0;k<6;k++){g.renderer.render(g.scene,g.camera);await new Promise(r=>requestAnimationFrame(r));}
});
await sleep(120); await p.screenshot({ path: 'shot-wheel.png' });
await b.close(); console.log('shots saved');
