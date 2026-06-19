// AudioManager — procedural WebAudio (no asset downloads required).
// Generates SFX + a simple looping music bed so the game ships with zero audio files.

export class AudioManager {
  constructor(settings) {
    this.settings = settings; // { music, sfx, volume }
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this._musicTimer = null;
  }

  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.settings.volume ?? 0.8;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.18;
    this.musicGain.connect(this.master);
  }

  // Must be called from a user gesture (browser autoplay policy).
  unlock() {
    this._ensure();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) { this.settings.volume = v; if (this.master) this.master.gain.value = v; }

  _beep(freq, dur, type = 'sine', gain = 0.3, slideTo = null) {
    if (!this.settings.sfx) return;
    this._ensure();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  coin()    { this._beep(880, 0.12, 'triangle', 0.25, 1320); }
  pickup()  { this._beep(620, 0.10, 'square', 0.2, 880); }
  win()     { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._beep(f, 0.18, 'triangle', 0.3), i * 120)); }
  lose()    { this._beep(300, 0.5, 'sawtooth', 0.3, 80); }
  sharkRoar(){ this._beep(110, 0.7, 'sawtooth', 0.35, 55); }
  charge()  { this._beep(140, 0.3, 'square', 0.3, 420); }
  hit()     { this._beep(200, 0.18, 'sawtooth', 0.35, 90); }
  click()   { this._beep(440, 0.06, 'square', 0.18); }
  tsunami() { this._beep(70, 1.6, 'sawtooth', 0.4, 40); }

  startMusic() {
    if (!this.settings.music) return;
    this._ensure();
    if (this._musicTimer) return;
    const scale = [0, 3, 5, 7, 10]; // pentatonic, calm
    const root = 220;
    let step = 0;
    this._musicTimer = setInterval(() => {
      if (!this.settings.music) return;
      const semi = scale[Math.floor(Math.random() * scale.length)] + (Math.random() < 0.3 ? 12 : 0);
      const f = root * Math.pow(2, semi / 12);
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      osc.connect(g); g.connect(this.musicGain);
      osc.start(t); osc.stop(t + 1);
      step++;
    }, 520);
  }

  stopMusic() { if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; } }
}
