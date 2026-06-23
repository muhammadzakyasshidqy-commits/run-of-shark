// Game — owns the Three.js scene, render loop, camera, and the active Level.
// The UI layer drives it via startLevel(); Game reports results via callbacks.
import * as THREE from 'three';
import { WORLD, LEVELS } from './config.js';
import { Player } from './entities/Player.js';
import { Level } from './levels/Level.js';
import { Hub } from './hub/Hub.js';
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
    // Fully-automatic chase cam: always smooth-follows behind the player's heading.
    // No manual look/zoom — one joystick is all the player touches.
    this.camAhead = 6;
    this.camRadius = 22;          // 3D distance player->camera
    this.camBaseY = 1;
    this.camYaw = 0;              // auto-followed heading
    this.camPitch = 0.66;         // fixed elevation (~14 up at radius 22)
    this._camPos = new THREE.Vector3();

    this._buildEnvironment();
    this.effects = new Effects(this.scene);

    this.clock = new THREE.Clock();
    this.running = false;
    this.paused = false;
    this.mode = 'menu';        // 'menu' | 'hub' | 'level'
    this.level = null;
    this.hub = null;
    this.player = null;
    this.shake = 0;
    this.onHubTrigger = () => {}; // (panelId) -> UI opens the matching panel

    this.controlLocked = false;
    this.cinematic = null;     // function(dt) -> done:boolean, drives cutscene camera
    this.onWin = () => {};
    this.onLose = () => {};
    this.onHud = () => {};
    this.onCine = () => {};     // ({title, sub}) or null — UI shows/hides the cinematic banner
    this.onFlash = () => {};    // brief white screen flash (UI), used on big hits/victories

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
    this.deepWater = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.size * 4, waterDepth),
      new THREE.MeshStandardMaterial({ color: 0x0c5778, transparent: true, opacity: 0.5 }));
    this.deepWater.rotation.x = -Math.PI / 2; this.deepWater.position.set(0, 1.2, waterCenterZ); this.scene.add(this.deepWater);
    this._waterBase = waterGeo.attributes.position.array.slice();

    this._buildBoundary();
  }

  _setWater(visible) {
    if (this.water) this.water.visible = visible;
    if (this.deepWater) this.deepWater.visible = visible;
    if (this.effects?.bubbles) this.effects.bubbles.visible = visible;
  }

  // Enter the walkable island hub (reuses Player + chase camera + camera-relative input).
  enterHub() {
    this.disposeLevel();
    this.mode = 'hub';
    this._setWater(false);             // dry island look
    this.player = new Player(this.scene, this.economy, this._skinColor());
    this.hub = new Hub(this.scene, this.economy, this.save);
    this.player.pos.set(this.hub.spawn.x, 0.2, this.hub.spawn.z);
    this.player.mesh.rotation.y = Math.PI; // face the island interior
    this.camYaw = Math.PI;
    this._committedHeading = null; this._lastRawAngle = null;
    this.running = true; this.paused = false; this.controlLocked = false; this.cinematic = null;
    this.audio.startMusic();
    this.audio.startAmbient();          // island wave ambience
    this.input.setTouchVisible(true);
  }

  startLevel(index) {
    this.disposeLevel();
    this.mode = 'level';
    this.audio.stopAmbient();
    this._committedHeading = null; this._lastRawAngle = null;
    this._setWater(true);
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
    } else if (!this.level.def.tsunami) {
      // Dive levels (1-4): ride the wooden boat out, then dive in and start swimming.
      this._diveIntro();
    }
  }

  // --- Win feedback: player reaches the submarine -> it surfaces and ferries them to the
  // metal ship (the level goal), then onWin(). Makes the submarine->ship link explicit.
  _subToShip() {
    this.controlLocked = true;
    const sub = this.level.submarine, ship = this.level.ship;
    this.player.mesh.visible = false;            // "boards" the submarine
    this.effects.burst(sub.position, 0x9fd8ff, 18);
    this.audio.win();
    // Reveal the destination ship now (it was hidden during the dive) with a quick pop-in.
    ship.visible = true; ship.scale.setScalar(0.01);
    this.effects.burst(ship.position, 0xeceff1, 16);
    this.onCine({ title: 'ESCAPED!', sub: 'The submarine carries you to the ship…' });
    const start = sub.position.clone();
    const dest = new THREE.Vector3(ship.position.x, 1.2, ship.position.z - 4);
    const dur = 2.8; let t = 0;
    this.cinematic = (dt) => {
      t += dt; const k = Math.min(1, t / dur);
      ship.scale.setScalar(Math.min(1, k * 2));  // ship grows in over the first half
      sub.position.lerpVectors(start, dest, k);  // sub travels to the ship
      sub.position.y = 0.2 + Math.sin(k * Math.PI) * 1.2; // surface arc
      const cam = new THREE.Vector3(sub.position.x - 10, 7, sub.position.z - 12);
      this.camera.position.lerp(cam, Math.min(1, dt * 3));
      this.camera.lookAt(ship.position.x, 3, ship.position.z);
      if (t >= dur) {
        this.onCine(null); this.cinematic = null; this.running = false;
        this.onWin(this.levelIndex);
        return true;
      }
      return false;
    };
  }

  // --- Dive intro: player rides the wooden boat from the dock out to the drop point,
  // then dives in. Short but felt; control + shark chase begin after the splash.
  _diveIntro() {
    this.controlLocked = true;
    const boat = this.level.boat;
    const startZ = boat.position.z, divePoint = this.shorelineZ + 16;
    // sit the player on the boat
    this.player.pos.set(boat.position.x, boat.position.y + 0.6, boat.position.z);
    this.player.mesh.visible = true;
    this.onCine({ title: 'DIVE!', sub: 'Reach the submarine — the shark hunts you' });
    const dur = 2.6; let t = 0; let dived = false;
    this.cinematic = (dt) => {
      t += dt; const k = Math.min(1, t / 1.7);
      // boat motors out to the drop point with the player aboard
      const z = startZ + (divePoint - startZ) * k;
      boat.position.z = z; this.player.pos.z = z; this.player.pos.x = boat.position.x;
      this.player.pos.y = boat.position.y + 0.6;
      if (k >= 1 && !dived) { dived = true; this.effects.burst(this.player.pos, 0x9fd8ff, 16); this.audio.pickup(); }
      if (dived) this.player.pos.y = 0.2; // splashed into the water
      // chase-style camera behind the boat
      this.camYaw = 0;
      this.camera.position.lerp(new THREE.Vector3(boat.position.x, this.camHeight, z - this.camRadius), Math.min(1, dt * 3));
      this.camera.lookAt(boat.position.x, 1, z + this.camAhead);
      if (t >= dur) {
        this.onCine(null); this.cinematic = null; this.controlLocked = false;
        this.player.pos.set(boat.position.x, 0.2, divePoint); // begin swim here (numeric divePoint)
        return true;
      }
      return false;
    };
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

  // --- Boss defeat cutscene: victory flash + burst, boss sinks + text, then win ---
  _bossDefeat() {
    this.controlLocked = true;
    const boss = this.level.boss;
    this.audio.win();
    this.shake = 1.0;                                   // impact shake
    this.onFlash && this.onFlash();                    // white screen flash (UI)
    // celebratory particle bursts around the boss
    for (let i = 0; i < 5; i++) this.effects.burst(boss.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6)), 0xffd166, 16);
    this.effects.ring(boss.pos, 0xffffff, 16, 0.6);
    this.onCine({ title: '🏆 BOSS DEFEATED!', sub: '' });
    const dur = 3.2; let t = 0; let bursts = 0;
    this.cinematic = (dt) => {
      t += dt;
      if (t > bursts * 0.4 && bursts < 6) { this.effects.burst(boss.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 5, (Math.random() - 0.5) * 8)), [0xffd166, 0x06d6a0, 0x2ec4ff][bursts % 3], 14); bursts++; }
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

  // --- Level 6 finale: player reaches the LUXURY CAR -> 3D escape from the tsunami.
  // Car (with player aboard) floors it toward the beach (-Z); the tsunami wall surges
  // after it; chase camera follows. On escape -> onWin() -> UI ending text + credits.
  _escapeCutscene() {
    this.controlLocked = true;
    const car = this.level.car;
    const tsunami = this.effects.tsunami;
    // "get in the car": hide the diver, sit the car where the player reached it
    this.player.mesh.visible = false;
    car.position.x = this.player.pos.x; car.position.z = this.player.pos.z; car.position.y = 0.2;
    car.rotation.y = Math.PI; // face -Z (the escape direction)
    if (tsunami) { tsunami.position.z = car.position.z + 26; } // wave looming just behind
    this.audio.tsunami();
    this.onCine({ title: '🌊 DRIVE!', sub: 'Outrun the tsunami!' });
    const dur = 4.2; let t = 0; let shook = 0;
    this.cinematic = (dt) => {
      t += dt;
      const carSpeed = 24 + t * 6;              // accelerate away
      car.position.z -= carSpeed * dt;          // flee toward the beach (-Z)
      car.position.x += Math.sin(t * 4) * dt * 1.5; // slight swerve for drama
      if (tsunami) {                            // wave chases, a touch slower so the car wins
        tsunami.position.z -= (carSpeed - 3) * dt;
        tsunami.material.color.offsetHSL(0, 0, Math.sin(t * 12) * 0.01);
      }
      this.effects.update(dt * 0.0, this.clock.elapsedTime);
      if (t > shook * 0.25) { shook++; this.shake = Math.max(this.shake, 0.35); } // rumble
      // chase camera behind + above the car, looking ahead and back at the wave
      const behind = new THREE.Vector3(car.position.x - 2, 7, car.position.z + 15);
      this.camera.position.lerp(behind, Math.min(1, dt * 3));
      if (this.shake > 0) { this.camera.position.x += (Math.random() - 0.5) * this.shake; this.camera.position.y += (Math.random() - 0.5) * this.shake; this.shake = Math.max(0, this.shake - dt * 1.5); }
      this.camera.lookAt(car.position.x, 1.2, car.position.z - 6);
      if (t >= dur) {
        this.onCine(null);
        this.cinematic = null;
        this.running = false;
        this.onWin(this.levelIndex); // -> UI._win -> _ending() text + credits
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

  // Live-apply equipped skin colour + accessory to the standing player (no scene reload).
  refreshPlayerAppearance() {
    if (this.player) this.player.applyAppearance(this._skinColor(), this.save.data.equippedAccessory);
  }

  disposeLevel() {
    if (this.level) { this.level.dispose(); this.level = null; }
    if (this.hub) { this.hub.dispose(); this.hub = null; }
    if (this.player) { this.player.dispose(this.scene); this.player = null; }
  }

  // Called by the UI when a hub panel closes — resume walking and step out of the zone.
  resumeHub() {
    if (this.mode !== 'hub') return;
    this.paused = false;
    if (this.hub && this.player) this.hub.ejectFromZones(this.player);
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

    if (this.running && !this.paused && this.player && (this.level || this.hub)) {
      const raw = this.controlLocked ? { x: 0, z: 0, len: 0, sprint: false } : this.input.read();
      // Camera-relative movement WITHOUT the old feedback spin.
      // Why the old code spun: rotateInput(raw, camYaw) yields world heading (a + camYaw);
      // the camera then chased that heading, so camYaw kept gaining 'a' every frame forever.
      // (Camera-relative + auto-follow-heading + steady-stick can never settle — the +a offset
      //  has no fixed point for a != 0.) Fix: SNAPSHOT a world heading relative to the camera
      // only when the stick DIRECTION changes, then lock it while the stick is held. So it's
      // still camera-relative (responds to where the camera looks at press time) but the held
      // heading no longer depends on camYaw, so it stops drifting.
      let mv = raw;
      if (raw.len > 0) {
        const rawAngle = Math.atan2(raw.x, raw.z);
        if (this._committedHeading == null || this._lastRawAngle == null ||
            Math.abs(this._angleDelta(this._lastRawAngle, rawAngle)) > 0.04) {
          const r = rotateInput(raw.x, raw.z, this.camYaw); // camera-relative snapshot
          this._committedHeading = Math.atan2(r.x, r.z);
          this._lastRawAngle = rawAngle;
        }
        const ch = this._committedHeading;
        mv = { x: Math.sin(ch) * raw.len, z: Math.cos(ch) * raw.len, len: raw.len, sprint: raw.sprint };
      } else {
        this._committedHeading = null; this._lastRawAngle = null; // re-snapshot on next press
      }
      this.player.update(dt, mv, this.mode);
      this._updateCamera(dt, raw.len > 0.12);

      if (this.hub) {
        const panel = this.hub.update(dt, this.player);
        this.onHud({ hub: true, coins: this.economy.s.coins, objective: 'Walk into an area to enter it' });
        if (panel) { this.paused = true; this.onHubTrigger(panel); }
      } else {
        const result = this.level.update(dt, this.player);
        if (this.player.invuln > 1.1) this.shake = 0.6;
        this.onHud({
          coins: this.economy.s.coins,
          objective: this.level.objectiveText,
          stamina: this.player.stamina / this.player.maxStamina,
          hp: this.player.hp, maxHp: this.player.maxHp,
          danger: this._nearestSharkDist() < 8,
          boss: this.level.boss && this.level.boss.active ? this.level.boss.hp / this.level.boss.maxHp : null,
        });
        if (result === 'win') {
          if (this.level.def.tsunami && this.level.car) this._escapeCutscene();   // final escape
          else this._subToShip();                                                 // dive level: sub -> ship
        }
        else if (result === 'lose') { this.running = false; this.shake = 1.2; this.onLose(this.levelIndex); }
      }
    } else {
      // idle menu camera orbit
      this.camera.position.set(Math.sin(t * 0.1) * 50, 30, -60 + Math.cos(t * 0.1) * 20);
      this.camera.lookAt(0, 0, 20);
    }

    this.renderer.render(this.scene, this.camera);
  }

  _lerpAngle(a, b, t) {
    return a + this._angleDelta(a, b) * t;
  }

  _angleDelta(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  // The ONE camera behaviour: smoothly trail behind the player's DECIDED heading
  // (player.mesh.rotation.y — already smoothed inside Player.update). Chasing that stable
  // value, not the freshly-rotated input, is what kills the old self-referential drift:
  // with input held constant the player heading settles, so camYaw settles too. No drag,
  // no zoom, no modes — the player only ever touches the joystick.
  _updateCamera(dt, moving) {
    // Control options (Settings): camera distance + whether the camera auto-rotates to follow
    // the player's heading. Defaults (medium distance, follow ON) reproduce the original feel.
    const s = (this.save && this.save.data && this.save.data.settings) || {};
    const distMul = s.cameraDistance === 'near' ? 0.72 : s.cameraDistance === 'far' ? 1.4 : 1;
    const radius = this.camRadius * distMul;
    const follow = s.cameraFollow !== false;
    const tp = this.player.pos;
    if (moving && follow) {
      this.camYaw = this._lerpAngle(this.camYaw, this.player.mesh.rotation.y, Math.min(1, dt * 2.5));
    }
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    this._camPos.set(tp.x - fx * radius * cp, this.camBaseY + sp * radius, tp.z - fz * radius * cp);
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
