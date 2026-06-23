# 3D Asset Credits

All external 3D models are by **Quaternius** (https://quaternius.com), released under
**CC0 1.0 Universal (Public Domain)** — free for commercial use, no attribution required.
We credit them here voluntarily. Models were sourced via https://poly.pizza.

Models are stored as `.glb` in `public/models/` and loaded at runtime via `GLTFLoader`
(see `src/assets/Assets.js`).

## Vehicles — "Ultimate Modular Cars" / LowPoly Cars bundle (Quaternius, CC0)
Source bundle: https://poly.pizza/bundle/Cars-Bundle-FE5IWe6OMk

| Garage tier | File | poly.pizza model |
|---|---|---|
| ATV (cheapest) | `car_atv.glb` | Hatchback — https://poly.pizza/m/unqqkULtRU |
| Buggy | `car_buggy.glb` | Sedan — https://poly.pizza/m/OyqKvX9xNh |
| Jeep | `car_jeep.glb` | SUV / Wagon — https://poly.pizza/m/xsMtZhBkxL |
| Sports Car | `car_sports.glb` | Sports Coupe — https://poly.pizza/m/1mkmFkAz5v |
| Luxury Car (+ L6 ending) | `car_luxury.glb` | Luxury Sedan — https://poly.pizza/m/Cz6yDaUcM9 |

## Sea creatures — "Animated Fish Bundle" (Quaternius, CC0)
Source bundle: https://poly.pizza/bundle/Animated-Fish-Bundle-ZkGbjS8m8g
Both ship with a built-in skinned **"Swim"** animation clip, played via `AnimationMixer`.

| Used for | File | poly.pizza model |
|---|---|---|
| All shark variants (normal/fast/mutant/hammerhead/ghost/boss) | `fish_shark.glb` | Shark (great white) — https://poly.pizza/m/AyHTK3zUSG |
| Kraken final boss (distinct silhouette) | `fish_manta.glb` | Manta ray — https://poly.pizza/m/yzD8b7ZHZm |

**Variant mapping (one shark mesh, varied by tint + scale):** the bundle has no hammerhead or
kraken model, so per the brief we differentiate by colour/scale (from `SHARK_TYPES`): normal=grey,
fast=blue (smaller), mutant=green (bigger), **hammerhead=grey (NO true T-head model available —
differentiated by tint/scale only)**, ghost=semi-transparent, boss=large dark great-white. The
**kraken** uses the manta-ray mesh (scaled 3.2, near-black) to give the final boss a unique shape.

## Player diver — "Animated Base Character" (Quaternius, CC0)
Source: https://poly.pizza/m/cwYvO5UauX — a fully-rigged humanoid with 40+ built-in clips.

| Used for | File | Clips used |
|---|---|---|
| Player diver | `diver.glb` | `Idle_Loop`, `Walk_Loop`, `Sprint_Loop` (hub) · `Swim_Fwd_Loop`, `Swim_Idle_Loop` (levels) |

- **Skin recolour** works live: the body material `M_Main` is flagged `outfit` and tinted to the
  equipped skin colour (joints `M_Joints` keep their accent for character).
- **Animation**: driven by `AnimationMixer` via `userData.setAnim()` — real walk on land and a real
  front-crawl **swim** in the water (replaces the procedural rig; better than before).
- **Accessories**: still equip/recolour/unequip correctly. KNOWN LIMITATION — the model's Rigify
  armature scales its bones ~95× in their own space, so accessories can't be cheaply bone-parented
  or head-tracked; they're parented to the model root at a best-fit head/torso height. At the
  pulled-back chase-cam distance this reads fine, but in extreme close-ups a hat can float slightly
  above the (deep-crouch idle) head. Fine-tuning head-accessory placement is a noted follow-up.


