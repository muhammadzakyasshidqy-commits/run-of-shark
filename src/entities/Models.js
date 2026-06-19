// Models — low-poly cartoon mesh factory (Bridge Race-ish "chunky" style).
// All geometry is procedural (Three.js primitives) — no external 3D assets.
// IMPORTANT: gameplay reads only a few userData contracts (submarine.userData.ring,
// coin.userData.spin) and group transform/scale. Visual internals are free to change.
import * as THREE from 'three';

const mat = (color, flat = true, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: flat, roughness: 0.82, metalness: 0.04, ...opts });

// A capsule helper (rounded, cartoon-friendly limbs/bodies).
const capsule = (r, len, color, seg = 6) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, seg), mat(color));

// ---------------------------------------------------------------------------
// PLAYER — chunky low-poly humanoid. `color` = outfit colour (skin system stays
// compatible: each skin is just a different outfit colour on the SAME model).
// userData.parts exposes pivots so Player.js can drive procedural walk/idle/hit anims.
// ---------------------------------------------------------------------------
export function makeDiver(color = 0x2ec4ff) {
  const g = new THREE.Group();
  const skinTone = 0xffc9a3;

  // torso — short & stout (outfit colour)
  const torso = capsule(0.34, 0.45, color, 8);
  torso.position.y = 1.02; torso.scale.set(1, 1, 0.8); g.add(torso);
  // chest stripe (lifejacket look)
  const vest = capsule(0.36, 0.2, 0xffffff, 8);
  vest.position.y = 1.18; vest.scale.set(1.02, 1, 0.82); g.add(vest);

  // big round head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), mat(skinTone, false));
  head.position.y = 1.85; g.add(head);
  // dive goggles
  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.42), mat(0x12303a, false, { metalness: 0.3 }));
  goggles.position.set(0, 1.9, 0.16); g.add(goggles);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.16, 0.06), mat(0x6fd3ff, false, { emissive: 0x113344, metalness: 0.4, roughness: 0.2 }));
  glass.position.set(0, 1.9, 0.37); g.add(glass);
  // snorkel
  const snorkel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 6), mat(0xff7043));
  snorkel.position.set(0.42, 2.0, 0.05); g.add(snorkel);

  // arms — pivot groups at shoulders so they can swing
  const mkLimb = (x, y, r, len, col) => {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0);
    const limb = capsule(r, len, col); limb.position.y = -(len / 2 + r * 0.4); pivot.add(limb);
    g.add(pivot); return pivot;
  };
  const shL = mkLimb(-0.42, 1.32, 0.13, 0.5, color);
  const shR = mkLimb(0.42, 1.32, 0.13, 0.5, color);
  // hands
  for (const [pivot] of [[shL], [shR]]) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), mat(skinTone, false));
    hand.position.y = -0.78; pivot.add(hand);
  }
  // legs — pivots at hips
  const hipL = mkLimb(-0.18, 0.7, 0.15, 0.45, 0x2b3a55);
  const hipR = mkLimb(0.18, 0.7, 0.15, 0.45, 0x2b3a55);
  // flippers (feet)
  for (const pivot of [hipL, hipR]) {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 4), mat(0x12303a));
    fin.rotation.x = Math.PI / 2.2; fin.position.set(0, -0.7, 0.18); pivot.add(fin);
  }

  g.userData.parts = { torso, head, shL, shR, hipL, hipR };
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------------------------------------------------------------------------
// SHARK — segmented body for undulation + clear per-type silhouettes.
// userData.segments / tail / jaw are animated by Shark.js. The GROUP keeps the
// same overall size band as before so the validated collision radius still matches.
// ---------------------------------------------------------------------------
export function makeShark(color = 0x6c7a89, scale = 1, type = 'normal') {
  const g = new THREE.Group();
  const belly = 0xeef2f3;
  const ghost = type === 'ghost';
  const matOpts = ghost ? { transparent: true, opacity: 0.42, emissive: 0x224455 } : {};
  const bodyMat = mat(color, true, matOpts);

  // --- segmented body (head +x -> tail -x), tapering ---
  const segs = [];
  const N = 6;
  const lenPer = 0.62;
  const widths = [0.42, 0.62, 0.6, 0.5, 0.36, 0.22]; // radius per segment
  for (let i = 0; i < N; i++) {
    const r = widths[i] * (type === 'fast' ? 0.85 : 1);
    const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), bodyMat);
    seg.scale.set(1.25, 1, type === 'fast' ? 0.8 : 1);
    seg.position.x = 1.4 - i * lenPer;
    g.add(seg); segs.push(seg);
    // white belly patch on mid segments
    if (i > 0 && i < 4 && !ghost) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(r * 0.8, 8, 6), mat(belly));
      b.scale.set(1.2, 0.6, 0.9); b.position.set(seg.position.x, -r * 0.5, 0); g.add(b); segs.push(b);
    }
  }

  // --- snout / head ---
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 6), bodyMat);
  snout.rotation.z = -Math.PI / 2; snout.position.set(2.0, 0.02, 0); g.add(snout);

  // --- jaw (lower) that opens on attack ---
  const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.7, 6), mat(0x40252b));
  jaw.rotation.z = -Math.PI / 2; jaw.position.set(1.75, -0.28, 0); g.add(jaw);
  const teeth = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.28, 8), mat(0xffffff, false));
  teeth.rotation.z = -Math.PI / 2; teeth.position.set(1.85, -0.05, 0); g.add(teeth);

  // --- dorsal fin ---
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 4), bodyMat);
  dorsal.position.set(0.2, 0.78, 0); dorsal.rotation.y = Math.PI / 4; dorsal.scale.set(0.45, 1, 1); g.add(dorsal);

  // --- pectoral fins ---
  for (const s of [-1, 1]) {
    const pec = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 4), bodyMat);
    pec.position.set(1.0, -0.15, s * 0.55); pec.rotation.set(Math.PI / 2, 0, s * 0.6); pec.scale.set(0.4, 1, 1); g.add(pec);
  }

  // --- tail fin (animated wag) ---
  const tail = new THREE.Group();
  const tFin1 = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 4), bodyMat);
  tFin1.rotation.z = -Math.PI / 2; tFin1.scale.set(0.4, 1, 1); tFin1.position.x = -0.4;
  const tFin2 = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 4), bodyMat);
  tFin2.rotation.z = Math.PI / 2; tFin2.scale.set(0.4, 1, 1); tFin2.position.set(-0.5, 0.5, 0);
  tail.add(tFin1, tFin2); tail.position.set(-1.9, 0, 0); g.add(tail);

  // --- eyes ---
  const eyeColor = type === 'kraken' || type === 'boss' ? 0xffcc00 : 0x111111;
  const eyeMat = mat(eyeColor, false, type === 'kraken' || type === 'boss' ? { emissive: 0x442200 } : {});
  let eyeXZ = [1.55, 0.18, 0.34];
  // --- type-specific silhouette features ---
  if (type === 'hammerhead') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 2.0), bodyMat);
    bar.position.set(1.95, 0.05, 0); g.add(bar);
    eyeXZ = [1.95, 0.1, 0.95]; // eyes on the ends of the hammer
  }
  if (type === 'mutant') {
    for (let i = 0; i < 4; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 4), mat(0x9be86b));
      spike.position.set(0.8 - i * 0.5, 0.55 + (i % 2) * 0.1, 0); g.add(spike);
    }
  }
  if (type === 'kraken') {
    // trailing tentacles
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.6, 5), mat(0x3a2d6b));
      t.rotation.z = Math.PI / 2; t.position.set(-2.4 - Math.random() * 0.5, (i - 1.5) * 0.3, (i - 1.5) * 0.25);
      g.add(t);
    }
  }
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), eyeMat);
    eye.position.set(eyeXZ[0], eyeXZ[1], s * eyeXZ[2]); g.add(eye);
  }

  g.scale.setScalar(scale);
  g.userData.segments = segs; g.userData.tail = tail; g.userData.jaw = jaw; g.userData.type = type;
  g.traverse((o) => { if (o.isMesh && !ghost) o.castShadow = true; });
  return g;
}

