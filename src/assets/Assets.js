// Assets — GLTF (.glb) preload + cache + per-instance clone.
//
// Why a singleton with a synchronous get(): the scene/level factories in Models.js are
// synchronous (they return a mesh immediately), so we PRELOAD every .glb once at boot and
// hand out cheap clones afterwards. If a model is not yet loaded (or its fetch failed),
// get() returns null and the caller draws its original primitive — a graceful fallback,
// never a silent claim of success.
//
// All models are normalised on load: scaled so their largest horizontal footprint == `fit`,
// re-centred on X/Z, and grounded so the lowest point sits at y=0. A `yaw` is baked into an
// INNER wrapper so callers remain free to set `.rotation.y` on the returned (outer) group.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

// fit = target length in world units (matches the old primitive footprint);
// yaw = rotation (rad) baked so the model's "forward" points +X (our car convention).
const MANIFEST = {
  car_atv:    { url: '/models/car_atv.glb',    fit: 3.4, yaw: 0 },
  car_buggy:  { url: '/models/car_buggy.glb',  fit: 3.5, yaw: 0 },
  car_jeep:   { url: '/models/car_jeep.glb',   fit: 3.6, yaw: 0 },
  car_sports: { url: '/models/car_sports.glb', fit: 3.5, yaw: 0 },
  car_luxury: { url: '/models/car_luxury.glb', fit: 3.8, yaw: 0 },
};

const cache = {};   // name -> { root: THREE.Group, animations: [], skinned: bool }
let _ready = null;

function buildRoot(scene, fit, yaw) {
  // 1) scale to target footprint
  let box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const horiz = Math.max(size.x, size.z) || 1;
  scene.scale.multiplyScalar(fit / horiz);
  // 2) re-centre on X/Z and ground on Y
  box = new THREE.Box3().setFromObject(scene);
  const c = box.getCenter(new THREE.Vector3());
  scene.position.x -= c.x;
  scene.position.z -= c.z;
  scene.position.y -= box.min.y;
  scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // 3) inner group carries the baked yaw; outer group is what callers transform
  const inner = new THREE.Group(); inner.rotation.y = yaw || 0; inner.add(scene);
  const outer = new THREE.Group(); outer.add(inner);
  return outer;
}

// Kick off (idempotent) the preload of every manifest entry. Resolves when all settle;
// individual failures are logged and leave that model absent (caller falls back).
export function loadAssets() {
  if (_ready) return _ready;
  const loader = new GLTFLoader();
  _ready = Promise.all(Object.entries(MANIFEST).map(([name, def]) =>
    loader.loadAsync(def.url).then((gltf) => {
      const skinned = (gltf.animations && gltf.animations.length > 0);
      cache[name] = { root: buildRoot(gltf.scene, def.fit, def.yaw), animations: gltf.animations || [], skinned };
    }).catch((e) => { console.warn('[assets] failed to load', name, e && e.message); })
  )).then(() => cache);
  return _ready;
}

export function assetsReady() { return _ready || Promise.resolve(cache); }
export function hasModel(name) { return !!cache[name]; }
export function modelAnimations(name) { return cache[name] ? cache[name].animations : []; }

// Return an independent clone of a preloaded model, or null if not available.
// Materials are cloned per-instance so recolouring/fading one car never touches another.
// Skinned models use SkeletonUtils.clone so their bones/animations survive the copy.
export function getModel(name) {
  const e = cache[name];
  if (!e) return null;
  const c = e.skinned ? skeletonClone(e.root) : e.root.clone(true);
  c.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      if (o.material) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
    }
  });
  return c;
}
