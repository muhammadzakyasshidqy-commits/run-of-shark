// Models — low-poly mesh factory (Bridge Race-ish colorful style).
// All geometry is procedural so no external 3D assets are needed.
import * as THREE from 'three';

const mat = (color, flat = true) =>
  new THREE.MeshStandardMaterial({ color, flatShading: flat, roughness: 0.85, metalness: 0.05 });

export function makeDiver(color = 0x2ec4ff) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.9, 4, 8), mat(color));
  body.position.y = 0.8; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), mat(0xffd6a5));
  head.position.y = 1.7; g.add(head);
  const mask = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.3), mat(0x111418));
  mask.position.set(0, 1.72, 0.22); g.add(mask);
  // fins
  const finGeo = new THREE.ConeGeometry(0.22, 0.6, 4);
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(finGeo, mat(0x111418));
    fin.position.set(s * 0.25, 0.05, -0.2); fin.rotation.x = Math.PI / 2; g.add(fin);
  }
  g.userData.body = body; g.userData.head = head;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeShark(color = 0x6c7a89, scale = 1) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 2.2, 4, 8), mat(color));
  body.rotation.z = Math.PI / 2; body.position.y = 0; g.add(body);
  const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.8, 4, 8), mat(0xeef2f3));
  belly.rotation.z = Math.PI / 2; belly.position.y = -0.25; belly.scale.set(1, 1, 0.7); g.add(belly);
  // dorsal fin
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 4), mat(color));
  dorsal.position.set(-0.1, 0.7, 0); dorsal.rotation.x = Math.PI; dorsal.scale.set(0.5, 1, 1); g.add(dorsal);
  // tail
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.2, 4), mat(color));
  tail.position.set(-1.7, 0, 0); tail.rotation.z = -Math.PI / 2; tail.scale.set(0.5, 1, 1); g.add(tail);
  // jaw teeth
  const teeth = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.4, 6), mat(0xffffff));
  teeth.position.set(1.5, -0.1, 0); teeth.rotation.z = -Math.PI / 2; g.add(teeth);
  // eyes
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(0x111111, false));
    eye.position.set(1.2, 0.2, s * 0.35); g.add(eye);
  }
  g.scale.setScalar(scale);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeCoin() {
  const g = new THREE.Group();
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 0.12, 14),
    new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.6, roughness: 0.3, emissive: 0x4a3500, flatShading: true })
  );
  coin.rotation.x = Math.PI / 2; g.add(coin);
  g.userData.spin = true;
  coin.castShadow = true;
  return g;
}

export function makeTreasure() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 0.7, 0.8), mat(0x8b5a2b));
  box.position.y = 0.35; g.add(box);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.3, 0.82), mat(0xffd166));
  lid.position.y = 0.8; g.add(lid);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeCoral(seed = 0) {
  const g = new THREE.Group();
  const colors = [0xff6b6b, 0xff9f43, 0x9b59b6, 0x06d6a0, 0xfeca57];
  const c = colors[Math.floor((seed * 7) % colors.length)];
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 1.6, 6), mat(c));
  trunk.position.y = 0.8; g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 1, 5), mat(c));
    branch.position.set(Math.cos(i * 2) * 0.4, 1.2 + i * 0.2, Math.sin(i * 2) * 0.4);
    branch.rotation.z = (i - 1) * 0.6; g.add(branch);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function makeBoat(color = 0x06d6a0) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 1.6), mat(color));
  hull.position.y = 0.4; g.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.4, 4), mat(color));
  bow.rotation.z = -Math.PI / 2; bow.position.set(2, 0.4, 0); bow.scale.set(1, 1, 0.8); g.add(bow);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1, 0.7, 1.1), mat(0xffffff));
  cabin.position.set(-0.4, 1, 0); g.add(cabin);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeSubmarine() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.2, 3, 6, 12), mat(0xffd166));
  body.rotation.z = Math.PI / 2; body.position.y = 1.2; g.add(body);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.2, 8), mat(0xf39c12));
  tower.position.y = 2.4; g.add(tower);
  const window = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), new THREE.MeshStandardMaterial({ color: 0x2ec4ff, emissive: 0x114, metalness: 0.4, roughness: 0.2 }));
  window.position.set(2.4, 1.2, 0); g.add(window);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.12, 8, 24), mat(0x06d6a0, false));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; g.add(ring);
  g.userData.ring = ring;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeShip() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 4), mat(0x95a5a6));
  hull.position.y = 1.5; g.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 3), mat(0xbdc3c7));
  deck.position.set(-1, 4, 0); g.add(deck);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.5, 10), mat(0xe74c3c));
  funnel.position.set(-2, 6, 0); g.add(funnel);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Sharp rock cluster — the boss arena hazard the boss can crash into.
export function makeHazard(seed = 0) {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 0), mat(0x4b3b47));
  rock.position.y = 0.4; rock.scale.set(1, 0.7, 1); g.add(rock);
  // sharp spikes
  const spikeGeo = new THREE.ConeGeometry(0.32, 1.6, 5);
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Mesh(spikeGeo, mat(0x6c5563));
    const a = (i / 6) * Math.PI * 2 + seed;
    sp.position.set(Math.cos(a) * 0.8, 0.9 + Math.sin(i) * 0.2, Math.sin(a) * 0.8);
    sp.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
    g.add(sp);
  }
  // warning glow base
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2, 0.12, 6, 18),
    new THREE.MeshStandardMaterial({ color: 0xff6b6b, emissive: 0x551111, flatShading: true }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.1; g.add(ring);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}

export function makeCar(color = 0xffd166) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3, 0.7, 1.5), mat(color));
  body.position.y = 0.7; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 1.3), mat(0x222831));
  cabin.position.set(-0.1, 1.25, 0); g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 10);
  for (const [x, z] of [[1, 0.75], [1, -0.75], [-1, 0.75], [-1, -0.75]]) {
    const w = new THREE.Mesh(wheelGeo, mat(0x111111));
    w.rotation.x = Math.PI / 2; w.position.set(x, 0.4, z); g.add(w);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
