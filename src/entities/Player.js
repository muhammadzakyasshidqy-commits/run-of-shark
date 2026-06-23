// Player — movement, stamina/sprint, magnet radius. Driven by Input + Economy stats.
import * as THREE from 'three';
import { makeDiver, makeAccessory, makeSeaVehicle } from './Models.js';
import { WORLD, VEHICLES } from '../config.js';

export class Player {
  constructor(scene, economy, skinColor) {
    this.economy = economy;
    this.scene = scene;
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
    this._phase = 0;
    this.invuln = 0;
    this._accessory = null;
    // Apply the equipped skin colour + accessory to the live mesh.
    this.applyAppearance(skinColor, economy.s.equippedAccessory);
  }

  // Recolour the outfit + (re)attach the equipped accessory on the EXISTING mesh — no
  // rebuild needed, so skin/accessory changes show instantly when called.
  applyAppearance(skinColor, accessoryId) {
    if (skinColor != null) {
      this.mesh.traverse((o) => { if (o.isMesh && o.userData.outfit) o.material.color.setHex(skinColor); });
    }
    if (this._accessory) { this._accessory.parent?.remove(this._accessory); this._accessory = null; }
    this._accTrack = null;
    if (accessoryId) {
      const a = makeAccessory(accessoryId);
      if (a) {
        const parts = this.mesh.userData.parts;
        let host, yOff = 0;
        if (this.mesh.userData.mixer) {
          // GLB diver: parent to the model ROOT (clean unit scale) and, every frame in update(),
          // copy the relevant BONE's world position into the accessory (the bone drives the
          // skinned head/torso, so this tracks the animated pose). Avoids the armature's 95x bone
          // scale entirely. _accTrack carries the bone + a small world-space offset.
          host = this.mesh;
          a.obj.scale.setScalar(0.5);
          const bone = (a.part === 'head' ? parts?.head : parts?.body);
          if (bone) { this._accTrack = { bone, dy: a.part === 'head' ? -0.08 : -0.1 }; }
          else { yOff = a.part === 'head' ? 1.4 : 0.9; this._accTrack = null; }
        } else if (a.part === 'head' && parts?.head) {
          host = parts.head;                        // procedural: head items follow the head
        } else {
          host = this.mesh.userData.lean || this.mesh; yOff = -1.0; // body items lean with torso
        }
        a.obj.position.y += yOff;
        host.add(a.obj);
        this._accessory = a.obj;
      }
    }
  }

  // Attach the equipped sea vehicle under the diver so you visibly "ride" it while diving.
  _attachVehicle() {
    const vid = this.economy.s.equippedVehicle;
    if (!vid) return;
    const v = VEHICLES.find((x) => x.id === vid);
    const veh = makeSeaVehicle(vid, v && v.color);
    veh.scale.setScalar(0.6);
    veh.rotation.y = -Math.PI / 2;        // its +X forward -> the diver's +Z forward
    veh.position.set(0, 0.55, 0.45);      // held in front of the prone swimmer
    this.mesh.add(veh); this._veh = veh;
  }

  get magnetRadius() { return this.economy.statValue('magnet'); }

