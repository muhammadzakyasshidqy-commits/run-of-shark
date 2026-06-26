// Hub — the walkable island scene. Reuses Player/Input/chase-camera from Game.
// Walking into an area's trigger zone opens the SAME validated DOM panel
// (showBank/showShop/showGarage/showLevels/showWheel) — only the way IN changed.
import * as THREE from 'three';
import { makeBank, makeGarage, makeTower, makeZoneMarker, makeNPC, makeSign, makeLuckyWheel, makeKiosk } from './buildings.js';
import { makeDock, makeBoat, makeSeaVehicle } from '../entities/Models.js';
import { removeAndDispose } from '../systems/dispose.js';
import { VEHICLES } from '../config.js';

// Coastline, not an island: solid LAND covers the back/sides (where every building sits) and
// OPEN SEA stretches to the horizon on the front (+Z) side, past the dock. These bounds are the
// walkable rectangle; maxZ is the shoreline/waterline.
const LAND = { minX: -64, maxX: 64, minZ: -64, maxZ: 24 };
const WATERLINE = LAND.maxZ;

export class Hub {
  constructor(scene, economy, save) {
    this.scene = scene;
    this.economy = economy;
    this.save = save;
    this.objects = [];
    this.solids = [];     // {x,z,r} circles the player can't walk through
    this.zones = [];      // {name, panel, x, z, r, inside}
    this.playerRadius = 0.6;
    this.spawn = { x: 0, z: 14 }; // central plaza, clear of every trigger zone
    this._t = 0;
    this._build();
  }

  add(obj, x, y, z) { obj.position.set(x, y, z); this.scene.add(obj); this.objects.push(obj); return obj; }

