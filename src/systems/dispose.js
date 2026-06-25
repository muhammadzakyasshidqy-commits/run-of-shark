// Safe GPU-resource disposal for scene teardown (hub <-> level switches).
//
// The trap: GLB models are loaded ONCE and cloned per use. Object3D.clone(true) and
// SkeletonUtils.clone SHARE the source geometry, and material.clone() SHARES the source's
// textures. So disposing a clone's geometry/textures would free the CACHED originals and corrupt
// every future clone. Assets.buildRoot tags cached geometries/textures with
// userData.cachedAsset = true; we skip disposing those here. Per-instance material OBJECTS (clones
// for GLB, unique for procedural meshes) are always safe to dispose — material.dispose() frees the
// material's own GPU program without touching shared textures.
export function deepDispose(obj) {
  if (!obj) return;
  obj.traverse((o) => {
    // SkinnedMesh skeletons lazily upload a per-instance boneTexture (a DataTexture of bone
    // matrices) for GPU skinning. SkeletonUtils.clone makes a NEW skeleton per clone, so this
    // texture is unique to the clone and must be freed here — otherwise every diver/shark clone
    // leaks one texture per skinned mesh (the dominant texture leak across scene switches).
    if (o.isSkinnedMesh && o.skeleton) {
      o.skeleton.boneTexture?.dispose?.();
      o.skeleton.boneTexture = null;
    }
    if (o.geometry && !o.geometry.userData?.cachedAsset) o.geometry.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      if (!m) continue;
      for (const k in m) { const v = m[k]; if (v && v.isTexture && !v.userData?.cachedAsset) v.dispose?.(); }
      m.dispose?.();
    }
  });
}

export function removeAndDispose(scene, obj) {
  if (!obj) return;
  scene.remove(obj);
  deepDispose(obj);
}
