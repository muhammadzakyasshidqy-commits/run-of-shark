import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
for (const [name, w, hh] of [['menu-phone', 380, 800], ['menu-desktop', 1280, 800]]) {
  const p = await b.newPage({ viewport: { width: w, height: hh } });
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await sleep(800);
  await p.screenshot({ path: name + '.png' });
  // overlap check: any menu text node wider than the card / clipped?
  const info = await p.evaluate(() => {
    const card = document.querySelector('.menu-card');
    const r = card.getBoundingClientRect();
    return { cardBottomVisible: r.bottom <= window.innerHeight + 1, cardW: Math.round(r.width), creditText: document.querySelector('.menu-credit')?.textContent };
  });
  console.log(name, JSON.stringify(info));
  await p.close();
}
await b.close(); console.log('menu shots saved');
