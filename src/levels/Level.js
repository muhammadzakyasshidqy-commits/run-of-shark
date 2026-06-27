// Level — builds a single level's content and runs its rules:
// collect coins -> shark(s) spawn -> reach the yellow submarine to win.
// Boss levels and the final tsunami level are handled here too.
import * as THREE from 'three';
import { WORLD } from '../config.js';
import { makeCoin, makeTreasure, makeCoral, makeBoat, makeSubmarine, makeShip, makeCar, makeLuxuryCar, makeHazard, makeDock, makePowerup } from '../entities/Models.js';
import { makeSign } from '../hub/buildings.js';
import { removeAndDispose } from '../systems/dispose.js';
import { Shark } from '../entities/Shark.js';
import { BossController } from '../bosses/BossController.js';

export class Level {
  constructor(scene, def, economy, audio, effects) {
    this.scene = scene;
    this.def = def;
    this.economy = economy;
    this.audio = audio;
    this.effects = effects;

    this.coins = [];
    this.corals = [];
    this.barriers = [];       // visual wall meshes for split routes
    this.solids = [];         // collision shapes blocking the player: {type:'circle'|'box', ...}
    this.hazards = [];        // arena hazards (boss can crash into these)
    this.sharks = [];
    this.playerRadius = 0.5;
    this.collected = 0;
    this.elapsed = 0;
    // Dive levels are a CHASE from the start: you swim straight for the submarine while the
    // shark hunts you. Coins are just currency picked up along the way (not a win gate).
    this.state = def.boss && !def.tsunami ? 'boss' : 'escape';
    this.boss = null;
    this.bossCtrl = null;
    this.onBossDefeated = () => {}; // wired by Game (runs defeat cutscene then win)
    this.onCoin = () => {};         // (value, worldPos, isChest) -> juicy float text + combo (Game/UI)
    this.onPowerup = () => {};      // (type, worldPos) -> juicy pickup feedback
    this.tsunamiActive = false;
    this._sharkQueue = (def.sharks || []).map((s) => ({ ...s, spawned: false }));
    // Endless defs supply their own (bounded) speedMult; story levels derive it from the level id.
    // (Without this, an endless Depth-50 would compute a 6.9x shark speed and be impossible.)
    this.speedMult = def.speedMult ?? (1 + (def.id - 1) * 0.12);

    this._build();
  }

  _build() {
    // Wooden dock running from the beach into the water (decorative, no collision)
    this.dock = makeDock(18);
    this.dock.position.set(0, 0, WORLD.beachZ + 6);
    this.scene.add(this.dock);

    // Wooden boat moored at the shoreline (the dive ride; player boards it in the intro)
    this.boat = makeBoat();
    this.boat.position.set(0, 0.5, WORLD.beachZ + 11);
    this.scene.add(this.boat);

    // Submarine — the goal (placed deep). Split-route levels center it so both lanes converge.
    this.submarine = makeSubmarine();
    const subX = this.def.splitRoute ? 0 : (Math.random() - 0.5) * 40;
    this.submarine.position.set(subX, 0, WORLD.size - 14);
    this.scene.add(this.submarine);

    // Metal ship — the FINAL destination. Per the dive flow it must NOT be visible from the
    // start: the player first swims to the submarine, and only then is the ship revealed (the
    // submarine ferries them to it). Game._subToShip() flips this on with a pop-in.
    this.ship = makeShip();
    this.ship.position.set(40, 0, WORLD.size - 2);
    this.ship.visible = false;
    this.scene.add(this.ship);

    // Split-route divider walls (solid, blocking) + per-lane bias
    if (this.def.barriers) {
      for (const b of this.def.barriers) {
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(b.hx * 2, 3.2, b.hz * 2),
          new THREE.MeshStandardMaterial({ color: 0x3b4a59, flatShading: true, roughness: 1 })
        );
        wall.position.set(b.x, 1, b.z);
        wall.castShadow = true; wall.receiveShadow = true;
        this.scene.add(wall);
        this.barriers.push(wall);
        this.solids.push({ type: 'box', pos: { x: b.x, z: b.z }, hx: b.hx, hz: b.hz });
      }
    }

