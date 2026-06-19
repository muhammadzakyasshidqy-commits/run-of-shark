// BossController — evasion-based boss fight (NO projectiles / weapons).
// The boss HP only drops when the player baits the boss into crashing into an
// arena hazard (sharp rocks) at the end of a telegraphed attack. Pure timing/positioning.
//
// Cycle: idle -> telegraph -> (charge | roar | wave) -> resolve(hit OR reset) -> recover -> idle
import * as THREE from 'three';
import { WORLD } from '../config.js';

const ATTACKS = ['charge', 'roar', 'wave'];

export class BossController {
  constructor({ scene, boss, hazards, effects, audio }) {
    this.scene = scene;
    this.boss = boss;          // a Shark instance (isBoss)
    this.hazards = hazards;    // [{ pos: Vector3, radius }]
    this.effects = effects;
    this.audio = audio;

    this.boss.externalControl = true; // we drive movement directly

    this.state = 'frozen';     // controller starts frozen until intro cutscene finishes
    this.timer = 0;
    this.attack = null;
    this.lockDir = new THREE.Vector3();
    this.lockTarget = new THREE.Vector3();
    this._hitThisMove = false;
    this._chargeDist = 0;
    this._waveMeshes = [];
    this._waveDamaged = false;
    this._gapCenter = 0;
    this.defeated = false;

    // tunables (fair reaction windows)
    this.idleTime = 1.5;
    this.telegraphTime = 1.2;   // time the player has to read + position before the strike
    this.recoverTime = 1.1;

    // callbacks (wired by Game/Level)
    this.onHit = () => {};      // (hp, maxHp)
    this.onShake = () => {};    // (amount)
    this.onDefeated = () => {};
    this.onAttackTelegraph = () => {}; // (attackName)
  }

  // Called by Game after the intro cutscene; hands control to the FSM.
  begin() { this.state = 'idle'; this.timer = this.idleTime; }

  // ---- helpers ----
  _dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

  _hazardHit() {
    for (const hz of this.hazards) {
      if (this._dist(this.boss.pos, hz.pos) < hz.radius + this.boss.radius) return hz;
    }
    return null;
  }

  _registerHit(hz) {
    if (this._hitThisMove) return;
    this._hitThisMove = true;
    const dead = this.boss.hitBy(); // decrements HP (cooldown-guarded)
    this.effects.ring(this.boss.pos, 0x06d6a0, 9, 0.5);
    this.effects.burst(this.boss.pos, 0xffd166, 18);
    this.effects.burst(hz.pos, 0xff6b6b, 10);
    this.audio.hit();
    this.onShake(0.7);
    this.onHit(this.boss.hp, this.boss.maxHp);
    if (dead) this._startDefeat();
    else { this.state = 'recover'; this.timer = this.recoverTime + 0.4; this.boss.setTelegraph(false); }
  }

  _contactDamage(player) {
    if (this._dist(this.boss.pos, player.pos) < this.boss.radius + 0.9) {
      if (player.damage(1)) { this.audio.hit(); this.effects.burst(player.pos, 0xff2d2d, 12); this.onShake(0.5); }
    }
  }

  // Snout points along local +X (same as the shark model) -> face lockDir with atan2(-z, x).
  _faceTarget() { this.boss.mesh.rotation.y = Math.atan2(-this.lockDir.z, this.lockDir.x); }

  _clearWave() { this._waveMeshes.forEach((m) => this.scene.remove(m)); this._waveMeshes = []; }

  _startDefeat() {
    this.state = 'defeat';
    this.boss.setTelegraph(false);
    this._clearWave();
    this.defeated = true;
    this.onDefeated();
  }

  // ---- main update ----
  update(dt, player) {
    if (this.state === 'frozen' || this.state === 'defeat') return;
    // drive the boss's swim animation: aggressive (open jaw, fast undulation) while striking
    this.boss.aggressionTarget = (this.state === 'charge' || this.state === 'roar' || this.state === 'wave') ? 1 : 0.4;
    this.boss.update(dt, player.pos); // cosmetic anim only, externalControl=true
    this.timer -= dt;

    switch (this.state) {
      case 'idle':       this._idle(dt, player); break;
      case 'telegraph':  this._telegraph(dt, player); break;
      case 'charge':     this._charge(dt, player); break;
      case 'roar':       this._roar(dt, player); break;
      case 'wave':       this._wave(dt, player); break;
      case 'recover':    this._recover(dt, player); break;
    }
  }

