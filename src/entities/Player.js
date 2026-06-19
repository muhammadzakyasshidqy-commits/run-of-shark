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
    this.pos.set(0, 0.2, WORLD.beachZ + 6);
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

    if (this.invuln > 0) {
      this.invuln -= dt;
      this.mesh.visible = Math.floor(this.invuln * 12) % 2 === 0;
    } else {
      this.mesh.visible = true;
    }
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
