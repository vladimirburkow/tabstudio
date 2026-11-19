/* GTS AI Core — модульный DSP-конвейер распознавания гитары/баса.
 * Работает в Web Worker, в основном потоке и в Node.
 * Этапы: preprocessing → separating → transcribing → analyzing → generating_tabs → finalizing
 */
(function (root) {
  'use strict';

  const MODEL = {
    name: 'GTS-DSP Core',
    version: '1.0.0',
    components: {
      separation: 'band-split filters (Demucs-ready slot)',
      pitch: 'YIN f0 (FFT autocorrelation)',
      onsets: 'log spectral flux + adaptive threshold',
      tempo: 'onset autocorrelation + phase search',
      chords: 'chroma templates + HMM Viterbi',
      key: 'Krumhansl–Schmuckler',
      fretboard: 'Viterbi, C = w1·D + w2·S + w3·F + w4·P'
    }
  };

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const midiName = (m) => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

  const TUNINGS = {
    guitar: {
      'Standard E': [40, 45, 50, 55, 59, 64],
      'Drop D': [38, 45, 50, 55, 59, 64],
      'Eb Standard': [39, 44, 49, 54, 58, 63],
      'D Standard': [38, 43, 48, 53, 57, 62],
      'Drop C': [36, 43, 48, 53, 57, 62],
      'Open G': [38, 43, 50, 55, 59, 62],
      'DADGAD': [38, 45, 50, 55, 57, 62]
    },
    bass: {
      'Standard E': [28, 33, 38, 43],
      'Drop D': [26, 33, 38, 43],
      'Eb Standard': [27, 32, 37, 42],
      '5-string B': [23, 28, 33, 38, 43]
    }
  };

  const DEFAULT_WEIGHTS = { w1: 1.0, w2: 0.6, w3: 1.2, w4: 0.5 };

  /* ---------- FFT ---------- */
  const fftCache = {};
  function fftTables(n) {
    if (fftCache[n]) return fftCache[n];
    const rev = new Uint32Array(n);
    const bits = Math.log2(n) | 0;
    for (let i = 0; i < n; i++) {
      let r = 0, x = i;
      for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; }
      rev[i] = r;
    }
    const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(-2 * Math.PI * i / n); sin[i] = Math.sin(-2 * Math.PI * i / n); }
    return (fftCache[n] = { rev, cos, sin });
  }
  function fft(re, im, inverse) {
    const n = re.length, t = fftTables(n);
    for (let i = 0; i < n; i++) {
      const j = t.rev[i];
      if (j > i) { let a = re[i]; re[i] = re[j]; re[j] = a; a = im[i]; im[i] = im[j]; im[j] = a; }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const c = t.cos[k], s = inverse ? -t.sin[k] : t.sin[k];
          const a = i + j, b = a + half;
          const tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    }
    if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }

  /* ---------- Filters (RBJ biquad) ---------- */
  function biquad(x, type, f0, Q, sr) {
    const w = 2 * Math.PI * f0 / sr, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * Q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
    else { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
    a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
    b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  }
  const chain = (x, sr, list) => list.reduce((s, [t, f]) => biquad(s, t, f, 0.707, sr), x);

  /* ---------- Stage 1: preprocessing ---------- */
  function preprocess(x) {
    let mean = 0;
    for (let i = 0; i < x.length; i++) mean += x[i];
    mean /= x.length || 1;
    let peak = 0;
    const y = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) { y[i] = x[i] - mean; const a = Math.abs(y[i]); if (a > peak) peak = a; }
    if (peak < 1e-5) throw new Error('Запись слишком тихая или пустая: пик сигнала ниже −100 dBFS.');
    const g = 0.9 / peak;
    for (let i = 0; i < y.length; i++) y[i] *= g;
    return { signal: y, gainDb: 20 * Math.log10(g) };
  }

  /* ---------- Stage 2: source separation (band-split) ---------- */
  function separate(x, sr) {
    const bass = chain(x, sr, [['hp', 32], ['lp', 260], ['lp', 260], ['lp', 260]]);
    const guitar = chain(x, sr, [['hp', 180], ['hp', 180], ['lp', 2200], ['lp', 2200]]);
    const other = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) other[i] = x[i] - 0.8 * guitar[i] - 0.8 * bass[i];
    return { guitar, bass, other };
  }

  /* ---------- Stage 3: frame analysis (spectrum, flux, chroma, YIN) ---------- */
  const N = 2048, HOP = 512, M = 4096;
  function analyzeFrames(x, sr, opts, progress) {
    const fmin = opts.fmin, fmax = opts.fmax;
    const tauMax = Math.min(Math.ceil(sr / fmin) + 2, N - 256);
    const tauMin = Math.max(2, Math.floor(sr / fmax));
    const W = N - tauMax;
    const nFrames = Math.max(1, Math.floor((x.length - N) / HOP) + 1);
    const hann = new Float32Array(N);
    for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    const binHz = sr / N;
    const chromaBin = new Int8Array(N / 2 + 1).fill(-1);
    for (let k = 1; k <= N / 2; k++) {
      const f = k * binHz;
      if (f < 55 || f > 2000) continue;
      const m = 69 + 12 * Math.log2(f / 440);
      chromaBin[k] = ((Math.round(m) % 12) + 12) % 12;
    }
    const f0 = new Float32Array(nFrames), ap = new Float32Array(nFrames), rms = new Float32Array(nFrames);
    const flux = new Float32Array(nFrames), chroma = new Float32Array(nFrames * 12);
    const poly = opts.poly ? new Float32Array(nFrames * 6) : null; // up to 3 × (midi, salience)
    const magW = opts.poly ? new Float64Array(N / 2 + 1) : null;
    let prevLog = new Float32Array(N / 2 + 1);
    const re = new Float64Array(N), im = new Float64Array(N);
    const ar = new Float64Array(M), ai = new Float64Array(M), br = new Float64Array(M), bi = new Float64Array(M);
    const d = new Float64Array(tauMax + 1);
    const pre = new Float64Array(N + 1);

    for (let fi = 0; fi < nFrames; fi++) {
      const off = fi * HOP;
      let e = 0;
      for (let i = 0; i < N; i++) { const v = x[off + i] || 0; e += v * v; re[i] = v * hann[i]; im[i] = 0; }
      rms[fi] = Math.sqrt(e / N);
      fft(re, im, false);
      let fl = 0;
      const curLog = new Float32Array(N / 2 + 1);
      for (let k = 0; k <= N / 2; k++) {
        const mag = Math.hypot(re[k], im[k]);
        const lg = Math.log(1 + 100 * mag);
        curLog[k] = lg;
        const dd = lg - prevLog[k];
        if (dd > 0 && k > 2) fl += dd;
        const c = chromaBin[k];
        if (c >= 0) chroma[fi * 12 + c] += mag * mag;
        if (magW) magW[k] = mag;
      }
      if (poly) multiPitch(magW, binHz, opts.poly, (fi * HOP + N / 2) / sr, poly, fi * 6);
      prevLog = curLog;
      flux[fi] = fl;

      if (rms[fi] < 0.004) { f0[fi] = 0; ap[fi] = 1; continue; }
      // YIN difference via FFT cross-correlation
      for (let i = 0; i < M; i++) { ar[i] = 0; ai[i] = 0; br[i] = 0; bi[i] = 0; }
      pre[0] = 0;
      for (let i = 0; i < N; i++) { const v = x[off + i] || 0; br[i] = v; pre[i + 1] = pre[i] + v * v; if (i < W) ar[i] = v; }
      fft(ar, ai, false); fft(br, bi, false);
      for (let k = 0; k < M; k++) {
        const r = ar[k] * br[k] + ai[k] * bi[k];
        const i2 = ar[k] * bi[k] - ai[k] * br[k];
        ar[k] = r; ai[k] = i2;
      }
      fft(ar, ai, true);
      const e0 = pre[W];
      d[0] = 0;
      let run = 0, best = -1, bestVal = 1e9;
      const cm = new Float64Array(tauMax + 1);
      cm[0] = 1;
      for (let tau = 1; tau <= tauMax; tau++) {
        const et = pre[tau + W] - pre[tau];
        d[tau] = Math.max(0, e0 + et - 2 * ar[tau]);
        run += d[tau];
        cm[tau] = run > 0 ? d[tau] * tau / run : 1;
      }
      const thr = 0.15;
      for (let tau = tauMin; tau < tauMax; tau++) {
        if (cm[tau] < thr) {
          while (tau + 1 < tauMax && cm[tau + 1] < cm[tau]) tau++;
          best = tau; bestVal = cm[tau]; break;
        }
      }
      if (best < 0) {
        for (let tau = tauMin; tau < tauMax; tau++) if (cm[tau] < bestVal) { bestVal = cm[tau]; best = tau; }
      }
      let tauF = best;
      if (best > tauMin && best < tauMax - 1) {
        const a = cm[best - 1], b = cm[best], c = cm[best + 1];
        const den = a - 2 * b + c;
        if (Math.abs(den) > 1e-12) tauF = best + 0.5 * (a - c) / den;
      }
      f0[fi] = sr / tauF;
      ap[fi] = Math.min(1, bestVal);
      if (progress && (fi & 63) === 0) progress(fi / nFrames);
    }
    // normalise chroma
    for (let fi = 0; fi < nFrames; fi++) {
      let mx = 0;
      for (let c = 0; c < 12; c++) { chroma[fi * 12 + c] = Math.sqrt(chroma[fi * 12 + c]); mx = Math.max(mx, chroma[fi * 12 + c]); }
      if (mx > 0) for (let c = 0; c < 12; c++) chroma[fi * 12 + c] /= mx;
    }
    return { f0, ap, rms, flux, chroma, poly, nFrames, fps: sr / HOP, hop: HOP, win: N };
  }

  /* Iterative harmonic-sum multi-pitch estimator (Klapuri-style) for polyphonic / mixed input */
  function multiPitch(mag, binHz, cfg, t, out, o) {
    const nb = mag.length - 2;
    let total = 0;
    for (let k = 3; k < nb; k++) total += mag[k];
    if (total <= 0) return;
    const peakAt = (f) => { const k = Math.round(f / binHz); if (k < 1 || k >= nb) return [0, k]; let b = k; if (mag[k - 1] > mag[b]) b = k - 1; if (mag[k + 1] > mag[b]) b = k + 1; return [mag[b], b]; };
    for (let it = 0; it < 3; it++) {
      let best = -1, bestS = 0;
      for (let m = cfg.lo; m <= cfg.hi; m++) {
        if (cfg.exclude && cfg.exclude(t, m)) continue;
        const f = 440 * Math.pow(2, (m - 69) / 12);
        let sum = 0, h1 = peakAt(f)[0];
        for (let h = 1; h <= 10; h++) { const fh = f * h; if (fh / binHz >= nb) break; sum += peakAt(fh)[0] / Math.pow(h, 0.75); }
        const sOut = sum * Math.pow(h1 / (sum + 1e-9) + 0.05, 0.35) * (m > 79 ? 0.8 : 1);
        if (sOut > bestS) { bestS = sOut; best = m; }
      }
      if (best < 0) break;
      out[o + it * 2] = best; out[o + it * 2 + 1] = bestS / total;
      const f = 440 * Math.pow(2, (best - 69) / 12);
      for (let h = 1; h <= 10; h++) { const k = Math.round(f * h / binHz); for (let j = k - 1; j <= k + 1; j++) if (j > 0 && j < nb) mag[j] *= 0.12; }
    }
  }

  /* ---------- Onsets ---------- */
  function detectOnsets(fr) {
    const { flux, nFrames } = fr;
    let mx = 0;
    for (let i = 0; i < nFrames; i++) mx = Math.max(mx, flux[i]);
    const env = new Float32Array(nFrames);
    for (let i = 0; i < nFrames; i++) env[i] = mx > 0 ? flux[i] / mx : 0;
    const onsets = [];
    const w = 8;
    let last = -10;
    for (let i = 1; i < nFrames - 1; i++) {
      if (env[i] < env[i - 1] || env[i] < env[i + 1]) continue;
      let mean = 0, cnt = 0;
      for (let j = Math.max(0, i - w); j <= Math.min(nFrames - 1, i + w); j++) { mean += env[j]; cnt++; }
      mean /= cnt;
      if (env[i] > mean * 1.35 + 0.06 && i - last >= 3) { onsets.push(i); last = i; }
    }
    return { onsets, env };
  }

  /* ---------- Tempo & beat phase ---------- */
  function estimateTempo(env, fps) {
    const n = env.length;
    const minLag = Math.floor(fps * 60 / 200), maxLag = Math.ceil(fps * 60 / 55);
    let best = -1, bestScore = -1;
    const sc = new Float64Array(maxLag + 2);
    for (let lag = minLag; lag <= maxLag + 1 && lag < n; lag++) {
      let s = 0;
      for (let i = 0; i + lag < n; i++) s += env[i] * env[i + lag];
      s /= (n - lag);
      sc[lag] = s;
    }
    for (let lag = minLag; lag <= maxLag && lag < n; lag++) {
      const bpm = 60 * fps / lag;
      const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 110) / 0.9, 2));
      // reward lags whose double also correlates (metrical consistency)
      const dbl = 2 * lag < sc.length ? sc[2 * lag] : 0;
      const s = (sc[lag] + 0.5 * dbl) * prior;
      if (s > bestScore) { bestScore = s; best = lag; }
    }
    if (best < 0) return { bpm: 120, phase: 0, confidence: 0 };
    let lagF = best;
    if (best > minLag && best < maxLag) {
      const a = sc[best - 1], b = sc[best], c = sc[best + 1], den = a - 2 * b + c;
      if (Math.abs(den) > 1e-12) lagF = best + 0.5 * (a - c) / den;
    }
    let bpm = 60 * fps / lagF;
    bpm = Math.round(bpm * 2) / 2;
    const period = 60 * fps / bpm;
    let bestPh = 0, bestPhS = -1;
    for (let ph = 0; ph < period; ph += 0.5) {
      let s = 0;
      for (let t = ph; t < n; t += period) s += env[Math.round(t)] || 0;
      if (s > bestPhS) { bestPhS = s; bestPh = ph; }
    }
    let mean = 0;
    for (let i = 0; i < n; i++) mean += env[i];
    mean /= n || 1;
    const beats = Math.max(1, Math.floor(n / period));
    const conf = Math.max(0, Math.min(1, (bestPhS / beats - mean) / (0.5 + mean)));
    return { bpm, phase: bestPh / fps + ONSET_LAG, confidence: conf };
  }

  /* ---------- Note segmentation (onset-driven, with legato splits) ---------- */
  const ONSET_LAG = 0.07; // spectral-flux peak lags the window start by ~3/4 window
  function segmentNotes(fr, onsets, opts) {
    const { f0, ap, rms, nFrames, fps } = fr;
    const half = (N / 2) / (HOP * fps);       // window half-length in seconds
    const center = (i) => i / fps + half;
    let peak = 0;
    for (let i = 0; i < nFrames; i++) peak = Math.max(peak, rms[i]);
    const voiced = (i) => ap[i] < 0.38 && rms[i] > peak * 0.03 && f0[i] >= opts.fmin * 0.95 && f0[i] <= opts.fmax * 1.05;
    const mf = (i) => 69 + 12 * Math.log2(f0[i] / 440);
    // onset times, plus implicit onsets at the start of voiced runs with no onset nearby
    let times = onsets.map((o) => o / fps + ONSET_LAG);
    for (let i = 1; i < nFrames - 2; i++) {
      if (voiced(i) && voiced(i + 1) && voiced(i + 2) && !voiced(i - 1)) {
        const t = center(i) - half * 0.5;
        if (!times.some((x) => Math.abs(x - t) < 0.08)) times.push(t);
      }
    }
    times.sort((a, b) => a - b);
    const end = nFrames / fps + half * 2;
    const out = [], strumSegs = [];
    for (let k = 0; k < times.length; k++) {
      const Ta = times[k], Tb = k + 1 < times.length ? times[k + 1] : end;
      const fa = Math.max(0, Math.ceil((Ta + half * 0.5 - half) * fps));
      const fb = Math.min(nFrames - 1, Math.floor((Tb - 0.01 - half) * fps));
      if (fb < fa) continue;
      const frames = [], all = [];
      let segPeak = 0;
      for (let i = fa; i <= fb; i++) { all.push(i); segPeak = Math.max(segPeak, rms[i]); if (voiced(i)) frames.push(i); }
      if (segPeak < peak * 0.04) continue;
      if (frames.length < Math.max(1, all.length * 0.4)) { strumSegs.push({ Ta, Tb, frames: all }); if (!frames.length) continue; }
      // split into pitch runs (legato)
      const runs = [];
      for (const i of frames) {
        const m = mf(i), r = runs[runs.length - 1];
        if (r && Math.abs(m - median(r.m)) < 0.75 && i - r.f[r.f.length - 1] <= 2) { r.f.push(i); r.m.push(m); }
        else runs.push({ f: [i], m: [m] });
      }
      // fold octave flicker and very short runs into the previous run
      for (let q = runs.length - 1; q > 0; q--) {
        const a = runs[q - 1], b = runs[q], dm = Math.round(median(b.m) - median(a.m));
        if (Math.abs(dm) === 12 || Math.abs(dm) === 24 || b.f.length < (opts.poly ? 3 : 2) || a.f.length < 2) {
          const keep = b.f.length > a.f.length ? b : a;
          runs.splice(q - 1, 2, { f: a.f.concat(b.f), m: keep.m });
        }
      }
      const good = runs.filter((r) => r.f.length >= 2 || runs.length === 1);
      good.forEach((r, idx) => {
        const lastLoud = r.f.filter((i) => rms[i] > segPeak * 0.08);
        const tEnd = Math.min(Tb, center(lastLoud.length ? lastLoud[lastLoud.length - 1] : r.f[r.f.length - 1]) + half * 0.5);
        const tStart = idx === 0 ? Ta : Math.max(Ta, center(r.f[0]) - half * 0.5);
        const nn = makeNote(r, tStart, Math.max(0.03, tEnd - tStart), idx > 0, fr, opts);
        const fPre = Math.max(0, Math.floor((Ta - N / (HOP * fps)) * fps)), fPost = Math.min(nFrames - 1, Math.ceil(Ta * fps));
        nn.rise = rms[fPost] / (rms[fPre] + 1e-6);
        out.push(nn);
      });
    }
    // legato technique labels
    for (let k = 1; k < out.length; k++) {
      const a = out[k - 1], b = out[k];
      if (!b || !a || !b.legato) continue;
      const dm = b.midi - a.midi;
      if (Math.abs(dm) >= 3) b.tech.slide = true;
      else if (dm > 0) b.tech.hammer = true;
      else if (dm < 0) b.tech.pull = true;
    }
    // merge same-pitch re-triggers that show no energy rise (noise / percussion onsets)
    for (let k = out.length - 1; k > 0; k--) {
      const a = out[k - 1], b = out[k];
      if (a.midi === b.midi && b.t - (a.t + a.d) < 0.05 && b.rise < 1.25 && !b.legato) { a.d = b.t + b.d - a.t; a.conf = Math.max(a.conf, b.conf); out.splice(k, 1); }
    }
    const notes = out.filter((n) => n && (opts.midiMin == null || (n.midi >= opts.midiMin - 1 && n.midi <= opts.midiMax + 1)));
    notes.strumSegs = strumSegs;
    return notes;
  }
  function makeNote(r, t, d, legato, fr, opts) {
    const mids = r.m;
    const med = median(mids);
    let midi = Math.round(med);
    const stable = mids.filter((m) => Math.abs(m - med) < 0.5).length / mids.length;
    const meanAp = r.f.reduce((s, k) => s + fr.ap[k], 0) / r.f.length;
    const lenF = Math.min(1, r.f.length / 3);
    const conf = clamp((1 - meanAp * 1.6) * (0.55 + 0.45 * stable) * (0.6 + 0.4 * lenF) * (opts.poly ? 0.82 : 1), 0.02, 0.99);
    const tech = {};
    if (mids.length >= 6) {
      const head = median(mids.slice(0, Math.max(1, Math.floor(mids.length / 4))));
      const tailMax = Math.max(...mids.slice(Math.floor(mids.length / 2)));
      if (tailMax - head > 0.8 && tailMax - head < 3.2) { tech.bend = Math.round((tailMax - head) * 2) / 2; midi = Math.round(head); }
      else if (mids.length >= 8) {
        const sd = Math.sqrt(mids.reduce((s, m) => s + (m - med) * (m - med), 0) / mids.length);
        let crossings = 0;
        for (let k = 1; k < mids.length; k++) if ((mids[k] - med) * (mids[k - 1] - med) < 0) crossings++;
        if (sd > 0.12 && sd < 0.6 && crossings >= 4) tech.vibrato = true;
      }
    }
    return { t, d, midi, conf, legato, tech, startFrame: r.f[0], endFrame: r.f[r.f.length - 1] + 1 };
  }

  /* ---------- Chords ---------- */
  const CHORD_TYPES = [
    { q: '', iv: [0, 4, 7] }, { q: 'm', iv: [0, 3, 7] }, { q: '7', iv: [0, 4, 7, 10] },
    { q: 'm7', iv: [0, 3, 7, 10] }, { q: 'maj7', iv: [0, 4, 7, 11] }, { q: 'sus4', iv: [0, 5, 7] },
    { q: 'sus2', iv: [0, 2, 7] }, { q: 'dim', iv: [0, 3, 6] }, { q: '5', iv: [0, 7] }
  ];
  const TEMPLATES = [];
  for (let r = 0; r < 12; r++) for (const ct of CHORD_TYPES) {
    const v = new Float32Array(12);
    ct.iv.forEach((i, idx) => (v[(r + i) % 12] = idx === 0 ? 1.0 : 0.85));
    TEMPLATES.push({ name: NOTE_NAMES[r] + ct.q, root: r, q: ct.q, v, prior: ct.q === '' || ct.q === 'm' ? 1 : ct.q === '5' ? 0.85 : 0.9 });
  }
  function scoreChroma(c) {
    let norm = 0;
    for (let i = 0; i < 12; i++) norm += c[i] * c[i];
    norm = Math.sqrt(norm) || 1;
    return TEMPLATES.map((t) => {
      let dot = 0, tn = 0;
      for (let i = 0; i < 12; i++) { dot += c[i] * t.v[i]; tn += t.v[i] * t.v[i]; }
      return (dot / (norm * Math.sqrt(tn))) * t.prior;
    });
  }
  function detectChords(fr, grid, noteLists) {
    // grid: {t0, beatSec, nBeats}; observations blend note histogram (harmonic-free) with spectral chroma
    const { chroma, fps, rms, nFrames } = fr;
    const obs = [];
    let peak = 0;
    for (let i = 0; i < nFrames; i++) peak = Math.max(peak, rms[i]);
    const all = (noteLists || []).flat();
    for (let b = 0; b < grid.nBeats; b++) {
      const ta = grid.t0 + b * grid.beatSec, tb = ta + grid.beatSec;
      const fa = Math.max(0, Math.floor(ta * fps)), fb = Math.min(nFrames, Math.floor(tb * fps));
      const c = new Float32Array(12);
      let e = 0, cnt = 0;
      for (let f = fa; f < fb; f++) { const w = rms[f]; e += w; cnt++; for (let k = 0; k < 12; k++) c[k] += chroma[f * 12 + k] * w; }
      const cm = Math.max(...c) || 1;
      const h = new Float32Array(12);
      let lowest = null, hn = 0;
      for (const n of all) {
        const st = n.t, en = n.t + Math.max(n.d, grid.beatSec * 0.5);
        if (en < ta - grid.beatSec * 0.5 || st > tb + grid.beatSec * 0.25) continue;
        const inside = st >= ta - 0.03 && st < tb;
        const w = (inside ? 1 : 0.45) * (0.4 + n.conf);
        h[n.midi % 12] += w; hn++;
        if (inside && (!lowest || n.midi < lowest.midi)) lowest = n;
      }
      if (lowest) h[lowest.midi % 12] += 0.8;
      const hm = Math.max(...h) || 1;
      const mix = new Float32Array(12);
      const specW = hn ? 0.3 : 1;
      for (let k = 0; k < 12; k++) mix[k] = specW * c[k] / cm + h[k] / hm;
      const silent = (cnt === 0 || e / cnt < peak * 0.05) && !hn;
      obs.push({ scores: silent ? null : scoreChroma(mix), bar: b % 4 === 0 });
    }
    // HMM Viterbi over templates + N (no chord)
    const K = TEMPLATES.length + 1, NC = K - 1;
    const stay = 0.35;
    let prev = new Float64Array(K), back = [];
    for (let b = 0; b < obs.length; b++) {
      const em = new Float64Array(K);
      if (!obs[b].scores) { em.fill(0.1); em[NC] = 1; }
      else { obs[b].scores.forEach((s, i) => (em[i] = s)); em[NC] = 0.45; }
      const cur = new Float64Array(K), bk = new Int32Array(K);
      let bestPrev = 0, bestPrevI = 0;
      for (let i = 0; i < K; i++) if (prev[i] > bestPrev) { bestPrev = prev[i]; bestPrevI = i; }
      for (let i = 0; i < K; i++) {
        const stayS = prev[i] + (obs[b].bar ? stay * 0.4 : stay);
        if (b === 0 || stayS >= bestPrev) { cur[i] = (b === 0 ? 0 : stayS) + em[i]; bk[i] = i; }
        else { cur[i] = bestPrev + em[i]; bk[i] = bestPrevI; }
      }
      prev = cur; back.push(bk);
    }
    let st = 0;
    for (let i = 1; i < K; i++) if (prev[i] > prev[st]) st = i;
    const path = new Array(obs.length);
    for (let b = obs.length - 1; b >= 0; b--) { path[b] = st; st = back[b][st]; }
    const segs = [];
    for (let b = 0; b < path.length; b++) {
      const p = path[b];
      const conf = obs[b].scores && p < NC ? obs[b].scores[p] : 0;
      const last = segs[segs.length - 1];
      if (last && last.k === p) { last.len += 4; last.confSum += conf; last.n++; }
      else segs.push({ k: p, pos: b * 4, len: 4, confSum: conf, n: 1 });
    }
    return segs.filter((s) => s.k !== NC).map((s) => ({ pos: s.pos, len: s.len, name: TEMPLATES[s.k].name, conf: +(s.confSum / s.n).toFixed(2) }));
  }

  /* ---------- Key ---------- */
  const KS_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KS_MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  function detectKey(fr, notes) {
    const tot = new Float64Array(12);
    for (let f = 0; f < fr.nFrames; f++) for (let k = 0; k < 12; k++) tot[k] += fr.chroma[f * 12 + k] * fr.rms[f];
    if (notes) notes.forEach((n) => (tot[n.midi % 12] += n.d * 2));
    let best = { s: -2, name: 'C' };
    for (let r = 0; r < 12; r++) for (const [prof, suf] of [[KS_MAJ, ''], [KS_MIN, 'm']]) {
      const p = []; for (let i = 0; i < 12; i++) p.push(prof[(i - r + 12) % 12]);
      const s = pearson(Array.from(tot), p);
      if (s > best.s) best = { s, name: NOTE_NAMES[r] + suf };
    }
    return { key: best.name, confidence: +Math.max(0, best.s).toFixed(2) };
  }

  /* ---------- Quantisation to 16th grid ---------- */
  function quantize(notes, tempo, duration) {
    const beatSec = 60 / tempo.bpm, s16 = beatSec / 4, bar = beatSec * 4;
    let t0 = tempo.phase;
    const first = notes.length ? notes[0].t : 0;
    while (t0 - bar * 0 > first + s16 * 0.5) t0 -= bar;
    while (t0 + bar <= first - s16 * 0.5) t0 += bar;
    const q = notes.map((n) => {
      const pos = Math.max(0, Math.round((n.t - t0) / s16));
      const len = clamp(Math.round(n.d / s16), 1, 16);
      return Object.assign({}, n, { pos, len });
    });
    // resolve collisions (same pos & same pitch): keep higher confidence
    const byKey = new Map();
    for (const n of q) {
      const k = n.pos + ':' + n.midi;
      const o = byKey.get(k);
      if (!o || o.conf < n.conf) byKey.set(k, n);
    }
    const res = Array.from(byKey.values()).sort((a, b) => a.pos - b.pos || a.midi - b.midi);
    // limit length to next onset
    for (let i = 0; i < res.length; i++) {
      let j = i + 1;
      while (j < res.length && res[j].pos === res[i].pos) j++;
      if (j < res.length) res[i].len = Math.max(1, Math.min(res[i].len, res[j].pos - res[i].pos));
    }
    const nBeats = Math.ceil((duration - t0) / beatSec) + 1;
    return { notes: res, grid: { t0, beatSec, s16, nBeats } };
  }

  /* ---------- Fretboard mapping (Viterbi) ---------- */
  function candidatesFor(group, tuning, capo, maxFret) {
    const S = tuning.length;
    const pos = group.map((n) => {
      const c = [];
      for (let s = 0; s < S; s++) {
        const f = n.midi - (tuning[s] + capo);
        if (f >= 0 && f <= maxFret - capo) c.push({ s, f });
      }
      return c;
    });
    if (pos.some((p) => p.length === 0)) {
      // unreachable note: fold octave into range
      return null;
    }
    const out = [];
    const used = new Array(S).fill(false);
    const cur = [];
    (function dfs(i) {
      if (out.length > 240) return;
      if (i === group.length) {
        const fretted = cur.filter((p) => p.f > 0).map((p) => p.f);
        const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
        if (span <= 5) out.push(cur.slice());
        return;
      }
      for (const p of pos[i]) {
        if (used[p.s]) continue;
        used[p.s] = true; cur.push(p); dfs(i + 1); cur.pop(); used[p.s] = false;
      }
    })(0);
    return out;
  }
  function candFeatures(c) {
    const fretted = c.filter((p) => p.f > 0).map((p) => p.f);
    const hand = fretted.length ? Math.min(...fretted) : null;
    const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
    const meanS = c.reduce((a, p) => a + p.s, 0) / c.length;
    const maxF = c.reduce((a, p) => Math.max(a, p.f), 0);
    const hi = fretted.length ? Math.max(...fretted) : null;
    return { hand, hi, span, meanS, maxF };
  }
  // hand position = low edge of a 4-fret box; moving inside the box is free
  function boxShift(lo, f) {
    if (lo == null || f.hand == null) return { D: 0.15, lo: f.hand != null ? f.hand : lo };
    const up = Math.max(0, f.hi - (lo + 3)), down = Math.max(0, lo - f.hand);
    const nlo = down > 0 ? f.hand : up > 0 ? f.hi - 3 : lo;
    return { D: up + down, lo: nlo };
  }
  function mapFretboard(notes, cfg) {
    const { tuning, capo = 0, maxFret = 22, weights = DEFAULT_WEIGHTS, s16 = 0.125 } = cfg;
    const w = Object.assign({}, DEFAULT_WEIGHTS, weights);
    // group by pos (simultaneous notes)
    const groups = [];
    for (const n of notes) {
      const g = groups[groups.length - 1];
      if (g && g.pos === n.pos && !n.fixed) g.notes.push(n);
      else groups.push({ pos: n.pos, notes: [n] });
    }
    const lowest = Math.min(...tuning) + capo, highest = Math.max(...tuning) + capo + (maxFret - capo);
    for (const g of groups) {
      // drop surplus notes beyond string count (keep highest confidence)
      if (g.notes.length > tuning.length) g.notes = g.notes.sort((a, b) => b.conf - a.conf).slice(0, tuning.length);
      for (const n of g.notes) {
        if (n.fixed) continue;
        while (n.midi < lowest) { n.midi += 12; n.conf *= 0.6; n.folded = true; }
        while (n.midi > highest) { n.midi -= 12; n.conf *= 0.6; n.folded = true; }
      }
      g.notes.sort((a, b) => a.midi - b.midi);
      if (g.notes[0].fixed) g.cands = [g.notes.map((n) => ({ s: n.s, f: n.f }))];
      else {
        g.cands = candidatesFor(g.notes, tuning, capo, maxFret) || [];
        while (!g.cands.length && g.notes.length > 1) { g.notes.pop(); g.cands = candidatesFor(g.notes, tuning, capo, maxFret) || []; }
      }
      g.feats = g.cands.map(candFeatures);
    }
    const valid = groups.filter((g) => g.cands.length);
    const unary = (g, i) => {
      const f = g.feats[i];
      const F = Math.max(0, f.span - 3) * 2 + f.span * 0.25;
      const P = f.maxF * 0.18 + (f.maxF > 12 ? 0.6 : 0);
      return w.w3 * F + w.w4 * P;
    };
    const trans = (ga, ia, gb, ib, carriedHand) => {
      const a = ga.feats[ia], b = gb.feats[ib];
      const gapSec = (gb.pos - ga.pos) * s16;
      const hA = carriedHand, hB = b.hand;
      const D = boxShift(carriedHand, b).D * (gapSec < 0.2 ? 1.4 : 1);
      const ds = Math.abs(b.meanS - a.meanS);
      const S = ds * 0.3 + Math.max(0, ds - 1);
      let P = 0;
      // legato / slide technique prefers the same string
      const tb = gb.notes[0].tech || {};
      if (ga.notes.length === 1 && gb.notes.length === 1 && (tb.hammer || tb.pull || tb.slide)) {
        if (ga.cands[ia][0].s !== gb.cands[ib][0].s) P += 2.5;
      }
      // stretch across consecutive fast notes
      if (hA != null && hB != null && gapSec < 0.25) {
        const span = Math.max(a.maxF, b.maxF) - Math.min(hA, hB);
        if (span > 4) P += (span - 4) * 0.8;
      }
      return w.w1 * D * 0.5 + w.w2 * S + w.w4 * P;
    };
    if (!valid.length) return notes.map((n) => Object.assign(n, { s: n.s ?? 0, f: n.f ?? 0 }));
    let cost = valid[0].cands.map((_, i) => unary(valid[0], i));
    let carry = valid[0].feats.map((f) => f.hand);
    const backs = [];
    for (let k = 1; k < valid.length; k++) {
      const g = valid[k], pg = valid[k - 1];
      const nc = new Array(g.cands.length), bk = new Int32Array(g.cands.length), ncar = new Array(g.cands.length);
      for (let i = 0; i < g.cands.length; i++) {
        let best = Infinity, bi = 0;
        for (let j = 0; j < pg.cands.length; j++) {
          const c = cost[j] + trans(pg, j, g, i, carry[j]);
          if (c < best) { best = c; bi = j; }
        }
        nc[i] = best + unary(g, i); bk[i] = bi;
        ncar[i] = boxShift(carry[bi], g.feats[i]).lo;
      }
      cost = nc; backs.push(bk); carry = ncar;
    }
    let bi = 0;
    for (let i = 1; i < cost.length; i++) if (cost[i] < cost[bi]) bi = i;
    for (let k = valid.length - 1; k >= 0; k--) {
      const c = valid[k].cands[bi];
      valid[k].notes.forEach((n, idx) => { n.s = c[idx].s; n.f = c[idx].f; });
      if (k > 0) bi = backs[k - 1][bi];
    }
    const kept = new Set();
    valid.forEach((g) => g.notes.forEach((n) => kept.add(n)));
    return notes.filter((n) => kept.has(n));
  }

  /* ---------- Strum detection: polyphonic chord events ---------- */
  const OPEN_SHAPES = {
    // frets from low E to high e, -1 = muted (standard tuning)
    'C': [-1, 3, 2, 0, 1, 0], 'A': [-1, 0, 2, 2, 2, 0], 'G': [3, 2, 0, 0, 0, 3], 'E': [0, 2, 2, 1, 0, 0], 'D': [-1, -1, 0, 2, 3, 2],
    'Am': [-1, 0, 2, 2, 1, 0], 'Em': [0, 2, 2, 0, 0, 0], 'Dm': [-1, -1, 0, 2, 3, 1],
    'A7': [-1, 0, 2, 0, 2, 0], 'E7': [0, 2, 0, 1, 0, 0], 'D7': [-1, -1, 0, 2, 1, 2], 'G7': [3, 2, 0, 0, 0, 1], 'C7': [-1, 3, 2, 3, 1, 0], 'B7': [-1, 2, 1, 2, 0, 2],
    'Am7': [-1, 0, 2, 0, 1, 0], 'Em7': [0, 2, 0, 0, 0, 0], 'Dm7': [-1, -1, 0, 2, 1, 1],
    'Cmaj7': [-1, 3, 2, 0, 0, 0], 'Fmaj7': [-1, -1, 3, 2, 1, 0], 'Amaj7': [-1, 0, 2, 1, 2, 0], 'Dmaj7': [-1, -1, 0, 2, 2, 2],
    'Asus4': [-1, 0, 2, 2, 3, 0], 'Dsus4': [-1, -1, 0, 2, 3, 3], 'Esus4': [0, 2, 2, 2, 0, 0], 'Asus2': [-1, 0, 2, 2, 0, 0], 'Dsus2': [-1, -1, 0, 2, 3, 0]
  };
  function chordShape(name, tuning, capo) {
    const std = tuning.length === 6 && tuning.join() === '40,45,50,55,59,64';
    const m = /^([A-G]#?)(.*)$/.exec(name);
    if (!m) return null;
    const root = NOTE_NAMES.indexOf(m[1]), q = m[2];
    if (std && capo === 0 && OPEN_SHAPES[name]) return OPEN_SHAPES[name].map((f, s) => (f < 0 ? null : { s, f }));
    // movable shapes on E/A strings (relative to capo)
    const eShape = { '': [0, 2, 2, 1, 0, 0], 'm': [0, 2, 2, 0, 0, 0], '7': [0, 2, 0, 1, 0, 0], 'm7': [0, 2, 0, 0, 0, 0], 'maj7': [0, -1, 1, 1, 0, -1], 'sus4': [0, 2, 2, 2, 0, 0], 'sus2': [0, 2, 4, 4, 0, 0], 'dim': [0, 1, 2, 0, -1, -1], '5': [0, 2, 2, -1, -1, -1] };
    const aShape = { '': [-1, 0, 2, 2, 2, 0], 'm': [-1, 0, 2, 2, 1, 0], '7': [-1, 0, 2, 0, 2, 0], 'm7': [-1, 0, 2, 0, 1, 0], 'maj7': [-1, 0, 2, 1, 2, 0], 'sus4': [-1, 0, 2, 2, 3, 0], 'sus2': [-1, 0, 2, 2, 0, 0], 'dim': [-1, 0, 1, 2, 1, -1], '5': [-1, 0, 2, 2, -1, -1] };
    const S = tuning.length;
    if (S < 6) return null;
    const lowRoot = (root - ((tuning[0] + capo) % 12) + 12) % 12;
    const aRoot = (root - ((tuning[1] + capo) % 12) + 12) % 12;
    const useA = aRoot < lowRoot && aShape[q];
    const shape = useA ? aShape[q] : eShape[q];
    const base = useA ? aRoot : lowRoot;
    if (!shape) return null;
    return shape.map((f, s) => (f < 0 ? null : { s, f: f + base }));
  }
  function detectStrums(fr, segs, tuning, capo, instrument) {
    if (instrument !== 'guitar' || !segs) return [];
    const { rms, chroma, ap } = fr;
    let peak = 0;
    for (let i = 0; i < fr.nFrames; i++) peak = Math.max(peak, rms[i]);
    const ev = [];
    for (const sg of segs) {
      const fs = sg.frames;
      if (fs.length < 3) continue;
      let e = 0, apS = 0;
      const c = new Float32Array(12);
      for (const f of fs) { e += rms[f]; apS += ap[f]; for (let j = 0; j < 12; j++) c[j] += chroma[f * 12 + j] * rms[f]; }
      if (e / fs.length < peak * 0.15 || apS / fs.length < 0.35) continue;
      const mx = Math.max(...c);
      if (Array.from(c).filter((v) => v > mx * 0.45).length < 3) continue;
      const sc = scoreChroma(c);
      let bi = 0;
      for (let i = 1; i < sc.length; i++) if (sc[i] > sc[bi]) bi = i;
      if (sc[bi] < 0.75) continue;
      const name = TEMPLATES[bi].name, shape = chordShape(name, tuning, capo);
      if (!shape) continue;
      ev.push({ t: sg.Ta, d: sg.Tb - sg.Ta, name, conf: clamp(sc[bi] * 0.85, 0.05, 0.95), shape });
    }
    const out = [];
    ev.forEach((e, gi) => e.shape.forEach((p) => {
      if (!p) return;
      out.push({ t: e.t, d: e.d, midi: tuning[p.s] + capo + p.f, conf: e.conf, s: p.s, f: p.f, fixed: true, strum: gi, tech: {}, chordName: e.name });
    }));
    return out;
  }

  /* ---------- Track transcription ---------- */
  function transcribeTrack(signal, sr, cfg, progress) {
    const instrument = cfg.instrument;
    const tuning = cfg.tuning;
    const capo = cfg.capo || 0;
    const maxFret = cfg.maxFret || (instrument === 'bass' ? 20 : 22);
    const midiMin = Math.min(...tuning) + capo, midiMax = Math.max(...tuning) + maxFret;
    const fmin = 440 * Math.pow(2, (midiMin - 1 - 69) / 12);
    const fmax = Math.min(sr / 4, 440 * Math.pow(2, (midiMax + 1 - 69) / 12));
    const fr = analyzeFrames(signal, sr, { fmin, fmax, poly: cfg.poly ? { lo: midiMin, hi: Math.min(midiMax, 84), exclude: cfg.exclude } : null }, progress);
    if (cfg.poly) {
      for (let i = 0; i < fr.nFrames; i++) {
        const m = fr.poly[i * 6], sal = fr.poly[i * 6 + 1];
        if (!sal || fr.rms[i] < 0.004) { fr.f0[i] = 0; fr.ap[i] = 1; continue; }
        fr.f0[i] = 440 * Math.pow(2, (m - 69) / 12);
        fr.ap[i] = clamp(0.38 * 0.03 / sal, 0, 1);
      }
    }
    const { onsets, env } = detectOnsets(fr);
    const mono = segmentNotes(fr, onsets, { fmin, fmax, midiMin, midiMax, poly: !!cfg.poly });
    const strums = cfg.detectStrums === false ? [] : detectStrums(fr, mono.strumSegs, tuning, capo, instrument);
    return { fr, onsets, env, mono, strums, maxFret };
  }

  function finalizeNotes(raw, grid, cfg, idPrefix) {
    const notes = raw.map((n, i) => ({
      id: idPrefix + i,
      pos: n.pos, len: n.len, midi: n.midi, s: n.s, f: n.f,
      conf: +n.conf.toFixed(2), t: +n.t.toFixed(3), d: +n.d.toFixed(3),
      tech: n.tech && Object.keys(n.tech).length ? n.tech : undefined,
      strum: n.strum, folded: n.folded || undefined
    }));
    return notes.sort((a, b) => a.pos - b.pos || a.s - b.s);
  }

  /* ---------- Full pipeline ---------- */
  const STAGES = ['preprocessing', 'separating', 'transcribing', 'analyzing', 'generating_tabs', 'finalizing'];

  function run(input, opts, onProgress) {
    const report = (stage, p, msg) => onProgress && onProgress({ stage, progress: p, message: msg });
    const sr = input.sampleRate;
    const mode = opts.mode || 'isolated';
    const settings = Object.assign({ capo: 0, maxFret: 22, weights: DEFAULT_WEIGHTS }, opts);
    const t0 = Date.now();

    report('preprocessing', 0, 'Нормализация и проверка аудио');
    const pre = preprocess(input.signal);
    const duration = pre.signal.length / sr;
    if (duration < 1) throw new Error('Запись короче 1 секунды: распознавать нечего.');
    report('preprocessing', 1);

    report('separating', 0, mode === 'mix' ? 'Разделение на гитару, бас и остальное' : 'Изолированная запись: разделение не требуется');
    let stems = null;
    if (mode === 'mix') stems = separate(pre.signal, sr);
    report('separating', 1);

    const trackCfgs = [];
    if (mode === 'mix') {
      trackCfgs.push({ instrument: 'guitar', tuning: opts.guitarTuning || TUNINGS.guitar['Standard E'], capo: settings.capo, signal: stems.guitar, name: 'Гитара' });
      if (opts.includeBass !== false) trackCfgs.push({ instrument: 'bass', tuning: opts.bassTuning || TUNINGS.bass['Standard E'], capo: 0, signal: stems.bass, name: 'Бас', detectStrums: false });
    } else {
      const inst = opts.instrument || 'guitar';
      trackCfgs.push({ instrument: inst, tuning: opts.tuning || TUNINGS[inst]['Standard E'], capo: settings.capo, signal: pre.signal, name: inst === 'bass' ? 'Бас' : 'Гитара' });
    }

    const order = trackCfgs.map((_, i) => i).sort((a, b) => (trackCfgs[a].instrument === 'bass' ? -1 : 0) - (trackCfgs[b].instrument === 'bass' ? -1 : 0));
    const trs = new Array(trackCfgs.length);
    order.forEach((i, step) => {
      const tc = trackCfgs[i];
      report('transcribing', step / trackCfgs.length, 'Распознавание нот: ' + tc.name);
      if (mode === 'mix' && tc.instrument === 'guitar') {
        const bassTr = trs.find((t) => t && t.cfg.instrument === 'bass');
        const bn = bassTr ? bassTr.mono : [];
        tc.poly = true;
        tc.exclude = (t, m) => {
          for (const b of bn) if (t >= b.t - 0.02 && t < b.t + b.d + 0.05) { const d = m - b.midi; if (d === 0 || d === 12 || d === 19 || d === 24 || d === 28 || d === 31) return true; }
          return false;
        };
      }
      const r = transcribeTrack(tc.signal, sr, Object.assign({ maxFret: settings.maxFret }, tc), (p) => report('transcribing', (step + p) / trackCfgs.length));
      trs[i] = Object.assign(r, { cfg: tc });
    });
    report('transcribing', 1);

    report('analyzing', 0, 'Темп, тональность, аккорды');
    const main = trs[0];
    // tempo from the full signal envelope where available
    let tempo = estimateTempo(main.env, main.fr.fps);
    if (opts.bpm) tempo = Object.assign(tempo, { bpm: opts.bpm });
    const allMain = main.mono.concat(main.strums).sort((a, b) => a.t - b.t);
    const qMain = quantize(allMain, tempo, duration);
    const grid = qMain.grid;
    const chordFr = mode === 'mix' ? analyzeFrames(chain(pre.signal, sr, [['hp', 70]]), sr, { fmin: 80, fmax: 1000 }) : main.fr;
    const chords = detectChords(chordFr, grid, trs.map((t) => t.mono.concat(t.strums)));
    const key = detectKey(chordFr, main.mono);
    // tonic disambiguation between relative major/minor using the first and last chords
    if (chords.length) {
      const NN = NOTE_NAMES, k = key.key, isMin = k.endsWith('m'), r = NN.indexOf(k.replace('m', ''));
      const rel = isMin ? NN[(r + 3) % 12] : NN[(r + 9) % 12] + 'm';
      const ends = [chords[0].name, chords[chords.length - 1].name].map((c) => c.replace(/(7|maj7|sus4|sus2|5)$/, ''));
      if (ends.includes(rel) && !ends.includes(k)) key.key = rel;
    }
    report('analyzing', 1);

    report('generating_tabs', 0, 'Подбор аппликатуры (Viterbi)');
    const tracks = trs.map((tr, i) => {
      const all = tr.mono.concat(tr.strums).sort((a, b) => a.t - b.t);
      const q = i === 0 ? qMain.notes : quantizeToGrid(all, grid);
      const mapped = mapFretboard(q.map((n) => Object.assign({}, n)), { tuning: tr.cfg.tuning, capo: tr.cfg.capo, maxFret: tr.maxFret, weights: settings.weights, s16: grid.s16 });
      const notes = finalizeNotes(mapped, grid, tr.cfg, (tr.cfg.instrument[0]) + i + '_');
      const low = notes.filter((n) => n.conf < (opts.lowConf || 0.5)).length;
      return {
        id: 'trk_' + tr.cfg.instrument + '_' + i,
        type: tr.cfg.instrument, name: tr.cfg.name,
        tuning: tr.cfg.tuning.slice(), capo: tr.cfg.capo || 0, maxFret: tr.maxFret,
        notes,
        stats: { notes: notes.length, lowConf: low, avgConf: notes.length ? +(notes.reduce((s, n) => s + n.conf, 0) / notes.length).toFixed(2) : 0 }
      };
    });
    report('generating_tabs', 1);

    report('finalizing', 0, 'Сборка проекта');
    const result = {
      duration: +duration.toFixed(2),
      meta: { bpm: tempo.bpm, bpmConfidence: +tempo.confidence.toFixed(2), key: key.key, keyConfidence: key.confidence, timeSig: [4, 4], offset: +grid.t0.toFixed(3) },
      tracks, chords,
      model: Object.assign({}, MODEL, { params: { mode, sampleRate: sr, hop: HOP, window: N, capo: settings.capo, maxFret: settings.maxFret, weights: settings.weights }, ranAt: new Date().toISOString(), ms: Date.now() - t0 }),
      stems: stems ? { guitar: stems.guitar, bass: stems.bass, other: stems.other } : null,
      cache: { grid, raw: trs.map((tr) => ({ notes: tr.mono.concat(tr.strums).map(stripRaw), cfg: { instrument: tr.cfg.instrument, tuning: tr.cfg.tuning, capo: tr.cfg.capo, maxFret: tr.maxFret } })) }
    };
    report('finalizing', 1);
    return result;
  }
  function stripRaw(n) { const o = Object.assign({}, n); delete o.startFrame; delete o.endFrame; return o; }

  function quantizeToGrid(notes, grid) {
    const out = notes.map((n) => Object.assign({}, n, { pos: Math.max(0, Math.round((n.t - grid.t0) / grid.s16)), len: clamp(Math.round(n.d / grid.s16), 1, 16) }));
    const m = new Map();
    out.forEach((n) => { const k = n.pos + ':' + n.midi; const o = m.get(k); if (!o || o.conf < n.conf) m.set(k, n); });
    const res = Array.from(m.values()).sort((a, b) => a.pos - b.pos || a.midi - b.midi);
    for (let i = 0; i < res.length; i++) {
      let j = i + 1;
      while (j < res.length && res[j].pos === res[i].pos) j++;
      if (j < res.length) res[i].len = Math.max(1, Math.min(res[i].len, res[j].pos - res[i].pos));
    }
    return res;
  }

  /* Re-run only the fretboard stage (cached) — e.g. after tuning / capo / weight change */
  function remapTrack(track, opts) {
    const tuning = opts.tuning || track.tuning, capo = opts.capo ?? track.capo, maxFret = opts.maxFret || track.maxFret || 22;
    const notes = track.notes.map((n) => {
      const c = Object.assign({}, n);
      if (c.strum == null) { delete c.s; delete c.f; }
      else { c.fixed = false; }
      return c;
    });
    const mapped = mapFretboard(notes, { tuning, capo, maxFret, weights: opts.weights, s16: opts.s16 || 0.125 });
    mapped.forEach((n) => delete n.fixed);
    return Object.assign({}, track, { tuning: tuning.slice(), capo, maxFret, notes: mapped.sort((a, b) => a.pos - b.pos || a.s - b.s) });
  }

  /* ---------- helpers ---------- */
  function median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function pearson(a, b) {
    const n = a.length; let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return num / (Math.sqrt(da * db) || 1);
  }

  /* ---------- Karplus–Strong synth (demo audio + tab playback) ---------- */
  function pluck(midi, sr, dur, opts) {
    opts = opts || {};
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const n = Math.floor(sr * dur);
    const out = new Float32Array(n);
    const L = Math.max(2, Math.round(sr / f));
    const buf = new Float32Array(L);
    let seed = opts.seed || (midi * 9301 + 49297);
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 * 2 - 1; };
    for (let i = 0; i < L; i++) buf[i] = rnd();
    // soften attack
    for (let k = 0; k < 2; k++) for (let i = 1; i < L; i++) buf[i] = 0.5 * (buf[i] + buf[i - 1]);
    const decay = opts.decay || 0.996;
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const a = buf[idx], b = buf[(idx + 1) % L];
      const v = decay * 0.5 * (a + b);
      buf[idx] = v; out[i] = a;
      idx = (idx + 1) % L;
    }
    const rel = Math.floor(sr * 0.03);
    for (let i = 0; i < rel && i < n; i++) out[n - 1 - i] *= i / rel;
    return out;
  }

  const API = { MODEL, STAGES, TUNINGS, DEFAULT_WEIGHTS, NOTE_NAMES, midiName, run, remapTrack, mapFretboard, pluck, separate, preprocess, analyzeFrames, detectOnsets, estimateTempo, detectChords, detectKey, chordShape, biquad, fft };
  root.GTSEngine = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;

  /* ---------- Worker entry ---------- */
  if (typeof WorkerGlobalScope !== 'undefined' && root instanceof WorkerGlobalScope) {
    root.onmessage = (e) => {
      const { cmd, id } = e.data;
      try {
        if (cmd === 'run') {
          const res = run({ signal: e.data.signal, sampleRate: e.data.sampleRate }, e.data.opts, (p) => root.postMessage({ id, type: 'progress', p }));
          const transfer = res.stems ? [res.stems.guitar.buffer, res.stems.bass.buffer, res.stems.other.buffer] : [];
          root.postMessage({ id, type: 'done', result: res }, transfer);
        } else if (cmd === 'remap') {
          root.postMessage({ id, type: 'done', result: remapTrack(e.data.track, e.data.opts) });
        }
      } catch (err) {
        root.postMessage({ id, type: 'error', error: String(err && err.message || err) });
      }
    };
  }
})(typeof self !== 'undefined' ? self : globalThis);
