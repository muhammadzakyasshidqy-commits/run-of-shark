// Desktop end-to-end: real clicks to start a level, then real keyboard movement.
// Default Playwright chromium = desktop (no touch emulation).
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(500);

const out = {};
out.isTouch = await p.evaluate(() => matchMedia('(hover: none), (pointer: coarse)').matches);

// Click PLAY then the first level's Play button via real mouse clicks
await p.getByText('▶ PLAY', { exact: false }).click();
await sleep(300);
await p.getByText('Play', { exact: true }).first().click();
await sleep(1200);
out.started = await p.evaluate(() => ({ running: window.__ROS.game.running, hasPlayer: !!window.__ROS.game.player }));

// Record start pos, press W (forward), measure dz
const startPos = await p.evaluate(() => ({ x: window.__ROS.game.player.pos.x, z: window.__ROS.game.player.pos.z }));
await p.keyboard.down('w'); await sleep(700); await p.keyboard.up('w');
const afterW = await p.evaluate(() => ({ x: window.__ROS.game.player.pos.x, z: window.__ROS.game.player.pos.z }));
await p.keyboard.down('d'); await sleep(500); await p.keyboard.up('d');
const afterD = await p.evaluate(() => ({ x: window.__ROS.game.player.pos.x, z: window.__ROS.game.player.pos.z }));
await p.keyboard.down('ArrowLeft'); await sleep(500); await p.keyboard.up('ArrowLeft');
const afterLeft = await p.evaluate(() => ({ x: window.__ROS.game.player.pos.x, z: window.__ROS.game.player.pos.z }));

out.startPos = startPos; out.afterW = afterW; out.afterD = afterD; out.afterLeft = afterLeft;
out.movedForwardW = +(afterW.z - startPos.z).toFixed(2);
out.movedRightD = +(afterD.x - afterW.x).toFixed(2);
out.movedLeftArrow = +(afterLeft.x - afterD.x).toFixed(2);
out.errors = errs;

console.log('===DESKTOP_TEST_JSON===');
console.log(JSON.stringify(out, null, 2));
await b.close();
