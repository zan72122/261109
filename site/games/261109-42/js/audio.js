// Audio: prebaked Gemini TTS voice clips (local files) + Web Audio synthesized SFX, ambience and call&response music.
// Nothing plays and no AudioContext is created before the first user gesture.

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioSys {
  constructor() {
    this.ctx = null; this.unlocked = false; this.lines = {}; this.buf = {};
    this.queue = []; this.current = null; this.lastLine = null; this.recent = [];
    this.events = []; // music visual events {t, who, kind}
    this.music = null; this.zoneW = { house: 1, garden: 0, prom: 0, beach: 0, park: 0 };
    this.evening = 0; this.duck = 0; this.nextAmb = {};
    this.fmt = 'ogg';
    try {
      const a = document.createElement('audio');
      if (a.canPlayType('audio/mp4; codecs="mp4a.40.2"') || a.canPlayType('audio/mp4')) this.fmt = 'm4a';
    } catch (e) {}
  }
  async loadManifest() {
    try {
      const r = await fetch('assets/voice/manifest.json'); const m = await r.json();
      for (const l of m.lines) this.lines[l.id] = l;
    } catch (e) { this.lines = {}; }
  }
  now() { return this.ctx ? this.ctx.currentTime : performance.now() / 1000; }

  unlock() {
    if (this.unlocked) { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC(); this.unlocked = true;
    try { const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch (e) {}
    if (ctx.state !== 'running') ctx.resume();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; comp.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(comp);
    this.vBus = ctx.createGain(); this.vBus.gain.value = 1.0; this.vBus.connect(this.master);
    this.sBus = ctx.createGain(); this.sBus.gain.value = 0.75; this.sBus.connect(this.master);
    this.aBus = ctx.createGain(); this.aBus.gain.value = 0.0; this.aBus.connect(this.master);
    this.aBus.gain.setTargetAtTime(1, ctx.currentTime, 1.5);
    this.mBus = ctx.createGain(); this.mBus.gain.value = 0.7; this.mBus.connect(this.master);
    // shared noise
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = nb;
    // brown-ish noise for waves
    const bb = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate), e = bb.getChannelData(0); let last = 0;
    for (let i = 0; i < e.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; e[i] = last * 3.5; }
    this.brown = bb;
    this.startAmbience();
    this.loadVoices();
    document.addEventListener('visibilitychange', () => { if (!this.ctx) return; if (document.hidden) this.ctx.suspend(); else this.ctx.resume(); });
  }
  async loadVoices() {
    if (!Object.keys(this.lines).length) await this.loadManifest();
    const ids = Object.keys(this.lines);
    await Promise.all(ids.map(async (id) => {
      const l = this.lines[id];
      const tryFmt = async (f) => { const r = await fetch(l.files[f]); const ab = await r.arrayBuffer(); return await new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej)); };
      try { this.buf[id] = await tryFmt(this.fmt); }
      catch (e) { try { this.buf[id] = await tryFmt(this.fmt === 'm4a' ? 'ogg' : 'm4a'); } catch (e2) {} }
    }));
  }

  // ---------- voice ----------
  // ids: string or array of alternatives. opts: {who, pri, reply, vol, rate}
  say(ids, opts = {}) {
    const list = Array.isArray(ids) ? ids : [ids];
    let pick = list.filter((i) => i !== this.lastLine && !this.recent.includes(i));
    if (!pick.length) pick = list.filter((i) => i !== this.lastLine);
    if (!pick.length) pick = list;
    const id = pick[(Math.random() * pick.length) | 0];
    const item = { id, who: opts.who, pri: opts.pri || 1, reply: !!opts.reply, vol: opts.vol == null ? 1 : opts.vol, rate: opts.rate || 1, t: this.now() };
    const busy = this.current && this.current.end > this.now();
    if (busy) {
      if (item.reply && this.queue.length < 2) { this.queue.unshift(item); return id; }
      if (this.queue.length >= 2) {
        if (item.pri <= Math.min(...this.queue.map((q) => q.pri))) return null;
        this.queue.sort((a, b) => a.pri - b.pri); this.queue.shift();
      }
      this.queue.push(item); return id;
    }
    this._play(item); return id;
  }
  _play(item) {
    const id = item.id; this.lastLine = id; this.recent.push(id); if (this.recent.length > 6) this.recent.shift();
    const b = this.buf[id];
    const dur = b ? b.duration / item.rate : 1.2;
    const now = this.now();
    this.current = { id, who: item.who, start: now, end: now + dur, overlapAt: now + dur * 0.72 };
    if (item.who) { item.who.talkUntil = performance.now() / 1000 + dur; item.who.analyser = null; }
    if (!b || !this.ctx) return;
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = item.rate;
    const g = ctx.createGain(); g.gain.value = 0.95 * item.vol;
    const an = ctx.createAnalyser(); an.fftSize = 256;
    s.connect(g); g.connect(an); an.connect(this.vBus); s.start();
    if (item.who) { item.who.analyser = an; }
    this.duckTo(0.5, dur);
  }
  voiceBusy() { return this.current && this.current.end > this.now(); }
  updateVoice() {
    if (!this.queue.length) return;
    const now = this.now();
    if (!this.current || now >= this.current.end - (this.queue[0].reply ? (this.current.end - this.current.overlapAt) : -0.15)) {
      const it = this.queue.shift();
      if (now - it.t < 5) this._play(it);
    }
  }
  duckTo(v, dur) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.aBus.gain.cancelScheduledValues(t); this.aBus.gain.setTargetAtTime(v, t, 0.15);
    this.aBus.gain.setTargetAtTime(1, t + dur, 0.5);
  }

  // ---------- SFX primitives ----------
  _env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  _noise(t, dur, type, freq, q, peak, a = 0.004, bus) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); this._env(g, t, a, peak, dur);
    s.connect(f); f.connect(g); g.connect(bus || this.sBus);
    s.start(t, Math.random() * 1.5); s.stop(t + a + dur + 0.05); return { f, g };
  }
  _tone(t, type, f0, f1, dur, peak, a = 0.005, bus) {
    const ctx = this.ctx, o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); this._env(g, t, a, peak, dur); o.connect(g); g.connect(bus || this.sBus);
    o.start(t); o.stop(t + a + dur + 0.05); return o;
  }
  sfx(name, opt = {}) {
    if (!this.ctx) return; const t = (opt.t || this.ctx.currentTime) + 0.005, v = opt.vol == null ? 1 : opt.vol;
    switch (name) {
      case 'step': {
        const s = opt.surf || 'stone';
        if (s === 'sand') this._noise(t, 0.09, 'lowpass', 900, 0.7, 0.06 * v, 0.01);
        else if (s === 'grass') this._noise(t, 0.06, 'bandpass', 2600, 0.8, 0.035 * v, 0.006);
        else if (s === 'wood') this._noise(t, 0.04, 'bandpass', 1400, 2, 0.06 * v);
        else this._noise(t, 0.035, 'bandpass', 2100, 3, 0.05 * v);
        break;
      }
      case 'paw': this._noise(t, 0.02, 'bandpass', 3800, 4, 0.03 * v); break;
      case 'doorOpen': {
        const o = this._tone(t, 'sawtooth', 95, 120, 0.45, 0.025 * v, 0.05);
        this._noise(t, 0.05, 'bandpass', 3000, 5, 0.08 * v); this._tone(t + 0.02, 'sine', 900, 700, 0.06, 0.05 * v); break;
      }
      case 'doorClose': this._tone(t, 'sine', 140, 60, 0.18, 0.18 * v); this._noise(t, 0.06, 'lowpass', 800, 1, 0.12 * v); this._tone(t + 0.05, 'sine', 1300, 1100, 0.05, 0.04 * v); break;
      case 'clink': { const p = opt.pitch || 1; [2400, 3710, 5230].forEach((f, i) => this._tone(t, 'sine', f * p, f * p, 0.25 - i * 0.05, 0.05 * v / (i + 1), 0.002)); break; }
      case 'koton': this._tone(t, 'sine', 480 * (opt.pitch || 1), 300, 0.12, 0.22 * v, 0.002); this._noise(t, 0.02, 'bandpass', 2500, 2, 0.08 * v); break;
      case 'pick': this._tone(t, 'sine', 620, 980, 0.07, 0.12 * v, 0.004); break;
      case 'give': this._tone(t, 'triangle', 660, 660, 0.12, 0.08 * v); this._tone(t + 0.09, 'triangle', 990, 990, 0.18, 0.07 * v); break;
      case 'pour': { const n = this._noise(t, opt.dur || 1.2, 'bandpass', 1300, 1.5, 0.05 * v, 0.1); n.f.frequency.linearRampToValueAtTime(1900, t + (opt.dur || 1.2)); break; }
      case 'chair': { const n = this._noise(t, 0.35, 'bandpass', 500, 3, 0.07 * v, 0.03); n.f.frequency.linearRampToValueAtTime(800, t + 0.3); break; }
      case 'sit': this._noise(t, 0.12, 'lowpass', 500, 0.7, 0.08 * v, 0.01); break;
      case 'clap': this._noise(t, 0.05, 'bandpass', 1400, 1.2, 0.22 * v, 0.001); this._noise(t + 0.012, 0.06, 'bandpass', 1100, 1, 0.12 * v, 0.001); break;
      case 'drum': this._tone(t, 'sine', 210, 80, 0.28, 0.4 * v, 0.002); this._noise(t, 0.03, 'bandpass', 1800, 1, 0.08 * v, 0.001); break;
      case 'tamb': for (let k = 0; k < 3; k++) this._noise(t + k * 0.018, 0.08, 'highpass', 6500, 1, 0.07 * v, 0.001); break;
      case 'shaker': this._noise(t, 0.05, 'highpass', 5200, 0.8, 0.04 * v, 0.01); break;
      case 'bell': { const f = mtof(opt.note || 72); this._tone(t, 'sine', f, f, 0.7, 0.16 * v, 0.003, opt.bus); this._tone(t, 'triangle', f * 4, f * 4, 0.12, 0.03 * v, 0.002, opt.bus); break; }
      case 'pluck': { const f = mtof(opt.note || 60); this._tone(t, 'triangle', f, f * 0.995, 0.6, 0.12 * v, 0.003, opt.bus); this._tone(t, 'sine', f * 2, f * 2, 0.25, 0.04 * v, 0.003, opt.bus); break; }
      case 'bass': { const f = mtof(opt.note || 43); this._tone(t, 'sine', f, f, 0.45, 0.2 * v, 0.01, opt.bus); break; }
      case 'hum': { const f = mtof(opt.note || 67); const o = this._tone(t, 'sine', f, f, 0.42, 0.05 * v, 0.06, opt.bus); try { const l = this.ctx.createOscillator(), lg = this.ctx.createGain(); l.frequency.value = 5.5; lg.gain.value = 4; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 0.6); } catch (e) {} break; }
      case 'bark': {
        const ctx = this.ctx, o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(560, t); o.frequency.exponentialRampToValueAtTime(380, t + 0.12);
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1150; f.Q.value = 2.5;
        const g = ctx.createGain(); this._env(g, t, 0.01, 0.09 * v, 0.12); o.connect(f); f.connect(g); g.connect(this.sBus); o.start(t); o.stop(t + 0.2);
        break;
      }
      case 'sniff': for (let k = 0; k < 3; k++) this._noise(t + k * 0.11, 0.05, 'highpass', 2200, 0.8, 0.04 * v, 0.01); break;
      case 'bounce': this._tone(t, 'sine', 160, 70, 0.1, 0.18 * v, 0.002); break;
      case 'whoosh': { const n = this._noise(t, opt.dur || 0.5, 'bandpass', 500, 1.2, 0.07 * v, 0.08); n.f.frequency.exponentialRampToValueAtTime(2400, t + (opt.dur || 0.5)); break; }
      case 'blanket': { const n = this._noise(t, 0.45, 'lowpass', 900, 0.6, 0.12 * v, 0.06); n.f.frequency.exponentialRampToValueAtTime(250, t + 0.45); break; }
      case 'lantern': this._noise(t, 0.02, 'bandpass', 3000, 3, 0.1 * v); [76, 83, 88].forEach((m, i) => this.sfx('bell', { t: t + 0.08 + i * 0.09, note: m, vol: 0.5 * v })); break;
      case 'lanternOff': this._noise(t, 0.02, 'bandpass', 2500, 3, 0.1 * v); [88, 81].forEach((m, i) => this.sfx('bell', { t: t + 0.05 + i * 0.1, note: m, vol: 0.4 * v })); break;
      case 'munch': for (let k = 0; k < 3; k++) this._noise(t + k * 0.13, 0.05, 'bandpass', 1600 + Math.random() * 500, 1.5, 0.06 * v, 0.005); break;
      case 'sip': this._noise(t, 0.18, 'bandpass', 2500, 2, 0.03 * v, 0.05); break;
      case 'splash': this._noise(t, 0.35, 'bandpass', 1200, 0.7, 0.09 * v, 0.01); break;
      case 'dig': this._noise(t, 0.08, 'lowpass', 1200, 0.7, 0.07 * v, 0.005); break;
      case 'gull': { const ctx = this.ctx; for (let k = 0; k < 2; k++) { const tt = t + k * 0.28, o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(1500, tt); o.frequency.exponentialRampToValueAtTime(1050, tt + 0.22); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 3; const g = ctx.createGain(); this._env(g, tt, 0.02, 0.025 * v, 0.2); o.connect(f); f.connect(g); g.connect(this.aBus); o.start(tt); o.stop(tt + 0.3); } break; }
      case 'chirp': { for (let k = 0; k < 3; k++) this._tone(t + k * 0.09, 'sine', 3800 + Math.random() * 900, 4800, 0.05, 0.02 * v, 0.004, this.aBus); break; }
      case 'cricket': { for (let k = 0; k < 4; k++) this._tone(t + k * 0.05, 'sine', 4300, 4300, 0.025, 0.012 * v, 0.003, this.aBus); break; }
      case 'swing': this._tone(t, 'triangle', 700, 640, 0.25, 0.02 * v, 0.05); break;
      case 'slide': this.sfx('whoosh', { t, dur: 0.8, vol: v }); this._tone(t, 'sine', 500, 900, 0.7, 0.04 * v, 0.05); break;
      case 'hop': this._tone(t, 'sine', 400, 800, 0.1, 0.08 * v); break;
      case 'cheer': [72, 76, 79].forEach((m, i) => this.sfx('bell', { t: t + i * 0.07, note: m, vol: 0.45 * v })); break;
      case 'hatOn': this._tone(t, 'sine', 700, 1050, 0.1, 0.08 * v); this._noise(t, 0.08, 'highpass', 3000, 0.7, 0.03 * v); break;
      case 'sparkle': [84, 88, 91, 96].forEach((m, i) => this.sfx('bell', { t: t + i * 0.05, note: m, vol: 0.25 * v })); break;
    }
  }

  // ---------- ambience ----------
  startAmbience() {
    const ctx = this.ctx;
    const mk = (buf, type, freq, q) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(this.aBus); s.start(0, Math.random() * 2); return { f, g }; };
    this.amb = {
      waves: mk(this.brown, 'lowpass', 650, 0.5),
      wind: mk(this.noise, 'bandpass', 420, 0.6),
      leaves: mk(this.noise, 'highpass', 4200, 0.5),
      room: mk(this.brown, 'lowpass', 220, 0.5),
    };
    this.wavePhase = 0;
  }
  setZone(w, evening) { this.zoneW = w; this.evening = evening; }
  updateAmbience(dt) {
    if (!this.ctx || !this.amb) return;
    const t = this.ctx.currentTime, z = this.zoneW, ev = this.evening;
    this.wavePhase += dt;
    const swell = 0.55 + 0.45 * Math.sin(this.wavePhase * 0.9) * Math.sin(this.wavePhase * 0.37 + 1);
    const waveLvl = (0.05 * z.house + 0.1 * z.garden + 0.2 * z.prom + 0.13 * z.park + 0.42 * z.beach) * (0.6 + 0.6 * swell);
    const windLvl = (0.006 * z.house + 0.03 * z.garden + 0.05 * z.prom + 0.035 * z.park + 0.045 * z.beach) * (1 - ev * 0.6) * (0.6 + 0.5 * Math.sin(this.wavePhase * 0.23));
    const leafLvl = (0.012 * z.garden + 0.01 * z.park) * (0.4 + 0.6 * Math.max(0, Math.sin(this.wavePhase * 0.5)));
    const roomLvl = 0.06 * z.house;
    this.amb.waves.g.gain.setTargetAtTime(waveLvl, t, 0.3);
    this.amb.waves.f.frequency.setTargetAtTime(450 + 500 * swell, t, 0.3);
    this.amb.wind.g.gain.setTargetAtTime(windLvl, t, 0.5);
    this.amb.leaves.g.gain.setTargetAtTime(leafLvl, t, 0.4);
    this.amb.room.g.gain.setTargetAtTime(roomLvl, t, 0.5);
    // sporadic sounds
    const due = (k, a, b) => { if (!this.nextAmb[k]) this.nextAmb[k] = t + a + Math.random() * (b - a); if (t > this.nextAmb[k]) { this.nextAmb[k] = t + a + Math.random() * (b - a); return true; } return false; };
    if (due('gull', 6, 14) && (z.beach + z.prom + z.park) > 0.3 && ev < 0.5) this.sfx('gull', { vol: 0.6 + z.beach });
    if (due('chirp', 4, 10) && (z.garden + z.park) > 0.3 && ev < 0.5) this.sfx('chirp', { vol: 0.8 });
    if (due('clink', 5, 11) && z.house > 0.5 && ev < 0.5) this.sfx('clink', { vol: 0.25, pitch: 0.8 + Math.random() * 0.5 });
    if (due('cricket', 0.6, 1.6) && ev > 0.5) this.sfx('cricket', { vol: 0.7 });
    if (due('glass', 5, 9) && ev > 0.5 && (z.garden > 0.3)) this.sfx('clink', { vol: 0.3, pitch: 1.1 });
  }

  // ---------- call & response music ----------
  startMusic(style = 'day') {
    if (this.music) { this.music.lastHero = this.now(); return; }
    const bpm = style === 'evening' ? 84 : 100;
    const step = 60 / bpm / 2; const t0 = this.now() + 0.15;
    this.music = { style, step, t0, next: t0, idx: 0, level: 0, hits: [], lastHero: -99, heroCount: 0, guest: false, melodyIdx: 0, started: this.now() };
    this.events.push({ t: t0, who: 'sib', kind: 'start' });
  }
  stopMusic() { this.music = null; }
  heroHit(kind) {
    const m = this.music; if (!m) return null;
    const now = this.now();
    let n = Math.ceil((now - m.t0) / m.step); let tt = m.t0 + n * m.step;
    if (tt - now < 0.03) { n++; tt += m.step; }
    m.hits.push({ t: tt, kind }); m.lastHero = now; m.heroCount++;
    return tt;
  }
  updateMusic() {
    const m = this.music; if (!m) return;
    const now = this.now(), ahead = now + 0.14;
    const recentHero = now - m.lastHero < 6;
    m.level = recentHero ? Math.min(3, 1 + Math.floor(m.heroCount / 4)) : 0;
    const scale = m.style === 'evening' ? [55, 57, 60, 62, 64, 67, 69] : [60, 62, 64, 67, 69, 72, 74];
    const root = m.style === 'evening' ? 41 : 43;
    while (m.next < ahead) {
      const s = m.idx % 8, bar = Math.floor(m.idx / 8), t = m.next;
      const snd = !!this.ctx;
      // sibling's two-beat call: steps 0 and 2
      if (s === 0 || s === 2) { if (snd) this.sfx(m.style === 'evening' ? 'pluck' : 'drum', { t, note: s === 0 ? root + 19 : root + 24, vol: 0.9 }); this.events.push({ t, who: 'sib', kind: 'hit' }); }
      if (m.level >= 1 && (s % 2 === 1)) { if (snd) this.sfx('clap', { t, vol: m.style === 'evening' ? 0.5 : 0.8 }); this.events.push({ t, who: 'papa', kind: 'clap' }); }
      if (m.level >= 1 && (s === 0 || s === 4)) { if (snd) this.sfx('bass', { t, note: root + (s === 4 ? 7 : 0) + ((bar % 4) === 2 ? 5 : 0), bus: this.mBus }); }
      if (m.level >= 2 && (s === 4 || s === 6) && bar % 2 === 1) { const nn = scale[(m.melodyIdx++ * 3) % scale.length] + 12; if (snd) this.sfx('hum', { t, note: nn, bus: this.mBus }); this.events.push({ t, who: 'mama', kind: 'hum' }); }
      if (m.level >= 2 && m.guest) { if (snd) this.sfx('shaker', { t, vol: s % 2 ? 0.6 : 1 }); if (s % 2 === 0) this.events.push({ t, who: 'guest', kind: 'shake' }); }
      if (m.level === 0 && s === 4 && bar % 2 === 0) { if (snd) this.sfx('bass', { t, note: root, vol: 0.5, bus: this.mBus }); }
      m.next += m.step; m.idx++;
    }
    // hero hits
    for (let i = m.hits.length - 1; i >= 0; i--) {
      const h = m.hits[i];
      if (h.t < ahead) {
        if (this.ctx) {
          if (h.kind === 'tamb') this.sfx('tamb', { t: h.t });
          else if (h.kind === 'drum') this.sfx('drum', { t: h.t, vol: 0.7 });
          else if (h.kind === 'clap') this.sfx('clap', { t: h.t });
          else { const k = (m.heroCount + i) % PENTA.length; this.sfx(m.style === 'evening' ? 'pluck' : 'bell', { t: h.t, note: 67 + PENTA[k % 7], bus: this.mBus }); }
        }
        this.events.push({ t: h.t, who: 'hero', kind: h.kind });
        m.hits.splice(i, 1);
      }
    }
  }
  drainEvents() {
    const now = this.now(), out = [];
    this.events = this.events.filter((e) => { if (e.t <= now) { out.push(e); return false; } return true; });
    return out;
  }
  update(dt) { this.updateVoice(); this.updateAmbience(dt); this.updateMusic(); }
}
