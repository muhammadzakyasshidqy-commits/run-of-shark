// Game — owns the Three.js scene, render loop, camera, and the active Level.
// The UI layer drives it via startLevel(); Game reports results via callbacks.
import * as THREE from 'three';
import { WORLD, LEVELS } from './config.js';
import { Player } from './entities/Player.js';
import { Level } from './levels/Level.js';
import { Effects } from './effects/Effects.js';
import { Input } from './systems/Input.js';

export class Game {
  constructor({ canvas, uiRoot, economy, audio, save }) {
    this.economy = economy;
    this.audio = audio;
    this.save = save;
    this.input = new Input(uiRoot, this.save.data.settings);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a3d62);
    this.scene.fog = new THREE.Fog(0x0a3d62, 60, 180);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    this.camOffset = new THREE.Vector3(0, 14, -18);
    this._camPos = new THREE.Vector3();

    this._buildEnvironment();
    this.effects = new Effects(this.scene);

    this.clock = new THREE.Clock();
    this.running = false;
    this.paused = false;
    this.level = null;
    this.player = null;
    this.shake = 0;

    this.controlLocked = false;
    this.cinematic = null;     // function(dt) -> done:boolean, drives cutscene camera
    this.onWin = () => {};
    this.onLose = () => {};
    this.onHud = () => {};
    this.onCine = () => {};     // ({title, sub}) or null — UI shows/hides the cinematic banner

    this._initDebug();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  // Lightweight FPS counter, only when the URL has ?debug=1 (for real-device perf checks).
  _initDebug() {
    this.debug = new URLSearchParams(location.search).get('debug') === '1';
    this._fpsAccum = 0; this._fpsFrames = 0; this._fps = 0;
    if (!this.debug) return;
    const el = document.createElement('div');
    el.id = 'fps-counter';
    Object.assign(el.style, {
      position: 'fixed', top: '6px', left: '6px', zIndex: 9999,
      font: '700 13px monospace', color: '#06d6a0', background: 'rgba(0,0,0,.55)',
      padding: '3px 8px', borderRadius: '8px', pointerEvents: 'none', whiteSpace: 'pre',
    });
    document.body.appendChild(el);
    this._fpsEl = el;
  }

