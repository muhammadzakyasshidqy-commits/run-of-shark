// Low-poly cartoon hub structures (procedural, no external assets). Each returns a Group.
// Signage uses a CanvasTexture so labels are readable without image files.
import * as THREE from 'three';
import { VEHICLES, LEVELS } from '../config.js';

const mat = (c, flat = true, o = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: flat, roughness: 0.85, ...o });

export function makeSign(text, w = 5, bg = '#0a3d62', fg = '#ffd166') {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = fg; ctx.lineWidth = 6; ctx.strokeRect(3, 3, 250, 58);
  ctx.fillStyle = fg; ctx.font = 'bold 38px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(cv);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  m.userData.isSign = true;
  return m;
}

// BANK — columned facade + pediment + a separate ATM box out front.
export function makeBank() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 7), mat(0xe8e0cf));
  body.position.y = 2.5; g.add(body);
  for (const x of [-4, -1.5, 1.5, 4]) { // columns
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 5, 8), mat(0xffffff));
    col.position.set(x, 2.5, 3.6); g.add(col);
  }
  const ped = new THREE.Mesh(new THREE.ConeGeometry(6.2, 2, 4), mat(0xc0392b));
  ped.rotation.y = Math.PI / 4; ped.position.set(0, 6, 1); ped.scale.set(1, 1, 0.55); g.add(ped);
  const sign = makeSign('BANK', 5, '#0a3d62', '#ffd166'); sign.position.set(0, 5.4, 3.7); g.add(sign);
  // ATM out front
  const atm = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 1), mat(0x2c3e50)); box.position.y = 1; atm.add(box);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), mat(0x2ec4ff, false, { emissive: 0x113344 })); scr.position.set(0, 1.4, 0.51); atm.add(scr);
  atm.position.set(0, 0, 6); g.add(atm);
  g.traverse((o) => { if (o.isMesh && !o.userData.isSign) o.castShadow = true; });
  return g;
}

// SHOP — a row of striped-awning kiosks.
export function makeShop() {
  const g = new THREE.Group();
  const colors = [0xff6b6b, 0x2ecc71, 0x4a90d9];
  for (let i = 0; i < 3; i++) {
    const k = new THREE.Group();
    const stall = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 2.4), mat(0xdcc9a8)); stall.position.y = 1.2; k.add(stall);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 0.6), mat(0x8a5a2b)); counter.position.set(0, 1.1, 1.3); k.add(counter);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.2, 1.6), mat(colors[i])); awn.position.set(0, 2.5, 1.1); awn.rotation.x = -0.3; k.add(awn);
    // goods on the counter
    for (let j = 0; j < 3; j++) { const it = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mat([0xffd166, 0x9b59b6, 0xe74c3c][j])); it.position.set(-1 + j, 1.5, 1.3); k.add(it); }
    k.position.set((i - 1) * 4, 0, 0); g.add(k);
  }
  const sign = makeSign('SHOP', 6, '#1e3a5f', '#2ecc71'); sign.position.set(0, 3.6, 1.3); g.add(sign);
  g.traverse((o) => { if (o.isMesh && !o.userData.isSign) o.castShadow = true; });
  return g;
}

// GARAGE — open structure; owned vehicles shown in colour, locked ones greyed out.
export function makeGarage(ownedVehicleIds = []) {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 7), mat(0x7f8c8d)); slab.position.y = 0.15; g.add(slab);
  for (const x of [-6.5, 6.5]) { for (const z of [-3, 3]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4, 6), mat(0xbdc3c7)); post.position.set(x, 2, z); g.add(post); } }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(15, 0.4, 8), mat(0xe74c3c)); roof.position.set(0, 4.1, 0); g.add(roof);
  // vehicle silhouettes (first 5 slots)
  VEHICLES.slice(0, 5).forEach((v, i) => {
    const owned = ownedVehicleIds.includes(v.id);
    const car = new THREE.Mesh(new THREE.BoxGeometry(2, 0.9, 1.3), mat(owned ? v.color : 0x555a5e, true, owned ? {} : { opacity: 0.6, transparent: true }));
    car.position.set(-5 + i * 2.5, 0.75, 0); g.add(car);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 1.1), mat(owned ? 0x222831 : 0x44484c)); cab.position.set(-5 + i * 2.5, 1.4, 0); g.add(cab);
  });
  const sign = makeSign('GARAGE', 6, '#2c2c2c', '#ffffff'); sign.position.set(0, 4.6, 0); g.add(sign);
  g.traverse((o) => { if (o.isMesh && !o.userData.isSign) o.castShadow = true; });
  return g;
}

