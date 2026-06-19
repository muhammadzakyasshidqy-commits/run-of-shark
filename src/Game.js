// Game — owns the Three.js scene, render loop, camera, and the active Level.
// The UI layer drives it via startLevel(); Game reports results via callbacks.
import * as THREE from 'three';
import { WORLD, LEVELS } from './config.js';
import { Player } from './entities/Player.js';
import { Level } from './levels/Level.js';
import { Effects } from './effects/Effects.js';
import { Input } from './systems/Input.js';
import { rotateInput } from './systems/cameraRelative.js';

export class Game {
  constructor({ canvas, uiRoot, economy, audio, save }) {
    this.economy = economy;
    this.audio = audio;
    this.save = save;
    this.canvas = canvas;
    this.input = new Input(uiRoot, this.save.data.settings);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a3d62);
    this.scene.fog = new THREE.Fog(0x0a3d62, 60, 180);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    // Orbit chase-cam: spherical (yaw + pitch) around the player. Defaults reproduce
    // the old framing (~18 behind / ~14 up).
    this.camAhead = 6;
    this.camRadius = 22;          // 3D distance player->camera
    this.camBaseY = 1;
    this.camYaw = 0;              // horizontal orbit angle
    this.camPitch = 0.66;         // elevation (clamped); ~14 up at radius 22
    this.camMinPitch = 0.22; this.camMaxPitch = 1.30;
    this.camMinRadius = 12; this.camMaxRadius = 34;
    this._dragging = false; this._dragId = null; this._dragCooldown = 0;
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
    this._initCameraControls();
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

