/* Kharidaar sound garden — procedural music & SFX, zero audio files */
(function () {
  const SCALE = [0, 2, 3, 5, 7, 8, 10]; // Bhairavi-flavoured
  const ROOT = 50; // D3
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);

  class BazaarAudio {
    constructor() {
      this.ctx = null;
      this.enabled = false;
      this.sfxOn = true;
      this.volume = 0.55;
      this.timer = null;
      this.step = 0;
      this.nextTime = 0;
      this.mood = 15; // hour
      this.bpm = 74;
      this.noise = null;
      this.melodyTimer = null;
      this.loadPrefs();
    }

    loadPrefs() {
      try {
        const p = JSON.parse(localStorage.getItem('kharidaar.sound') || '{}');
        if (typeof p.volume === 'number') this.volume = p.volume;
        if (typeof p.sfx === 'boolean') this.sfxOn = p.sfx;
        if (typeof p.enabled === 'boolean') this.enabled = p.enabled;
      } catch (e) {}
    }

    savePrefs() {
      try { localStorage.setItem('kharidaar.sound', JSON.stringify({ volume: this.volume, sfx: this.sfxOn, enabled: this.enabled })); } catch (e) {}
    }

    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
      }
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      const ctx = new Ctx();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(ctx.destination);

      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0;
      this.musicFilter = ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 2600;
      this.musicFilter.Q.value = 0.4;
      this.musicBus.connect(this.musicFilter);
      this.musicFilter.connect(this.master);

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = this.sfxOn ? 1 : 0;
      this.sfxBus.connect(this.master);

      // simple feedback echo for space
      this.delay = ctx.createDelay(1.2);
      this.delay.delayTime.value = 0.34;
      this.feedback = ctx.createGain();
      this.feedback.gain.value = 0.32;
      this.wet = ctx.createGain();
      this.wet.gain.value = 0.26;
      this.delay.connect(this.feedback).connect(this.delay);
      this.delay.connect(this.wet).connect(this.musicBus);
      this.wet.connect(this.master);

      this.noise = this.makeNoise(1.6);
      return ctx;
    }

    makeNoise(seconds) {
      const ctx = this.ctx;
      const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      return buf;
    }

    setMood(hour) {
      this.mood = hour;
      if (!this.ctx) return;
      const day = hour > 6 && hour < 18;
      const target = day ? 3200 : 1700;
      try { this.musicFilter.frequency.setTargetAtTime(target, this.ctx.currentTime, 3); } catch (e) {}
    }

    setVolume(v) {
      this.volume = Math.max(0, Math.min(1, v));
      if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.1);
      this.savePrefs();
    }

    setSfx(on) {
      this.sfxOn = on;
      if (this.amb && !this.amb.paused) this.amb.volume = on ? Math.min(1, 0.25 + this.volume * 0.75) : 0;
      if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
      this.savePrefs();
    }

    start() {
      const ctx = this.ensure();
      if (!ctx) return;
      this.enabled = true;
      this.musicBus.gain.setTargetAtTime(0.9, ctx.currentTime, 1.2);
      this.startScheduler();
      this.savePrefs();
    }

    stop() {
      this.enabled = false;
      if (this.ctx && this.musicBus) this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
      this.stopScheduler();
      this.savePrefs();
    }

    toggle() { this.enabled ? this.stop() : this.start(); return this.enabled; }

    startScheduler() {
      if (this.timer || !this.ctx) return;
      this.nextTime = this.ctx.currentTime + 0.15;
      this.timer = setInterval(() => this.schedule(), 110);
    }

    stopScheduler() {
      clearInterval(this.timer);
      this.timer = null;
    }

    schedule() {
      if (!this.ctx) return;
      while (this.nextTime < this.ctx.currentTime + 0.35) {
        this.playStep(this.step, this.nextTime);
        this.nextTime += (60 / this.bpm) / 2; // eighth notes
        this.step = (this.step + 1) % 64;
      }
    }

    playStep(step, time) {
      const bar = Math.floor(step / 16);
      const beat = step % 16;

      // tanpura-ish drone at the top of each bar
      if (beat === 0) {
        this.drone(time, ROOT - 12, 0.5);
        this.drone(time, ROOT - 5, 0.28);
      }

      // soft shaker / tabla tick
      if (beat % 4 === 0) this.tick(time, beat === 0 ? 0.13 : 0.07);
      if (beat === 6 || beat === 11) this.tick(time, 0.035);

      // melody: sparse, wandering
      const density = this.mood >= 22 || this.mood < 6 ? 0.22 : 0.34;
      if (Math.random() < density) {
        const octave = Math.random() < 0.25 ? 12 : 0;
        const degree = SCALE[Math.floor(Math.random() * SCALE.length)];
        const jump = Math.random() < 0.3 ? 12 : 0;
        const note = ROOT + 12 + octave + degree + jump;
        const dur = [0.35, 0.5, 0.75][Math.floor(Math.random() * 3)];
        this.pluck(time, note, dur, 0.09 + Math.random() * 0.05);
      }

      // low answer note
      if (bar % 2 === 1 && beat === 8) {
        this.pluck(time, ROOT - 12 + SCALE[Math.floor(Math.random() * 4)], 1.2, 0.075);
      }
    }

    pluck(time, note, dur, gain) {
      const ctx = this.ctx;
      const f = midi(note);
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const g = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2200;
      osc.type = 'triangle';
      osc.frequency.value = f;
      osc2.type = 'sine';
      osc2.frequency.value = f * 2.003;
      const g2 = ctx.createGain();
      g2.gain.value = 0.18;
      osc.connect(filter);
      osc2.connect(g2).connect(filter);
      filter.connect(g);
      g.connect(this.musicBus);
      g.connect(this.delay);
      const t = time;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur * 1.6);
      filter.frequency.setValueAtTime(2600, t);
      filter.frequency.exponentialRampToValueAtTime(700, t + dur);
      osc.start(t); osc2.start(t);
      osc.stop(t + dur * 1.7); osc2.stop(t + dur * 1.7);
    }

    drone(time, note, gain) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = midi(note);
      osc.connect(g).connect(this.musicBus);
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(gain, time + 1.2);
      g.gain.linearRampToValueAtTime(0.0001, time + 7.5);
      osc.start(time);
      osc.stop(time + 8);
    }

    tick(time, gain) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 3400;
      filter.Q.value = 0.9;
      const g = ctx.createGain();
      src.connect(filter).connect(g).connect(this.musicBus);
      g.gain.setValueAtTime(gain, time);
      g.gain.exponentialRampToValueAtTime(0.0005, time + 0.06);
      src.start(time, Math.random());
      src.stop(time + 0.08);
    }

    now() { return this.ctx ? this.ctx.currentTime : 0; }

    tone({ freq = 440, type = 'sine', dur = 0.16, gain = 0.12, slide = 0, delay = 0, bus }) {
      const ctx = this.ensure();
      if (!ctx) return;
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      osc.connect(g).connect(bus || this.sfxBus);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }

    noiseBurst({ dur = 0.3, gain = 0.08, from = 400, to = 1800, q = 0.8, delay = 0 }) {
      const ctx = this.ensure();
      if (!ctx) return;
      const t = ctx.currentTime + delay;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = q;
      filter.frequency.setValueAtTime(from, t);
      filter.frequency.exponentialRampToValueAtTime(to, t + dur);
      const g = ctx.createGain();
      src.connect(filter).connect(g).connect(this.sfxBus);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      src.start(t, Math.random());
      src.stop(t + dur + 0.02);
    }

    sfx(name) {
      if (!this.sfxOn) return;
      const ctx = this.ensure();
      if (!ctx) return;
      switch (name) {
        case 'hover': this.tone({ freq: 880, type: 'sine', dur: 0.05, gain: 0.025 }); break;
        case 'click': this.tone({ freq: 520, type: 'triangle', dur: 0.09, gain: 0.08, slide: -120 }); break;
        case 'add':
          this.tone({ freq: 660, type: 'sine', dur: 0.12, gain: 0.1 });
          this.tone({ freq: 990, type: 'sine', dur: 0.16, gain: 0.08, delay: 0.07 });
          this.noiseBurst({ dur: 0.12, gain: 0.03, from: 2400, to: 900 });
          break;
        case 'remove': this.tone({ freq: 500, type: 'sine', dur: 0.13, gain: 0.07, slide: -160 }); break;
        case 'open': this.noiseBurst({ dur: 0.34, gain: 0.05, from: 380, to: 1600, q: 0.6 }); break;
        case 'close': this.noiseBurst({ dur: 0.26, gain: 0.045, from: 1500, to: 300, q: 0.6 }); break;
        case 'success': [0, 4, 7, 11].forEach((n, i) => this.tone({ freq: midi(62 + n), type: 'triangle', dur: 0.4, gain: 0.08, delay: i * 0.09 })); break;
        case 'error': this.tone({ freq: 190, type: 'sawtooth', dur: 0.18, gain: 0.05, slide: -40 }); break;
        case 'whoosh': this.noiseBurst({ dur: 0.7, gain: 0.05, from: 220, to: 2600, q: 0.7 }); break;
        case 'night': this.noiseBurst({ dur: 0.8, gain: 0.035, from: 800, to: 180, q: 1 }); break;
        case 'coin':
          this.tone({ freq: 1180, type: 'square', dur: 0.09, gain: 0.04 });
          this.tone({ freq: 1560, type: 'square', dur: 0.16, gain: 0.035, delay: 0.06 });
          break;
        case 'step': this.noiseBurst({ dur: 0.07, gain: 0.03, from: 500, to: 200, q: 1.2 }); break;
        case 'bell':
          [0, 7, 12].forEach((n, i) => this.tone({ freq: midi(84 + n), type: 'sine', dur: 0.5, gain: 0.04, delay: i * 0.11 }));
          break;
        case 'haggle':
          [0, 4, 2, 7].forEach((n, i) => this.tone({ freq: midi(64 + n), type: 'triangle', dur: 0.12, gain: 0.04, delay: i * 0.1 }));
          break;
        case 'moo':
          this.tone({ freq: 150, type: 'sawtooth', dur: 0.9, gain: 0.05, slide: -45 });
          this.tone({ freq: 225, type: 'triangle', dur: 0.9, gain: 0.03, slide: -60 });
          break;
        case 'bark':
          this.tone({ freq: 420, type: 'square', dur: 0.09, gain: 0.04, slide: -160 });
          this.tone({ freq: 400, type: 'square', dur: 0.09, gain: 0.04, slide: -160, delay: 0.16 });
          break;
        case 'rickshaw':
          this.tone({ freq: 1400, type: 'sine', dur: 0.12, gain: 0.05 });
          this.tone({ freq: 1400, type: 'sine', dur: 0.12, gain: 0.05, delay: 0.16 });
          break;
        case 'gossip':
          [0, 3, 7, 10, 7].forEach((n, i) => this.tone({ freq: midi(70 + n), type: 'sine', dur: 0.14, gain: 0.05, delay: i * 0.07 }));
          break;
      }
    }

    /* looping bazaar crowd recording for the 3D world */
    ambience(on) {
      try {
        if (!this.amb) {
          this.amb = new Audio('freesound_community-bazaar-54568.mp3');
          this.amb.loop = true;
          this.amb.preload = 'auto';
        }
        clearInterval(this.ambFade);
        const a = this.amb;
        const goal = () => (on && this.sfxOn ? Math.min(1, 0.25 + this.volume * 0.75) : 0);
        if (on) { const pr = a.play(); if (pr && pr.catch) pr.catch(() => {}); }
        this.ambFade = setInterval(() => {
          const g = goal();
          a.volume = Math.max(0, Math.min(1, a.volume + Math.sign(g - a.volume) * Math.min(0.04, Math.abs(g - a.volume))));
          if (Math.abs(g - a.volume) < 0.005) {
            a.volume = g; clearInterval(this.ambFade);
            if (!on) a.pause();
          }
        }, 50);
      } catch (e) {}
    }

    melody() {
      const ctx = this.ensure();
      if (!ctx) return;
      const notes = [62, 65, 67, 69, 67, 65, 64, 62];
      notes.forEach((n, i) => {
        this.tone({ freq: midi(n), type: 'triangle', dur: 0.5, gain: 0.08, delay: i * 0.14 });
      });
    }
  }

  window.KharidaarAudio = new BazaarAudio();
})();