  update(dt, input, mode = 'level') {
    let baseSpeed = this.economy.statValue('speed');
    // EQUIPPED SEA VEHICLE: functional swim-speed boost during dives (escape sharks easier).
    if (mode === 'level') {
      baseSpeed *= (1 + this.economy.vehicleSpeedBonus());
      if (!this._vehAttached) { this._vehAttached = true; this._attachVehicle(); }
    }
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
    // Float height: in a dive level the diver floats up in the WATER COLUMN (so it reads as
    // swimming, not dragging along the seabed); on land (hub) it stands at ground level. The
    // base height eases between the two so entering/leaving the water doesn't pop. (pos.y is
    // visual only — collision/goal/shark distances all use x/z.)
    const targetBaseY = mode === 'level' ? 1.35 : 0.2;
    this._baseY = this._baseY ?? 0.2;
    this._baseY += (targetBaseY - this._baseY) * Math.min(1, dt * 3);
    this._bob += dt * (input.len > 0.1 ? 10 : 3);
    const bobAmp = this.mesh.userData.mixer ? 0.05 : 0.12;
    this.mesh.position.y = this._baseY + Math.sin(this._bob) * bobAmp;

    if (this.mesh.userData.mixer) this._animateGLB(dt, input, mode);
    else this._animate(dt, input.len, mode);

    // Accessory follows its bone (GLB diver): the bone world position tracks the skinned head/
    // torso, so copy it into the root-local accessory each frame + a small world-up offset.
    if (this._accTrack && this._accessory) {
      this.mesh.updateWorldMatrix(true, true);
      const v = this._accTrack.bone.getWorldPosition(this._tmpV || (this._tmpV = new THREE.Vector3()));
      this.mesh.worldToLocal(v);
      this._accessory.position.set(v.x, v.y + this._accTrack.dy, v.z);
    }

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

  // GLB diver: pick the built-in clip from mode + movement and advance the mixer. Levels use
  // the real Swim_Fwd/Swim_Idle clips (the model swims horizontally on its own); the hub uses
  // Idle/Walk/Sprint. No procedural lean — the clips already pose the body.
  _animateGLB(dt, input, mode) {
    const moving = input.len > 0.1;
    const wantSprint = input.sprint && moving && this.stamina > 1;
    let clip;
    if (mode === 'level') clip = moving ? 'swim' : 'swimIdle';
    else clip = moving ? (wantSprint ? 'sprint' : 'walk') : 'idle';
    this.mesh.userData.setAnim(clip);
    this.mesh.userData.mixer.update(dt);
  }

  // Two distinct procedural animations (no skeletal rig):
  //  - SWIM (mode 'level', in the ocean): body leans ~horizontal/prone, arms do a
  //    front-crawl windmill, legs flutter-kick fast.
  //  - WALK (mode 'hub', on land): upright, arms & legs swing in opposition.
  _animate(dt, len, mode) {
    const parts = this.mesh.userData.parts;
    if (!parts) return;
    const lean = this.mesh.userData.lean || this.mesh; // lean the mid-body pivot, not the feet
    const moving = len > 0.1;

    if (mode === 'level') {
      // lean the body forward into a prone swim pose, pivoting about its CENTRE so the
      // head stays near the surface (no nose-dive).
      const targetLean = moving ? -1.0 : -0.7;
      lean.rotation.x += (targetLean - lean.rotation.x) * Math.min(1, dt * 5);
      this._phase += dt * (moving ? 11 : 4);
      // front-crawl: shoulders windmill in opposition (full overhead reach), big when moving
      const amp = moving ? 1.9 : 0.4, bias = -0.3;
      parts.shL.rotation.x = bias + Math.sin(this._phase) * amp;
      parts.shR.rotation.x = bias + Math.sin(this._phase + Math.PI) * amp;
      parts.shL.rotation.z = -0.25; parts.shR.rotation.z = 0.25; // arms held out, not glued to body
      // body ROLL toward the pulling arm — reads clearly as swimming, not sliding
      lean.rotation.z = Math.sin(this._phase) * (moving ? 0.28 : 0.08);
      // flutter kick: fast, opposed
      const kick = Math.sin(this._phase * 1.9) * (moving ? 0.55 : 0.16);
      parts.hipL.rotation.x = kick; parts.hipR.rotation.x = -kick;
      if (parts.torso) parts.torso.scale.y = 1 + Math.sin(this._phase * 0.5) * 0.02;
    } else {
      // upright walk cycle (no lean, no roll, no arm-spread)
      lean.rotation.x += (0 - lean.rotation.x) * Math.min(1, dt * 5);
      lean.rotation.z += (0 - lean.rotation.z) * Math.min(1, dt * 8);
      parts.shL.rotation.z = 0; parts.shR.rotation.z = 0;
      this._phase += dt * (moving ? 12 : 3);
      const swing = Math.sin(this._phase) * (moving ? 0.7 : 0.12);
      parts.shL.rotation.x = swing; parts.shR.rotation.x = -swing;
      parts.hipL.rotation.x = -swing * 0.8; parts.hipR.rotation.x = swing * 0.8;
      if (parts.torso) parts.torso.scale.y = 1 + Math.sin(this._phase * 0.5) * 0.03;
    }
    if (parts.head) parts.head.rotation.z = Math.sin(this._phase * 0.5) * 0.05;
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
