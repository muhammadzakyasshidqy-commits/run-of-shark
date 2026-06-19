// Shark — chasing AI with wander, plus boss behaviours (charge/roar/wave).
import * as THREE from 'three';
import { makeShark } from './Models.js';
import { SHARK_TYPES, WORLD } from '../config.js';

export class Shark {
  constructor(scene, typeKey, levelSpeedMult = 1) {
    this.def = SHARK_TYPES[typeKey];
    this.typeKey = typeKey;
    this.isBoss = typeKey === 'boss' || typeKey === 'kraken';
    this.mesh = makeShark(this.def.color, this.def.scale);
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

    // tail wag
    this.mesh.children.forEach((c, i) => { if (i === 3) c.rotation.x = Math.sin(this._t * 12) * 0.4; });
    this.pos.y = -0.4 + Math.sin(this._t * 2) * 0.15;
  }

  _chase(dt, target, speed) {
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const len = Math.hypot(dx, dz) || 1;
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
    // keep inside bounds
    const b = WORLD.size;
    this.pos.x = Math.max(-b, Math.min(b, this.pos.x));
    this.pos.z = Math.max(WORLD.beachZ, Math.min(b, this.pos.z));
  }

  _face(dx, dz) { this.mesh.rotation.y = Math.atan2(dx, dz) + Math.PI / 2; }

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
  dispose(scene) { scene.remove(this.mesh); }
}
