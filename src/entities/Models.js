// Models — low-poly cartoon mesh factory (Bridge Race-ish "chunky" style).
// Geometry is procedural (Three.js primitives) EXCEPT where a preloaded GLB asset is
// available (see Assets.js) — those factories return a cloned GLB and fall back to the
// primitive when the asset isn't loaded. Gameplay reads only a few userData contracts
// (submarine.userData.ring, coin.userData.spin) and group transform/scale.
import * as THREE from 'three';
import { getModel, modelAnimations } from '../assets/Assets.js';

const mat = (color, flat = true, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: flat, roughness: 0.82, metalness: 0.04, ...opts });

// A capsule helper (rounded, cartoon-friendly limbs/bodies).
const capsule = (r, len, color, seg = 6) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, seg), mat(color));

// ---------------------------------------------------------------------------
// PLAYER — chunky low-poly humanoid. `color` = outfit colour (skin system stays
// compatible: each skin is just a different outfit colour on the SAME model).
// userData.parts exposes pivots so Player.js can drive procedural walk/idle/hit anims.
// ---------------------------------------------------------------------------
// makeDiver: returns the animated Quaternius humanoid GLB when loaded — its body material
// (M_Main) is tinted to the skin colour and flagged `outfit` so applyAppearance can recolour
// it live; built-in clips (Idle/Walk/Sprint/Swim_Fwd/Swim_Idle) are driven by Player via
// userData.setAnim()/mixer. Falls back to the procedural rigged diver below.
export function makeDiver(color = 0x2ec4ff) {
  const glb = getModel('diver');
  if (glb) {
    const anims = modelAnimations('diver');
    const mixer = new THREE.AnimationMixer(glb);
    const find = (re) => anims.find((a) => re.test(a.name));
    // Prefer the upright "talking" idle over the deep-crouch base Idle_Loop (the crouch looks
    // odd standing in the hub and throws off head-accessory placement).
    const clipFor = { idle: find(/Idle_Talking_Loop/i) || find(/Idle_Loop$/i), walk: find(/Walk_Loop/i), sprint: find(/Sprint_Loop/i) || find(/Jog/i), swim: find(/Swim_Fwd_Loop/i), swimIdle: find(/Swim_Idle_Loop/i) };
    const actions = {};
    for (const k in clipFor) if (clipFor[k]) actions[k] = mixer.clipAction(clipFor[k]);
    // Style it as a DIVER, not a bare mannequin: body material (M_Main) = the skin/wetsuit
    // colour (flagged outfit for live recolour); the joint accents (M_Joints, garish magenta by
    // default) recoloured to a dark wetsuit tone so it reads as straps/seams. Find head + spine
    // bones so hats follow the head and backpacks/jetpacks ride the torso.
    let head = null, body = null;
    glb.traverse((o) => {
      if (o.isMesh && o.material && !Array.isArray(o.material)) {
        if (o.material.name === 'M_Main') { o.material.color.setHex(color); o.userData.outfit = true; o.material.roughness = 0.6; }
        else if (o.material.name === 'M_Joints') { o.material.color.setHex(0x222a33); o.material.metalness = 0.2; }
      }
      if (o.isBone) { if (o.name === 'DEF-head') head = o; else if (!body && /spine/i.test(o.name)) body = o; }
    });
    glb.userData.mixer = mixer;
    glb.userData.parts = { head, body };
    let current = null;
    glb.userData.currentClip = null;
    glb.userData.setAnim = (name, fade = 0.18) => {
      const next = actions[name] || actions.idle;
      if (!next || next === current) return;
      next.reset().fadeIn(fade).play();
      if (current) current.fadeOut(fade);
      current = next; glb.userData.currentClip = actions[name] ? name : 'idle';
    };
    if (actions.idle) { actions.idle.play(); current = actions.idle; glb.userData.currentClip = 'idle'; }
    return glb;
  }

  const g = new THREE.Group();
  const skinTone = 0xffc9a3;
  // BODY pivot at mid-body height (PIVOT_Y). The swim lean rotates THIS group, so the
  // body "floats" about its centre instead of swinging the head down from the feet
  // (which caused the nose-dive). All parts live under `lean`; positions are offset by
  // -PIVOT_Y so the resting visual is identical to before.
  const PIVOT_Y = 1.0;
  const lean = new THREE.Group(); lean.position.y = PIVOT_Y; g.add(lean);
  const Y = (y) => y - PIVOT_Y;

  // torso — short & stout (outfit colour). userData.outfit lets the skin be recoloured live.
  const torso = capsule(0.34, 0.45, color, 8);
  torso.userData.outfit = true;
  torso.position.y = Y(1.02); torso.scale.set(1, 1, 0.8); lean.add(torso);
  // chest stripe (lifejacket look)
  const vest = capsule(0.36, 0.2, 0xffffff, 8);
  vest.position.y = Y(1.18); vest.scale.set(1.02, 1, 0.82); lean.add(vest);

  // big round head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), mat(skinTone, false));
  head.position.y = Y(1.85); lean.add(head);
  // dive goggles
  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.42), mat(0x12303a, false, { metalness: 0.3 }));
  goggles.position.set(0, Y(1.9), 0.16); lean.add(goggles);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.16, 0.06), mat(0x6fd3ff, false, { emissive: 0x113344, metalness: 0.4, roughness: 0.2 }));
  glass.position.set(0, Y(1.9), 0.37); lean.add(glass);
  // snorkel
  const snorkel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 6), mat(0xff7043));
  snorkel.position.set(0.42, Y(2.0), 0.05); lean.add(snorkel);

  // arms/legs — pivot groups (under `lean`) so they can swing
  const mkLimb = (x, y, r, len, col) => {
    const pivot = new THREE.Group(); pivot.position.set(x, Y(y), 0);
    const limb = capsule(r, len, col); limb.position.y = -(len / 2 + r * 0.4); pivot.add(limb);
    lean.add(pivot); return pivot;
  };
  const shL = mkLimb(-0.42, 1.32, 0.13, 0.5, color);
  const shR = mkLimb(0.42, 1.32, 0.13, 0.5, color);
  shL.children[0].userData.outfit = true; shR.children[0].userData.outfit = true; // sleeves = skin colour
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
  g.userData.lean = lean; // swim/walk lean is applied here, not on the root group
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Visual accessories attached to the diver. Returns { obj, part } where part is
// 'head' (added as a child of the head mesh — follows head movement) or
// 'body' (added to the main group — follows the body's bob/lean/turn).
export function makeAccessory(id) {
  const g = new THREE.Group();
  let part = 'head';
  switch (id) {
    case 'sunglasses': {
      part = 'head';
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.2, 0.1), mat(0x111111, false, { metalness: 0.4 }));
      bar.position.set(0, 0.08, 0.4); g.add(bar);
      for (const s of [-1, 1]) { const lens = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.06), mat(0x223a2a, false, { metalness: 0.5 })); lens.position.set(s * 0.2, 0.08, 0.44); g.add(lens); }
      break;
    }
    case 'helmet': { // diving helmet — clear dome + brass ring
      part = 'head';
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.35, metalness: 0.3, roughness: 0.1 }));
      g.add(dome);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 8, 16), mat(0xd4af37, false, { metalness: 0.6 })); ring.rotation.x = Math.PI / 2; ring.position.y = -0.35; g.add(ring);
      break;
    }
    case 'crown': {
      part = 'head';
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.16, 10, 1, true), mat(0xffd166, false, { metalness: 0.7, emissive: 0x4a3500 })); band.position.y = 0.42; g.add(band);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 4), mat(0xffd166, false, { metalness: 0.7, emissive: 0x4a3500 })); spike.position.set(Math.cos(a) * 0.4, 0.56, Math.sin(a) * 0.4); g.add(spike); }
      break;
    }
    case 'piratehat': {
      part = 'head';
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 12), mat(0x2a1d12)); brim.position.y = 0.45; brim.scale.set(1, 1, 0.7); g.add(brim);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.4, 8), mat(0x1a120a)); top.position.y = 0.62; g.add(top);
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(0xffffff, false)); skull.position.set(0, 0.5, 0.45); g.add(skull);
      break;
    }
    case 'milhelmet': {
      part = 'head';
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x4b5320)); dome.position.y = 0.34; g.add(dome);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.06, 12), mat(0x3a4019)); brim.position.y = 0.32; g.add(brim);
      break;
    }
    case 'backpack': {
      part = 'body';
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.32), mat(0xc0392b)); pack.position.set(0, 1.05, -0.4); g.add(pack);
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.12), mat(0xe74c3c)); pocket.position.set(0, 0.95, -0.58); g.add(pocket);
      break;
    }
    case 'jetpack': {
      part = 'body';
      for (const s of [-1, 1]) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.8, 8), mat(0xbdc3c7, false, { metalness: 0.5 })); tank.position.set(s * 0.22, 1.05, -0.42); g.add(tank);
        const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 8), mat(0x333333)); nozzle.position.set(s * 0.22, 0.58, -0.42); nozzle.rotation.x = Math.PI; g.add(nozzle);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 8), mat(0xff7043, false, { emissive: 0x662200 })); flame.position.set(s * 0.22, 0.4, -0.42); flame.rotation.x = Math.PI; flame.userData.flame = true; g.add(flame);
      }
      break;
    }
    default: return null;
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { obj: g, part };
}

