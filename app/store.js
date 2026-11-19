/* Хранилище проектов.
 * Локально: IndexedDB (с резервом в localStorage) — всегда, работает офлайн.
 * Синхронизация: аккаунт Tab Studio (Supabase) на сайте, в десктопе и мобильном приложении;
 * внутри Claude — личное пространство артефакта (claude db), если аккаунт не настроен. */
(function (root) {
  'use strict';
  const LS_KEY = 'gts.v1';
  const SESSION = Math.random().toString(36).slice(2, 10);
  const Acc = () => root.GTSAccount;

  /* ---------- compact note packing (documents stay small) ---------- */
  const TECH_BITS = ['hammer', 'pull', 'slide', 'vibrato', 'mute', 'flag'];
  function packNotes(notes) {
    return notes.map((n) => {
      let bits = 0;
      const t = n.tech || {};
      TECH_BITS.forEach((k, i) => { if (k === 'flag' ? n.flag : t[k]) bits |= 1 << i; });
      return [n.pos, n.len, n.midi, n.s, n.f, Math.round((n.conf ?? 1) * 100), Math.round((n.t || 0) * 1000), Math.round((n.d || 0) * 1000), bits, t.bend || 0, n.strum ?? -1, n.edited ? 1 : 0];
    });
  }
  let nid = 0;
  function unpackNotes(arr, prefix) {
    return (arr || []).map((a) => {
      const tech = {};
      TECH_BITS.forEach((k, i) => { if (k !== 'flag' && a[8] & (1 << i)) tech[k] = true; });
      if (a[9]) tech.bend = a[9];
      const n = { id: (prefix || 'n') + (nid++).toString(36), pos: a[0], len: a[1], midi: a[2], s: a[3], f: a[4], conf: a[5] / 100, t: a[6] / 1000, d: a[7] / 1000 };
      if (Object.keys(tech).length) n.tech = tech;
      if (a[8] & (1 << 5)) n.flag = true;
      if (a[10] >= 0) n.strum = a[10];
      if (a[11]) n.edited = true;
      return n;
    });
  }
  function packProject(p) {
    const o = JSON.parse(JSON.stringify(Object.assign({}, p, { tracks: undefined, _local: undefined })));
    o.tracks = p.tracks.map((t) => Object.assign({}, t, { notes: undefined, packed: packNotes(t.notes) }));
    return o;
  }
  function unpackProject(o) {
    const p = JSON.parse(JSON.stringify(o));
    p.tracks = (p.tracks || []).map((t) => { const n = unpackNotes(t.packed, t.id + '_'); delete t.packed; t.notes = n; return t; });
    return p;
  }

  /* ---------- IndexedDB: audio + app state ---------- */
  let idbP = null;
  function idb() {
    if (idbP) return idbP;
    idbP = new Promise((res) => {
      try {
        const r = indexedDB.open('gts-audio', 2);
        r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('audio')) d.createObjectStore('audio'); if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv'); };
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(null);
        r.onblocked = () => res(null);
      } catch (e) { res(null); }
    });
    return idbP;
  }
  async function idbGet(store, key) {
    const d = await idb(); if (!d) return undefined;
    return new Promise((res) => { try { const r = d.transaction(store).objectStore(store).get(key); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); } catch (e) { res(undefined); } });
  }
  async function idbPut(store, key, val) {
    const d = await idb(); if (!d) return false;
    return new Promise((res) => { try { const tx = d.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = () => res(true); tx.onerror = () => res(false); } catch (e) { res(false); } });
  }
  async function idbDel(store, key) {
    const d = await idb(); if (!d) return;
    try { d.transaction(store, 'readwrite').objectStore(store).delete(key); } catch (e) { /* ignore */ }
  }
  const putLocalAudio = (id, rec) => idbPut('audio', id, rec);
  const getLocalAudio = async (id) => (await idbGet('audio', id)) || null;

  function lsRead() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || null; } catch (e) { return null; } }
  function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }

  const Store = {
    mode: 'memory', // memory | local | cloud (Claude) | account
    uid: null, db: null, session: SESSION,
    mem: { projects: {}, versions: {}, meta: null },
    listeners: [], remoteChangeListeners: [], pending: new Set(), syncing: false,

    async init() {
      const saved = (await idbGet('kv', 'state')) || lsRead();
      if (saved && saved.projects) this.mem = { projects: saved.projects, versions: saved.versions || {}, meta: saved.meta || null };
      this.mode = (await idb()) ? 'local' : (typeof localStorage !== 'undefined' ? 'local' : 'memory');
      const A = Acc();
      if (A && A.configured) {
        A.onSignedIn = () => this.accountSync(true);
        await A.init();
        if (A.user) { this.mode = 'account'; this.accountSync(true); }
        root.addEventListener && root.addEventListener('online', () => this.flush());
        setInterval(() => this.flush(), 30000);
        return this.mode;
      }
      // inside Claude: private per-user space of the artifact
      try {
        if (root.claude && root.claude.use) {
          const [db, user] = await Promise.all([root.claude.use('db'), root.claude.use('user')]);
          const uid = user ? await user.id() : null;
          if (db && uid) {
            this.db = db; this.uid = uid;
            const col = db.collection('data/users/' + uid);
            const snap = await withTimeout(col.get(), 10000);
            const cloud = { projects: {}, versions: {}, meta: null };
            snap.docs.forEach((d) => {
              const v = d.data();
              if (!v) return;
              if (v.kind === 'project') cloud.projects[v.id] = v;
              else if (v.kind === 'version') (cloud.versions[v.projectId] = cloud.versions[v.projectId] || []).push(v);
              else if (d.id === 'meta') cloud.meta = v;
            });
            for (const id in this.mem.projects) if (!cloud.projects[id]) { cloud.projects[id] = this.mem.projects[id]; col.doc('p_' + id).set(this.mem.projects[id]).catch(() => {}); }
            if (!cloud.meta && this.mem.meta) cloud.meta = this.mem.meta;
            this.mem = cloud; this.mode = 'cloud';
            this._subscribeClaude(col);
          }
        }
      } catch (e) { /* stay local */ }
      return this.mode;
    },
    onChange(f) { this.listeners.push(f); },
    onRemoteProject(f) { this.remoteChangeListeners.push(f); },
    _notify() { this.listeners.forEach((f) => f()); },
    _persistLocal() {
      clearTimeout(this._pt);
      this._pt = setTimeout(async () => {
        const state = { projects: this.mem.projects, versions: this.mem.versions, meta: this.mem.meta };
        const ok = await idbPut('kv', 'state', state);
        if (!ok) { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* quota */ } }
        else { try { localStorage.removeItem(LS_KEY); } catch (e) { /* ignore */ } }
      }, 150);
    },

    /* ---------- account sync ---------- */
    async accountSync(fromLogin) {
      const A = Acc();
      if (!A || !A.user || this.syncing) return;
      this.syncing = true; this.mode = 'account';
      A.setStatus('syncing');
      try {
        const [rows, meta, vers] = await Promise.all([A.listProjects(), A.getMeta(), A.listVersions().catch(() => []), A.listAudio().catch(() => [])]);
        const remote = new Map(rows.map((r) => [r.id, r]));
        const pushes = [];
        for (const r of rows) {
          const L = this.mem.projects[r.id];
          if (r.deleted) { if (L && !L.dirty) delete this.mem.projects[r.id]; else if (L && L.dirty) pushes.push([L, r.rev]); continue; }
          if (!L) { this.mem.projects[r.id] = Object.assign({}, r.data, { id: r.id, rev: r.rev, syncedRev: r.rev, dirty: false }); continue; }
          if (L.dirty) {
            if ((L.syncedRev || 0) >= r.rev) pushes.push([L, r.rev]);
            else {
              // edited on both sides: keep the cloud copy and save this device's edits as a separate project
              const copy = Object.assign({}, L, { id: L.id + '-' + SESSION.slice(0, 4), title: (L.title || 'Проект') + ' (копия с этого устройства)', rev: 0, syncedRev: 0, dirty: true });
              this.mem.projects[copy.id] = copy; pushes.push([copy, 0]);
              this.mem.projects[r.id] = Object.assign({}, r.data, { id: r.id, rev: r.rev, syncedRev: r.rev, dirty: false });
              const a = await getLocalAudio(r.id); if (a) await putLocalAudio(copy.id, a);
            }
          } else if (r.rev > (L.syncedRev || 0)) this.mem.projects[r.id] = Object.assign({}, r.data, { id: r.id, rev: r.rev, syncedRev: r.rev, dirty: false });
        }
        const remoteHasDemo = rows.some((r) => !r.deleted && r.data && r.data.demo);
        for (const id in this.mem.projects) {
          if (remote.has(id)) continue;
          const L = this.mem.projects[id];
          if (L.demo && !L.syncedRev && remoteHasDemo && !(L.editCount > 0)) { delete this.mem.projects[id]; delete this.mem.versions[id]; idbDel('audio', id); continue; }
          if (L.syncedRev && !L.dirty && !fromLogin) delete this.mem.projects[id];
          else pushes.push([L, 0]);
        }
        for (const [L, base] of pushes) await this._push(L, base, true);
        // versions: merge both ways
        const remoteV = new Set(vers.map((v) => v.id));
        vers.forEach((v) => {
          const list = (this.mem.versions[v.project_id] = this.mem.versions[v.project_id] || []);
          if (!list.some((x) => x.docId === v.id)) list.push({ kind: 'version', projectId: v.project_id, at: Number(v.at), label: v.label, rev: v.rev, docId: v.id, data: v.data });
        });
        for (const pid in this.mem.versions) for (const v of this.mem.versions[pid]) if (!remoteV.has(v.docId) && this.mem.projects[pid]) A.pushVersion(v).catch(() => {});
        // settings, collections: newest wins
        const localMeta = this.mem.meta || {};
        if (meta && meta.data && (!localMeta.updatedAt || new Date(meta.updated_at).getTime() > localMeta.updatedAt)) {
          this.mem.meta = Object.assign({}, localMeta, meta.data, { updatedAt: new Date(meta.updated_at).getTime() });
        } else if (this.mem.meta) await A.pushMeta(this.mem.meta).catch(() => {});
        // audio: upload what the cloud lacks
        this._uploadMissingAudio();
        A.subscribe((row) => this._applyRemoteRow(row));
        A.lastSync = Date.now();
        A.setStatus(this.pending.size ? 'offline' : 'synced', '');
        this._persistLocal();
        this._notify();
      } catch (e) {
        A.setStatus(navigator.onLine === false || /fetch|network|timeout/i.test(String(e && e.message)) ? 'offline' : 'error', A.ru(e));
      }
      this.syncing = false;
    },
    async _uploadMissingAudio() {
      const A = Acc();
      for (const id in this.mem.projects) {
        if (A.audioIndex.has(id)) continue;
        const rec = await getLocalAudio(id);
        if (rec) await A.uploadAudio(id, rec).catch(() => {});
      }
      A.emit();
    },
    _applyRemoteRow(row) {
      const L = this.mem.projects[row.id];
      if (row.deleted) { if (L && !L.dirty) { delete this.mem.projects[row.id]; this._persistLocal(); this._notify(); } return; }
      if (L && (L.dirty || (L.syncedRev || 0) >= row.rev)) return;
      this.mem.projects[row.id] = Object.assign({}, row.data, { id: row.id, rev: row.rev, syncedRev: row.rev, dirty: false });
      this._persistLocal();
      this.remoteChangeListeners.forEach((f) => f(row.id));
      this._notify();
    },
    async _push(packed, base, force) {
      const A = Acc();
      try {
        const r = await A.pushProject(packed, base, force);
        if (r && r.conflict) return { conflict: r };
        packed.rev = r.rev; packed.syncedRev = r.rev; packed.dirty = false;
        this.pending.delete(packed.id);
        return { ok: true, rev: r.rev };
      } catch (e) {
        packed.dirty = true; this.pending.add(packed.id);
        A.setStatus('offline', A.ru(e));
        return { offline: true };
      }
    },
    async flush() {
      const A = Acc();
      if (this.mode !== 'account' || !A || !A.user) return;
      if (!this.pending.size) { if (A.status === 'offline') this.accountSync(false); return; }
      A.setStatus('syncing');
      for (const id of Array.from(this.pending)) {
        const p = this.mem.projects[id];
        if (!p) { this.pending.delete(id); continue; }
        const r = await this._push(p, p.syncedRev || 0, false);
        if (r.conflict) this.pending.delete(id);
      }
      this._persistLocal();
      A.setStatus(this.pending.size ? 'offline' : 'synced');
      if (!this.pending.size) A.lastSync = Date.now();
    },
    async syncNow() { if (this.mode === 'account') { await this.flush(); await this.accountSync(false); } },
    async signedOut(clearLocal) {
      this.mode = 'local';
      if (clearLocal) { for (const id in this.mem.projects) idbDel('audio', id); this.mem = { projects: {}, versions: {}, meta: this.mem.meta }; }
      else for (const id in this.mem.projects) { const p = this.mem.projects[id]; delete p.syncedRev; p.dirty = false; }
      this.pending.clear();
      this._persistLocal(); this._notify();
    },

    _subscribeClaude(col) {
      col.onSnapshot((snap) => {
        let changed = false;
        snap.docChanges().forEach((ch) => {
          const v = ch.doc.data();
          if (!v || v.kind !== 'project') return;
          if (ch.type === 'removed') { delete this.mem.projects[v.id]; changed = true; return; }
          const cur = this.mem.projects[v.id];
          if (!cur || (v.rev || 0) > (cur.rev || 0)) { this.mem.projects[v.id] = v; changed = true; }
        });
        if (changed) this._notify();
      }, () => {});
    },

    /* ---------- projects ---------- */
    list() { return Object.values(this.mem.projects).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); },
    getPacked(id) { return this.mem.projects[id] || null; },
    get(id) { const p = this.mem.projects[id]; return p ? unpackProject(p) : null; },
    async save(project, opts) {
      opts = opts || {};
      const packed = packProject(project);
      packed.kind = 'project';
      const prev = this.mem.projects[project.id];
      packed.savedBy = SESSION;
      packed.updatedAt = Date.now();
      if (this.mode === 'account') {
        const base = prev ? prev.syncedRev || 0 : 0;
        packed.rev = (prev ? prev.rev || 0 : 0) + 1;
        packed.syncedRev = base; packed.dirty = true;
        this.mem.projects[project.id] = packed;
        this._persistLocal();
        const r = await this._push(packed, opts.force ? (prev && prev.syncedRev) || 0 : base, !!opts.force);
        if (r.conflict) {
          packed.dirty = true;
          const remote = unpackProject(Object.assign({}, r.conflict.data, { id: project.id, rev: r.conflict.rev }));
          remote.rev = r.conflict.rev;
          return { conflict: remote };
        }
        project.rev = packed.rev; project.baseRev = packed.rev; project.updatedAt = packed.updatedAt;
        this._persistLocal();
        return r.offline ? { ok: true, offline: true, rev: packed.rev } : { ok: true, rev: packed.rev };
      }
      if (this.mode === 'cloud' && !opts.force) {
        try {
          const remote = await withTimeout(this.db.collection('data/users/' + this.uid).doc('p_' + project.id).get(), 8000);
          const r = remote.exists ? remote.data() : null;
          if (r && (r.rev || 0) > (project.baseRev || 0) && r.savedBy !== SESSION) return { conflict: unpackProject(r) };
        } catch (e) { /* offline: keep local */ }
      }
      packed.rev = Math.max(prev ? prev.rev || 0 : 0, project.baseRev || 0) + 1;
      const size = JSON.stringify(packed).length;
      this.mem.projects[project.id] = packed;
      project.baseRev = packed.rev; project.rev = packed.rev; project.updatedAt = packed.updatedAt;
      this._persistLocal();
      if (this.mode === 'cloud') {
        if (size > 250000) return { error: 'Проект слишком большой для синхронизации в Claude (' + Math.round(size / 1024) + ' КБ). Сохранён на этом устройстве.', local: true };
        try { await this.db.collection('data/users/' + this.uid).doc('p_' + project.id).set(packed); }
        catch (e) { return { error: e && e.code === 'quota_exceeded' ? 'Облачное хранилище заполнено. Удалите старые проекты.' : 'Не удалось синхронизировать, изменения сохранены на этом устройстве.' }; }
      }
      return { ok: true, rev: packed.rev };
    },
    async remove(id) {
      delete this.mem.projects[id];
      const vers = this.mem.versions[id] || [];
      delete this.mem.versions[id];
      idbDel('audio', id);
      this._persistLocal();
      if (this.mode === 'account') { try { await Acc().deleteProject(id); } catch (e) { /* will be resent on next full sync */ } }
      else if (this.mode === 'cloud') {
        const col = this.db.collection('data/users/' + this.uid);
        try { await col.doc('p_' + id).delete(); for (const v of vers) await col.doc(v.docId).delete(); } catch (e) { /* ignore */ }
      }
    },
    versions(id) { return (this.mem.versions[id] || []).slice().sort((a, b) => b.at - a.at); },
    async addVersion(project, label) {
      const packed = packProject(project);
      const v = { kind: 'version', projectId: project.id, at: Date.now(), label: label || 'Версия', rev: project.rev || 0, docId: 'v_' + project.id + '_' + Date.now().toString(36), data: { tracks: packed.tracks, chords: packed.chords, lyrics: packed.lyrics, meta: packed.meta } };
      const list = (this.mem.versions[project.id] = this.mem.versions[project.id] || []);
      list.push(v);
      list.sort((a, b) => b.at - a.at);
      const drop = list.splice(12);
      this._persistLocal();
      if (this.mode === 'account') Acc().pushVersion(v, drop.map((d) => d.docId)).catch(() => {});
      else if (this.mode === 'cloud') {
        const col = this.db.collection('data/users/' + this.uid);
        try { await col.doc(v.docId).set(v); for (const d of drop) await col.doc(d.docId).delete(); } catch (e) { /* ignore */ }
      }
      return v;
    },
    restoreVersionData(v) { return unpackProject({ tracks: v.data.tracks, chords: v.data.chords, lyrics: v.data.lyrics, meta: v.data.meta }); },
    meta() {
      const m = this.mem.meta || {};
      return Object.assign({ collections: [], settings: {}, usage: {}, plan: 'studio', exports: [], onboarded: false }, m);
    },
    async setMeta(patch) {
      const m = Object.assign(this.meta(), patch, { updatedAt: Date.now() });
      m.kind = 'meta';
      this.mem.meta = m;
      this._persistLocal();
      if (this.mode === 'account') { clearTimeout(this._mt); this._mt = setTimeout(() => Acc().pushMeta(this.mem.meta).catch(() => {}), 800); }
      else if (this.mode === 'cloud') { try { await this.db.collection('data/users/' + this.uid).doc('meta').set(m); } catch (e) { /* ignore */ } }
      return m;
    },

    /* ---------- audio ---------- */
    async putAudio(id, rec) {
      const ok = await putLocalAudio(id, rec);
      if (this.mode === 'account') Acc().uploadAudio(id, rec).then(() => Acc().emit()).catch(() => {});
      return ok;
    },
    async getAudio(id) {
      const local = await getLocalAudio(id);
      if (local) return local;
      if (this.mode === 'account') {
        const p = this.mem.projects[id];
        const rec = await Acc().downloadAudio(id, p && p.audio ? p.audio.name : id).catch(() => null);
        if (rec) { await putLocalAudio(id, rec); return rec; }
      }
      return null;
    },
    delAudio(id) { return idbDel('audio', id); },
    packNotes, unpackNotes, packProject, unpackProject
  };
  root.GTSStore = Store;
})(typeof self !== 'undefined' ? self : globalThis);
