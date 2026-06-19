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
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2, 3, 12, 8), mat(0xa1887f)); shaft.position.y = 9; g.add(shaft);
  const top = new THREE.Mesh(new THREE.ConeGeometry(3, 4, 8), mat(0xc0392b)); top.position.y = 17; g.add(top);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.2), mat(0xffd166, false)); flag.position.set(1.2, 18.5, 0); g.add(flag);
  // level markers spiralling up
  for (let i = 0; i < LEVELS.length; i++) {
    const unlocked = highestUnlocked >= LEVELS[i].id;
    const a = (i / LEVELS.length) * Math.PI * 2;
    const y = 4 + i * 1.9;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.4), mat(unlocked ? 0x2ecc71 : 0x555a5e));
    plate.position.set(Math.cos(a) * 3, y, Math.sin(a) * 3); plate.lookAt(plate.position.x * 2, y, plate.position.z * 2); g.add(plate);
    if (!unlocked) { const lock = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.2), mat(0xffd166)); lock.position.copy(plate.position); lock.position.y += 0.1; g.add(lock); }
  }
  const sign = makeSign('LEVELS', 5, '#10243a', '#2ec4ff'); sign.position.set(0, 3, 4.2); g.add(sign);
  g.traverse((o) => { if (o.isMesh && !o.userData.isSign) o.castShadow = true; });
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