  _idle(dt, player) {
    // drift slowly toward the player, but veer away from hazards (no free hits while idling)
    const dx = player.pos.x - this.boss.pos.x, dz = player.pos.z - this.boss.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    let mx = (dx / len), mz = (dz / len);
    for (const hz of this.hazards) {
      const hd = this._dist(this.boss.pos, hz.pos);
      if (hd < hz.radius + this.boss.radius + 1.5) { mx -= (hz.pos.x - this.boss.pos.x) / hd; mz -= (hz.pos.z - this.boss.pos.z) / hd; }
    }
    const ml = Math.hypot(mx, mz) || 1;
    this.boss.pos.x += (mx / ml) * this.boss.speed * 0.45 * dt;
    this.boss.pos.z += (mz / ml) * this.boss.speed * 0.45 * dt;
    this.lockDir.set(dx / len, 0, dz / len); this._faceTarget();
    this._contactDamage(player);

    if (this.timer <= 0) {
      // _forceAttack is a test-only hook (null in normal play) to force a specific pattern.
      this.attack = this._forceAttack || ATTACKS[Math.floor(Math.random() * ATTACKS.length)];
      this.state = 'telegraph';
      this.timer = this.telegraphTime;
      this._hitThisMove = false;
      this.boss.setTelegraph(true);
      this.onAttackTelegraph(this.attack);
      // lock aim at the player's CURRENT position (gives them time to bait/dodge)
      this.lockTarget.copy(player.pos);
      const ddx = player.pos.x - this.boss.pos.x, ddz = player.pos.z - this.boss.pos.z;
      const l = Math.hypot(ddx, ddz) || 1;
      this.lockDir.set(ddx / l, 0, ddz / l);
      this._faceTarget();
      if (this.attack === 'charge') this.audio.sharkRoar();
    }
  }

  _telegraph(dt, player) {
    // pulse + face the locked direction; small telegraph ring at the strike line
    this.boss.mesh.scale.setScalar(this.boss.def.scale * (1 + Math.sin(this.timer * 25) * 0.04));
    this._faceTarget();
    if (this.timer <= this.telegraphTime - 0.05 && !this._tgRingDone) { this._tgRingDone = true; this.effects.ring(this.boss.pos, 0xffcc00, 3, this.telegraphTime); }
    if (this.timer <= 0) {
      this._tgRingDone = false;
      this._hitThisMove = false;
      if (this.attack === 'charge') { this.state = 'charge'; this.timer = 2.2; this._chargeDist = 0; this.audio.charge(); }
      else if (this.attack === 'roar') { this.state = 'roar'; this.timer = 1.0; this._roarFired = false; this.audio.sharkRoar(); }
      else { this.state = 'wave'; this.timer = 2.0; this._spawnWave(); this._waveDamaged = false; }
    }
  }

  _charge(dt, player) {
    const speed = this.boss.speed * 3.0;
    const step = speed * dt;
    this.boss.pos.x += this.lockDir.x * step;
    this.boss.pos.z += this.lockDir.z * step;
    this._chargeDist += step;
    this._contactDamage(player);

    const hz = this._hazardHit();
    if (hz) return this._registerHit(hz);

    // out of bounds or travelled full lane without crashing => reset (no damage)
    const b = WORLD.size;
    const oob = Math.abs(this.boss.pos.x) > b || this.boss.pos.z > b || this.boss.pos.z < WORLD.beachZ;
    if (this._chargeDist > 80 || oob || this.timer <= 0) {
      this.boss.pos.x = Math.max(-b, Math.min(b, this.boss.pos.x));
      this.boss.pos.z = Math.max(WORLD.beachZ + 4, Math.min(b - 4, this.boss.pos.z));
      this.state = 'recover'; this.timer = this.recoverTime; this.boss.setTelegraph(false);
    }
  }