// ---------------------------------------------------------------------------
// SHARK — segmented body for undulation + clear per-type silhouettes.
// userData.segments / tail / jaw are animated by Shark.js. The GROUP keeps the
// same overall size band as before so the validated collision radius still matches.
// ---------------------------------------------------------------------------
// makeShark: returns an animated GLB fish when loaded (kraken=manta-ray silhouette, all
// others=great-white shark), tinted to the type colour, with its built-in "Swim" clip
// playing via an AnimationMixer stored on userData.mixer (Shark.js advances it each frame).
// Falls back to the procedural segmented shark below. The snout points local +X to satisfy
// Shark._face(); collision radius is unchanged (Shark.radius uses def.scale, not the mesh).
export function makeShark(color = 0x6c7a89, scale = 1, type = 'normal') {
  const modelName = type === 'kraken' ? 'fish_manta' : 'fish_shark';
  const glb = getModel(modelName);
  if (glb) {
    glb.scale.setScalar(scale);
    const ghost = type === 'ghost';
    glb.traverse((o) => {
      if (o.isMesh && o.material) {
        const m = o.material;
        if (m.color) m.color.setHex(color);          // type colour = the shark's identity
        if (m.emissive) { m.emissive.setHex(0x000000); m.emissiveIntensity = 0; } // telegraph baseline
        if (ghost) { m.transparent = true; m.opacity = 0.5; }
      }
    });
    const anims = modelAnimations(modelName);
    if (anims && anims.length) {
      const mixer = new THREE.AnimationMixer(glb);
      const clip = anims.find((a) => /swim/i.test(a.name)) || anims[0];
      const action = mixer.clipAction(clip); action.play();
      glb.userData.mixer = mixer;
    }
    return glb;
  }

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

// POWER-UP pickup: a glowing colour-coded orb in a spinning ring. type ∈ magnet|shield|speed.
// userData.power = type (Level reads it on pickup), userData.spin animates it.
export function makePowerup(type = 'magnet') {
  const palette = { magnet: 0xe74c3c, shield: 0x2ec4ff, speed: 0xf1c40f };
  const col = palette[type] || 0xffffff;
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), mat(col, true, { emissive: col & 0x555555, emissiveIntensity: 0.8, metalness: 0.3 }));
  g.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.08, 8, 18), mat(0xffffff, false, { emissive: col & 0x333333 }));
  ring.rotation.x = Math.PI / 2; g.add(ring);
  // a tiny glyph hint: magnet = two prongs, shield = disc, speed = chevrons
  if (type === 'magnet') { for (const s of [-1, 1]) { const pr = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.12), mat(0xffffff, false)); pr.position.set(s * 0.16, -0.28, 0); g.add(pr); } }
  else if (type === 'shield') { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.08, 12), mat(0xffffff, false)); d.position.z = 0.45; d.rotation.x = Math.PI / 2; g.add(d); }
  else { for (let i = 0; i < 2; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.22, 4), mat(0xffffff, false)); c.rotation.z = -Math.PI / 2; c.position.set(0.1 + i * 0.18, 0, 0); g.add(c); } }
  g.userData.spin = true; g.userData.power = type;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
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
// WOODEN dinghy — brown planks (matches the dock), not teal. `wood` overridable.
export function makeBoat(wood = 0xb07d4f) {
  const glb = getModel('boat');           // clean low-poly wooden rowboat (Quaternius, CC0)
  if (glb) return glb;
  const g = new THREE.Group();
  const dark = 0x8a5d36;
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 2.4, 4, 8), mat(wood));
  hull.rotation.z = Math.PI / 2; hull.scale.set(1, 1, 0.7); hull.position.y = 0.5; g.add(hull);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.12, 6, 16), mat(dark)); // wooden gunwale
  rim.rotation.x = Math.PI / 2; rim.scale.set(1, 0.55, 1); rim.position.y = 0.8; g.add(rim);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.15, 1.0), mat(0xcaa15a));
  deck.position.y = 0.82; g.add(deck);
  for (let i = 0; i < 4; i++) { // plank lines on the deck
    const plank = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.16, 0.06), mat(dark));
    plank.position.set(0, 0.83, -0.35 + i * 0.23); g.add(plank);
  }
  const bench = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.9), mat(dark)); bench.position.set(-0.3, 0.95, 0); g.add(bench);
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
  // GOAL BEACON — a tall green glow column + floating down-arrow so the player can spot the
  // submarine (the objective) from across the level and knows which way to swim.
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.6, 30, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x7dffc4, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 15; g.add(beam);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2, 5), mat(0x06d6a0, false, { emissive: 0x0a3320, emissiveIntensity: 1 }));
  arrow.rotation.x = Math.PI; arrow.position.y = 6; g.add(arrow);
  g.userData.goalArrow = arrow;
  g.traverse((o) => { if (o.isMesh && o !== beam) o.castShadow = true; });
  return g;
}

