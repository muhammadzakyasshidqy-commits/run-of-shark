// Proves no two hub trigger-zones (or solids) overlap, and dumps final building/zone positions.
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(500);

const res = await p.evaluate(async () => {
  const g = window.__ROS.game;
  g.enterHub(); g.paused = true;
  const hub = g.hub;
  const zones = hub.zones.map((z) => ({ name: z.name, panel: z.panel, x: +z.x.toFixed(1), z: +z.z.toFixed(1), r: z.r }));
  const solids = hub.solids.map((s) => ({ x: +s.x.toFixed(1), z: +s.z.toFixed(1), r: s.r }));

  // zone-vs-zone overlap (a player could be inside two at once if dist < r1+r2)
  const zoneOverlaps = [];
  for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++) {
    const a = zones[i], c = zones[j];
    const d = Math.hypot(a.x - c.x, a.z - c.z);
    if (d < a.r + c.r) zoneOverlaps.push({ a: a.name, b: c.name, dist: +d.toFixed(2), sumR: +(a.r + c.r).toFixed(2) });
  }
  // zone-center-vs-solid: a zone whose centre sits inside a building solid is unreachable
  const zoneInSolid = [];
  for (const zn of zones) for (const s of solids) {
    const d = Math.hypot(zn.x - s.x, zn.z - s.z);
    if (d < s.r) zoneInSolid.push({ zone: zn.name, solid: `${s.x},${s.z}`, dist: +d.toFixed(2), solidR: s.r });
  }
  // island containment: every zone within the fence (R-1 from CENTER 0,-12)
  const R = 54, Cx = 0, Cz = -12, fence = R - 1;
  const outOfBounds = zones.filter((zn) => Math.hypot(zn.x - Cx, zn.z - Cz) > fence)
    .map((zn) => ({ name: zn.name, distFromCentre: +Math.hypot(zn.x - Cx, zn.z - Cz).toFixed(1) }));

  return { zones, solids, zoneOverlaps, zoneInSolid, outOfBounds };
});

console.log('===LAYOUT_CHECK_JSON===');
console.log(JSON.stringify({ ...res, errors: errs }, null, 2));
await b.close();
