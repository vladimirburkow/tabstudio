/* Раздел «Бас-гитара»: гаммы на 4/5/6 струнах, арпеджио, интервалы, аккорды в тональностях, грув-генератор с барабанами */
(function (root) {
  'use strict';
  const T = root.GTSTheory, Au = root.GTSAudio, E = root.GTSEngine;
  const Tools = () => root.GTSTools, Drums = () => root.GTSDrums, App = () => root.App;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const TUNINGS = { 4: [28, 33, 38, 43], 5: [23, 28, 33, 38, 43], 6: [23, 28, 33, 38, 43, 48] };
  const ARPS = [
    ['', 'Мажор', [0, 4, 7]], ['6', 'Мажор 6', [0, 4, 7, 9]], ['maj7', 'Мажор 7', [0, 4, 7, 11]], ['maj7b5', 'Мажор 7 (♭5)', [0, 4, 6, 11]],
    ['sus4', 'Sus4', [0, 5, 7]], ['7', 'Доминант 7', [0, 4, 7, 10]], ['7b5', 'Доминант 7 (♭5)', [0, 4, 6, 10]], ['7sus4', 'Доминант 7 sus4', [0, 5, 7, 10]],
    ['m', 'Минор', [0, 3, 7]], ['m6', 'Минор 6', [0, 3, 7, 9]], ['m7', 'Минор 7', [0, 3, 7, 10]], ['m7b5', 'Минор 7 (♭5)', [0, 3, 6, 10]],
    ['mMaj7', 'Минор (мажор 7)', [0, 3, 7, 11]], ['dim', 'Уменьшённый', [0, 3, 6]], ['dim7', 'Уменьшённый 7', [0, 3, 6, 9]], ['+', 'Увеличенный', [0, 4, 8]], ['+7', 'Увеличенный 7', [0, 4, 8, 10]]
  ];
  const INTERVALS = [
    [0, 'R', 'Прима (основной тон)'], [1, '♭2', 'Малая секунда'], [2, '2', 'Большая секунда'], [3, '♭3', 'Малая терция'], [4, '3', 'Большая терция'],
    [5, '4', 'Чистая кварта'], [6, '♭5', 'Тритон (ум. квинта)'], [7, '5', 'Чистая квинта'], [8, '♯5 / ♭6', 'Малая секста'], [9, '6', 'Большая секста'],
    [10, '♭7', 'Малая септима'], [11, '7', 'Большая септима'], [12, '8', 'Октава'], [13, '♭9', 'Малая нона'], [14, '9', 'Большая нона'], [17, '11', 'Ундецима'], [21, '13', 'Терцдецима']
  ];
  const DEGN = (iv) => ({ 0: 'R', 1: '♭2', 2: '2', 3: '♭3', 4: '3', 5: '4', 6: '♭5', 7: '5', 8: '♯5', 9: '6', 10: '♭7', 11: '7', 12: 'R' })[iv % 12 === 0 && iv ? 12 : iv % 12];
  const PROGS = [
    ['pop', 'I – V – vi – IV (поп)', ['I', 'V', 'vi', 'IV']], ['rock', 'I – IV – V – IV (рок)', ['I', 'IV', 'V', 'IV']], ['doowop', 'I – vi – IV – V (50-е)', ['I', 'vi', 'IV', 'V']],
    ['jazz', 'ii – V – I (джаз)', ['ii7', 'V7', 'Imaj7', 'Imaj7']], ['turn', 'I – vi – ii – V (турнэраунд)', ['Imaj7', 'vi7', 'ii7', 'V7']],
    ['blues', '12-тактовый блюз', ['I7', 'IV7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7']],
    ['minor', 'i – ♭VII – ♭VI – ♭VII (эпик)', ['i', 'bVII', 'bVI', 'bVII']], ['sad', 'vi – IV – I – V', ['vi', 'IV', 'I', 'V']]
  ];
  const STYLES = [
    ['rock', 'Корни восьмыми (рок)', 'rockbeat'], ['country', 'Корень – квинта (кантри)', 'backbeat'], ['disco', 'Октавы (диско)', 'fourfloor'],
    ['walk', 'Шагающий бас (джаз)', 'swing'], ['funk', 'Фанк шестнадцатыми', 'funk'], ['reggae', 'Регги (one drop)', 'onedrop'], ['motown', 'Мотаун', 'motown'], ['ballad', 'Баллада (целые ноты)', 'backbeat']
  ];

  const Bass = {
    st: { strings: 4, view: 'scales', root: 4, scale: 'minpent', pos: 0, arpRoot: 9, ivRoot: 5, keyMode: 'major', groove: { prog: 'pop', key: 'E', style: 'rock', bpm: 100, drums: true }, line: null },
    tuning() { return TUNINGS[this.st.strings]; },
    render(el) {
      const st = this.st;
      const views = [['scales', 'Гаммы и лады'], ['arps', 'Арпеджио'], ['intervals', 'Интервалы'], ['keys', 'Аккорды в тональностях'], ['groove', 'Грув-генератор']];
      el.innerHTML = `<div class="row wrap tool-ctl">
          <div class="seg" role="radiogroup" aria-label="Струн">${[4, 5, 6].map((n) => `<button data-str="${n}" aria-selected="${n === st.strings}">${n} струн${n === 4 ? 'ы' : ''}</button>`).join('')}</div>
          <span class="muted small">Строй: ${this.tuning().map((m) => T.noteName(m)).join(' ')}</span></div>
        <div class="seg wide-seg" role="tablist" aria-label="Раздел">${views.map(([k, l]) => `<button role="tab" data-view="${k}" aria-selected="${k === st.view}">${l}</button>`).join('')}</div>
        <div id="bs-body" class="tool-body"></div>`;
      $$('[data-str]', el).forEach((b) => (b.onclick = () => { st.strings = +b.dataset.str; st.line = null; this.render(el); }));
      $$('[data-view]', el).forEach((b) => (b.onclick = () => { if (Drums()) Drums().Seq.stop(); st.view = b.dataset.view; this.render(el); }));
      this[st.view]($('#bs-body', el));
    },
    neck(marks, opts) { return Tools().fretboardSvg(Object.assign({ tuning: this.tuning(), marks, frets: 15, height: 40 + this.tuning().length * 26 }, opts || {})); },

    /* ----- scales ----- */
    scales(el) {
      const st = this.st, tun = this.tuning();
      const sc = T.SCALES.find((s) => s.id === st.scale);
      const pcs = sc.iv.map((i) => T.mod(st.root + i));
      const positions = T.scalePositions(st.root, sc.id, 'box', tun);
      const pos = st.pos ? positions[st.pos - 1] : null;
      const inPos = pos ? new Set(pos.notes.map((n) => n.s + ':' + n.f)) : null;
      const marks = [];
      tun.forEach((open, s) => { for (let f = 0; f <= 15; f++) { const pc = T.mod(open + f), k = pcs.indexOf(pc); if (k < 0) continue; if (inPos && !inPos.has(s + ':' + f)) { marks.push({ s, f, label: '', cls: 'dim-m' }); continue; } marks.push({ s, f, label: T.DEG_RU[sc.iv[k]], cls: sc.iv[k] === 0 ? 'root' : '', data: open + f }); } });
      const groups = Object.keys(T.G).map((g) => [g, T.SCALES.filter((x) => x.g === g)]).filter(([, l]) => l.length);
      el.innerHTML = `<div class="row wrap tool-ctl">
          <label>Тоника<select id="bs-root">${T.SHARP.map((n, i) => `<option value="${i}" ${i === st.root ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="wide">Гамма или лад<select id="bs-scale">${groups.map(([g, l]) => `<optgroup label="${esc(T.G[g])}">${l.map((x) => `<option value="${x.id}" ${x.id === sc.id ? 'selected' : ''}>${esc(x.ru)}</option>`).join('')}</optgroup>`).join('')}</select></label>
          <button class="btn" id="bs-play">▶ ${pos ? 'Сыграть позицию' : 'Сыграть гамму'}</button></div>
        <div class="sc-head"><h2>${T.noteName(st.root)} · ${esc(sc.ru)}</h2><div class="degs">${sc.iv.map((i) => `<span class="${i === 0 ? 'r' : ''}">${T.DEG_RU[i]}</span>`).join('')}</div></div>
        <div class="pos-chips"><button class="tchip ${!st.pos ? 'on' : ''}" data-pos="0">Весь гриф</button>${positions.map((p) => `<button class="tchip ${p.n === st.pos ? 'on' : ''}" data-pos="${p.n}">Позиция ${p.n} <small class="muted">${p.from}–${p.to}</small></button>`).join('')}</div>
        <div class="fb-wrap">${this.neck(marks)}</div>
        <p class="muted small">Подписи — ступени от тоники. На басу удобнее всего играть позициями по 4–5 ладов: «один палец на лад».</p>`;
      $('#bs-root', el).onchange = (e) => { st.root = +e.target.value; st.pos = 0; this.scales(el); };
      $('#bs-scale', el).onchange = (e) => { st.scale = e.target.value; st.pos = 0; this.scales(el); };
      $$('[data-pos]', el).forEach((b) => (b.onclick = () => { st.pos = +b.dataset.pos; this.scales(el); }));
      $('#bs-play', el).onclick = () => {
        let seq;
        if (pos) seq = pos.notes.map((n) => tun[n.s] + n.f).sort((a, b) => a - b);
        else { const base = tun[0] + T.mod(st.root - tun[0]); seq = sc.iv.map((i) => base + i).concat([base + 12]); }
        playSeq(seq.concat(seq.slice(0, -1).reverse()), 0.26);
      };
      bindNotes(el);
    },

    /* ----- arpeggios ----- */
    arpShape(rootPc, iv) {
      const tun = this.tuning();
      const lowS = tun.length > 4 ? 1 : 0;           // E string
      let rf = T.mod(rootPc - tun[lowS]);
      if (rf < 2) rf += 12;                          // keep shapes movable (no open strings)
      const rootMidi = tun[lowS] + rf, lo = rf - 1, hi = rf + 3;
      const notes = [];
      let s = lowS;
      for (const i of iv.concat([12])) {
        const m = rootMidi + i;
        // among the remaining strings pick the one closest to the "one finger per fret" box
        let best = -1, bd = 99;
        for (let k = s; k < tun.length; k++) { const f = m - tun[k]; if (f >= lo && f <= hi && Math.abs(f - rf - 1) < bd) { bd = Math.abs(f - rf - 1); best = k; } }
        if (best < 0) break;
        s = best;
        notes.push({ s, f: m - tun[s], iv: i, midi: m });
      }
      return { notes, lo, hi };
    },
    arps(el) {
      const st = this.st, tun = this.tuning();
      const card = ([id, name, iv]) => {
        const sh = this.arpShape(st.arpRoot, iv);
        const W = 150, H = 26 + tun.length * 18, fw = (W - 24) / 6;
        let svg = `<svg viewBox="0 0 ${W} ${H}" class="arp-svg" aria-hidden="true">`;
        for (let k = 0; k <= 6; k++) svg += `<line x1="${16 + k * fw}" x2="${16 + k * fw}" y1="10" y2="${10 + (tun.length - 1) * 18}" class="fret"/>`;
        tun.forEach((_, s) => (svg += `<line x1="16" x2="${16 + 6 * fw}" y1="${10 + (tun.length - 1 - s) * 18}" y2="${10 + (tun.length - 1 - s) * 18}" class="str"/>`));
        sh.notes.forEach((n) => { const x = 16 + (n.f - sh.lo + 0.5) * fw, y = 10 + (tun.length - 1 - n.s) * 18; svg += `<circle cx="${x}" cy="${y}" r="7.5" class="${n.iv % 12 === 0 ? 'r' : ''}"/><text x="${x}" y="${y + 3}">${DEGN(n.iv)}</text>`; });
        svg += `<text x="${16 + 0.5 * fw}" y="${H - 2}" class="fn">${sh.lo}</text></svg>`;
        return `<button class="arp" data-arp="${esc(id)}"><b>${esc(name)}</b><small class="mono">${iv.map((i) => DEGN(i)).join(' ')}</small>${svg}</button>`;
      };
      el.innerHTML = `<div class="row wrap tool-ctl"><label>Тоника<select id="bs-aroot">${T.SHARP.map((n, i) => `<option value="${i}" ${i === st.arpRoot ? 'selected' : ''}>${n}</option>`).join('')}</select></label><span class="muted small">Аппликатуры от тоники на струне E, число под схемой — номер первого лада. Нажмите, чтобы услышать вверх и вниз.</span></div>
        <div class="arps">${ARPS.map(card).join('')}</div>`;
      $('#bs-aroot', el).onchange = (e) => { st.arpRoot = +e.target.value; this.arps(el); };
      $$('[data-arp]', el).forEach((b) => (b.onclick = () => { const a = ARPS.find((x) => x[0] === b.dataset.arp); const ms = this.arpShape(st.arpRoot, a[2]).notes.map((n) => n.midi); playSeq(ms.concat(ms.slice(0, -1).reverse()), 0.22); }));
    },

    /* ----- intervals ----- */
    intervals(el) {
      const st = this.st, tun = this.tuning();
      const sel = st.ivSel ?? 7;
      const lowS = tun.length > 4 ? 1 : 0;
      const rf = T.mod(st.ivRoot - tun[lowS]) || 0;
      const rootMidi = tun[lowS] + rf;
      const target = rootMidi + sel;
      const marks = [{ s: lowS, f: rf, label: 'R', cls: 'root', data: rootMidi }];
      tun.forEach((open, s) => { const f = target - open; if (f >= 0 && f <= 15 && Math.abs(f - rf) <= 5 && sel) marks.push({ s, f, label: INTERVALS.find((x) => x[0] === sel)[1], data: target }); });
      el.innerHTML = `<div class="row wrap tool-ctl"><label>От ноты<select id="bs-iroot">${T.SHARP.map((n, i) => `<option value="${i}" ${i === st.ivRoot ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
        <div class="iv-grid">
          <table class="tbl"><thead><tr><th>Интервал</th><th>Название</th><th>Полутонов</th><th>Нота от ${T.noteName(st.ivRoot)}</th></tr></thead><tbody>
          ${INTERVALS.map(([n, sym, ru]) => `<tr class="${n === sel ? 'on' : ''}" data-iv="${n}"><td class="mono"><b>${sym}</b></td><td>${ru}</td><td class="mono">${n}</td><td class="mono">${T.noteName(st.ivRoot + n)}</td></tr>`).join('')}</tbody></table>
          <div><h3>${esc(INTERVALS.find((x) => x[0] === sel)[2])}</h3><div class="fb-wrap">${this.neck(marks, { frets: Math.min(15, rf + 6) })}</div><p class="muted small">Форма интервала одинакова от любой ноты, пока струны настроены по квартам. Нажмите строку, чтобы услышать.</p></div>
        </div>`;
      $('#bs-iroot', el).onchange = (e) => { st.ivRoot = +e.target.value; this.intervals(el); };
      $$('[data-iv]', el).forEach((r) => (r.onclick = () => { st.ivSel = +r.dataset.iv; this.intervals(el); playSeq([rootMidi, rootMidi + st.ivSel], 0.45); setTimeout(() => { try { Au.playChord([rootMidi, rootMidi + st.ivSel], { keep: true, strum: 0, dur: 1.4 }); } catch (e) { /* ignore */ } }, 950); }));
      bindNotes(el);
    },

    /* ----- chords in every key ----- */
    keys(el) {
      const st = this.st;
      const major = st.keyMode === 'major';
      const keys = major ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] : ['Am', 'Bbm', 'Bm', 'Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m'];
      const heads = major ? ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'] : ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
      el.innerHTML = `<div class="row wrap tool-ctl"><div class="seg"><button data-km="major" aria-selected="${major}">Мажорные тональности</button><button data-km="minor" aria-selected="${!major}">Минорные тональности</button></div><span class="muted small">Нажмите аккорд: прозвучит бас-нота и арпеджио.</span></div>
        <div class="chart-wrap"><table class="chart keys-t"><thead><tr><th></th>${heads.map((h) => `<th class="mono">${h}</th>`).join('')}</tr></thead><tbody>
        ${keys.map((k) => { const ki = T.keyInfo(k); return `<tr><th>${esc(k)}</th>${ki.triads.map((t) => `<td><button class="kc" data-ch="${esc(t.name.replace('dim', '°'))}" data-pcs="${t.pcs.join(',')}">${esc(t.name.replace('dim', '°'))}</button></td>`).join('')}</tr>`; }).join('')}</tbody></table></div>`;
      $$('[data-km]', el).forEach((b) => (b.onclick = () => { st.keyMode = b.dataset.km; this.keys(el); }));
      $$('[data-ch]', el).forEach((b) => (b.onclick = () => {
        const pcs = b.dataset.pcs.split(',').map(Number), tun = this.tuning();
        const r = tun[0] + T.mod(pcs[0] - tun[0]);
        const arp = [r, r + T.mod(pcs[1] - pcs[0]), r + T.mod(pcs[2] - pcs[0]), r + 12];
        playSeq(arp, 0.2);
      }));
    },

    /* ----- groove generator ----- */
    makeLine() {
      const g = this.st.groove, tun = this.tuning();
      const prog = PROGS.find((p) => p[0] === g.prog);
      const k = T.keyInfo(g.key);
      const chords = prog[2].map((rn) => T.romanToChord(rn, k.tonicPc, k.flat));
      const lowest = tun[0];
      const rootOf = (name) => { const c = T.parseChord(name); const m = lowest + T.mod(c.root - lowest); return { m: m < 28 && tun[0] >= 28 ? m + 12 : m, c }; };
      const notes = [];
      chords.forEach((name, bar) => {
        const { m: R, c } = rootOf(name);
        const third = R + (c.t.iv.includes(3) && !c.t.iv.includes(4) ? 3 : 4);
        const fifth = R + (c.t.iv.includes(6) && !c.t.iv.includes(7) ? 6 : 7);
        const sev = R + (c.t.iv.includes(10) ? 10 : c.t.iv.includes(11) ? 11 : 12);
        const next = rootOf(chords[(bar + 1) % chords.length]).m;
        const b0 = bar * 16;
        const add = (pos, midi, len) => notes.push({ pos: b0 + pos, len, midi, conf: 1, tech: {} });
        switch (g.style) {
          case 'rock': for (let i = 0; i < 8; i++) add(i * 2, R, 2); break;
          case 'country': add(0, R, 4); add(4, R, 2); add(8, fifth - 12 >= lowest ? fifth - 12 : fifth, 4); add(12, fifth - 12 >= lowest ? fifth - 12 : fifth, 2); add(14, R, 2); break;
          case 'disco': for (let i = 0; i < 8; i++) add(i * 2, i % 2 ? R + 12 : R, 2); break;
          case 'walk': { const approach = next + (next > R ? -1 : 1); add(0, R, 4); add(4, third, 4); add(8, fifth, 4); add(12, approach, 4); break; }
          case 'funk': add(0, R, 2); add(3, R, 1); add(6, R + 12, 1); add(8, R, 2); add(10, sev, 1); add(11, R + 12, 1); add(14, fifth, 2); break;
          case 'reggae': add(2, R, 3); add(6, third, 2); add(8, fifth, 4); add(14, R, 2); break;
          case 'motown': add(0, R, 3); add(3, R, 1); add(6, fifth, 2); add(8, R + 12, 3); add(11, R, 1); add(14, sev > R + 11 ? fifth : sev, 2); break;
          default: add(0, R, 16);
        }
      });
      const mapped = E.mapFretboard(notes.map((n) => Object.assign({}, n)), { tuning: tun, capo: 0, maxFret: 20, s16: 60 / g.bpm / 4 });
      return { chords, notes: mapped.sort((a, b) => a.pos - b.pos), key: g.key };
    },
    groove(el) {
      const st = this.st, g = st.groove;
      if (!st.line) st.line = this.makeLine();
      const L = st.line, tun = this.tuning();
      const tab = this.tabSvg(L);
      el.innerHTML = `<div class="row wrap tool-ctl">
          <label class="wide">Прогрессия<select id="gv-prog">${PROGS.map(([id, n]) => `<option value="${id}" ${id === g.prog ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
          <label>Тональность<select id="gv-key">${T.KEY_LIST.map((k) => `<option ${k === g.key ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
          <label>Стиль<select id="gv-style">${STYLES.map(([id, n]) => `<option value="${id}" ${id === g.style ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
          <label>Темп <output class="mono" id="gv-bpm-o">${g.bpm}</output><input type="range" id="gv-bpm" min="50" max="180" value="${g.bpm}"></label>
          <label class="check"><input type="checkbox" id="gv-drums" ${g.drums ? 'checked' : ''}> Барабаны</label>
          <button class="btn lg" id="gv-play">${Drums().Seq.playing ? '■ Стоп' : '▶ Играть'}</button></div>
        <div class="gv-chords">${L.chords.map((c, i) => `<span class="gv-c" data-bar="${i}"><small class="mono">${i + 1}</small>${esc(c)}</span>`).join('')}</div>
        <div class="fb-wrap gv-tab">${tab}</div>
        <div class="row wrap"><button class="btn" id="gv-proj">Открыть в редакторе табов</button><span class="muted small">Басовая партия разложена по струнам тем же алгоритмом, что и распознанные табы. Ритм барабанов берётся из раздела «Ритмы».</span></div>`;
      const regen = () => { st.line = null; if (Drums().Seq.playing) { Drums().Seq.stop(); this.groove(el); this.play(el); } else this.groove(el); };
      $('#gv-prog', el).onchange = (e) => { g.prog = e.target.value; regen(); };
      $('#gv-key', el).onchange = (e) => { g.key = e.target.value; regen(); };
      $('#gv-style', el).onchange = (e) => { g.style = e.target.value; regen(); };
      $('#gv-bpm', el).oninput = (e) => { g.bpm = +e.target.value; $('#gv-bpm-o', el).textContent = g.bpm; if (Drums().Seq.playing && Drums().Seq.pattern) Drums().Seq.pattern.bpm = g.bpm; };
      $('#gv-drums', el).onchange = (e) => { g.drums = e.target.checked; if (Drums().Seq.pattern) Drums().Seq.mutes = g.drums ? {} : Object.fromEntries(Object.keys(Drums().Seq.pattern.t).map((k) => [k, true])); };
      $('#gv-play', el).onclick = () => { if (Drums().Seq.playing) { Drums().Seq.stop(); $('#gv-play', el).textContent = '▶ Играть'; } else { this.play(el); $('#gv-play', el).textContent = '■ Стоп'; } };
      $('#gv-proj', el).onclick = () => { Drums().Seq.stop(); App().createGeneratedProject({ title: 'Бас: ' + L.chords.join(' – '), key: L.key, bpm: g.bpm, chords: L.chords, type: 'bass', tuning: tun, notes: L.notes, model: { name: 'Грув-генератор', version: '1.0', params: { style: g.style, prog: g.prog } } }); };
      void tun;
    },
    play(el) {
      const st = this.st, g = st.groove, L = st.line, D = Drums();
      const style = STYLES.find((s) => s[0] === g.style);
      const base = D.find(style[2]) || D.find('backbeat');
      const p = JSON.parse(JSON.stringify(base));
      p.bpm = g.bpm;
      const perBar = p.beats * p.sub;
      const bars = L.chords.length;
      const byPos = new Map();
      L.notes.forEach((n) => byPos.set(n.pos, (byPos.get(n.pos) || []).concat([n])));
      D.Seq.mutes = g.drums ? {} : Object.fromEntries(Object.keys(p.t).map((k) => [k, true]));
      D.Seq.solos = {};
      D.Seq.onHit = null;
      D.Seq.onStep = (i) => {
        if (i < 0) { $$('.gv-c.now, .gv-tab .now', el).forEach((x) => x.classList.remove('now')); return; }
      };
      let lastBar = -1;
      D.Seq.start(p, {
        extra: (i, t, stepDur) => {
          const gstep = D.Seq.step;
          const bar = Math.floor(gstep / perBar) % bars;
          const frac = (gstep % perBar) / perBar * 16;
          if (bar !== lastBar) {
            lastBar = bar;
            setTimeout(() => { $$('.gv-c', el).forEach((x, k) => x.classList.toggle('now', k === bar)); $$('.gv-tab .bar-g', el).forEach((x, k) => x.classList.toggle('now', k === bar)); }, Math.max(0, (t - D.Synth.ctx.currentTime) * 1000));
          }
          if (Math.abs(frac - Math.round(frac)) > 1e-6) return;
          const list = byPos.get(bar * 16 + Math.round(frac));
          if (!list) return;
          const s16 = stepDur * p.sub / 4;
          list.forEach((n) => { try { Au.playChord([n.midi], { keep: true, at: t, dur: Math.min(1.8, n.len * s16 * 0.95), gain: 0.95 }); } catch (e) { /* ignore */ } });
        }
      });
    },
    tabSvg(L) {
      const tun = this.tuning(), S = tun.length;
      const bars = L.chords.length, perRow = 4, bw = 230, gap = 16, rowH = 30 + (S - 1) * 16 + 18;
      const rows = Math.ceil(bars / perRow);
      const W = perRow * bw + 30, H = rows * rowH + 10;
      let s = `<svg viewBox="0 0 ${W} ${H}" class="btab" role="img" aria-label="Табулатура басовой партии">`;
      for (let b = 0; b < bars; b++) {
        const r = Math.floor(b / perRow), c = b % perRow;
        const x0 = 26 + c * bw, y0 = 22 + r * rowH;
        s += `<g class="bar-g"><rect x="${x0}" y="${y0 - 16}" width="${bw - 6}" height="${(S - 1) * 16 + 28}" rx="6" class="bar-bg"/><text x="${x0 + 6}" y="${y0 - 4}" class="ch">${esc(L.chords[b])}</text>`;
        for (let k = 0; k < S; k++) s += `<line x1="${x0}" x2="${x0 + bw - 6}" y1="${y0 + 6 + k * 16}" y2="${y0 + 6 + k * 16}" class="str"/>`;
        if (c === 0) tun.slice().reverse().forEach((m, k) => (s += `<text x="${x0 - 14}" y="${y0 + 10 + k * 16}" class="sn">${T.noteName(m)}</text>`));
        L.notes.filter((n) => Math.floor(n.pos / 16) === b).forEach((n) => {
          const x = x0 + 10 + (n.pos % 16) * ((bw - 26) / 16), y = y0 + 6 + (S - 1 - n.s) * 16;
          s += `<rect x="${x - 6}" y="${y - 7}" width="${String(n.f).length * 8 + 4}" height="14" class="nbg"/><text x="${x - 4}" y="${y + 4}" class="fr">${n.f}</text>`;
        });
        s += '</g>';
      }
      return s + '</svg>';
    }
  };
  function playSeq(seq, step) {
    try { Au.stop(); const t0 = Au.ensure().currentTime + 0.05; seq.forEach((m, i) => Au.playChord([m], { keep: true, at: t0 + i * step, dur: Math.max(0.5, step * 1.6), gain: 0.95 })); } catch (e) { /* ignore */ }
  }
  function bindNotes(el) { $$('[data-play]', el).forEach((g) => g.addEventListener('click', () => { try { Au.playChord([+g.dataset.play], { dur: 1.4, gain: 0.95 }); } catch (e) { /* ignore */ } })); }
  root.GTSBass = Bass;
})(typeof self !== 'undefined' ? self : window);