export function makeCoin() {
  const g = new THREE.Group();
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 0.12, 16),
    new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.7, roughness: 0.28, emissive: 0x4a3500, flatShading: true })
  );
  coin.rotation.x = Math.PI / 2; g.add(coin);
  const star = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 5), mat(0xfff2b0, false, { emissive: 0x6a5200 }));
  star.rotation.x = Math.PI / 2; g.add(star);
  g.userData.spin = true;
  coin.castShadow = true;
  return g;
}

export function makeTreasure() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 0.7, 0.8), mat(0x7a4a26));
  box.position.y = 0.35; g.add(box);
  for (const z of [-0.3, 0.3]) { // metal straps
    const strap = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.72, 0.1), mat(0xc9a227, false, { metalness: 0.5 }));
    strap.position.set(0, 0.35, z); g.add(strap);
  }
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.0, 8, 1, false, 0, Math.PI), mat(0x8b5a2b));
  lid.rotation.z = Math.PI / 2; lid.position.y = 0.72; g.add(lid);
  const gold = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), mat(0xffd166, false, { emissive: 0x6a5200 }));
  gold.scale.set(1, 0.4, 0.9); gold.position.y = 0.78; g.add(gold);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeCoral(seed = 0) {
  const g = new THREE.Group();
  const palette = [0xff6b6b, 0xff9f43, 0x9b59b6, 0x06d6a0, 0xfeca57, 0xff5da2];
  const c = palette[Math.floor((seed * 7) % palette.length)];
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, 1.5, 7), mat(c));
  trunk.position.y = 0.75; g.add(trunk);
  for (let i = 0; i < 4; i++) {
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 1.0, 6), mat(c));
    branch.position.set(Math.cos(i * 1.7) * 0.42, 1.1 + i * 0.18, Math.sin(i * 1.7) * 0.42);
    branch.rotation.set(Math.sin(i) * 0.5, 0, (i - 1.5) * 0.5); g.add(branch);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), mat(c, false, { emissive: c & 0x222222 }));
    bulb.position.copy(branch.position); bulb.position.y += 0.5; g.add(bulb);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------------------------------------------------------------------------
