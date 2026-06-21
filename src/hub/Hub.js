// Hub — the walkable island scene. Reuses Player/Input/chase-camera from Game.
// Walking into an area's trigger zone opens the SAME validated DOM panel
// (showBank/showShop/showGarage/showLevels/showWheel) — only the way IN changed.
import * as THREE from 'three';
import { makeBank, makeGarage, makeTower, makeZoneMarker, makeNPC, makeSign, makeLuckyWheel, makeKiosk } from './buildings.js';
import { makeDock, makeBoat } from '../entities/Models.js';

const CENTER = { x: 0, z: -12 };
const ISLAND_R = 54;

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
    // Island platform (grass) + sandy rim
    const grass = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R + 2, 2, 40),
      new THREE.MeshStandardMaterial({ color: 0x6ab04c, flatShading: true, roughness: 1 }));
    grass.receiveShadow = true; this.add(grass, CENTER.x, -1, CENTER.z);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_R + 4, ISLAND_R + 7, 1.6, 40),
      new THREE.MeshStandardMaterial({ color: 0xffe3a0, flatShading: true }));
    rim.receiveShadow = true; this.add(rim, CENTER.x, -1.3, CENTER.z);

    // central paths (cross) for readability
    for (const rot of [0, Math.PI / 2]) {
      const path = new THREE.Mesh(new THREE.BoxGeometry(6, 0.1, ISLAND_R * 1.6),
        new THREE.MeshStandardMaterial({ color: 0xcdb58a, flatShading: true }));
      path.rotation.y = rot; this.add(path, CENTER.x, 0.06, CENTER.z);
    }

    // Structures + their trigger zones
    const tower = makeTower(this.save.data.highestLevel || 1); this.add(tower, 0, 0, -32);
    this._zone('tower', 'levels', 0, -22, 6, 0x2ec4ff); this._solid(0, -32, 5);

    // BANK (left) — also houses the Upgrade/Training counter (money + stat-boosts both fit here)
    const bank = makeBank(); this.add(bank, -36, 0, -16);
    this._zone('bank', 'bank', -30, -10, 5.5, 0xffd166); this._solid(-36, -16, 6);
    this._npc(-30, -6, 0x2c3e50, 0x111111);  // bank teller

    // Real LUCKY WHEEL (left plaza)
    this.wheelObj = makeLuckyWheel(6); this.add(this.wheelObj, -34, 0, 4);
    this.add(makeZoneMarker(4.2, 0xff6b6b), -34, 0, 8);
    this._zone('wheel', 'wheel', -34, 8, 4.2, 0xff6b6b);
    this._npc(-30, 8, 0xff6b6b, 0xffd166);   // carnival barker

    // SHOP DISTRICT (right) — three SEPARATE physical kiosks, each its own trigger + NPC.
    // Vehicles are intentionally NOT sold here anymore (garage-only).
    const skinShop = makeKiosk('SKINS', 0x9b59b6, 0x2ec4ff); this.add(skinShop, 40, 0, -20); this._solid(40, -20, 5.5);
    this._zone('skinshop', 'skins', 31, -18, 5, 0x9b59b6); this._npc(31, -14, 0x9b59b6, 0x2ec4ff);

    const accShop = makeKiosk('GEAR', 0xf1c40f, 0xff9f43); this.add(accShop, 40, 0, -4); this._solid(40, -4, 5.5);
    this._zone('accshop', 'accessories', 31, -4, 5, 0xf1c40f); this._npc(31, 0, 0xe67e22, 0xffffff);

    const upgShop = makeKiosk('UPGRADES', 0x06d6a0, 0x2ecc71); this.add(upgShop, 40, 0, 12); this._solid(40, 12, 5.5);
    this._zone('upgradeshop', 'upgrades', 31, 12, 5, 0x06d6a0); this._npc(31, 16, 0x16a085, 0xffd166);

    // GARAGE (back) — vehicles only — with a mechanic NPC out front
    const garage = makeGarage(this.save.data.ownedVehicles || []); this.add(garage, 0, 0, -50);
    this._zone('garage', 'garage', 0, -40, 6, 0xe74c3c); this._solid(0, -50, 7);
    this._npc(-5, -42, 0x34495e, 0xe74c3c);  // mechanic (overalls + red rag)

    // Dock + wooden boat at the front — the clearly-labelled "start dive" point
    const dock = makeDock(16); this.add(dock, 0, 0, 30);
    const boat = makeBoat(); this.add(boat, 4, 0.5, 34);
    this.add(makeSign('DOCK — START DIVE', 7, '#10243a', '#06d6a0'), 0, 2.4, 22);
    this._zone('dock', 'levels', 0, 26, 5, 0x06d6a0);

    // simple fence ring so the island edge reads as a boundary
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.4, 5),
        new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true }));
      this.add(post, CENTER.x + Math.cos(a) * (ISLAND_R - 1), 0.5, CENTER.z + Math.sin(a) * (ISLAND_R - 1));
    }

    // a few palms for life
    for (const [x, z] of [[-20, 14], [22, 12], [-46, -36], [44, -40]]) {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 4, 6), new THREE.MeshStandardMaterial({ color: 0x8a5a2b, flatShading: true }));
      trunk.position.y = 2; t.add(trunk);
      for (let i = 0; i < 5; i++) { const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.4, 4), new THREE.MeshStandardMaterial({ color: 0x2ecc71, flatShading: true })); leaf.position.y = 4; leaf.rotation.z = Math.PI / 2.3; leaf.rotation.y = (i / 5) * Math.PI * 2; leaf.scale.set(0.5, 1, 1); t.add(leaf); }
      t.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.add(t, x, 0, z);
    }

    // (Floating chevron arrows removed — they were confusing. Each area is labelled by its
    // own sign + coloured trigger ring instead.)

    // a couple of ambient wanderers in the plaza (shopkeepers were added per-zone via _npc)
    this._npc(-8, 18, 0x4a90d9, 0xffffff);
    this._npc(9, 6, 0xe67e22, 0x2c3e50);
  }

  // Place a shopkeeper/villager NPC; colours vary so they aren't clones. Tracked for idle-bob.
  _npc(x, z, shirt, hat) {
    const npc = makeNPC(shirt, hat); npc.rotation.y = Math.random() * Math.PI * 2;
    this.add(npc, x, 0, z); this.npcs.push(npc);
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
    // keep player on the island
    const dx = player.pos.x - CENTER.x, dz = player.pos.z - CENTER.z;
    const d = Math.hypot(dx, dz);
    if (d > ISLAND_R - 2) { const k = (ISLAND_R - 2) / d; player.pos.x = CENTER.x + dx * k; player.pos.z = CENTER.z + dz * k; }
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

  dispose() { this.objects.forEach((o) => this.scene.remove(o)); this.objects = []; }
}
