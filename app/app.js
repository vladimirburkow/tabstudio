/* AI Guitar Tab Studio — приложение: маршрутизация, экраны, обработка, библиотека, экспорт, настройки, тарифы */
(function (root) {
  'use strict';
  const E = root.GTSEngine, X = root.GTSExport, Store = root.GTSStore, Au = root.GTSAudio, Ed = root.GTSEditor, PF = root.GTSPlatform || { native: false, isMobileEdition: false, Ads: { maybeInterstitial: async () => false }, init: async () => {}, saveFile: async () => null };
  const { fmt, plural, esc, icon } = Ed;
  const Acc = root.GTSAccount || { configured: false, on() {}, status: 'signed-out' };
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const PLANS = {
    free: { name: 'Бесплатно', price: '€0', per: '', monthly: Infinity, maxMin: 15, library: 100000, formats: ['pdf', 'txt', 'json', 'gp', 'midi', 'musicxml', 'tex', 'zip'], mix: true, bassInMix: true,
      perks: ['Без ограничений на обработки', 'Записи до 15 минут', 'Все форматы экспорта', 'Реклама помогает приложению оставаться бесплатным'] },
    starter: { name: 'Starter', price: '€0', per: '', monthly: 10, maxMin: 6, library: 25, formats: ['pdf', 'txt', 'json'], mix: true, bassInMix: false,
      perks: ['10 AI-обработок в месяц', 'Записи до 6 минут', 'Базовые табулатуры', 'Библиотека до 25 проектов', 'Экспорт PDF, TXT и JSON'] },
    pro: { name: 'Pro', price: '€12.99', per: '/ месяц', monthly: 150, maxMin: 15, library: 1000, formats: ['pdf', 'txt', 'json', 'gp', 'midi', 'musicxml', 'tex', 'zip'], mix: true, bassInMix: true,
      perks: ['150 AI-обработок в месяц', 'Записи до 15 минут', 'Полный редактор табулатур', 'Экспорт Guitar Pro, MIDI, MusicXML', 'Облачная библиотека'] },
    studio: { name: 'Studio', price: '€29.99', per: '/ месяц', monthly: 600, maxMin: 30, library: 10000, formats: ['pdf', 'txt', 'json', 'gp', 'midi', 'musicxml', 'tex', 'zip'], mix: true, bassInMix: true,
      perks: ['600 AI-обработок в месяц', 'Записи до 30 минут', 'Мультитрековый анализ: гитара + бас', 'Большое облачное хранилище', 'Приоритетная очередь обработки'] }
  };
  const FORMATS = [
    { k: 'gp', name: 'Guitar Pro 7', ext: 'gp', desc: 'Табы, строй, техники, аккорды. Открывается в Guitar Pro 7/8, TuxGuitar, MuseScore 4.', zip: true },
    { k: 'pdf', name: 'PDF', ext: 'pdf', desc: 'Табулатура для печати: аккорды, длительности, текст песни.' },
    { k: 'midi', name: 'MIDI', ext: 'mid', desc: 'Ноты всех дорожек, темп и названия аккордов для DAW.', zip: true },
    { k: 'musicxml', name: 'MusicXML 4.0', ext: 'musicxml', desc: 'TAB-нотация со струнами и ладами для нотных редакторов.', zip: true },
    { k: 'txt', name: 'Текстовые табы', ext: 'txt', desc: 'ASCII-табулатура для форумов и заметок.', text: true },
    { k: 'tex', name: 'alphaTex', ext: 'txt', desc: 'Текстовый формат alphaTab для сайтов и вики.', text: true },
    { k: 'json', name: 'Проект GTS (JSON)', ext: 'json', desc: 'Внутренний формат: струны, лады, уверенность, версии модели.', text: true },
    { k: 'zip', name: 'Всё одним архивом', ext: 'zip', desc: 'GP, MIDI, MusicXML, PDF, TXT и JSON в одном .zip.' }
  ];

  const App = {
    st: { route: 'home', pid: null, project: null, mono: null, dirty: false, saving: false, saveMsg: '', job: null, audioCache: {} },
    worker: null, workerOk: true, downloads: null,

    /* ---------- boot ---------- */
    async init() {
      await PF.init();
      this.bindChrome();
      window.addEventListener('hashchange', () => this.route());
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.closeModal();
      });
      $('#app-main').innerHTML = '<div class="boot"><div class="spinner"></div><p>Загрузка библиотеки…</p></div>';
      await Store.init();
      Store.onChange(() => { if (['home', 'library'].includes(this.st.route)) this.render(); this.renderChrome(); });
      Store.onRemoteProject((id) => {
        if (this.st.route === 'editor' && this.st.pid === id && !this.st.dirty) { this.st.project = null; this.openEditor(id); this.toast('Проект обновлён с другого устройства.'); }
      });
      Acc.on(() => { this.renderChrome(); if (this.st.route === 'account') this.render(); });
      if (root.claude && root.claude.use) root.claude.use('downloads').then((d) => (this.downloads = d)).catch(() => {});
      this.makeWorker();
      this.route();
      if (!Store.list().length && !(Acc.user)) this.seedDemo();
      if (!Store.meta().onboarded) setTimeout(() => this.onboarding(), 400);
      window.addEventListener('beforeunload', (e) => { if (this.st.dirty) { this.saveNow(); e.preventDefault(); e.returnValue = ''; } });
    },
    makeWorker() {
      try {
        this.worker = new Worker('engine.js');
        this.worker.onerror = () => { this.workerOk = false; };
      } catch (e) { this.worker = null; this.workerOk = false; }
    },
    settings() {
      return Object.assign({ tuning: 'Standard E', bassTuning: 'Standard E', capo: 0, maxFret: 22, weights: Object.assign({}, E.DEFAULT_WEIGHTS), lowConf: 0.5, consent: false, includeBass: true }, Store.meta().settings || {});
    },
    plan() { return PF.isFree ? PLANS.free : PLANS[Store.meta().plan] || PLANS.studio; },
    planKey() { return PF.isFree ? 'free' : PLANS[Store.meta().plan] ? Store.meta().plan : 'studio'; },
    usage() {
      const u = Store.meta().usage || {};
      const m = new Date().toISOString().slice(0, 7);
      return u.month === m ? u : { month: m, count: 0, seconds: 0 };
    },

    /* ---------- routing ---------- */
    route() {
      const r = (location.hash || '#home').slice(1);
      const valid = ['account', 'home', 'studio', 'processing', 'editor', 'library', 'export', 'settings', 'billing', 'tools', 'tools-chords', 'tools-circle', 'tools-scales', 'tools-gen', 'tools-bass', 'drums', 'drums-rudiments'];
      const next = valid.includes(r) ? r : 'home';
      if (this.st.route === 'editor' && next !== 'editor') { Au.stop(); this.saveNow(); Ed.destroy(); }
      if (this.st.route.startsWith('tools') && root.GTSTools) root.GTSTools.stopLoop();
      if ((this.st.route.startsWith('drums') || this.st.route === 'tools-bass') && root.GTSDrums) root.GTSDrums.leave();
      this.st.route = next;
      if (next === 'billing' && PF.isFree) { location.replace('#settings'); return; }
      if (next === 'editor' && !this.st.project) {
        const last = Store.list()[0];
        if (last) return this.openEditor(last.id);
      }
      this.render();
    },
    go(r) { if (location.hash === '#' + r) this.route(); else location.hash = r; },
    render() {
      this.renderChrome();
      const main = $('#app-main');
      const f = this.st.route.startsWith('tools') ? (m) => root.GTSTools.render(m, this.st.route) : this.st.route.startsWith('drums') ? (m) => root.GTSDrums.render(m, this.st.route) : this['screen_' + this.st.route];
      main.innerHTML = '';
      main.dataset.screen = this.st.route;
      f.call(this, main);
      main.scrollTop = 0;
      const h = main.querySelector('h1');
      if (h && document.activeElement === document.body) h.setAttribute('tabindex', '-1');
    },
    renderChrome() {
      $$('.nav a, .tabbar a').forEach((a) => a.setAttribute('aria-current', a.dataset.r === this.st.route || (a.dataset.r === 'studio' && this.st.route === 'processing') || (a.dataset.r === 'tools' && this.st.route.startsWith('tools')) || (a.dataset.r === 'drums' && this.st.route.startsWith('drums')) ? 'page' : 'false'));
      const sync = $('#sync');
      const mode = Store.mode;
      const st = syncInfo();
      sync.className = 'sync ' + st.cls;
      sync.textContent = st.text;
      sync.title = st.title;
      const ab = $('#acct-btn');
      if (ab) {
        ab.hidden = !Acc.configured;
        ab.innerHTML = Acc.user ? `<span class="av">${esc((Acc.email || '?')[0].toUpperCase())}</span><span class="ab-t">${esc(st.short)}</span>` : 'Войти';
        ab.className = 'btn sm ' + (Acc.user ? 'ghost acct ' + st.cls : '');
      }
      void mode;
      const u = this.usage(), pl = this.plan();
      $('#plan-chip').innerHTML = isFinite(pl.monthly) ? `<b>${pl.name}</b> · ${u.count}/${pl.monthly} обработок` : `<b>${pl.name}</b> · ${u.count} ${plural(u.count, 'обработка', 'обработки', 'обработок')} в этом месяце`;
      const cur = $('#cur-project');
      if (this.st.project && this.st.route === 'editor') cur.innerHTML = `<span class="cp-title">${esc(this.st.project.title)}</span><span class="cp-save ${this.st.dirty ? 'dirty' : ''}">${esc(this.st.saveMsg || (this.st.dirty ? 'Есть несохранённые изменения' : 'Сохранено'))}</span>`;
      else cur.innerHTML = '';
    },
    bindChrome() {
      $('#nav-toggle').addEventListener('click', () => document.body.classList.toggle('nav-open'));
      $('.nav').addEventListener('click', () => document.body.classList.remove('nav-open'));
      document.body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-go]');
        if (b) { e.preventDefault(); this.go(b.dataset.go); }
        const o = e.target.closest('[data-open]');
        if (o) { e.preventDefault(); this.openEditor(o.dataset.open); }
      });
    },

    /* ---------- toasts & modals ---------- */
    toast(msg, kind) {
      const t = document.createElement('div');
      t.className = 'toast ' + (kind || '');
      t.setAttribute('role', kind === 'err' ? 'alert' : 'status');
      t.textContent = msg;
      $('#toasts').appendChild(t);
      setTimeout(() => t.classList.add('out'), kind === 'err' ? 6500 : 3800);
      setTimeout(() => t.remove(), kind === 'err' ? 7000 : 4300);
    },
    modal(html, opts) {
      opts = opts || {};
      this.closeModal();
      const wrap = document.createElement('div');
      wrap.className = 'modal-wrap';
      wrap.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(opts.label || 'Диалог')}">${html}</div>`;
      wrap.addEventListener('mousedown', (e) => { if (e.target === wrap && !opts.sticky) this.closeModal(); });
      document.body.appendChild(wrap);
      this._modal = wrap;
      this._lastFocus = document.activeElement;
      const f = wrap.querySelector('[autofocus], input, select, button');
      f && f.focus();
      return wrap.firstElementChild;
    },
    closeModal() { if (this._modal) { this._modal.remove(); this._modal = null; this._lastFocus && this._lastFocus.focus && this._lastFocus.focus({ preventScroll: true }); } },
    prompt(title, value, hint, cb) {
      const m = this.modal(`<h2>${esc(title)}</h2><form class="stack"><input id="pr-in" value="${esc(value)}" autofocus maxlength="120"><p class="muted small">${esc(hint || '')}</p><div class="row end"><button type="button" class="btn ghost" data-x>Отмена</button><button class="btn">Готово</button></div></form>`);
      const inp = m.querySelector('#pr-in'); inp.select();
      m.querySelector('[data-x]').onclick = () => this.closeModal();
      m.querySelector('form').onsubmit = (e) => { e.preventDefault(); const v = inp.value; this.closeModal(); cb(v); };
    },
    confirm(title, text, okLabel, cb, danger) {
      const m = this.modal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="row end"><button class="btn ghost" data-x>Отмена</button><button class="btn ${danger ? 'danger' : ''}" data-ok autofocus>${esc(okLabel)}</button></div>`);
      m.querySelector('[data-x]').onclick = () => this.closeModal();
      m.querySelector('[data-ok]').onclick = () => { this.closeModal(); cb(); };
    },

    /* ---------- onboarding ---------- */
    onboarding() {
      const slides = [
        ['Из звука в табулатуру', 'Загрузите запись или сыграйте в микрофон. AI определит ноты, ритм, аккорды, темп и тональность и разложит партию по струнам и ладам.'],
        ['Чистая гитара или целая песня', 'Изолированная запись распознаётся напрямую. В полном миксе система сначала отделяет гитару и бас от остальных инструментов. Сложный микс распознаётся заметно хуже: проверяйте результат.'],
        ['Редактор важнее нейросети', 'Сомнительные ноты подсвечены. Щёлкните ноту, чтобы услышать этот момент записи, и исправьте лад цифрами. Ваши правки сохраняются в библиотеке и экспортируются в Guitar Pro, MIDI, MusicXML и PDF.']
      ];
      let i = 0;
      const draw = () => {
        const m = this.modal(`<div class="onb"><div class="onb-step">${i + 1} / ${slides.length}</div><h2>${slides[i][0]}</h2><p>${slides[i][1]}</p>
          <div class="onb-dots">${slides.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
          <div class="row end"><button class="btn ghost" data-skip>Пропустить</button><button class="btn" data-next autofocus>${i < slides.length - 1 ? 'Дальше' : 'Начать'}</button></div></div>`, { label: 'Знакомство', sticky: true });
        m.querySelector('[data-skip]').onclick = done;
        m.querySelector('[data-next]').onclick = () => { if (i < slides.length - 1) { i++; draw(); } else done(); };
      };
      const done = () => { this.closeModal(); Store.setMeta({ onboarded: true }); };
      draw();
    },

    /* ================= SCREENS ================= */
    screen_home(main) {
      const list = Store.list();
      const u = this.usage(), pl = this.plan();
      const notes = list.reduce((s, p) => s + (p.stats ? p.stats.notes : 0), 0);
      const edits = list.reduce((s, p) => s + (p.stats ? p.stats.edits || 0 : 0), 0);
      main.innerHTML = `
        <header class="page-head"><div><p class="eyebrow">AI Guitar Tab Studio</p><h1>Табулатуры из любой записи</h1></div>
          <div class="row"><button class="btn lg" data-go="studio">Новый проект</button></div></header>
        <section class="kpis" aria-label="Сводка">
          <div class="kpi"><span>Проектов</span><b>${list.length}</b></div>
          <div class="kpi"><span>Распознано нот</span><b>${notes.toLocaleString('ru-RU')}</b></div>
          <div class="kpi"><span>Ручных исправлений</span><b>${edits.toLocaleString('ru-RU')}</b></div>
          <div class="kpi"><span>Обработок в этом месяце</span><b>${u.count} <small>${isFinite(pl.monthly) ? 'из ' + pl.monthly : 'без ограничений'}</small></b>${isFinite(pl.monthly) ? `<div class="meter"><i style="width:${Math.min(100, u.count / pl.monthly * 100)}%"></i></div>` : ''}</div>
        </section>
        <section class="block">
          <div class="block-head"><h2>Недавние проекты</h2><a href="#library" class="link">Вся библиотека</a></div>
          <div class="cards">${list.slice(0, 6).map((p) => this.projectCard(p)).join('') || this.emptyLib()}</div>
        </section>
        <section class="block two">
          <div class="pipeline-card"><h2>Как работает распознавание</h2>${this.pipelineSvg()}</div>
          <div class="tips"><h2>Для лучшего результата</h2>
            <ul><li>Записывайте гитару напрямую в аудиокарту или микрофон в 20–30 см от розетки.</li>
            <li>Чистый звук распознаётся точнее, чем перегруз с задержками.</li>
            <li>Для полной песни выберите режим «Полный микс»: гитара и бас будут выделены отдельно.</li>
            <li>Укажите строй и каподастр до распознавания: аппликатура подберётся под них.</li></ul></div>
        </section>`;
    },
    emptyLib() { return `<div class="empty"><p>Пока пусто. Загрузите запись, и проект появится здесь.</p><button class="btn" data-go="studio">Загрузить аудио</button></div>`; },
    projectCard(p) {
      const tr = (p.tracks || []);
      const pv = tr[0] ? this.miniTab(tr[0]) : '';
      const col = (Store.meta().collections || []).find((c) => c.id === p.collectionId);
      return `<article class="pcard">
        <a href="#editor" data-open="${p.id}" class="pcard-link" aria-label="Открыть ${esc(p.title)}">
          <div class="pcard-prev">${pv}</div>
          <h3>${esc(p.title)}</h3></a>
        <p class="pmeta"><span>${p.meta ? Math.round(p.meta.bpm) + ' BPM' : ''}</span><span>${p.meta ? esc(p.meta.key) : ''}</span><span>${p.audio ? fmt(p.audio.duration).replace(/\.\d$/, '') : ''}</span><span>${tr.map((t) => esc(t.name)).join(' + ')}</span></p>
        <p class="pfoot">${p.demo ? '<span class="pill">пример</span>' : ''}${p.mode === 'mix' ? '<span class="pill">микс</span>' : ''}${col ? `<span class="pill col">${esc(col.name)}</span>` : ''}${p.favorite ? '<span class="pill fav">★ избранное</span>' : ''}<span class="muted small">${new Date(p.updatedAt || p.createdAt).toLocaleDateString('ru-RU')}</span></p>
      </article>`;
    },
    miniTab(packedTrack) {
      const notes = Store.unpackNotes((packedTrack.packed || []).slice(0, 80));
      const S = packedTrack.tuning.length, W = 260, H = 64, gap = (H - 12) / (S - 1);
      let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">`;
      for (let s = 0; s < S; s++) svg += `<line x1="0" x2="${W}" y1="${6 + s * gap}" y2="${6 + s * gap}" class="mt-l"/>`;
      const maxPos = 48;
      notes.filter((n) => n.pos < maxPos).forEach((n) => { const x = 6 + n.pos / maxPos * (W - 16), y = 6 + (S - 1 - n.s) * gap; svg += `<text x="${x.toFixed(1)}" y="${(y + 3.5).toFixed(1)}" class="mt-n ${n.conf < 0.5 ? 'low' : ''}">${n.f}</text>`; });
      return svg + '</svg>';
    },
    pipelineSvg() {
      const st = [['Аудио', 'MP3 · WAV · FLAC · микрофон'], ['Подготовка', 'нормализация, 22 кГц'], ['Маршрутизация', 'чистая запись или микс'], ['Разделение', 'гитара · бас · остальное'], ['Ноты', 'YIN + атаки + полифония'], ['Анализ', 'темп · тональность · аккорды'], ['Аппликатура', 'Viterbi по грифу'], ['Проект', 'табы · MIDI · GP · PDF']];
      return `<ol class="pipeline">${st.map(([a, b], i) => `<li><span class="pn">${String(i + 1).padStart(2, '0')}</span><b>${a}</b><small>${b}</small></li>`).join('')}</ol>
        <p class="muted small">Каждый этап — отдельный модуль. Модель распознавания можно заменить (Basic Pitch, MT3, собственная сеть) без изменения редактора и формата проекта.</p>`;
    },

    /* ---------- AI Studio ---------- */
    screen_studio(main) {
      const s = this.settings(), pl = this.plan(), u = this.usage();
      const tunOpts = (type, cur) => Object.keys(E.TUNINGS[type]).map((k) => `<option ${k === cur ? 'selected' : ''}>${k}</option>`).join('');
      main.innerHTML = `
        <header class="page-head"><div><p class="eyebrow">AI Studio</p><h1>Новое распознавание</h1></div><p class="muted">${isFinite(pl.monthly) ? u.count + ' из ' + pl.monthly + ' обработок · ' : ''}записи до ${pl.maxMin} мин${isFinite(pl.monthly) ? ' · тариф ' + pl.name : ''}</p></header>
        <div class="studio">
          <section class="src">
            <label class="drop" id="drop" tabindex="0">
              <input type="file" id="file" accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a,.aac,.webm" hidden>
              <span class="drop-ic">${waveIcon()}</span>
              <b>Перетащите аудиофайл сюда</b>
              <span class="muted">или нажмите, чтобы выбрать: MP3, WAV, FLAC, OGG, M4A</span>
              <span class="file-name" id="file-name"></span>
            </label>
            <div class="or"><span>или</span></div>
            <div class="rec" id="rec">
              <button class="btn rec-btn" id="rec-btn"><i class="dot"></i>Записать с микрофона</button>
              <div class="rec-meter"><i id="rec-level"></i></div><span class="mono" id="rec-time">0:00</span>
            </div>
            <p class="muted small" id="rec-note">Подключите гитару через аудиокарту или поставьте микрофон рядом с инструментом. Обработка звука браузером (шумоподавление, АРУ) отключается.</p>
          </section>
          <section class="opts">
            <h2>Параметры</h2>
            <fieldset><legend>Тип записи</legend>
              <div class="seg big" role="radiogroup">
                <label><input type="radio" name="mode" value="auto" checked><span><b>Определить автоматически</b><small>по спектру записи</small></span></label>
                <label><input type="radio" name="mode" value="isolated"><span><b>Чистый инструмент</b><small>одна гитара или бас</small></span></label>
                <label><input type="radio" name="mode" value="mix"><span><b>Полный микс</b><small>песня с вокалом и ударными</small></span></label>
              </div></fieldset>
            <div class="grid2">
              <label>Инструмент (для чистой записи)<select id="o-inst"><option value="guitar">Гитара</option><option value="bass">Бас-гитара</option></select></label>
              <label>Строй гитары<select id="o-tun">${tunOpts('guitar', s.tuning)}</select></label>
              <label>Строй баса<select id="o-btun">${tunOpts('bass', s.bassTuning)}</select></label>
              <label>Каподастр<select id="o-capo">${Array.from({ length: 10 }, (_, i) => `<option value="${i}" ${i === s.capo ? 'selected' : ''}>${i ? i + ' лад' : 'нет'}</option>`).join('')}</select></label>
              <label>Темп, BPM <small class="muted">пусто — определить</small><input id="o-bpm" type="number" min="30" max="300" placeholder="авто"></label>
              <label class="check"><input type="checkbox" id="o-bass" ${s.includeBass && pl.bassInMix ? 'checked' : ''} ${pl.bassInMix ? '' : 'disabled'}> Бас отдельной дорожкой в миксе ${pl.bassInMix ? '' : '<small class="muted">(Pro и Studio)</small>'}</label>
            </div>
            <label class="check rights"><input type="checkbox" id="o-rights"> Я подтверждаю, что имею право обрабатывать эту запись. Результаты остаются в моей личной библиотеке и не публикуются.</label>
            <button class="btn lg block" id="go" disabled>Распознать</button>
            <p class="muted small" id="go-hint">Выберите файл или сделайте запись.</p>
          </section>
        </div>`;
      let picked = null;
      const upd = () => {
        const ok = picked && $('#o-rights').checked;
        $('#go').disabled = !ok;
        $('#go-hint').textContent = !picked ? 'Выберите файл или сделайте запись.' : !$('#o-rights').checked ? 'Подтвердите права на запись.' : 'Файл: ' + picked.name + ' · ' + (picked.size / 1048576).toFixed(1) + ' МБ';
      };
      const setFile = (f) => {
        if (!f) return;
        if (f.size > 150 * 1048576) return this.toast('Файл больше 150 МБ. Сожмите его в MP3 или обрежьте.', 'err');
        picked = f; $('#file-name').textContent = f.name; $('#drop').classList.add('has'); upd();
      };
      $('#file').addEventListener('change', (e) => setFile(e.target.files[0]));
      const drop = $('#drop');
      drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file').click(); } });
      ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
      drop.addEventListener('drop', (e) => setFile(e.dataTransfer.files[0]));
      $('#o-rights').addEventListener('change', upd);
      // recording
      let rec = null, t0 = 0, timer = null;
      $('#rec-btn').addEventListener('click', async () => {
        const btn = $('#rec-btn');
        if (rec) {
          clearInterval(timer);
          const blob = await rec.stop(); rec = null;
          btn.innerHTML = '<i class="dot"></i>Записать ещё раз'; btn.classList.remove('on');
          const ext = (blob.type.split('/')[1] || 'webm').split(';')[0];
          setFile(new File([blob], 'Запись ' + new Date().toLocaleTimeString('ru-RU').slice(0, 5) + '.' + ext, { type: blob.type }));
          return;
        }
        try {
          rec = await Au.startRecording((lv) => { const el = $('#rec-level'); if (el) el.style.width = Math.min(100, lv * 140) + '%'; });
          t0 = Date.now(); btn.innerHTML = '<i class="dot"></i>Остановить запись'; btn.classList.add('on');
          timer = setInterval(() => { const s = (Date.now() - t0) / 1000; const el = $('#rec-time'); if (el) el.textContent = Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); if (s > pl.maxMin * 60) btn.click(); }, 250);
        } catch (e) {
          rec = null;
          $('#rec-note').innerHTML = PF.native ? '<b>Нет доступа к микрофону.</b> Разрешите его в Настройках телефона → Tab Studio → Микрофон и попробуйте снова.' : '<b>Микрофон недоступен в этом окне.</b> Встроенный просмотр Claude не даёт страницам доступ к микрофону. Запишите партию в любом приложении (диктофон, DAW) и загрузите файл, либо откройте приложение в отдельной вкладке браузера.';
          $('#rec-note').classList.add('warn');
        }
      });
      $('#go').addEventListener('click', () => {
        const opts = {
          mode: (main.querySelector('input[name=mode]:checked') || {}).value || 'auto',
          instrument: $('#o-inst').value,
          tuningName: $('#o-tun').value, bassTuningName: $('#o-btun').value,
          capo: +$('#o-capo').value, bpm: +$('#o-bpm').value || null,
          includeBass: $('#o-bass').checked
        };
        Store.setMeta({ settings: Object.assign(this.settings(), { tuning: opts.tuningName, bassTuning: opts.bassTuningName, capo: opts.capo, includeBass: opts.includeBass }) });
        this.process(picked, opts);
      });
    },

    /* ---------- processing ---------- */
    async process(file, opts, existing) {
      const pl = this.plan(), u = this.usage();
      if (!existing && u.count >= pl.monthly) {
        return this.modal(`<h2>Лимит обработок исчерпан</h2><p>На тарифе ${pl.name} доступно ${pl.monthly} обработок в месяц. Лимит обновится 1-го числа или после смены тарифа.</p><div class="row end"><button class="btn ghost" onclick="App.closeModal()">Закрыть</button><button class="btn" onclick="App.closeModal();App.go('billing')">Тарифы</button></div>`);
      }
      const job = { id: uid(), file, opts, status: 'created', stages: {}, log: [], started: Date.now(), cancelled: false };
      this.st.job = job;
      const stageList = ['created', 'uploading', 'queued', 'preprocessing', 'separating', 'transcribing', 'analyzing', 'generating_tabs', 'finalizing', 'completed'];
      stageList.forEach((s) => (job.stages[s] = { p: 0, state: 'wait' }));
      const set = (stage, p, msg) => {
        if (job.cancelled) return;
        const idx = stageList.indexOf(stage);
        stageList.forEach((s, i) => { if (i < idx) { job.stages[s].state = 'done'; job.stages[s].p = 1; } });
        job.stages[stage].state = p >= 1 ? 'done' : 'run'; job.stages[stage].p = p;
        job.status = stage;
        if (msg) job.log.push([Date.now() - job.started, msg]);
        if (this.st.route === 'processing') this.drawJob();
      };
      this.go('processing');
      set('created', 1, 'Проект создан');
      try {
        set('uploading', 0, 'Чтение и декодирование файла: ' + file.name);
        const bytes = await file.arrayBuffer();
        Au.ensure();
        const buf = await Au.decode(bytes);
        if (buf.duration > pl.maxMin * 60) throw new Error(`Запись длиннее ${pl.maxMin} минут (лимит тарифа ${pl.name}). Обрежьте её или смените тариф.`);
        if (buf.duration < 1) throw new Error('Запись короче 1 секунды.');
        const mono = await Au.toMono22k(buf);
        set('uploading', 1, `Декодировано: ${fmt(buf.duration)}, ${buf.sampleRate} Гц, ${buf.numberOfChannels === 1 ? 'моно' : 'стерео'}`);
        let mode = opts.mode;
        if (mode === 'auto') {
          const r = classify(mono);
          mode = r.mix ? 'mix' : 'isolated';
          job.log.push([Date.now() - job.started, `Маршрутизация: ${mode === 'mix' ? 'полный микс' : 'чистый инструмент'} (НЧ ${Math.round(r.low * 100)}%, ВЧ ${Math.round(r.high * 100)}%, ударность ${r.perc.toFixed(2)})`]);
        }
        job.mode = mode;
        set('queued', 0.5, 'Задание поставлено в очередь обработчика');
        const s = this.settings();
        const eopts = {
          mode, instrument: opts.instrument, capo: opts.capo, bpm: opts.bpm, maxFret: s.maxFret, weights: s.weights, lowConf: s.lowConf,
          tuning: E.TUNINGS[opts.instrument][opts.instrument === 'bass' ? opts.bassTuningName : opts.tuningName] || undefined,
          guitarTuning: E.TUNINGS.guitar[opts.tuningName], bassTuning: E.TUNINGS.bass[opts.bassTuningName],
          includeBass: opts.includeBass && pl.bassInMix
        };
        const res = await this.runEngine(mono, eopts, (pr) => set(pr.stage, pr.progress, pr.message), job);
        if (job.cancelled) return;
        set('finalizing', 0.5, 'Сохранение проекта в библиотеке');
        const p = existing ? Object.assign({}, existing) : {
          id: uid(), title: file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').slice(0, 100) || 'Новая запись', createdAt: Date.now(),
          favorite: false, collectionId: null, tags: [], lyrics: []
        };
        Object.assign(p, {
          status: 'completed', mode, instrument: opts.instrument,
          audio: { name: file.name, format: (file.name.split('.').pop() || '').toLowerCase(), size: file.size, duration: +buf.duration.toFixed(2), sampleRate: buf.sampleRate, channels: buf.numberOfChannels },
          meta: res.meta, tracks: res.tracks, chords: res.chords, model: res.model, baseRev: existing ? existing.baseRev : 0
        });
        p.stats = projStats(p);
        await Store.putAudio(p.id, { name: file.name, type: file.type, bytes });
        this.st.audioCache = { [p.id]: { buf, mono, stems: res.stems } };
        const sv = await Store.save(p, { force: true });
        if (sv.error) this.toast(sv.error, 'warn');
        await Store.addVersion(p, existing ? 'Повторное распознавание' : 'Результат AI');
        if (!existing) { const uu = this.usage(); uu.count++; uu.seconds = (uu.seconds || 0) + buf.duration; await Store.setMeta({ usage: uu }); }
        set('completed', 1, `Готово: ${res.tracks.map((t) => t.name + ' — ' + t.notes.length + ' нот').join(', ')}, ${res.chords.length} аккордов, ${res.meta.bpm} BPM, ${res.meta.key}`);
        job.status = 'completed'; job.pid = p.id;
        this.drawJob();
        setTimeout(async () => { if (this.st.job !== job || this.st.route !== 'processing') return; await PF.Ads.maybeInterstitial('process'); if (this.st.job === job && this.st.route === 'processing') this.openEditor(p.id); }, 900);
      } catch (err) {
        if (job.cancelled) return;
        job.status = 'failed'; job.error = String(err.message || err);
        const runStage = Object.keys(job.stages).find((k) => job.stages[k].state === 'run');
        if (runStage) job.stages[runStage].state = 'fail';
        job.log.push([Date.now() - job.started, 'Ошибка: ' + job.error]);
        this.drawJob();
      }
    },
    runEngine(mono, opts, onProg, job) {
      return new Promise((resolve, reject) => {
        const runMain = () => {
          setTimeout(() => {
            try { resolve(E.run({ signal: mono, sampleRate: 22050 }, opts, onProg)); } catch (e) { reject(e); }
          }, 30);
        };
        if (!this.worker || !this.workerOk) return runMain();
        const id = uid();
        const w = this.worker;
        let started = false;
        const t = setTimeout(() => { if (!started) { w.removeEventListener('message', h); this.workerOk = false; runMain(); } }, 4000);
        const h = (e) => {
          if (e.data.id !== id) return;
          started = true; clearTimeout(t);
          if (e.data.type === 'progress') onProg(e.data.p);
          else if (e.data.type === 'done') { w.removeEventListener('message', h); resolve(e.data.result); }
          else if (e.data.type === 'error') { w.removeEventListener('message', h); reject(new Error(e.data.error)); }
        };
        w.addEventListener('message', h);
        job.cancel = () => { w.removeEventListener('message', h); w.terminate(); this.makeWorker(); };
        w.postMessage({ cmd: 'run', id, signal: mono.slice(), sampleRate: 22050, opts });
      });
    },
    screen_processing(main) {
      if (!this.st.job) { main.innerHTML = `<header class="page-head"><div><p class="eyebrow">Обработка</p><h1>Нет активных задач</h1></div></header><button class="btn" data-go="studio">Новое распознавание</button>`; return; }
      main.innerHTML = `<header class="page-head"><div><p class="eyebrow">Обработка</p><h1 id="job-title"></h1></div><div class="row" id="job-actions"></div></header><div id="job"></div>`;
      this.drawJob();
    },
    drawJob() {
      const job = this.st.job, host = $('#job');
      if (!host || !job) return;
      const L = { created: 'Проект создан', uploading: 'Загрузка и декодирование', queued: 'В очереди', preprocessing: 'Подготовка аудио', separating: 'Разделение инструментов', transcribing: 'Распознавание нот', analyzing: 'Темп, тональность, аккорды', generating_tabs: 'Генерация табулатуры', finalizing: 'Сборка проекта', completed: 'Готово' };
      $('#job-title').textContent = job.file.name;
      const total = Object.values(job.stages).reduce((s, x) => s + x.p, 0) / Object.keys(job.stages).length;
      const fail = job.status === 'failed', canc = job.status === 'cancelled', done = job.status === 'completed';
      $('#job-actions').innerHTML = fail || canc ? `<button class="btn ghost" data-go="studio">Изменить параметры</button><button class="btn" id="job-retry">Повторить</button>` : done ? `<button class="btn" data-open="${job.pid}">Открыть редактор</button>` : `<button class="btn ghost" id="job-cancel">Отменить</button>`;
      host.innerHTML = `
        <div class="job-top"><div class="meter big ${fail ? 'low' : ''}"><i style="width:${Math.round((done ? 1 : total) * 100)}%"></i></div><span class="mono">${fail ? 'ошибка' : canc ? 'отменено' : Math.round((done ? 1 : total) * 100) + '%'}</span>
        <span class="pill">${job.mode === 'mix' ? 'Полный микс' : job.mode === 'isolated' ? 'Чистый инструмент' : 'Определяется тип'}</span><span class="muted mono small">status: ${job.status}</span></div>
        ${fail ? `<div class="alert err" role="alert"><b>Распознавание остановлено.</b> ${esc(job.error)}</div>` : ''}
        <ol class="stages">${Object.entries(job.stages).map(([k, v]) => `<li class="${v.state}"><span class="st-ic" aria-hidden="true"></span><span class="st-name">${L[k]}</span><span class="st-key mono">${k}</span><div class="meter"><i style="width:${Math.round(v.p * 100)}%"></i></div></li>`).join('')}</ol>
        <details class="log" open><summary>Журнал обработки</summary><ol>${job.log.map(([t, m]) => `<li><span class="mono">${(t / 1000).toFixed(1)} с</span> ${esc(m)}</li>`).join('')}</ol></details>`;
      const c = $('#job-cancel');
      if (c) c.onclick = () => { job.cancelled = true; job.cancel && job.cancel(); job.status = 'cancelled'; Object.values(job.stages).forEach((s) => { if (s.state === 'run') s.state = 'fail'; }); job.log.push([Date.now() - job.started, 'Задание отменено пользователем']); this.drawJob(); };
      const r = $('#job-retry');
      if (r) r.onclick = () => this.process(job.file, job.opts);
    },

    /* ---------- editor ---------- */
    async openEditor(pid, opts) {
      opts = opts || {};
      if (this.st.pid !== pid || !this.st.project) {
        if (this.st.dirty) await this.saveNow();
        const p = Store.get(pid);
        if (!p) { this.toast('Проект не найден.', 'err'); return this.go('library'); }
        p.baseRev = p.rev || 0;
        p.lyrics = p.lyrics || []; p.chords = p.chords || [];
        this.st.project = p; this.st.pid = pid; this.st.dirty = false; this.st.saveMsg = Store.mode === 'cloud' ? 'Сохранено в облаке' : 'Сохранено';
        Ed.ti = 0;
      }
      if (location.hash !== '#editor') { this.st.route = 'editor'; history.replaceState(null, '', '#editor'); }
      this.st.route = 'editor';
      this.renderChrome();
      const main = $('#app-main');
      main.dataset.screen = 'editor';
      main.innerHTML = '<div class="editor" id="editor"></div>';
      const ac = await this.loadAudio(this.st.project);
      Ed.mount($('#editor'), this.st.project, ac ? ac.mono : null);
    },
    async loadAudio(p) {
      let ac = this.st.audioCache[p.id];
      if (!ac) {
        const rec = await Store.getAudio(p.id);
        if (rec && rec.bytes) {
          try {
            const buf = await Au.decode(rec.bytes);
            const mono = await Au.toMono22k(buf);
            ac = { buf, mono, stems: p.mode === 'mix' ? E.separate(mono, 22050) : null };
            this.st.audioCache = { [p.id]: ac };
          } catch (e) { ac = null; }
        }
      }
      if (ac) {
        try {
          Au.ensure();
          const map = { original: ac.buf };
          if (ac.stems) { map.guitar = Au.fromFloat(ac.stems.guitar); map.bass = Au.fromFloat(ac.stems.bass); map.other = Au.fromFloat(ac.stems.other); }
          Au.setBuffers(map);
        } catch (e) { Au.setBuffers({}); }
      } else { try { Au.setBuffers({}); } catch (e) { /* no audio ctx */ } }
      Au.from = 0;
      return ac;
    },
    markDirty(edits) {
      this.st.dirty = true; this.st.saveMsg = 'Изменения не сохранены';
      if (edits && this.st.project) { this.st.project.editCount = (this.st.project.editCount || 0) + edits; }
      this.renderChrome();
      clearTimeout(this._saveT);
      this._saveT = setTimeout(() => this.saveNow(), 1500);
    },
    async saveNow(explicit) {
      const p = this.st.project;
      if (!p || (!this.st.dirty && !explicit) || this.st.saving) return;
      this.st.saving = true; this.st.saveMsg = 'Сохранение…'; this.renderChrome();
      p.stats = projStats(p);
      const r = await Store.save(p);
      this.st.saving = false;
      if (r.conflict) {
        this.st.saveMsg = 'Конфликт версий';
        this.renderChrome();
        const m = this.modal(`<h2>Проект изменён на другом устройстве</h2><p>Пока вы редактировали, в облаке появилась более новая ревизия (${r.conflict.rev}). Ваша ревизия: ${p.baseRev}.</p>
          <div class="row end"><button class="btn ghost" data-load>Загрузить версию из облака</button><button class="btn" data-keep autofocus>Сохранить мою поверх</button></div>`, { sticky: true });
        m.querySelector('[data-load]').onclick = () => { this.closeModal(); this.st.dirty = false; this.st.project = null; this.openEditor(p.id); };
        m.querySelector('[data-keep]').onclick = async () => { this.closeModal(); await Store.save(p, { force: true }); this.st.dirty = false; this.st.saveMsg = 'Сохранено'; this.renderChrome(); };
        return;
      }
      if (r.error) { this.toast(r.error, 'warn'); }
      this.st.dirty = false;
      this.st.saveMsg = r.error ? 'Сохранено локально' : r.offline ? 'Сохранено на устройстве · отправится при подключении' : Store.mode === 'account' ? 'Синхронизировано · ревизия ' + p.rev : Store.mode === 'cloud' ? 'Сохранено в облаке · ревизия ' + p.rev : 'Сохранено · ревизия ' + p.rev;
      this.renderChrome();
      if (explicit) this.toast('Проект сохранён.');
    },
    async saveVersion() {
      const p = this.st.project; if (!p) return;
      this.prompt('Сохранить версию', 'Правка ' + new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), 'Короткая метка, чтобы найти версию в истории.', async (label) => {
        await this.saveNow(true);
        await Store.addVersion(p, label || 'Версия');
        this.toast('Версия сохранена.');
        if (Ed.panel === 'history') Ed.renderPanels();
      });
    },
    remapDialog() {
      const p = this.st.project, tr = p.tracks[Ed.ti], s = this.settings();
      const tunings = E.TUNINGS[tr.type];
      const cur = Object.keys(tunings).find((k) => tunings[k].join() === tr.tuning.join()) || Object.keys(tunings)[0];
      const w = Object.assign({}, E.DEFAULT_WEIGHTS, s.weights);
      const m = this.modal(`<h2>Пересчитать аппликатуру: ${esc(tr.name)}</h2>
        <p class="muted">Повторяется только последний этап (ноты → струны и лады). Разделение и распознавание нот не запускаются заново.</p>
        <div class="grid2"><label>Строй<select id="rm-tun">${Object.keys(tunings).map((k) => `<option ${k === cur ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        <label>Каподастр<select id="rm-capo">${Array.from({ length: 10 }, (_, i) => `<option value="${i}" ${i === (tr.capo || 0) ? 'selected' : ''}>${i ? i + ' лад' : 'нет'}</option>`).join('')}</select></label>
        <label>Последний доступный лад<input id="rm-max" type="number" min="12" max="24" value="${tr.maxFret || 22}"></label></div>
        ${weightsHtml(w)}
        <label class="check"><input type="checkbox" id="rm-keep" checked> Не трогать ноты, исправленные вручную</label>
        <div class="row end"><button class="btn ghost" data-x>Отмена</button><button class="btn" data-ok>Пересчитать</button></div>`, { wide: true });
      bindWeights(m);
      m.querySelector('[data-x]').onclick = () => this.closeModal();
      m.querySelector('[data-ok]').onclick = () => {
        const tuning = tunings[m.querySelector('#rm-tun').value], capo = +m.querySelector('#rm-capo').value, maxFret = +m.querySelector('#rm-max').value;
        const weights = readWeights(m), keep = m.querySelector('#rm-keep').checked;
        this.closeModal();
        const sameTuning = tuning.join() === tr.tuning.join() && capo === (tr.capo || 0);
        Ed.mutate(() => {
          const fixed = [], free = [];
          tr.notes.forEach((n) => {
            if (keep && n.edited && sameTuning) fixed.push(n);
            else { const c = Object.assign({}, n); delete c.s; delete c.f; delete c.fixed; free.push(c); }
          });
          const mapped = E.mapFretboard(free, { tuning, capo, maxFret, weights, s16: 60 / p.meta.bpm / 4 });
          const taken = new Set(fixed.map((n) => n.pos + ':' + n.s));
          const merged = fixed.concat(mapped.filter((n) => !taken.has(n.pos + ':' + n.s)).map((n) => { delete n.fixed; return n; }));
          tr.notes = merged; tr.tuning = tuning.slice(); tr.capo = capo; tr.maxFret = maxFret;
        });
        Store.setMeta({ settings: Object.assign(this.settings(), { weights }) });
        this.toast('Аппликатура пересчитана. Отменить: Ctrl+Z.');
        this.openEditor(p.id, { keepState: true });
      };
    },
    rerun() {
      const p = this.st.project;
      Store.getAudio(p.id).then((rec) => {
        if (!rec) return this.toast('Исходная запись не сохранена на этом устройстве. Загрузите файл заново в AI Studio.', 'warn');
        this.confirm('Распознать заново?', 'Ноты, аккорды и аппликатура будут заменены новым результатом. Текущее состояние сохранится в истории версий. Повторное распознавание не расходует лимит.', 'Распознать', async () => {
          await this.saveNow(true);
          await Store.addVersion(p, 'Перед повторным распознаванием');
          const s = this.settings();
          const opts = { mode: p.mode, instrument: p.instrument || 'guitar', tuningName: s.tuning, bassTuningName: s.bassTuning, capo: p.tracks[0] ? p.tracks[0].capo || 0 : 0, bpm: null, includeBass: true };
          const lyrics = p.lyrics;
          this.st.project = null;
          await this.process(new File([rec.bytes], rec.name, { type: rec.type }), opts, Object.assign({}, p, { lyrics }));
        });
      });
    },
    pasteLyricsDialog() {
      const m = this.modal(`<h2>Вставить текст песни</h2><p class="muted">Каждая строка станет отдельной записью. Время распределится равномерно по длине трека, затем его можно уточнить кнопкой ⏱ во время воспроизведения.</p><textarea id="ly-txt" rows="10" autofocus></textarea><div class="row end"><button class="btn ghost" data-x>Отмена</button><button class="btn" data-ok>Добавить</button></div>`);
      m.querySelector('[data-x]').onclick = () => this.closeModal();
      m.querySelector('[data-ok]').onclick = () => {
        const lines = m.querySelector('#ly-txt').value.split('\n').map((s) => s.trim()).filter(Boolean);
        this.closeModal();
        if (!lines.length) return;
        const p = this.st.project, dur = (p.audio && p.audio.duration) || 60, off = p.meta.offset || 0;
        Ed.mutate(() => { p.lyrics = lines.map((text, i) => ({ t: +(off + (dur - off) * i / lines.length).toFixed(2), text })); });
      };
    },
    renderNotation(host, p, ti) {
      if (!root.alphaTab) { host.innerHTML = '<p class="muted">Библиотека нотной записи не загрузилась. Проверьте подключение и откройте вкладку ещё раз.</p>'; return; }
      const one = Object.assign({}, p, { tracks: [p.tracks[ti]] });
      const tex = X.toAlphaTex(one);
      host.innerHTML = '<div class="at-surface"></div>';
      const dark = !matchMedia('(prefers-color-scheme: light)').matches || document.documentElement.dataset.theme === 'dark';
      const col = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
      try {
        const api = new root.alphaTab.AlphaTabApi(host.firstChild, {
          core: { useWorkers: false, fontDirectory: new URL('font/', location.href).href, enableLazyLoading: false, tex: false },
          display: { staveProfile: p.tracks[ti].type === 'bass' ? 'Default' : 'Default', layoutMode: 'Page', scale: 0.95,
            resources: { staffLineColor: col('--string'), barSeparatorColor: col('--grid-bar'), mainGlyphColor: col('--text'), secondaryGlyphColor: col('--muted'), scoreInfoColor: col('--text'), barNumberColor: col('--muted') } },
          player: { enablePlayer: false }
        });
        void dark;
        api.error.on((e) => { host.innerHTML = '<p class="muted">Не удалось отрисовать нотную запись: ' + esc(e && e.message || e) + '</p>'; });
        api.tex(tex);
        this._at = api;
      } catch (e) { host.innerHTML = '<p class="muted">Не удалось отрисовать нотную запись: ' + esc(e.message) + '</p>'; }
    },

    /* ---------- library ---------- */
    screen_library(main) {
      const meta = Store.meta();
      const cols = meta.collections || [];
      const f = this.st.libFilter || { q: '', col: 'all', sort: 'updated' };
      this.st.libFilter = f;
      let list = Store.list();
      if (f.col === 'fav') list = list.filter((p) => p.favorite);
      else if (f.col === 'none') list = list.filter((p) => !p.collectionId);
      else if (f.col !== 'all') list = list.filter((p) => p.collectionId === f.col);
      if (f.q) { const q = f.q.toLowerCase(); list = list.filter((p) => (p.title + ' ' + (p.tags || []).join(' ') + ' ' + (p.meta ? p.meta.key : '') + ' ' + (p.chords || []).map((c) => c.name).join(' ')).toLowerCase().includes(q)); }
      if (f.sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
      else if (f.sort === 'created') list.sort((a, b) => b.createdAt - a.createdAt);
      const count = (pred) => Store.list().filter(pred).length;
      main.innerHTML = `
        <header class="page-head"><div><p class="eyebrow">Библиотека</p><h1>Мои проекты</h1></div><div class="row"><button class="btn ghost" id="col-new">Новая коллекция</button><button class="btn" data-go="studio">Новый проект</button></div></header>
        <div class="lib">
          <nav class="cols" aria-label="Коллекции">
            ${[['all', 'Все проекты', count(() => true)], ['fav', '★ Избранное', count((p) => p.favorite)], ['none', 'Без коллекции', count((p) => !p.collectionId)]].map(([k, l, n]) => `<button class="${f.col === k ? 'on' : ''}" data-col="${k}">${l}<small>${n}</small></button>`).join('')}
            <h3>Коллекции</h3>
            ${cols.map((c) => `<div class="colrow"><button class="${f.col === c.id ? 'on' : ''}" data-col="${c.id}">${esc(c.name)}<small>${count((p) => p.collectionId === c.id)}</small></button><button class="icon-btn" data-colmenu="${c.id}" aria-label="Изменить коллекцию ${esc(c.name)}">⋯</button></div>`).join('') || '<p class="muted small">Создайте коллекцию для сетлиста, урока или альбома.</p>'}
          </nav>
          <section>
            <div class="lib-tools"><input type="search" id="lib-q" placeholder="Поиск по названию, тегу, аккорду, тональности" value="${esc(f.q)}" aria-label="Поиск">
              <select id="lib-sort" aria-label="Сортировка"><option value="updated" ${f.sort === 'updated' ? 'selected' : ''}>Сначала изменённые</option><option value="created" ${f.sort === 'created' ? 'selected' : ''}>Сначала новые</option><option value="title" ${f.sort === 'title' ? 'selected' : ''}>По названию</option></select></div>
            <div class="rows">${list.map((p) => this.libRow(p, cols)).join('') || '<p class="muted">Ничего не найдено.</p>'}</div>
            <p class="muted small">Хранилище: ${Store.mode === 'account' ? 'аккаунт ' + esc(Acc.email) + ' — проекты и записи доступны на всех ваших устройствах' : Store.mode === 'cloud' ? 'облако, личное пространство — проекты видите только вы; исходные записи хранятся на этом устройстве' : Store.mode === 'local' ? 'это устройство' + (Acc.configured ? ' — <a href="#account">войдите</a>, чтобы синхронизировать' : '') : 'только эта вкладка'}. Лимит тарифа: ${this.plan().library} проектов.</p>
          </section>
        </div>`;
      $('#lib-q').addEventListener('input', (e) => { f.q = e.target.value; clearTimeout(this._qT); this._qT = setTimeout(() => { this.render(); const q = $('#lib-q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); });
      $('#lib-sort').addEventListener('change', (e) => { f.sort = e.target.value; this.render(); });
      $$('[data-col]').forEach((b) => b.addEventListener('click', () => { f.col = b.dataset.col; this.render(); }));
      $('#col-new').addEventListener('click', () => this.prompt('Новая коллекция', '', 'Например: «Сетлист на субботу» или «Уроки фингерстайла».', (v) => { v = v.trim(); if (!v) return; Store.setMeta({ collections: cols.concat([{ id: uid(), name: v.slice(0, 60) }]) }).then(() => this.render()); }));
      $$('[data-colmenu]').forEach((b) => b.addEventListener('click', () => {
        const c = cols.find((x) => x.id === b.dataset.colmenu);
        const m = this.modal(`<h2>${esc(c.name)}</h2><div class="stack"><button class="btn ghost" data-ren>Переименовать</button><button class="btn danger" data-del>Удалить коллекцию</button><p class="muted small">Проекты из коллекции не удаляются.</p></div>`);
        m.querySelector('[data-ren]').onclick = () => { this.closeModal(); this.prompt('Переименовать', c.name, '', (v) => { if (!v.trim()) return; c.name = v.trim().slice(0, 60); Store.setMeta({ collections: cols }).then(() => this.render()); }); };
        m.querySelector('[data-del]').onclick = async () => {
          this.closeModal();
          for (const p of Store.list().filter((x) => x.collectionId === c.id)) { const full = Store.get(p.id); full.collectionId = null; full.baseRev = full.rev; await Store.save(full, { force: true }); }
          await Store.setMeta({ collections: cols.filter((x) => x.id !== c.id) }); if (f.col === c.id) f.col = 'all'; this.render();
        };
      }));
      main.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => this.libAction(b.dataset.act, b.dataset.id, b)));
      main.querySelectorAll('select[data-move]').forEach((s) => s.addEventListener('change', async () => { const p = Store.get(s.dataset.move); p.collectionId = s.value || null; p.baseRev = p.rev; await Store.save(p, { force: true }); this.render(); }));
    },
    libRow(p, cols) {
      return `<article class="lrow">
        <button class="star ${p.favorite ? 'on' : ''}" data-act="fav" data-id="${p.id}" aria-pressed="${!!p.favorite}" aria-label="${p.favorite ? 'Убрать из избранного' : 'В избранное'}">★</button>
        <a href="#editor" data-open="${p.id}" class="lrow-main"><b>${esc(p.title)}</b><span class="muted small">${p.meta ? Math.round(p.meta.bpm) + ' BPM · ' + esc(p.meta.key) + ' · ' : ''}${p.audio ? fmt(p.audio.duration).replace(/\.\d$/, '') + ' · ' : ''}${(p.tracks || []).map((t) => esc(t.name)).join(' + ')} · ${p.stats ? p.stats.notes + ' нот' : ''}${p.stats && p.stats.lowConf ? ' · <span class="lowtxt">' + p.stats.lowConf + ' сомнительных</span>' : ''}</span>
          ${(p.tags || []).length ? `<span class="tags">${p.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</span>` : ''}</a>
        <select data-move="${p.id}" aria-label="Коллекция"><option value="">Без коллекции</option>${cols.map((c) => `<option value="${c.id}" ${p.collectionId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <div class="row"><button class="btn sm ghost" data-act="tags" data-id="${p.id}">Теги</button><button class="btn sm ghost" data-act="ren" data-id="${p.id}">Переименовать</button><button class="btn sm ghost" data-act="dup" data-id="${p.id}">Копия</button><button class="btn sm danger" data-act="del" data-id="${p.id}">Удалить</button></div>
      </article>`;
    },
    async libAction(act, id) {
      const p = Store.get(id); if (!p) return;
      p.baseRev = p.rev;
      if (act === 'fav') { p.favorite = !p.favorite; await Store.save(p, { force: true }); this.render(); }
      if (act === 'ren') this.prompt('Переименовать проект', p.title, '', async (v) => { if (!v.trim()) return; p.title = v.trim().slice(0, 120); await Store.save(p, { force: true }); if (this.st.project && this.st.project.id === id) this.st.project.title = p.title; this.render(); });
      if (act === 'tags') this.prompt('Теги', (p.tags || []).join(', '), 'Через запятую: рок, урок, соло.', async (v) => { p.tags = v.split(',').map((s) => s.trim().replace(/^#/, '')).filter(Boolean).slice(0, 10); await Store.save(p, { force: true }); this.render(); });
      if (act === 'dup') {
        if (Store.list().length >= this.plan().library) return this.toast('Достигнут лимит библиотеки тарифа.', 'warn');
        const c = JSON.parse(JSON.stringify(p)); c.id = uid(); c.title = p.title + ' (копия)'; c.createdAt = Date.now(); c.rev = 0; c.baseRev = 0;
        await Store.save(c, { force: true });
        const a = await Store.getAudio(id); if (a) await Store.putAudio(c.id, a);
        this.render();
      }
      if (act === 'del') this.confirm('Удалить проект?', `«${p.title}» и его история версий будут удалены без возможности восстановления. Исходная запись тоже удаляется с этого устройства.`, 'Удалить', async () => { await Store.remove(id); if (this.st.pid === id) { this.st.project = null; this.st.pid = null; } this.render(); this.toast('Проект удалён.'); }, true);
    },

    /* ---------- export ---------- */
    screen_export(main) {
      const list = Store.list();
      const cur = this.st.project && this.st.route ? this.st.project.id : list[0] && list[0].id;
      const pid = this.st.exportPid && Store.getPacked(this.st.exportPid) ? this.st.exportPid : cur;
      const pl = this.plan();
      const hist = (Store.meta().exports || []).slice(0, 12);
      main.innerHTML = `
        <header class="page-head"><div><p class="eyebrow">Экспорт</p><h1>Экспорт проекта</h1></div>
          <label class="row">Проект <select id="ex-p">${list.map((p) => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select></label></header>
        ${list.length ? '' : '<p class="muted">В библиотеке пока нет проектов.</p>'}
        <div class="formats">${FORMATS.map((f) => {
          const allowed = pl.formats.includes(f.k);
          return `<article class="fmt ${allowed ? '' : 'locked'}"><div><h3>${f.name} <span class="ext">.${f.ext}</span></h3><p class="muted">${f.desc}</p>${f.zip ? '<p class="muted small">Скачивается в .zip-архиве.</p>' : ''}</div>
            <div class="row">${allowed ? `<button class="btn sm" data-ex="${f.k}">Скачать</button>${f.text ? `<button class="btn sm ghost" data-copy="${f.k}">Копировать</button>` : ''}${f.k === 'txt' ? `<button class="btn sm ghost" data-preview="txt">Просмотр</button>` : ''}` : `<span class="muted small">Доступно на Pro и Studio</span><button class="btn sm ghost" data-go="billing">Тарифы</button>`}</div></article>`;
        }).join('')}</div>
        <section class="block"><h2>История экспорта</h2>
          <table class="tbl"><thead><tr><th>Когда</th><th>Проект</th><th>Формат</th></tr></thead><tbody>${hist.map((h) => `<tr><td>${new Date(h.at).toLocaleString('ru-RU')}</td><td>${esc(h.title)}</td><td>${esc(h.format)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Экспортов пока не было.</td></tr>'}</tbody></table></section>`;
      const sel = $('#ex-p');
      if (sel) sel.addEventListener('change', () => { this.st.exportPid = sel.value; });
      const getP = () => {
        const id = (sel && sel.value) || pid;
        if (this.st.project && this.st.project.id === id) return this.st.project;
        return Store.get(id);
      };
      $$('[data-ex]').forEach((b) => b.addEventListener('click', async () => {
        const p = getP(); if (!p) return;
        b.disabled = true; const old = b.textContent; b.textContent = 'Готовлю…';
        try { await this.exportFile(p, b.dataset.ex); } catch (e) { this.toast('Экспорт не удался: ' + (e.message || e), 'err'); }
        b.disabled = false; b.textContent = old;
      }));
      $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
        const p = getP(); if (!p) return;
        const out = await this.buildFormat(p, b.dataset.copy);
        try { await navigator.clipboard.writeText(out.data); this.toast('Скопировано в буфер обмена.'); this.logExport(p, b.dataset.copy + ' (копия)'); }
        catch (e) { this.showText(out.data); }
      }));
      $$('[data-preview]').forEach((b) => b.addEventListener('click', async () => { const p = getP(); if (p) this.showText((await this.buildFormat(p, 'txt')).data); }));
    },
    showText(text) {
      const m = this.modal(`<h2>Текстовые табы</h2><pre class="pre">${esc(text)}</pre><div class="row end"><button class="btn" data-x autofocus>Закрыть</button></div>`, { wide: true });
      m.querySelector('[data-x]').onclick = () => this.closeModal();
    },
    async buildFormat(p, k) {
      const base = safeName(p.title);
      if (k === 'txt') return { filename: base + '.txt', data: X.toAscii(p) };
      if (k === 'tex') return { filename: base + '.alphatex.txt', data: X.toAlphaTex(p) };
      if (k === 'json') return { filename: base + '.gts.json', data: X.toJson(p) };
      if (k === 'midi') return { filename: base + '.mid', data: X.toMidi(p), zip: true };
      if (k === 'musicxml') return { filename: base + '.musicxml', data: X.toMusicXml(p), zip: true };
      if (k === 'gp') {
        if (!root.alphaTab) throw new Error('модуль Guitar Pro (alphaTab) не загрузился');
        const s = new root.alphaTab.Settings();
        const imp = new root.alphaTab.importer.AlphaTexImporter();
        imp.initFromString(X.toAlphaTex(p), s);
        const score = imp.readScore();
        score.artist = 'AI Guitar Tab Studio';
        return { filename: base + '.gp', data: new root.alphaTab.exporter.Gp7Exporter().export(score, s), zip: true };
      }
      if (k === 'pdf') return { filename: base + '.pdf', data: await buildPdf(p) };
      if (k === 'zip') {
        const files = [];
        for (const f of ['gp', 'midi', 'musicxml', 'pdf', 'txt', 'json']) {
          try { const o = await this.buildFormat(p, f); files.push({ name: o.filename, data: o.data }); } catch (e) { /* skip unavailable */ }
        }
        return { filename: base + '.zip', data: makeZip(files) };
      }
      throw new Error('неизвестный формат');
    },
    async exportFile(p, k) {
      const out = await this.buildFormat(p, k);
      let { filename, data } = out;
      if (out.zip) { data = makeZip([{ name: filename, data }]); filename = filename + '.zip'; }
      const ok = await this.saveFile(filename, data);
      if (ok) { this.logExport(p, (FORMATS.find((f) => f.k === k) || {}).name || k); PF.Ads.maybeInterstitial('export'); }
    },
    /* save a file whose extension the Claude viewer may refuse (.mid, .gp…): zipped there, raw elsewhere */
    async saveExport(filename, data) {
      const ok = ['txt', 'json', 'pdf', 'zip', 'csv', 'md', 'html', 'svg', 'png', 'mp4', 'webm'];
      const ext = (filename.split('.').pop() || '').toLowerCase();
      if (this.downloads && !PF.native && !PF.tauri && !ok.includes(ext)) return this.saveFile(filename + '.zip', makeZip([{ name: filename, data }]));
      return this.saveFile(filename, data);
    },
    async createGeneratedProject(o) {
      const s16 = 60 / o.bpm / 4;
      const notes = o.notes.map((n, i) => ({ id: 'g' + i, pos: n.pos, len: n.len, s: n.s, f: n.f, midi: n.midi, conf: 1, t: +(n.pos * s16).toFixed(3), d: +(n.len * s16).toFixed(3), edited: true }));
      const p = {
        id: uid(), title: o.title.slice(0, 120), createdAt: Date.now(), favorite: false, collectionId: null, tags: ['генератор'], status: 'completed', mode: 'generated', instrument: o.type, audio: null,
        meta: { bpm: o.bpm, key: o.key, timeSig: [4, 4], offset: 0, bpmConfidence: 1, keyConfidence: 1 },
        tracks: [{ id: 'trk_' + o.type, type: o.type, name: o.type === 'bass' ? 'Бас' : 'Гитара', tuning: o.tuning.slice(), capo: 0, maxFret: o.type === 'bass' ? 20 : 22, notes }],
        chords: o.chords.map((c, i) => ({ pos: i * 16, len: 16, name: c, conf: 1 })), lyrics: [], model: Object.assign({ ranAt: new Date().toISOString() }, o.model), baseRev: 0
      };
      p.stats = projStats(p);
      await Store.save(p, { force: true });
      await Store.addVersion(p, 'Сгенерировано');
      this.st.project = null;
      this.toast('Проект создан и открыт в редакторе.');
      this.openEditor(p.id);
    },
    async saveFile(filename, data) {
      if (PF.native || PF.tauri) {
        try { const r = await PF.saveFile(filename, data); if (r !== null) { if (r) this.toast('Файл готов: ' + filename); return !!r; } }
        catch (e) { this.toast('Не удалось сохранить файл: ' + (e.message || e), 'err'); return false; }
      }
      if (this.downloads) {
        try { await this.downloads.save({ filename, data: typeof data === 'string' ? data : new Blob([data]) }); this.toast('Файл сохранён: ' + filename); return true; }
        catch (e) {
          if (e && e.code === 'declined') return false;
          if (e && e.code === 'rate_limited') { this.toast('Подождите: предыдущее сохранение ещё не завершено.', 'warn'); return false; }
          if (e && e.code !== 'unavailable' && e.code !== 'not_granted') { this.toast('Не удалось сохранить файл (' + (e.code || e.message) + ').', 'err'); return false; }
        }
      }
      try {
        const blob = new Blob([data]);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
        this.toast('Файл подготовлен: ' + filename);
        return true;
      } catch (e) { this.toast('Скачивание недоступно в этом окне.', 'err'); return false; }
    },
    logExport(p, format) {
      const ex = [{ projectId: p.id, title: p.title, format, at: Date.now() }].concat(Store.meta().exports || []).slice(0, 50);
      Store.setMeta({ exports: ex }).then(() => { if (this.st.route === 'export') { const tb = $('.block tbody'); if (tb) tb.innerHTML = ex.slice(0, 12).map((h) => `<tr><td>${new Date(h.at).toLocaleString('ru-RU')}</td><td>${esc(h.title)}</td><td>${esc(h.format)}</td></tr>`).join(''); } });
    },

    /* ---------- settings ---------- */
    screen_settings(main) {
      const s = this.settings();
      const w = Object.assign({}, E.DEFAULT_WEIGHTS, s.weights);
      main.innerHTML = `
        <header class="page-head"><div><p class="eyebrow">Настройки</p><h1>Распознавание и данные</h1></div></header>
        <div class="settings">
          <section class="card"><h2>По умолчанию для новых проектов</h2>
            <div class="grid2">
              <label>Строй гитары<select id="s-tun">${Object.keys(E.TUNINGS.guitar).map((k) => `<option ${k === s.tuning ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
              <label>Строй баса<select id="s-btun">${Object.keys(E.TUNINGS.bass).map((k) => `<option ${k === s.bassTuning ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
              <label>Последний доступный лад<input id="s-max" type="number" min="12" max="24" value="${s.maxFret}"></label>
              <label>Порог сомнительных нот <output id="s-low-o">${Math.round(s.lowConf * 100)}%</output><input id="s-low" type="range" min="0.2" max="0.8" step="0.05" value="${s.lowConf}"></label>
            </div></section>
          <section class="card"><h2>Аппликатура: функция стоимости</h2>
            <p class="formula">C = w<sub>1</sub>·D + w<sub>2</sub>·S + w<sub>3</sub>·F + w<sub>4</sub>·P</p>
            ${weightsHtml(w)}
            <p class="muted small">Viterbi ищет последовательность позиций с минимальной суммарной стоимостью. Больше w<sub>1</sub> — меньше прыжков по грифу, больше w<sub>4</sub> — ближе к нижним позициям.</p></section>
          <section class="card"><h2>Данные и конфиденциальность</h2>
            <label class="check"><input type="checkbox" id="s-consent" ${s.consent ? 'checked' : ''}> Разрешить использовать мои исправления табулатур для улучшения модели. Аудиозаписи не передаются. Согласие можно отозвать в любой момент.</label>
            <p class="muted small">Хранение: ${Store.mode === 'cloud' ? 'проекты — в вашем личном облачном пространстве, недоступном другим пользователям и владельцу страницы' : 'проекты — в этом браузере'}; исходные записи — только на этом устройстве (IndexedDB). Распознанные тексты и табулатуры не публикуются автоматически.</p>
            <div class="row"><button class="btn danger" id="s-wipe">Удалить все мои проекты и записи</button></div></section>
          ${PF.isMobileEdition ? `<section class="card"><h2>Реклама и конфиденциальность</h2>
            <p class="small">Приложение бесплатное: его поддерживает реклама Google AdMob — баннер внизу экрана и изредка полноэкранная реклама после распознавания или экспорта, не чаще раза в ${Math.round((PF.cfg.interstitialMinGapSec || 180) / 60)} мин. Ваши записи и табулатуры рекламным сетям не передаются.</p>
            <dl class="kv"><dt>Согласие на рекламу</dt><dd>${esc(({ OBTAINED: 'получено', NOT_REQUIRED: 'не требуется в вашем регионе', REQUIRED: 'требуется', UNKNOWN: 'не определено' })[PF.Ads.consentStatus] || PF.Ads.consentStatus)}</dd>${PF.os === 'ios' ? `<dt>Отслеживание (ATT)</dt><dd>${esc(({ authorized: 'разрешено', denied: 'запрещено — показывается неперсонализированная реклама', restricted: 'ограничено', notDetermined: 'не задано' })[PF.Ads.tracking] || '—')}</dd>` : ''}</dl>
            <div class="row wrap">${PF.Ads.privacyRequired || PF.Ads.ready ? '<button class="btn ghost" id="s-adprivacy">Настройки конфиденциальности рекламы</button>' : ''}${PF.cfg.privacyUrl ? `<a class="btn ghost" href="${esc(PF.cfg.privacyUrl)}" target="_blank" rel="noopener">Политика конфиденциальности</a>` : ''}</div></section>` : ''}
          <section class="card"><h2>О системе</h2>
            <dl class="kv"><dt>AI Core</dt><dd>${E.MODEL.name} ${E.MODEL.version}</dd><dt>Обработчик</dt><dd>${this.worker && this.workerOk ? 'Web Worker (интерфейс не блокируется)' : 'основной поток'}</dd><dt>Хранилище</dt><dd>${Store.mode === 'cloud' ? 'облако' : 'на этом устройстве'}</dd><dt>Версия</dt><dd>${esc(PF.cfg.version || '1.0.0')} · ${esc(PF.native ? (PF.os === 'ios' ? 'iOS' : 'Android') : 'веб')}</dd><dt>Нотная запись</dt><dd>alphaTab ${root.alphaTab ? (root.alphaTab.meta && root.alphaTab.meta.version) || '1.6' : 'не загружен'} · MPL-2.0</dd><dt>PDF</dt><dd>jsPDF ${root.jspdf ? '· загружен' : 'не загружен'} · MIT</dd></dl></section>
        </div>`;
      const save = (patch) => Store.setMeta({ settings: Object.assign(this.settings(), patch) });
      $('#s-tun').onchange = (e) => save({ tuning: e.target.value });
      $('#s-btun').onchange = (e) => save({ bassTuning: e.target.value });
      $('#s-max').onchange = (e) => save({ maxFret: Math.max(12, Math.min(24, +e.target.value || 22)) });
      $('#s-low').oninput = (e) => { $('#s-low-o').textContent = Math.round(e.target.value * 100) + '%'; };
      $('#s-low').onchange = (e) => save({ lowConf: +e.target.value });
      $('#s-consent').onchange = (e) => { save({ consent: e.target.checked }); this.toast(e.target.checked ? 'Спасибо! Исправления будут учитываться при обучении.' : 'Согласие отозвано.'); };
      bindWeights(main, () => save({ weights: readWeights(main) }));
      const ap = $('#s-adprivacy'); if (ap) ap.onclick = async () => { const ok = await PF.Ads.privacyOptions(); if (!ok) this.toast('Форма настроек сейчас недоступна. Попробуйте позже.', 'warn'); };
      $('#s-wipe').onclick = () => this.confirm('Удалить все данные?', 'Все проекты, версии и сохранённые записи будут удалены. Действие нельзя отменить.', 'Удалить всё', async () => { for (const p of Store.list()) await Store.remove(p.id); this.st.project = null; this.st.pid = null; this.toast('Все проекты удалены.'); this.go('home'); }, true);
    },

    /* ---------- billing ---------- */
    screen_billing(main) {
      const cur = this.planKey(), u = this.usage(), pl = this.plan();
      main.innerHTML = `
        <header class="page-head"><div><p class="eyebrow">Подписка</p><h1>Тариф и лимиты</h1></div></header>
        <section class="usage card"><div><span class="muted">Обработок в ${new Date().toLocaleDateString('ru-RU', { month: 'long' })}</span><b>${u.count} из ${pl.monthly}</b><div class="meter"><i style="width:${Math.min(100, u.count / pl.monthly * 100)}%"></i></div></div>
          <div><span class="muted">Минут аудио обработано</span><b>${((u.seconds || 0) / 60).toFixed(1)}</b></div><div><span class="muted">Проектов в библиотеке</span><b>${Store.list().length} из ${pl.library}</b></div></section>
        <div class="plans">${Object.entries(PLANS).map(([k, p]) => `<article class="plan ${k === cur ? 'cur' : ''} ${k === 'pro' ? 'main' : ''}">
          ${k === 'pro' ? '<span class="pill">Основной тариф</span>' : ''}<h2>${p.name}</h2><p class="price">${p.price}<small>${p.per}</small></p>
          <ul>${p.perks.map((x) => `<li>${x}</li>`).join('')}</ul>
          ${k === cur ? '<button class="btn ghost" disabled>Текущий тариф</button>' : `<button class="btn ${k === 'pro' ? '' : 'ghost'}" data-plan="${k}">Перейти на ${p.name}</button>`}</article>`).join('')}</div>
        <p class="muted small">Оплата в этой версии не подключена: тариф переключается сразу, чтобы проверить лимиты. Платёжная система добавляется на этапе 5 плана разработки.</p>`;
      $$('[data-plan]').forEach((b) => b.addEventListener('click', async () => { await Store.setMeta({ plan: b.dataset.plan }); this.toast('Тариф: ' + PLANS[b.dataset.plan].name + '.'); this.render(); }));
    },

    /* ---------- account ---------- */
    screen_account(main) {
      if (!Acc.configured) {
        main.innerHTML = `<header class="page-head"><div><p class="eyebrow">Аккаунт</p><h1>Синхронизация</h1></div></header>
          <div class="card narrow"><p>${Store.mode === 'cloud' ? 'В этой версии внутри Claude проекты уже хранятся в вашем личном пространстве и доступны на всех устройствах, где вы входите в Claude.' : 'Аккаунты включаются на сайте, в настольном и мобильном приложении Tab Studio. Здесь проекты хранятся на этом устройстве.'}</p></div>`;
        return;
      }
      if (!Acc.user) return this.authForm(main);
      const st = syncInfo();
      const projects = Store.list();
      const bytes = projects.reduce((s, p) => s + JSON.stringify(p).length, 0);
      main.innerHTML = `<header class="page-head"><div><p class="eyebrow">Аккаунт</p><h1>${esc(Acc.email)}</h1></div>
          <div class="row"><button class="btn" id="ac-sync">Синхронизировать сейчас</button></div></header>
        <div class="settings">
          <section class="card"><h2>Синхронизация</h2>
            <p class="sync-big ${st.cls}">${esc(st.text)}</p>
            ${Acc.lastError && st.cls !== 'cloud' ? `<p class="muted small">${esc(Acc.lastError)}</p>` : ''}
            <dl class="kv"><dt>Последняя синхронизация</dt><dd>${Acc.lastSync ? new Date(Acc.lastSync).toLocaleString('ru-RU') : '—'}</dd>
              <dt>Проектов</dt><dd>${projects.length} · ${(bytes / 1024).toFixed(0)} КБ</dd>
              <dt>Записи в облаке</dt><dd>${Acc.audioIndex.size} ${plural(Acc.audioIndex.size, 'файл', 'файла', 'файлов')} · ${(Acc.audioBytes / 1048576).toFixed(1)} МБ</dd>
              <dt>Ожидают отправки</dt><dd>${Store.pending.size}</dd></dl>
            <p class="muted small">Проекты, версии, коллекции, настройки и исходные записи (до 50 МБ на файл) доступны на всех устройствах, где вы вошли в аккаунт. Без сети всё сохраняется на устройстве и отправляется при подключении.</p></section>
          <section class="card"><h2>Пароль</h2>
            <form id="ac-pw" class="stack"><label for="ac-pw1">Новый пароль<input id="ac-pw1" type="password" minlength="6" autocomplete="new-password" required></label><button class="btn ghost">Сменить пароль</button></form></section>
          <section class="card"><h2>Выход</h2>
            <p class="small">После выхода проекты можно оставить на этом устройстве или удалить их отсюда. В облаке они сохранятся.</p>
            <div class="row wrap"><button class="btn ghost" id="ac-out-keep">Выйти, оставить проекты</button><button class="btn ghost" id="ac-out-clear">Выйти и очистить устройство</button></div></section>
          <section class="card"><h2>Удаление аккаунта</h2>
            <p class="small">Аккаунт, все проекты, версии и записи будут удалены с сервера без возможности восстановления.</p>
            <button class="btn danger" id="ac-del">Удалить аккаунт</button></section>
        </div>`;
      $('#ac-sync').onclick = async () => { await Store.syncNow(); this.toast(Acc.status === 'synced' ? 'Синхронизировано.' : 'Синхронизация не завершена: ' + (Acc.lastError || 'нет сети')); };
      $('#ac-pw').onsubmit = async (e) => { e.preventDefault(); try { await Acc.changePassword($('#ac-pw1').value); this.toast('Пароль изменён.'); $('#ac-pw1').value = ''; } catch (err) { this.toast(err.message, 'err'); } };
      const out = async (clear) => { await Acc.signOut(); await Store.signedOut(clear); this.st.project = null; this.st.pid = null; this.toast('Вы вышли из аккаунта.'); this.render(); };
      $('#ac-out-keep').onclick = () => out(false);
      $('#ac-out-clear').onclick = () => this.confirm('Очистить устройство?', 'Проекты и записи будут удалены с этого устройства. В облаке они останутся.', 'Выйти и очистить', () => out(true), true);
      $('#ac-del').onclick = () => {
        const m = this.modal(`<h2>Удалить аккаунт?</h2><p>Будут удалены аккаунт ${esc(Acc.email)}, все проекты, версии и записи в облаке. Введите email, чтобы подтвердить.</p><input id="ac-del-email" autocomplete="off" autofocus><div class="row end"><button class="btn ghost" data-x>Отмена</button><button class="btn danger" data-ok>Удалить навсегда</button></div>`);
        m.querySelector('[data-x]').onclick = () => this.closeModal();
        m.querySelector('[data-ok]').onclick = async () => {
          if (m.querySelector('#ac-del-email').value.trim().toLowerCase() !== (Acc.email || '').toLowerCase()) return this.toast('Email не совпадает.', 'warn');
          try { await Acc.deleteAccount(); this.closeModal(); await Store.signedOut(true); this.st.project = null; this.toast('Аккаунт удалён.'); this.render(); }
          catch (err) { this.toast('Не удалось удалить аккаунт: ' + err.message, 'err'); }
        };
      };
    },
    authForm(main) {
      const f = this.st.auth || (this.st.auth = { tab: 'in', email: '', step: 'form', codeType: 'email' });
      const tabs = [['in', 'Вход'], ['up', 'Регистрация'], ['code', 'Вход по коду']];
      const local = Store.list().length;
      main.innerHTML = `<header class="page-head"><div><p class="eyebrow">Аккаунт</p><h1>Войдите, чтобы работать на всех устройствах</h1></div></header>
        <div class="auth card">
          <div class="seg" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${f.tab === k}">${l}</button>`).join('')}</div>
          ${f.step === 'code' ? `
            <form id="au-code" class="stack"><p class="small">Мы отправили код на <b>${esc(f.email)}</b>. Введите его из письма.</p>
              <label for="au-otp">Код<input id="au-otp" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required autofocus></label>
              <button class="btn lg">Подтвердить</button>
              <button type="button" class="link" id="au-back">Изменить email</button></form>` : `
            <form id="au-form" class="stack">
              <label for="au-email">Email<input id="au-email" type="email" autocomplete="email" value="${esc(f.email)}" required></label>
              ${f.tab !== 'code' ? `<label for="au-pw">Пароль<input id="au-pw" type="password" minlength="6" autocomplete="${f.tab === 'up' ? 'new-password' : 'current-password'}" required></label>` : '<p class="muted small">Пришлём одноразовый код на почту. Так же можно войти, если забыли пароль: после входа задайте новый в аккаунте.</p>'}
              <button class="btn lg">${f.tab === 'in' ? 'Войти' : f.tab === 'up' ? 'Создать аккаунт' : 'Получить код'}</button>
            </form>`}
          <p class="muted small">${local ? `На этом устройстве ${local} ${plural(local, 'проект', 'проекта', 'проектов')}: после входа они добавятся в аккаунт.` : 'Проекты, записи и настройки будут доступны на сайте, в настольном и мобильном приложении.'}</p>
        </div>`;
      $$('[data-tab]').forEach((b) => (b.onclick = () => { f.tab = b.dataset.tab; f.step = 'form'; this.render(); }));
      const busy = (btn, on) => { if (btn) { btn.disabled = on; } };
      const form = $('#au-form');
      if (form) form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button'); busy(btn, true);
        f.email = $('#au-email').value.trim();
        try {
          if (f.tab === 'in') { await Acc.signIn(f.email, $('#au-pw').value); this.afterLogin(); }
          else if (f.tab === 'up') { const r = await Acc.signUp(f.email, $('#au-pw').value); if (r.needsCode) { f.step = 'code'; f.codeType = 'signup'; this.render(); } else this.afterLogin(); }
          else { await Acc.sendCode(f.email); f.step = 'code'; f.codeType = 'email'; this.render(); }
        } catch (err) { this.toast(err.message, 'err'); busy(btn, false); }
      };
      const cf = $('#au-code');
      if (cf) {
        cf.onsubmit = async (e) => {
          e.preventDefault(); const btn = cf.querySelector('button'); busy(btn, true);
          try { await Acc.verifyCode(f.email, $('#au-otp').value, f.codeType); this.afterLogin(); } catch (err) { this.toast(err.message, 'err'); busy(btn, false); }
        };
        $('#au-back').onclick = () => { f.step = 'form'; this.render(); };
      }
    },
    afterLogin() { this.st.auth = null; this.toast('Вы вошли. Проекты синхронизируются.'); this.go('home'); },

    /* ---------- project from a generated progression ---------- */
    async projectFromProgression(g) {
      const T = root.GTSTheory;
      const tuning = E.TUNINGS.guitar['Standard E'];
      const notes = [];
      let id = 0;
      g.chords.forEach((c, bar) => {
        const v = T.voicings(c.name)[0];
        if (!v) return;
        const played = v.frets.map((f, s) => ({ s, f })).filter((x) => x.f >= 0);
        const add = (pos, len, list) => list.forEach((x) => notes.push({ id: 'g' + (id++), pos, len, s: x.s, f: x.f, midi: tuning[x.s] + x.f, conf: 1, t: 0, d: 0, edited: true }));
        const b0 = bar * 16;
        if (g.feel === 'arp') {
          const seq = played.concat(played.slice(1, -1).reverse());
          for (let k = 0; k < 8; k++) add(b0 + k * 2, 2, [seq[k % seq.length]]);
        } else if (g.feel === 'pad') add(b0, 16, played);
        else { [[0, 4], [4, 2], [6, 4], [10, 2], [12, 4]].forEach(([p, l], k) => add(b0 + p, l, k % 2 ? played.slice(-4) : played)); }
      });
      const s16 = 60 / g.bpm / 4;
      notes.forEach((n) => { n.t = +(n.pos * s16).toFixed(3); n.d = +(n.len * s16).toFixed(3); });
      const p = {
        id: uid(), title: g.mood.ru + ' · ' + g.chords.map((c) => c.name).join(' – '), createdAt: Date.now(), favorite: false, collectionId: null, tags: ['генератор'],
        status: 'completed', mode: 'generated', instrument: 'guitar', audio: null,
        meta: { bpm: g.bpm, key: g.key, timeSig: [4, 4], offset: 0, bpmConfidence: 1, keyConfidence: 1 },
        tracks: [{ id: 'trk_gen', type: 'guitar', name: 'Гитара', tuning: tuning.slice(), capo: 0, maxFret: 22, notes }],
        chords: g.chords.map((c, i) => ({ pos: i * 16, len: 16, name: c.name, conf: 1 })),
        lyrics: [], model: { name: 'Генератор прогрессий', version: '1.0', components: { harmony: 'шаблоны ступеней по настроению', fretboard: 'поиск аппликатур по грифу' }, params: { mood: g.mood.id, key: g.key, feel: g.feel }, ranAt: new Date().toISOString() }, baseRev: 0
      };
      p.stats = projStats(p);
      await Store.save(p, { force: true });
      await Store.addVersion(p, 'Сгенерировано');
      this.st.project = null;
      this.toast('Проект создан: аккорды и табулатура в редакторе.');
      this.openEditor(p.id);
    },

    /* ---------- demo ---------- */
    async seedDemo() {
      if (this._seeding) return;
      this._seeding = true;
      try {
        const sr = 22050, bpm = 96, s16 = 60 / bpm / 4, start = 0.35;
        const seq = [];
        const arp = [[45, 57, 60, 64], [41, 57, 60, 65], [48, 55, 60, 64], [43, 55, 59, 62]];
        for (let rep = 0; rep < 2; rep++) arp.forEach((ch, b) => { for (let i = 0; i < 8; i++) seq.push([(rep * 4 + b) * 16 + i * 2, ch[[0, 1, 2, 3, 2, 1, 2, 3][i]], 2]); });
        const lick = [[0, 69, 2], [2, 72, 2], [4, 74, 2], [6, 76, 3], [9, 74, 1], [10, 72, 2], [12, 69, 4], [16, 67, 2], [18, 69, 2], [20, 72, 2], [22, 69, 2], [24, 67, 2], [26, 64, 2], [28, 62, 2], [30, 64, 2], [32, 57, 8]];
        lick.forEach(([p, m, l]) => seq.push([128 + p, m, l]));
        const dur = start + (128 + 48) * s16 + 1.5, n = Math.floor(dur * sr), x = new Float32Array(n);
        seq.forEach(([p, m, l]) => { const y = E.pluck(m, sr, l * s16 + 0.06, { decay: 0.9972 }); const o = Math.floor((start + p * s16) * sr); for (let i = 0; i < y.length && o + i < n; i++) x[o + i] += y[i] * 0.45; });
        const wav = encodeWav(x, sr);
        const file = new File([wav], 'Демо — Am F C G и соло.wav', { type: 'audio/wav' });
        const buf = await Au.decode(wav.slice(0));
        const mono = await Au.toMono22k(buf);
        const res = await this.runEngine(mono, { mode: 'isolated', instrument: 'guitar', capo: 0, maxFret: 22 }, () => {}, {});
        if (Store.list().length) return;
        const p = { id: uid(), title: 'Пример: Am–F–C–G и соло', createdAt: Date.now(), favorite: true, collectionId: null, tags: ['пример'], demo: true, status: 'completed', mode: 'isolated', instrument: 'guitar',
          audio: { name: file.name, format: 'wav', size: wav.byteLength, duration: +buf.duration.toFixed(2), sampleRate: sr, channels: 1 },
          meta: res.meta, tracks: res.tracks, chords: res.chords, model: res.model, baseRev: 0,
          lyrics: [{ t: start, text: 'Вступление: арпеджио Am — F — C — G' }, { t: +(start + 128 * s16).toFixed(2), text: 'Соло в ля-миноре' }] };
        p.stats = projStats(p);
        await Store.putAudio(p.id, { name: file.name, type: 'audio/wav', bytes: wav });
        this.st.audioCache = { [p.id]: { buf, mono, stems: null } };
        await Store.save(p, { force: true });
        await Store.addVersion(p, 'Результат AI');
        if (['home', 'library'].includes(this.st.route)) this.render();
      } catch (e) { /* demo is optional */ }
      this._seeding = false;
    }
  };

  /* ================= helpers ================= */
  function syncInfo() {
    if (Store.mode === 'account') {
      const s = Acc.status;
      if (s === 'syncing') return { cls: 'busy', text: 'Синхронизация…', short: 'синхр.', title: Acc.email };
      if (s === 'synced') return { cls: 'cloud', text: 'Синхронизировано', short: (Acc.email || '').split('@')[0].slice(0, 16), title: Acc.email + ': все изменения в облаке' };
      if (s === 'offline') return { cls: 'local', text: 'Нет сети: изменения отправятся позже', short: 'офлайн', title: Acc.lastError || '' };
      return { cls: 'err', text: 'Ошибка синхронизации', short: 'ошибка', title: Acc.lastError || '' };
    }
    if (Store.mode === 'cloud') return { cls: 'cloud', text: 'Облачная библиотека', short: '', title: 'Проекты синхронизируются между вашими устройствами через Claude' };
    if (Store.mode === 'local') return { cls: 'local', text: Acc.configured ? 'Не выполнен вход' : 'Только на этом устройстве', short: '', title: Acc.configured ? 'Войдите, чтобы синхронизировать проекты между устройствами' : '' };
    return { cls: 'local', text: 'Без сохранения', short: '', title: '' };
  }
  function projStats(p) {
    const all = p.tracks.flatMap((t) => t.notes);
    const thr = App.settings().lowConf;
    return { notes: all.length, lowConf: all.filter((n) => n.conf < thr && !n.edited).length, edits: all.filter((n) => n.edited).length, avgConf: all.length ? +(all.reduce((s, n) => s + n.conf, 0) / all.length).toFixed(2) : 0 };
  }
  function classify(mono) {
    const sr = 22050, n = Math.min(mono.length, sr * 60);
    const seg = mono.subarray(0, n);
    const low = E.biquad(E.biquad(seg, 'lp', 150, 0.707, sr), 'lp', 150, 0.707, sr);
    const high = E.biquad(E.biquad(seg, 'hp', 4500, 0.707, sr), 'hp', 4500, 0.707, sr);
    let et = 0, el = 0, eh = 0;
    for (let i = 0; i < n; i++) { et += seg[i] * seg[i]; el += low[i] * low[i]; eh += high[i] * high[i]; }
    // percussiveness: share of short-window energy jumps in the high band
    let jumps = 0, frames = 0, prev = 0;
    for (let i = 0; i + 512 < n; i += 512) { let e = 0; for (let j = 0; j < 512; j++) e += high[i + j] * high[i + j]; if (e > prev * 4 && e > eh / (n / 512) * 0.5) jumps++; prev = e; frames++; }
    const r = { low: el / (et || 1), high: eh / (et || 1), perc: jumps / Math.max(1, frames) * 10 };
    r.mix = (r.low > 0.18 && r.high > 0.008) || (r.perc > 0.6 && r.high > 0.01);
    return r;
  }
  function weightsHtml(w) {
    const lab = { w1: ['w₁ · D', 'перемещение руки по грифу'], w2: ['w₂ · S', 'смена струн'], w3: ['w₃ · F', 'растяжка пальцев'], w4: ['w₄ · P', 'высокие позиции и техника исполнения'] };
    return `<div class="weights">${Object.keys(lab).map((k) => `<label><span><b>${lab[k][0]}</b> ${lab[k][1]}</span><input type="range" min="0" max="3" step="0.1" value="${w[k]}" data-w="${k}"><output>${(+w[k]).toFixed(1)}</output></label>`).join('')}</div>`;
  }
  function bindWeights(el, onChange) { $$('[data-w]', el).forEach((r) => { r.addEventListener('input', () => (r.nextElementSibling.textContent = (+r.value).toFixed(1))); if (onChange) r.addEventListener('change', onChange); }); }
  function readWeights(el) { const w = {}; $$('[data-w]', el).forEach((r) => (w[r.dataset.w] = +r.value)); return w; }
  function safeName(s) { return (s || 'project').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'project'; }
  function waveIcon() { return '<svg viewBox="0 0 48 32" width="48" height="32" aria-hidden="true"><path d="M2 16h4l3-9 4 18 4-24 4 28 4-20 4 14 3-7 3 4h11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
  function encodeWav(x, sr) {
    const n = x.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 32767, true);
    return buf;
  }
  /* minimal ZIP (store) */
  const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function makeZip(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let off = 0;
    const d = new Date(), dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    for (const f of files) {
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
      const name = enc.encode(f.name), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, tm, true); h.setUint16(12, dt, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, tm, true); c.setUint16(14, dt, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    }
    const cs = central.reduce((s, b) => s + b.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
    const all = parts.concat(central, [new Uint8Array(e.buffer)]);
    const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0));
    let p = 0; for (const b of all) { out.set(b, p); p += b.length; }
    return out;
  }
  /* PDF: tab pages rendered on canvas (Cyrillic-safe), assembled with jsPDF */
  async function buildPdf(p) {
    if (!root.jspdf) throw new Error('модуль PDF (jsPDF) не загрузился');
    try { await document.fonts.ready; } catch (e) { /* ignore */ }
    const W = 1240, H = 1754, M = 96;
    const pdf = new root.jspdf.jsPDF({ unit: 'pt', format: 'a4', compress: true });
    let cv, c, y, page = 0;
    const body = getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim();
    const mono = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim();
    const newPage = () => {
      if (cv) { if (page > 1) pdf.addPage(); pdf.addImage(cv.toDataURL('image/png'), 'PNG', 0, 0, 595.28, 841.89, undefined, 'FAST'); }
      cv = document.createElement('canvas'); cv.width = W; cv.height = H; c = cv.getContext('2d');
      c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); page++;
      c.fillStyle = '#8a8f99'; c.font = '20px ' + body; c.textAlign = 'right';
      c.fillText(p.title + ' · стр. ' + page, W - M, H - 50); c.textAlign = 'left';
      y = M;
    };
    newPage();
    c.fillStyle = '#16181d'; c.font = '600 46px ' + body; c.fillText(p.title, M, y + 30); y += 74;
    c.font = '24px ' + body; c.fillStyle = '#4a4f59';
    c.fillText(`${Math.round(p.meta.bpm)} BPM · тональность ${p.meta.key} · размер ${p.meta.timeSig.join('/')} · AI Guitar Tab Studio`, M, y); y += 50;
    const L = X.barLen(p.meta.timeSig);
    const dense = p.tracks.some((t) => t.notes.some((n) => n.len === 1));
    const perLine = dense ? 3 : 4, slot = (W - 2 * M - 60) / (perLine * L);
    for (const tr of p.tracks) {
      const S = tr.tuning.length, gap = 26;
      const sysH = 40 + (S - 1) * gap + 50;
      if (y + 60 + sysH > H - M) newPage();
      c.fillStyle = '#16181d'; c.font = '600 28px ' + body;
      c.fillText(`${tr.name} — строй ${tr.tuning.map(E.midiName).join(' ')}${tr.capo ? ', каподастр ' + tr.capo : ''}`, M, y + 10); y += 40;
      const ms = X.buildMeasures(p, tr);
      for (let i = 0; i < ms.length; i += perLine) {
        if (y + sysH > H - M) newPage();
        const x0 = M + 60, top = y + 34;
        c.strokeStyle = '#9aa0ab'; c.lineWidth = 1.4;
        for (let s = 0; s < S; s++) { const yy = top + (S - 1 - s) * gap; c.beginPath(); c.moveTo(x0, yy); c.lineTo(x0 + perLine * L * slot, yy); c.stroke(); }
        c.fillStyle = '#4a4f59'; c.font = '600 20px ' + mono;
        tr.tuning.forEach((m, s) => c.fillText(E.NOTE_NAMES[m % 12], M + 18, top + (S - 1 - s) * gap + 7));
        ms.slice(i, i + perLine).forEach((m, k) => {
          const bx = x0 + k * L * slot;
          c.strokeStyle = '#16181d'; c.lineWidth = 2; c.beginPath(); c.moveTo(bx, top); c.lineTo(bx, top + (S - 1) * gap); c.stroke();
          c.fillStyle = '#8a8f99'; c.font = '16px ' + mono; c.fillText(String(m.index + 1), bx + 4, top - 8 - 4);
          m.beats.forEach((bt) => {
            const x = bx + (bt.pos - m.start) * slot + 8;
            const ch = tr === p.tracks[0] && (p.chords || []).find((q) => q.pos === bt.pos);
            if (ch) { c.fillStyle = '#b06a0b'; c.font = '600 22px ' + body; c.fillText(ch.name, x, y + 4); }
            if (!bt.notes) return;
            c.font = '600 21px ' + mono;
            bt.notes.forEach((n) => {
              const yy = top + (S - 1 - n.s) * gap, t = String(n.f), tw = c.measureText(t).width;
              c.fillStyle = '#fff'; c.fillRect(x - 3, yy - 12, tw + 6, 24);
              c.fillStyle = '#16181d'; c.fillText(t, x, yy + 7);
              const te = n.tech || {};
              c.font = '15px ' + mono; c.fillStyle = '#b06a0b';
              const mk = (te.hammer ? 'h' : te.pull ? 'p' : te.slide ? '/' : '') + (te.bend ? 'b' : '') + (te.vibrato ? '~' : '');
              if (mk) c.fillText(mk, x + tw + 2, yy - 6);
              c.font = '600 21px ' + mono;
            });
            c.strokeStyle = '#4a4f59'; c.lineWidth = 3;
            const yd = top + (S - 1) * gap + 22;
            c.beginPath(); c.moveTo(x, yd); c.lineTo(x + Math.max(6, bt.len * slot - 10), yd); c.stroke();
          });
        });
        const ex = x0 + Math.min(perLine, ms.length - i) * L * slot;
        c.strokeStyle = '#16181d'; c.lineWidth = 2; c.beginPath(); c.moveTo(ex, top); c.lineTo(ex, top + (S - 1) * gap); c.stroke();
        y += sysH;
      }
      y += 20;
    }
    if (p.lyrics && p.lyrics.length) {
      if (y + 120 > H - M) newPage();
      c.fillStyle = '#16181d'; c.font = '600 28px ' + body; c.fillText('Текст', M, y + 20); y += 56;
      c.font = '24px ' + body;
      for (const l of p.lyrics) { if (y > H - M) { newPage(); c.font = '24px ' + body; } c.fillStyle = '#8a8f99'; c.fillText(fmt(l.t), M, y); c.fillStyle = '#16181d'; c.fillText(l.text, M + 110, y); y += 36; }
    }
    if (page === 1) pdf.addImage(cv.toDataURL('image/png'), 'PNG', 0, 0, 595.28, 841.89, undefined, 'FAST');
    else { pdf.addPage(); pdf.addImage(cv.toDataURL('image/png'), 'PNG', 0, 0, 595.28, 841.89, undefined, 'FAST'); }
    return pdf.output('arraybuffer');
  }

  root.App = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.init());
  else App.init();
})(window);