  _build() {
    this.npcs = [];
    // ---- LAND: one big grassy coast behind the shoreline (all buildings sit on it) ----
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x6ab04c, flatShading: true, roughness: 1 });
    const landDepth = (WATERLINE + 100);                 // from z=-100 (deep back) to the waterline
    const land = new THREE.Mesh(new THREE.BoxGeometry(180, 3, landDepth), grassMat);
    land.receiveShadow = true; this.add(land, 0, -1.5, WATERLINE - landDepth / 2);
    // sandy BEACH band right at the waterline so the grass meets the sea on a shore, not a cliff
    const beach = new THREE.Mesh(new THREE.BoxGeometry(180, 3.04, 18),
      new THREE.MeshStandardMaterial({ color: 0xffe3a0, flatShading: true }));
    beach.receiveShadow = true; this.add(beach, 0, -1.49, WATERLINE - 7);

    // ---- OPEN SEA: a wide surface from the shoreline out to the horizon (fog fades it into the
    // sky), so standing on the beach you look out over real open water — not a small round pool ----
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(700, 640),
      new THREE.MeshStandardMaterial({ color: 0x2aa7d8, transparent: true, opacity: 0.82, flatShading: true, metalness: 0.3, roughness: 0.3, emissive: 0x0a3d52, emissiveIntensity: 0.3 }));
    sea.rotation.x = -Math.PI / 2; sea.receiveShadow = false; this.add(sea, 0, -0.15, WATERLINE + 310);
    const deep = new THREE.Mesh(new THREE.PlaneGeometry(700, 640),
      new THREE.MeshStandardMaterial({ color: 0x0c5778, transparent: true, opacity: 0.6 }));
    deep.rotation.x = -Math.PI / 2; this.add(deep, 0, -1.0, WATERLINE + 310);

    // ---- PATHS: a central spine (dock <-> plaza <-> Tower) plus one clean spur to each district.
    // Front streets run IN FRONT of the buildings (on the player side), never THROUGH them, and the
    // spine STOPS in front of the Tower instead of passing through it. No dead-end branches.
    const pathMat = new THREE.MeshStandardMaterial({ color: 0xcdb58a, flatShading: true });
    const addPath = (x, z, w, l) => this.add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, l), pathMat), x, 0.06, z);
    addPath(0, -2, 6, 52);     // central spine: dock (z=24) <-> plaza <-> Tower front (z=-28)
    addPath(-14, -6, 36, 6);   // plaza -> financial plaza (left), ends in front of the Bank
    addPath(-30, -6, 5, 30);   // Bank + Wheel FRONT street (player side, x=-30; buildings at x=-36)
    addPath(16, -4, 36, 6);    // plaza -> shop district (right), ends in front of the shops
    addPath(33, -4, 5, 38);    // SHOP FRONT street (player side, x=33; kiosks at x=40)
    addPath(15, -24, 32, 6);   // plaza/spine -> garage spur (turns back-right)
    addPath(30, -36, 6, 26);   // garage approach (leads to the showroom's open front)

    // Structures + their trigger zones. TOWER is the central back landmark; the spine leads up to
    // its trigger ring (in FRONT of it) rather than running through it.
    const tower = makeTower(this.save.data.highestLevel || 1); this.add(tower, 0, 0, -34);
    this._zone('tower', 'levels', 0, -26, 6, 0x2ec4ff); this._solid(0, -34, 5);

    // FINANCIAL PLAZA (left) — Bank + ATM + Lucky Wheel grouped tidily, all facing the central
    // plaza (+X) so they read as one area you approach from the paths. Buildings face +X
    // (rotation.y = +PI/2 turns the +Z-facing facade toward the player); teller stands out front.
    const FACE_RIGHT = Math.PI / 2;   // a +Z-facing model now faces +X (toward plaza centre)
    const bank = makeBank(); bank.rotation.y = FACE_RIGHT; this.add(bank, -36, 0, -16);
    this._zone('bank', 'bank', -29.5, -16, 5, 0xffd166); this._solid(-36, -16, 6);  // ring squarely in front of the door (z=-16)
    this._npc(-30.5, -16, 0x2c3e50, 0x111111, FACE_RIGHT);  // teller standing in front of the facade

    // LUCKY WHEEL just below the Bank, also facing the plaza; the player stands on the ring in
    // FRONT of the wheel (+X side) to spin it.
    this.wheelObj = makeLuckyWheel(6); this.add(this.wheelObj, -36, 0, 4);
    this.wheelObj.rotation.y = FACE_RIGHT;   // disc faces +X (toward the approaching player)
    const wheelSign = makeSign('LUCKY WHEEL', 5, '#3a0d1a', '#ff6b6b'); wheelSign.rotation.y = FACE_RIGHT; this.add(wheelSign, -36, 7.4, 4); // face the plaza (+X), like the wheel
    this._zone('wheel', 'wheel', -30, 4, 4.2, 0xff6b6b);   // ring on the +X (plaza) side of the wheel
    this._npc(-31, 8, 0xff6b6b, 0xffd166, FACE_RIGHT);   // carnival barker beside the wheel

    // SHOP DISTRICT (right) — three SEPARATE kiosks facing the plaza (-X), each with its own
    // trigger + a distinct shopkeeper standing in front (facing the player), so each reads as a
    // staffed stall rather than an empty box with someone loitering beside it.
    const FACE_LEFT = -Math.PI / 2;   // a +Z-facing kiosk now faces -X (toward plaza centre)
    const skinShop = makeKiosk('SKINS', 0x9b59b6, 0x2ec4ff); skinShop.rotation.y = FACE_LEFT; this.add(skinShop, 40, 0, -20); this._solid(40, -20, 5.5);
    this._zone('skinshop', 'skins', 34, -20, 5, 0x9b59b6); this._npc(36.5, -20, 0x9b59b6, 0x2ec4ff, FACE_LEFT);

    const accShop = makeKiosk('GEAR', 0xf1c40f, 0xff9f43); accShop.rotation.y = FACE_LEFT; this.add(accShop, 40, 0, -4); this._solid(40, -4, 5.5);
    this._zone('accshop', 'accessories', 34, -4, 5, 0xf1c40f); this._npc(36.5, -4, 0xe67e22, 0xffffff, FACE_LEFT);

    const upgShop = makeKiosk('UPGRADES', 0x06d6a0, 0x2ecc71); upgShop.rotation.y = FACE_LEFT; this.add(upgShop, 40, 0, 12); this._solid(40, 12, 5.5);
    this._zone('upgradeshop', 'upgrades', 34, 12, 5, 0x06d6a0); this._npc(36.5, 12, 0x16a085, 0xffd166, FACE_LEFT);

    // GARAGE SHOWROOM — its OWN building in the back-RIGHT (clearly off the Tower's centre axis so
    // the two never overlap from the approach). A proper roofed showroom with spotlit bays; the
    // sea vehicles sit on the floor inside, each a PHYSICAL car whose zone opens its buy/own panel.
    const SPACING = 5.8;                                       // > 2*zoneR(2.6) so adjacent zones keep a clear gap
    const gCenterX = 30, gz = -48;                            // showroom centre (back-right)
    const showroom = makeGarage(VEHICLES.length, SPACING);    // shell sized to the vehicle row
    showroom.rotation.y = 0; this.add(showroom, gCenterX, 0, gz); // open front faces +Z (player approaches from front)
    this._npc(gCenterX + 13, gz + 4, 0x34495e, 0xe74c3c, 0);  // mechanic beside the showroom, facing the player
    this.vehicleCars = {};
    const gx = gCenterX - ((VEHICLES.length - 1) * SPACING) / 2; // left bay so the row centres in the showroom
    VEHICLES.forEach((v, i) => {
      const owned = (this.save.data.ownedVehicles || []).includes(v.id);
      const car = makeSeaVehicle(v.id, v.color);               // distinct primitive sea craft per tier
      if (!owned) car.traverse((o) => { if (o.isMesh && o.material) { o.material.transparent = true; o.material.opacity = 0.45; } }); // ghost = not bought
      const cx = gx + i * SPACING, cz = gz;
      this.add(car, cx, 0.7, cz); car.rotation.y = -Math.PI / 2; // face +Z (toward the approaching player)
      this.vehicleCars[v.id] = { car, color: v.color };
      this._zone('veh:' + v.id, 'veh:' + v.id, cx, cz + 4, 2.6, owned ? 0x2ecc71 : 0xffd166); // zone at the open front
    });

    // Dock + wooden boat at the front — the clearly-labelled "start dive" point. The boat sits
    // centred (x=0) at the SEAWARD tip of the 16-long dock (z=30±8 → tip z≈37) and points out to
    // sea (+Z), so it reads unmistakably as "board here to dive".
    // Long pier reaching PAST the beach to the sea; a sea disc at the head so the boat floats
    // in water (not parked on the dock planks), with the boat lowered to sit IN the water.
    const dock = makeDock(30); this.add(dock, 0, 0, WATERLINE + 14);   // pier: beach -> open water
    // Boat moored beside the pier near the SHORE end (where the dive ring is), floating in the
    // shallows with its hull half-submerged and bow to sea — so the player plainly sees "board here".
    const boat = makeBoat(); boat.scale.setScalar(1.35); this.add(boat, 5, -0.3, WATERLINE + 6); boat.rotation.y = 0;
    const dockSign = makeSign('DOCK — START DIVE', 7, '#10243a', '#06d6a0'); dockSign.rotation.y = Math.PI; this.add(dockSign, 0, 2.4, WATERLINE - 2); // face the player walking up from -Z
    this._zone('dock', 'levels', 0, WATERLINE + 2, 5, 0x06d6a0);

    // Palms for life — placed only at the open LAND corners, well clear of every building front,
    // path and trigger zone, so none blocks the way to a shop / the garage / the dock.
    for (const [x, z] of [[-58, -50], [58, -50], [-60, 8], [60, 8]]) {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 4, 6), new THREE.MeshStandardMaterial({ color: 0x8a5a2b, flatShading: true }));
      trunk.position.y = 2; t.add(trunk);
      for (let i = 0; i < 5; i++) { const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.4, 4), new THREE.MeshStandardMaterial({ color: 0x2ecc71, flatShading: true })); leaf.position.y = 4; leaf.rotation.z = Math.PI / 2.3; leaf.rotation.y = (i / 5) * Math.PI * 2; leaf.scale.set(0.5, 1, 1); t.add(leaf); }
      t.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.add(t, x, 0, z);
    }

    // ---- HILLS / MOUNTAINS ringing the land on the NON-sea sides (back + left + right). They
    // frame the coast as a real place and act as a NATURAL boundary (you can see you can't go that
    // way) — replacing the old sea buoys that used to float on the land edge. Low-poly cones, a few
    // with snowy/grey caps for distant peaks. All sit OUTSIDE the walkable rectangle.
    const hill = (x, z, r, ht, col, cap) => {
      const grp = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(r, ht, 7), new THREE.MeshStandardMaterial({ color: col, flatShading: true, roughness: 1 }));
      body.position.y = ht / 2; grp.add(body);
      if (cap) { const peak = new THREE.Mesh(new THREE.ConeGeometry(r * 0.42, ht * 0.34, 7), new THREE.MeshStandardMaterial({ color: 0xeaf2f6, flatShading: true })); peak.position.y = ht * 0.86; grp.add(peak); }
      grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.add(grp, x, -1, z);
    };
    const greens = [0x5a9e3f, 0x4f8f39, 0x6ab04c];
    // back ridge (behind the land, -Z)
    for (let i = 0; i < 9; i++) { const x = -88 + i * 22 + (i % 2 ? 6 : 0); const big = i % 3 === 0; hill(x, -82 - (i % 2) * 10, big ? 20 : 14, big ? 30 : 20, big ? 0x6b7b86 : greens[i % 3], big); }
    // left + right ridges (sides) — shorter green hills marching toward the shore
    for (let i = 0; i < 6; i++) { const z = -78 + i * 16; hill(-82 - (i % 2) * 6, z, 12, 17, greens[i % 3], false); hill(82 + (i % 2) * 6, z, 12, 17, greens[(i + 1) % 3], false); }

    // (Floating chevron arrows removed — each area is labelled by its own sign + coloured ring.)

    // a couple of ambient wanderers in the plaza (shopkeepers were added per-zone via _npc)
    this._npc(-8, 18, 0x4a90d9, 0xffffff);
    this._npc(9, 6, 0xe67e22, 0x2c3e50);
  }

  // Place a shopkeeper/villager NPC; colours vary so they aren't clones. `faceY` lets a
  // shopkeeper face the player (toward the plaza); ambient villagers pass undefined => random.
  _npc(x, z, shirt, hat, faceY) {
    const npc = makeNPC(shirt, hat); npc.rotation.y = faceY != null ? faceY : Math.random() * Math.PI * 2;
    this.add(npc, x, 0, z); this.npcs.push(npc);
  }

  // Turn a showroom car from "ghost" (faded) to fully solid after purchase. Opacity-only so
  // it works for both the GLB models (native paint preserved) and the primitive fallback.
  markVehicleOwned(id) {
    const entry = this.vehicleCars && this.vehicleCars[id];
    if (!entry) return;
    entry.car.traverse((o) => { if (o.isMesh && o.material) { o.material.transparent = false; o.material.opacity = 1; } });
  }

  // Spin the physical wheel so the TOP pointer lands on segment `index`, after several
  // full turns with ease-out. Resolves when it stops (UI reveals/apply the prize then).
  // Mapping: segment i centre (local CCW from +X) = ((i+0.5)/N)*2π; pointer is at the top
  // = +Y = π/2, so we need wheel.rotation.z ≡ π/2 - centre_i (mod 2π). Idle spin is CW
  // (rotation.z decreasing), so we land from above by subtracting full turns.
  spinWheel(index, segments = 6) {
    const wheel = this.wheelObj && this.wheelObj.userData.wheel;
    if (!wheel) return Promise.resolve();
    const TWO_PI = Math.PI * 2;
    const centre = ((index + 0.5) / segments) * TWO_PI;
    const targetMod = Math.PI / 2 - centre;        // congruent target (mod 2π)
    const start = wheel.rotation.z;
    let end = targetMod;                           // bring end to >= ~5 turns BELOW start
    const turns = 5;
    while (end > start - turns * TWO_PI) end -= TWO_PI;
    const dur = 3.4;
    this._spinning = true;
    const ease = (x) => 1 - Math.pow(1 - x, 3);    // easeOutCubic
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = () => {
        const p = Math.min(1, (performance.now() - t0) / 1000 / dur);
        wheel.rotation.z = start + (end - start) * ease(p);
        if (p < 1) requestAnimationFrame(step);
        else { wheel.rotation.z = end; this._spinning = false; resolve(); }
      };
      requestAnimationFrame(step);
    });
  }

  _zone(name, panel, x, z, r, color) {
    const marker = makeZoneMarker(r, color); this.add(marker, x, 0, z);
    this.zones.push({ name, panel, x, z, r, inside: false, marker });
  }
  _solid(x, z, r) { this.solids.push({ x, z, r }); }

  // Returns the panel id of a freshly-entered zone, or null. Also resolves collisions.
  update(dt, player) {
    this._t += dt;
    // keep the player on the LAND (rectangular coast). The open sea (z > waterline) is off-limits;
    // the dock trigger fires the dive before you reach the water's edge, so no swimming in the hub.
    player.pos.x = Math.max(LAND.minX, Math.min(LAND.maxX, player.pos.x));
    player.pos.z = Math.max(LAND.minZ, Math.min(LAND.maxZ, player.pos.z));
    // block buildings
    for (const s of this.solids) {
      const ox = player.pos.x - s.x, oz = player.pos.z - s.z, od = Math.hypot(ox, oz), min = s.r + this.playerRadius;
      if (od < min && od > 1e-4) { player.pos.x = s.x + (ox / od) * min; player.pos.z = s.z + (oz / od) * min; }
    }
    // animate markers + arrows + NPC idle bob (cheap, keeps the island feeling alive)
    this.zones.forEach((z) => { if (z.marker.userData.ring) z.marker.userData.ring.rotation.z += dt * 1.5; });
    if (this.npcs) this.npcs.forEach((n, i) => { n.position.y = Math.abs(Math.sin(this._t * 2 + i)) * 0.08; });
    // Lucky wheel: slow idle spin, but ONLY when not mid-spin (spin is driven by its own
    // rAF in spinWheel() so it works even while the game loop is paused for the panel).
    if (this.wheelObj && !this._spinning) {
      this.wheelObj.userData.wheel.rotation.z -= 0.6 * dt;
    }
    // trigger detection with hysteresis (must leave before re-arming)
    let fired = null;
    for (const z of this.zones) {
      const zd = Math.hypot(player.pos.x - z.x, player.pos.z - z.z);
      if (!z.inside && zd < z.r) { z.inside = true; if (!fired) fired = z.panel; }
      else if (z.inside && zd > z.r + 1.5) { z.inside = false; }
    }
    return fired;
  }

  // Push the player just outside the zone they're in (called after closing a panel)
  // so the same zone doesn't immediately re-trigger.
  ejectFromZones(player) {
    for (const z of this.zones) {
      const zd = Math.hypot(player.pos.x - z.x, player.pos.z - z.z);
      if (zd < z.r) {
        const ang = Math.atan2(player.pos.z - z.z, player.pos.x - z.x);
        player.pos.x = z.x + Math.cos(ang) * (z.r + 2);
        player.pos.z = z.z + Math.sin(ang) * (z.r + 2);
        z.inside = true; // stays armed-as-inside until they walk away
      }
    }
  }

  dispose() { this.objects.forEach((o) => removeAndDispose(this.scene, o)); this.objects = []; }
}
