// Player — movement, stamina/sprint, magnet radius. Driven by Input + Economy stats.
import * as THREE from 'three';
import { makeDiver } from './Models.js';
import { WORLD } from '../config.js';

export class Player {
  constructor(scene, economy, skinColor) {
    this.economy = economy;
    this.mesh = makeDiver(skinColor);
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.pos.set(0, 0.2, WORLD.beachZ + 4); // on the sand; Game.startLevel re-affirms this
    this.vel = new THREE.Vector3();
    this.stamina = economy.statValue('stamina');
    this.maxStamina = this.stamina;
    this.alive = true;
    this.hp = 3 + Math.round(economy.statValue('resistance'));
    this.maxHp = this.hp;
    this._bob = 0;
    this.invuln = 0;
  }

  get magnetRadius() { return this.economy.statValue('magnet'); }

  update(dt, input) {
    const baseSpeed = this.economy.statValue('speed');
    const sprintMult = this.economy.statValue('sprint');
    let speed = baseSpeed;

    const wantSprint = input.sprint && input.len > 0.1 && this.stamina > 1;
    if (wantSprint) {
      speed *= sprintMult;
      this.stamina = Math.max(0, this.stamina - 28 * dt);
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + 16 * dt);
    }

    this.vel.set(input.x, 0, input.z).multiplyScalar(speed);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // clamp to world
    const b = WORLD.size;
    this.pos.x = Math.max(-b, Math.min(b, this.pos.x));
    this.pos.z = Math.max(WORLD.beachZ, Math.min(b, this.pos.z));

    // face movement direction
    if (input.len > 0.05) {
      const targetRot = Math.atan2(input.x, input.z);
      this.mesh.rotation.y += this._angleDelta(this.mesh.rotation.y, targetRot) * Math.min(1, dt * 10);
    }
    // swim bob
    this._bob += dt * (input.len > 0.1 ? 10 : 3);
    this.mesh.position.y = 0.2 + Math.sin(this._bob) * 0.12;

    this._animate(dt, input.len);

    if (this.invuln > 0) {
      this.invuln -= dt;
      // hit reaction: red emissive flash + quick blink (knockback-ish recoil tilt)
      const flash = Math.floor(this.invuln * 12) % 2 === 0;
      this._setHitFlash(flash);
      this.mesh.visible = this.invuln > 1.0 ? (Math.floor(this.invuln * 20) % 2 === 0) : true;
    } else if (this._wasHit) {
      this._setHitFlash(false); this.mesh.visible = true; this._wasHit = false;
    }
  }

  // Procedural walk/swim + idle limb animation (no skeletal rig needed).
  _animate(dt, len) {
    const parts = this.mesh.userData.parts;
    if (!parts) return;
    const moving = len > 0.1;
    this._phase = (this._phase || 0) + dt * (moving ? 12 : 3);
    const swing = Math.sin(this._phase) * (moving ? 0.7 : 0.12);
    // arms & legs swing in opposition (a stroke / walk cycle)
    parts.shL.rotation.x = swing; parts.shR.rotation.x = -swing;
    parts.hipL.rotation.x = -swing * 0.8; parts.hipR.rotation.x = swing * 0.8;
    // gentle torso/head breathing when idle
    if (parts.head) parts.head.rotation.z = Math.sin(this._phase * 0.5) * 0.05;
    if (parts.torso) parts.torso.scale.y = 1 + Math.sin(this._phase * 0.5) * 0.03;
  }

  _setHitFlash(on) {
    this._wasHit = true;
    this.mesh.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive) {
        if (o.userData._baseEmissive === undefined) o.userData._baseEmissive = o.material.emissive.getHex();
        o.material.emissive.setHex(on ? 0x660000 : o.userData._baseEmissive);
      }
    });
  }

  damage(n = 1) {
    if (this.invuln > 0) return false;
    this.hp -= n;
    this.invuln = 1.2;
    if (this.hp <= 0) this.alive = false;
    return true;
  }

  _angleDelta(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  dispose(scene) { scene.remove(this.mesh); }
}
