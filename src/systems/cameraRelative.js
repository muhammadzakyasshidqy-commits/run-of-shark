// Camera-relative movement LAYER (sits ON TOP of Input.read(); Input core is untouched).
// Takes the world-fixed {x,z} that Input already produces and rotates it by the camera
// yaw so "forward" follows where the camera looks. At yaw=0 it is the identity, so the
// classic world-fixed behaviour (and input-test.mjs) is preserved exactly.
//
// Derivation: a yaw of θ sends forward (0,1) -> (sinθ, cosθ) and right (1,0) -> (cosθ,-sinθ):
//   x' =  x*cosθ + z*sinθ
//   z' = -x*sinθ + z*cosθ
export function rotateInput(x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: x * c + z * s, z: -x * s + z * c };
}
