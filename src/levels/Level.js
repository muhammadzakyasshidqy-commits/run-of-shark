// Level — builds a single level's content and runs its rules:
// collect coins -> shark(s) spawn -> reach the yellow submarine to win.
// Boss levels and the final tsunami level are handled here too.
import * as THREE from 'three';
import { WORLD } from '../config.js';
import { makeCoin, makeTreasure, makeCoral, makeBoat, makeSubmarine, makeShip, makeCar, makeLuxuryCar, makeHazard, makeDock } from '../entities/Models.js';
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
    this.tsunamiActive = false;
    this._sharkQueue = (def.sharks || []).map((s) => ({ ...s, spawned: false }));
    this.speedMult = 1 + (def.id - 1) * 0.12;

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
        addCoral(x, -40 + Math.random() * (WORLD.size + 30), i + this.def.id);
      }
    }

    // Coins / treasures
    const n = this.def.coinsToWin || 0;
    for (let i = 0; i < n; i++) {
      const isChest = i % 5 === 4;
      const m = isChest ? makeTreasure() : makeCoin();
      m.position.set((Math.random() - 0.5) * WORLD.size * 1.5, isChest ? 0.2 : 1, -30 + Math.random() * (WORLD.size + 10));
      // Higher pickup value so the core collect loop itself pays well (was 1 / 5).
      m.userData.value = isChest ? 25 : 6;
      m.userData.chest = isChest;
      this.scene.add(m);
      this.coins.push(m);
    }

    // Level 6 final prize: the special LUXURY CAR (with light beam) in place of the sub
    if (this.def.id === 6) {
      this.car = makeLuxuryCar(0xffd166);
      this.car.position.copy(this.submarine.position);
      this.car.position.y = 0.2;
      this.submarine.visible = false;
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
        this.collected += c.userData.value;
        this.economy.addCoins(c.userData.value);
        c.userData.chest ? this.audio.pickup() : this.audio.coin();
        this.effects.burst(c.position, 0xffd166, c.userData.chest ? 18 : 10);
        this.scene.remove(c);
        this.coins.splice(i, 1);
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
      }
    }

    if (!player.alive) { this.audio.lose(); return 'lose'; }

    // tsunami catches the player
    if (this.tsunamiActive && this.effects.tsunami && player.pos.z > this.effects.tsunami.position.z - 4) {
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
      if (goalDist < 3.5) { this.audio.win(); return 'win'; }
      return null;
    }

    // Dive level: win by REACHING the submarine (it then ferries you to the ship). No coin gate.
    if (goalDist < 4) { this.audio.win(); return 'win'; }
    return null;
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
    [...this.coins, ...this.corals, ...this.barriers].forEach((m) => this.scene.remove(m));
    if (this.dock) this.scene.remove(this.dock);
    this.hazards.forEach((hz) => this.scene.remove(hz.mesh));
    if (this.bossCtrl) this.bossCtrl.dispose();
    this.sharks.forEach((s) => s.dispose(this.scene));
    [this.boat, this.submarine, this.ship, this.car].forEach((m) => m && this.scene.remove(m));
    if (this.effects.tsunami) { this.scene.remove(this.effects.tsunami); this.effects.tsunami = null; }
  }
}
