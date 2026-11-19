/* Музыкальная теория: аккорды, аппликатуры на грифе, гаммы и лады, трезвучия, квинтовый круг, генератор прогрессий */
(function (root) {
  'use strict';
  const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const RU = { C: 'до', D: 'ре', E: 'ми', F: 'фа', G: 'соль', A: 'ля', B: 'си' };
  const STD = [40, 45, 50, 55, 59, 64];
  const mod = (n, m = 12) => ((n % m) + m) % m;

  function pcOf(name) {
    const m = /^([A-Ga-g])([#b♯♭]*)/.exec(name || '');
    if (!m) return null;
    let p = SHARP.indexOf(m[1].toUpperCase());
    for (const c of m[2]) p += c === '#' || c === '♯' ? 1 : -1;
    return mod(p);
  }
  const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']);
  function noteName(pc, preferFlat) { return (preferFlat ? FLAT : SHARP)[mod(pc)]; }

  /* ---------- chord types ---------- */
  const TYPES = [
    { id: '', ru: 'мажорное трезвучие', iv: [0, 4, 7], opt: [] },
    { id: 'm', ru: 'минорное трезвучие', iv: [0, 3, 7], opt: [] },
    { id: '6', ru: 'мажорный секстаккорд', iv: [0, 4, 7, 9], opt: [7] },
    { id: '7', ru: 'доминантсептаккорд', iv: [0, 4, 7, 10], opt: [7] },
    { id: '9', ru: 'доминантовый нонаккорд', iv: [0, 4, 7, 10, 14], opt: [7] },
    { id: 'm6', ru: 'минорный секстаккорд', iv: [0, 3, 7, 9], opt: [7] },
    { id: 'm7', ru: 'малый минорный септаккорд', iv: [0, 3, 7, 10], opt: [7] },
    { id: 'maj7', ru: 'большой мажорный септаккорд', iv: [0, 4, 7, 11], opt: [7] },
    { id: 'dim', ru: 'уменьшённое трезвучие', iv: [0, 3, 6], opt: [] },
    { id: '+', ru: 'увеличенное трезвучие', iv: [0, 4, 8], opt: [] },
    { id: 'sus4', ru: 'задержание кварты', iv: [0, 5, 7], opt: [] },
    { id: 'sus2', ru: 'задержание секунды', iv: [0, 2, 7], opt: [] },
    { id: 'add9', ru: 'мажор с добавленной ноной', iv: [0, 4, 7, 14], opt: [7] },
    { id: 'm9', ru: 'минорный нонаккорд', iv: [0, 3, 7, 10, 14], opt: [7] },
    { id: 'maj9', ru: 'большой мажорный нонаккорд', iv: [0, 4, 7, 11, 14], opt: [7] },
    { id: '7sus4', ru: 'септаккорд с квартой', iv: [0, 5, 7, 10], opt: [7] },
    { id: 'dim7', ru: 'уменьшённый септаккорд', iv: [0, 3, 6, 9], opt: [] },
    { id: 'm7b5', ru: 'полууменьшённый септаккорд', iv: [0, 3, 6, 10], opt: [] },
    { id: '5', ru: 'пауэр-аккорд (квинта)', iv: [0, 7], opt: [] }
  ];
  const CHART_TYPES = ['', 'm', '6', '7', '9', 'm6', 'm7', 'maj7', 'dim', '+', 'sus4'];
  const ALIAS = { '': '', maj: '', M: '', min: 'm', mi: 'm', '-': 'm', aug: '+', '#5': '+', sus: 'sus4', '°': 'dim', o: 'dim', '°7': 'dim7', o7: 'dim7', 'ø': 'm7b5', ø7: 'm7b5', M7: 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7', 'min7': 'm7', 'm7-5': 'm7b5', '2': 'sus2', 'add2': 'add9', 'M9': 'maj9', 'min6': 'm6', 'dom7': '7' };
  const DEG = { 0: 'R', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: 'b5', 7: '5', 8: '#5', 9: '6', 10: 'b7', 11: '7', 14: '9' };
  const DEG_RU = { 0: 'R', 1: '♭2', 2: '2', 3: '♭3', 4: '3', 5: '4', 6: '♭5', 7: '5', 8: '♯5', 9: '6', 10: '♭7', 11: '7', 14: '9' };
  function typeById(id) { return TYPES.find((t) => t.id === id); }
  function parseChord(name) {
    const m = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/.exec(String(name || '').trim());
    if (!m) return null;
    let suf = m[2];
    let type = typeById(suf) ? suf : ALIAS[suf] !== undefined ? ALIAS[suf] : null;
    if (type === null) return null;
    const t = typeById(type);
    const root = pcOf(m[1]);
    const flat = m[1].includes('b') || (m[1] === 'F' && !m[3]);
    return { name, rootName: m[1], root, type, t, bass: m[3] ? pcOf(m[3]) : root, bassName: m[3] || null, pcs: t.iv.map((i) => mod(root + i)), flat };
  }
  function chordName(rootPc, type, preferFlat) { return noteName(rootPc, preferFlat) + type; }
  function chordInfo(name) {
    const c = parseChord(name);
    if (!c) return null;
    const flat = c.rootName.includes('b');
    const rn = RU[c.rootName[0]] + (c.rootName[1] === '#' ? '-диез' : c.rootName[1] === 'b' ? '-бемоль' : '');
    return Object.assign(c, {
      full: rn + ', ' + c.t.ru + (c.bassName ? ' с басом ' + c.bassName : ''),
      formula: c.t.iv.map((i) => DEG_RU[i] || i).join(' – '),
      notes: c.t.iv.map((i) => noteName(c.root + i, flat || FLAT_KEYS.has(c.rootName)))
    });
  }

  /* ---------- voicing search on the fretboard ---------- */
  const vCache = new Map();
  function voicings(name, opts) {
    opts = opts || {};
    const tuning = opts.tuning || STD;
    const key = name + '|' + tuning.join(',') + '|' + (opts.count || 8);
    if (vCache.has(key)) return vCache.get(key);
    const c = parseChord(name);
    if (!c) return [];
    const S = tuning.length;
    const ivs = c.t.iv;
    const pcs = new Set(c.pcs);
    if (c.bassName) pcs.add(c.bass);
    const optional = new Set((c.t.opt || []).map((i) => mod(c.root + i)));
    const required = c.pcs.filter((p) => !optional.has(p));
    if (c.bassName) required.push(c.bass);
    const minStrings = ivs.length <= 2 ? 2 : ivs.length === 3 ? 4 : 4;
    const out = [];
    const maxFret = opts.maxFret || 15;
    for (let base = 0; base <= maxFret - 3; base++) {
      const lo = Math.max(1, base), hi = base + 3;
      const allowOpen = base <= 4;
      const opt = tuning.map((open) => {
        const o = [-1];
        if (allowOpen && pcs.has(mod(open))) o.push(0);
        for (let f = lo; f <= hi; f++) if (pcs.has(mod(open + f))) o.push(f);
        return o;
      });
      const cur = new Array(S);
      (function rec(s) {
        if (s === S) { evalV(cur.slice(), base); return; }
        for (const f of opt[s]) { cur[s] = f; rec(s + 1); }
      })(0);
    }
    function evalV(fr, base) {
      const played = [];
      fr.forEach((f, s) => { if (f >= 0) played.push(s); });
      if (played.length < Math.min(minStrings, S)) return;
      // no muted strings between played ones
      for (let s = played[0]; s <= played[played.length - 1]; s++) if (fr[s] < 0) return;
      const lowS = played[0];
      if (mod(tuning[lowS] + fr[lowS]) !== c.bass) return;
      const have = new Set(played.map((s) => mod(tuning[s] + fr[s])));
      for (const p of required) if (!have.has(p)) return;
      const fretted = played.filter((s) => fr[s] > 0).map((s) => fr[s]);
      const mn = fretted.length ? Math.min(...fretted) : 0, mx = fretted.length ? Math.max(...fretted) : 0;
      if (mx - mn > 3) return;
      if (mx > 5 && played.some((s) => fr[s] === 0)) return;
      // finger count with optional barre on the lowest fret
      let fingers = fretted.length;
      let barre = null;
      const atMin = played.filter((s) => fr[s] === mn && mn > 0);
      if (atMin.length >= 2) {
        const from = atMin[0], to = atMin[atMin.length - 1];
        let ok = true;
        for (let s = from; s <= to; s++) if (fr[s] >= 0 && fr[s] < mn) ok = false;
        if (ok) { fingers = 1 + fretted.filter((f) => f > mn).length; barre = { fret: mn, from, to }; }
      }
      if (fingers > 4) return;
      if (base > 0 && mn !== base && fretted.length) return; // keep one canonical window per shape
      const opens = played.filter((s) => fr[s] === 0).length;
      const muted = S - played.length;
      const score = (mn || 0) * 0.55 + muted * 0.7 - played.length * 0.25 + fingers * 0.35 + (barre ? 0.6 : 0) - (base === 0 ? opens * 0.25 : opens * -0.4) + (mx - mn) * 0.3 + (have.size < pcs.size ? 0.8 : 0);
      out.push({ frets: fr, base: mn > 0 ? mn : 1, minFret: mn, barre, score, midis: played.map((s) => tuning[s] + fr[s]) });
    }
    const uniq = new Map();
    out.forEach((v) => { const k = v.frets.join(','); if (!uniq.has(k) || uniq.get(k).score > v.score) uniq.set(k, v); });
    let list = Array.from(uniq.values()).sort((a, b) => a.score - b.score);
    // pick the best per region of the neck so variants spread over positions
    const picked = [];
    for (const v of list) {
      if (picked.length >= (opts.count || 8)) break;
      if (picked.some((p) => Math.abs(p.minFret - v.minFret) < 2 && (p.minFret === 0) === (v.minFret === 0))) continue;
      picked.push(v);
    }
    picked.sort((a, b) => a.minFret - b.minFret || a.score - b.score);
    vCache.set(key, picked);
    return picked;
  }

  /* ---------- scales & modes ---------- */
  const G = { base: 'Основные', maj: 'Лады мажора', mel: 'Лады мелодического минора', harm: 'Лады гармонического минора', hmaj: 'Лады гармонического мажора', jazz: 'Джаз, бибоп, симметричные', pent: 'Пентатоники и блюз', exo: 'Экзотические и этнические' };
  const SCALES = [
    { id: 'major', g: 'maj', ru: 'Мажор (ионийский)', iv: [0, 2, 4, 5, 7, 9, 11], mood: 'светлый, устойчивый' },
    { id: 'dorian', g: 'maj', ru: 'Дорийский', iv: [0, 2, 3, 5, 7, 9, 10], mood: 'минор с «джазовой» светлой ступенью 6' },
    { id: 'phrygian', g: 'maj', ru: 'Фригийский', iv: [0, 1, 3, 5, 7, 8, 10], mood: 'испанский, тяжёлый, ♭2' },
    { id: 'lydian', g: 'maj', ru: 'Лидийский', iv: [0, 2, 4, 6, 7, 9, 11], mood: 'парящий, кинематографичный, ♯4' },
    { id: 'mixolydian', g: 'maj', ru: 'Миксолидийский', iv: [0, 2, 4, 5, 7, 9, 10], mood: 'мажор с блюзовой ♭7, рок' },
    { id: 'aeolian', g: 'maj', ru: 'Натуральный минор (эолийский)', iv: [0, 2, 3, 5, 7, 8, 10], mood: 'грустный, лиричный' },
    { id: 'locrian', g: 'maj', ru: 'Локрийский', iv: [0, 1, 3, 5, 6, 8, 10], mood: 'неустойчивый, тёмный, ♭5' },
    { id: 'melodic', g: 'mel', ru: 'Мелодический минор (джазовый)', iv: [0, 2, 3, 5, 7, 9, 11], mood: 'джаз, фьюжн; над m(maj7) и m6' },
    { id: 'dorb2', g: 'mel', ru: 'Дорийский ♭2 (фригийский ♮6)', iv: [0, 1, 3, 5, 7, 9, 10], mood: 'над 7sus4♭9 и sus-аккордами' },
    { id: 'lydaug', g: 'mel', ru: 'Лидийский увеличенный', iv: [0, 2, 4, 6, 8, 9, 11], mood: 'над maj7♯5, очень светлый' },
    { id: 'lyddom', g: 'mel', ru: 'Лидийский доминантовый (Барток, акустический)', iv: [0, 2, 4, 6, 7, 9, 10], mood: 'над 7♯11, неразрешающимися доминантами' },
    { id: 'mixb6', g: 'mel', ru: 'Миксолидийский ♭6 (эолийский мажор)', iv: [0, 2, 4, 5, 7, 8, 10], mood: 'мажор с грустной ♭6' },
    { id: 'locr2', g: 'mel', ru: 'Локрийский ♮2 (полууменьшённый)', iv: [0, 2, 3, 5, 6, 8, 10], mood: 'над m7♭5 в минорной ii–V' },
    { id: 'altered', g: 'mel', ru: 'Альтерированный (суперлокрийский)', iv: [0, 1, 3, 4, 6, 8, 10], mood: 'над 7alt: ♭9, ♯9, ♭5, ♯5' },
    { id: 'harmonic', g: 'harm', ru: 'Гармонический минор', iv: [0, 2, 3, 5, 7, 8, 11], mood: 'восточный, неоклассика' },
    { id: 'locr6', g: 'harm', ru: 'Локрийский ♮6', iv: [0, 1, 3, 5, 6, 9, 10], mood: 'над m7♭5, II ступень минора' },
    { id: 'ion5', g: 'harm', ru: 'Ионийский ♯5 (ионийский увеличенный)', iv: [0, 2, 4, 5, 8, 9, 11], mood: 'над maj7♯5' },
    { id: 'dor4', g: 'harm', ru: 'Дорийский ♯4 (румынский минор)', iv: [0, 2, 3, 6, 7, 9, 10], mood: 'клезмер, балканы' },
    { id: 'phrygdom', g: 'harm', ru: 'Фригийский доминантовый (испанский)', iv: [0, 1, 4, 5, 7, 8, 10], mood: 'фламенко, метал; над V7♭9 в миноре' },
    { id: 'lyd2', g: 'harm', ru: 'Лидийский ♯2', iv: [0, 3, 4, 6, 7, 9, 11], mood: 'экзотичный мажор' },
    { id: 'ultraloc', g: 'harm', ru: 'Суперлокрийский ♭♭7 (ультралокрийский)', iv: [0, 1, 3, 4, 6, 8, 9], mood: 'над уменьшённым септаккордом' },
    { id: 'harmmaj', g: 'hmaj', ru: 'Гармонический мажор', iv: [0, 2, 4, 5, 7, 8, 11], mood: 'мажор с минорной ♭6' },
    { id: 'dorb5', g: 'hmaj', ru: 'Дорийский ♭5', iv: [0, 2, 3, 5, 6, 9, 10], mood: 'над m7♭5 с мажорной 6' },
    { id: 'phryb4', g: 'hmaj', ru: 'Фригийский ♭4', iv: [0, 1, 3, 4, 7, 8, 10], mood: 'тёмный, восточный' },
    { id: 'lydb3', g: 'hmaj', ru: 'Лидийский ♭3', iv: [0, 2, 3, 6, 7, 9, 11], mood: 'над m(maj7)♯11' },
    { id: 'mixb2', g: 'hmaj', ru: 'Миксолидийский ♭2', iv: [0, 1, 4, 5, 7, 9, 10], mood: 'над 7♭9' },
    { id: 'lydaug2', g: 'hmaj', ru: 'Лидийский увеличенный ♯2', iv: [0, 3, 4, 6, 8, 9, 11], mood: 'симметрично-экзотичный' },
    { id: 'locrbb7', g: 'hmaj', ru: 'Локрийский ♭♭7', iv: [0, 1, 3, 5, 6, 8, 9], mood: 'над уменьшёнными аккордами' },
    { id: 'bebopdom', g: 'jazz', ru: 'Бибоп доминантовый', iv: [0, 2, 4, 5, 7, 9, 10, 11], mood: 'миксолидийский + проходящая 7; доли в такт' },
    { id: 'bebopmaj', g: 'jazz', ru: 'Бибоп мажорный (мажорный 6-уменьшённый, Барри Харрис)', iv: [0, 2, 4, 5, 7, 8, 9, 11], mood: 'мажор + проходящая ♭6' },
    { id: 'bebopdor', g: 'jazz', ru: 'Бибоп дорийский', iv: [0, 2, 3, 4, 5, 7, 9, 10], mood: 'дорийский + проходящая 3' },
    { id: 'bebopmel', g: 'jazz', ru: 'Бибоп дорийский мелодический', iv: [0, 2, 3, 5, 7, 9, 10, 11], mood: 'дорийский + натуральная 7' },
    { id: 'dimhw', g: 'jazz', ru: 'Уменьшённая полутон–тон', iv: [0, 1, 3, 4, 6, 7, 9, 10], mood: 'над 7♭9, 13♭9' },
    { id: 'dimwh', g: 'jazz', ru: 'Уменьшённая тон–полутон', iv: [0, 2, 3, 5, 6, 8, 9, 11], mood: 'над dim7' },
    { id: 'whole', g: 'jazz', ru: 'Целотонная', iv: [0, 2, 4, 6, 8, 10], mood: 'над 7♯5, «сновидение»' },
    { id: 'augsc', g: 'jazz', ru: 'Увеличенная (симметричная)', iv: [0, 3, 4, 7, 8, 11], mood: 'над maj7♯5, Колтрейн' },
    { id: 'majpent', g: 'pent', ru: 'Мажорная пентатоника', iv: [0, 2, 4, 7, 9], mood: 'кантри, поп', parent: 'major' },
    { id: 'minpent', g: 'pent', ru: 'Минорная пентатоника', iv: [0, 3, 5, 7, 10], mood: 'рок и блюз, основа соло', parent: 'aeolian' },
    { id: 'majblues', g: 'pent', ru: 'Мажорный блюз', iv: [0, 2, 3, 4, 7, 9], mood: 'кантри-блюз', parent: 'major' },
    { id: 'minblues', g: 'pent', ru: 'Минорный блюз', iv: [0, 3, 5, 6, 7, 10], mood: 'блюз с «блюзовой нотой» ♭5', parent: 'aeolian' },
    { id: 'mixoblues', g: 'pent', ru: 'Миксо-блюз (смешанный блюз)', iv: [0, 2, 3, 4, 5, 6, 7, 9, 10], mood: 'мажорный + минорный блюз, BB King', parent: 'mixolydian' },
    { id: 'min6pent', g: 'pent', ru: 'Минорная пентатоника с секстой (m6)', iv: [0, 3, 5, 7, 9], mood: 'дорийский оттенок', parent: 'dorian' },
    { id: 'dorpent', g: 'pent', ru: 'Дорийская пентатоника (кумои)', iv: [0, 2, 3, 7, 9], mood: 'джазовый минор', parent: 'dorian' },
    { id: 'mixopent', g: 'pent', ru: 'Миксолидийская пентатоника', iv: [0, 4, 5, 7, 10], mood: 'над доминантами', parent: 'mixolydian' },
    { id: 'lydpent', g: 'pent', ru: 'Лидийская пентатоника', iv: [0, 4, 6, 7, 11], mood: 'над maj7♯11', parent: 'lydian' },
    { id: 'lyddompent', g: 'pent', ru: 'Лидийская доминантовая пентатоника', iv: [0, 4, 6, 7, 10], mood: 'над 7♯11', parent: 'lyddom' },
    { id: 'egypt', g: 'pent', ru: 'Египетская (подвешенная пентатоника)', iv: [0, 2, 5, 7, 10], mood: 'над sus-аккордами', parent: 'mixolydian' },
    { id: 'chromatic', g: 'base', ru: 'Хроматическая', iv: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], mood: 'все 12 нот' },
    { id: 'dblharm', g: 'exo', ru: 'Двойная гармоническая (византийская, арабская)', iv: [0, 1, 4, 5, 7, 8, 11], mood: 'Ближний Восток' },
    { id: 'hungmin', g: 'exo', ru: 'Венгерский минор (цыганский)', iv: [0, 2, 3, 6, 7, 8, 11], mood: 'цыганский, драматичный' },
    { id: 'hungmaj', g: 'exo', ru: 'Венгерский мажор', iv: [0, 3, 4, 6, 7, 9, 10], mood: 'над 7♯9' },
    { id: 'neapmin', g: 'exo', ru: 'Неаполитанский минор', iv: [0, 1, 3, 5, 7, 8, 11], mood: 'классический, мрачный' },
    { id: 'neapmaj', g: 'exo', ru: 'Неаполитанский мажор', iv: [0, 1, 3, 5, 7, 9, 11], mood: 'классический, напряжённый' },
    { id: 'enigma', g: 'exo', ru: 'Энигматическая (Верди)', iv: [0, 1, 4, 6, 8, 10, 11], mood: 'загадочный' },
    { id: 'persian', g: 'exo', ru: 'Персидская', iv: [0, 1, 4, 5, 6, 8, 11], mood: 'восточный' },
    { id: 'ultraphryg', g: 'exo', ru: 'Ультрафригийский', iv: [0, 1, 3, 4, 7, 8, 9], mood: 'мрачный, метал' },
    { id: 'locrmaj', g: 'exo', ru: 'Локрийский мажор (арабская)', iv: [0, 2, 4, 5, 6, 8, 10], mood: 'над 7♭5♭13' },
    { id: 'prometheus', g: 'exo', ru: 'Прометей (Скрябин)', iv: [0, 2, 4, 6, 9, 10], mood: 'мистический аккорд Скрябина' },
    { id: 'spanish8', g: 'exo', ru: 'Испанская восьмиступенная', iv: [0, 1, 3, 4, 5, 6, 8, 10], mood: 'фламенко' },
    { id: 'hirajoshi', g: 'exo', ru: 'Хирадзёси (эолийская пентатоника)', iv: [0, 2, 3, 7, 8], mood: 'японская, задумчивая', parent: 'aeolian' },
    { id: 'iwato', g: 'exo', ru: 'Ивато', iv: [0, 1, 5, 6, 10], mood: 'японская, тёмная', parent: 'locrian' },
    { id: 'honkumoi', g: 'exo', ru: 'Хон Кумои Дзёси', iv: [0, 1, 5, 7, 8], mood: 'японская', parent: 'phrygian' },
    { id: 'insen', g: 'exo', ru: 'Ин Сен', iv: [0, 1, 5, 7, 10], mood: 'японская, над sus♭9', parent: 'phrygian' }
  ];
  SCALES.forEach((sc) => { if (sc.id === 'major' || sc.id === 'aeolian' || sc.id === 'harmonic' || sc.id === 'melodic' || sc.id === 'minpent' || sc.id === 'majpent' || sc.id === 'minblues') sc.basic = true; });
  /* chords built on the root that fit inside a scale (what the scale is played over) */
  function scaleChords(rootPc, scaleId, preferFlat) {
    const sc = SCALES.find((s) => s.id === scaleId);
    const set = new Set(sc.iv.map((i) => mod(i)));
    return TYPES.filter((t) => t.iv.every((i) => set.has(mod(i)))).map((t) => noteName(rootPc, preferFlat) + t.id);
  }
  function scalesForChord(type) {
    const t = typeById(type);
    return SCALES.filter((sc) => { const set = new Set(sc.iv); return t.iv.every((i) => set.has(mod(i))) && sc.id !== 'chromatic'; });
  }
  /* fingering positions: boxes (window of frets) or three-notes-per-string */
  function scalePositions(rootPc, scaleId, kind, tuning) {
    tuning = tuning || STD;
    const sc = SCALES.find((s) => s.id === scaleId);
    const pcs = new Set(sc.iv.map((i) => mod(rootPc + i)));
    const starts = [];
    for (let f = 0; f <= 11; f++) if (pcs.has(mod(tuning[0] + f))) starts.push(f);
    // begin from the root
    const ri = starts.findIndex((f) => mod(tuning[0] + f) === rootPc);
    const ordered = starts.slice(ri).concat(starts.slice(0, ri));
    return ordered.map((f0, k) => {
      let notes = [];
      if (kind === '3nps') {
        const asc = [];
        for (let m = tuning[0] + f0; asc.length < 18 && m < tuning[0] + 40; m++) if (pcs.has(mod(m))) asc.push(m);
        tuning.forEach((open, s) => asc.slice(s * 3, s * 3 + 3).forEach((m) => notes.push({ s, f: m - open })));
        if (notes.some((n) => n.f < 0)) notes = notes.filter((n) => n.f >= 0);
      } else {
        const lo = Math.max(0, f0 - 1), hi = f0 + 3;
        tuning.forEach((open, s) => { for (let f = lo; f <= hi; f++) if (pcs.has(mod(open + f))) notes.push({ s, f }); });
      }
      const fr = notes.map((n) => n.f);
      return { n: k + 1, from: Math.min(...fr), to: Math.max(...fr), notes };
    });
  }
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  function triadQuality(a, b, c) {
    const t = mod(b - a), f = mod(c - a);
    if (t === 4 && f === 7) return '';
    if (t === 3 && f === 7) return 'm';
    if (t === 3 && f === 6) return 'dim';
    if (t === 4 && f === 8) return '+';
    return null;
  }
  function diatonicTriads(rootPc, scaleId, preferFlat) {
    let sc = SCALES.find((s) => s.id === scaleId);
    if (sc.parent) sc = SCALES.find((s) => s.id === sc.parent);
    if (!sc) return [];
    if (sc.iv.length !== 7) return [];
    return sc.iv.map((iv, i) => {
      const a = mod(rootPc + iv), b = mod(rootPc + sc.iv[(i + 2) % 7]), c = mod(rootPc + sc.iv[(i + 4) % 7]);
      const q = triadQuality(a, b, c);
      let rn = ROMAN[i];
      if (q === 'm' || q === 'dim') rn = rn.toLowerCase();
      if (q === 'dim') rn += '°';
      if (q === '+') rn += '+';
      const nm = q === null ? noteName(a, preferFlat) + ' (' + [a, b, c].map((p) => noteName(p, preferFlat)).join('–') + ')' : noteName(a, preferFlat) + q;
      const ma = 48 + mod(a - 0), mb = ma + mod(b - a), mc = ma + mod(c - a);
      return { degree: i, roman: rn, name: nm, pcs: [a, b, c], q, midis: [ma, mb, mc] };
    });
  }
  // close-voiced triads on a set of three adjacent strings (like printed triad charts)
  function triadShapes(pcs, strings, tuning, maxFret) {
    tuning = tuning || STD; maxFret = maxFret || 15;
    const out = [];
    const opts = strings.map((s) => { const o = []; for (let f = 0; f <= maxFret; f++) if (pcs.includes(mod(tuning[s] + f))) o.push(f); return o; });
    for (const a of opts[0]) for (const b of opts[1]) for (const c of opts[2]) {
      const fr = [a, b, c];
      const got = new Set(fr.map((f, i) => mod(tuning[strings[i]] + f)));
      if (got.size !== 3) continue;
      const fretted = fr.filter((f) => f > 0);
      const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
      if (span > 3) continue;
      if (fr.some((f) => f === 0) && fretted.some((f) => f > 4)) continue;
      const bassPc = mod(tuning[strings[0]] + a);
      const inv = bassPc === pcs[0] ? 0 : bassPc === pcs[1] ? 1 : 2;
      out.push({ strings, frets: fr, inv, pos: Math.min(...fr) });
    }
    return out.sort((x, y) => x.pos - y.pos);
  }

  /* ---------- keys & circle of fifths ---------- */
  const CIRCLE_MAJ = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
  const CIRCLE_MIN = ['Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'Ebm', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm'];
  const CIRCLE_DIM = ['B°', 'F#°', 'C#°', 'G#°', 'D#°', 'A#°', 'F°', 'C°', 'G°', 'D°', 'A°', 'E°'];
  const SIG = [0, 1, 2, 3, 4, 5, 6, -5, -4, -3, -2, -1];
  const SHARP_ORDER = ['F#', 'C#', 'G#', 'D#', 'A#', 'E#', 'B#'], FLAT_ORDER = ['Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Fb'];
  function keyInfo(key) {
    const minor = /m$/.test(key) && key !== 'm';
    const tonic = minor ? key.slice(0, -1) : key;
    const tonicPc = pcOf(tonic);
    const relMajPc = minor ? mod(tonicPc + 3) : tonicPc;
    const idx = CIRCLE_MAJ.findIndex((k) => pcOf(k) === relMajPc);
    const sig = SIG[idx];
    const flat = sig < 0 || (sig === 0 && FLAT_KEYS.has(key));
    const scale = minor ? 'aeolian' : 'major';
    const triads = diatonicTriads(tonicPc, scale, flat || sig < 0);
    const notes = SCALES.find((s) => s.id === scale).iv.map((i) => noteName(tonicPc + i, sig < 0));
    return {
      key, minor, tonic, tonicPc, idx, sig,
      sigText: sig === 0 ? 'без знаков' : sig > 0 ? sig + ' ' + plural(sig, 'диез', 'диеза', 'диезов') + ': ' + SHARP_ORDER.slice(0, sig).join(' ') : -sig + ' ' + plural(-sig, 'бемоль', 'бемоля', 'бемолей') + ': ' + FLAT_ORDER.slice(0, -sig).join(' '),
      relative: minor ? CIRCLE_MAJ[idx] : CIRCLE_MIN[idx],
      dominant: minor ? CIRCLE_MIN[(idx + 1) % 12] : CIRCLE_MAJ[(idx + 1) % 12],
      subdominant: minor ? CIRCLE_MIN[(idx + 11) % 12] : CIRCLE_MAJ[(idx + 11) % 12],
      notes, triads, flat: sig < 0
    };
  }
  const ALL_KEYS = SHARP.map((n, i) => FLAT_KEYS.has(FLAT[i]) && FLAT[i] !== SHARP[i] ? FLAT[i] : n).flatMap((n) => [n, (n === 'Gb' ? 'F#' : n) + 'm']);
  const KEY_LIST = ['C', 'Am', 'G', 'Em', 'D', 'Bm', 'A', 'F#m', 'E', 'C#m', 'B', 'G#m', 'F#', 'Ebm', 'Db', 'Bbm', 'Ab', 'Fm', 'Eb', 'Cm', 'Bb', 'Gm', 'F', 'Dm'];

  /* ---------- roman numerals → chords ---------- */
  const DEG_OFF = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
  function romanToChord(rn, tonicPc, preferFlat) {
    const m = /^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(°|ø|\+)?(.*)$/.exec(rn);
    if (!m) return null;
    let off = DEG_OFF[m[2].toUpperCase()] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0);
    const minor = m[2] === m[2].toLowerCase();
    let ext = m[4] || '';
    let type;
    if (m[3] === '°') type = ext === '7' ? 'dim7' : 'dim';
    else if (m[3] === 'ø') type = 'm7b5';
    else if (m[3] === '+') type = '+';
    else if (minor) type = ext === '' ? 'm' : ext === '7' ? 'm7' : ext === '9' ? 'm9' : ext === '6' ? 'm6' : 'm' + ext;
    else type = ext;
    if (!typeById(type)) type = minor ? 'm' : '';
    const pc = mod(tonicPc + off);
    return noteName(pc, preferFlat || m[1] === 'b') + type;
  }

  /* ---------- harmonic function & where to go next ---------- */
  const NEXT = { I: ['IV', 'V', 'vi', 'ii', 'iii'], ii: ['V', 'vii°', 'IV'], iii: ['vi', 'IV', 'ii'], IV: ['V', 'I', 'ii', 'iv'], V: ['I', 'vi', 'IV'], vi: ['IV', 'ii', 'V', 'iii'], 'vii°': ['I', 'iii'] };
  const NEXT_MIN = { i: ['iv', 'bVI', 'bVII', 'v', 'V'], 'ii°': ['V', 'v'], bIII: ['bVI', 'iv', 'bVII'], iv: ['v', 'i', 'bVII', 'V'], v: ['i', 'bVI'], V: ['i', 'bVI'], bVI: ['bVII', 'iv', 'bIII', 'V'], bVII: ['i', 'bIII', 'bVI'] };
  const FN_RU = { I: 'тоника', i: 'тоника', ii: 'субдоминанта (II)', 'ii°': 'субдоминанта (II)', iii: 'медианта', bIII: 'параллельный мажор', IV: 'субдоминанта', iv: 'субдоминанта', V: 'доминанта', v: 'доминанта (натуральная)', vi: 'параллельный минор', bVI: 'VI ступень', 'vii°': 'вводный аккорд', bVII: 'VII ступень' };
  function functionInKey(chord, key) {
    const c = parseChord(chord), k = keyInfo(key);
    if (!c) return null;
    const off = mod(c.root - k.tonicPc);
    const cand = k.minor
      ? { 0: 'i', 2: 'ii°', 3: 'bIII', 5: 'iv', 7: c.type.startsWith('m') ? 'v' : 'V', 8: 'bVI', 10: 'bVII' }
      : { 0: 'I', 2: 'ii', 4: 'iii', 5: c.type.startsWith('m') ? 'iv' : 'IV', 7: 'V', 9: 'vi', 11: 'vii°' };
    const rn = cand[off];
    if (!rn) return { roman: null, fn: 'вне тональности', diatonic: false };
    const tri = k.triads.find((t) => mod(t.pcs[0] - k.tonicPc) === off);
    const diatonic = !!tri && (tri.q || '') === (c.type.replace(/7|6|9|maj7|add9|sus4|sus2|m7b5/g, (x) => (x === 'm7b5' ? 'dim' : '')) || '');
    return { roman: rn, fn: FN_RU[rn] || '', diatonic };
  }
  function suggestions(chord, key) {
    const k = keyInfo(key);
    const f = functionInKey(chord, key);
    const c = parseChord(chord);
    const out = { next: [], subs: [], colors: [] };
    if (!c) return out;
    const table = k.minor ? NEXT_MIN : NEXT;
    if (f && f.roman && table[f.roman]) out.next = table[f.roman].map((rn) => ({ roman: rn, name: romanToChord(rn, k.tonicPc, k.flat) }));
    else out.next = (k.minor ? ['i', 'iv', 'V'] : ['I', 'IV', 'V']).map((rn) => ({ roman: rn, name: romanToChord(rn, k.tonicPc, k.flat) }));
    const rn = c.rootName;
    const flatR = rn.includes('b');
    if (c.type === '' || c.type === 'maj7' || c.type === '6') out.subs.push({ why: 'параллельный минор', name: noteName(c.root + 9, flatR) + 'm' }, { why: 'медианта', name: noteName(c.root + 4, flatR) + 'm' });
    if (c.type === 'm' || c.type === 'm7') out.subs.push({ why: 'параллельный мажор', name: noteName(c.root + 3, flatR || true) }, { why: 'субмедианта', name: noteName(c.root - 4, true) });
    if (c.type === '7' || c.type === '9') out.subs.push({ why: 'тритоновая замена', name: noteName(c.root + 6, true) + '7' }, { why: 'двойная доминанта к ней', name: noteName(c.root + 7, flatR) + '7' });
    if (f && f.roman === 'V') out.subs.push({ why: 'вводный уменьшённый', name: noteName(c.root + 4, flatR) + 'dim' });
    const color = c.t.iv.includes(3) ? ['m7', 'm9', 'm6', 'sus2', 'sus4'] : c.type === 'dim' ? ['dim7', 'm7b5'] : ['maj7', '6', 'add9', 'sus2', 'sus4', '7'];
    out.colors = color.filter((t) => t !== c.type).map((t) => rn + t);
    return out;
  }

  /* ---------- progression generator ---------- */
  const MOODS = [
    { id: 'happy', ru: 'Радостное', bpm: 112, feel: 'strum', keys: ['G', 'C', 'D', 'A', 'E'], why: 'Опора на мажорную тонику и доминанту, движение вверх по кварте и квинте.',
      pats: [['I', 'IV', 'V', 'I'], ['I', 'V', 'vi', 'IV'], ['I', 'IV', 'I', 'V'], ['I', 'vi', 'IV', 'V'], ['I', 'iii', 'IV', 'V'], ['IV', 'V', 'I', 'I'], ['I', 'V', 'IV', 'V']] },
    { id: 'sad', ru: 'Грустное', bpm: 72, feel: 'arp', keys: ['Am', 'Em', 'Dm', 'Bm'], why: 'Минорная тоника и натуральная минорная доминанта v без вводного тона: нет «разрешения в свет».',
      pats: [['i', 'iv', 'v', 'i'], ['i', 'bVI', 'bIII', 'bVII'], ['i', 'iv', 'bVII', 'bIII'], ['i', 'bVI', 'iv', 'v'], ['vi', 'IV', 'I', 'V'], ['i', 'v', 'bVI', 'iv'], ['vi', 'iii', 'IV', 'I']] },
    { id: 'dark', ru: 'Мрачное', bpm: 66, feel: 'pad', keys: ['Em', 'Dm', 'Cm', 'F#m'], why: 'Полутоновые ходы (♭II, ♭VI) и уменьшённые аккорды создают тяжесть и тревогу.',
      pats: [['i', 'bII', 'i', 'bII'], ['i', 'bVI', 'bII', 'V'], ['i', 'iv', 'ii°', 'V'], ['i', 'bVI', 'iv', 'V'], ['i', 'bVII', 'bVI', 'V']] },
    { id: 'romantic', ru: 'Романтичное', bpm: 84, feel: 'arp', keys: ['C', 'G', 'D', 'F', 'E'], why: 'Септаккорды и ход через vi и ii — мягкая, «тёплая» гармония баллад.', sevenths: true,
      pats: [['I', 'vi', 'IV', 'V'], ['I', 'iii', 'IV', 'V'], ['I', 'vi', 'ii', 'V'], ['IV', 'V', 'iii', 'vi'], ['I', 'V', 'vi', 'iii', 'IV', 'I', 'IV', 'V']] },
    { id: 'epic', ru: 'Эпичное', bpm: 90, feel: 'strum', keys: ['Dm', 'Em', 'Am', 'Cm'], why: 'Мажорные ♭VI и ♭VII в миноре — героический, саундтрековый подъём.',
      pats: [['i', 'bVI', 'bIII', 'bVII'], ['bVI', 'bVII', 'i', 'i'], ['i', 'bVII', 'bVI', 'bVII'], ['i', 'bVI', 'bVII', 'V'], ['I', 'V', 'vi', 'IV']] },
    { id: 'dreamy', ru: 'Мечтательное', bpm: 78, feel: 'arp', keys: ['C', 'G', 'D', 'E', 'A'], why: 'Большие септаккорды и заимствованная минорная субдоминанта iv звучат прозрачно и ностальгично.', sevenths: true,
      pats: [['I', 'IV', 'I', 'IV'], ['I', 'iii', 'IV', 'iv'], ['I', 'iii', 'vi', 'IV'], ['IV', 'I', 'vi', 'V'], ['I', 'vi', 'IV', 'iv']] },
    { id: 'jazz', ru: 'Джазовое', bpm: 100, feel: 'pad', keys: ['C', 'F', 'Bb', 'Eb', 'G'], why: 'Цепочки ii–V–I и септаккорды на каждой ступени — классическая джазовая каденция.', jazz: true,
      pats: [['ii', 'V', 'I', 'I'], ['I', 'vi', 'ii', 'V'], ['iii', 'vi', 'ii', 'V'], ['I', 'VI7', 'ii', 'V'], ['ii', 'V', 'iii', 'vi', 'ii', 'V', 'I', 'I']] },
    { id: 'blues', ru: 'Блюз', bpm: 96, feel: 'strum', keys: ['E', 'A', 'G', 'C'], why: 'Двенадцатитактовый блюз: доминантсептаккорды на I, IV и V.',
      pats: [['I7', 'I7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'], ['I7', 'IV7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7']] },
    { id: 'tense', ru: 'Напряжённое, кинематографичное', bpm: 80, feel: 'pad', keys: ['C', 'Am', 'Em', 'Dm'], why: 'Уменьшённые аккорды и неразрешённые доминанты держат слушателя в ожидании.',
      pats: [['I', 'vi', 'iii', 'vii°'], ['i', 'bVI', 'iv', 'V'], ['IV', 'V', 'iii', 'vi'], ['i', 'iv', 'V', 'bVI']] },
    { id: 'folk', ru: 'Фолк и кантри', bpm: 104, feel: 'strum', keys: ['G', 'D', 'C', 'A'], why: 'Простые I–IV–V, миксолидийский ♭VII — звучание песен у костра.',
      pats: [['I', 'IV', 'I', 'V'], ['I', 'V', 'IV', 'I'], ['I', 'IV', 'bVII', 'I'], ['vi', 'V', 'IV', 'I'], ['I', 'IV', 'V', 'IV']] },
    { id: 'rock', ru: 'Рок', bpm: 120, feel: 'strum', keys: ['E', 'A', 'D', 'G'], why: 'Мажорные аккорды на ♭III, ♭VI и ♭VII — энергия рок-риффов.',
      pats: [['I', 'bVII', 'IV', 'I'], ['I', 'bIII', 'IV', 'I'], ['i', 'bVII', 'bVI', 'bVII'], ['I', 'V', 'IV', 'IV'], ['I', 'IV', 'V', 'IV']] },
    { id: 'pop', ru: 'Поп-гимн', bpm: 116, feel: 'strum', keys: ['C', 'G', 'D', 'A', 'E'], why: 'Самая узнаваемая четвёрка поп-музыки I–V–vi–IV и её вращения.',
      pats: [['I', 'V', 'vi', 'IV'], ['vi', 'IV', 'I', 'V'], ['IV', 'I', 'V', 'vi'], ['I', 'V', 'vi', 'iii', 'IV', 'I', 'IV', 'V']] }
  ];
  /* 20 popular progressions (Nashville numbers) */
  const FAMOUS = [
    ['I–IV–V–I', ['I', 'IV', 'V', 'I'], 'Радостная, фолк-песня'], ['I–vi–IV–V', ['I', 'vi', 'IV', 'V'], 'Романтичная, мягкий поп'], ['I–V–vi–IV', ['I', 'V', 'vi', 'IV'], 'Поп-гимн'],
    ['ii–V–I', ['ii7', 'V7', 'Imaj7'], 'Джазовая каденция'], ['I–vi–ii–V', ['I', 'vi', 'ii', 'V'], 'Старые баллады, джаз-поп'], ['I–iii–IV–V', ['I', 'iii', 'IV', 'V'], 'Светлая, поднимающая'],
    ['I–IV–vi–V', ['I', 'IV', 'vi', 'V'], 'Поп-рок'], ['I–iii–vi–IV', ['I', 'iii', 'vi', 'IV'], 'Мечтательная'], ['I–IV–ii–V', ['I', 'IV', 'ii', 'V'], 'Соул, R&B'],
    ['vi–IV–I–V', ['vi', 'IV', 'I', 'V'], 'Тёплая, для фингерстайла'], ['I–♭VII–IV', ['I', 'bVII', 'IV'], 'Блюз-рок, южный рок'], ['I–V–vi–iii–IV', ['I', 'V', 'vi', 'iii', 'IV'], 'Энергичная, гимн'],
    ['I–V–IV–I', ['I', 'V', 'IV', 'I'], 'Рок-н-ролл'], ['vi–I–vi–V', ['vi', 'I', 'vi', 'V'], 'Грустная, эмоциональная'], ['I–vi–IV–V (эпик)', ['I', 'vi', 'IV', 'V'], 'Саундтрек'],
    ['IV–V–I–vi', ['IV', 'V', 'I', 'vi'], 'Кинематографичное напряжение'], ['vi–V–IV–I', ['vi', 'V', 'IV', 'I'], 'Фолк, автор-исполнитель'], ['I–IV–♭VII–I', ['I', 'IV', 'bVII', 'I'], 'Ирландский фолк'],
    ['V–IV–I', ['V', 'IV', 'I'], 'Финал, кода'], ['i–iv–v', ['i', 'iv', 'v'], 'Тёмная, грустная (минор)']
  ];
  function seventhify(rn, jazz) {
    if (/7|9|°|ø|\+/.test(rn)) return rn;
    const base = rn.replace(/^[b#]/, '');
    if (base === 'V') return rn + '7';
    if (base === base.toLowerCase()) return rn + '7';
    if (jazz || base === 'I' || base === 'IV') return rn + 'maj7';
    return rn;
  }
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function generate(opts) {
    const mood = MOODS.find((m) => m.id === opts.mood) || MOODS[0];
    const r = rng(opts.seed || Date.now());
    const pick = (a) => a[Math.floor(r() * a.length)];
    let key = opts.key && opts.key !== 'auto' ? opts.key : pick(mood.keys);
    let pat = pick(mood.pats).slice();
    const minorPat = pat.some((x) => /^(i|iv|v)$/.test(x) || /^b/.test(x)) && pat[0].toLowerCase() === pat[0];
    // pattern written relative to major or minor tonic: align key mode with pattern
    const kInfo = keyInfo(key);
    let tonicPc = kInfo.tonicPc;
    if (minorPat && !kInfo.minor) { key = noteName(tonicPc + 9, kInfo.flat) + 'm'; tonicPc = mod(tonicPc + 9); }
    if (!minorPat && kInfo.minor && pat[0] !== 'vi') { key = noteName(tonicPc + 3, true).replace('Gb', 'F#'); tonicPc = mod(tonicPc + 3); }
    if (!minorPat && kInfo.minor && pat[0] === 'vi') { tonicPc = mod(tonicPc + 3); key = noteName(tonicPc, kInfo.flat); }
    const len = opts.length || pat.length;
    if (pat.length < len && mood.id !== 'blues') {
      const second = pat.slice();
      if (r() < 0.6) second[second.length - 1] = minorPat ? (r() < 0.5 ? 'V' : 'v') : 'V';
      if (r() < 0.4 && !minorPat) second[1] = pick(['ii', 'iii', 'vi', 'IV']);
      while (pat.length < len) pat = pat.concat(second).slice(0, len);
    }
    if (pat.length > len && mood.id !== 'blues') pat = pat.slice(0, len);
    if (mood.sevenths || mood.jazz || opts.sevenths) pat = pat.map((x) => seventhify(x, mood.jazz));
    if (opts.sus && r() < 0.7) { const i = pat.findIndex((x) => /^V$/.test(x)); if (i > 0) pat[i] = 'V'; }
    const flat = FLAT_KEYS.has(key) || keyInfo(key).sig < 0;
    const chords = pat.map((rn) => ({ roman: rn, name: romanToChord(rn, tonicPc, flat) }));
    return { mood, key, bpm: opts.bpm || mood.bpm, feel: opts.feel || mood.feel, chords };
  }

  function plural(n, a, b, c) { n = Math.abs(n) % 100; const n1 = n % 10; if (n > 10 && n < 20) return c; if (n1 > 1 && n1 < 5) return b; if (n1 === 1) return a; return c; }

  const API = { G, scaleChords, scalesForChord, scalePositions, SHARP, FLAT, STD, TYPES, CHART_TYPES, SCALES, DEG, DEG_RU, CIRCLE_MAJ, CIRCLE_MIN, CIRCLE_DIM, KEY_LIST, MOODS, FAMOUS, pcOf, noteName, parseChord, chordInfo, chordName, voicings, diatonicTriads, triadShapes, keyInfo, romanToChord, functionInKey, suggestions, generate, mod };
  root.GTSTheory = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof self !== 'undefined' ? self : globalThis);