// SEA VEHICLES — distinct low-poly dive craft (procedural). Each clearly reads as its name so
// the showroom display matches the label. Faces +X (forward) to match the showroom convention.
export function makeSeaVehicle(id = 'scooter', color = 0xf39c12) {
  const g = new THREE.Group();
  const prop = (x) => { // spinning propeller marker
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 8), mat(0x333333)); hub.rotation.z = Math.PI / 2; hub.position.set(x, 0, 0); g.add(hub);
    for (let i = 0; i < 3; i++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.16), mat(0x222222)); bl.position.set(x, 0, 0); bl.rotation.x = (i / 3) * Math.PI * 2; g.add(bl); }
  };
  if (id === 'fins') {                       // a pair of swim fins
    for (const s of [-0.35, 0.35]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.7), mat(color, true, { roughness: 0.5 }));
      blade.position.set(-0.4, 0, s); blade.rotation.z = 0.25; g.add(blade);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), mat(0x222a33)); foot.position.set(0.5, 0, s); g.add(foot);
    }
  } else if (id === 'scooter') {             // handheld sea scooter: tube body + nose + handles + prop
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.4, 6, 10), mat(color)); body.rotation.z = Math.PI / 2; g.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.7, 12), mat(0xf1c40f)); nose.rotation.z = -Math.PI / 2; nose.position.x = 1.3; g.add(nose);
    for (const s of [-0.5, 0.5]) { const hbar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 6), mat(0x222a33)); hbar.position.set(-0.4, 0.35, s); g.add(hbar); }
    prop(-1.4);
  } else if (id === 'jetski') {              // jet ski: hull + seat + handlebars
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 1.0), mat(color)); hull.position.y = 0.1; g.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.0, 4), mat(color)); bow.rotation.z = -Math.PI / 2; bow.position.set(1.6, 0.2, 0); bow.scale.set(1, 0.6, 0.9); g.add(bow);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 0.8), mat(0x222a33)); seat.position.set(-0.4, 0.5, 0); g.add(seat);
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), mat(0x2c3e50)); col.position.set(0.7, 0.6, 0); g.add(col);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6), mat(0x111)); bar.rotation.x = Math.PI / 2; bar.position.set(0.7, 0.9, 0); g.add(bar);
  } else if (id === 'sled') {                // dive sled: platform + windscreen + twin props
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 1.6), mat(color)); deck.position.y = 0.2; g.add(deck);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 1.4), mat(0x7fd3ff, false, { metalness: 0.4, roughness: 0.1, transparent: true, opacity: 0.6 })); screen.position.set(1.0, 0.7, 0); screen.rotation.z = -0.4; g.add(screen);
    for (const s of [-0.55, 0.55]) { const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10), mat(0x2c3e50)); pod.rotation.z = Math.PI / 2; pod.position.set(-0.9, 0.2, s); g.add(pod); prop(-1.5); }
  } else {                                   // minisub: yellow submarine
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 1.8, 8, 12), mat(color)); body.rotation.z = Math.PI / 2; body.position.y = 0.2; g.add(body);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.6, 10), mat(0xf39c12)); tower.position.set(-0.2, 1.0, 0); g.add(tower);
    const port = new THREE.Mesh(new THREE.CircleGeometry(0.28, 12), mat(0x2ec4ff, false, { emissive: 0x114 })); port.position.set(1.3, 0.3, 0.01); port.rotation.y = 0; g.add(port);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.7, 4), mat(0xf39c12)); fin.rotation.z = Math.PI / 2; fin.position.set(-1.7, 0.2, 0); fin.scale.set(0.5, 1, 1); g.add(fin);
    prop(-1.9);
  }
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

