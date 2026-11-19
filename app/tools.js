/* Утилиты: окно аккорда, обучение, таблица аккордов, квинтовый круг, гаммы и трезвучия, генератор прогрессий */
(function (root) {
  'use strict';
  const T = root.GTSTheory, Au = root.GTSAudio;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const App = () => root.App;
  const STR_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];
  const TRIAD_COLORS = ['#e8604c', '#f08a3c', '#4fb06d', '#4a90d9', '#9aa0ab', '#a46be0', '#4e5bd6'];

  /* ---------- drawing ---------- */
  function diagramSvg(v, opts) {
    opts = opts || {};
    const W = opts.w || 70, H = opts.h || 82;
    if (!v) return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><text x="${W / 2}" y="${H / 2}" class="cd-t">—</text></svg>`;
    const fr = v.frets, fretted = fr.filter((f) => f > 0);
    const mx = fretted.length ? Math.max(...fretted) : 0;
    const base = mx <= 4 ? 1 : Math.min(...fretted);
    const x0 = W * 0.17, y0 = H * 0.2, sw = (W * 0.7) / 5, fh = (H * 0.72) / 4;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">`;
    for (let i = 0; i < 6; i++) s += `<line x1="${x0 + i * sw}" y1="${y0}" x2="${x0 + i * sw}" y2="${y0 + 4 * fh}" class="cd-l"/>`;
    for (let f = 0; f <= 4; f++) s += `<line x1="${x0}" y1="${y0 + f * fh}" x2="${x0 + 5 * sw}" y2="${y0 + f * fh}" class="cd-l ${f === 0 && base === 1 ? 'nut' : ''}"/>`;
    const r = Math.min(sw, fh) * 0.36;
    if (v.barre && v.barre.to - v.barre.from >= 1) {
      const y = y0 + (v.barre.fret - base + 0.5) * fh;
      s += `<rect x="${x0 + v.barre.from * sw - r}" y="${y - r}" width="${(v.barre.to - v.barre.from) * sw + 2 * r}" height="${2 * r}" rx="${r}" class="cd-d"/>`;
    }
    fr.forEach((f, i) => {
      const x = x0 + i * sw;
      if (f < 0) s += `<text x="${x}" y="${y0 - 4}" class="cd-t">×</text>`;
      else if (f === 0) s += `<circle cx="${x}" cy="${y0 - 7}" r="${r * 0.75}" class="cd-o"/>`;
      else s += `<circle cx="${x}" cy="${y0 + (f - base + 0.5) * fh}" r="${r}" class="cd-d"/>`;
    });
    if (base > 1) s += `<text x="${x0 - 4}" y="${y0 + fh * 0.68}" class="cd-t" style="text-anchor:end">${base}</text>`;
    return s + '</svg>';
  }
  function fretboardSvg(opts) {
    const frets = opts.frets || 15, tuning = opts.tuning || T.STD, S = tuning.length;
    const W = opts.width || 980, H = opts.height || 190;
    const left = 38, top = 16, right = 10, bottom = 26;
    const fw = (W - left - right) / (frets + 0.6), sg = (H - top - bottom) / (S - 1);
    const fx = (f) => left + fw * 0.6 + (f - 0.5) * fw; // center of fret f (f>=1); open string at left
    const xOf = (f) => (f === 0 ? left + fw * 0.25 : fx(f));
    const yOf = (s) => top + (S - 1 - s) * sg;
    let svg = `<svg viewBox="0 0 ${W} ${H}" class="fb" role="img" aria-label="${esc(opts.label || 'Гриф')}">`;
    svg += `<rect x="${left + fw * 0.6}" y="${top - 6}" width="${frets * fw}" height="${(S - 1) * sg + 12}" class="fb-wood" rx="3"/>`;
    [3, 5, 7, 9, 15, 17, 19, 21].filter((f) => f <= frets).forEach((f) => (svg += `<circle cx="${fx(f)}" cy="${top + (S - 1) * sg / 2}" r="5" class="fb-inlay"/>`));
    if (frets >= 12) [(S - 1) * 0.3, (S - 1) * 0.7].forEach((k) => (svg += `<circle cx="${fx(12)}" cy="${top + k * sg}" r="5" class="fb-inlay"/>`));
    for (let f = 0; f <= frets; f++) { const x = left + fw * 0.6 + f * fw; svg += `<line x1="${x}" x2="${x}" y1="${top - 6}" y2="${top + (S - 1) * sg + 6}" class="${f === 0 ? 'fb-nut' : 'fb-fret'}"/>`; }
    for (let s = 0; s < S; s++) svg += `<line x1="${left}" x2="${W - right}" y1="${yOf(s)}" y2="${yOf(s)}" class="fb-str" style="stroke-width:${0.8 + (S - 1 - s) * 0.28}"/><text x="${left - 22}" y="${yOf(s) + 4}" class="fb-sn">${T.noteName(tuning[s], opts.flat)}</text>`;
    for (let f = 1; f <= frets; f++) if ([1, 3, 5, 7, 9, 12, 15, 17, 19, 21].includes(f)) svg += `<text x="${fx(f)}" y="${H - 6}" class="fb-fn">${f}</text>`;
    (opts.links || []).forEach((l) => { svg += `<polyline points="${l.pts.map(([s, f]) => xOf(f) + ',' + yOf(s)).join(' ')}" class="fb-link" style="stroke:${l.color}"/>`; });
    (opts.marks || []).forEach((m) => {
      const x = xOf(m.f), y = yOf(m.s), r = Math.min(sg * 0.42, 11);
      svg += `<g class="fb-m ${m.cls || ''}" ${m.data ? `data-play="${m.data}"` : ''}><circle cx="${x}" cy="${y}" r="${r}" style="${m.color ? 'fill:' + m.color : ''}"/><text x="${x}" y="${y + 3.6}">${esc(m.label)}</text></g>`;
    });
    return svg + '</svg>';
  }
  function chordCard(name, opts) {
    opts = opts || {};
    const v = T.voicings(name)[0];
    return `<button class="ccard ${opts.cls || ''}" data-chord="${esc(name)}" title="${esc(name)}: ${opts.hint || 'нажмите, чтобы послушать'}">${opts.top ? `<span class="cc-top">${esc(opts.top)}</span>` : ''}<span class="cc-name">${esc(name)}</span>${diagramSvg(v, { w: opts.w || 64, h: opts.h || 74 })}</button>`;
  }
  const midisOf = (name, i) => { const v = T.voicings(name)[i || 0]; return v ? v.midis : []; };
  function play(name, mode, i) { try { Au.playChord(midisOf(name, i), { mode }); } catch (e) { App().toast('Звук недоступен: ' + e.message, 'err'); } }

  /* ---------- chord window ---------- */
  function openChord(name, ctx) {
    ctx = ctx || {};
    const stack = [];
    let cur = name, vi = 0, mode = 'strum';
    let key = ctx.key || guessKey(name);
    const render = () => {
      const info = T.chordInfo(cur);
      if (!info) { App().toast('Не удаётся разобрать аккорд «' + cur + '».', 'warn'); return; }
      const vs = T.voicings(cur);
      const fn = T.functionInKey(cur, key);
      const sg = T.suggestions(cur, key);
      const m = App().modal(`
        <div class="chm">
          <div class="chm-head">
            ${stack.length ? '<button class="btn sm ghost" data-back aria-label="Назад">←</button>' : ''}
            <div><h2>${esc(cur)}</h2><p class="muted">${esc(info.full)}</p></div>
            <div class="row"><div class="seg" role="radiogroup" aria-label="Способ игры"><button data-mode="strum" aria-selected="${mode === 'strum'}">Удар</button><button data-mode="arp" aria-selected="${mode === 'arp'}">Перебор</button></div>
            <button class="btn" data-playcur>▶ Слушать</button></div>
          </div>
          <div class="chm-facts"><span>Формула <b class="mono">${esc(info.formula)}</b></span><span>Ноты <b class="mono">${info.notes.map(esc).join(' ')}</b></span>
            <label class="row">В тональности <select data-key>${T.KEY_LIST.map((k) => `<option ${k === key ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
            <span>${fn && fn.roman ? `<b class="mono">${esc(fn.roman)}</b> — ${esc(fn.fn)}` : 'вне тональности'}</span></div>
          <h3>Варианты аппликатуры</h3>
          <div class="chm-voices">${vs.map((v, i) => `<button class="vcard ${i === vi ? 'on' : ''}" data-v="${i}" aria-label="Вариант ${i + 1}">${diagramSvg(v, { w: 84, h: 98 })}<small>${v.frets.includes(0) && Math.max(...v.frets) <= 4 ? 'открытая позиция' : (v.barre ? 'баррэ ' : 'позиция ') + v.minFret + ' лад'}</small><small class="mono">${v.frets.map((f) => (f < 0 ? 'x' : f)).join(' ')}</small></button>`).join('') || '<p class="muted">Удобной аппликатуры в стандартном строе не найдено.</p>'}</div>
          <h3>Куда пойти дальше <small class="muted">в ${esc(key)} · нажмите, чтобы услышать смену</small></h3>
          <div class="chips2">${sg.next.map((n) => `<span class="chip2"><button class="link-chip" data-change="${esc(n.name)}"><b>${esc(cur)} → ${esc(n.name)}</b><small class="mono">${esc(n.roman)}</small></button><button class="icon-btn" data-open="${esc(n.name)}" aria-label="Открыть ${esc(n.name)}">↗</button></span>`).join('')}</div>
          ${sg.subs.length ? `<h3>Замены</h3><div class="chips2">${sg.subs.map((n) => `<span class="chip2"><button class="link-chip" data-change="${esc(n.name)}"><b>${esc(n.name)}</b><small>${esc(n.why)}</small></button><button class="icon-btn" data-open="${esc(n.name)}" aria-label="Открыть ${esc(n.name)}">↗</button></span>`).join('')}</div>` : ''}
          <h3>Другие краски того же аккорда</h3>
          <div class="chips2">${sg.colors.map((n) => `<button class="link-chip" data-open="${esc(n)}"><b>${esc(n)}</b></button>`).join('')}</div>
          <div class="row end">${ctx.onApply && cur !== name ? `<button class="btn ghost" data-apply>Заменить «${esc(name)}» на «${esc(cur)}» в проекте</button>` : ''}<button class="btn" data-close>Готово</button></div>
        </div>`, { wide: true, label: 'Аккорд ' + cur });
      m.querySelector('[data-close]').onclick = () => { Au.stop(); App().closeModal(); };
      const b = m.querySelector('[data-back]'); if (b) b.onclick = () => { const p = stack.pop(); cur = p.cur; vi = p.vi; render(); };
      m.querySelector('[data-playcur]').onclick = () => playV();
      $$('[data-mode]', m).forEach((x) => (x.onclick = () => { mode = x.dataset.mode; render(); playV(); }));
      $$('[data-v]', m).forEach((x) => (x.onclick = () => { vi = +x.dataset.v; $$('[data-v]', m).forEach((y) => y.classList.toggle('on', y === x)); playV(); }));
      m.querySelector('[data-key]').onchange = (e) => { key = e.target.value; render(); };
      $$('[data-change]', m).forEach((x) => (x.onclick = () => {
        const a = midisOf(cur, vi), bm = midisOf(x.dataset.change);
        try { Au.stop(); const t1 = Au.playChord(a, { mode, keep: true, dur: 1.5 }); Au.playChord(bm, { mode, keep: true, at: t1, dur: 2 }); } catch (e) { /* no audio */ }
      }));
      $$('[data-open]', m).forEach((x) => (x.onclick = () => { stack.push({ cur, vi }); cur = x.dataset.open; vi = 0; render(); playV(); }));
      const ap = m.querySelector('[data-apply]'); if (ap) ap.onclick = () => { ctx.onApply(cur); App().closeModal(); };
    };
    const playV = () => { try { Au.playChord(midisOf(cur, vi), { mode }); } catch (e) { /* ignore */ } };
    render(); playV();
  }
  function guessKey(name) { const c = T.parseChord(name); if (!c) return 'C'; const n = T.noteName(c.root, c.rootName.includes('b')); return c.t.iv.includes(3) ? n + 'm' : n; }

  /* ---------- Tools screen ---------- */
  const TABS = [['tools', 'Обучение'], ['tools-chords', 'Все аккорды'], ['tools-circle', 'Квинтовый круг'], ['tools-scales', 'Гаммы и трезвучия'], ['tools-bass', 'Бас-гитара'], ['tools-gen', 'Генератор прогрессий']];
  const Tools = {
    st: { flat: false, types: 'chart', playMode: 'strum', circleKey: 'C', circleChord: null, scRoot: 9, scScale: 'minpent', scLabels: 'note', scTriad: -1, scSet: 3, scFrets: 15, gen: null, genOpts: { mood: 'sad', key: 'auto', length: 4, feel: null, bpm: null, sevenths: false }, famousKey: 'C', ear: { level: 1, score: 0, total: 0, streak: 0, cur: null } },
    render(main, route) {
      main.innerHTML = `<header class="page-head"><div><p class="eyebrow">Утилиты</p><h1>${TABS.find((t) => t[0] === route)[1]}</h1></div></header>
        <nav class="subtabs" aria-label="Разделы утилит">${TABS.map(([r, l]) => `<a href="#${r}" aria-current="${r === route ? 'page' : 'false'}">${l}</a>`).join('')}</nav>
        <div id="tool-body" class="tool-body"></div>`;
      const body = $('#tool-body');
      ({ tools: this.learn, 'tools-chords': this.chords, 'tools-circle': this.circle, 'tools-scales': this.scales, 'tools-gen': this.gen, 'tools-bass': (b) => root.GTSBass.render(b) })[route].call(this, body);
      body.addEventListener('click', (e) => {
        const c = e.target.closest('[data-chord]');
        if (c && body.contains(c) && !e.target.closest('[data-more]')) { play(c.dataset.chord, this.st.playMode); $$('.ccard.playing', body).forEach((x) => x.classList.remove('playing')); c.classList.add('playing'); }
        const mo = e.target.closest('[data-more]');
        if (mo) openChord(mo.dataset.more, { key: mo.dataset.key });
      });
    },

    /* ----- learning ----- */
    learn(el) {
      const famKey = this.st.famousKey;
      const kInfo = T.keyInfo(famKey);
      const minorKeys = ['Am', 'A#m', 'Bm', 'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m'];
      el.innerHTML = `
        <div class="lessons">
          <details class="lesson" open><summary><span class="ln">01</span>Тренировка слуха: мажор, минор и не только</summary><div class="lbody" id="ear"></div></details>
          <details class="lesson"><summary><span class="ln">02</span>Как читать табулатуру</summary><div class="lbody">
            <p>Шесть линий — шесть струн. Верхняя линия — тонкая первая струна (e), нижняя — толстая шестая (E). Цифра — номер лада, который нужно зажать; 0 — открытая струна. Цифры одна под другой играются одновременно, слева направо — по очереди.</p>
            <pre class="pre small">e|-----0-----0-----|
B|---1-----1-------|
G|-2---------2-----|
D|-----------------|
A|0----------------|   Am: 0 · 2 · 1 · 0 …
E|-----------------|</pre>
            <p class="muted">Обозначения: h — хаммер-он, p — пулл-офф, / — слайд, b — бенд, ~ — вибрато, PM — глушение ладонью.</p>
            <button class="btn sm" data-arp="45,57,60,64,60,64">▶ Сыграть пример</button></div></details>
          <details class="lesson"><summary><span class="ln">03</span>Как устроен аккорд: формулы</summary><div class="lbody">
            <p>Аккорд строится от основного тона (R) по интервалам. Мажор — большая терция (3) и чистая квинта (5), минор — малая терция (♭3). Септаккорды добавляют септиму (♭7 или 7), «краски» — сексту, нону, задержания.</p>
            <table class="tbl"><thead><tr><th>Символ</th><th>Название</th><th>Формула</th><th>Пример от C</th><th></th></tr></thead><tbody>
            ${T.TYPES.map((t) => `<tr><td class="mono">X${esc(t.id)}</td><td>${esc(t.ru)}</td><td class="mono">${t.iv.map((i) => T.DEG_RU[i]).join(' – ')}</td><td class="mono">C${esc(t.id)}: ${t.iv.map((i) => T.noteName(i)).join(' ')}</td><td><button class="btn sm ghost" data-chord="C${esc(t.id)}">▶</button></td></tr>`).join('')}</tbody></table></div></details>
          <details class="lesson"><summary><span class="ln">04</span>Квинтовый круг за пять минут</summary><div class="lbody">
            <p>По часовой стрелке каждая следующая тональность на квинту выше и получает на один диез больше; против часовой — на кварту, с бемолями. Соседи на круге — самые «родственные» тональности: аккорды I, IV и V любой мажорной тональности стоят рядом, а параллельный минор — во внутреннем кольце под ней.</p>
            <a class="btn sm" href="#tools-circle">Открыть квинтовый круг</a></div></details>
          <details class="lesson"><summary><span class="ln">05</span>Лады и их характер</summary><div class="lbody">
            <table class="tbl"><thead><tr><th>Лад</th><th>Формула</th><th>Характер</th><th></th></tr></thead><tbody>
            ${T.SCALES.filter((s) => s.id !== 'chromatic').map((s) => `<tr><td>${esc(s.ru)}</td><td class="mono">${s.iv.map((i) => T.DEG_RU[i]).join(' ')}</td><td class="muted">${esc(s.mood)}</td><td><button class="btn sm ghost" data-scale="${s.id}">▶ от C</button></td></tr>`).join('')}</tbody></table>
            <a class="btn sm" href="#tools-scales">Смотреть на грифе</a></div></details>
          <details class="lesson"><summary><span class="ln">06</span>Нэшвиллская система: 20 популярных прогрессий</summary><div class="lbody">
            <p>Аккорды обозначаются ступенями тональности: I, IV, V — мажорные, ii, iii, vi — минорные. Так одну прогрессию легко перенести в любую тональность.</p>
            <label class="row">Тональность <select id="fam-key">${['C', 'G', 'D', 'A', 'E', 'F', 'Bb'].map((k) => `<option ${k === famKey ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
            <table class="tbl"><thead><tr><th>#</th><th>Ступени</th><th>Аккорды в ${esc(famKey)}</th><th>Настроение</th><th></th></tr></thead><tbody>
            ${T.FAMOUS.map((f, i) => { const ch = f[1].map((r) => T.romanToChord(r, kInfo.tonicPc, kInfo.flat)); return `<tr><td>${i + 1}</td><td class="mono">${esc(f[0])}</td><td class="mono">${ch.map(esc).join(' – ')}</td><td class="muted">${esc(f[2])}</td><td><button class="btn sm ghost" data-prog="${esc(ch.join(','))}">▶</button></td></tr>`; }).join('')}</tbody></table></div></details>
          <details class="lesson"><summary><span class="ln">07</span>Тёмные и грустные последовательности: i–iv–v во всех минорных тональностях</summary><div class="lbody">
            <table class="tbl"><thead><tr><th>Тональность</th><th>i – iv – v</th><th></th></tr></thead><tbody>
            ${minorKeys.map((k) => { const pc = T.pcOf(k); const ch = ['i', 'iv', 'v'].map((r) => T.romanToChord(r, pc, false)); return `<tr><td>${esc(k.replace('m', ''))} минор</td><td class="mono">${ch.join(' – ')}</td><td><button class="btn sm ghost" data-prog="${ch.join(',')}">▶</button></td></tr>`; }).join('')}</tbody></table>
            <p class="muted small">Замените v на мажорную V (например, E вместо Em в ля миноре), и каденция зазвучит драматичнее: появится вводный тон.</p></div></details>
          <details class="lesson"><summary><span class="ln">08</span>Как работать в редакторе табулатур</summary><div class="lbody">
            <ul><li>Щёлкните по ноте — услышите этот момент записи. Цифрами введите лад, Shift+↑↓ перенесёт ноту на соседнюю струну с тем же звуком.</li><li>Клавиша N переходит к следующей сомнительной ноте, A подтверждает её.</li><li>Протяните мышью по аудиоволне, чтобы зациклить трудный участок, и уменьшите скорость.</li><li>В панели «Аккорды» нажмите на аккорд, чтобы увидеть аппликатуры, послушать его и подобрать замену.</li></ul></div></details>
        </div>`;
      this.ear($('#ear', el));
      $('#fam-key', el).onchange = (e) => { this.st.famousKey = e.target.value; this.learn(el); $$('.lesson', el)[5].open = true; };
      $$('[data-prog]', el).forEach((b) => (b.onclick = () => playProg(b.dataset.prog.split(','), 92, 'strum', 2)));
      $$('[data-arp]', el).forEach((b) => (b.onclick = () => { try { Au.stop(); b.dataset.arp.split(',').forEach((m, i) => Au.playChord([+m], { keep: true, at: Au.ensure().currentTime + 0.05 + i * 0.32, dur: 1.2 })); } catch (e) { /* no audio */ } }));
      $$('[data-scale]', el).forEach((b) => (b.onclick = () => playScale(0, b.dataset.scale)));
    },
    ear(el) {
      const e = this.st.ear;
      const LEVELS = [['Мажор / минор', ['', 'm']], ['+ уменьшённый и увеличенный', ['', 'm', 'dim', '+']], ['+ септаккорды', ['', 'm', '7', 'maj7', 'm7']], ['Всё вместе', ['', 'm', '7', 'maj7', 'm7', 'dim', '+', 'sus4', 'sus2', '6']]];
      const lv = LEVELS[e.level];
      const label = (t) => ({ '': 'мажор', m: 'минор', dim: 'уменьшённый', '+': 'увеличенный', '7': 'доминант. 7', maj7: 'maj7', m7: 'm7', sus4: 'sus4', sus2: 'sus2', '6': 'секстаккорд' })[t] || t;
      el.innerHTML = `<p>Приложение сыграет аккорд от случайной ноты. Определите на слух его тип.</p>
        <div class="row wrap"><label class="row">Уровень <select id="ear-lv">${LEVELS.map((l, i) => `<option value="${i}" ${i === e.level ? 'selected' : ''}>${l[0]}</option>`).join('')}</select></label>
        <button class="btn" id="ear-new">${e.cur ? 'Следующий аккорд' : 'Начать'}</button><button class="btn ghost" id="ear-rep" ${e.cur ? '' : 'disabled'}>Повторить</button><button class="btn ghost" id="ear-arp" ${e.cur ? '' : 'disabled'}>Перебором</button>
        <span class="ear-score mono">Верно: ${e.score} из ${e.total} · серия ${e.streak}</span></div>
        <div class="ear-ans">${lv[1].map((t) => `<button class="btn ghost" data-ans="${t}" ${e.cur && !e.cur.done ? '' : 'disabled'}>${label(t)}</button>`).join('')}</div>
        <p class="ear-fb" id="ear-fb" aria-live="polite">${e.cur && e.cur.done ? e.cur.fb : ''}</p>`;
      const playCur = (mode) => play(e.cur.name, mode || 'strum');
      $('#ear-lv', el).onchange = (x) => { e.level = +x.target.value; e.cur = null; this.ear(el); };
      $('#ear-new', el).onclick = () => {
        const t = lv[1][Math.floor(Math.random() * lv[1].length)];
        const r = T.SHARP[Math.floor(Math.random() * 12)];
        e.cur = { name: r + t, t, done: false }; this.ear(el); playCur();
      };
      $('#ear-rep', el).onclick = () => playCur();
      $('#ear-arp', el).onclick = () => playCur('arp');
      $$('[data-ans]', el).forEach((b) => (b.onclick = () => {
        const ok = b.dataset.ans === e.cur.t;
        e.total++; if (ok) { e.score++; e.streak++; } else e.streak = 0;
        e.cur.done = true;
        e.cur.fb = (ok ? '✓ Верно: ' : '✗ Это был ') + e.cur.name + ' — ' + T.chordInfo(e.cur.name).t.ru + '.';
        this.ear(el);
        $('#ear-fb', el).className = 'ear-fb ' + (ok ? 'ok' : 'bad');
      }));
    },

    /* ----- all chords ----- */
    chords(el) {
      const st = this.st;
      const types = st.types === 'chart' ? T.CHART_TYPES : T.TYPES.map((t) => t.id);
      const names = st.flat ? ['A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab'] : ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
      el.innerHTML = `<div class="row wrap tool-ctl">
          <div class="seg" role="radiogroup" aria-label="Названия"><button data-flat="0" aria-selected="${!st.flat}">Диезы ♯</button><button data-flat="1" aria-selected="${st.flat}">Бемоли ♭</button></div>
          <div class="seg" role="radiogroup" aria-label="Набор"><button data-types="chart" aria-selected="${st.types === 'chart'}">Основные 11 типов</button><button data-types="all" aria-selected="${st.types === 'all'}">Все ${T.TYPES.length} типов</button></div>
          <div class="seg" role="radiogroup" aria-label="Звук"><button data-pm="strum" aria-selected="${st.playMode === 'strum'}">Удар</button><button data-pm="arp" aria-selected="${st.playMode === 'arp'}">Перебор</button></div>
          <span class="muted small">Нажмите на аккорд, чтобы услышать. ↗ — все варианты и смены.</span></div>
        <div class="chart-wrap"><table class="chart"><thead><tr><th></th>${types.map((t) => `<th>X${esc(t)}</th>`).join('')}</tr></thead><tbody>
        ${names.map((r) => `<tr><th>${r}</th>${types.map((t) => `<td><div class="cwrap">${chordCard(r + t, { w: 58, h: 66 })}<button class="more" data-more="${esc(r + t)}" aria-label="Варианты ${esc(r + t)}">↗</button></div></td>`).join('')}</tr>`).join('')}
        </tbody></table></div>`;
      $$('[data-flat]', el).forEach((b) => (b.onclick = () => { st.flat = b.dataset.flat === '1'; this.chords(el); }));
      $$('[data-types]', el).forEach((b) => (b.onclick = () => { st.types = b.dataset.types; this.chords(el); }));
      $$('[data-pm]', el).forEach((b) => (b.onclick = () => { st.playMode = b.dataset.pm; this.chords(el); }));
    },

    /* ----- circle of fifths ----- */
    circle(el) {
      const st = this.st;
      const k = T.keyInfo(st.circleKey);
      const S = 560, c = S / 2;
      const rings = [[c - 6, c - 78, T.CIRCLE_MAJ, 'maj'], [c - 80, c - 142, T.CIRCLE_MIN, 'min'], [c - 144, c - 194, T.CIRCLE_DIM, 'dim']];
      const dia = new Set(k.triads.map((t) => t.name.replace('dim', '°')));
      const norm = (n) => T.noteName(T.pcOf(n)) + (n.endsWith('m') ? 'm' : n.endsWith('°') ? '°' : '');
      const diaN = new Set(Array.from(dia).map(norm));
      let svg = `<svg viewBox="0 0 ${S} ${S}" class="cof" role="img" aria-label="Квинтовый круг">`;
      rings.forEach(([ro, ri, list, kind]) => list.forEach((name, i) => {
        const a0 = (i - 0.5) * Math.PI / 6 - Math.PI / 2, a1 = (i + 0.5) * Math.PI / 6 - Math.PI / 2;
        const p = (r, a) => `${(c + r * Math.cos(a)).toFixed(1)},${(c + r * Math.sin(a)).toFixed(1)}`;
        const isKey = (kind === 'maj' && !k.minor && i === k.idx) || (kind === 'min' && k.minor && i === k.idx);
        const inKey = diaN.has(norm(name));
        const chordName = kind === 'dim' ? name.replace('°', 'dim') : name;
        const sel = st.circleChord === chordName;
        svg += `<g class="seg-${kind} ${inKey ? 'in' : ''} ${isKey ? 'tonic' : ''} ${sel ? 'sel' : ''}" data-cof="${esc(chordName)}" data-kind="${kind}" tabindex="0" role="button" aria-label="${esc(name)}">
          <path d="M${p(ro, a0)} A${ro},${ro} 0 0 1 ${p(ro, a1)} L${p(ri, a1)} A${ri},${ri} 0 0 0 ${p(ri, a0)} Z"/>
          <text x="${(c + (ro + ri) / 2 * Math.cos((a0 + a1) / 2)).toFixed(1)}" y="${(c + (ro + ri) / 2 * Math.sin((a0 + a1) / 2) + 5).toFixed(1)}">${esc(kind === 'maj' && name === 'F#' ? 'F#/Gb' : name)}</text></g>`;
        if (kind === 'maj') { const sg = T.keyInfo(name).sig; svg += `<text class="cof-sig" x="${(c + (ro + 14) * Math.cos((a0 + a1) / 2)).toFixed(1)}" y="${(c + (ro + 14) * Math.sin((a0 + a1) / 2) + 4).toFixed(1)}">${sg === 0 ? '' : sg > 0 ? sg + '♯' : -sg + '♭'}</text>`; }
      }));
      svg += `<circle cx="${c}" cy="${c}" r="${c - 196}" class="cof-core"/><text x="${c}" y="${c - 6}" class="cof-k">${esc(k.key)}</text><text x="${c}" y="${c + 16}" class="cof-ks">${esc(k.minor ? 'минор' : 'мажор')}</text></svg>`;
      const chordBlock = st.circleChord ? (() => {
        const info = T.chordInfo(st.circleChord);
        const v = T.voicings(st.circleChord)[0];
        const f = T.functionInKey(st.circleChord, k.key);
        return `<div class="cof-chord"><div>${diagramSvg(v, { w: 90, h: 104 })}</div><div class="stack"><h3>${esc(st.circleChord)} <small class="muted">${esc(info.full)}</small></h3>
          <p class="small">Формула <b class="mono">${esc(info.formula)}</b> · ноты <b class="mono">${info.notes.map(esc).join(' ')}</b>${f && f.roman ? ` · в ${esc(k.key)}: <b class="mono">${esc(f.roman)}</b> — ${esc(f.fn)}` : ''}</p>
          <div class="row"><button class="btn sm" data-chord="${esc(st.circleChord)}">▶ Слушать</button><button class="btn sm ghost" data-more="${esc(st.circleChord)}" data-key="${esc(k.key)}">Варианты и смены</button></div></div></div>`;
      })() : '';
      const progs = k.minor ? [['i–iv–v–i', ['i', 'iv', 'v', 'i']], ['i–♭VI–♭III–♭VII', ['i', 'bVI', 'bIII', 'bVII']], ['i–iv–V–i', ['i', 'iv', 'V', 'i']], ['i–♭VII–♭VI–V', ['i', 'bVII', 'bVI', 'V']]] : [['I–IV–V–I', ['I', 'IV', 'V', 'I']], ['I–V–vi–IV', ['I', 'V', 'vi', 'IV']], ['ii–V–I', ['ii7', 'V7', 'Imaj7']], ['vi–IV–I–V', ['vi', 'IV', 'I', 'V']]];
      el.innerHTML = `<div class="cof-wrap"><div class="cof-box">${svg}<p class="muted small">Внешнее кольцо — мажорные тональности, среднее — параллельные миноры, внутреннее — уменьшённые аккорды VII ступени. Подсвечены аккорды выбранной тональности.</p></div>
        <section class="cof-panel">
          ${chordBlock}
          <div class="card"><h2>${esc(k.key)} — ${k.minor ? 'минор' : 'мажор'}</h2>
            <dl class="kv"><dt>Ключевые знаки</dt><dd>${esc(k.sigText)}</dd><dt>Звукоряд</dt><dd class="mono">${k.notes.map(esc).join(' ')}</dd>
            <dt>Параллельная</dt><dd><button class="link" data-gokey="${esc(k.relative)}">${esc(k.relative)}</button></dd><dt>Доминанта</dt><dd><button class="link" data-gokey="${esc(k.dominant)}">${esc(k.dominant)}</button></dd><dt>Субдоминанта</dt><dd><button class="link" data-gokey="${esc(k.subdominant)}">${esc(k.subdominant)}</button></dd></dl>
            <h3>Аккорды тональности</h3>
            <div class="cards-row">${k.triads.map((t) => chordCard(t.name, { top: t.roman, w: 58, h: 66 })).join('')}</div>
            <h3>Типичные последовательности</h3>
            <div class="row wrap">${progs.map(([l, p]) => { const ch = p.map((r) => T.romanToChord(r, k.tonicPc, k.flat)); return `<button class="btn sm ghost" data-prog="${ch.join(',')}" title="${ch.join(' – ')}">▶ ${esc(l)} <small class="mono">${ch.join(' ')}</small></button>`; }).join('')}</div>
            <div class="row"><button class="btn sm ghost" data-scl>▶ Гамма ${esc(k.key)}</button><a class="btn sm ghost" href="#tools-scales" data-toscales>Гамма на грифе</a></div>
          </div></section></div>`;
      $$('[data-cof]', el).forEach((g) => {
        const act = () => {
          const name = g.dataset.cof, kind = g.dataset.kind;
          st.circleChord = name;
          if (kind !== 'dim') st.circleKey = name;
          this.circle(el); play(name, 'strum');
        };
        g.addEventListener('click', act);
        g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
      });
      $$('[data-gokey]', el).forEach((b) => (b.onclick = () => { st.circleKey = b.dataset.gokey; st.circleChord = b.dataset.gokey; this.circle(el); }));
      $$('[data-prog]', el).forEach((b) => (b.onclick = () => playProg(b.dataset.prog.split(','), 96, 'strum', 4)));
      $('[data-scl]', el).onclick = () => playScale(k.tonicPc, k.minor ? 'aeolian' : 'major');
      $('[data-toscales]', el).onclick = () => { st.scRoot = k.tonicPc; st.scScale = k.minor ? 'aeolian' : 'major'; st.scTriad = -1; };
    },

    /* ----- scales & triads ----- */
    scales(el) {
      const st = this.st;
      st.scView = st.scView || 'all'; st.scPos = st.scPos || 1; st.scFit = st.scFit ?? '7';
      const sc = T.SCALES.find((s) => s.id === st.scScale) || T.SCALES[0];
      const flat = [1, 3, 5, 8, 10].includes(st.scRoot);
      const pcs = sc.iv.map((i) => T.mod(st.scRoot + i));
      const triads = T.diatonicTriads(st.scRoot, sc.id, flat);
      const tri = st.scTriad >= 0 ? triads[st.scTriad] : null;
      if (st.scView === '3nps' && sc.iv.length < 7) st.scView = 'box';
      const positions = st.scView === 'all' ? [] : T.scalePositions(st.scRoot, sc.id, st.scView);
      if (st.scPos > positions.length) st.scPos = 1;
      const pos = positions[st.scPos - 1];
      const inPos = pos ? new Set(pos.notes.map((n) => n.s + ':' + n.f)) : null;
      const marks = [], links = [];
      for (let s = 0; s < 6; s++) for (let f = 0; f <= st.scFrets; f++) {
        const pc = T.mod(T.STD[s] + f);
        const idx = pcs.indexOf(pc);
        if (idx < 0) continue;
        const iv = sc.iv[idx];
        const out = inPos && !inPos.has(s + ':' + f);
        const inTri = tri ? tri.pcs.indexOf(pc) : -1;
        if (out || (tri && inTri < 0)) { marks.push({ s, f, label: '', cls: 'dim-m' }); continue; }
        const label = st.scLabels === 'note' ? T.noteName(pc, flat) : T.DEG_RU[iv];
        marks.push({ s, f, label, cls: iv === 0 ? 'root' : '', color: tri ? TRIAD_COLORS[st.scTriad] : null, data: (T.STD[s] + f) });
      }
      const fits = T.scaleChords(st.scRoot, sc.id, flat);
      const forChord = T.scalesForChord(st.scFit);
      const groups = Object.keys(T.G).map((g) => [g, T.SCALES.filter((x) => x.g === g)]).filter(([, l]) => l.length);
      const sets = [[3, 4, 5, 'G – B – e'], [2, 3, 4, 'D – G – B'], [1, 2, 3, 'A – D – G'], [0, 1, 2, 'E – A – D']];
      const set = sets.find((x) => x[0] === st.scSet) || sets[0];
      const rootN = T.noteName(st.scRoot, flat);
      el.innerHTML = `<div class="row wrap tool-ctl">
          <label>Тоника<select id="sc-root">${T.SHARP.map((n, i) => `<option value="${i}" ${i === st.scRoot ? 'selected' : ''}>${[1, 3, 6, 8, 10].includes(i) ? n + '/' + T.FLAT[i] : n}</option>`).join('')}</select></label>
          <label class="wide">Гамма или лад <small class="muted">${T.SCALES.length} вариантов</small><select id="sc-scale">${groups.map(([g, l]) => `<optgroup label="${esc(T.G[g])}">${l.map((x) => `<option value="${x.id}" ${x.id === sc.id ? 'selected' : ''}>${esc(x.ru)}</option>`).join('')}</optgroup>`).join('')}</select></label>
          <label>Подписи<select id="sc-lab"><option value="note" ${st.scLabels === 'note' ? 'selected' : ''}>Названия нот</option><option value="deg" ${st.scLabels === 'deg' ? 'selected' : ''}>Ступени (R, 2, ♭3…)</option></select></label>
          <label>Ладов<select id="sc-fr">${[12, 15, 22].map((n) => `<option ${n === st.scFrets ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <button class="btn" id="sc-play">▶ ${pos ? 'Сыграть позицию' : 'Сыграть гамму'}</button></div>
        <div class="sc-head"><h2>${esc(rootN)} · ${esc(sc.ru)}</h2><div class="degs">${sc.iv.map((i) => `<span class="${i === 0 ? 'r' : ''}">${T.DEG_RU[i]}</span>`).join('')}</div><span class="muted small">${esc(sc.mood)} · ${esc(T.G[sc.g])}</span></div>
        <div class="row wrap"><div class="seg" role="radiogroup" aria-label="Показ"><button data-view="all" aria-selected="${st.scView === 'all'}">Весь гриф</button><button data-view="box" aria-selected="${st.scView === 'box'}">Позиции (боксы)</button><button data-view="3nps" aria-selected="${st.scView === '3nps'}" ${sc.iv.length < 7 ? 'disabled title="Только для гамм из 7 и более нот"' : ''}>3 ноты на струну</button></div>
          ${positions.length ? `<div class="pos-chips">${positions.map((p) => `<button class="tchip ${p.n === st.scPos ? 'on' : ''}" data-pos="${p.n}">${p.n} <small class="muted">лады ${p.from}–${p.to}</small></button>`).join('')}</div>` : ''}</div>
        <div class="fb-wrap">${fretboardSvg({ frets: Math.max(st.scFrets, pos ? Math.min(22, pos.to + 1) : 0), marks, links, flat, label: 'Гамма на грифе' })}</div>
        <div class="fit"><span class="muted small">Играется над аккордами:</span>${fits.map((n) => `<button class="link-chip" data-chord="${esc(n)}"><b>${esc(n)}</b></button>`).join('') || '<span class="muted small">нет стандартных аккордов от тоники</span>'}</div>
        <div class="tri-bar"><span class="muted small">Трезвучия${sc.parent ? ' родительского лада (' + esc(T.SCALES.find((x) => x.id === sc.parent).ru) + ')' : ''}:</span>
          ${triads.length ? `<button class="tchip ${st.scTriad < 0 ? 'on' : ''}" data-tri="-1">Вся гамма</button>` + triads.map((t, i) => `<button class="tchip ${i === st.scTriad ? 'on' : ''}" data-tri="${i}" style="--c:${TRIAD_COLORS[i]}"><b>${esc(t.roman)}</b> ${esc(t.name)}</button>`).join('') : '<span class="muted small">у симметричных и 8-нотных гамм трезвучия по терциям не строятся</span>'}</div>
        ${triads.length ? `<section class="block"><div class="block-head"><h2>Трезвучия гаммы на трёх струнах</h2>
          <div class="seg" role="radiogroup" aria-label="Набор струн">${sets.map((x) => `<button data-set="${x[0]}" aria-selected="${x[0] === set[0]}">${x[3]}</button>`).join('')}</div></div>
          <p class="muted small">Тесное расположение: основной вид и обращения по всему грифу. Нажмите на точку, чтобы услышать ноту, на название — трезвучие.</p>
          <div class="tri-rows">${triads.map((t, i) => {
            const shapes = T.triadShapes(t.pcs, set.slice(0, 3), T.STD, 15);
            const mk = []; const lk = [];
            shapes.forEach((sh) => { sh.frets.forEach((f, j) => mk.push({ s: sh.strings[j], f, label: T.noteName(T.mod(T.STD[sh.strings[j]] + f), flat), color: TRIAD_COLORS[i], data: T.STD[sh.strings[j]] + f })); lk.push({ pts: sh.frets.map((f, j) => [sh.strings[j], f]), color: TRIAD_COLORS[i] }); });
            return `<div class="tri-row"><button class="tri-name" data-trip="${i}" style="color:${TRIAD_COLORS[i]}"><b>${esc(t.q === null ? t.name.split(' ')[0] : t.name)}</b><small class="mono">${esc(t.roman)}</small></button>${fretboardSvg({ frets: 15, marks: mk, links: lk, flat, height: 150, label: 'Трезвучие ' + t.name })}</div>`;
          }).join('')}</div></section>` : ''}
        <section class="block card"><h2>Какие гаммы подходят к аккорду</h2>
          <label class="row">Аккорд от ${esc(rootN)}<select id="sc-fit">${T.TYPES.map((t) => `<option value="${esc(t.id)}" ${t.id === st.scFit ? 'selected' : ''}>${esc(rootN + t.id)} — ${esc(t.ru)}</option>`).join('')}</select></label>
          <div class="fit">${forChord.map((x) => `<button class="link-chip ${x.id === sc.id ? 'on' : ''}" data-pick="${x.id}"><b>${esc(rootN)} ${esc(x.ru)}</b><small>${esc(T.G[x.g])}</small></button>`).join('')}</div></section>`;
      $('#sc-root', el).onchange = (e) => { st.scRoot = +e.target.value; this.scales(el); };
      $('#sc-scale', el).onchange = (e) => { st.scScale = e.target.value; st.scTriad = -1; st.scPos = 1; this.scales(el); };
      $('#sc-lab', el).onchange = (e) => { st.scLabels = e.target.value; this.scales(el); };
      $('#sc-fr', el).onchange = (e) => { st.scFrets = +e.target.value; this.scales(el); };
      $('#sc-fit', el).onchange = (e) => { st.scFit = e.target.value; this.scales(el); };
      $('#sc-play', el).onclick = () => { if (pos) playMidis(pos.notes.map((n) => T.STD[n.s] + n.f).sort((a, b) => a - b)); else playScale(st.scRoot, sc.id); };
      $$('[data-view]', el).forEach((b) => (b.onclick = () => { st.scView = b.dataset.view; st.scPos = 1; this.scales(el); }));
      $$('[data-pos]', el).forEach((b) => (b.onclick = () => { st.scPos = +b.dataset.pos; this.scales(el); }));
      $$('[data-pick]', el).forEach((b) => (b.onclick = () => { st.scScale = b.dataset.pick; st.scTriad = -1; st.scPos = 1; this.scales(el); }));
      $$('[data-tri]', el).forEach((b) => (b.onclick = () => { st.scTriad = +b.dataset.tri; this.scales(el); if (st.scTriad >= 0) Au.playChord(triads[st.scTriad].midis, { mode: 'arp' }); }));
      $$('[data-trip]', el).forEach((b) => (b.onclick = () => { try { Au.playChord(triads[+b.dataset.trip].midis, { mode: 'arp' }); } catch (e) { /* ignore */ } }));
      $$('[data-set]', el).forEach((b) => (b.onclick = () => { st.scSet = +b.dataset.set; this.scales(el); }));
      $$('[data-play]', el).forEach((g) => g.addEventListener('click', () => { try { Au.playChord([+g.dataset.play], { dur: 1.2 }); } catch (e) { /* ignore */ } }));
    },

    /* ----- progression generator ----- */
    gen(el) {
      const st = this.st, o = st.genOpts;
      if (!st.gen) st.gen = T.generate(Object.assign({}, o, { seed: Date.now() }));
      const g = st.gen;
      const mood = g.mood;
      el.innerHTML = `
        <div class="moods" role="radiogroup" aria-label="Настроение">${T.MOODS.map((m) => `<button class="mood ${m.id === o.mood ? 'on' : ''}" data-mood="${m.id}" aria-pressed="${m.id === o.mood}">${esc(m.ru)}</button>`).join('')}</div>
        <div class="row wrap tool-ctl">
          <label>Тональность<select id="g-key"><option value="auto">Подобрать</option>${T.KEY_LIST.map((k) => `<option ${k === o.key ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
          <label>Длина<select id="g-len">${[[4, '4 такта'], [8, '8 тактов']].map(([v, l]) => `<option value="${v}" ${v === o.length ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Игра<select id="g-feel">${[['', 'По настроению'], ['strum', 'Бой'], ['arp', 'Перебор'], ['pad', 'Долгие аккорды']].map(([v, l]) => `<option value="${v}" ${(o.feel || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Темп <output id="g-bpm-o">${g.bpm}</output><input id="g-bpm" type="range" min="50" max="160" value="${g.bpm}"></label>
          <label class="check"><input type="checkbox" id="g-7" ${o.sevenths ? 'checked' : ''}> Септаккорды</label>
          <button class="btn lg" id="g-go">Сгенерировать</button></div>
        <section class="gen-out card">
          <div class="block-head"><div><h2>${esc(mood.ru)} · ${esc(g.key)} · ${g.bpm} BPM</h2><p class="muted small">${esc(mood.why)}</p></div>
            <div class="row wrap"><button class="btn" id="g-play">▶ Играть</button><label class="check"><input type="checkbox" id="g-loop" checked> По кругу</label>
            <button class="btn sm ghost" data-tr="-1" aria-label="Транспонировать вниз">♭ −1</button><button class="btn sm ghost" data-tr="1" aria-label="Транспонировать вверх">♯ +1</button></div></div>
          <div class="prog">${g.chords.map((c, i) => `<div class="pslot" data-i="${i}"><span class="pbar mono">${i + 1}</span>${chordCard(c.name, { top: c.roman, w: 70, h: 80, cls: 'big' })}<button class="more" data-edit="${i}" aria-label="Варианты ${esc(c.name)}">↗</button></div>`).join('')}</div>
          <p class="mono prog-text">${g.chords.map((c) => esc(c.name)).join(' – ')}</p>
          <div class="row wrap"><button class="btn" id="g-proj">Создать проект с табулатурой</button><button class="btn ghost" id="g-copy">Копировать аккорды</button></div>
        </section>`;
      const regen = () => { st.gen = T.generate(Object.assign({}, o, { seed: Date.now() + Math.floor(Math.random() * 1e6) })); this.gen(el); };
      $$('[data-mood]', el).forEach((b) => (b.onclick = () => { o.mood = b.dataset.mood; o.bpm = null; regen(); }));
      $('#g-key', el).onchange = (e) => { o.key = e.target.value; };
      $('#g-len', el).onchange = (e) => { o.length = +e.target.value; };
      $('#g-feel', el).onchange = (e) => { o.feel = e.target.value || null; g.feel = o.feel || mood.feel; };
      $('#g-7', el).onchange = (e) => { o.sevenths = e.target.checked; };
      $('#g-bpm', el).oninput = (e) => { g.bpm = +e.target.value; o.bpm = g.bpm; $('#g-bpm-o', el).textContent = g.bpm; };
      $('#g-go', el).onclick = () => { stopLoop(); regen(); playGen(el, g, true); };
      $('#g-play', el).onclick = () => { if (this._loop) { stopLoop(); $('#g-play', el).textContent = '▶ Играть'; } else playGen(el, st.gen, false); };
      $$('[data-edit]', el).forEach((b) => (b.onclick = () => { const i = +b.dataset.edit; openChord(g.chords[i].name, { key: g.key, onApply: (nm) => { g.chords[i] = { roman: T.functionInKey(nm, g.key)?.roman || '·', name: nm }; this.gen(el); } }); }));
      $$('[data-tr]', el).forEach((b) => (b.onclick = () => {
        const d = +b.dataset.tr;
        const tp = (n) => { const c = T.parseChord(n); return T.noteName(c.root + d, d < 0) + c.type; };
        g.chords = g.chords.map((c) => ({ roman: c.roman, name: tp(c.name) }));
        const ki = T.keyInfo(g.key); g.key = T.noteName(ki.tonicPc + d, d < 0) + (ki.minor ? 'm' : '');
        this.gen(el);
      }));
      $('#g-copy', el).onclick = async () => { const t = g.chords.map((c) => c.name).join(' – '); try { await navigator.clipboard.writeText(t); App().toast('Скопировано: ' + t); } catch (e) { App().toast(t); } };
      $('#g-proj', el).onclick = () => { stopLoop(); App().projectFromProgression(g); };
    }
  };

  /* ---------- playback helpers ---------- */
  let loopT = null;
  function stopLoop() { clearTimeout(loopT); loopT = null; Tools._loop = false; try { Au.stop(); } catch (e) { /* ignore */ } $$('.pslot.now').forEach((x) => x.classList.remove('now')); }
  function playGen(el, g, auto) {
    stopLoop();
    const loopOn = () => { const c = $('#g-loop', el); return c && c.checked; };
    const run = () => {
      let sched;
      try { sched = Au.playSequence(g.chords.map((c) => ({ midis: midisOf(c.name), beats: 4 })), { bpm: g.bpm, feel: g.feel }); } catch (e) { App().toast('Звук недоступен.', 'err'); return; }
      Tools._loop = true;
      const btn = $('#g-play', el); if (btn) btn.textContent = '■ Стоп';
      const ctx = Au.ctx;
      const tick = () => {
        if (!Tools._loop) return;
        const now = ctx.currentTime;
        const idx = sched.findIndex((s) => now >= s.at && now < s.at + s.dur);
        $$('.pslot', el).forEach((x, i) => x.classList.toggle('now', i === idx));
        const end = sched[sched.length - 1].at + sched[sched.length - 1].dur;
        if (now >= end - 0.05) { if (loopOn() && document.body.contains(el)) return run(); stopLoop(); const b2 = $('#g-play', el); if (b2) b2.textContent = '▶ Играть'; return; }
        loopT = setTimeout(tick, 40);
      };
      tick();
    };
    run();
    void auto;
  }
  function playProg(names, bpm, feel, beats) { try { Au.playSequence(names.map((n) => ({ midis: midisOf(n), beats: beats || 4 })), { bpm, feel }); } catch (e) { /* no audio */ } }
  function playMidis(seq) { try { Au.stop(); const t0 = Au.ensure().currentTime + 0.05; seq.forEach((m, i) => Au.playChord([m], { keep: true, at: t0 + i * 0.2, dur: 0.45 })); } catch (e) { /* ignore */ } }
  function playScale(rootPc, scaleId) {
    const sc = T.SCALES.find((s) => s.id === scaleId);
    let base = 40 + T.mod(rootPc - 4); // from low E string
    const up = sc.iv.map((i) => base + i).concat([base + 12]);
    const seq = up.concat(up.slice(0, -1).reverse());
    try { Au.stop(); const t0 = Au.ensure().currentTime + 0.05; seq.forEach((m, i) => Au.playChord([m], { keep: true, at: t0 + i * 0.22, dur: 0.5 })); } catch (e) { /* ignore */ }
  }

  Tools.openChord = openChord; Tools.fretboardSvg = fretboardSvg; Tools.diagramSvg = diagramSvg; Tools.chordCard = chordCard; Tools.play = play; Tools.stopLoop = stopLoop; Tools.TABS = TABS;
  root.GTSTools = Tools;
})(typeof self !== 'undefined' ? self : globalThis);