// TOWER — tall spire with level markers 1..6 (locked levels show a padlock cube).
export function makeTower(highestUnlocked = 1) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.5, 3, 8), mat(0x8d6e63)); base.position.y = 1.5; g.add(base);
  // banded shaft (two colours) — taller so it's the clear island landmark
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 14, 8), mat(0xa1887f)); shaft.position.y = 10; g.add(shaft);
  for (let i = 0; i < 4; i++) { const band = new THREE.Mesh(new THREE.CylinderGeometry(2.3 + (3 - i) * 0.07, 2.4 + (3 - i) * 0.07, 0.6, 8), mat(0xc0392b)); band.position.y = 5 + i * 3.2; g.add(band); }
  const balcony = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.5, 8), mat(0x8d6e63)); balcony.position.y = 17.2; g.add(balcony);
  const top = new THREE.Mesh(new THREE.ConeGeometry(3.2, 5, 8), mat(0xc0392b)); top.position.y = 20; g.add(top);
  // glowing beacon + pole, visible from across the island
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), mat(0xffe066, false, { emissive: 0xffaa00, emissiveIntensity: 1 })); beacon.position.y = 23.2; g.add(beacon);
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2, 5), mat(0x333333)); flagPole.position.set(0, 24.5, 0); g.add(flagPole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.2), mat(0xffd166, false)); flag.position.set(1.1, 24.8, 0); g.add(flag);
  // Level markers spiralling up: numbered slots 1..6, padlock on locked ones.
  for (let i = 0; i < LEVELS.length; i++) {
    const lvl = LEVELS[i];
    const unlocked = highestUnlocked >= lvl.id;
    const a = (i / LEVELS.length) * Math.PI * 2;
    const y = 4 + i * 1.9;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 0.35), mat(unlocked ? 0x2ecc71 : 0x46505a));
    plate.position.set(Math.cos(a) * 3, y, Math.sin(a) * 3);
    plate.lookAt(plate.position.x * 2, y, plate.position.z * 2); // face outward
    g.add(plate);
    // number label on the plate face
    const num = makeSign(String(lvl.id), 1.2, unlocked ? '#0a3d2a' : '#20262c', unlocked ? '#9be86b' : '#9aa3ab');
    num.position.set(0, 0, 0.2); plate.add(num);
    if (!unlocked) { // gold padlock = clearly "level digembok"
      const lock = new THREE.Group();
      const bodyL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.16), mat(0xffd166, false, { metalness: 0.5, emissive: 0x4a3500 })); lock.add(bodyL);
      const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 12, Math.PI), mat(0xdddddd, false, { metalness: 0.7 })); shackle.position.y = 0.18; lock.add(shackle);
      lock.position.set(0, 0.35, 0.26); plate.add(lock);
    }
  }
  const sign = makeSign('LEVELS', 5, '#10243a', '#2ec4ff'); sign.position.set(0, 3, 4.2); g.add(sign);
  g.traverse((o) => { if (o.isMesh && !o.userData.isSign) o.castShadow = true; });
  return g;
}

// A single themed kiosk (one stall) for a specific shop category.
export function makeKiosk(label, awningColor, displayColor) {
  const g = new THREE.Group();
  const stall = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 2.6), mat(0xe8dcc0)); stall.position.y = 1.3; g.add(stall);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 0.7), mat(0x8a5a2b)); counter.position.set(0, 1.1, 1.45); g.add(counter);
  // striped awning
  for (let i = 0; i < 5; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 1.7), mat(i % 2 ? awningColor : 0xffffff));
    stripe.position.set(-1.44 + i * 0.72, 2.7, 1.2); stripe.rotation.x = -0.32; g.add(stripe);
  }
  // a couple of "display goods" cubes representing the wares
  for (let j = 0; j < 3; j++) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mat(displayColor, false, { metalness: 0.2 })); d.position.set(-1 + j, 1.5, 1.45); g.add(d); }
  const sign = makeSign(label, 4.2, '#10243a', '#ffd166'); sign.position.set(0, 3.5, 1.35); g.add(sign);
  g.traverse((o) => { if (o.isMesh && !o.userData.isSign) o.castShadow = true; });
  return g;
}