// WORLD STRUCTURES
// ---------------------------------------------------------------------------
export function makeBoat(color = 0x06d6a0) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 2.4, 4, 8), mat(color));
  hull.rotation.z = Math.PI / 2; hull.scale.set(1, 1, 0.7); hull.position.y = 0.5; g.add(hull);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.12, 6, 16), mat(0xffffff));
  rim.rotation.x = Math.PI / 2; rim.scale.set(1, 0.55, 1); rim.position.y = 0.8; g.add(rim);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.15, 1.0), mat(0xcaa15a));
  deck.position.y = 0.82; g.add(deck);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.9), mat(0xffffff));
  cabin.position.set(-0.5, 1.15, 0); g.add(cabin);
  const motor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.3), mat(0x333333));
  motor.position.set(-1.5, 0.6, 0); g.add(motor);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeSubmarine() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.2, 3, 6, 14), mat(0xffd166));
  body.rotation.z = Math.PI / 2; body.position.y = 1.2; g.add(body);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 4), mat(0xf39c12));
  fin.position.set(-2.4, 1.6, 0); fin.rotation.z = Math.PI / 2; fin.scale.set(0.4, 1, 1); g.add(fin);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.2, 10), mat(0xf39c12));
  tower.position.y = 2.4; g.add(tower);
  const periscope = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 6), mat(0x333333));
  periscope.position.set(0.1, 3.0, 0); g.add(periscope);
  // portholes
  for (const x of [1.2, 0, -1.2]) {
    const port = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 6, 12), mat(0xb5840f, false, { metalness: 0.5 }));
    port.position.set(x, 1.3, 1.05); g.add(port);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.24, 12), mat(0x2ec4ff, false, { emissive: 0x114, metalness: 0.4, roughness: 0.2 }));
    glass.position.set(x, 1.3, 1.06); g.add(glass);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.12, 8, 24), mat(0x06d6a0, false, { emissive: 0x0a3320 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; g.add(ring);
  g.userData.ring = ring; // gameplay anim contract
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeShip() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(11, 3, 4.2), mat(0x8a9aa3));
  hull.position.y = 1.5; g.add(hull);
  // angled bow
  const bow = new THREE.Mesh(new THREE.ConeGeometry(2.1, 3, 4), mat(0x8a9aa3));
  bow.rotation.z = -Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(6, 1.5, 0); bow.scale.set(1, 0.66, 1); g.add(bow);
  // red waterline stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(11.1, 0.5, 4.3), mat(0xe74c3c));
  stripe.position.y = 0.4; g.add(stripe);
  // multi-deck superstructure
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6, 1.8, 3.4), mat(0xeceff1));
  deck.position.set(-1, 3.9, 0); g.add(deck);
  const deck2 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.4, 2.8), mat(0xffffff));
  deck2.position.set(-1.5, 5.4, 0); g.add(deck2);
  // bridge windows
  const win = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 2.82), mat(0x2c3e50, false, { metalness: 0.3 }));
  win.position.set(-1.5, 5.6, 0); g.add(win);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 2.6, 12), mat(0xe74c3c));
  funnel.position.set(-2.6, 6.6, 0); g.add(funnel);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.3, 12), mat(0x2c3e50));
  cap.position.set(-2.6, 7.9, 0); g.add(cap);
  // railings
  for (const x of [3, 1, -4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 5), mat(0xbdc3c7));
    post.position.set(x, 3.4, 2); g.add(post);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Wooden dock / jetty — planks on posts (decorative, no collision).
