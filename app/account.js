/* Аккаунт и синхронизация между устройствами (Supabase: Auth + Postgres + Storage + Realtime).
 * Подключается, если в GTS_CONFIG есть supabase.url и supabase.anonKey и загружен supabase-js. */
(function (root) {
  'use strict';
  const cfg = (root.GTS_CONFIG && root.GTS_CONFIG.supabase) || null;
  const listeners = new Set();
  const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg || 'timeout')), ms))]);
  const ERR = {
    'Invalid login credentials': 'Неверный email или пароль.',
    'Email not confirmed': 'Email ещё не подтверждён. Введите код из письма.',
    'User already registered': 'Аккаунт с этим email уже есть. Войдите или восстановите пароль кодом из письма.',
    'Token has expired or is invalid': 'Код неверный или устарел. Запросите новый.',
    'Password should be at least 6 characters': 'Пароль должен быть не короче 6 символов.',
    'For security purposes, you can only request this after': 'Слишком частые запросы. Подождите минуту.',
    'Failed to fetch': 'Нет связи с сервером. Проверьте интернет.'
  };
  function ru(e) {
    const m = String((e && (e.message || e.error_description)) || e || '');
    for (const k in ERR) if (m.includes(k)) return ERR[k];
    return m || 'Неизвестная ошибка';
  }

  const Account = {
    configured: !!(cfg && cfg.url && cfg.anonKey && root.supabase && root.supabase.createClient),
    client: null, user: null,
    status: 'signed-out',   // signed-out | syncing | synced | offline | error
    lastSync: 0, lastError: '', audioIndex: new Set(), audioBytes: 0,

    on(f) { listeners.add(f); return () => listeners.delete(f); },
    emit() { listeners.forEach((f) => { try { f(this); } catch (e) { /* ignore */ } }); },
    setStatus(s, err) { this.status = s; if (err !== undefined) this.lastError = err; this.emit(); },

    async init() {
      if (!this.configured) return null;
      this.client = root.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'gts-auth' },
        realtime: { params: { eventsPerSecond: 5 } }
      });
      try {
        const { data } = await withTimeout(this.client.auth.getSession(), 6000);
        this.user = data && data.session ? data.session.user : null;
      } catch (e) { this.user = null; this.setStatus('offline', ru(e)); }
      this.client.auth.onAuthStateChange((ev, session) => {
        const was = this.user && this.user.id;
        this.user = session ? session.user : null;
        if (ev === 'SIGNED_OUT' || !this.user) { this.setStatus('signed-out'); this.unsubscribe(); }
        if (this.user && this.user.id !== was && this.onSignedIn) this.onSignedIn(this.user);
        this.emit();
      });
      if (this.user) this.setStatus('syncing');
      return this.user;
    },
    get uid() { return this.user ? this.user.id : null; },
    get email() { return this.user ? this.user.email : ''; },

    /* ----- auth ----- */
    async signIn(email, password) {
      const { error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(ru(error));
    },
    async signUp(email, password) {
      const { data, error } = await this.client.auth.signUp({ email: email.trim(), password });
      if (error) throw new Error(ru(error));
      if (data && data.user && Array.isArray(data.user.identities) && !data.user.identities.length) throw new Error(ERR['User already registered']);
      return { needsCode: !data.session };
    },
    async sendCode(email) {
      const { error } = await this.client.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
      if (error) throw new Error(ru(error));
    },
    async verifyCode(email, code, type) {
      const { error } = await this.client.auth.verifyOtp({ email: email.trim(), token: String(code).trim(), type: type || 'email' });
      if (error) throw new Error(ru(error));
    },
    async changePassword(pw) {
      const { error } = await this.client.auth.updateUser({ password: pw });
      if (error) throw new Error(ru(error));
    },
    async signOut() { this.unsubscribe(); await this.client.auth.signOut(); this.user = null; this.setStatus('signed-out'); },
    async deleteAccount() {
      const files = await this.listAudio();
      if (files.length) await this.client.storage.from('audio').remove(files.map((f) => this.uid + '/' + f.name));
      const { error } = await this.client.rpc('delete_account');
      if (error) throw new Error(ru(error));
      await this.client.auth.signOut();
      this.user = null; this.setStatus('signed-out');
    },

    /* ----- data ----- */
    async listProjects() {
      const { data, error } = await this.client.from('projects').select('id, data, rev, deleted, updated_at').eq('user_id', this.uid);
      if (error) throw error;
      return data || [];
    },
    async pushProject(packed, baseRev, force) {
      const body = Object.assign({}, packed); delete body.syncedRev; delete body.dirty; delete body.savedBy;
      const { data, error } = await this.client.rpc('save_project', { p_id: packed.id, p_data: body, p_base_rev: baseRev || 0, p_force: !!force });
      if (error) throw error;
      return data;
    },
    async deleteProject(id) {
      const { error } = await this.client.rpc('delete_project', { p_id: id });
      if (error) throw error;
      await this.client.storage.from('audio').remove([this.uid + '/' + id]).catch(() => {});
      this.audioIndex.delete(id);
    },
    async listVersions() {
      const { data, error } = await this.client.from('project_versions').select('id, project_id, label, rev, at, data').eq('user_id', this.uid).order('at', { ascending: false }).limit(500);
      if (error) throw error;
      return data || [];
    },
    async pushVersion(v, dropIds) {
      const { error } = await this.client.from('project_versions').upsert({ user_id: this.uid, id: v.docId, project_id: v.projectId, label: v.label, rev: v.rev, at: v.at, data: v.data });
      if (error) throw error;
      if (dropIds && dropIds.length) await this.client.from('project_versions').delete().eq('user_id', this.uid).in('id', dropIds);
    },
    async getMeta() {
      const { data, error } = await this.client.from('user_meta').select('data, updated_at').eq('user_id', this.uid).maybeSingle();
      if (error) throw error;
      return data;
    },
    async pushMeta(meta) {
      const { error } = await this.client.from('user_meta').upsert({ user_id: this.uid, data: meta, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    async listAudio() {
      const { data, error } = await this.client.storage.from('audio').list(this.uid, { limit: 1000 });
      if (error) throw error;
      const files = (data || []).filter((f) => f.name && f.id);
      this.audioIndex = new Set(files.map((f) => f.name));
      this.audioBytes = files.reduce((s, f) => s + ((f.metadata && f.metadata.size) || 0), 0);
      return files;
    },
    async uploadAudio(id, rec) {
      if (!rec || !rec.bytes) return false;
      if (rec.bytes.byteLength > 50 * 1048576) return false;
      // raw bytes (not FormData): the file is stored exactly as recorded/uploaded
      const { error } = await this.client.storage.from('audio').upload(this.uid + '/' + id, rec.bytes.slice(0), { upsert: true, contentType: rec.type || 'application/octet-stream' });
      if (error) throw error;
      this.audioIndex.add(id); this.audioBytes += rec.bytes.byteLength;
      return true;
    },
    async downloadAudio(id, name) {
      if (!this.audioIndex.has(id)) return null;
      const { data, error } = await this.client.storage.from('audio').download(this.uid + '/' + id);
      if (error || !data) return null;
      return { name: name || id, type: data.type, bytes: await data.arrayBuffer() };
    },
    subscribe(onRow) {
      this.unsubscribe();
      this.channel = this.client.channel('projects-' + this.uid)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: 'user_id=eq.' + this.uid }, (p) => p.new && onRow(p.new))
        .subscribe();
    },
    unsubscribe() { if (this.channel) { try { this.client.removeChannel(this.channel); } catch (e) { /* ignore */ } this.channel = null; } },
    ru
  };
  root.GTSAccount = Account;
})(typeof self !== 'undefined' ? self : window);
