// UI — all DOM screens: menu, levels, shop, bank, garage, inventory, settings,
// achievements, daily reward, lucky wheel, HUD, win/lose, and the ending cinematic.
import { LEVELS, UPGRADES, SKINS, ACCESSORIES, VEHICLES, ACHIEVEMENTS, WHEEL_PRIZES } from '../config.js';
import { dailyStatus, claimDaily } from '../economy/daily.js';
import { saveSupabaseConfig, resolveSupabaseConfig } from '../save/supabaseConfig.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export class UI {
  constructor({ root, game, economy, save, audio, ads, cloud }) {
    this.root = root; this.game = game; this.economy = economy;
    this.save = save; this.audio = audio; this.ads = ads; this.cloud = cloud;
    this.screens = {};
    // ?debug=1 unlocks all levels in the select screen for testing ONLY.
    // It does NOT touch saved progression — normal players still unlock in order.
    this.debugUnlock = new URLSearchParams(location.search).get('debug') === '1';
    this._buildHud();
    this._buildFade();
    economy.onChange = () => this._refreshChips();
    economy.onAchievement = (a) => this.toast(`🏆 ${a.name} unlocked!`);
    game.onHud = (s) => this._updateHud(s);
    game.onWin = (i) => this._win(i);
    game.onLose = (i) => this._lose(i);
    game.onCine = (data) => this._cine(data);
    game.onHubTrigger = (panel) => this._openHubPanel(panel);
    game.onFlash = () => this._flash();
    this.showMenu();
  }

  // ---------- helpers ----------
  clear() { [...this.root.querySelectorAll('.screen')].forEach((s) => s.remove()); }
  open(builder) { this.clear(); const s = builder(); this.root.appendChild(s); return s; }
  btn(label, cls, fn) { const b = h('button', `btn ${cls || ''}`, label); b.onclick = () => { this.audio.click(); fn(); }; return b; }
  // Back button: when a panel was opened by walking into a hub zone, "Back" returns to
  // the island (resume walking) instead of the main menu.
  back(fn) {
    if (!fn && this.game.mode === 'hub' && this.game.paused) return this.btn('◀ Back', 'ghost small', () => this._closeHubPanel());
    return this.btn('◀ Back', 'ghost small', fn || (() => this.showMenu()));
  }

  // ---------- HUB navigation ----------
  enterIsland() {
    this.clear(); this.showHud(true);
    this.audio.unlock();
    this.fade(true, () => { this.game.enterHub(); this.fade(false); });
    if (!matchMedia('(hover: none), (pointer: coarse)').matches) {
      setTimeout(() => this.toast('⌨ WASD / Arrows to move · walk into a building to enter'), 700);
    } else {
      setTimeout(() => this.toast('Joystick to move · walk into a building to enter'), 700);
    }
  }
  returnToHub() { this.clear(); this.showHud(true); this.game.enterHub(); }
  _openHubPanel(panel) {
    this.showHud(false);
    if (panel && panel.startsWith('veh:')) return this.showVehicle(panel.slice(4)); // garage showroom car
    // Each physical zone opens ONE category (no tab bar). Vehicles live only in the garage.
    const map = {
      bank: () => this.showBank(), wheel: () => this.showWheel(), levels: () => this.showLevels(),
      skins: () => this.showShop('skins', true), accessories: () => this.showShop('accessories', true), upgrades: () => this.showShop('upgrades', true),
    };
    (map[panel] || (() => this.returnToHub()))();
  }

  // Per-car panel shown when the player walks up to a showroom vehicle in the garage.
  showVehicle(id) {
    const v = VEHICLES.find((x) => x.id === id);
    this.open(() => {
      const s = h('div', 'screen'); const card = h('div', 'card');
      const owned = this.economy.s.ownedVehicles.includes(id);
      card.appendChild(h('h2', 'head', `🚗 ${v ? v.name : 'Vehicle'}`));
      card.appendChild(h('div', 'subtitle', owned ? 'You own this vehicle.' : `Price: 🪙 ${v.cost}`));
      card.appendChild(h('div', 'chip coin-chip', `🪙 ${this.economy.s.coins}`));
      const r = h('div', 'row');
      if (owned) r.appendChild(h('div', 'btn green small', '✓ Owned'));
      else r.appendChild(this.btn(`Buy (🪙 ${v.cost})`, 'gold', () => {
        if (this.economy.buyVehicle(id)) { this.game.hub?.markVehicleOwned(id); this.toast(`${v.name} bought!`); this.showVehicle(id); }
        else this.toast('Not enough coins');
      }));
      card.appendChild(r);
      card.appendChild(h('div', 'row', '')); card.appendChild(this.back());
      s.appendChild(card); return s;
    });
  }
  _closeHubPanel() { this.clear(); this.showHud(true); this.game.resumeHub(); }

  toast(msg) {
    let t = this.root.querySelector('.toast');
    if (!t) { t = h('div', 'toast'); this.root.appendChild(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(this._toastT); this._toastT = setTimeout(() => t.classList.remove('on'), 1800);
  }

  fade(on, cb) {
    this.fadeEl.classList.toggle('on', on);
    if (cb) setTimeout(cb, 600);
  }

  // ---------- HUD ----------
  _buildHud() {
    const hud = h('div', 'hud hidden');
    hud.innerHTML = `
      <div class="danger"></div>
      <div class="hud-level chip"></div>
      <div class="hud-top">
        <div class="chip coin-chip"><span class="ico">🪙</span><span class="hud-coins">0</span></div>
        <div class="chip"><span class="ico">❤️</span><span class="hud-hp">3</span></div>
      </div>
      <div class="hud-objective"></div>
      <div class="boss-hp-wrap hidden"><div class="boss-hp-bar"></div></div>
      <div class="stamina-wrap"><div class="stamina-bar"></div></div>
      <button class="btn ghost small hud-pause" style="position:absolute;top:14px;right:16px;pointer-events:auto;">⏸</button>`;
    this.root.appendChild(hud);
    this.hud = hud;
    hud.querySelector('.hud-pause').onclick = () => this._pauseMenu();
  }

  _updateHud(s) {
    this.hud.querySelector('.hud-coins').textContent = s.coins;
    this.hud.querySelector('.hud-objective').textContent = s.objective;
    // In the hub there is no combat: hide HP / stamina / boss / danger.
    const hub = !!s.hub;
    this.hud.querySelector('.hud-top').querySelector('.chip:nth-child(2)').style.display = hub ? 'none' : '';
    this.hud.querySelector('.stamina-wrap').style.display = hub ? 'none' : '';
    if (!hub) {
      this.hud.querySelector('.hud-hp').textContent = s.hp;
      this.hud.querySelector('.stamina-bar').style.width = `${s.stamina * 100}%`;
    }
    this.hud.querySelector('.danger').classList.toggle('on', !hub && !!s.danger);
    const bw = this.hud.querySelector('.boss-hp-wrap');
    bw.classList.toggle('hidden', hub || s.boss == null);
    if (!hub && s.boss != null) this.hud.querySelector('.boss-hp-bar').style.width = `${Math.max(0, s.boss) * 100}%`;
  }

  // Cinematic banner for boss intro / defeat (driven by Game.onCine).
  _cine(data) {
    if (!this._cineEl) {
      this._cineEl = h('div', 'cine-banner');
      Object.assign(this._cineEl.style, {
        position: 'absolute', top: '34%', left: '0', right: '0', textAlign: 'center',
        pointerEvents: 'none', zIndex: 50,
      });
      this.root.appendChild(this._cineEl);
    }
    if (!data) { this._cineEl.style.display = 'none'; return; }
    this._cineEl.style.display = 'block';
    this._cineEl.innerHTML =
      `<div class="title" style="font-size:clamp(30px,9vw,58px)">${data.title}</div>` +
      (data.sub ? `<div class="subtitle">${data.sub}</div>` : '');
  }

  _buildFade() { this.fadeEl = h('div', 'fade'); this.root.appendChild(this.fadeEl); }
  _refreshChips() { const c = this.hud.querySelector('.hud-coins'); if (c) c.textContent = this.economy.s.coins; }

  showHud(on) { this.hud.classList.toggle('hidden', !on); }

  // ---------- MENU ----------
  showMenu() {
    this.game.running = false; this.game.mode = 'menu'; this.showHud(false);
    this._checkDaily();
    this.open(() => {
      const s = h('div', 'screen');
      const card = h('div', 'card menu-card');
      card.appendChild(h('div', 'menu-emoji', '🦈'));
      card.appendChild(h('div', 'title', 'RUN OF <span class="accent">SHARK</span>'));
      card.appendChild(h('div', 'subtitle', 'Dive the reef · outswim the shark · reach the sub'));
      const wallet = h('div', 'row');
      wallet.appendChild(h('div', 'chip coin-chip', `🪙 ${this.economy.s.coins}`));
      wallet.appendChild(h('div', 'chip', `💵 ${this.economy.s.cash}`));
      wallet.appendChild(h('div', 'chip', `💎 ${this.economy.s.gems}`));
      card.appendChild(wallet);
      // Primary entry is the physical island; Bank/Shop/Garage/Levels/Wheel are reached by
      // WALKING into their buildings there (no menu shortcuts).
      card.appendChild(this.btn('🏝️ ENTER ISLAND', 'green wide', () => this.enterIsland()));
      const grid = h('div', 'menu-grid');
      [['🎽', 'Skins', () => this.showInventory()], ['🏆', 'Awards', () => this.showAchievements()],
       ['🎁', 'Daily', () => this.showDaily()], ['⚙️', 'Settings', () => this.showSettings()]].forEach(([ic, l, f]) =>
        grid.appendChild(this.btn(`${ic} ${l}`, 'small', f)));
      card.appendChild(grid);
      card.appendChild(this.btn('📺 Free Coins (Watch Ad)', 'gold small wide', async () => {
        if (await this.ads.rewarded()) { this.economy.addCoins(200); this.toast('+200 coins!'); this.showMenu(); }
      }));
      card.appendChild(h('div', 'menu-credit', 'A game by <b>HARUN</b> · Dev <b>ZAKY</b>'));
      s.appendChild(card);
      return s;
    });
  }

  // ---------- LEVELS ----------
  showLevels() {
    this.open(() => {
      const s = h('div', 'screen'); const card = h('div', 'card');
      card.appendChild(h('h2', 'head', 'Select Level'));
      const list = h('div', 'list');
      LEVELS.forEach((lv, i) => {
        const unlocked = this.debugUnlock || this.save.data.highestLevel >= lv.id;
        const it = h('div', 'item');
        const lock = unlocked ? (this.debugUnlock && this.save.data.highestLevel < lv.id ? '🔓debug ' : '') + lv.objective : '🔒 Locked';
        it.appendChild(h('div', null, `<div class="name">${lv.id}. ${lv.name}${lv.boss ? ' 👑' : ''}</div><div class="lvl">${lock}</div>`));
        if (unlocked) it.appendChild(this.btn('Play', 'green small', () => this.startLevel(i)));
        list.appendChild(it);
      });
      card.appendChild(list);
      card.appendChild(this.back());
      s.appendChild(card); return s;
    });
  }

  startLevel(i) {
    this.clear(); this.showHud(true);
    this.hud.querySelector('.hud-level').textContent = `LVL ${LEVELS[i].id}`;
    this.audio.unlock();
    this.fade(true, () => { this.game.startLevel(i); this.fade(false); });
    // Desktop has no on-screen joystick — tell the player which keys to use.
    if (!matchMedia('(hover: none), (pointer: coarse)').matches) {
      setTimeout(() => this.toast('⌨ WASD / Arrow keys to move · Shift to sprint'), 700);
    }
  }

  _pauseMenu() {
    this.game.pause(true);
    this.open(() => {
      const s = h('div', 'screen'); const card = h('div', 'card');
      card.appendChild(h('h2', 'head', 'Paused'));
      card.appendChild(this.btn('▶ Resume', 'green', () => { this.clear(); this.game.pause(false); }));
      card.appendChild(h('div', 'row', ''));
      const r = h('div', 'row');
      const inHub = this.game.mode === 'hub';
      if (!inHub) r.appendChild(this.btn('Restart', 'small', () => { this.clear(); this.game.pause(false); this.startLevel(this.game.levelIndex); }));
      r.appendChild(this.btn(inHub ? 'Main Menu' : 'Quit', 'small ghost', () => {
        this.game.pause(false);
        if (inHub) { this.game.disposeLevel(); this.showMenu(); } else { this.returnToHub(); }
      }));
      card.appendChild(r);
      s.appendChild(card); return s;
    });
  }

  // ---------- WIN / LOSE ----------
  // Win reward = base(scales with level) + boss/tsunami + performance bonuses (no-damage, speedy).
  _levelReward(i) {
    const lv = LEVELS[i], g = this.game, parts = [];
    let reward = 100 + lv.id * 50; parts.push(`Clear +${100 + lv.id * 50}`);
    if (lv.boss) { reward += 150; parts.push('Boss +150'); }
    if (lv.tsunami) { reward += 100; parts.push('Tsunami +100'); }
    if (g.player && g.player.hp >= g.player.maxHp) { reward += 75; parts.push('No-damage +75'); }
    const t = g.level ? g.level.elapsed : 999;
    if (t > 0 && t < 40) { reward += 50; parts.push('Speedy +50'); }
    return { reward, parts };
  }

  _win(i) {
    const lv = LEVELS[i];
    const { reward, parts } = this._levelReward(i);
    this.economy.addCoins(reward);
    const sd = this.save.data;
    sd.levelsCleared = Math.max(sd.levelsCleared, lv.id);
    if (lv.boss) sd.bossesBeaten += 1;
    sd.highestLevel = Math.max(sd.highestLevel, Math.min(lv.id + 1, LEVELS.length));
    this.save.markDirty();
    this.ads.interstitial();

    if (i === LEVELS.length - 1) return this._ending();

    this.showHud(false);
    this.confetti(40);          // celebratory burst
    this.audio.win();
    this.open(() => {
      const s = h('div', 'screen'); const card = h('div', 'card pop');
      card.appendChild(h('div', 'title', 'LEVEL CLEARED!'));
      card.appendChild(h('div', 'subtitle', `Level ${lv.id} complete — <b>+${reward} 🪙</b>`));
      card.appendChild(h('div', 'muted', parts.join(' · ')));
      const r = h('div', 'row');
      r.appendChild(this.btn('Next ▶', 'green', () => this.startLevel(Math.min(i + 1, LEVELS.length - 1))));
      r.appendChild(this.btn('🏝️ Island', 'small', () => this.returnToHub()));
      card.appendChild(r);
      card.appendChild(h('div', 'row', ''));
      card.appendChild(this.btn('📺 Watch Ad → 2x Coins', 'gold small', async () => {
        if (await this.ads.rewarded()) { this.economy.addCoins(reward); this.toast(`+${reward} bonus coins!`); }
      }));
      s.appendChild(card); return s;
    });
  }

  _lose(i) {
    this.showHud(false);
    this.open(() => {
      const s = h('div', 'screen'); const card = h('div', 'card');
      card.appendChild(h('div', 'title', '<span class="accent">CAUGHT!</span>'));
      card.appendChild(h('div', 'subtitle', 'The shark got you...'));
      const r = h('div', 'row');
      r.appendChild(this.btn('Retry', 'green', () => this.startLevel(i)));
      r.appendChild(this.btn('🏝️ Island', 'small ghost', () => this.returnToHub()));
      card.appendChild(r);
      card.appendChild(h('div', 'row', ''));
      card.appendChild(this.btn('📺 Watch Ad → Revive', 'gold small', async () => {
        if (await this.ads.rewarded()) { this.clear(); this.showHud(true); this.game.startLevel(i); }
      }));
      s.appendChild(card); return s;
    });
  }

  // ---------- ENDING CINEMATIC ----------
  _ending() {
    this.showHud(false);
    const lines = [
      '🌊 A GIANT TSUNAMI rises over the island...',
      'You sprint to the LUXURY CAR and floor it up the cliff road.',
      'The wave ROARS behind you — closer, closer...',
      'Tires screaming, you crest the summit — and the wave breaks below.',
      'YOU ESCAPED THE TSUNAMI!',
    ];
    this.audio.tsunami();
    let idx = 0;
    const s = h('div', 'screen'); s.style.background = 'linear-gradient(180deg,#06324a,#04263d)';
    const txt = h('div', 'cine-text'); s.appendChild(txt);
    this.clear(); this.root.appendChild(s);
    const tick = () => {
      if (idx < lines.length) { txt.textContent = lines[idx++]; this.audio.click(); setTimeout(tick, 2200); }
      else this._credits(s);
    };
    tick();
  }

  _credits(s) {
    s.innerHTML = '';
    this.confetti(60);
    const card = h('div', 'card');
    card.appendChild(h('div', 'title', '🏆 YOU ESCAPED!'));
    card.appendChild(h('div', 'subtitle', 'You outran the tsunami and finished RUN OF SHARK!'));
    // Credits block: game by Harun, developed by Zaky.
    const credits = h('div', 'credits-block');
    credits.innerHTML = '<div class="credits-role">A game by</div><div class="credits-name">HARUN</div>' +
      '<div class="credits-role">Developer</div><div class="credits-name">ZAKY</div>';
    card.appendChild(credits);
    card.appendChild(this.btn('Back to Menu', 'green', () => this.showMenu()));
    s.appendChild(card);
  }

  // Brief white screen flash for big impacts/victories.
  _flash() {
    const f = h('div', 'screen-flash');
    this.root.appendChild(f);
    requestAnimationFrame(() => { f.classList.add('on'); });
    setTimeout(() => f.remove(), 450);
  }

  // Lightweight DOM confetti burst (no 3D cost). n falling coloured chips.
  confetti(n = 40) {
    const colors = ['#ffd166', '#06d6a0', '#2ec4ff', '#ff6b6b', '#9b59b6', '#feca57'];
    const layer = h('div', 'confetti-layer');
    for (let i = 0; i < n; i++) {
      const c = h('div', 'confetti');
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = (Math.random() * 0.5) + 's';
      c.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      layer.appendChild(c);
    }
    this.root.appendChild(layer);
    setTimeout(() => layer.remove(), 3200);
  }

  // ---------- SHOP ----------
  // `single` (from a hub kiosk) shows ONLY that category with no tab bar. Vehicles are
  // never sold here — they live in the Garage. From the menu (non-single) tabs remain.
  showShop(tab = 'upgrades', single = false) {
    const titles = { upgrades: '⬆️ Upgrades', skins: '🎽 Skin Shop', accessories: '🧢 Gear Shop' };
    this.open(() => {
      const s = h('div', 'screen'); const card = h('div', 'card');
      card.appendChild(h('h2', 'head', single ? (titles[tab] || '🛒 Shop') : '🛒 Shop'));
      if (!single) {
        const tabs = h('div', 'row');
        [['upgrades', 'Upgrades'], ['skins', 'Skins'], ['accessories', 'Accessories']].forEach(([k, l]) =>
          tabs.appendChild(this.btn(l, `small ${tab === k ? 'green' : 'ghost'}`, () => this.showShop(k))));
        card.appendChild(tabs);
      }
      const list = h('div', 'list');
      if (tab === 'upgrades') this._upgradeList(list, single);
      else if (tab === 'skins') this._cosmeticList(list, SKINS, 'skin', single);
      else this._cosmeticList(list, ACCESSORIES, 'accessory', single);
      card.appendChild(list);
      card.appendChild(h('div', 'chip coin-chip', `🪙 ${this.economy.s.coins}`));
      card.appendChild(this.back());
      s.appendChild(card); return s;
    });
  }

  _upgradeList(list, single = false) {
    Object.entries(UPGRADES).forEach(([key, def]) => {
      const lvl = this.economy.s.upgrades[key] || 0;
      const it = h('div', 'item');
      it.appendChild(h('div', null, `<div class="name">${def.icon} ${def.name}</div><div class="lvl">Lv ${lvl}/${def.max} → ${this.economy.statValue(key).toFixed(1)}</div>`));
      if (lvl >= def.max) it.appendChild(h('div', 'lvl', 'MAX'));
      else it.appendChild(this.btn(`🪙 ${this.economy.upgradeCost(key)}`, 'gold small', () => {
        if (this.economy.buyUpgrade(key)) this.showShop('upgrades', single); else this.toast('Not enough coins');
      }));
      list.appendChild(it);
    });
  }

  _cosmeticList(list, items, kind, single = false) {
    const owned = kind === 'skin' ? this.economy.s.ownedSkins : kind === 'accessory' ? this.economy.s.ownedAccessories : this.economy.s.ownedVehicles;
    const equipped = kind === 'skin' ? this.economy.s.equippedSkin : kind === 'accessory' ? this.economy.s.equippedAccessory : null;
    // Re-render the correct screen after an action (vehicles live in the Garage).
    const rerender = () => kind === 'skin' ? this.showShop('skins', single) : kind === 'accessory' ? this.showShop('accessories', single) : this.showGarage();
    items.forEach((x) => {
      const have = owned.includes(x.id);
      const it = h('div', 'item');
      it.appendChild(h('div', null, `<div class="name">${x.name}</div><div class="lvl">${have ? 'Owned' : '🪙 ' + x.cost}</div>`));
      if (!have) {
        it.appendChild(this.btn('Buy', 'gold small', () => {
          const ok = kind === 'skin' ? this.economy.buySkin(x.id) : kind === 'accessory' ? this.economy.buyAccessory(x.id) : this.economy.buyVehicle(x.id);
          if (ok) rerender(); else this.toast('Not enough coins');
        }));
      } else if (kind === 'skin') {
        it.appendChild(this.btn(equipped === x.id ? '✓ Equipped' : 'Equip', `small ${equipped === x.id ? 'green' : ''}`, () => {
          this.economy.s.equippedSkin = x.id; this.save.markDirty();
          this.game.refreshPlayerAppearance(); // live skin change, no reload
          rerender();
        }));
      } else if (kind === 'accessory') {
        it.appendChild(this.btn(equipped === x.id ? '✓' : 'Equip', `small ${equipped === x.id ? 'green' : ''}`, () => {
          this.economy.s.equippedAccessory = equipped === x.id ? null : x.id; this.save.markDirty();
          this.game.refreshPlayerAppearance(); // live accessory change, no reload
          rerender();
        }));
      } else it.appendChild(h('div', 'lvl', '✓'));
      list.appendChild(it);
    });
  }

  // ---------- BANK ----------
  showBank() {
    this.open(() => {
      const s = h('div', 'screen'); const card = h('div', 'card');
      const e = this.economy;
      card.appendChild(h('h2', 'head', '🏦 Bank'));
      card.appendChild(h('div', 'subtitle', `Vault: ${e.s.bank} / ${e.bankCapacity}  •  Cash: ${e.s.cash}`));
      card.appendChild(h('div', 'muted', 'Convert level coins into cash, then keep it safe in the bank.'));
      const r0 = h('div', 'row');
      r0.appendChild(this.btn('Convert 100🪙→10💵', 'small', () => { const c = e.convertCoinsToCash(100); this.toast(c ? `+${c} cash` : 'Need 10+ coins'); this.showBank(); }));
      card.appendChild(r0);
      const r1 = h('div', 'row');
      r1.appendChild(this.btn('Deposit 50', 'green small', () => { e.deposit(50); this.showBank(); }));
      r1.appendChild(this.btn('Deposit All', 'green small', () => { e.deposit(e.s.cash); this.showBank(); }));
      r1.appendChild(this.btn('Withdraw 50', 'small', () => { e.withdraw(50); this.showBank(); }));
      card.appendChild(r1);
      const r2 = h('div', 'row');
      if (e.s.bankLevel < 6) r2.appendChild(this.btn(`Upgrade Capacity (💵 ${e.bankUpgradeCost()})`, 'gold small', () => { if (e.upgradeBank()) this.showBank(); else this.toast('Not enough cash'); }));
      else r2.appendChild(h('div', 'muted', 'Bank fully upgraded'));
      card.appendChild(r2);
      card.appendChild(this.back());
      s.appendChild(card); return s;
    });
  }

  // ---------- GARAGE ----------
  showGarage() {
    this.open(() => {
      const s = h('div', 'screen'); const card = h('div', 'card');
      card.appendChild(h('h2', 'head', '🚗 Garage'));
      card.appendChild(h('div', 'muted', 'Vehicles used in the final escape chapters.'));
      const list = h('div', 'list'); this._cosmeticList(list, VEHICLES, 'vehicle');
      card.appendChild(list); card.appendChild(this.back());
      s.appendChild(card); return s;
    });
  }

  // ---------- INVENTORY / SKINS ----------
  showInventory() { this.showShop('skins'); }

  // ---------- ACHIEVEMENTS ----------
  showAchievements() {
    this.open(() => {
      const s = h('div', 'screen'); const card = h('div', 'card');
      card.appendChild(h('h2', 'head', '🏆 Achievements'));
      const list = h('div', 'list');
      ACHIEVEMENTS.forEach((a) => {
        const got = this.save.data.achievements.includes(a.id);
        const it = h('div', 'item');
        it.appendChild(h('div', 'name', `${got ? '✅' : '🔒'} ${a.name}`));
        list.appendChild(it);
      });
      card.appendChild(list); card.appendChild(this.back());
      s.appendChild(card); return s;
    });
  }

  // ---------- DAILY ----------
  _checkDaily() {
    const st = dailyStatus(this.save.data);
    this.save.data._dailyAvailable = st.available;
  }
  showDaily() {
    this.open(() => {
      const s = h('div', 'screen'); const card = h('div', 'card');
      const sd = this.save.data;
      const st = dailyStatus(sd);
      card.appendChild(h('h2', 'head', '🎁 Daily Reward'));
      card.appendChild(h('div', 'subtitle', `Streak: ${sd.dailyStreak || 0} day(s)`));
      if (st.available) {
        card.appendChild(this.btn('Claim Reward', 'green', () => {
          const res = claimDaily(sd);            // real interval check + streak reset
          if (!res.ok) return this.showDaily();
          this.economy.addCoins(res.reward);
          if (res.gems) this.economy.addGems(res.gems);
          this.save.markDirty();
          this.toast(`+${res.reward} coins${res.gems ? ` +${res.gems}💎` : ''} (streak ${res.streak})`);
          this.showDaily();
        }));
      } else card.appendChild(h('div', 'muted', 'Come back tomorrow for more!'));
      card.appendChild(h('div', 'row', '')); card.appendChild(this.back());
      s.appendChild(card); return s;
    });
  }

  // ---------- LUCKY WHEEL ----------
  showWheel() {
    this.open(() => {
      const s = h('div', 'screen'); const card = h('div', 'card');
      card.appendChild(h('h2', 'head', '🎡 Lucky Wheel'));
      card.appendChild(h('div', 'subtitle', 'Spin for coins, cash, or gems!'));
      const result = h('div', 'subtitle', '&nbsp;');
      // The PHYSICAL wheel decides the result: pick the index, spin to land the pointer on
      // it, then reveal+apply only after it stops. (Index is chosen here; the wheel is
      // animated to match, so label shown == segment under the pointer.)
      const doSpin = async (btn) => {
        if (this._wheelSpinning) return;
        this._wheelSpinning = true; btn.disabled = true; result.textContent = 'Spinning…';
        const index = Math.floor(Math.random() * WHEEL_PRIZES.length);
        const hub = this.game.hub;
        if (hub && hub.spinWheel) await hub.spinWheel(index, WHEEL_PRIZES.length);
        const prize = WHEEL_PRIZES[index];
        prize.apply(this.economy);
        result.textContent = `🎉 ${prize.label}`;
        this._wheelSpinning = false; btn.disabled = false;
      };
      const spinBtn = this.btn('Spin (💎 1)', 'gold', () => {
        if (this._wheelSpinning) return;
        if (!this.economy.spendGems(1)) return this.toast('Need 1 gem (get gems from daily/wheel)');
        doSpin(spinBtn);
      });
      card.appendChild(spinBtn);
      const adBtn = this.btn('Free Spin (📺 Ad)', 'small', async () => {
        if (this._wheelSpinning) return;
        if (await this.ads.rewarded()) doSpin(adBtn);
      });
      card.appendChild(adBtn);
      card.appendChild(result); card.appendChild(this.back());
      s.appendChild(card); return s;
    });
  }

  // Email magic-link login. Failures are non-fatal — guest/local save continues.
  async _loginPrompt() {
    const email = prompt('Enter your email for a magic login link:');
    if (!email) return;
    this.toast('Sending login link...');
    try {
      await this.cloud.signIn(email.trim());
      this.toast('Check your email for the login link!');
    } catch (e) {
      this.toast('Login unavailable — staying on local save');
      console.warn('Cloud login failed (local save unaffected):', e);
    }
  }

  // Paste Supabase creds (stored in localStorage via saveSupabaseConfig) then reload so the
  // SupabaseProvider re-resolves with them. Blank both = clear (back to guest/local mode).
  _cloudSetupPrompt() {
    const cur = resolveSupabaseConfig();
    const url = prompt('Supabase Project URL (blank to clear cloud):', cur.url || '');
    if (url === null) return;
    const key = prompt('Supabase anon public key:', cur.anonKey || '');
    if (key === null) return;
    saveSupabaseConfig({ url: url.trim(), anonKey: key.trim() });
    this.toast((url && key) ? 'Cloud configured — reloading…' : 'Cloud cleared — reloading…');
    setTimeout(() => location.reload(), 800);
  }

  // ---------- SETTINGS ----------
  showSettings() {
    this.open(() => {
      const s = h('div', 'screen'); const card = h('div', 'card');
      const set = this.save.data.settings;
      card.appendChild(h('h2', 'head', '⚙️ Settings'));
      const mk = (label, key, after) => {
        const it = h('div', 'item');
        it.appendChild(h('div', 'name', label));
        it.appendChild(this.btn(set[key] ? 'ON' : 'OFF', `small ${set[key] ? 'green' : 'ghost'}`, () => { set[key] = !set[key]; this.save.markDirty(); after && after(); this.showSettings(); }));
        return it;
      };
      const list = h('div', 'list');
      list.appendChild(mk('🎵 Music', 'music', () => set.music ? this.audio.startMusic() : this.audio.stopMusic()));
      list.appendChild(mk('🔊 Sound FX', 'sfx'));

      // Joystick sensitivity (low / medium / high)
      const SENS = { Low: 0.6, Medium: 1.0, High: 1.5 };
      if (set.joySensitivity == null) set.joySensitivity = 1;
      const sensRow = h('div', 'item');
      sensRow.appendChild(h('div', 'name', '🕹️ Joystick Sensitivity'));
      const sensBtns = h('div', 'row');
      Object.entries(SENS).forEach(([label, val]) => {
        const active = Math.abs(set.joySensitivity - val) < 0.01;
        sensBtns.appendChild(this.btn(label, `small ${active ? 'green' : 'ghost'}`, () => {
          set.joySensitivity = val; this.save.markDirty(); this.showSettings();
        }));
      });
      sensRow.appendChild(sensBtns);
      list.appendChild(sensRow);

      // Invert Y toggle (movement joystick)
      list.appendChild(mk('↕️ Invert Y Axis (move)', 'invertY'));
      // Camera is fully automatic — no camera settings to configure.
      card.appendChild(list);

      // Cloud login (guest by default). Magic-link flow; local save stays the fallback.
      const acct = h('div', 'item');
      const configured = this.cloud && this.cloud.isConfigured();
      acct.appendChild(h('div', null, `<div class="name">☁️ Account</div><div class="lvl">${this.save.data.player.guest ? 'Guest (local save)' : this.save.data.player.name}</div>`));
      acct.appendChild(this.btn(configured ? 'Login' : 'Cloud off', `small ${configured ? '' : 'ghost'}`, () => {
        if (!configured) return this.toast('Setup cloud first (button below)');
        this._loginPrompt();
      }));
      card.appendChild(acct);

      // Cloud setup: paste Supabase URL + anon key (stored in localStorage). Reloads to apply.
      const setup = h('div', 'item');
      setup.appendChild(h('div', null, `<div class="name">🔧 Cloud Save Setup</div><div class="lvl">${configured ? 'Configured ✓' : 'Not set (guest)'}</div>`));
      setup.appendChild(this.btn(configured ? 'Edit' : 'Set up', 'small', () => this._cloudSetupPrompt()));
      card.appendChild(setup);

      card.appendChild(h('div', 'muted', `Player: ${this.save.data.player.name} (${this.save.data.player.guest ? 'Guest' : 'Cloud'})`));
      card.appendChild(h('div', 'row', ''));
      card.appendChild(this.btn('Reset Progress', 'ghost small', () => { if (confirm('Erase all progress?')) { this.save.reset(); location.reload(); } }));
      card.appendChild(this.back());
      s.appendChild(card); return s;
    });
  }
}