export function makeDock(lengthZ = 14) {
  const g = new THREE.Group();
  const planks = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, lengthZ), mat(0xb07d4f));
  planks.position.y = 0.45; g.add(planks);
  // plank lines
  for (let i = 0; i < lengthZ / 1.2; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(3.24, 0.22, 0.06), mat(0x8a5d36));
    line.position.set(0, 0.46, -lengthZ / 2 + i * 1.2 + 0.6); g.add(line);
  }
  // support posts
  for (let i = 0; i < lengthZ / 3; i++) {
    for (const x of [-1.4, 1.4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.6, 6), mat(0x6b4a2c));
      post.position.set(x, -0.3, -lengthZ / 2 + i * 3 + 1.5); g.add(post);
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function makeHazard(seed = 0) {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 0), mat(0x4b3b47));
  rock.position.y = 0.4; rock.scale.set(1, 0.7, 1); g.add(rock);
  const spikeGeo = new THREE.ConeGeometry(0.32, 1.6, 5);
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Mesh(spikeGeo, mat(0x6c5563));
    const a = (i / 6) * Math.PI * 2 + seed;
    sp.position.set(Math.cos(a) * 0.8, 0.9 + Math.sin(i) * 0.2, Math.sin(a) * 0.8);
    sp.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
    g.add(sp);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2, 0.12, 6, 18),
    new THREE.MeshStandardMaterial({ color: 0xff6b6b, emissive: 0x551111, flatShading: true }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.1; g.add(ring);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeCar(color = 0xffd166) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 1.5), mat(color, false, { metalness: 0.3, roughness: 0.4 }));
  body.position.y = 0.65; g.add(body);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 1.4), mat(color, false, { metalness: 0.3 }));
  hood.position.set(1, 0.95, 0); g.add(hood);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 1.3), mat(0x1a2733, false, { metalness: 0.2 }));
  cabin.position.set(-0.2, 1.2, 0); g.add(cabin);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.5, 1.1), mat(0x7fd3ff, false, { metalness: 0.4, roughness: 0.1, emissive: 0x113344 }));
  glass.position.set(-0.2, 1.2, 0); g.add(glass);
  // headlights
  for (const z of [-0.5, 0.5]) {
    const hl = new THREE.Mesh(new THREE.CircleGeometry(0.14, 8), mat(0xfff7c0, false, { emissive: 0x665500 }));
    hl.position.set(2.0, 0.7, z); hl.rotation.y = Math.PI / 2; g.add(hl);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12);
  for (const [x, z] of [[1, 0.78], [1, -0.78], [-1, 0.78], [-1, -0.78]]) {
    const w = new THREE.Mesh(wheelGeo, mat(0x111111, false));
    w.rotation.x = Math.PI / 2; w.position.set(x, 0.42, z); g.add(w);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 6), mat(0xcccccc, false, { metalness: 0.6 }));
    hub.rotation.x = Math.PI / 2; hub.position.set(x, 0.42, z); g.add(hub);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