  // Cartoon palm tree (trunk + fan of leaf cones + coconuts).
  _palm(x, z) {
    const g = new THREE.Group();
    const m = (c, f = true) => new THREE.MeshStandardMaterial({ color: c, flatShading: f, roughness: 0.9 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 4.5, 6), m(0x8a5a2b));
    trunk.position.y = 2.2; trunk.rotation.z = 0.08; g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.6, 4), m(0x2ecc71));
      leaf.position.y = 4.4; leaf.rotation.z = Math.PI / 2.3; leaf.rotation.y = (i / 6) * Math.PI * 2;
      leaf.scale.set(0.5, 1, 1); g.add(leaf);
    }
    for (const a of [0.4, -0.3]) {
      const coco = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), m(0x6b4226, false));
      coco.position.set(Math.cos(a) * 0.3, 4.1, Math.sin(a) * 0.3); g.add(coco);
    }
    g.position.set(x, 0, z);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  // Floating marker buoy (red float + white ring + pole + light) for the world edge.
  _buoy(x, z) {
    const g = new THREE.Group();
    const m = (c, e = 0) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, emissive: e });
    const float = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), m(0xe53935));
    float.scale.set(1, 0.8, 1); float.position.y = 2.5; g.add(float);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.12, 6, 12), m(0xffffff));
    band.rotation.x = Math.PI / 2; band.position.y = 2.5; g.add(band);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 5), m(0x444444));
    pole.position.y = 3.6; g.add(pole);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), m(0xffeb3b, 0x665500));
    light.position.y = 4.4; g.add(light);
    g.position.set(x, 0, z);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  // Ring of buoys along the playable boundary (clamped to ±WORLD.size, z>=beachZ),
  // so the edge is visible BEFORE the player hits the invisible clamp.
  _buildBoundary() {
    const S = WORLD.size, step = 26;
    const place = (x, z) => this.scene.add(this._buoy(x, z));
    for (let z = WORLD.beachZ + 10; z <= S; z += step) { place(-S, z); place(S, z); } // side edges
    for (let x = -S; x <= S; x += step) place(x, S);                                   // far edge
  }

  _buildEnvironment() {
    const hemi = new THREE.HemisphereLight(0xcdeeff, 0x0a3a52, 1.05);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff3d0, 1.15);
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

    // Dry sand beach sits BEHIND the spawn; the water only starts at the shoreline
    // (this.shorelineZ) so the player visibly begins ON sand, not mid-ocean.
    this.shorelineZ = WORLD.beachZ + 12;
    const beach = new THREE.Mesh(
      new THREE.BoxGeometry(WORLD.size * 3, 1, 40),
      new THREE.MeshStandardMaterial({ color: 0xffe3a0, flatShading: true })
    );
    beach.position.set(0, -0.4, WORLD.beachZ - 6); // spans ~[beachZ-26, beachZ+14]
    beach.receiveShadow = true;
    this.scene.add(beach);
    const shore = new THREE.Mesh(
      new THREE.BoxGeometry(WORLD.size * 3, 1.02, 14),
      new THREE.MeshStandardMaterial({ color: 0xe6c684, flatShading: true }) // wet sand band
    );
    shore.position.set(0, -0.39, WORLD.beachZ + 7);
    shore.receiveShadow = true;
    this.scene.add(shore);

    // Palm trees + rocks so the beach reads as a real place, not a flat slab.
    for (let i = 0; i < 6; i++) {
      const x = (i - 2.5) * 28 + (Math.random() - 0.5) * 8;
      this.scene.add(this._palm(x, WORLD.beachZ - 14 - Math.random() * 8));
    }
    for (let i = 0; i < 8; i++) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + Math.random(), 0),
        new THREE.MeshStandardMaterial({ color: 0x9a9183, flatShading: true }));
      rock.position.set((Math.random() - 0.5) * WORLD.size * 2, 0, WORLD.beachZ - 8 - Math.random() * 10);
      rock.castShadow = true; this.scene.add(rock);
    }

    // Water surface (animated), starting at the shoreline so the beach stays dry.
    const waterDepth = WORLD.size * 4;
    const waterCenterZ = this.shorelineZ + waterDepth / 2; // near edge = shorelineZ
    const waterGeo = new THREE.PlaneGeometry(WORLD.size * 4, waterDepth, 40, 40);
    this.water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({
      color: 0x2aa7d8, transparent: true, opacity: 0.6, flatShading: true, metalness: 0.35, roughness: 0.25,
      emissive: 0x0a3d52, emissiveIntensity: 0.35,
    }));
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(0, 2.5, waterCenterZ);
    this.scene.add(this.water);
    const deep = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.size * 4, waterDepth),
      new THREE.MeshStandardMaterial({ color: 0x0c5778, transparent: true, opacity: 0.5 }));
    deep.rotation.x = -Math.PI / 2; deep.position.set(0, 1.2, waterCenterZ); this.scene.add(deep);
    this._waterBase = waterGeo.attributes.position.array.slice();

    this._buildBoundary();
  }

  startLevel(index) {
    this.disposeLevel();
    const def = LEVELS[index];
    this.levelIndex = index;
    this.player = new Player(this.scene, this.economy, this._skinColor());
    this.level = new Level(this.scene, def, this.economy, this.audio, this.effects);
    // Spawn ON the dry sand (a few units in front of the beach, behind the shoreline),
    // facing the water — so the level opens on the beach, not mid-ocean.
    this.player.pos.set(0, 0.2, WORLD.beachZ + 4);
    this.player.mesh.rotation.y = 0; // face +Z (toward the water/objectives)
    this.camYaw = 0;
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
      const raw = this.controlLocked ? { x: 0, z: 0, len: 0, sprint: false } : this.input.read();
      // Camera-relative LAYER: rotate the world-fixed input by the camera yaw so
      // "forward" follows where the camera looks. Classic mode = passthrough (yaw 0 effect).
      const camMode = this.save.data.settings.camMode ?? 'camera';
      let mv = raw;
      if (camMode === 'camera' && raw.len > 0) {
        const r = rotateInput(raw.x, raw.z, this.camYaw);
        mv = { x: r.x, z: r.z, len: raw.len, sprint: raw.sprint };
      }
      this.player.update(dt, mv);
      const result = this.level.update(dt, this.player);

      this._updateCamera(dt, mv);

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

  _lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  // Player-controlled orbit handlers: drag to look (mouse/touch on the canvas), wheel to zoom.
  // Listeners live on the canvas, so DOM UI (joystick, sprint, pause, menus) — which sits
  // above the canvas — intercepts its own events and never conflicts with camera drag.
  _initCameraControls() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (!this.running || this.paused || this.controlLocked) return;
      this._dragging = true; this._dragId = e.pointerId;
      this._lastX = e.clientX; this._lastY = e.clientY;
    });
    c.addEventListener('pointermove', (e) => {
      if (!this._dragging || e.pointerId !== this._dragId) return;
      const dx = e.clientX - this._lastX, dy = e.clientY - this._lastY;
      this._lastX = e.clientX; this._lastY = e.clientY;
      const s = (this.save.data.settings.camSensitivity ?? 1) * 0.005;
      const invY = this.save.data.settings.camInvertY ? -1 : 1;
      // Classic mode keeps a FIXED world-aligned facing (no yaw orbit) so world-fixed
      // controls always match the view; only Camera mode allows free yaw look.
      if ((this.save.data.settings.camMode ?? 'camera') === 'camera') this.camYaw -= dx * s;
      this.camPitch = Math.max(this.camMinPitch, Math.min(this.camMaxPitch, this.camPitch + dy * s * invY));
      this._dragCooldown = 1.2;                               // hold this angle before auto-recenter
    });
    const end = (e) => { if (e.pointerId === this._dragId) { this._dragging = false; this._dragId = null; } };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => {
      this.camRadius = Math.max(this.camMinRadius, Math.min(this.camMaxRadius, this.camRadius + Math.sign(e.deltaY) * 2));
      e.preventDefault();
    }, { passive: false });
  }

  // Third-person ORBIT cam. Orientation is player-controlled (drag), with optional gentle
  // auto-recenter toward the movement heading when moving FORWARD and not dragging
  // (the forward-only gate avoids a strafe<->facing feedback spin in camera-relative mode).
  _updateCamera(dt, mv) {
    const tp = this.player.pos;
    if (this._dragCooldown > 0) this._dragCooldown -= dt;
    const moving = mv && mv.len > 0.12;
    const classic = (this.save.data.settings.camMode ?? 'camera') === 'classic';
    if (classic) {
      // CLASSIC: fixed world-aligned camera (always behind +Z). No auto-rotate on turns,
      // so "up on the stick = up on screen" stays consistent. Drag yaw is disabled above.
      this.camYaw = this._lerpAngle(this.camYaw, 0, Math.min(1, dt * 5));
    } else if (!this._dragging && this._dragCooldown <= 0 && moving) {
      // CAMERA: gentle auto-recenter behind the movement heading (forward-only -> no spin).
      const cf = [Math.sin(this.camYaw), Math.cos(this.camYaw)];
      const ml = Math.hypot(mv.x, mv.z) || 1;
      const fdot = (mv.x / ml) * cf[0] + (mv.z / ml) * cf[1];
      if (fdot > 0.35) this.camYaw = this._lerpAngle(this.camYaw, Math.atan2(mv.x, mv.z), Math.min(1, dt * 2));
    }
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    this._camPos.set(tp.x - fx * this.camRadius * cp, this.camBaseY + sp * this.camRadius, tp.z - fz * this.camRadius * cp);
    this.camera.position.lerp(this._camPos, Math.min(1, dt * 4));
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 2);
    }
    this.camera.lookAt(tp.x + fx * this.camAhead, 1, tp.z + fz * this.camAhead);
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
