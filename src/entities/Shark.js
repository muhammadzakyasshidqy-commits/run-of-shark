// Shark — chasing AI with wander, plus boss behaviours (charge/roar/wave).
import * as THREE from 'three';
import { makeShark } from './Models.js';
import { removeAndDispose } from '../systems/dispose.js';
import { SHARK_TYPES, WORLD } from '../config.js';

export class Shark {
  constructor(scene, typeKey, levelSpeedMult = 1) {
    this.def = SHARK_TYPES[typeKey];
    this.typeKey = typeKey;
    this.isBoss = typeKey === 'boss' || typeKey === 'kraken';
    this.mesh = makeShark(this.def.color, this.def.scale, typeKey);
    this.aggression = 0.4;        // 0=calm cruise, 1=attacking (drives undulation + jaw)
    this.aggressionTarget = 0.4;
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    // spawn far behind the play area
    this.pos.set((Math.random() - 0.5) * 60, -0.5, WORLD.size - 5);
    this.speed = this.def.speed * levelSpeedMult;
    this.active = true;
    this._t = Math.random() * 10;

    // boss state
    this.maxHp = this.isBoss ? (typeKey === 'kraken' ? 12 : 8) : 0;
    this.hp = this.maxHp;
    this.state = 'chase';
    this.stateTimer = 2 + Math.random() * 2;
    this.chargeDir = new THREE.Vector3();
    this.onRoar = () => {};
    this.onCharge = () => {};
    this.onWave = () => {};

    // When a BossController drives this shark, its internal FSM is disabled
    // and movement is set directly by the controller.
    this.externalControl = false;
    this.hitCooldown = 0;
    this._baseColor = this.def.color;
  }

  setMaxHp(n) { this.maxHp = n; this.hp = n; }

  // The shoreline sits ~12 past WORLD.beachZ (Game.shorelineZ); keep sharks a touch deeper than
  // that so they patrol the water's edge but never slide onto the dry sand.
  static SEA_EDGE_Z = WORLD.beachZ + 16;

  // Collision radius used for hazard/player overlap tests.
  get radius() { return (this.isBoss ? 1.4 : 1.0) * this.def.scale; }

  // Red telegraph glow on the boss body parts (emissive).
  setTelegraph(on) {
    this.mesh.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive) {
        o.material.emissive.setHex(on ? 0x550000 : 0x000000);
        o.material.emissiveIntensity = on ? 1 : 0;
      }
    });
  }

  update(dt, target) {
    if (!this.active) return;
    this._t += dt;
    if (this.hitCooldown > 0) this.hitCooldown -= dt;

    if (this.isBoss && !this.externalControl) { this._updateBoss(dt, target); }
    else if (!this.isBoss) { this._chase(dt, target, this.speed); }

    // Sharks STAY IN THE SEA — they never cross the shoreline onto the sand/beach. The water
    // begins a little past WORLD.beachZ, so clamp the shark's Z to that sea edge: it stops at the
    // water's edge instead of beaching. (Player x/z, goal + hazard math are all further out in +Z,
    // so this only blocks the degenerate "shark on the sand" case near the dive start.)
    if (this.pos.z < Shark.SEA_EDGE_Z) this.pos.z = Shark.SEA_EDGE_Z;

    this._swimAnim(dt);
    this.pos.y = (this.isBoss ? -0.4 : -0.5) + Math.sin(this._t * 2) * 0.15;
  }

  // Body-undulation swim: a travelling sine wave ripples down the segments toward the
  // tail; jaw gapes and the wave speeds up with `aggression` (set high during attacks).
  _swimAnim(dt) {
    this.aggression += (this.aggressionTarget - this.aggression) * Math.min(1, dt * 4);
    const ud = this.mesh.userData;
    // GLB shark: advance its built-in swim clip (faster while attacking). The procedural
    // segment/tail/jaw block below is skipped when those userData contracts are absent.
    if (ud.mixer) { ud.mixer.update(dt * (0.8 + this.aggression * 1.4)); return; }
    const freq = 6 + this.aggression * 8;
    const amp = 0.12 + this.aggression * 0.22;
    if (ud.segments) {
      for (const seg of ud.segments) {
        const tailW = Math.max(0, (2 - seg.position.x) / 3.5); // 0 at head -> ~1 at tail
        seg.position.z = Math.sin(this._t * freq - seg.position.x * 1.1) * amp * tailW;
      }
    }
    if (ud.tail) ud.tail.rotation.y = Math.sin(this._t * freq) * (0.4 + this.aggression * 0.5);
    if (ud.jaw) ud.jaw.rotation.z = -Math.PI / 2 - this.aggression * 0.45; // mouth opens when attacking
  }

  _chase(dt, target, speed) {
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    this.aggressionTarget = len < 12 ? 1 : 0.45; // lunge-feel when closing in
    this.pos.x += (dx / len) * speed * dt;
    this.pos.z += (dz / len) * speed * dt;
    this._face(dx, dz);
  }

  _updateBoss(dt, target) {
    this.stateTimer -= dt;
    if (this.state === 'chase') {
      this._chase(dt, target, this.speed * 0.7);
      if (this.stateTimer <= 0) { this.state = 'wind'; this.stateTimer = 0.8; this.onRoar(); }
    } else if (this.state === 'wind') {
      // telegraph the charge — aim at player
      const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      this.chargeDir.set(dx / len, 0, dz / len);
      this._face(dx, dz);
      if (this.stateTimer <= 0) { this.state = 'charge'; this.stateTimer = 1.0; this.onCharge(); }
    } else if (this.state === 'charge') {
      this.pos.x += this.chargeDir.x * this.speed * 2.4 * dt;
      this.pos.z += this.chargeDir.z * this.speed * 2.4 * dt;
      if (this.stateTimer <= 0) {
        this.state = 'chase';
        this.stateTimer = 2.5 + Math.random() * 2;
        if (Math.random() < 0.5) this.onWave(this.pos.clone());
      }
    }
    // keep inside bounds (the sea-edge minimum is re-applied in update())
    const b = WORLD.size;
    this.pos.x = Math.max(-b, Math.min(b, this.pos.x));
    this.pos.z = Math.max(Shark.SEA_EDGE_Z, Math.min(b, this.pos.z));
  }

  // The shark model's snout points along LOCAL +X — guaranteed by the baked yaw in Assets.js
  // MANIFEST (fish yaw +PI/2, VERIFIED with a marker render: the GLB snout sits at local -X, so
  // +PI/2 brings it to +X). A rotation.y of θ maps local +X to world (cosθ, -sinθ) on the XZ
  // plane, so to make the HEAD lead the movement (dx,dz) we need rotation.y = atan2(-dz, dx).
  _face(dx, dz) { this.mesh.rotation.y = Math.atan2(-dz, dx); }

  // Called when the boss crashes into an arena hazard. Returns true if this hit killed it.
  // Guarded by a cooldown so one crash counts as exactly one hit.
  hitBy() {
    if (!this.isBoss || this.hitCooldown > 0 || this.hp <= 0) return false;
    this.hp -= 1;
    this.hitCooldown = 0.8;
    this.mesh.scale.multiplyScalar(0.96);
    if (this.hp <= 0) { this.hp = 0; return true; }
    return false;
  }

  distanceTo(p) { return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }
  dispose(scene) { removeAndDispose(scene, this.mesh); }
}
