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
//
// URLs are built from Vite's BASE_URL (the configured `base`, './' here) so the .glb files resolve
// RELATIVE to wherever index.html is served. Absolute '/models/..' broke on portals/itch.io where
// the game runs from a SUBFOLDER iframe (the leading slash hit the iframe origin root → 404).
const BASE = import.meta.env.BASE_URL;                 // './' in production, '/' in dev
const glb = (name) => `${BASE}models/${name}.glb`;
const MANIFEST = {
  // Garage now sells procedural SEA VEHICLES; the only car GLB still used is the L6 luxury prize.
  car_luxury: { url: glb('car_luxury'), fit: 3.8, yaw: 0 },
  // Animated fish (skinned, built-in swim clip). yaw VERIFIED by marker render (facing-verify.mjs):
  // both fish meshes have their SNOUT at local -X and TAIL at +X, so yaw +PI/2 rotates the snout
  // to local +X — the forward axis Shark._face (rotation.y = atan2(-dz, dx)) drives. Earlier -PI/2
  // pointed the snout at -X and the shark swam TAIL-FIRST.
  fish_shark: { url: glb('fish_shark'), fit: 4.2, yaw: Math.PI / 2 }, // snout -X -> +X
  fish_manta: { url: glb('fish_manta'), fit: 5.0, yaw: Math.PI / 2 },
  // Diver VERIFIED facing -Z (its back is toward +Z). Player faces movement via rotation.y =
  // atan2(input.x, input.z), which points the model's LOCAL +Z at the movement — so yaw PI flips
  // the diver's forward (-Z) to +Z. Earlier yaw 0 made the diver walk/swim BACKWARD.
  diver: { url: glb('diver'), fit: 1.7, yaw: Math.PI, fitBy: 'height' }, // forward -Z -> +Z
  // Boat lies along Z; bow handled at placement. Car front = +Z (verified); placed facing player.
  boat: { url: glb('boat'), fit: 3.6, yaw: 0 },
};

const cache = {};   // name -> { root: THREE.Group, animations: [], skinned: bool }
let _ready = null;

function buildRoot(scene, fit, yaw, fitBy) {
  // 1) scale to target size — by horizontal footprint (vehicles/fish lie along the ground) or
  // by height (a standing humanoid, whose tallest axis is Y).
  let box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const ref = fitBy === 'height' ? (size.y || 1) : (Math.max(size.x, size.z) || 1);
  scene.scale.multiplyScalar(fit / ref);
  // 2) re-centre on X/Z and ground on Y
  box = new THREE.Box3().setFromObject(scene);
  const c = box.getCenter(new THREE.Vector3());
  scene.position.x -= c.x;
  scene.position.z -= c.z;
  scene.position.y -= box.min.y;
  scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      // Tag this model's geometry + textures as CACHED so scene-teardown disposal (dispose.js)
      // never frees them — every clone shares these originals, and freeing them would break
      // future clones. (Per-instance cloned material objects stay safe to dispose.)
      if (o.geometry) { o.geometry.userData = o.geometry.userData || {}; o.geometry.userData.cachedAsset = true; }
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) for (const k in m) { const v = m[k]; if (v && v.isTexture) { v.userData = v.userData || {}; v.userData.cachedAsset = true; } }
    }
  });
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
      cache[name] = { root: buildRoot(gltf.scene, def.fit, def.yaw, def.fitBy), animations: gltf.animations || [], skinned };
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
