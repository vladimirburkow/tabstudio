/* Ритмы: синтез ударных и перкуссии (Web Audio), точный планировщик, драм-машина, визуализация установки, рудименты */
(function (root) {
  'use strict';
  const DD = root.GTSDrumData, Au = root.GTSAudio;
  const App = () => root.App;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const VEL = { '.': 0, x: 0.78, X: 1, g: 0.3 };

  /* =============== synthesis =============== */
  const Synth = {
    ctx: null, out: null, noiseBuf: null, openHat: null,
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; }
      const ctx = Au.ensure();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.ratio.value = 3; comp.attack.value = 0.003; comp.release.value = 0.12;
      this.out = ctx.createGain(); this.out.gain.value = 0.85;
      this.out.connect(comp); comp.connect(Au.master || ctx.destination);
      const n = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, n, n);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      return ctx;
    },
    env(t, peak, attack, decay, curve) {
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
      void curve;
      return g;
    },
    noise(t, dur, filters, gainNode) {
      const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
      let node = s;
      for (const [type, f, q] of filters) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; node.connect(b); node = b; }
      node.connect(gainNode); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
      return s;
    },
    tone(t, type, f0, f1, dur, gainNode, sweep) {
      const o = this.ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + (sweep || dur));
      o.connect(gainNode); o.start(t); o.stop(t + dur + 0.05);
      return o;
    },
    hit(inst, t, vel) {
      const c = this.init();
      t = Math.max(t, c.currentTime);
      vel = Math.max(0.05, Math.min(1.2, vel || 0.8));
      const out = this.out;
      const G = (peak, a, dcy) => { const g = this.env(t, peak * vel, a, dcy); g.connect(out); return g; };
      switch (inst) {
        case 'kick': { const g = G(1.1, 0.002, 0.42); this.tone(t, 'sine', 155, 44, 0.45, g, 0.11); const c2 = G(0.35, 0.001, 0.02); this.noise(t, 0.02, [['highpass', 1500]], c2); break; }
        case 'sub': { const g = G(0.95, 0.004, 1.1); this.tone(t, 'sine', 70, 46, 1.15, g, 0.08); break; }
        case 'snare': { const g = G(0.75, 0.001, 0.2); this.noise(t, 0.22, [['highpass', 900], ['lowpass', 9000]], g); const b = G(0.5, 0.001, 0.09); this.tone(t, 'triangle', 220, 175, 0.1, b); break; }
        case 'rim': { const g = G(0.6, 0.0005, 0.045); this.tone(t, 'square', 1750, 1700, 0.05, g); const n = G(0.25, 0.0005, 0.02); this.noise(t, 0.03, [['bandpass', 3000, 2]], n); break; }
        case 'clap': { [0, 0.011, 0.022].forEach((dt, i) => { const g = this.env(t + dt, 0.55 * vel, 0.001, i === 2 ? 0.16 : 0.012); g.connect(out); this.noise(t + dt, i === 2 ? 0.2 : 0.02, [['bandpass', 1300, 1.1]], g); }); break; }
        case 'hhc': case 'hhp': { this.chokeHat(t); const g = G(inst === 'hhp' ? 0.25 : 0.4, 0.0005, inst === 'hhp' ? 0.04 : 0.055); this.noise(t, 0.08, [['highpass', 7500], ['bandpass', 10000, 0.8]], g); break; }
        case 'hho': { this.chokeHat(t); const g = G(0.38, 0.001, 0.45); this.noise(t, 0.5, [['highpass', 7000], ['bandpass', 9500, 0.7]], g); this.openHat = g; break; }
        case 'ride': { const g = G(0.22, 0.001, 0.9); this.noise(t, 1, [['highpass', 5500], ['bandpass', 7500, 1.5]], g); const p = G(0.12, 0.001, 0.6); [3150, 4270, 5110].forEach((f) => this.tone(t, 'square', f, f, 0.6, p)); break; }
        case 'crash': { const g = G(0.5, 0.002, 1.6); this.noise(t, 1.7, [['highpass', 3500]], g); break; }
        case 'tomh': case 'tomm': case 'tomf': { const f = { tomh: [240, 170], tomm: [175, 120], tomf: [120, 80] }[inst]; const g = G(0.9, 0.002, 0.42); this.tone(t, 'sine', f[0], f[1], 0.45, g, 0.25); const n = G(0.12, 0.001, 0.05); this.noise(t, 0.06, [['lowpass', 3000]], n); break; }
        case 'cowbell': { const g = G(0.32, 0.001, 0.28); const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2640; bp.Q.value = 1; bp.connect(g); [540, 800].forEach((f) => this.tone(t, 'square', f, f, 0.3, bp)); break; }
        case 'agogoh': case 'agogol': { const f = inst === 'agogoh' ? 1080 : 760; const g = G(0.4, 0.001, 0.32); this.tone(t, 'sine', f, f, 0.34, g); const h = G(0.14, 0.001, 0.15); this.tone(t, 'sine', f * 2.7, f * 2.7, 0.2, h); break; }
        case 'claves': { const g = G(0.6, 0.0005, 0.06); this.tone(t, 'sine', 2500, 2450, 0.07, g); break; }
        case 'shaker': { const g = this.env(t, 0.22 * vel, 0.012, 0.05); g.connect(out); this.noise(t, 0.08, [['bandpass', 6500, 1.2]], g); break; }
        case 'tamb': { const g = G(0.3, 0.001, 0.18); this.noise(t, 0.22, [['highpass', 7000], ['bandpass', 9000, 3]], g); break; }
        case 'guiro': { for (let k = 0; k < 7; k++) { const g = this.env(t + k * 0.016, 0.22 * vel, 0.002, 0.012); g.connect(out); this.noise(t + k * 0.016, 0.02, [['bandpass', 3400, 4]], g); } break; }
        case 'congah': case 'congal': { const f = inst === 'congah' ? [380, 330] : [240, 200]; const g = G(0.75, 0.002, 0.24); this.tone(t, 'sine', f[0], f[1], 0.26, g, 0.06); break; }
        case 'bongoh': case 'bongol': { const f = inst === 'bongoh' ? [560, 500] : [400, 360]; const g = G(0.65, 0.001, 0.13); this.tone(t, 'sine', f[0], f[1], 0.15, g, 0.04); break; }
        case 'timbh': case 'timbl': { const f = inst === 'timbh' ? 900 : 620; const g = G(0.45, 0.001, 0.32); this.tone(t, 'triangle', f, f * 0.97, 0.34, g); const n = G(0.18, 0.001, 0.1); this.noise(t, 0.12, [['bandpass', 4000, 1.5]], n); break; }
        default: break;
      }
    },
    chokeHat(t) {
      if (!this.openHat) return;
      try { this.openHat.gain.cancelScheduledValues(t); this.openHat.gain.setTargetAtTime(0.0001, t, 0.01); } catch (e) { /* ignore */ }
      this.openHat = null;
    }
  };

  /* =============== sequencer (lookahead scheduler) =============== */
  const Seq = {
    playing: false, timer: null, step: 0, nextTime: 0, events: [], onStep: null, onHit: null,
    pattern: null, mutes: {}, solos: {}, metronome: false, loopsLeft: Infinity, extra: null,
    stepCount(p) { return p.bars * p.beats * p.sub; },
    start(p, opts) {
      opts = opts || {};
      this.stop();
      const c = Synth.init();
      this.pattern = p; this.playing = true; this.step = 0; this.events = [];
      this.nextTime = c.currentTime + 0.08;
      this.extra = opts.extra || null; // extra callback per step (bass line)
      this.timer = setInterval(() => this.tick(), 25);
      this.tick();
      const raf = () => { if (!this.playing) return; this.flush(); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    },
    stop() {
      this.playing = false; clearInterval(this.timer); this.timer = null; this.events = [];
      if (this.onStep) this.onStep(-1);
    },
    tick() {
      const c = Synth.ctx, p = this.pattern;
      if (!p) return;
      const n = this.stepCount(p);
      const stepDur = 60 / p.bpm / p.sub;
      const anySolo = Object.keys(this.solos).some((k) => this.solos[k]);
      while (this.nextTime < c.currentTime + 0.12) {
        const i = this.step % n;
        let t = this.nextTime;
        if (p.swing && (p.sub === 4 || p.sub === 2) && i % 2 === 1) t += stepDur * (p.swing / 100) * 0.66;
        const hits = [];
        for (const inst in p.t) {
          const ch = p.t[inst][i] || '.';
          const v = VEL[ch] || 0;
          if (!v || this.mutes[inst] || (anySolo && !this.solos[inst])) continue;
          Synth.hit(inst, t, v * (0.94 + Math.random() * 0.08));
          hits.push(inst);
        }
        if (this.metronome && i % p.sub === 0) { const g = Synth.env(t, i % (p.sub * p.beats) === 0 ? 0.35 : 0.2, 0.001, 0.04); g.connect(Synth.out); Synth.tone(t, 'sine', i % (p.sub * p.beats) === 0 ? 1600 : 1100, null, 0.05, g); }
        if (this.extra) this.extra(i, t, stepDur);
        this.events.push({ t, i, hits });
        this.nextTime += stepDur;
        this.step++;
      }
    },
    flush() {
      const now = Synth.ctx.currentTime;
      while (this.events.length && this.events[0].t <= now) {
        const e = this.events.shift();
        if (this.onStep) this.onStep(e.i);
        if (this.onHit) this.onHit(e.hits);
      }
    }
  };

  /* =============== visualization: drum kit (top view) =============== */
  const KIT = [
    { id: 'crash', insts: ['crash'], shape: 'cym', x: 128, y: 82, r: 62, label: 'Крэш' },
    { id: 'ride', insts: ['ride'], shape: 'cym', x: 492, y: 96, r: 70, label: 'Райд' },
    { id: 'hh', insts: ['hhc', 'hho', 'hhp'], shape: 'cym', x: 66, y: 214, r: 48, label: 'Хай-хэт' },
    { id: 'tomh', insts: ['tomh'], shape: 'drum', x: 246, y: 128, r: 40, label: 'Том 1' },
    { id: 'tomm', insts: ['tomm'], shape: 'drum', x: 352, y: 124, r: 43, label: 'Том 2' },
    { id: 'snare', insts: ['snare', 'rim'], shape: 'drum', x: 182, y: 262, r: 52, label: 'Малый' },
    { id: 'tomf', insts: ['tomf'], shape: 'drum', x: 466, y: 262, r: 60, label: 'Напольный' },
    { id: 'kick', insts: ['kick', 'sub'], shape: 'kick', x: 312, y: 268, r: 74, label: 'Бочка' },
    { id: 'clap', insts: ['clap'], shape: 'pad', x: 590, y: 222, r: 30, label: 'Хлопок' }
  ];
  const PERC = [
    { id: 'congas', insts: ['congah', 'congal'], label: 'Конги' },
    { id: 'bongos', insts: ['bongoh', 'bongol'], label: 'Бонго' },
    { id: 'timbales', insts: ['timbh', 'timbl'], label: 'Тимбалес' },
    { id: 'cowbell', insts: ['cowbell'], label: 'Ковбелл' },
    { id: 'agogo', insts: ['agogoh', 'agogol'], label: 'Агого' },
    { id: 'claves', insts: ['claves'], label: 'Клавес' },
    { id: 'shaker', insts: ['shaker'], label: 'Маракас' },
    { id: 'tamb', insts: ['tamb'], label: 'Тамбурин' },
    { id: 'guiro', insts: ['guiro'], label: 'Гуиро' }
  ];
  function kitSvg() {
    let s = `<svg viewBox="0 0 640 360" class="kit" role="img" aria-label="Ударная установка: нажмите на барабан, чтобы ударить">
      <defs><radialGradient id="cymg" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#e9c46a" stop-opacity=".95"/><stop offset=".55" stop-color="#b8892b" stop-opacity=".85"/><stop offset="1" stop-color="#6d5017" stop-opacity=".9"/></radialGradient>
      <radialGradient id="headg" cx="50%" cy="40%" r="65%"><stop offset="0" stop-color="#f4f1ea"/><stop offset="1" stop-color="#cfc9bb"/></radialGradient></defs>`;
    for (const k of KIT) {
      const data = `data-piece="${k.id}" data-insts="${k.insts.join(',')}" tabindex="0" role="button" aria-label="${k.label}"`;
      if (k.shape === 'cym') {
        s += `<g class="pc cym" ${data}><circle cx="${k.x}" cy="${k.y}" r="${k.r}" fill="url(#cymg)"/>${[0.75, 0.5].map((f) => `<circle cx="${k.x}" cy="${k.y}" r="${k.r * f}" fill="none" class="groove"/>`).join('')}<circle cx="${k.x}" cy="${k.y}" r="${k.r * 0.16}" class="bell"/><text x="${k.x}" y="${k.y + k.r + 15}">${k.label}</text></g>`;
      } else if (k.shape === 'kick') {
        s += `<g class="pc kickp" ${data}><rect x="${k.x - k.r * 1.05}" y="${k.y - k.r * 0.55}" width="${k.r * 2.1}" height="${k.r * 1.1}" rx="16" class="shell"/><ellipse cx="${k.x}" cy="${k.y + k.r * 0.55}" rx="${k.r}" ry="${k.r * 0.2}" class="head"/><text x="${k.x}" y="${k.y + 6}">${k.label}</text></g>`;
      } else if (k.shape === 'pad') {
        s += `<g class="pc padp" ${data}><rect x="${k.x - k.r}" y="${k.y - k.r}" width="${k.r * 2}" height="${k.r * 2}" rx="10" class="pad"/><text x="${k.x}" y="${k.y + 5}" class="sm">${k.label}</text></g>`;
      } else {
        s += `<g class="pc drum" ${data}><circle cx="${k.x}" cy="${k.y}" r="${k.r + 6}" class="shell"/><circle cx="${k.x}" cy="${k.y}" r="${k.r}" fill="url(#headg)" class="head"/><circle cx="${k.x}" cy="${k.y}" r="${k.r * 0.22}" class="dot"/><text x="${k.x}" y="${k.y + k.r + 22}">${k.label}</text></g>`;
      }
    }
    return s + '</svg>';
  }
  function percSvg(used) {
    const list = PERC.filter((p) => p.insts.some((i) => used.has(i)));
    if (!list.length) return '';
    const W = 120;
    let s = `<svg viewBox="0 0 ${list.length * W} 130" class="kit perc" role="img" aria-label="Перкуссия">`;
    list.forEach((p, i) => {
      const x = i * W + W / 2;
      const data = `data-insts="${p.insts.join(',')}" tabindex="0" role="button" aria-label="${p.label}"`;
      s += `<g class="pc" ${data}>`;
      if (p.id === 'congas' || p.id === 'bongos' || p.id === 'timbales') {
        const r = p.id === 'congas' ? 22 : p.id === 'bongos' ? 15 : 19;
        p.insts.forEach((inst, j) => { const cx = x - 26 + j * 52; s += `<g class="sub" data-insts="${inst}"><circle cx="${cx}" cy="58" r="${r + 4}" class="shell"/><circle cx="${cx}" cy="58" r="${r}" fill="url(#headg)" class="head"/></g>`; });
      } else if (p.id === 'cowbell') s += `<path d="M${x - 18} 30 L${x + 18} 30 L${x + 26} 86 L${x - 26} 86 Z" class="metal"/>`;
      else if (p.id === 'agogo') s += p.insts.map((inst, j) => `<g class="sub" data-insts="${inst}"><path d="M${x - 30 + j * 30} 34 L${x - 14 + j * 30} 34 L${x - 6 + j * 30} ${j ? 80 : 90} L${x - 38 + j * 30} ${j ? 80 : 90} Z" class="metal"/></g>`).join('');
      else if (p.id === 'claves') s += `<rect x="${x - 34}" y="44" width="68" height="10" rx="5" class="wood" transform="rotate(-18 ${x} 50)"/><rect x="${x - 34}" y="62" width="68" height="10" rx="5" class="wood" transform="rotate(14 ${x} 66)"/>`;
      else if (p.id === 'shaker') s += `<ellipse cx="${x - 10}" cy="52" rx="16" ry="20" class="wood"/><rect x="${x - 12}" y="70" width="5" height="26" class="wood"/><ellipse cx="${x + 16}" cy="56" rx="14" ry="18" class="wood"/>`;
      else if (p.id === 'tamb') s += `<circle cx="${x}" cy="58" r="30" class="shell"/>${Array.from({ length: 8 }, (_, k) => `<circle cx="${x + 30 * Math.cos(k * Math.PI / 4)}" cy="${58 + 30 * Math.sin(k * Math.PI / 4)}" r="6" class="metal"/>`).join('')}`;
      else if (p.id === 'guiro') s += `<ellipse cx="${x}" cy="58" rx="40" ry="18" class="wood"/>${Array.from({ length: 9 }, (_, k) => `<line x1="${x - 28 + k * 7}" y1="44" x2="${x - 28 + k * 7}" y2="72" class="ridge"/>`).join('')}`;
      s += `<text x="${x}" y="118">${p.label}</text></g>`;
    });
    return s + '</svg>';
  }
  function flash(el, insts) {
    if (!el || !insts.length) return;
    for (const inst of insts) {
      $$(`[data-insts~="${inst}"], [data-insts*="${inst}"]`, el).forEach((g) => {
        if (!g.dataset.insts.split(',').includes(inst)) return;
        g.classList.remove('hit'); void g.getBBox; g.classList.add('hit');
        clearTimeout(g._t); g._t = setTimeout(() => g.classList.remove('hit'), 140);
      });
    }
  }

  /* =============== MIDI export =============== */
  function patternMidi(p) {
    const PPQ = 480, perStep = PPQ / p.sub;
    const vlq = (n) => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
    const ev = [];
    const n = p.bars * p.beats * p.sub;
    for (let rep = 0; rep < 4; rep++) for (const inst in p.t) for (let i = 0; i < n; i++) {
      const v = VEL[p.t[inst][i] || '.']; if (!v) continue;
      const tick = (rep * n + i) * perStep;
      ev.push([tick, 0x99, DD.INSTR[inst].midi, Math.round(v * 115)], [tick + perStep / 2, 0x89, DD.INSTR[inst].midi, 0]);
    }
    ev.sort((a, b) => a[0] - b[0] || (a[1] === 0x89 ? -1 : 1));
    const tempo = Math.round(60000000 / p.bpm);
    const d = [0, 0xff, 0x51, 3, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255, 0, 0xff, 0x58, 4, p.beats, 2, 24, 8];
    let last = 0;
    ev.forEach(([t, st, note, vel]) => { d.push(...vlq(Math.round(t - last)), st, note, vel); last = Math.round(t); });
    d.push(0, 0xff, 0x2f, 0);
    const chunk = (id, data) => [...id].map((c) => c.charCodeAt(0)).concat([(data.length >>> 24) & 255, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255], data);
    return new Uint8Array([...chunk('MThd', [0, 0, 0, 1, (PPQ >> 8) & 255, PPQ & 255]), ...chunk('MTrk', d)]);
  }

  /* =============== UI =============== */
  const clone = (p) => JSON.parse(JSON.stringify(p));
  const Drums = {
    st: { sel: 'backbeat', cur: null, dirty: false, q: '', rud: 0, rudBpm: 70, rudClick: true, rudLeft: false, view: 'beats' },
    Synth, Seq, KIT, kitSvg,
    custom() { return (root.GTSStore.meta().drumPatterns || []); },
    all() { return DD.PATTERNS.concat(this.custom().map((p) => Object.assign({ cat: 'Мои ритмы', custom: true }, p))); },
    find(id) { return this.all().find((p) => p.id === id); },
    render(main, route) {
      const tabs = [['drums', 'Ритмы'], ['drums-rudiments', '40 рудиментов']];
      main.innerHTML = `<header class="page-head"><div><p class="eyebrow">Ударные</p><h1>${route === 'drums' ? 'Барабанные ритмы' : 'Рудименты'}</h1></div></header>
        <nav class="subtabs" aria-label="Разделы">${tabs.map(([r, l]) => `<a href="#${r}" aria-current="${r === route ? 'page' : 'false'}">${l}</a>`).join('')}</nav>
        <div id="dm-body"></div>`;
      if (route === 'drums') this.beats($('#dm-body')); else this.rudiments($('#dm-body'));
    },
    leave() { Seq.stop(); Seq.onStep = null; Seq.onHit = null; Seq.extra = null; },

    /* ---------- beats ---------- */
    beats(el) {
      const st = this.st;
      if (!st.cur || st.cur.id !== st.sel) { const p = this.find(st.sel) || DD.PATTERNS[1]; st.cur = clone(p); st.sel = p.id; st.dirty = false; Seq.mutes = {}; Seq.solos = {}; }
      const p = st.cur;
      const cats = {};
      this.all().filter((x) => !st.q || (x.name + ' ' + x.cat).toLowerCase().includes(st.q.toLowerCase())).forEach((x) => (cats[x.cat] = cats[x.cat] || []).push(x));
      const n = p.bars * p.beats * p.sub;
      const rows = DD.ORDER.filter((k) => p.t[k] !== undefined);
      const used = new Set(rows);
      const counts = p.sub === 4 ? ['', 'e', '+', 'a'] : p.sub === 3 ? ['', '+', 'a'] : p.sub === 2 ? ['', '+'] : ['', '2', '3', '4', '5', '6'];
      el.innerHTML = `<div class="dm">
        <aside class="dm-list"><input type="search" id="dm-q" placeholder="Поиск ритма" value="${esc(st.q)}" aria-label="Поиск ритма">
          ${Object.entries(cats).map(([c, list]) => `<h3>${esc(c)}</h3>${list.map((x) => `<button class="dm-item ${x.id === st.sel ? 'on' : ''}" data-pat="${esc(x.id)}"><span>${esc(x.name)}</span><small class="mono">${x.bpm}</small></button>`).join('')}`).join('') || '<p class="muted small">Ничего не найдено.</p>'}
        </aside>
        <section class="dm-main">
          <div class="dm-head"><div><h2>${esc(p.name)}${st.dirty ? ' <span class="pill">изменён</span>' : ''}</h2><p class="muted small">${esc(p.d || '')}</p></div>
            <div class="row wrap"><button class="btn lg" id="dm-play">${Seq.playing ? '■ Стоп' : '▶ Играть'}</button></div></div>
          <div class="dm-ctl row wrap">
            <label>Темп <output id="dm-bpm-o" class="mono">${p.bpm}</output><input type="range" id="dm-bpm" min="40" max="220" value="${p.bpm}"></label>
            <label>Свинг <output id="dm-sw-o" class="mono">${p.swing}%</output><input type="range" id="dm-sw" min="0" max="60" value="${p.swing}" ${p.sub === 4 || p.sub === 2 ? '' : 'disabled'}></label>
            <label>Размер<select id="dm-beats">${[2, 3, 4, 5, 6, 7].map((b) => `<option ${b === p.beats ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
            <label>Деление доли<select id="dm-sub">${[[2, 'восьмые'], [3, 'триоли'], [4, 'шестнадцатые'], [6, 'секстоли']].map(([v, l]) => `<option value="${v}" ${v === p.sub ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label>Тактов<select id="dm-bars">${[1, 2, 4].map((b) => `<option ${b === p.bars ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
            <label class="check"><input type="checkbox" id="dm-click" ${Seq.metronome ? 'checked' : ''}> Метроном</label>
          </div>
          <div class="kit-wrap">${kitSvg()}${percSvg(used)}</div>
          <div class="seq-wrap"><div class="seq" style="--n:${n}">
            <div class="seq-row seq-count"><span class="seq-lab"></span>${Array.from({ length: n }, (_, i) => `<span class="cnt ${i % p.sub === 0 ? 'beat' : ''} ${i % (p.sub * p.beats) === 0 ? 'bar' : ''}">${i % p.sub === 0 ? (Math.floor(i / p.sub) % p.beats) + 1 : counts[i % p.sub] || ''}</span>`).join('')}</div>
            ${rows.map((k) => `<div class="seq-row" data-row="${k}"><span class="seq-lab"><button class="ms ${Seq.mutes[k] ? 'on' : ''}" data-mute="${k}" title="Выключить">M</button><button class="ms ${Seq.solos[k] ? 'on' : ''}" data-solo="${k}" title="Соло">S</button><button class="lab-name" data-tap="${k}" title="Нажмите, чтобы услышать">${esc(DD.INSTR[k].ru)}</button><button class="rm" data-rm="${k}" aria-label="Убрать ${esc(DD.INSTR[k].ru)}">✕</button></span>${Array.from({ length: n }, (_, i) => { const ch = p.t[k][i] || '.'; return `<button class="cell v-${ch === '.' ? 'o' : ch} ${i % p.sub === 0 ? 'beat' : ''} ${i % (p.sub * p.beats) === 0 ? 'bar' : ''}" data-c="${k}:${i}" aria-label="${esc(DD.INSTR[k].ru)}, шаг ${i + 1}"></button>`; }).join('')}</div>`).join('')}
          </div></div>
          <div class="row wrap dm-tools">
            <select id="dm-add" aria-label="Добавить инструмент"><option value="">+ Инструмент</option>${DD.ORDER.filter((k) => !used.has(k)).map((k) => `<option value="${k}">${esc(DD.INSTR[k].ru)}</option>`).join('')}</select>
            <button class="btn sm ghost" id="dm-clear">Очистить</button>
            ${st.dirty && !p.custom ? '<button class="btn sm ghost" id="dm-reset">Вернуть исходный</button>' : ''}
            <button class="btn sm" id="dm-save">${p.custom ? 'Сохранить изменения' : 'Сохранить как свой ритм'}</button>
            ${p.custom ? '<button class="btn sm danger" id="dm-del">Удалить ритм</button>' : ''}
            <button class="btn sm ghost" id="dm-midi">Экспорт MIDI</button>
            <span class="muted small">Клик по клетке: удар → акцент → тихий удар → пусто. По барабану на картинке можно стучать.</span>
          </div>
        </section></div>`;
      const kitEl = $('.kit-wrap', el);
      Seq.onStep = (i) => { $$('.cell.now, .cnt.now', el).forEach((c) => c.classList.remove('now')); if (i < 0) return; $$(`[data-c$=":${i}"]`, el).forEach((c) => c.classList.add('now')); const cn = $$('.cnt', el)[i]; if (cn) cn.classList.add('now'); };
      Seq.onHit = (h) => flash(kitEl, h);
      const restart = () => { if (Seq.playing) { Seq.pattern = p; } };
      const changed = () => { st.dirty = true; restart(); };
      $('#dm-q', el).oninput = (e) => { st.q = e.target.value; clearTimeout(this._qt); this._qt = setTimeout(() => { this.beats(el); const q = $('#dm-q', el); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 200); };
      $$('[data-pat]', el).forEach((b) => (b.onclick = () => { st.sel = b.dataset.pat; st.cur = null; const was = Seq.playing; this.beats(el); if (was) Seq.start(st.cur); }));
      $('#dm-play', el).onclick = () => { if (Seq.playing) { Seq.stop(); } else { try { Seq.start(p); } catch (e) { App().toast('Звук недоступен: ' + e.message, 'err'); } } $('#dm-play', el).textContent = Seq.playing ? '■ Стоп' : '▶ Играть'; };
      $('#dm-bpm', el).oninput = (e) => { p.bpm = +e.target.value; $('#dm-bpm-o', el).textContent = p.bpm; st.dirty = true; };
      $('#dm-sw', el).oninput = (e) => { p.swing = +e.target.value; $('#dm-sw-o', el).textContent = p.swing + '%'; st.dirty = true; };
      $('#dm-click', el).onchange = (e) => { Seq.metronome = e.target.checked; };
      const reshape = (beats, sub, bars) => {
        const old = clone(p), oldBeats = old.bars * old.beats;
        p.beats = beats; p.sub = sub; p.bars = bars;
        const nn = bars * beats * sub;
        for (const k in p.t) {
          let s = '';
          for (let i = 0; i < nn; i++) {
            // keep notes that land on the same musical position; repeat the old loop when the new one is longer
            const j = ((i / sub) % oldBeats) * old.sub;
            s += Math.abs(j - Math.round(j)) < 1e-6 ? (old.t[k][Math.round(j)] || '.') : '.';
          }
          p.t[k] = s;
        }
        changed(); this.beats(el);
      };
      $('#dm-beats', el).onchange = (e) => reshape(+e.target.value, p.sub, p.bars);
      $('#dm-sub', el).onchange = (e) => { const v = +e.target.value; if (v !== 4 && v !== 2) p.swing = 0; reshape(p.beats, v, p.bars); };
      $('#dm-bars', el).onchange = (e) => reshape(p.beats, p.sub, +e.target.value);
      const cyc = { '.': 'x', x: 'X', X: 'g', g: '.' };
      $$('.cell', el).forEach((c) => {
        c.onclick = () => {
          const [k, i] = c.dataset.c.split(':'); const idx = +i;
          const ch = cyc[p.t[k][idx] || '.'];
          p.t[k] = p.t[k].slice(0, idx) + ch + p.t[k].slice(idx + 1);
          c.className = c.className.replace(/v-\S+/, 'v-' + (ch === '.' ? 'o' : ch));
          if (ch !== '.') { Synth.hit(k, 0, VEL[ch]); flash(kitEl, [k]); }
          changed();
          const h = $('.dm-head h2', el); if (h && !h.querySelector('.pill')) h.insertAdjacentHTML('beforeend', ' <span class="pill">изменён</span>');
        };
        c.oncontextmenu = (e) => { e.preventDefault(); const [k, i] = c.dataset.c.split(':'); const idx = +i; p.t[k] = p.t[k].slice(0, idx) + '.' + p.t[k].slice(idx + 1); c.className = c.className.replace(/v-\S+/, 'v-o'); changed(); };
      });
      $$('[data-mute]', el).forEach((b) => (b.onclick = () => { const k = b.dataset.mute; Seq.mutes[k] = !Seq.mutes[k]; b.classList.toggle('on', Seq.mutes[k]); }));
      $$('[data-solo]', el).forEach((b) => (b.onclick = () => { const k = b.dataset.solo; Seq.solos[k] = !Seq.solos[k]; b.classList.toggle('on', Seq.solos[k]); }));
      $$('[data-tap]', el).forEach((b) => (b.onclick = () => { Synth.hit(b.dataset.tap, 0, 0.9); flash(kitEl, [b.dataset.tap]); }));
      $$('[data-rm]', el).forEach((b) => (b.onclick = () => { delete p.t[b.dataset.rm]; changed(); this.beats(el); }));
      $$('.kit .pc', el).forEach((g) => {
        const strike = (e) => { const sub = e && e.target.closest('.sub'); const inst = (sub ? sub.dataset.insts : g.dataset.insts).split(',')[0]; Synth.hit(inst, 0, 0.95); flash(kitEl, [inst]); };
        g.addEventListener('pointerdown', strike);
        g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); strike(); } });
      });
      $('#dm-add', el).onchange = (e) => { const k = e.target.value; if (!k) return; p.t[k] = '.'.repeat(n); changed(); this.beats(el); };
      $('#dm-clear', el).onclick = () => { for (const k in p.t) p.t[k] = '.'.repeat(n); changed(); this.beats(el); };
      const rs = $('#dm-reset', el); if (rs) rs.onclick = () => { st.cur = null; this.beats(el); };
      $('#dm-save', el).onclick = () => {
        const list = this.custom().slice();
        if (p.custom) { const i = list.findIndex((x) => x.id === p.id); const c = clone(p); delete c.custom; delete c.cat; list[i] = c; root.GTSStore.setMeta({ drumPatterns: list }); st.dirty = false; App().toast('Ритм сохранён.'); this.beats(el); return; }
        App().prompt('Сохранить как свой ритм', p.name + ' (мой)', 'Ритм появится в разделе «Мои ритмы» и синхронизируется с аккаунтом.', (name) => {
          const c = clone(p); c.id = 'u_' + Date.now().toString(36); c.name = (name || '').trim().slice(0, 60) || 'Мой ритм'; delete c.custom; delete c.cat; c.d = c.d || '';
          root.GTSStore.setMeta({ drumPatterns: list.concat([c]) });
          st.sel = c.id; st.cur = null; this.beats(el); App().toast('Ритм сохранён в «Мои ритмы».');
        });
      };
      const dl = $('#dm-del', el); if (dl) dl.onclick = () => App().confirm('Удалить ритм?', `«${p.name}» будет удалён из «Мои ритмы».`, 'Удалить', () => { root.GTSStore.setMeta({ drumPatterns: this.custom().filter((x) => x.id !== p.id) }); st.sel = 'backbeat'; st.cur = null; this.beats(el); }, true);
      $('#dm-midi', el).onclick = () => App().saveExport((p.name || 'beat').replace(/[\\/:*?"<>|]+/g, '') + '.mid', patternMidi(p));
    },

    /* ---------- rudiments ---------- */
    rudiments(el) {
      const st = this.st, R = DD.RUDIMENTS[st.rud];
      const cats = {};
      DD.RUDIMENTS.forEach((r, i) => (cats[r.cat] = cats[r.cat] || []).push([r, i]));
      const hand = (h) => (st.rudLeft ? (h === 'R' ? 'L' : 'R') : h);
      el.innerHTML = `<div class="dm">
        <aside class="dm-list">${Object.entries(cats).map(([c, list]) => `<h3>${esc(c)}</h3>${list.map(([r, i]) => `<button class="dm-item ${i === st.rud ? 'on' : ''}" data-rud="${i}"><span><span class="mono muted">${r.n}.</span> ${esc(r.name)}</span></button>`).join('')}`).join('')}</aside>
        <section class="dm-main">
          <div class="dm-head"><div><h2>${R.n}. ${esc(R.name)}</h2><p class="muted small">${esc(R.cat)} · ${({ 2: 'восьмые', 3: 'триоли', 4: 'шестнадцатые', 6: 'секстоли', 8: 'тридцать вторые' })[R.sub]} · учите ведущей рукой, затем слабой</p></div>
            <button class="btn lg" id="rd-play">${Seq.playing ? '■ Стоп' : '▶ Играть'}</button></div>
          <div class="dm-ctl row wrap">
            <label>Темп <output id="rd-bpm-o" class="mono">${st.rudBpm}</output><input type="range" id="rd-bpm" min="30" max="180" value="${st.rudBpm}"></label>
            <label class="check"><input type="checkbox" id="rd-click" ${st.rudClick ? 'checked' : ''}> Метроном</label>
            <label class="check"><input type="checkbox" id="rd-left" ${st.rudLeft ? 'checked' : ''}> С левой руки</label>
          </div>
          <div class="sticking" style="--n:${R.steps.length}">${R.steps.map((s, i) => `<div class="stk ${i % R.sub === 0 ? 'beat' : ''}" data-s="${i}">${s ? `<span class="acc">${s.accent ? '>' : ''}</span><span class="grace">${s.flam ? (hand(s.hand) === 'R' ? 'l' : 'r') : s.drag ? (hand(s.hand) === 'R' ? 'll' : 'rr') : s.buzz ? 'z' : ''}</span><b class="${hand(s.hand)}">${hand(s.hand)}</b>` : '<b class="rest">·</b>'}<small>${i % R.sub === 0 ? Math.floor(i / R.sub) + 1 : ''}</small></div>`).join('')}</div>
          <div class="hands"><div class="hand-pad" data-h="L"><span>L</span><small>левая</small></div><div class="hand-pad" data-h="R"><span>R</span><small>правая</small></div></div>
          <p class="muted small">Строчные буквы — форшлаг (флэм или драг) другой рукой, «&gt;» — акцент, z — многоударный удар. Начните медленно и ровно, ускоряйтесь по 5 BPM.</p>
        </section></div>`;
      $$('[data-rud]', el).forEach((b) => (b.onclick = () => { st.rud = +b.dataset.rud; const was = Seq.playing; Seq.stop(); this.rudiments(el); if (was) this.playRud(el); }));
      $('#rd-play', el).onclick = () => { if (Seq.playing) { Seq.stop(); $('#rd-play', el).textContent = '▶ Играть'; } else { this.playRud(el); $('#rd-play', el).textContent = '■ Стоп'; } };
      $('#rd-bpm', el).oninput = (e) => { st.rudBpm = +e.target.value; $('#rd-bpm-o', el).textContent = st.rudBpm; if (Seq.playing) Seq.pattern.bpm = st.rudBpm; };
      $('#rd-click', el).onchange = (e) => { st.rudClick = e.target.checked; Seq.metronome = st.rudClick; };
      $('#rd-left', el).onchange = (e) => { st.rudLeft = e.target.checked; const was = Seq.playing; Seq.stop(); this.rudiments(el); if (was) this.playRud(el); };
      $$('.hand-pad', el).forEach((p) => p.addEventListener('pointerdown', () => { Synth.hit('snare', 0, 0.8); p.classList.add('hit'); setTimeout(() => p.classList.remove('hit'), 120); }));
    },
    playRud(el) {
      const st = this.st, R = DD.RUDIMENTS[st.rud];
      const hand = (h) => (st.rudLeft ? (h === 'R' ? 'L' : 'R') : h);
      const beats = Math.ceil(R.steps.length / R.sub);
      const p = { bpm: st.rudBpm, beats, sub: R.sub, bars: 1, swing: 0, t: {} };
      Seq.metronome = st.rudClick;
      Seq.onStep = (i) => {
        $$('.stk.now', el).forEach((c) => c.classList.remove('now'));
        if (i < 0) return;
        const c = $(`.stk[data-s="${i}"]`, el); if (c) c.classList.add('now');
        const s = R.steps[i];
        if (s) { const pad = $(`.hand-pad[data-h="${hand(s.hand)}"]`, el); if (pad) { pad.classList.add('hit'); setTimeout(() => pad.classList.remove('hit'), 90); } }
      };
      Seq.onHit = null;
      Seq.start(p, {
        extra: (i, t, stepDur) => {
          const s = R.steps[i];
          if (!s) return;
          const v = s.accent ? 1 : 0.55;
          if (s.flam) Synth.hit('snare', t - 0.025, 0.2);
          if (s.drag) { Synth.hit('snare', t - Math.min(0.06, stepDur * 0.5), 0.18); Synth.hit('snare', t - Math.min(0.03, stepDur * 0.25), 0.2); }
          if (s.buzz) { for (let k = 0; k < 4; k++) Synth.hit('snare', t + k * stepDur / 4, v * (1 - k * 0.2)); return; }
          Synth.hit('snare', t, v);
        }
      });
      // pad the step count to whole beats
      R._n = beats * R.sub;
    },
    patternMidi
  };
  root.GTSDrums = Drums;
})(typeof self !== 'undefined' ? self : window);
