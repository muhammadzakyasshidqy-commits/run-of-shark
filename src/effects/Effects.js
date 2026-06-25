// Effects — bubble particles, pickup bursts, and the cinematic tsunami wall.
import * as THREE from 'three';
import { WORLD } from '../config.js';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.bursts = [];
    this.tsunami = null;
    this._bubbles();
  }

  _bubbles() {
    const count = 120;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * WORLD.size * 2;
      pos[i * 3 + 1] = Math.random() * 20 - 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * WORLD.size * 2;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const matp = new THREE.PointsMaterial({ color: 0xbfefff, size: 0.35, transparent: true, opacity: 0.5 });
    this.bubbles = new THREE.Points(geo, matp);
    this.scene.add(this.bubbles);
  }

  burst(position, color = 0xffd166, n = 12) {
    const group = new THREE.Group();
    const geo = new THREE.SphereGeometry(0.12, 6, 5);
    const m = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(geo, m);
      p.position.copy(position);
      p.userData.v = new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 6, (Math.random() - 0.5) * 6);
      group.add(p);
    }
    group.userData.life = 0.7;
    this.scene.add(group);
    this.bursts.push(group);
  }

  // Expanding shockwave ring (boss roar / wave telegraph + impact).
  ring(position, color = 0xff2d2d, maxR = 10, duration = 0.6) {
    const geo = new THREE.TorusGeometry(0.6, 0.18, 8, 28);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const r = new THREE.Mesh(geo, m);
    r.rotation.x = Math.PI / 2;
    r.position.copy(position); r.position.y = 0.3;
    r.userData = { life: duration, max: duration, maxR };
    this.scene.add(r);
    this.rings = this.rings || [];
    this.rings.push(r);
    return r;
  }

  spawnTsunami() {
    // A towering wave wall that surges from the OPEN SEA BEHIND the diver (-Z) toward the far shore
    // (+Z) they flee to — logically chasing them onto land. White foam crest sells the motion.
    // `tsunamiVel` is the +Z surge speed (bumped during the escape cutscene).
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(WORLD.size * 2.4, 44, 12),
      new THREE.MeshStandardMaterial({ color: 0x1e6fa0, transparent: true, opacity: 0.88, flatShading: true }));
    grp.add(body);
    const foam = new THREE.Mesh(new THREE.BoxGeometry(WORLD.size * 2.4, 7, 14),
      new THREE.MeshStandardMaterial({ color: 0xeaf6ff, flatShading: true, emissive: 0x335577 }));
    foam.position.set(0, 22, 1); grp.add(foam);
    grp.position.set(0, 14, WORLD.beachZ - 14);   // behind the dive start, out in the open sea
    this.scene.add(grp);
    this.tsunami = grp;
    this.tsunamiVel = 7.5;                         // +Z surge speed
    return grp;
  }

  update(dt, t) {
    // bubbles rise
    const arr = this.bubbles.geometry.attributes.position.array;
    for (let i = 1; i < arr.length; i += 3) {
      arr[i] += dt * 1.2;
      if (arr[i] > 12) arr[i] = -12;
    }
    this.bubbles.geometry.attributes.position.needsUpdate = true;

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const g = this.bursts[i];
      g.userData.life -= dt;
      g.children.forEach((p) => {
        p.userData.v.y -= 9 * dt;
        p.position.addScaledVector(p.userData.v, dt);
      });
      if (g.userData.life <= 0) { this.scene.remove(g); this.bursts.splice(i, 1); }
    }

    if (this.rings) {
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.userData.life -= dt;
        const p = 1 - r.userData.life / r.userData.max;
        const scale = 0.6 + p * r.userData.maxR;
        r.scale.set(scale, scale, 1);
        r.material.opacity = Math.max(0, 0.9 * (1 - p));
        if (r.userData.life <= 0) { this.scene.remove(r); this.rings.splice(i, 1); }
      }
    }

    if (this.tsunami) {
      this.tsunami.position.z += dt * (this.tsunamiVel || 7.5);   // surge toward the far shore (+Z)
      this.tsunami.position.y = 14 + Math.sin(t * 3) * 0.8;       // heave
    }
  }
}