  _updateFps(dt) {
    this._fpsAccum += dt; this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      this._fps = Math.round(this._fpsFrames / this._fpsAccum);
      this._fpsAccum = 0; this._fpsFrames = 0;
      if (this._fpsEl) {
        const dpr = Math.min(window.devicePixelRatio, 2).toFixed(1);
        this._fpsEl.textContent = `${this._fps} FPS  ${window.innerWidth}x${window.innerHeight} @${dpr}x`;
      }
    }
  }

  _buildEnvironment() {
    const hemi = new THREE.HemisphereLight(0xbfefff, 0x06324a, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff3d0, 1.1);
    sun.position.set(40, 80, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
    sun.shadow.camera.far = 250;
    this.scene.add(sun);

    // Seabed
    const seabed = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.size * 3, WORLD.size * 3, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0xe9d8a6, flatShading: true, roughness: 1 })
    );
    seabed.rotation.x = -Math.PI / 2;
    seabed.position.y = -3;
    // gentle dunes
    const pos = seabed.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, Math.sin(pos.getX(i) * 0.05) * Math.cos(pos.getY(i) * 0.05) * 1.5);
    }
    pos.needsUpdate = true; seabed.geometry.computeVertexNormals();
    seabed.receiveShadow = true;
    this.scene.add(seabed);

    // Beach strip
    const beach = new THREE.Mesh(
      new THREE.BoxGeometry(WORLD.size * 3, 1, 30),
      new THREE.MeshStandardMaterial({ color: 0xffe8a3, flatShading: true })
    );
    beach.position.set(0, -0.5, WORLD.beachZ - 12);
    beach.receiveShadow = true;
    this.scene.add(beach);

    // Water surface (animated)
    const waterGeo = new THREE.PlaneGeometry(WORLD.size * 4, WORLD.size * 4, 40, 40);
    this.water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({
      color: 0x1e90c9, transparent: true, opacity: 0.55, flatShading: true, metalness: 0.3, roughness: 0.4,
    }));
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 2.5;
    this.scene.add(this.water);
    this._waterBase = waterGeo.attributes.position.array.slice();
  }

  startLevel(index) {
    this.disposeLevel();
    const def = LEVELS[index];
    this.levelIndex = index;
    this.player = new Player(this.scene, this.economy, this._skinColor());
    this.level = new Level(this.scene, def, this.economy, this.audio, this.effects);
    this.player.pos.set(this.level.boat.position.x, 0.2, this.level.boat.position.z + 3);
    this.running = true;
    this.paused = false;
    this.controlLocked = false;
    this.cinematic = null;
    this.audio.startMusic();
    this.input.setTouchVisible(true);

    // Hazard boss arena: dramatic intro, then hand control to the BossController.
    if (this.level.bossCtrl) {
      this.player.pos.set(0, 0.2, WORLD.size - 50);
      this.level.onBossDefeated = () => this._bossDefeat();
      this.level.bossCtrl.onShake = (a) => { this.shake = Math.max(this.shake, a); };
      this._bossIntro(this.level.boss);
    }
  }

  // --- Boss intro cutscene: pan + slow zoom onto the boss + name banner ---
  _bossIntro(boss) {
    this.controlLocked = true;
    this.onCine({ title: boss.def.name.toUpperCase(), sub: 'has appeared!' });
    const dur = 3.0; let t = 0;
    const from = boss.pos.clone().add(new THREE.Vector3(0, 6, -22));
    const to = boss.pos.clone().add(new THREE.Vector3(0, 10, -14));
    this.cinematic = (dt) => {
      t += dt; const k = Math.min(1, t / dur);
      this.camera.position.lerpVectors(from, to, k);
      this.camera.lookAt(boss.pos.x, boss.pos.y + 1, boss.pos.z);
      if (t >= dur) {
        this.onCine(null);
        this.controlLocked = false;
        this.cinematic = null;
        this.level.bossCtrl.begin();
        return true;
      }
      return false;
    };
  }

  // --- Boss defeat cutscene: boss sinks + text, then resolve to win ---
  _bossDefeat() {
    this.controlLocked = true;
    const boss = this.level.boss;
    this.audio.win();
    this.onCine({ title: 'BOSS DEFEATED!', sub: '' });
    const dur = 3.2; let t = 0;
    this.cinematic = (dt) => {
      t += dt;
      boss.mesh.position.y -= dt * 2.2;        // sink
      boss.mesh.rotation.z += dt * 1.5;        // roll over
      boss.mesh.rotation.x += dt * 0.6;
      this.effects.update(0, this.clock.elapsedTime);
      this.camera.position.lerp(boss.pos.clone().add(new THREE.Vector3(0, 8, -16)), Math.min(1, dt * 2));
      this.camera.lookAt(boss.pos.x, boss.pos.y, boss.pos.z);
      if (t >= dur) {
        this.onCine(null);
        this.cinematic = null;
        this.running = false;
        this.onWin(this.levelIndex);
        return true;
      }
      return false;
    };
  }

  _skinColor() {
    const id = this.save.data.equippedSkin;
    const skin = (this.save.data.ownedSkins || []).includes(id) ? id : 'blue';
    const map = { blue: 0x2ec4ff, green: 0x06d6a0, purple: 0x9b59b6, orange: 0xff9f43, diver: 0x34495e, military: 0x4b5320, ninja: 0x1a1a1a, astro: 0xecf0f1, pirate: 0x8b4513, hunter: 0xc0392b, golden: 0xffd166 };
    return map[skin] || 0x2ec4ff;
  }

  disposeLevel() {
    if (this.level) { this.level.dispose(); this.level = null; }
    if (this.player) { this.player.dispose(this.scene); this.player = null; }
  }

  pause(v) { this.paused = v; if (v) this.audio.stopMusic(); else this.audio.startMusic(); }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    if (this.debug) this._updateFps(dt);
    this._animateWater(t);
    this.effects.update(dt, t);

    // Cutscene takes over the camera and freezes gameplay.
    if (this.cinematic) {
      this.cinematic(dt);
      if (this.shake > 0) {
        this.camera.position.x += (Math.random() - 0.5) * this.shake;
        this.camera.position.y += (Math.random() - 0.5) * this.shake;
        this.shake = Math.max(0, this.shake - dt * 2);
      }
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.running && !this.paused && this.level && this.player) {
      const input = this.controlLocked ? { x: 0, z: 0, len: 0, sprint: false } : this.input.read();
      this.player.update(dt, input);
      const result = this.level.update(dt, this.player);

      // follow camera
      const tp = this.player.pos;
      this._camPos.set(tp.x + this.camOffset.x, this.camOffset.y, tp.z + this.camOffset.z);
      this.camera.position.lerp(this._camPos, Math.min(1, dt * 4));
      if (this.shake > 0) {
        this.camera.position.x += (Math.random() - 0.5) * this.shake;
        this.camera.position.y += (Math.random() - 0.5) * this.shake;
        this.shake = Math.max(0, this.shake - dt * 2);
      }
      this.camera.lookAt(tp.x, 1, tp.z + 6);

      // boss charge / damage -> screen shake
      if (this.player.invuln > 1.1) this.shake = 0.6;

      this.onHud({
        coins: this.economy.s.coins,
        objective: this.level.objectiveText,
        stamina: this.player.stamina / this.player.maxStamina,
        hp: this.player.hp, maxHp: this.player.maxHp,
        danger: this._nearestSharkDist() < 8,
        boss: this.level.boss && this.level.boss.active ? this.level.boss.hp / this.level.boss.maxHp : null,
      });

      if (result === 'win') { this.running = false; this.onWin(this.levelIndex); }
      else if (result === 'lose') { this.running = false; this.shake = 1.2; this.onLose(this.levelIndex); }
    } else {
      // idle menu camera orbit
      this.camera.position.set(Math.sin(t * 0.1) * 50, 30, -60 + Math.cos(t * 0.1) * 20);
      this.camera.lookAt(0, 0, 20);
    }

    this.renderer.render(this.scene, this.camera);
  }

  _nearestSharkDist() {
    if (!this.level) return 999;
    let min = 999;
    for (const s of this.level.sharks) if (s.active) min = Math.min(min, s.distanceTo(this.player.pos));
    return min;
  }

  _animateWater(t) {
    const arr = this.water.geometry.attributes.position.array;
    const base = this._waterBase;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 2] = Math.sin(base[i] * 0.08 + t * 1.5) * 0.6 + Math.cos(base[i + 1] * 0.08 + t) * 0.6;
    }
    this.water.geometry.attributes.position.needsUpdate = true;
  }
}
