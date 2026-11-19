/* Tab Editor: split view (аудиоволна + табулатура), курсор, редактирование, аккорды, текст, микшер, ноты, история */
(function (root) {
  'use strict';
  const E = () => root.GTSEngine, X = () => root.GTSExport, A = () => root.GTSAudio, S = () => root.GTSStore;
  const DURS = [1, 2, 3, 4, 6, 8, 12, 16];
  const DUR_LABEL = { 1: '1/16', 2: '1/8', 3: '1/8 с точкой', 4: '1/4', 6: '1/4 с точкой', 8: '1/2', 12: '1/2 с точкой', 16: 'целая' };
  const TECHS = [['hammer', 'h', 'Хаммер-он'], ['pull', 'p', 'Пулл-офф'], ['slide', 's', 'Слайд'], ['bend', 'b', 'Бенд'], ['vibrato', 'v', 'Вибрато'], ['mute', 'm', 'Глушение ладонью']];
  const LEFT = 46, CH_H = 26, STR_GAP = 21, DUR_H = 22;
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const Ed = {
    p: null, ti: 0, selId: null, caret: { pos: 0, s: 0 }, zoom: 1, undo: [], redo: [], loopOn: false, loop: null, follow: true,
    mono: null, scrollX: 0, typed: '', typedAt: 0, lastLen: 2, panel: 'chords', dpr: 1, mounted: false, notationDirty: true,

    get track() { return this.p.tracks[this.ti]; },
    get S() { return this.track.tuning.length; },
    get s16() { return 60 / this.p.meta.bpm / 4; },
    get slotW() { return Math.round(17 * this.zoom); },
    timeOf(pos) { return (this.p.meta.offset || 0) + pos * this.s16; },
    posOf(t) { return (t - (this.p.meta.offset || 0)) / this.s16; },
    barLen() { return X().barLen(this.p.meta.timeSig); },
    totalSlots() {
      const L = this.barLen();
      let mx = 0;
      this.p.tracks.forEach((t) => t.notes.forEach((n) => (mx = Math.max(mx, n.pos + n.len))));
      (this.p.chords || []).forEach((c) => (mx = Math.max(mx, c.pos + c.len)));
      const dur = this.p.audio && this.p.audio.duration ? Math.ceil(this.posOf(this.p.audio.duration)) : 0;
      return (Math.ceil(Math.max(mx, dur, L * 4) / L) + 1) * L;
    },

    /* ---------- mount ---------- */
    mount(container, project, mono) {
      this.p = project; this.mono = mono; this.ti = Math.min(this.ti, project.tracks.length - 1);
      if (this.ti < 0) this.ti = 0;
      this.undo = []; this.redo = []; this.selId = null; this.caret = { pos: 0, s: this.S - 1 }; this.notationDirty = true;
      this.loop = null; this.loopOn = false;
      container.innerHTML = this.template();
      this.el = container;
      this.scroll = container.querySelector('#tl-scroll');
      this.spacer = container.querySelector('#tl-spacer');
      this.wave = container.querySelector('#cv-wave');
      this.tab = container.querySelector('#cv-tab');
      this.bind();
      this.layout();
      this.renderPanels();
      this.renderInspector();
      this.syncTransport();
      A().getSynthNotes = () => this.synthNotes();
      this.mounted = true;
      this.draw();
      setTimeout(() => this.tab.focus({ preventScroll: true }), 50);
    },
    template() {
      const p = this.p, tr = this.track;
      const tunings = E().TUNINGS[tr.type] || E().TUNINGS.guitar;
      const tName = Object.keys(tunings).find((k) => tunings[k].join() === tr.tuning.join()) || 'Свой строй';
      return `
      <div class="ed-head">
        <div class="ed-title">
          <input id="ed-name" class="title-input" value="${esc(p.title)}" aria-label="Название проекта" maxlength="120">
          <div class="chips">
            <label class="chip" title="Темп, ударов в минуту">BPM <input id="ed-bpm" type="number" min="30" max="300" step="0.5" value="${p.meta.bpm}"></label>
            <label class="chip" title="Тональность: определена моделью, можно изменить">Тон. <select id="ed-key">${(root.GTSTheory ? root.GTSTheory.KEY_LIST : [p.meta.key]).concat(root.GTSTheory && root.GTSTheory.KEY_LIST.includes(p.meta.key) ? [] : [p.meta.key]).map((k) => `<option ${k === p.meta.key ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></label>
            <label class="chip">Размер <select id="ed-ts">${['4/4', '3/4', '6/8', '2/4', '5/4', '7/8'].map((v) => `<option ${p.meta.timeSig.join('/') === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
            <span class="chip" title="Строй: ${tr.tuning.map(E().midiName).join(' ')}">Строй <b>${esc(tName)}</b></span>
            <span class="chip">Каподастр <b>${tr.capo || 0}</b></span>
            <span class="chip mode-${p.mode}">${p.mode === 'mix' ? 'Полный микс' : p.mode === 'generated' ? 'Сгенерировано' : 'Изолированная запись'}</span>
          </div>
        </div>
        <div class="ed-actions">
          <button class="btn ghost" data-act="remap" title="Подобрать струны и лады заново">Пересчитать аппликатуру</button>
          <button class="btn ghost" data-act="version">Сохранить версию</button>
          <button class="btn" data-act="export">Экспорт</button>
        </div>
      </div>
      <div class="transport" role="toolbar" aria-label="Транспорт">
        <button class="tbtn play" data-act="play" id="tp-play" aria-label="Воспроизвести (пробел)">${icon('play')}</button>
        <button class="tbtn" data-act="stop" aria-label="В начало">${icon('stop')}</button>
        <button class="tbtn" data-act="loop" id="tp-loop" aria-pressed="false" title="Повтор выделенного участка (L)">${icon('loop')}</button>
        <span class="tp-time" id="tp-time">0:00.0</span>
        <label class="tp-rate"><span class="tp-rate-l">Скорость</span> <input id="tp-rate" type="range" min="0.5" max="1.25" step="0.05" value="1"><output id="tp-rate-o">100%</output></label>
        <span class="sep"></span>
        <div class="seg" role="tablist" aria-label="Дорожка">${p.tracks.map((t, i) => `<button role="tab" data-act="track" data-i="${i}" aria-selected="${i === this.ti}">${esc(t.name)} <small>${t.notes.length}</small></button>`).join('')}</div>
        <span class="sep"></span>
        <button class="tbtn" data-act="undo" id="tp-undo" title="Отменить (Ctrl+Z)">${icon('undo')}</button>
        <button class="tbtn" data-act="redo" id="tp-redo" title="Повторить (Ctrl+Shift+Z)">${icon('redo')}</button>
        <button class="tbtn" data-act="zoomout" title="Уменьшить масштаб">−</button>
        <button class="tbtn" data-act="zoomin" title="Увеличить масштаб">+</button>
        <label class="tp-follow"><input type="checkbox" id="tp-follow" checked> Следовать</label>
        <span class="lyric-now" id="lyric-now"></span>
      </div>
      <div class="timeline" id="timeline">
        <div class="tl-scroll" id="tl-scroll">
          <div class="tl-spacer" id="tl-spacer"></div>
          <div class="tl-sticky">
            <canvas id="cv-wave" aria-label="Аудиоволна: щелчок — перейти, протяжка — выбрать участок для повтора"></canvas>
            <canvas id="cv-tab" tabindex="0" aria-label="Табулатура. Стрелки — курсор, цифры — лад, Delete — удалить"></canvas>
          </div>
        </div>
      </div>
      <div class="ed-bottom">
        <section class="keypad" id="keypad" aria-label="Ввод ладов касанием">
          <div class="kp-grid">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => `<button data-kp="${d}" aria-label="Лад ${d}">${d}</button>`).join('')}
            <button data-kp="ArrowLeft" aria-label="Курсор влево">←</button><button data-kp="ArrowRight" aria-label="Курсор вправо">→</button></div>
          <div class="kp-grid kp2">
            <button data-kp="ArrowUp" aria-label="Курсор на струну выше">↑ стр.</button><button data-kp="ArrowDown" aria-label="Курсор на струну ниже">↓ стр.</button>
            <button data-kp="Shift+ArrowUp" aria-label="Перенести ноту на струну выше">⇡ ноту</button><button data-kp="Shift+ArrowDown" aria-label="Перенести ноту на струну ниже">⇣ ноту</button>
            <button data-kp="-" aria-label="Короче">− длит.</button><button data-kp="+" aria-label="Длиннее">+ длит.</button>
            <button data-kp="n" aria-label="Следующая сомнительная нота">? след.</button><button data-kp="Delete" class="kp-del" aria-label="Удалить ноту">Удалить</button>
          </div>
          <p class="muted small">Две цифры подряд — двузначный лад (например, 1 и 2 = 12). Касание ноты в табах проигрывает её.</p>
        </section>
        <section class="inspector" id="inspector" aria-label="Свойства ноты"></section>
        <section class="panels">
          <div class="ptabs" role="tablist">
            ${[['chords', 'Аккорды'], ['lyrics', 'Текст'], ['mixer', 'Микшер'], ['notation', 'Нотная запись'], ['history', 'История'], ['model', 'Модель и качество']].map(([k, l]) => `<button role="tab" data-act="panel" data-k="${k}" aria-selected="${this.panel === k}">${l}</button>`).join('')}
          </div>
          <div class="pbody" id="pbody"></div>
        </section>
      </div>`;
    },

    /* ---------- layout / drawing ---------- */
    layout() {
      if (!this.el) return;
      const w = this.scroll.clientWidth;
      this.dpr = Math.min(2, root.devicePixelRatio || 1);
      const th = CH_H + 14 + (this.S - 1) * STR_GAP + 14 + DUR_H;
      const wh = w < 600 ? 54 : 84;
      for (const [cv, h] of [[this.wave, wh], [this.tab, th]]) {
        cv.width = Math.round(w * this.dpr); cv.height = Math.round(h * this.dpr);
        cv.style.width = w + 'px'; cv.style.height = h + 'px';
      }
      this.spacer.style.width = (LEFT + this.totalSlots() * this.slotW + 60) + 'px';
      this.draw();
    },
    yStr(s) { return CH_H + 14 + (this.S - 1 - s) * STR_GAP; },
    draw() {
      if (!this.el || !this.p) return;
      this.scrollX = this.scroll.scrollLeft;
      this.drawWave(); this.drawTab();
    },
    xPos(pos) { return LEFT + pos * this.slotW - this.scrollX; },
    drawWave() {
      const cv = this.wave, c = cv.getContext('2d'), d = this.dpr;
      const W = cv.width / d, H = cv.height / d;
      c.setTransform(d, 0, 0, d, 0, 0);
      c.fillStyle = css('--wave-bg'); c.fillRect(0, 0, W, H);
      const mid = H / 2;
      const head = A().position();
      if (this.mono) {
        const sr = 22050, spp = this.s16 / this.slotW * sr;
        c.beginPath();
        for (let x = LEFT; x < W; x++) {
          const t = this.timeOf((x - LEFT + this.scrollX) / this.slotW);
          const i0 = Math.floor(t * sr), i1 = Math.floor(i0 + spp);
          if (i1 < 0 || i0 >= this.mono.length) continue;
          let mn = 0, mx = 0;
          const step = Math.max(1, Math.floor((i1 - i0) / 48));
          for (let i = Math.max(0, i0); i < Math.min(this.mono.length, i1); i += step) { const v = this.mono[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
          c.moveTo(x + 0.5, mid - mx * mid * 0.92); c.lineTo(x + 0.5, mid - mn * mid * 0.92 + 1);
        }
        c.strokeStyle = css('--wave'); c.lineWidth = 1; c.stroke();
        // played part tint
        const hx = this.xPos(this.posOf(head));
        if (hx > LEFT) { c.fillStyle = css('--wave-played'); c.fillRect(LEFT, 0, Math.min(W, hx) - LEFT, H); }
      } else {
        c.fillStyle = css('--muted'); c.font = '13px ' + css('--font-body');
        c.fillText(this.p.mode === 'generated' ? 'Проект из генератора прогрессий: звучит синтез табулатуры.' : 'Исходное аудио не сохранено на этом устройстве: доступен синтез табулатуры.', LEFT + 12, mid + 4);
      }
      this.drawGridLines(c, H, true);
      this.drawLoop(c, H);
      this.drawHead(c, H);
      c.fillStyle = css('--panel'); c.fillRect(0, 0, LEFT, H);
      c.fillStyle = css('--muted'); c.font = '600 10px ' + css('--font-body');
      c.fillText('АУДИО', 6, 14);
    },
    drawGridLines(c, H, faint) {
      const W = c.canvas.width / this.dpr, L = this.barLen();
      const p0 = Math.max(0, Math.floor(this.scrollX / this.slotW) - 1), p1 = p0 + Math.ceil(W / this.slotW) + 2;
      for (let p = p0; p <= p1; p++) {
        const x = Math.round(this.xPos(p)) + 0.5;
        if (x < LEFT) continue;
        if (p % L === 0) { c.strokeStyle = faint ? css('--grid-bar-faint') : css('--grid-bar'); c.lineWidth = 1; }
        else if (p % 4 === 0) { c.strokeStyle = css('--grid-beat'); c.lineWidth = 1; }
        else continue;
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
      }
    },
    drawLoop(c, H) {
      if (!this.loop) return;
      const a = this.xPos(this.posOf(this.loop[0])), b = this.xPos(this.posOf(this.loop[1]));
      c.fillStyle = this.loopOn ? css('--loop-on') : css('--loop-off');
      c.fillRect(Math.max(LEFT, a), 0, Math.max(0, b - Math.max(LEFT, a)), H);
    },
    drawHead(c, H) {
      const x = this.xPos(this.posOf(A().position()));
      if (x < LEFT) return;
      c.strokeStyle = css('--head'); c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
    },
    drawTab() {
      const cv = this.tab, c = cv.getContext('2d'), d = this.dpr;
      const W = cv.width / d, H = cv.height / d, L = this.barLen(), sw = this.slotW;
      c.setTransform(d, 0, 0, d, 0, 0);
      c.fillStyle = css('--tab-bg'); c.fillRect(0, 0, W, H);
      const p0 = Math.max(0, Math.floor(this.scrollX / sw) - 2), p1 = p0 + Math.ceil(W / sw) + 3;
      // chord lane
      c.fillStyle = css('--lane'); c.fillRect(0, 0, W, CH_H);
      this.drawGridLines(c, H, false);
      this.drawLoop(c, H);
      // bar numbers
      c.font = '600 10px ' + css('--font-mono'); c.fillStyle = css('--muted');
      for (let b = Math.floor(p0 / L); b * L <= p1; b++) { const x = this.xPos(b * L); if (x >= LEFT - 2) c.fillText(String(b + 1), x + 3, H - 4); }
      // chords
      c.font = '600 12px ' + css('--font-body');
      for (const ch of this.p.chords || []) {
        if (ch.pos + ch.len < p0 || ch.pos > p1) continue;
        const x = this.xPos(ch.pos);
        c.fillStyle = css('--chord-bg'); roundRect(c, Math.max(LEFT, x) + 1, 4, Math.max(0, Math.min(ch.len * sw, x + ch.len * sw - Math.max(LEFT, x)) - 3), CH_H - 8, 4); c.fill();
        if (x + 4 >= LEFT - 30) { c.fillStyle = ch.conf < 0.5 ? css('--warn') : css('--chord'); c.fillText(ch.name, Math.max(LEFT + 3, x + 5), 18); }
      }
      // strings
      for (let s = 0; s < this.S; s++) {
        const y = this.yStr(s) + 0.5;
        c.strokeStyle = css('--string'); c.lineWidth = s < 3 && this.track.type === 'guitar' ? 1.3 : 1;
        c.beginPath(); c.moveTo(LEFT, y); c.lineTo(W, y); c.stroke();
      }
      // duration lane
      const yDur = this.yStr(0) + 16;
      const thr = this.lowConf();
      const groups = new Map();
      c.font = '600 13px ' + css('--font-mono'); c.textBaseline = 'middle';
      for (const n of this.track.notes) {
        if (n.pos + n.len < p0 || n.pos > p1) continue;
        const x = this.xPos(n.pos), y = this.yStr(n.s);
        const label = String(n.f);
        const tw = c.measureText(label).width + 6;
        const sel = n.id === this.selId;
        const low = n.conf < thr && !n.edited;
        c.fillStyle = sel ? css('--accent') : low ? css('--low-bg') : css('--tab-bg');
        roundRect(c, x + 1, y - 8, tw, 16, 3); c.fill();
        if (low && !sel) { c.strokeStyle = css('--low'); c.setLineDash([2, 2]); c.lineWidth = 1; roundRect(c, x + 1.5, y - 7.5, tw - 1, 15, 3); c.stroke(); c.setLineDash([]); }
        c.fillStyle = sel ? css('--on-accent') : low ? css('--low') : n.edited ? css('--edited') : css('--text');
        c.fillText(label, x + 4, y + 1);
        const t = n.tech;
        if (t) {
          const mk = t.hammer ? 'h' : t.pull ? 'p' : t.slide ? '/' : '';
          c.font = '600 10px ' + css('--font-mono');
          c.fillStyle = css('--accent');
          if (mk) c.fillText(mk, x - 6, y - 8);
          if (t.bend) c.fillText('↑' + (t.bend === 1 ? 'full' : t.bend === 0.5 ? '½' : t.bend), x + tw + 1, y - 6);
          if (t.vibrato) c.fillText('~', x + tw + 1, y + 2);
          if (t.mute) c.fillText('PM', x, y - 14);
          c.font = '600 13px ' + css('--font-mono');
        }
        if (n.flag) { c.fillStyle = css('--low'); c.beginPath(); c.arc(x + tw + 3, y - 7, 2.5, 0, 7); c.fill(); }
        const g = groups.get(n.pos);
        if (!g || g.len < n.len) groups.set(n.pos, { len: n.len, sel: sel || (g && g.sel) });
        else if (sel) g.sel = true;
      }
      c.textBaseline = 'alphabetic';
      groups.forEach((g, pos) => {
        const x = this.xPos(pos);
        c.strokeStyle = g.sel ? css('--accent') : css('--dur'); c.lineWidth = 3; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x + 4, yDur); c.lineTo(x + Math.max(5, g.len * sw - 4), yDur); c.stroke();
      });
      c.lineCap = 'butt';
      // caret
      if (document.activeElement === this.tab || !this.selId) {
        const x = this.xPos(this.caret.pos), y = this.yStr(this.caret.s);
        c.strokeStyle = css('--caret'); c.lineWidth = 1.5;
        roundRect(c, x + 0.5, y - 9.5, Math.max(sw, 18) - 1, 19, 3); c.stroke();
      }
      this.drawHead(c, H);
      // sticky string labels
      c.fillStyle = css('--panel'); c.fillRect(0, 0, LEFT, H);
      c.font = '600 12px ' + css('--font-mono'); c.fillStyle = css('--muted'); c.textBaseline = 'middle';
      this.track.tuning.forEach((m, s) => {
        let nm = E().NOTE_NAMES[m % 12];
        if (s === this.S - 1 && nm === 'E' && this.track.type === 'guitar') nm = 'e';
        c.fillText(nm, 14, this.yStr(s) + 1);
      });
      c.textBaseline = 'alphabetic';
      c.font = '600 10px ' + css('--font-body'); c.fillText('АККОРД', 4, 17);
    },
    lowConf() { return (root.App && root.App.settings().lowConf) || 0.5; },

    /* ---------- playback ---------- */
    synthNotes() {
      const out = [];
      this.p.tracks.forEach((t, i) => {
        if (t.muted) return;
        t.notes.forEach((n) => out.push({ t: this.timeOf(n.pos), d: n.len * this.s16, midi: n.midi + (n.tech && n.tech.bend ? 0 : 0) }));
      });
      return out.sort((a, b) => a.t - b.t);
    },
    togglePlay() {
      const au = A();
      try { au.ensure(); } catch (e) { root.App.toast(e.message, 'err'); return; }
      if (au.playing) { au.pause(); }
      else {
        let from = au.from;
        if (this.loopOn && this.loop && (from < this.loop[0] || from >= this.loop[1])) from = this.loop[0];
        if (!this.loopOn && from >= this.timeOf(this.totalSlots()) - 0.1) from = 0;
        au.play(from, { rate: +this.el.querySelector('#tp-rate').value, loop: this.loopOn ? this.loop : null });
        this.tick();
      }
      this.syncTransport();
    },
    tick() {
      const au = A();
      if (!this.el || !document.body.contains(this.el)) return;
      if (au.playing) {
        let pos = au.position();
        if (au.until !== Infinity && pos >= au.until) {
          if (this.loopOn && this.loop) { au.play(this.loop[0], { rate: au.rate, loop: this.loop }); pos = this.loop[0]; }
          else { au.stop(); au.from = Math.min(pos, au.until); this.syncTransport(); }
        } else if (pos > this.timeOf(this.totalSlots())) { au.stop(); au.from = 0; this.syncTransport(); }
        if (this.follow) {
          const x = LEFT + this.posOf(pos) * this.slotW;
          const w = this.scroll.clientWidth;
          if (x - this.scroll.scrollLeft > w * 0.8 || x < this.scroll.scrollLeft + LEFT) this.scroll.scrollLeft = Math.max(0, x - w * 0.25);
        }
        this.updateTime(pos);
        this.draw();
        requestAnimationFrame(() => this.tick());
      } else { this.updateTime(au.from); this.draw(); }
    },
    updateTime(t) {
      const el = this.el.querySelector('#tp-time');
      if (el) el.textContent = fmt(t) + ' · такт ' + (Math.floor(this.posOf(t) / this.barLen()) + 1);
      const ly = (this.p.lyrics || []).filter((l) => l.t <= t + 0.05).pop();
      const ln = this.el.querySelector('#lyric-now');
      if (ln) ln.textContent = ly ? ly.text : '';
      const rows = this.el.querySelectorAll('.ly-row');
      rows.forEach((r) => r.classList.toggle('now', ly && r.dataset.t == String(ly.t)));
    },
    syncTransport() {
      if (!this.el) return;
      const au = A();
      const pb = this.el.querySelector('#tp-play');
      pb.innerHTML = icon(au.playing ? 'pause' : 'play');
      pb.setAttribute('aria-label', au.playing ? 'Пауза (пробел)' : 'Воспроизвести (пробел)');
      const lb = this.el.querySelector('#tp-loop');
      lb.setAttribute('aria-pressed', String(this.loopOn)); lb.classList.toggle('on', this.loopOn);
      this.el.querySelector('#tp-undo').disabled = !this.undo.length;
      this.el.querySelector('#tp-redo').disabled = !this.redo.length;
    },

    /* ---------- editing core ---------- */
    snapshot() { return JSON.stringify({ tracks: this.p.tracks.map((t) => ({ notes: t.notes, tuning: t.tuning, capo: t.capo })), chords: this.p.chords, lyrics: this.p.lyrics, meta: this.p.meta }); },
    restore(json) {
      const o = JSON.parse(json);
      o.tracks.forEach((t, i) => Object.assign(this.p.tracks[i], t));
      this.p.chords = o.chords; this.p.lyrics = o.lyrics; this.p.meta = o.meta;
    },
    mutate(fn, opts) {
      this.undo.push(this.snapshot());
      if (this.undo.length > 100) this.undo.shift();
      this.redo = [];
      fn();
      this.track.notes.sort((a, b) => a.pos - b.pos || a.s - b.s);
      this.notationDirty = true;
      root.App.markDirty(opts && opts.edits);
      this.spacer.style.width = (LEFT + this.totalSlots() * this.slotW + 60) + 'px';
      this.syncTransport();
      this.renderInspector();
      if (!opts || !opts.keepPanels) this.renderPanels();
      this.draw();
    },
    doUndo() { if (!this.undo.length) return; this.redo.push(this.snapshot()); this.restore(this.undo.pop()); this.after(); },
    doRedo() { if (!this.redo.length) return; this.undo.push(this.snapshot()); this.restore(this.redo.pop()); this.after(); },
    after() { this.notationDirty = true; root.App.markDirty(); if (!this.selNote()) this.selId = null; this.syncTransport(); this.renderInspector(); this.renderPanels(); this.layout(); },
    selNote() { return this.track.notes.find((n) => n.id === this.selId) || null; },
    noteAt(pos, s) { return this.track.notes.find((n) => n.s === s && pos >= n.pos && pos < n.pos + Math.max(1, Math.min(n.len, 2))) || null; },
    midiOf(s, f) { return this.track.tuning[s] + (this.track.capo || 0) + f; },
    maxFret() { return (this.track.maxFret || 22) - (this.track.capo || 0); },
    newId() { return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
    setFret(f) {
      const mf = this.maxFret();
      if (f > mf) { root.App.toast('Лад ' + f + ' вне грифа (максимум ' + mf + ').', 'warn'); return; }
      const ex = this.noteAt(this.caret.pos, this.caret.s);
      this.mutate(() => {
        if (ex && ex.pos === this.caret.pos) { ex.f = f; ex.midi = this.midiOf(ex.s, f); ex.edited = true; ex.conf = Math.max(ex.conf, 1); this.selId = ex.id; }
        else {
          const n = { id: this.newId(), pos: this.caret.pos, len: this.lastLen, midi: this.midiOf(this.caret.s, f), s: this.caret.s, f, conf: 1, t: this.timeOf(this.caret.pos), d: this.lastLen * this.s16, edited: true };
          this.track.notes = this.track.notes.filter((x) => !(x.pos === n.pos && x.s === n.s));
          this.track.notes.push(n); this.selId = n.id;
        }
      }, { edits: 1 });
      const n = this.selNote(); if (n) this.preview(n);
    },
    moveString(dir) {
      const n = this.selNote(); if (!n) return;
      const ns = n.s + dir;
      if (ns < 0 || ns >= this.S) return;
      const f = n.midi - (this.track.tuning[ns] + (this.track.capo || 0));
      if (f < 0 || f > this.maxFret()) { root.App.toast('На этой струне ' + E().midiName(n.midi) + ' не взять: нужен лад ' + f + '.', 'warn'); return; }
      if (this.track.notes.some((x) => x !== n && x.pos === n.pos && x.s === ns)) { root.App.toast('На этой струне в этой позиции уже есть нота.', 'warn'); return; }
      this.mutate(() => { n.s = ns; n.f = f; n.edited = true; this.caret = { pos: n.pos, s: ns }; }, { edits: 1 });
    },
    shiftPitch(dir) {
      const n = this.selNote(); if (!n) return;
      const f = n.f + dir;
      if (f < 0 || f > this.maxFret()) return;
      this.mutate(() => { n.f = f; n.midi = this.midiOf(n.s, f); n.edited = true; }, { edits: 1 });
      this.preview(n);
    },
    setLen(len) { const n = this.selNote(); if (!n) return; this.lastLen = len; this.mutate(() => { n.len = len; n.edited = true; }, { edits: 1 }); },
    stepLen(dir) {
      const n = this.selNote(); if (!n) return;
      const plain = [1, 2, 4, 8, 16];
      let i = plain.findIndex((d) => d >= n.len);
      if (i < 0) i = plain.length - 1;
      const nl = plain[Math.max(0, Math.min(plain.length - 1, i + dir))];
      this.setLen(nl);
    },
    toggleDot() { const n = this.selNote(); if (!n) return; const m = { 2: 3, 3: 2, 4: 6, 6: 4, 8: 12, 12: 8 }; if (m[n.len]) this.setLen(m[n.len]); },
    moveNote(dPos) {
      const n = this.selNote(); if (!n) return;
      const np = n.pos + dPos;
      if (np < 0 || this.track.notes.some((x) => x !== n && x.pos === np && x.s === n.s)) return;
      this.mutate(() => { n.pos = np; n.edited = true; this.caret.pos = np; }, { edits: 1 });
    },
    toggleTech(k) {
      const n = this.selNote(); if (!n) return;
      this.mutate(() => {
        n.tech = Object.assign({}, n.tech);
        if (k === 'bend') n.tech.bend = n.tech.bend ? (n.tech.bend === 0.5 ? 1 : n.tech.bend === 1 ? 2 : 0) || undefined : 0.5;
        else n.tech[k] = !n.tech[k] || undefined;
        if (k === 'hammer' && n.tech.hammer) { delete n.tech.pull; delete n.tech.slide; }
        if (k === 'pull' && n.tech.pull) { delete n.tech.hammer; delete n.tech.slide; }
        if (k === 'slide' && n.tech.slide) { delete n.tech.hammer; delete n.tech.pull; }
        Object.keys(n.tech).forEach((x) => n.tech[x] === undefined && delete n.tech[x]);
        if (!Object.keys(n.tech).length) delete n.tech;
        n.edited = true;
      }, { edits: 1 });
    },
    deleteSel() {
      const n = this.selNote();
      if (!n) { const ex = this.noteAt(this.caret.pos, this.caret.s); if (!ex) return; this.selId = ex.id; return this.deleteSel(); }
      const idx = this.track.notes.indexOf(n);
      this.mutate(() => { this.track.notes.splice(idx, 1); this.selId = null; }, { edits: 1 });
    },
    flagSel() { const n = this.selNote(); if (!n) return; this.mutate(() => { n.flag = !n.flag || undefined; if (!n.flag) delete n.flag; }); root.App.toast(n.flag ? 'Нота отмечена как ошибка распознавания.' : 'Отметка снята.'); },
    nextLow(dir) {
      const thr = this.lowConf();
      const list = this.track.notes.filter((n) => n.conf < thr && !n.edited);
      if (!list.length) { root.App.toast('Сомнительных нот не осталось.'); return; }
      const cur = this.selNote();
      let k = cur ? list.findIndex((n) => n.pos > cur.pos || (n.pos === cur.pos && n.s > cur.s)) : 0;
      if (dir < 0) { k = cur ? list.map((n) => n.pos < cur.pos).lastIndexOf(true) : list.length - 1; }
      if (k < 0) k = dir < 0 ? list.length - 1 : 0;
      this.select(list[k], true);
    },
    acceptSel() { const n = this.selNote(); if (!n) return; this.mutate(() => { n.edited = true; }, { edits: 0 }); this.nextLow(1); },
    select(n, play) {
      this.selId = n ? n.id : null;
      if (n) { this.caret = { pos: n.pos, s: n.s }; this.ensureVisible(n.pos); if (play) this.preview(n); }
      this.renderInspector(); this.draw();
    },
    ensureVisible(pos) {
      const x = LEFT + pos * this.slotW, w = this.scroll.clientWidth;
      if (x < this.scroll.scrollLeft + LEFT + 10 || x > this.scroll.scrollLeft + w - 40) this.scroll.scrollLeft = Math.max(0, x - w / 3);
    },
    preview(n) {
      try { A().playSegment(n.t != null && !n.edited ? n.t : this.timeOf(n.pos), n.edited ? n.len * this.s16 : (n.d || n.len * this.s16), n.midi); }
      catch (e) { /* audio not available */ }
      this.syncTransport();
    },

    /* ---------- events ---------- */
    bind() {
      const el = this.el;
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b || !el.contains(b)) return;
        const act = b.dataset.act;
        const h = this.actions[act];
        if (h) h.call(this, b, e);
      });
      this.scroll.addEventListener('scroll', () => this.draw(), { passive: true });
      this._ro = new ResizeObserver(() => this.layout());
      this._ro.observe(this.scroll);
      el.querySelector('#tp-rate').addEventListener('input', (e) => {
        const v = +e.target.value; el.querySelector('#tp-rate-o').textContent = Math.round(v * 100) + '%';
        const au = A(); if (au.playing) { const p = au.position(); au.play(p, { rate: v, loop: this.loopOn ? this.loop : null }); }
        else au.rate = v;
      });
      el.querySelector('#tp-follow').addEventListener('change', (e) => (this.follow = e.target.checked));
      el.querySelector('#ed-name').addEventListener('change', (e) => { this.p.title = e.target.value.trim() || 'Без названия'; root.App.markDirty(); root.App.renderChrome(); });
      el.querySelector('#ed-bpm').addEventListener('change', (e) => {
        const v = Math.max(30, Math.min(300, +e.target.value || this.p.meta.bpm));
        if (v === this.p.meta.bpm) return;
        const old = this.s16, off = this.p.meta.offset || 0;
        this.mutate(() => {
          this.p.meta.bpm = v;
          const ns = this.s16;
          this.p.tracks.forEach((t) => {
            const seen = new Set();
            t.notes = t.notes.filter((n) => {
              const tt = n.edited || n.t == null ? off + n.pos * old : n.t;
              const dd = n.edited || !n.d ? n.len * old : n.d;
              n.pos = Math.max(0, Math.round((tt - off) / ns));
              n.len = Math.max(1, Math.min(16, Math.round(dd / ns)));
              const k = n.pos + ':' + n.s;
              if (seen.has(k)) return false;
              seen.add(k); return true;
            });
          });
          (this.p.chords || []).forEach((c) => { c.pos = Math.round(c.pos * old / ns / 4) * 4; c.len = Math.max(4, Math.round(c.len * old / ns / 4) * 4); });
        });
        root.App.toast('Темп ' + v + ' BPM: ноты перестроены по сетке, привязка к записи сохранена.');
      });
      el.querySelector('#ed-key').addEventListener('change', (e) => { const v = e.target.value; this.mutate(() => { this.p.meta.key = v; this.p.meta.keyConfidence = 1; }); root.App.toast('Тональность: ' + v + '. Функции аккордов и подсказки смен пересчитаны.'); });
      el.querySelector('#ed-ts').addEventListener('change', (e) => { const [a, b] = e.target.value.split('/').map(Number); this.mutate(() => { this.p.meta.timeSig = [a, b]; }); });
      // waveform pointer: click = seek, drag = loop range
      let drag = null;
      this.wave.addEventListener('pointerdown', (e) => {
        const r = this.wave.getBoundingClientRect();
        const x = e.clientX - r.left;
        if (x < LEFT) return;
        drag = { x0: x, t0: this.timeOf((x - LEFT + this.scrollX) / this.slotW), moved: false };
        this.wave.setPointerCapture(e.pointerId);
      });
      this.wave.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const r = this.wave.getBoundingClientRect(); const x = e.clientX - r.left;
        if (Math.abs(x - drag.x0) > 4) drag.moved = true;
        if (drag.moved) {
          const t = this.timeOf((x - LEFT + this.scrollX) / this.slotW);
          this.loop = [Math.max(0, Math.min(drag.t0, t)), Math.max(drag.t0, t)];
          this.loopOn = true; this.syncTransport(); this.draw();
        }
      });
      this.wave.addEventListener('pointerup', () => {
        if (!drag) return;
        if (!drag.moved) { A().seek(Math.max(0, drag.t0)); this.updateTime(A().position()); this.draw(); }
        else if (A().playing) A().play(this.loop[0], { rate: A().rate, loop: this.loop });
        drag = null; this.syncTransport();
      });
      // tab pointer: select / drag notes
      let nd = null;
      this.tab.addEventListener('pointerdown', (e) => {
        const r = this.tab.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        if (x < LEFT) return;
        const pos = Math.max(0, Math.floor((x - LEFT + this.scrollX) / this.slotW));
        if (y < CH_H) { this.editChordAt(pos); return; }
        let s = Math.round((this.yStr(0) - y) / STR_GAP);
        s = Math.max(0, Math.min(this.S - 1, s));
        const n = this.noteAt(pos, s) || this.noteAt(pos - 1, s);
        this.caret = { pos: n ? n.pos : pos, s };
        this.selId = n ? n.id : null;
        if (n) { this.preview(n); nd = { n, pos0: n.pos, s0: n.s, x0: x, y0: y, snap: this.snapshot(), moved: false }; this.tab.setPointerCapture(e.pointerId); }
        this.renderInspector(); this.draw();
        this.tab.focus({ preventScroll: true });
      });
      this.tab.addEventListener('pointermove', (e) => {
        if (!nd) return;
        const r = this.tab.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        const dp = Math.round((x - nd.x0) / this.slotW);
        const ds = Math.round((nd.y0 - y) / STR_GAP);
        const n = nd.n;
        const ns = Math.max(0, Math.min(this.S - 1, nd.s0 + ds)), np = Math.max(0, nd.pos0 + dp);
        if (ns === n.s && np === n.pos) return;
        const f = n.midi - (this.track.tuning[ns] + (this.track.capo || 0));
        if (f < 0 || f > this.maxFret()) return;
        if (this.track.notes.some((q) => q !== n && q.pos === np && q.s === ns)) return;
        n.s = ns; n.f = f; n.pos = np; nd.moved = true; this.caret = { pos: np, s: ns };
        this.draw();
      });
      this.tab.addEventListener('pointerup', () => {
        if (nd && nd.moved) {
          const cur = this.snapshot();
          this.restore(nd.snap);
          const target = JSON.parse(cur);
          this.mutate(() => { target.tracks.forEach((t, i) => Object.assign(this.p.tracks[i], t)); const m = this.selNote(); if (m) m.edited = true; }, { edits: 1 });
        }
        nd = null;
      });
      this.tab.addEventListener('keydown', (e) => this.onKey(e));
      el.querySelectorAll('[data-kp]').forEach((b) => b.addEventListener('click', () => {
        const k = b.dataset.kp, shift = k.startsWith('Shift+');
        this.onKey({ key: shift ? k.slice(6) : k, shiftKey: shift, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {} });
        if (root.GTSPlatform) root.GTSPlatform.haptic();
      }));
      this.tab.addEventListener('focus', () => this.draw());
      this.tab.addEventListener('blur', () => this.draw());
    },
    onKey(e) {
      const k = e.key, ctrl = e.ctrlKey || e.metaKey;
      const L = this.barLen();
      if (ctrl && (k === 'z' || k === 'я') && !e.shiftKey) { e.preventDefault(); return this.doUndo(); }
      if (ctrl && ((k === 'z' || k === 'Z' || k === 'я' || k === 'Я') && e.shiftKey || k === 'y' || k === 'н')) { e.preventDefault(); return this.doRedo(); }
      if (ctrl && k === 's') { e.preventDefault(); return root.App.saveNow(true); }
      if (k === ' ') { e.preventDefault(); return this.togglePlay(); }
      if (/^[0-9]$/.test(k)) {
        e.preventDefault();
        const now = Date.now();
        const two = this.typed && now - this.typedAt < 800 && this.noteAt(this.caret.pos, this.caret.s);
        this.typed = two ? this.typed + k : k; this.typedAt = now;
        const v = parseInt(this.typed, 10);
        if (two && v > this.maxFret()) { this.typed = k; return this.setFret(+k); }
        return this.setFret(v);
      }
      this.typed = '';
      const sel = this.selNote();
      switch (k) {
        case 'ArrowLeft': e.preventDefault(); if (e.altKey && sel) return this.moveNote(-1); this.caret.pos = Math.max(0, this.caret.pos - (ctrl ? L : 1)); break;
        case 'ArrowRight': e.preventDefault(); if (e.altKey && sel) return this.moveNote(1); this.caret.pos += ctrl ? L : 1; break;
        case 'ArrowUp': e.preventDefault(); if (e.shiftKey) return this.moveString(1); if (e.altKey) return this.shiftPitch(1); this.caret.s = Math.min(this.S - 1, this.caret.s + 1); break;
        case 'ArrowDown': e.preventDefault(); if (e.shiftKey) return this.moveString(-1); if (e.altKey) return this.shiftPitch(-1); this.caret.s = Math.max(0, this.caret.s - 1); break;
        case 'Delete': case 'Backspace': e.preventDefault(); return this.deleteSel();
        case '+': case '=': case ']': e.preventDefault(); return this.stepLen(1);
        case '-': case '[': e.preventDefault(); return this.stepLen(-1);
        case '.': case 'ю': e.preventDefault(); return this.toggleDot();
        case 'Enter': e.preventDefault(); if (sel) this.preview(sel); return;
        case 'Escape': this.selId = null; this.renderInspector(); this.draw(); return;
        case 'n': case 'т': e.preventDefault(); return this.nextLow(e.shiftKey ? -1 : 1);
        case 'a': case 'ф': if (sel) { e.preventDefault(); return this.acceptSel(); } return;
        case 'l': case 'д': e.preventDefault(); return this.actions.loop.call(this);
        case 'Home': this.caret.pos = 0; break;
        default: {
          const t = TECHS.find((x) => x[1] === k.toLowerCase() || ({ р: 'h', з: 'p', ы: 's', и: 'b', м: 'v', ь: 'm' })[k.toLowerCase()] === x[1]);
          if (t && sel && !ctrl) { e.preventDefault(); return this.toggleTech(t[0]); }
          return;
        }
      }
      const n = this.noteAt(this.caret.pos, this.caret.s);
      this.selId = n && n.pos === this.caret.pos ? n.id : null;
      this.ensureVisible(this.caret.pos);
      this.renderInspector(); this.draw();
    },
    actions: {
      play() { this.togglePlay(); },
      stop() { A().stop(); A().from = this.loopOn && this.loop ? this.loop[0] : 0; this.scroll.scrollLeft = 0; this.syncTransport(); this.updateTime(A().from); this.draw(); },
      loop() {
        if (!this.loop) {
          const L = this.barLen(), bar = Math.floor(this.caret.pos / L);
          this.loop = [this.timeOf(bar * L), this.timeOf((bar + 1) * L)];
          root.App.toast('Повтор такта ' + (bar + 1) + '. Протяните по аудиоволне, чтобы выбрать другой участок.');
        }
        this.loopOn = !this.loopOn;
        const au = A();
        if (au.playing) au.play(this.loopOn ? this.loop[0] : au.position(), { rate: au.rate, loop: this.loopOn ? this.loop : null });
        this.syncTransport(); this.draw();
      },
      track(b) { this.ti = +b.dataset.i; this.selId = null; this.caret = { pos: this.caret.pos, s: Math.min(this.caret.s, this.S - 1) }; root.App.openEditor(this.p.id, { keepState: true }); },
      undo() { this.doUndo(); }, redo() { this.doRedo(); },
      zoomin() { this.zoom = Math.min(3, this.zoom * 1.25); this.layout(); },
      zoomout() { this.zoom = Math.max(0.45, this.zoom / 1.25); this.layout(); },
      panel(b) { this.panel = b.dataset.k; this.renderPanels(); },
      remap() { root.App.remapDialog(); },
      version() { root.App.saveVersion(); },
      export() { root.App.go('export'); },
      len(b) { this.setLen(+b.dataset.v); },
      tech(b) { this.toggleTech(b.dataset.k); },
      del() { this.deleteSel(); }, flag() { this.flagSel(); }, accept() { this.acceptSel(); },
      prevlow() { this.nextLow(-1); }, nextlow() { this.nextLow(1); },
      hear() { const n = this.selNote(); if (n) this.preview(n); },
      strdown() { this.moveString(-1); }, strup() { this.moveString(1); },
      // chords
      chordAdd() { this.editChordAt(this.caret.pos - (this.caret.pos % 4)); },
      chordDel(b) { const i = +b.dataset.i; this.mutate(() => this.p.chords.splice(i, 1)); },
      chordGo(b) { const c = this.p.chords[+b.dataset.i]; this.caret.pos = c.pos; this.ensureVisible(c.pos); A().seek(this.timeOf(c.pos)); this.updateTime(A().position()); this.draw(); },
      // lyrics
      lyAdd() { const t = +A().position().toFixed(2); this.mutate(() => { this.p.lyrics = (this.p.lyrics || []).concat([{ t, text: '' }]).sort((a, b) => a.t - b.t); }); setTimeout(() => { const r = this.el.querySelector(`.ly-row[data-t="${t}"] input[type=text]`); r && r.focus(); }, 30); },
      lyStamp(b) { const i = +b.dataset.i; const t = +A().position().toFixed(2); this.mutate(() => { this.p.lyrics[i].t = t; this.p.lyrics.sort((a, b2) => a.t - b2.t); }); },
      lyDel(b) { const i = +b.dataset.i; this.mutate(() => this.p.lyrics.splice(i, 1)); },
      lyGo(b) { const l = this.p.lyrics[+b.dataset.i]; A().seek(l.t); this.ensureVisible(Math.floor(this.posOf(l.t))); this.updateTime(l.t); this.draw(); },
      lyPaste() { root.App.pasteLyricsDialog(); },
      // mixer
      mute(b) { const c = A().channels[b.dataset.k]; c.mute = !c.mute; A().applyMix(); this.renderPanels(); },
      solo(b) { const c = A().channels[b.dataset.k]; c.solo = !c.solo; A().applyMix(); this.renderPanels(); },
      trackMute(b) { const t = this.p.tracks[+b.dataset.i]; t.muted = !t.muted; root.App.markDirty(); this.renderPanels(); },
      // history
      restoreVer(b) { const v = S().versions(this.p.id)[+b.dataset.i]; if (!v) return; const d = S().restoreVersionData(v); this.mutate(() => { d.tracks.forEach((t, i) => { if (this.p.tracks[i]) Object.assign(this.p.tracks[i], { notes: t.notes, tuning: t.tuning, capo: t.capo }); }); this.p.chords = d.chords || []; this.p.lyrics = d.lyrics || []; this.p.meta = Object.assign(this.p.meta, d.meta); }); root.App.toast('Версия восстановлена. Отменить: Ctrl+Z.'); },
      rerun() { root.App.rerun(); }
    },

    /* ---------- inspector ---------- */
    renderInspector() {
      const box = this.el && this.el.querySelector('#inspector');
      if (!box) return;
      const n = this.selNote();
      const thr = this.lowConf();
      const lowCount = this.track.notes.filter((x) => x.conf < thr && !x.edited).length;
      const review = `<div class="review"><span><b>${lowCount}</b> ${plural(lowCount, 'сомнительная нота', 'сомнительные ноты', 'сомнительных нот')}</span><div class="row"><button class="btn sm ghost" data-act="prevlow" ${lowCount ? '' : 'disabled'} aria-label="Предыдущая сомнительная">←</button><button class="btn sm" data-act="nextlow" ${lowCount ? '' : 'disabled'}>Проверить следующую (N)</button></div></div>`;
      if (!n) {
        const s = this.caret.s;
        box.innerHTML = `<h3>Курсор</h3>
          <p class="muted">Такт ${Math.floor(this.caret.pos / this.barLen()) + 1}, доля ${Math.floor((this.caret.pos % this.barLen()) / 4) + 1}, струна ${this.S - s} (${E().midiName(this.track.tuning[s] + (this.track.capo || 0))})</p>
          ${review}
          <details class="keys" open><summary>Клавиши редактора</summary>
            <dl><dt>0–22</dt><dd>поставить лад</dd><dt>← → ↑ ↓</dt><dd>курсор (Ctrl — по тактам)</dd><dt>Shift + ↑↓</dt><dd>нота на соседнюю струну</dd><dt>Alt + ↑↓</dt><dd>высота ±полутон</dd><dt>Alt + ← →</dt><dd>сдвиг по времени</dd><dt>+ / − / .</dt><dd>длительность, точка</dd><dt>h p s b v m</dt><dd>техники</dd><dt>N / A</dt><dd>к сомнительной / принять</dd><dt>Пробел, L</dt><dd>играть, повтор</dd><dt>Ctrl+Z / Ctrl+Shift+Z</dt><dd>отмена / повтор</dd></dl>
          </details>`;
        return;
      }
      const conf = Math.round(n.conf * 100);
      const low = n.conf < thr && !n.edited;
      box.innerHTML = `<h3>Нота <span class="pitch">${E().midiName(n.midi)}</span> ${n.edited ? '<span class="pill ok">исправлена</span>' : low ? '<span class="pill low">сомнительная</span>' : '<span class="pill">AI</span>'}</h3>
        <div class="grid2">
          <label>Струна<div class="stepper"><button class="btn sm ghost" data-act="strdown" aria-label="Ниже">−</button><output>${this.S - n.s}</output><button class="btn sm ghost" data-act="strup" aria-label="Выше">+</button></div></label>
          <label for="in-fret">Лад<input id="in-fret" type="number" min="0" max="${this.maxFret()}" value="${n.f}"></label>
        </div>
        <label for="in-len">Длительность<select id="in-len">${DURS.map((d) => `<option value="${d}" ${d === n.len ? 'selected' : ''}>${DUR_LABEL[d]}</option>`).join('')}</select></label>
        <div class="techs" role="group" aria-label="Техники">${TECHS.map(([k, key, l]) => `<button class="tech ${n.tech && n.tech[k] ? 'on' : ''}" data-act="tech" data-k="${k}" aria-pressed="${!!(n.tech && n.tech[k])}" title="${l} (${key})">${l}${k === 'bend' && n.tech && n.tech.bend ? ' ' + (n.tech.bend === 1 ? 'full' : n.tech.bend) : ''}</button>`).join('')}</div>
        <div class="conf"><span>Уверенность модели</span><div class="meter ${low ? 'low' : ''}"><i style="width:${conf}%"></i></div><b>${conf}%</b></div>
        <p class="muted small">${n.t != null ? 'В записи: ' + fmt(n.t) + ', ' + Math.round((n.d || 0) * 1000) + ' мс' : ''}${n.strum != null ? ' · из аккордового удара' : ''}</p>
        <div class="row wrap">
          <button class="btn sm ghost" data-act="hear">Прослушать (Enter)</button>
          ${low ? '<button class="btn sm" data-act="accept">Верно (A)</button>' : ''}
          <button class="btn sm ghost ${n.flag ? 'on' : ''}" data-act="flag">${n.flag ? 'Снять отметку ошибки' : 'Сообщить о неверной ноте'}</button>
          <button class="btn sm danger" data-act="del">Удалить</button>
        </div>
        ${review}`;
      box.querySelector('#in-fret').addEventListener('change', (e) => { const v = Math.max(0, Math.min(this.maxFret(), Math.round(+e.target.value))); this.caret = { pos: n.pos, s: n.s }; this.setFret(v); });
      box.querySelector('#in-len').addEventListener('change', (e) => this.setLen(+e.target.value));
    },

    /* ---------- panels ---------- */
    renderPanels() {
      if (!this.el) return;
      this.el.querySelectorAll('.ptabs [role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.k === this.panel)));
      const body = this.el.querySelector('#pbody');
      const f = this['panel_' + this.panel];
      body.innerHTML = '';
      if (f) f.call(this, body);
    },
    panel_chords(body) {
      const ch = this.p.chords || [];
      const Th = root.GTSTheory, Tl = root.GTSTools;
      const uniq = [...new Set(ch.map((c) => c.name))].slice(0, 16);
      const L = this.barLen();
      const key = this.p.meta.key;
      const fnOf = (n) => { const f = Th && Th.parseChord(n) ? Th.functionInKey(n, key) : null; return f && f.roman ? f.roman : '—'; };
      body.innerHTML = `<div class="ph"><p class="muted">Нажмите на аккорд — откроется окно с вариантами аппликатуры, прослушиванием и подходящими сменами в тональности ${esc(key)}. Щелчок по полосе «Аккорд» над табами добавляет или меняет аккорд.</p><button class="btn sm" data-act="chordAdd">Добавить у курсора</button></div>
        <div class="diagrams">${uniq.map((nm) => `<button class="cd cd-btn" data-chordopen="${esc(nm)}" aria-label="Аккорд ${esc(nm)}: варианты и прослушивание">${Tl && Th.parseChord(nm) ? Tl.diagramSvg(Th.voicings(nm)[0]) : chordDiagram(nm, this.p.tracks[0])}<span class="cd-cap"><b>${esc(nm)}</b><small class="mono">${esc(fnOf(nm))}</small></span></button>`).join('')}</div>
        <table class="tbl"><thead><tr><th>Такт.доля</th><th>Аккорд</th><th>Ступень</th><th>Длина</th><th>Уверенность</th><th></th></tr></thead><tbody>
        ${ch.map((c, i) => `<tr><td><button class="link" data-act="chordGo" data-i="${i}">${Math.floor(c.pos / L) + 1}.${Math.floor((c.pos % L) / 4) + 1}</button></td><td><input class="ch-in" data-i="${i}" value="${esc(c.name)}" aria-label="Аккорд" maxlength="12"></td><td class="mono">${esc(fnOf(c.name))}</td><td>${c.len / 4} ${plural(c.len / 4, 'доля', 'доли', 'долей')}</td><td>${c.conf != null ? Math.round(c.conf * 100) + '%' : '—'}</td><td class="row"><button class="btn sm ghost" data-chordplay="${esc(c.name)}" aria-label="Слушать ${esc(c.name)}">▶</button><button class="btn sm ghost" data-chordrow="${i}">Варианты</button><button class="btn sm ghost" data-act="chordDel" data-i="${i}" aria-label="Удалить аккорд">✕</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Аккорды не найдены.</td></tr>'}
        </tbody></table>`;
      body.querySelectorAll('.ch-in').forEach((inp) => inp.addEventListener('change', () => {
        const i = +inp.dataset.i, v = inp.value.trim();
        if (!/^[A-G][#b]?(m|maj7|m7|7|sus2|sus4|dim|dim7|aug|\+|5|6|9|add9|m6|m9|maj9|7sus4|m7b5)?(\/[A-G][#b]?)?$/.test(v)) { root.App.toast('Не похоже на название аккорда: например Am, F#m7, Cmaj7, G/B.', 'warn'); inp.value = this.p.chords[i].name; return; }
        this.mutate(() => { this.p.chords[i].name = v; this.p.chords[i].conf = 1; });
      }));
      if (!Tl) return;
      body.querySelectorAll('[data-chordopen]').forEach((b) => b.addEventListener('click', () => {
        const nm = b.dataset.chordopen;
        Tl.openChord(nm, { key, onApply: (nn) => this.mutate(() => this.p.chords.forEach((c) => { if (c.name === nm) { c.name = nn; c.conf = 1; } })) });
      }));
      body.querySelectorAll('[data-chordrow]').forEach((b) => b.addEventListener('click', () => {
        const i = +b.dataset.chordrow, nm = this.p.chords[i].name;
        Tl.openChord(nm, { key, onApply: (nn) => this.mutate(() => { this.p.chords[i].name = nn; this.p.chords[i].conf = 1; }) });
      }));
      body.querySelectorAll('[data-chordplay]').forEach((b) => b.addEventListener('click', () => Tl.play(b.dataset.chordplay, 'strum')));
    },
    editChordAt(pos) {
      pos = pos - (pos % 4);
      const ex = (this.p.chords || []).find((c) => pos >= c.pos && pos < c.pos + c.len);
      root.App.prompt(ex ? 'Аккорд с доли ' + (Math.floor(pos / 4) + 1) : 'Новый аккорд', ex ? ex.name : '', 'Например Am, C, G/B. Пусто — удалить.', (v) => {
        v = (v || '').trim();
        this.mutate(() => {
          const ch = this.p.chords = this.p.chords || [];
          if (ex && ex.pos === pos) { if (!v) ch.splice(ch.indexOf(ex), 1); else { ex.name = v; ex.conf = 1; } }
          else if (v) {
            if (ex) { const endEx = ex.pos + ex.len; ex.len = pos - ex.pos; ch.push({ pos, len: endEx - pos, name: v, conf: 1 }); }
            else { const next = ch.filter((c) => c.pos > pos).sort((a, b) => a.pos - b.pos)[0]; ch.push({ pos, len: next ? Math.min(16, next.pos - pos) : 16, name: v, conf: 1 }); }
            ch.sort((a, b) => a.pos - b.pos);
          }
        });
      });
    },
    panel_lyrics(body) {
      const ly = this.p.lyrics || [];
      body.innerHTML = `<div class="ph"><p class="muted">Строки текста с привязкой ко времени записи. Автоматическое распознавание вокала (Whisper) выполняется серверным GPU-воркером и в браузерной версии недоступно.</p><div class="row"><button class="btn sm ghost" data-act="lyPaste">Вставить текст целиком</button><button class="btn sm" data-act="lyAdd">Строка в позиции курсора</button></div></div>
        <div class="ly-list">${ly.map((l, i) => `<div class="ly-row" data-t="${l.t}"><button class="link mono" data-act="lyGo" data-i="${i}">${fmt(l.t)}</button><button class="btn sm ghost" data-act="lyStamp" data-i="${i}" title="Привязать к текущей позиции воспроизведения">⏱</button><input type="text" data-i="${i}" value="${esc(l.text)}" aria-label="Текст строки" maxlength="300"><button class="btn sm ghost" data-act="lyDel" data-i="${i}" aria-label="Удалить строку">✕</button></div>`).join('') || '<p class="muted">Текста пока нет. Запустите воспроизведение и добавляйте строки по ходу песни.</p>'}</div>`;
      body.querySelectorAll('.ly-row input[type=text]').forEach((inp) => inp.addEventListener('change', () => { const i = +inp.dataset.i; this.p.lyrics[i].text = inp.value; root.App.markDirty(); }));
    },
    panel_mixer(body) {
      const ch = A().channels;
      const rows = Object.entries(ch).map(([k, c]) => {
        const av = c.available !== false;
        return `<div class="mx ${av ? '' : 'off'}"><span class="mx-name">${c.label}${av ? '' : ' <small>нет данных</small>'}</span>
          <input type="range" min="0" max="1" step="0.01" value="${c.vol}" data-k="${k}" aria-label="Громкость: ${c.label}" ${av ? '' : 'disabled'}>
          <button class="btn sm ghost ${c.mute ? 'on' : ''}" data-act="mute" data-k="${k}" aria-pressed="${c.mute}" ${av ? '' : 'disabled'}>M</button>
          <button class="btn sm ghost ${c.solo ? 'on' : ''}" data-act="solo" data-k="${k}" aria-pressed="${c.solo}" ${av ? '' : 'disabled'}>S</button></div>`;
      }).join('');
      body.innerHTML = `<div class="ph"><p class="muted">${this.p.mode === 'mix' ? 'Стемы получены полосовым разделением в браузере. Для студийного качества в серверной версии используется Demucs.' : 'Изолированная запись: стемы не создаются. Синтез воспроизводит табулатуру, чтобы сверить её с оригиналом на слух.'}</p></div>
        <div class="mixer">${rows}</div>
        <h4>Синтез по дорожкам табулатуры</h4>
        <div class="row wrap">${this.p.tracks.map((t, i) => `<button class="btn sm ghost ${t.muted ? '' : 'on'}" data-act="trackMute" data-i="${i}" aria-pressed="${!t.muted}">${esc(t.name)}: ${t.muted ? 'выкл.' : 'вкл.'}</button>`).join('')}</div>`;
      body.querySelectorAll('.mixer input[type=range]').forEach((r) => r.addEventListener('input', () => { ch[r.dataset.k].vol = +r.value; A().applyMix(); }));
    },
    panel_notation(body) {
      body.innerHTML = `<div class="ph"><p class="muted">Нотный стан и табулатура текущей дорожки, отрисованные alphaTab (MPL-2.0) из внутреннего формата проекта.</p></div><div id="at-host" class="at-host"><p class="muted">Загрузка нотной записи…</p></div>`;
      root.App.renderNotation(body.querySelector('#at-host'), this.p, this.ti);
    },
    panel_history(body) {
      const vs = S().versions(this.p.id);
      const ed = this.p.tracks.reduce((s, t) => s + t.notes.filter((n) => n.edited).length, 0);
      body.innerHTML = `<div class="ph"><p class="muted">Сохранённые версии проекта (до 12 последних). Ручных исправлений в проекте: <b>${ed}</b>. Ревизия ${this.p.rev || 0}.</p><button class="btn sm" data-act="version">Сохранить версию сейчас</button></div>
        <table class="tbl"><thead><tr><th>Когда</th><th>Метка</th><th>Ревизия</th><th></th></tr></thead><tbody>
        ${vs.map((v, i) => `<tr><td>${new Date(v.at).toLocaleString('ru-RU')}</td><td>${esc(v.label)}</td><td>${v.rev}</td><td><button class="btn sm ghost" data-act="restoreVer" data-i="${i}">Восстановить</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Версий пока нет. Первая создаётся после распознавания.</td></tr>'}
        </tbody></table>`;
    },
    panel_model(body) {
      const m = this.p.model || {};
      const tr = this.track;
      const thr = this.lowConf();
      const bins = new Array(10).fill(0);
      tr.notes.forEach((n) => bins[Math.min(9, Math.floor(n.conf * 10))]++);
      const mx = Math.max(1, ...bins);
      const comps = m.components ? Object.entries(m.components).map(([k, v]) => `<dt>${({ separation: 'Разделение', pitch: 'Высота тона', onsets: 'Атаки нот', tempo: 'Темп', chords: 'Аккорды', key: 'Тональность', fretboard: 'Аппликатура' })[k] || k}</dt><dd>${esc(v)}</dd>`).join('') : '';
      body.innerHTML = `<div class="model-grid">
        <div><h4>${esc(m.name || 'Модель')} <small>v${esc(m.version || '?')}</small></h4>
          <dl class="kv">${comps}<dt>Запуск</dt><dd>${m.ranAt ? new Date(m.ranAt).toLocaleString('ru-RU') : '—'} · ${m.ms ? (m.ms / 1000).toFixed(1) + ' с' : ''}</dd>
          <dt>Параметры</dt><dd class="mono small">${esc(JSON.stringify(m.params || {}))}</dd></dl>
          <button class="btn sm ghost" data-act="rerun">Распознать заново с другими параметрами</button></div>
        <div><h4>Уверенность по нотам: ${esc(tr.name)}</h4>
          <div class="hist" role="img" aria-label="Гистограмма уверенности">${bins.map((b, i) => `<div class="hb ${(i + 1) / 10 <= thr ? 'low' : ''}" style="height:${Math.round(b / mx * 100)}%" title="${i * 10}–${i * 10 + 10}%: ${b}"><span>${b || ''}</span></div>`).join('')}</div>
          <div class="hist-x"><span>0%</span><span>50%</span><span>100%</span></div>
          <p class="muted small">Нот: ${tr.notes.length} · средняя уверенность ${Math.round((tr.notes.reduce((s, n) => s + n.conf, 0) / Math.max(1, tr.notes.length)) * 100)}% · порог сомнительных ${Math.round(thr * 100)}% · BPM ${this.p.meta.bpm} (уверенность ${Math.round((this.p.meta.bpmConfidence || 0) * 100)}%) · тональность ${esc(this.p.meta.key)}</p>
        </div></div>`;
    },
    destroy() { if (this._ro) this._ro.disconnect(); this.el = null; this.mounted = false; }
  };

  /* ---------- helpers ---------- */
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function fmt(t) { t = Math.max(0, t || 0); const m = Math.floor(t / 60); return m + ':' + (t % 60).toFixed(1).padStart(4, '0'); }
  function plural(n, a, b, c) { n = Math.abs(n) % 100; const n1 = n % 10; if (n > 10 && n < 20) return c; if (n1 > 1 && n1 < 5) return b; if (n1 === 1) return a; return c; }
  function chordDiagram(name, track) {
    const shape = track && track.type === 'guitar' ? E().chordShape(name, track.tuning, track.capo || 0) : null;
    if (!shape) return `<figure class="cd"><div class="cd-none">${esc(name)}</div><figcaption>${esc(name)}</figcaption></figure>`;
    const fr = shape.filter(Boolean).map((p) => p.f).filter((f) => f > 0);
    const base = fr.length && Math.max(...fr) > 4 ? Math.min(...fr) : 1;
    const W = 74, H = 86, x0 = 12, y0 = 18, sw = 10, fh = 13;
    let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">`;
    for (let s = 0; s < 6; s++) svg += `<line x1="${x0 + s * sw}" y1="${y0}" x2="${x0 + s * sw}" y2="${y0 + 4 * fh}" class="cd-l"/>`;
    for (let f = 0; f <= 4; f++) svg += `<line x1="${x0}" y1="${y0 + f * fh}" x2="${x0 + 5 * sw}" y2="${y0 + f * fh}" class="cd-l ${f === 0 && base === 1 ? 'nut' : ''}"/>`;
    shape.forEach((p, s) => {
      const x = x0 + s * sw;
      if (!p) svg += `<text x="${x}" y="${y0 - 5}" class="cd-t">×</text>`;
      else if (p.f === 0) svg += `<circle cx="${x}" cy="${y0 - 8}" r="3" class="cd-o"/>`;
      else svg += `<circle cx="${x}" cy="${y0 + (p.f - base + 0.5) * fh}" r="4" class="cd-d"/>`;
    });
    if (base > 1) svg += `<text x="${x0 + 5 * sw + 4}" y="${y0 + fh * 0.75}" class="cd-t sm">${base}</text>`;
    return `<figure class="cd">${svg}</svg><figcaption>${esc(name)}</figcaption></figure>`;
  }
  const ICONS = {
    play: '<path d="M7 4.5v15l12.5-7.5z"/>', pause: '<path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z"/>', stop: '<path d="M5 5h3v14H5zM9.5 12L19 5v14z"/>',
    loop: '<path d="M7 7h9.5a3.5 3.5 0 0 1 0 7H15M17 17H7.5a3.5 3.5 0 0 1 0-7H9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 11.5l2.5 2.5-2.5 2.5M10 12.5L7.5 10 10 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    undo: '<path d="M9 7L4.5 11.5 9 16M5 11.5h9a5 5 0 0 1 0 10h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    redo: '<path d="M15 7l4.5 4.5L15 16M19 11.5h-9a5 5 0 0 0 0 10h2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  function icon(n) { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">${ICONS[n]}</svg>`; }
  Ed.fmt = fmt; Ed.plural = plural; Ed.icon = icon; Ed.chordDiagram = chordDiagram; Ed.esc = esc;
  root.GTSEditor = Ed;
})(typeof self !== 'undefined' ? self : globalThis);