// makeCar(spec): spec may be a GLB model name ('car_atv'…'car_luxury') or a hex colour.
// Returns the cloned GLB when loaded; otherwise the primitive car below (graceful fallback).
export function makeCar(spec = 0xffd166) {
  if (typeof spec === 'string') { const glb = getModel(spec); if (glb) return glb; }
  const color = typeof spec === 'number' ? spec : 0xcfd3d6;
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

// LUXURY CAR — the level-6 ending prize (also the garage's Luxury slot). Uses the premium
// GLB sedan when loaded; falls back to the glossy primitive below otherwise. A roof beacon +
// emissive light-beam column are added on top so the fleeing player can spot it either way.
export function makeLuxuryCar(color = 0xffd166) {
  const glb = getModel('car_luxury');
  if (glb) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 14, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.28 }));
    beam.position.y = 7; glb.add(beam);
    return glb;
  }
  const g = new THREE.Group();
  const glossy = (c) => mat(c, false, { metalness: 0.85, roughness: 0.12 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.7, 1.9), glossy(color)); body.position.y = 0.75; g.add(body);
  const lower = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.4, 2.0), glossy(0x222831)); lower.position.y = 0.45; g.add(lower);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 1.8), glossy(color)); hood.position.set(1.5, 1.05, 0); g.add(hood);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 1.6), glossy(0x10151c)); cabin.position.set(-0.4, 1.35, 0); g.add(cabin);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.6, 1.4), mat(0x9fe3ff, false, { metalness: 0.6, roughness: 0.05, emissive: 0x112233 })); glass.position.set(-0.4, 1.35, 0); g.add(glass);
  for (const z of [-0.96, 0.96]) { const chrome = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 0.06), mat(0xeaeaea, false, { metalness: 0.95, roughness: 0.05 })); chrome.position.set(0, 0.78, z); g.add(chrome); }
  const spoilerBar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.8), glossy(0x222831)); spoilerBar.position.set(-2.0, 1.1, 0); g.add(spoilerBar);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 2.0), glossy(0x111111)); wing.position.set(-2.1, 1.35, 0); g.add(wing);
  for (const z of [-0.6, 0.6]) { const hl = new THREE.Mesh(new THREE.CircleGeometry(0.18, 10), mat(0xffffff, false, { emissive: 0xffffcc, emissiveIntensity: 1 })); hl.position.set(2.96, 0.8, z); hl.rotation.y = Math.PI / 2; g.add(hl); }
  for (const z of [-0.7, 0.7]) { const tl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.4), mat(0xff3030, false, { emissive: 0x661010 })); tl.position.set(-2.7, 0.85, z); g.add(tl); }
  const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.36, 14);
  for (const [x, z] of [[1.5, 0.95], [1.5, -0.95], [-1.5, 0.95], [-1.5, -0.95]]) {
    const w = new THREE.Mesh(wheelGeo, mat(0x0a0a0a, false)); w.rotation.x = Math.PI / 2; w.position.set(x, 0.5, z); g.add(w);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.38, 8), mat(0xffd166, false, { metalness: 0.95, roughness: 0.1, emissive: 0x4a3500 })); rim.rotation.x = Math.PI / 2; rim.position.set(x, 0.5, z); g.add(rim);
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), mat(0xfff2b0, false, { emissive: 0xffcc33, emissiveIntensity: 1 })); beacon.position.set(-0.4, 1.8, 0); g.add(beacon);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.4, 16, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.set(-0.4, 9.5, 0); g.add(beam);
  g.userData.beam = beam; g.userData.beacon = beacon;
  g.traverse((o) => { if (o.isMesh && o !== beam) o.castShadow = true; });
  return g;
}
