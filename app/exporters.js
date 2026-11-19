/* GTS Export Center: внутренний формат → MIDI, MusicXML, alphaTex (→ Guitar Pro через alphaTab), ASCII-табы, JSON */
(function (root) {
  'use strict';
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const DUR = [16, 12, 8, 6, 4, 3, 2, 1];
  const DUR_INFO = {
    16: { tex: 1, type: 'whole', dot: false }, 12: { tex: 2, type: 'half', dot: true }, 8: { tex: 2, type: 'half', dot: false },
    6: { tex: 4, type: 'quarter', dot: true }, 4: { tex: 4, type: 'quarter', dot: false }, 3: { tex: 8, type: 'eighth', dot: true },
    2: { tex: 8, type: 'eighth', dot: false }, 1: { tex: 16, type: '16th', dot: false }
  };
  function decompose(len) {
    const out = [];
    let r = len;
    while (r > 0) { const d = DUR.find((x) => x <= r); out.push(d); r -= d; }
    return out;
  }
  const barLen = (ts) => Math.round(ts[0] * 16 / ts[1]);

  /* Build measures for one track: [{index, beats:[{pos, len, notes:[...]|null}]}] */
  function buildMeasures(project, track) {
    const L = barLen(project.meta.timeSig || [4, 4]);
    const notes = track.notes.slice().sort((a, b) => a.pos - b.pos || a.s - b.s);
    const groups = [];
    for (const n of notes) {
      const g = groups[groups.length - 1];
      if (g && g.pos === n.pos) { if (!g.notes.some((x) => x.s === n.s)) g.notes.push(n); }
      else groups.push({ pos: n.pos, notes: [n] });
    }
    const lastPos = groups.length ? groups[groups.length - 1].pos + groups[groups.length - 1].notes[0].len : L;
    const chordEnd = (project.chords || []).reduce((m, c) => Math.max(m, c.pos + c.len), 0);
    const nBars = Math.max(1, Math.ceil(Math.max(lastPos, chordEnd) / L));
    const measures = [];
    let gi = 0;
    for (let b = 0; b < nBars; b++) {
      const start = b * L, end = start + L;
      const beats = [];
      let cur = start;
      const pushRests = (from, to) => { let p = from; decompose(to - from).forEach((d) => { beats.push({ pos: p, len: d, notes: null }); p += d; }); };
      while (gi < groups.length && groups[gi].pos < end) {
        const g = groups[gi];
        if (g.pos > cur) pushRests(cur, g.pos);
        const next = gi + 1 < groups.length ? groups[gi + 1].pos : Infinity;
        const want = Math.max(...g.notes.map((n) => n.len));
        const len = Math.max(1, Math.min(want, next - g.pos, end - g.pos));
        const parts = decompose(len);
        beats.push({ pos: g.pos, len: parts[0], notes: g.notes });
        let p = g.pos + parts[0];
        parts.slice(1).forEach((d) => { beats.push({ pos: p, len: d, notes: null }); p += d; });
        cur = g.pos + len;
        gi++;
      }
      if (cur < end) pushRests(cur, end);
      measures.push({ index: b, start, beats });
    }
    // drop trailing bars that hold only rests and no chord change
    while (measures.length > 1) {
      const m = measures[measures.length - 1];
      const hasNotes = m.beats.some((x) => x.notes);
      const hasChord = (project.chords || []).some((c) => c.pos >= m.start && c.pos < m.start + L);
      if (hasNotes || hasChord) break;
      measures.pop();
    }
    return measures;
  }
  const chordAt = (project, pos) => (project.chords || []).find((c) => c.pos === pos);

  /* ---------- alphaTex ---------- */
  const midiToTex = (m) => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
  function toAlphaTex(project) {
    const esc = (s) => String(s || '').replace(/"/g, "'");
    let out = `\\title "${esc(project.title)}"\n\\tempo ${Math.round(project.meta.bpm)}\n.\n`;
    project.tracks.forEach((tr) => {
      const S = tr.tuning.length;
      out += `\\track "${esc(tr.name)}"\n\\staff {tabs}\n\\tuning ${tr.tuning.slice().reverse().map(midiToTex).join(' ')}\n`;
      if (tr.capo) out += `\\capo ${tr.capo}\n`;
      if (tr.type === 'bass') out += `\\instrument 33\n`;
      const ms = buildMeasures(project, tr);
      const bars = ms.map((m, mi) => {
        const ts = mi === 0 ? `\\ts ${project.meta.timeSig[0]} ${project.meta.timeSig[1]} ` : '';
        return ts + m.beats.map((bt, bi) => {
          const di = DUR_INFO[bt.len];
          const fx = [];
          if (di.dot) fx.push('d');
          const ch = tr === project.tracks[0] ? chordAt(project, bt.pos) : null;
          if (ch) fx.push(`ch "${esc(ch.name)}"`);
          const fxs = fx.length ? ` {${fx.join(' ')}}` : '';
          if (!bt.notes) return `r.${di.tex}${fxs}`;
          const nxt = nextBeatNotes(m, bi, ms, mi);
          const ns = bt.notes.map((n) => {
            const e = [];
            const t = n.tech || {};
            if (t.bend) e.push(`b (0 ${Math.round(t.bend * 4)})`);
            if (t.vibrato) e.push('v');
            if (t.mute) e.push('pm');
            if (nxt && nxt.some((x) => x.s === n.s && x.tech && (x.tech.hammer || x.tech.pull))) e.push('h');
            if (nxt && nxt.some((x) => x.s === n.s && x.tech && x.tech.slide)) e.push('sl');
            return `${n.f}.${S - n.s}${e.length ? '{' + e.join(' ') + '}' : ''}`;
          });
          return (ns.length > 1 ? `(${ns.join(' ')})` : ns[0]) + `.${di.tex}${fxs}`;
        }).join(' ');
      });
      out += bars.join(' |\n') + ' |\n';
    });
    return out;
  }
  function nextBeatNotes(m, bi, ms, mi) {
    for (let i = bi + 1; i < m.beats.length; i++) if (m.beats[i].notes) return m.beats[i].notes;
    const nm = ms[mi + 1];
    if (nm) for (const b of nm.beats) if (b.notes) return b.notes;
    return null;
  }

  /* ---------- ASCII tab ---------- */
  const STRING_LABELS = (tuning) => tuning.map((m) => NOTE_NAMES[m % 12].replace('#', '#')).map((l, i, a) => (i === a.length - 1 && l === 'E' ? 'e' : l));
  function toAscii(project, opts) {
    opts = opts || {};
    const perLine = opts.barsPerLine || 4;
    let out = `${project.title}\nTempo: ${Math.round(project.meta.bpm)} BPM · Key: ${project.meta.key} · ${project.meta.timeSig.join('/')}\n`;
    project.tracks.forEach((tr) => {
      const S = tr.tuning.length;
      out += `\n[${tr.name}] Tuning: ${tr.tuning.map(midiToTex).join(' ')}${tr.capo ? ' · Capo ' + tr.capo : ''}\n\n`;
      const L = barLen(project.meta.timeSig);
      const ms = buildMeasures(project, tr);
      const labels = STRING_LABELS(tr.tuning);
      for (let i = 0; i < ms.length; i += perLine) {
        const chunk = ms.slice(i, i + perLine);
        const lines = Array.from({ length: S }, () => '');
        let chordLine = '';
        chunk.forEach((m) => {
          const cols = Array.from({ length: S }, () => new Array(L).fill('---'));
          const chordCols = new Array(L).fill('   ');
          m.beats.forEach((bt) => {
            const c = bt.pos - m.start;
            const ch = chordAt(project, bt.pos);
            if (ch && tr === project.tracks[0]) chordCols[c] = (ch.name + '   ').slice(0, 3);
            if (!bt.notes) return;
            bt.notes.forEach((n) => {
              const t = n.tech || {};
              let s = String(n.f);
              if (t.hammer) s = 'h' + s; else if (t.pull) s = 'p' + s; else if (t.slide) s = '/' + s;
              if (t.bend) s += 'b';
              if (t.vibrato) s += '~';
              cols[n.s][c] = (s + '---').slice(0, 3);
            });
          });
          for (let s = 0; s < S; s++) lines[s] += '|' + cols[s].join('');
          chordLine += ' ' + chordCols.join('');
        });
        if (tr === project.tracks[0] && chordLine.trim()) out += '  ' + chordLine + '\n';
        for (let s = S - 1; s >= 0; s--) out += labels[s].padEnd(2) + lines[s] + '|\n';
        out += '\n';
      }
    });
    if (project.lyrics && project.lyrics.length) {
      out += '\n[Текст]\n' + project.lyrics.map((l) => `[${fmtTime(l.t)}] ${l.text}`).join('\n') + '\n';
    }
    return out;
  }
  function fmtTime(t) { const m = Math.floor(t / 60), s = (t % 60).toFixed(1).padStart(4, '0'); return `${m}:${s}`; }

  /* ---------- MIDI (SMF type 1) ---------- */
  function toMidi(project) {
    const PPQ = 480, T16 = PPQ / 4;
    const vlq = (n) => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
    const str = (s) => Array.from(new TextEncoder().encode(s));
    const chunk = (id, data) => [...str(id), (data.length >>> 24) & 255, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255, ...data];
    const tempo = Math.round(60000000 / project.meta.bpm);
    const ts = project.meta.timeSig;
    const tTitle = str(project.title || 'Untitled');
    const t0 = [0, 0xff, 0x03, ...vlq(tTitle.length), ...tTitle,
      0, 0xff, 0x51, 3, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255,
      0, 0xff, 0x58, 4, ts[0], Math.log2(ts[1]), 24, 8];
    (project.chords || []).forEach((c, i, a) => {
      const prev = i ? a[i - 1].pos : 0;
      const tx = str(c.name);
      t0.push(...vlq((c.pos - prev) * T16), 0xff, 0x01, ...vlq(tx.length), ...tx);
    });
    t0.push(0, 0xff, 0x2f, 0);
    const tracks = [chunk('MTrk', t0)];
    project.tracks.forEach((tr, ti) => {
      const ch = ti >= 9 ? ti + 1 : ti;
      const prog = tr.type === 'bass' ? 33 : 25;
      const name = str(tr.name);
      const ev = [];
      tr.notes.forEach((n) => {
        const vel = Math.round(60 + 50 * Math.min(1, n.conf || 0.8));
        ev.push({ t: n.pos * T16, on: true, m: n.midi, v: vel });
        ev.push({ t: (n.pos + n.len) * T16 - 1, on: false, m: n.midi, v: 0 });
      });
      ev.sort((a, b) => a.t - b.t || (a.on ? 1 : -1));
      const d = [0, 0xff, 0x03, ...vlq(name.length), ...name, 0, 0xc0 | ch, prog];
      let last = 0;
      ev.forEach((e) => { d.push(...vlq(e.t - last), (e.on ? 0x90 : 0x80) | ch, e.m & 127, e.v); last = e.t; });
      d.push(0, 0xff, 0x2f, 0);
      tracks.push(chunk('MTrk', d));
    });
    const hdr = chunk('MThd', [0, 1, 0, tracks.length, (PPQ >> 8) & 255, PPQ & 255]);
    return new Uint8Array([...hdr, ...tracks.flat()]);
  }

  /* ---------- MusicXML 4.0 (partwise, TAB staff with string/fret) ---------- */
  const KIND = { '': 'major', 'm': 'minor', '7': 'dominant', 'm7': 'minor-seventh', 'maj7': 'major-seventh', 'sus4': 'suspended-fourth', 'sus2': 'suspended-second', 'dim': 'diminished', '5': 'power' };
  function xmlEsc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function pitchXml(m) {
    const n = NOTE_NAMES[m % 12];
    return `<pitch><step>${n[0]}</step>${n[1] === '#' ? '<alter>1</alter>' : ''}<octave>${Math.floor(m / 12) - 1}</octave></pitch>`;
  }
  function toMusicXml(project) {
    const ts = project.meta.timeSig;
    let x = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="4.0">\n`;
    x += `<work><work-title>${xmlEsc(project.title)}</work-title></work>\n<identification><encoding><software>AI Guitar Tab Studio</software><encoding-date>${new Date().toISOString().slice(0, 10)}</encoding-date></encoding></identification>\n<part-list>\n`;
    project.tracks.forEach((tr, i) => { x += `<score-part id="P${i + 1}"><part-name>${xmlEsc(tr.name)}</part-name><midi-instrument id="P${i + 1}-I1"><midi-program>${tr.type === 'bass' ? 34 : 26}</midi-program></midi-instrument></score-part>\n`; });
    x += `</part-list>\n`;
    project.tracks.forEach((tr, ti) => {
      const S = tr.tuning.length;
      x += `<part id="P${ti + 1}">\n`;
      const ms = buildMeasures(project, tr);
      ms.forEach((m, mi) => {
        x += `<measure number="${mi + 1}">\n`;
        if (mi === 0) {
          x += `<attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>${ts[0]}</beats><beat-type>${ts[1]}</beat-type></time><clef><sign>TAB</sign><line>5</line></clef><staff-details><staff-lines>${S}</staff-lines>`;
          tr.tuning.forEach((t, si) => { const n = NOTE_NAMES[t % 12]; x += `<staff-tuning line="${si + 1}"><tuning-step>${n[0]}</tuning-step>${n[1] === '#' ? '<tuning-alter>1</tuning-alter>' : ''}<tuning-octave>${Math.floor(t / 12) - 1}</tuning-octave></staff-tuning>`; });
          if (tr.capo) x += `<capo>${tr.capo}</capo>`;
          x += `</staff-details></attributes>\n`;
          x += `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(project.meta.bpm)}</per-minute></metronome></direction-type><sound tempo="${Math.round(project.meta.bpm)}"/></direction>\n`;
        }
        m.beats.forEach((bt) => {
          const di = DUR_INFO[bt.len];
          const ch = ti === 0 ? chordAt(project, bt.pos) : null;
          if (ch) {
            const mm = /^([A-G])(#?)(.*)$/.exec(ch.name);
            if (mm) x += `<harmony><root><root-step>${mm[1]}</root-step>${mm[2] ? '<root-alter>1</root-alter>' : ''}</root><kind text="${xmlEsc(mm[3])}">${KIND[mm[3]] || 'major'}</kind></harmony>\n`;
          }
          const durXml = `<duration>${bt.len}</duration><voice>1</voice><type>${di.type}</type>${di.dot ? '<dot/>' : ''}`;
          if (!bt.notes) { x += `<note><rest/>${durXml}</note>\n`; return; }
          bt.notes.slice().sort((a, b) => a.midi - b.midi).forEach((n, k) => {
            const t = n.tech || {};
            let tech = `<string>${S - n.s}</string><fret>${n.f}</fret>`;
            if (t.hammer) tech = `<hammer-on type="stop">H</hammer-on>` + tech;
            if (t.pull) tech = `<pull-off type="stop">P</pull-off>` + tech;
            if (t.bend) tech += `<bend><bend-alter>${t.bend}</bend-alter></bend>`;
            if (t.mute) tech += `<palm-mute/>`;
            x += `<note>${k ? '<chord/>' : ''}${pitchXml(n.midi)}${durXml}<notations><technical>${tech}</technical></notations></note>\n`;
          });
        });
        x += `</measure>\n`;
      });
      x += `</part>\n`;
    });
    x += `</score-partwise>\n`;
    return x;
  }

  /* ---------- Internal JSON (versioned) ---------- */
  function toJson(project) {
    const p = Object.assign({}, project);
    delete p._local;
    return JSON.stringify({ format: 'gts-project', formatVersion: 1, exportedAt: new Date().toISOString(), project: p }, null, 2);
  }

  const API = { buildMeasures, toAlphaTex, toAscii, toMidi, toMusicXml, toJson, decompose, DUR_INFO, barLen };
  root.GTSExport = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof self !== 'undefined' ? self : globalThis);
