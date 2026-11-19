/* Аудио: декодирование, ресемплинг, микшер дорожек, синтез табулатуры, запись с микрофона */
(function (root) {
  'use strict';
  const E = () => root.GTSEngine;
  const AC = root.AudioContext || root.webkitAudioContext;

  const Audio = {
    ctx: null,
    buffers: {},          // original, guitar, bass, other  (AudioBuffer)
    channels: {
      original: { label: 'Оригинал', vol: 0.9, mute: false, solo: false },
      guitar: { label: 'Гитара (стем)', vol: 0.9, mute: true, solo: false },
      bass: { label: 'Бас (стем)', vol: 0.9, mute: true, solo: false },
      other: { label: 'Остальное: вокал, ударные', vol: 0.8, mute: true, solo: false },
      synth: { label: 'Синтез табулатуры', vol: 0.55, mute: false, solo: false }
    },
    gains: {}, sources: [], playing: false, startedAt: 0, from: 0, rate: 1, loop: null,
    synthCache: new Map(), getSynthNotes: null, onEnded: null, duration: 0,

    ensure() {
      if (!this.ctx) {
        if (!AC) throw new Error('Браузер не поддерживает Web Audio API.');
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        for (const k in this.channels) { const g = this.ctx.createGain(); g.connect(this.master); this.gains[k] = g; }
        this.applyMix();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    },
    async decode(arrayBuffer) {
      const ctx = this.ensure();
      const buf = await new Promise((res, rej) => {
        const p = ctx.decodeAudioData(arrayBuffer.slice(0), res, () => rej(new Error('Не удалось декодировать файл. Поддерживаются MP3, WAV, FLAC, OGG и M4A.')));
        if (p && p.catch) p.catch(() => {});
      });
      return buf;
    },
    async toMono22k(buf) {
      const sr = 22050;
      const len = Math.ceil(buf.duration * sr);
      const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
      if (OAC) {
        try {
          const oc = new OAC(1, len, sr);
          const s = oc.createBufferSource(); s.buffer = buf; s.connect(oc.destination); s.start();
          const r = await oc.startRendering();
          return r.getChannelData(0).slice();
        } catch (e) { /* fall through */ }
      }
      // manual downmix + linear resample
      const ch = buf.numberOfChannels, src = buf.sampleRate, out = new Float32Array(len), data = [];
      for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
      for (let i = 0; i < len; i++) {
        const x = i * src / sr, i0 = Math.floor(x), fr = x - i0;
        let v = 0;
        for (let c = 0; c < ch; c++) v += (data[c][i0] || 0) * (1 - fr) + (data[c][i0 + 1] || 0) * fr;
        out[i] = v / ch;
      }
      return out;
    },
    fromFloat(arr, sr) {
      const ctx = this.ensure();
      const b = ctx.createBuffer(1, arr.length, sr || 22050);
      b.copyToChannel ? b.copyToChannel(arr, 0) : b.getChannelData(0).set(arr);
      return b;
    },
    setBuffers(map) {
      this.stop();
      this.buffers = map;
      this.duration = map.original ? map.original.duration : 0;
      const hasStems = !!map.guitar;
      this.channels.guitar.available = hasStems;
      this.channels.bass.available = hasStems;
      this.channels.other.available = hasStems;
      this.channels.original.available = !!map.original;
      this.applyMix();
    },
    applyMix() {
      if (!this.ctx) return;
      const anySolo = Object.values(this.channels).some((c) => c.solo && c.available !== false);
      for (const k in this.channels) {
        const c = this.channels[k];
        const on = c.available !== false && !c.mute && (!anySolo || c.solo);
        this.gains[k].gain.setTargetAtTime(on ? c.vol : 0, this.ctx.currentTime, 0.02);
      }
    },
    position() {
      if (!this.playing) return this.from;
      let p = this.from + (this.ctx.currentTime - this.startedAt) * this.rate;
      return p;
    },
    pluckBuffer(midi) {
      if (this.synthCache.has(midi)) return this.synthCache.get(midi);
      const sr = 22050;
      const data = E().pluck(midi, sr, 2.2, { decay: midi < 45 ? 0.9985 : 0.996 });
      const b = this.fromFloat(data, sr);
      this.synthCache.set(midi, b);
      return b;
    },
    play(from, opts) {
      opts = opts || {};
      const ctx = this.ensure();
      this.stop(true);
      this.rate = opts.rate || this.rate || 1;
      this.loop = opts.loop || null;
      const end = opts.until != null ? opts.until : this.loop ? this.loop[1] : Infinity;
      from = Math.max(0, from || 0);
      this.from = from;
      const t0 = ctx.currentTime + 0.05;
      this.startedAt = t0;
      for (const k of ['original', 'guitar', 'bass', 'other']) {
        const b = this.buffers[k];
        if (!b) continue;
        const s = ctx.createBufferSource();
        s.buffer = b; s.playbackRate.value = this.rate;
        s.connect(this.gains[k]);
        const dur = isFinite(end) ? Math.max(0, end - from) : undefined;
        if (from < b.duration) { dur != null ? s.start(t0, from, dur) : s.start(t0, from); this.sources.push(s); }
      }
      const notes = this.getSynthNotes ? this.getSynthNotes() : [];
      const horizon = isFinite(end) ? end : Infinity;
      for (const n of notes) {
        if (n.t + 0.001 < from || n.t >= horizon) continue;
        const when = t0 + (n.t - from) / this.rate;
        const s = ctx.createBufferSource();
        s.buffer = this.pluckBuffer(n.midi);
        s.playbackRate.value = this.rate;
        const g = ctx.createGain();
        g.gain.value = 0.6;
        s.connect(g); g.connect(this.gains.synth);
        const stopAt = when + Math.min(2.1, Math.max(0.08, n.d) / this.rate + 0.08);
        g.gain.setValueAtTime(0.6, Math.max(when, stopAt - 0.06));
        g.gain.linearRampToValueAtTime(0, stopAt);
        s.start(when); s.stop(stopAt + 0.01);
        this.sources.push(s);
      }
      this.playing = true;
      this.until = end;
      return true;
    },
    stop(keepPos) {
      if (this.playing && !keepPos) this.from = this.position();
      else if (this.playing && keepPos) this.from = this.position();
      this.sources.forEach((s) => { try { s.stop(); } catch (e) { /* ignore */ } });
      this.sources = [];
      this.playing = false;
    },
    pause() { if (!this.playing) return; this.from = this.position(); this.stop(true); },
    seek(t) { const was = this.playing; this.stop(); this.from = Math.max(0, t); if (was) this.play(this.from, { rate: this.rate, loop: this.loop }); },
    playSegment(t, d, midi) {
      const ctx = this.ensure();
      this.stop();
      const b = this.buffers.original;
      const t0 = ctx.currentTime + 0.02;
      if (b) {
        const s = ctx.createBufferSource(); s.buffer = b; s.connect(this.gains.original.gain.value > 0 ? this.gains.original : this.master);
        s.start(t0, Math.max(0, t - 0.02), Math.min(2, d + 0.12)); this.sources.push(s);
      }
      if (midi != null) {
        const s = ctx.createBufferSource(); s.buffer = this.pluckBuffer(midi);
        const g = ctx.createGain(); g.gain.value = b ? 0.35 : 0.7;
        s.connect(g); g.connect(this.master); s.start(t0); s.stop(t0 + Math.min(1.5, d + 0.3)); this.sources.push(s);
      }
    },

    /* chord & progression playback for the chord window and utilities */
    playChord(midis, opts) {
      opts = opts || {};
      const ctx = this.ensure();
      if (!opts.keep) this.stop();
      const t0 = opts.at != null ? opts.at : ctx.currentTime + 0.03;
      const notes = opts.dir === 'up' ? midis.slice().reverse() : midis.slice();
      const step = opts.mode === 'arp' ? (opts.arpStep || 0.16) : (opts.strum != null ? opts.strum : 0.022);
      const dur = opts.dur || 2;
      notes.forEach((m, i) => {
        const s = ctx.createBufferSource(); s.buffer = this.pluckBuffer(m);
        const g = ctx.createGain(); const when = t0 + i * step;
        const v = (opts.gain || 0.5) * (opts.mode === 'arp' ? 1 : 0.8);
        g.gain.setValueAtTime(v, when); g.gain.setValueAtTime(v, Math.max(when, t0 + dur - 0.08)); g.gain.linearRampToValueAtTime(0, t0 + dur);
        s.connect(g); g.connect(this.master); s.start(when); s.stop(t0 + dur + 0.02);
        this.sources.push(s);
      });
      this.playing = false;
      return t0 + dur;
    },
    /* items: [{midis, beats}] — strum | arp | pad patterns, returns schedule [{at, dur}] */
    playSequence(items, opts) {
      opts = opts || {};
      const ctx = this.ensure();
      this.stop();
      const beat = 60 / (opts.bpm || 100);
      let t = ctx.currentTime + 0.08;
      const sched = [];
      const feel = opts.feel || 'strum';
      for (const it of items) {
        const beats = it.beats || 4, len = beats * beat;
        sched.push({ at: t, dur: len });
        if (feel === 'pad') this.playChord(it.midis, { keep: true, at: t, dur: len, strum: 0.03 });
        else if (feel === 'arp') {
          const asc = it.midis.slice(), seq = asc.concat(asc.slice(1, -1).reverse());
          for (let k = 0; k < beats * 2; k++) this.playChord([seq[k % seq.length]], { keep: true, at: t + k * beat / 2, dur: Math.min(1.6, beat * 1.6), gain: 0.55 });
        } else {
          // D . D U . U D U  (8ths)
          const pat = [['d', 0], ['d', 2], ['u', 3], ['u', 5], ['d', 6], ['u', 7]];
          for (let bar = 0; bar < beats / 4; bar++) for (const [dir, e] of pat) {
            const at = t + bar * 4 * beat + e * beat / 2;
            const ms = dir === 'u' ? it.midis.slice(-4) : it.midis;
            this.playChord(ms, { keep: true, at, dur: beat * (dir === 'd' ? 1 : 0.6), dir: dir === 'u' ? 'up' : 'down', gain: dir === 'u' ? 0.32 : 0.5, strum: 0.014 });
          }
        }
        t += len;
      }
      return sched;
    },

    /* microphone / audio interface */
    async startRecording(onLevel) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nomedia');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctx = this.ensure();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
      const buf = new Float32Array(an.fftSize);
      const chunks = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.start(250);
      let alive = true;
      (function loop() { if (!alive) return; an.getFloatTimeDomainData(buf); let p = 0; for (const v of buf) p = Math.max(p, Math.abs(v)); onLevel && onLevel(p); requestAnimationFrame(loop); })();
      return {
        stop: () => new Promise((res) => {
          alive = false;
          rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); res(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })); };
          rec.stop();
        })
      };
    }
  };
  root.GTSAudio = Audio;
})(typeof self !== 'undefined' ? self : globalThis);