    // Spawn helpers: keep every pickup/obstacle INSIDE the player's reachable area (the player is
    // clamped to ±WORLD.size on X and [beachZ, WORLD.size] on Z) with a small margin off the wall,
    // so nothing is wasted where you can't swim.
    const M = 4;
    const inX = (x) => Math.max(-(WORLD.size - M), Math.min(WORLD.size - M, x));
    const inZ = (z) => Math.max(WORLD.beachZ + M, Math.min(WORLD.size - M, z));

    // Corals (obstacles) — now SOLID (collision r 0.75 ~ visual footprint).
    const addCoral = (x, z, seed) => {
      const c = makeCoral(seed); c.position.set(x, 0, z); c.rotation.y = Math.random() * Math.PI;
      this.scene.add(c); this.corals.push(c);
      this.solids.push({ type: 'circle', pos: c.position, r: 0.75 });
    };
    if (this.def.maze) {
      // CORAL MAZE (L3): serpentine reef WALLS across the lane, each with ONE gap that
      // alternates side — weave through while chased. Walls are cheap box colliders (perf)
      // dressed with a few coral clumps; this is L3's unique layout/mechanic, not scatter.
      const rows = 6, halfW = 44, gapHalf = 5;
      const wallMat = () => new THREE.MeshStandardMaterial({ color: 0xff7f6b, flatShading: true, roughness: 0.9 });
      for (let r = 0; r < rows; r++) {
        const z = -26 + r * 17;
        const gapCenter = (r % 2 === 0 ? -1 : 1) * 18;               // alternate gap side
        for (const seg of [[-halfW, gapCenter - gapHalf], [gapCenter + gapHalf, halfW]]) {
          const x0 = seg[0], x1 = seg[1]; if (x1 - x0 < 1) continue;
          const cx = (x0 + x1) / 2, hx = (x1 - x0) / 2;
          const wall = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, 2.4, 2.4), wallMat());
          wall.position.set(cx, 1, z); wall.castShadow = true; wall.receiveShadow = true;
          this.scene.add(wall); this.barriers.push(wall);
          this.solids.push({ type: 'box', pos: { x: cx, z }, hx, hz: 1.2 });
          // a few coral clumps perched on the wall for looks (sparse — perf-safe)
          for (let k = 0; k < Math.min(4, Math.floor(hx / 6)); k++) addCoral(x0 + 3 + k * (hx * 2 / 4), z, r * 5 + k);
        }
      }
    } else {
      const coralCount = this.def.corals || 0;
      for (let i = 0; i < coralCount; i++) {
        // split-route levels push corals into the RIGHT lane (the "slow but safe" path)
        const x = this.def.splitRoute ? 6 + Math.random() * (WORLD.size * 0.8) : (Math.random() - 0.5) * WORLD.size * 1.6;
        addCoral(inX(x), inZ(-40 + Math.random() * (WORLD.size + 30)), i + this.def.id);
      }
    }

    // Coins / treasures — spread across a REACHABLE band and clamped inside the player's bounds
    // (the player is clamped to ±WORLD.size, so every pickup must land within that, with a margin
    // off the wall — otherwise items would be wasted in places you can't swim to).
    const n = this.def.coinsToWin || 0;
    for (let i = 0; i < n; i++) {
      const isChest = i % 5 === 4;
      const m = isChest ? makeTreasure() : makeCoin();
      m.position.set(inX((Math.random() - 0.5) * WORLD.size * 1.2), isChest ? 0.2 : 1, inZ(-30 + Math.random() * (WORLD.size + 10)));
      // Higher pickup value so the core collect loop itself pays well (was 1 / 5).
      m.userData.value = isChest ? 25 : 6;
      m.userData.chest = isChest;
      this.scene.add(m);
      this.coins.push(m);
    }

    // POWER-UPS — a few float in the dive (magnet / shield / speed). Rate is deliberately modest:
    // ~1 guaranteed per dive + a 45% chance of a 2nd, so they feel special, not trivial. (Boss/
    // tsunami finales skip them — those are scripted set-pieces.) Disposed with the level.
    this.powerups = [];
    if (!this.def.boss && !this.def.tsunami) {
      const TYPES = ['magnet', 'shield', 'speed'];
      const count = 1 + (Math.random() < 0.45 ? 1 : 0);
      for (let i = 0; i < count; i++) {
        const type = TYPES[Math.floor(Math.random() * TYPES.length)];
        const pu = makePowerup(type);
        pu.position.set(inX((Math.random() - 0.5) * WORLD.size * 1.1), 1.2, inZ(5 + Math.random() * (WORLD.size - 40)));
        pu.userData.bob = Math.random() * 6;
        this.scene.add(pu); this.powerups.push(pu);
      }
    }

    // Level 6 final prize: the player swims AWAY from the tsunami toward a DRY FAR SHORE — a real
    // sandy beach rising out of the sea with a CITY skyline behind it (the escape destination).
    // The LUXURY CAR waits ON THE SAND (logical), not floating in the sea.
    if (this.def.id === 6) {
      this.submarine.visible = false;
      const goalZ = WORLD.size - 14;
      const shoreY = 4.6;                          // sand surface sits ABOVE the water (y=2.5)
      // remember the dry-shore surface so the player WALKS (not swims) once they reach the beach
      this._shoreY = shoreY; this._shoreFrontZ = goalZ - 3;
      // big dry beach landmass rising out of the water at the escape end — LONG (extends far +Z)
      // so the getaway car has a road of sand to drive on, all the way INTO the city.
      const shore = new THREE.Mesh(new THREE.BoxGeometry(WORLD.size * 2.4, 9, 280),
        new THREE.MeshStandardMaterial({ color: 0xf2e2b8, flatShading: true, roughness: 1 }));
      shore.position.set(0, shoreY - 4.5, goalZ + 134); shore.receiveShadow = true; this.scene.add(shore); this.barriers.push(shore);
      const wet = new THREE.Mesh(new THREE.BoxGeometry(WORLD.size * 2.4, 9.04, 10),
        new THREE.MeshStandardMaterial({ color: 0xe6c684, flatShading: true }));
      wet.position.set(0, shoreY - 4.52, goalZ - 2); this.scene.add(wet); this.barriers.push(wet);
      // a dark "road" strip the car drives down, leading from the shore into the city
      const road = new THREE.Mesh(new THREE.BoxGeometry(9, 9.05, 150), new THREE.MeshStandardMaterial({ color: 0x3a3f47, flatShading: true }));
      road.position.set(0, shoreY - 4.5, goalZ + 80); this.scene.add(road); this.barriers.push(road);
      // CITY skyline silhouettes inland (+Z) — the place the getaway car races to
      this._city = new THREE.Group();
      for (let i = 0; i < 18; i++) {
        const w = 5 + (i * 37 % 6), hh = 16 + (i * 53 % 30), side = i % 2 ? 1 : -1;
        const bldg = new THREE.Mesh(new THREE.BoxGeometry(w, hh, w),
          new THREE.MeshStandardMaterial({ color: 0x394a63, flatShading: true, emissive: 0x0a1422 }));
        bldg.position.set(side * (10 + (i * 13 % 46)), shoreY + hh / 2, goalZ + 95 + (i * 29 % 56)); this._city.add(bldg);
        const lit = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, hh * 0.92, w * 0.92),
          new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.12 }));
        lit.position.copy(bldg.position); this._city.add(lit);
      }
      this.scene.add(this._city);
      // The getaway car parked on the sand at the shore, facing the city (+Z) — the escape route.
      // The player arrives from the sea (-Z) behind it; the ending cutscene drives it into the city.
      this.car = makeLuxuryCar(0xffd166);
      this.car.scale.setScalar(2.2);
      this.car.rotation.y = 0;                     // front = +Z (toward the city escape route)
      this.car.position.set(0, shoreY + 0.1, goalZ + 6);
      this.submarine.position.set(0, 0, goalZ);   // keep the goal-distance math centred on the shore
      // BOLD beacon stack so the shore/car is unmistakable from across the water
      const beamCol = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.6, 46, 16, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
      beamCol.position.set(0, shoreY + 23, goalZ + 2); this.scene.add(beamCol); this.barriers.push(beamCol);
      const beacon = new THREE.Mesh(new THREE.TorusGeometry(9, 0.5, 8, 28),
        new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffaa00, emissiveIntensity: 1, flatShading: true }));
      beacon.rotation.x = -Math.PI / 2; beacon.position.set(0, shoreY + 0.1, goalZ + 2); this.scene.add(beacon); this.barriers.push(beacon);
      this._goalBeacon = beacon;
      const sign = makeSign('🚗 ESCAPE CAR', 8, '#1a1205', '#ffd166'); sign.position.set(0, shoreY + 14, goalZ);
      sign.rotation.y = Math.PI; sign.material.side = THREE.DoubleSide;   // face the player swimming in from -Z
      this.scene.add(sign); this.barriers.push(sign);
      this._goalSign = sign;
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3, 5),
        new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xff8800, emissiveIntensity: 1, flatShading: true }));
      arrow.rotation.x = Math.PI; arrow.position.set(0, shoreY + 9.5, goalZ); this.scene.add(arrow); this.barriers.push(arrow);
      this._goalArrow = arrow;
      this.scene.add(this.car);
    }

    // Boss arena hazards (sharp rocks) — only the bait-able hit points in the fight.
    if (this.def.hazards) {
      const ring = this.def.hazards;
      for (let i = 0; i < ring; i++) {
        const a = (i / ring) * Math.PI * 2;
        const r = 34 + (i % 2) * 14;
        const hz = makeHazard(i * 1.3);
        hz.position.set(Math.cos(a) * r, 0, (WORLD.size - 40) + Math.sin(a) * r * 0.7);
        this.scene.add(hz);
        this.hazards.push({ mesh: hz, pos: hz.position, radius: 3.2 });
      }
    }

    // Immediate boss spawn for boss levels
    if (this.def.boss) {
      this.boss = new Shark(this.scene, this.def.boss, this.speedMult);
      if (this.def.bossHp) this.boss.setMaxHp(this.def.bossHp);
      this.sharks.push(this.boss);
      this.state = this.def.tsunami ? 'escape' : 'boss';

      // Hazard-based boss fight (Level 5: boss, no tsunami).
      if (!this.def.tsunami && this.hazards.length) {
        this.boss.pos.set(0, -0.4, WORLD.size - 30);
        this.bossCtrl = new BossController({
          scene: this.scene, boss: this.boss, hazards: this.hazards,
          effects: this.effects, audio: this.audio,
        });
        this.bossCtrl.onDefeated = () => this.onBossDefeated();
      }
    }
    if (this.def.tsunami) this._startTsunami();
  }

  _startTsunami() {
    this.tsunamiActive = true;
    this.effects.spawnTsunami();
    this.audio.tsunami();
  }

  _spawnShark(typeKey) {
    const s = new Shark(this.scene, typeKey, this.speedMult);
    s.onRoar = () => this.audio.sharkRoar();
    s.onCharge = () => this.audio.charge();
    if (this.def.splitRoute && this.sharks.filter((x) => !x.isBoss).length === 0) {
      // Split-route bias: the first shark patrols the LEFT lane (risky/fast path).
      s.pos.set(-WORLD.size * 0.35, -0.4, WORLD.size - 20);
    } else if (!s.isBoss) {
      // Dive levels: spawn BEHIND the diver (near the drop point) so it chases from behind
      // toward the submarine, instead of lurking at the goal.
      s.pos.set((Math.random() - 0.5) * 24, -0.5, WORLD.beachZ + 22);
    }
    this.sharks.push(s);
    if (this.boss === null && (typeKey === 'boss' || typeKey === 'kraken')) this.boss = s;
  }

  // Solid-body collision: keep the player out of corals (circles) and walls (boxes).
  // Effect = SOLID BLOCKING (no pass-through). Chosen over damage/stagger because corals
  // are static terrain; blocking gives predictable, fair routing without stacking punishment
  // on top of the shark chase. Resolves by pushing the player to the obstacle's surface.
  resolveCollisions(player) {
    const pr = this.playerRadius;
    for (const s of this.solids) {
      if (s.type === 'circle') {
        const dx = player.pos.x - s.pos.x, dz = player.pos.z - s.pos.z;
        const d = Math.hypot(dx, dz);
        const min = s.r + pr;
        if (d < min) {
          if (d > 1e-4) { player.pos.x = s.pos.x + (dx / d) * min; player.pos.z = s.pos.z + (dz / d) * min; }
          else { player.pos.x = s.pos.x + min; }
        }
      } else { // box (AABB) — push out along nearest face
        const nx = Math.max(s.pos.x - s.hx, Math.min(player.pos.x, s.pos.x + s.hx));
        const nz = Math.max(s.pos.z - s.hz, Math.min(player.pos.z, s.pos.z + s.hz));
        const dx = player.pos.x - nx, dz = player.pos.z - nz;
        const d = Math.hypot(dx, dz);
        if (d > 1e-4) {
          if (d < pr) { player.pos.x = nx + (dx / d) * pr; player.pos.z = nz + (dz / d) * pr; }
        } else {
          // center inside the box: eject along the shallowest axis
          const left = player.pos.x - (s.pos.x - s.hx), right = (s.pos.x + s.hx) - player.pos.x;
          const top = player.pos.z - (s.pos.z - s.hz), bot = (s.pos.z + s.hz) - player.pos.z;
          const m = Math.min(left, right, top, bot);
          if (m === left) player.pos.x = s.pos.x - s.hx - pr;
          else if (m === right) player.pos.x = s.pos.x + s.hx + pr;
          else if (m === top) player.pos.z = s.pos.z - s.hz - pr;
          else player.pos.z = s.pos.z + s.hz + pr;
        }
      }
    }
  }

  // Returns one of: null, 'win', 'lose'
  update(dt, player) {
    this.elapsed += dt;

    // keep the player out of solid obstacles (corals + split-route walls)
    if (this.solids.length) this.resolveCollisions(player);

    // animate goal markers
    this.submarine.userData.ring.rotation.z += dt;
    this.coins.forEach((c) => { if (c.userData.spin) c.rotation.z += dt * 3; c.position.y += Math.sin(this.elapsed * 3 + c.id) * 0.002; });

    // queued shark spawns — short delays so the chase starts right after the dive
    for (const q of this._sharkQueue) {
      if (!q.spawned && this.elapsed >= q.delay) { q.spawned = true; this._spawnShark(q.type); this.audio.sharkRoar(); }
    }

    // coin pickup + magnet
    const pr = player.magnetRadius;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      const d = Math.hypot(c.position.x - player.pos.x, c.position.z - player.pos.z);
      if (d < pr) {
        c.position.x += (player.pos.x - c.position.x) * Math.min(1, dt * 6);
        c.position.z += (player.pos.z - c.position.z) * Math.min(1, dt * 6);
      }
      if (d < 1.2) {
        // accessory coinMult (crown / backpack / pirate hat) raises every coin's payout
        const val = Math.round(c.userData.value * this.economy.coinMultiplier());
        this.collected += val;
        // ENDLESS: hold the run's coins and pay them out ONLY on WIN (so dying mid-level then
        // restarting can't farm pickups). Story levels bank coins immediately as before.
        if (!this.def.endless) this.economy.addCoins(val);
        c.userData.chest ? this.audio.pickup() : this.audio.coin();
        this.effects.burst(c.position, 0xffd166, c.userData.chest ? 18 : 10);
        this.onCoin(val, c.position, !!c.userData.chest);     // juicy float "+N" + combo
        removeAndDispose(this.scene, c);
        this.coins.splice(i, 1);
      }
    }

    // power-up animation (spin + bob) + pickup
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const pu = this.powerups[i];
      pu.rotation.y += dt * 2; pu.position.y = 1.2 + Math.sin(this.elapsed * 2.5 + pu.userData.bob) * 0.25;
      if (Math.hypot(pu.position.x - player.pos.x, pu.position.z - player.pos.z) < 1.4) {
        player.givePower(pu.userData.power);
        this.audio.pickup();
        this.effects.burst(pu.position, pu.userData.power === 'shield' ? 0x2ec4ff : pu.userData.power === 'speed' ? 0xf1c40f : 0xe74c3c, 16);
        this.onPowerup(pu.userData.power, pu.position);
        removeAndDispose(this.scene, pu);
        this.powerups.splice(i, 1);
      }
    }

    // hazard-based boss fight drives its own boss movement, telegraphs, and damage
    if (this.bossCtrl) this.bossCtrl.update(dt, player);

    // regular sharks update + collision (the controlled boss is skipped here)
    for (const s of this.sharks) {
      if (this.bossCtrl && s === this.boss) continue;
      s.update(dt, player.pos);
      if (s.active && s.distanceTo(player.pos) < (s.isBoss ? 2.4 * s.def.scale : 1.6 * s.def.scale)) {
        if (player.damage(1)) { this.audio.hit(); this.effects.burst(player.pos, 0xff2d2d, 14); }
        else if (player._shieldBroke) { player._shieldBroke = false; this.audio.pickup(); this.effects.burst(player.pos, 0x2ec4ff, 20); } // SHIELD absorbed a hit
      }
    }

    if (!player.alive) { this.audio.lose(); return 'lose'; }

    // tsunami (surging from BEHIND, -Z) catches the player if its crest reaches them
    if (this.tsunamiActive && this.effects.tsunami && player.pos.z < this.effects.tsunami.position.z + 6) {
      player.alive = false; this.audio.lose(); return 'lose';
    }

    // WIN conditions
    const goal = this.car || this.submarine;
    const goalDist = Math.hypot(goal.position.x - player.pos.x, goal.position.z - player.pos.z);

    if (this.def.boss && !this.def.tsunami) {
      // Boss is defeated ONLY when its HP reaches 0 via hazard crashes (BossController).
      // Win is triggered through the onBossDefeated cutscene callback, not from here.
      // No survive-timer: the player must land real hits.
      return null;
    }

    if (this.def.tsunami) {
      // trigger at the WATER'S EDGE (car sits a little up the dry beach) so the diver reaches the
      // shore from the sea and the cutscene takes over before they'd clip into the sand.
      if (goalDist < 9) { this.audio.win(); return 'win'; }
      return null;
    }

    // Dive level: win by REACHING the submarine (it then ferries you to the ship). No coin gate.
    if (goalDist < 4) { this.audio.win(); return 'win'; }
    return null;
  }

  // Dry-land stand height at (x,z), or null if that spot is open water. Player uses this to WALK
  // (standing) on solid ground instead of swimming in midair. (Levels 1-5 are all water → null;
  // Level 6 has the far DRY SHORE; the START beach behind the shoreline is dry too.)
  landBaseY(x, z) {
    if (this._shoreY != null && z >= this._shoreFrontZ) return this._shoreY + 0.15;  // L6 far beach
    if (z <= WORLD.beachZ + 12) return 0.2;                                           // start beach (behind shoreline)
    return null;                                                                      // open water
  }

  get objectiveText() {
    if (this.def.boss && !this.def.tsunami) {
      if (this.bossCtrl && this.bossCtrl.state === 'telegraph') return '⚠ Attack incoming — DODGE!';
      return 'Bait the boss into the SHARP ROCKS!';
    }
    if (this.def.tsunami) return 'Reach the LUXURY CAR — RUN!';
    return '🦈 SWIM! Reach the submarine — the shark is chasing!';
  }

  dispose() {
    [...this.coins, ...this.corals, ...this.barriers, ...(this.powerups || [])].forEach((m) => removeAndDispose(this.scene, m));
    removeAndDispose(this.scene, this.dock);
    this.hazards.forEach((hz) => removeAndDispose(this.scene, hz.mesh));
    if (this.bossCtrl) this.bossCtrl.dispose();
    this.sharks.forEach((s) => s.dispose(this.scene));
    [this.boat, this.submarine, this.ship, this.car, this._city].forEach((m) => removeAndDispose(this.scene, m));
    if (this.effects.tsunami) { removeAndDispose(this.scene, this.effects.tsunami); this.effects.tsunami = null; }
  }
}