  _roar(dt, player) {
    if (!this._roarFired) {
      this._roarFired = true;
      this.effects.ring(this.boss.pos, 0xff2d2d, 14, 0.7);
      this.onShake(0.6);
      // knockback the player if caught in the blast
      const d = this._dist(this.boss.pos, player.pos);
      if (d < 11) {
        const kx = (player.pos.x - this.boss.pos.x) / (d || 1), kz = (player.pos.z - this.boss.pos.z) / (d || 1);
        player.pos.x += kx * 6; player.pos.z += kz * 6;
        if (d < 6) player.damage(1);
      }
      // Pick the recoil direction: if the player baited a hazard roughly BEHIND the boss,
      // the roar slams it straight back into that hazard (fast + far enough to actually reach).
      // Otherwise it recoils straight back and most likely whiffs -> reset (no damage).
      const back = { x: -this.lockDir.x, z: -this.lockDir.z };
      let best = null, bestDist = Infinity;
      for (const hz of this.hazards) {
        const tx = hz.pos.x - this.boss.pos.x, tz = hz.pos.z - this.boss.pos.z;
        const td = Math.hypot(tx, tz) || 1;
        const dot = (tx / td) * back.x + (tz / td) * back.z; // alignment with the backward direction
        if (dot > 0.25 && td < 24 && td < bestDist) { bestDist = td; best = { x: tx / td, z: tz / td }; }
      }
      this._roarDir = best || back; // snap toward a baited hazard, else straight back
    }
    // fast recoil so it can realistically reach a hazard the player set up behind the boss
    const sp = this.boss.speed * 3.0;
    this.boss.pos.x += this._roarDir.x * sp * dt;
    this.boss.pos.z += this._roarDir.z * sp * dt;
    const hz = this._hazardHit();
    if (hz) return this._registerHit(hz);
    if (this.timer <= 0) { this.state = 'recover'; this.timer = this.recoverTime; this.boss.setTelegraph(false); }
  }

  _spawnWave() {
    // wide wall perpendicular to the attack direction, with one safe gap
    this._gapCenter = (Math.random() - 0.5) * 22;
    const gapHalf = 6;
    const perp = new THREE.Vector3(-this.lockDir.z, 0, this.lockDir.x);
    const mk = (centerOffset, width) => {
      const geo = new THREE.BoxGeometry(width, 2.2, 1.4);
      const m = new THREE.MeshStandardMaterial({ color: 0x2ec4ff, transparent: true, opacity: 0.7, emissive: 0x113355, flatShading: true });
      const mesh = new THREE.Mesh(geo, m);
      mesh.userData.offset = centerOffset; mesh.userData.width = width;
      this.scene.add(mesh); this._waveMeshes.push(mesh);
      return mesh;
    };
    // left and right segments leaving the gap in the middle
    mk(this._gapCenter - (gapHalf + 11), 22);
    mk(this._gapCenter + (gapHalf + 11), 22);
    this._waveOrigin = this.boss.pos.clone();
    this._wavePerp = perp;
    this._waveTravel = 0;
  }

  _wave(dt, player) {
    const advance = this.boss.speed * 1.2;
    const step = advance * dt;
    this._waveTravel += step;
    // boss advances behind its wave toward the locked direction
    this.boss.pos.x += this.lockDir.x * step * 0.8;
    this.boss.pos.z += this.lockDir.z * step * 0.8;
    // position the wave wall in front of the boss
    const frontX = this.boss.pos.x + this.lockDir.x * 4;
    const frontZ = this.boss.pos.z + this.lockDir.z * 4;
    const angle = Math.atan2(this.lockDir.x, this.lockDir.z);
    for (const m of this._waveMeshes) {
      m.position.set(frontX + this._wavePerp.x * m.userData.offset, 0.6, frontZ + this._wavePerp.z * m.userData.offset);
      m.rotation.y = angle;
    }
    // damage player if the wave front reaches them outside the gap
    if (!this._waveDamaged) {
      const dToFront = (player.pos.x - frontX) * this.lockDir.x + (player.pos.z - frontZ) * this.lockDir.z;
      const lateral = (player.pos.x - frontX) * this._wavePerp.x + (player.pos.z - frontZ) * this._wavePerp.z;
      if (Math.abs(dToFront) < 1.6) {
        if (Math.abs(lateral - this._gapCenter) > 6) { this._waveDamaged = true; if (player.damage(1)) { this.audio.hit(); this.onShake(0.5); } }
      }
    }
    this._contactDamage(player);
    const hz = this._hazardHit();
    if (hz) { this._clearWave(); return this._registerHit(hz); }
    const b = WORLD.size;
    if (this._waveTravel > 36 || Math.abs(this.boss.pos.x) > b || this.timer <= 0) {
      this._clearWave();
      this.state = 'recover'; this.timer = this.recoverTime; this.boss.setTelegraph(false);
    }
  }

  _recover(dt, player) {
    this.boss.mesh.scale.setScalar(this.boss.def.scale * (this.boss.hp / this.boss.maxHp) * 0.2 + this.boss.def.scale * 0.8);
    // gentle drift back toward arena center
    this.boss.pos.x += (0 - this.boss.pos.x) * Math.min(1, dt * 0.6);
    this.boss.pos.z += ((WORLD.size - 30) - this.boss.pos.z) * Math.min(1, dt * 0.6);
    this._contactDamage(player);
    if (this.timer <= 0) { this.state = 'idle'; this.timer = this.idleTime; }
  }

  dispose() { this._clearWave(); }
}