// Wheel of Fortune: a big vertical disc with coloured segments, a hub, a rim, a top
// pointer, and a stand. userData.wheel = the spinning disc (Hub spins it).
export function makeLuckyWheel(segments = 6) {
  const g = new THREE.Group();
  const R = 2.6;
  const palette = [0xff6b6b, 0xffd166, 0x2ecc71, 0x2ec4ff, 0x9b59b6, 0xff9f43, 0xe84393, 0x1abc9c];
  const wheel = new THREE.Group();
  for (let i = 0; i < segments; i++) {
    const seg = new THREE.Mesh(
      new THREE.CircleGeometry(R, 16, (i / segments) * Math.PI * 2, (Math.PI * 2) / segments),
      new THREE.MeshStandardMaterial({ color: palette[i % palette.length], flatShading: true, roughness: 0.6, side: THREE.DoubleSide })
    );
    wheel.add(seg);
    // little prize dot near the rim of each segment
    const ang = ((i + 0.5) / segments) * Math.PI * 2;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat(0xffffff, false, { emissive: 0x333333 }));
    dot.position.set(Math.cos(ang) * R * 0.7, Math.sin(ang) * R * 0.7, 0.06); wheel.add(dot);
  }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.18, 8, 28), mat(0xffffff, false, { metalness: 0.3 })); wheel.add(rim);
  const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12), mat(0xffd166, false, { metalness: 0.6, emissive: 0x4a3500 }));
  hubCap.rotation.x = Math.PI / 2; wheel.add(hubCap);
  wheel.position.set(0, R + 1.4, 0); wheel.rotation.z = 0; g.add(wheel);

  // stand: two angled legs + axle post
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, R + 1.6, 6), mat(0x6b4a2c));
    leg.position.set(s * 1.1, (R + 1.4) / 2, 0); leg.rotation.z = s * 0.32; g.add(leg);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 8), mat(0x333333)); axle.rotation.x = Math.PI / 2; axle.position.set(0, R + 1.4, 0); g.add(axle);
  // top pointer (triangle pointing down into the wheel)
  const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 4), mat(0xe74c3c, false, { emissive: 0x551111 }));
  pointer.position.set(0, R + 1.4 + R + 0.1, 0); pointer.rotation.x = Math.PI; g.add(pointer);

  g.userData.wheel = wheel;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Simple static low-poly villager/shopkeeper NPC. shirt + hat colours vary so NPCs
// across the island don't look like clones. Idle-bobbing handled by Hub.
export function makeNPC(shirt = 0x4a90d9, hat = null) {
  const g = new THREE.Group();
  const skin = 0xffc9a3;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.5, 3, 7), mat(shirt)); body.position.y = 0.95; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), mat(skin, false)); head.position.y = 1.6; g.add(head);
  for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.4, 3, 6), mat(shirt)); arm.position.set(s * 0.36, 0.95, 0); g.add(arm); }
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.4, 3, 6), mat(0x34495e)); leg.position.set(s * 0.15, 0.4, 0); g.add(leg); }
  if (hat != null) { // little cap so shopkeepers look distinct
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.18, 8), mat(hat)); cap.position.y = 1.86; g.add(cap);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.06, 8), mat(hat)); brim.position.set(0, 1.8, 0.12); g.add(brim);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Floating directional chevron arrow pointing toward a building (helps new players).
export function makeArrow(color = 0xffd166) {
  const g = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.9, 4),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, flatShading: true }));
    head.rotation.x = Math.PI / 2; head.position.z = i * 0.8; g.add(head);
  }
  g.userData.float = true;
  return g;
}

// A glowing ground ring that marks a trigger zone.
export function makeZoneMarker(radius, color) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.25, 8, 28),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, flatShading: true }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16 }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.12;
  const g = new THREE.Group(); g.add(ring); g.add(disc);
  g.userData.ring = ring;
  return g;
}
