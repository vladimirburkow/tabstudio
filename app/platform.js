/* Платформенный слой: веб / iOS / Android (Capacitor). Реклама AdMob, согласие (UMP + ATT), сохранение файлов через системное меню «Поделиться». */
(function (root) {
  'use strict';
  const Cap = root.Capacitor;
  const native = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const os = native && Cap.getPlatform ? Cap.getPlatform() : 'web';
  const cfg = Object.assign({ edition: 'web', ads: false, testAds: true, admob: {} }, root.GTS_CONFIG || {});
  const P = (name) => (Cap && Cap.Plugins ? Cap.Plugins[name] : null);

  const Ads = {
    enabled: native && !!cfg.ads,
    ready: false, canRequest: false, bannerShown: false, interstitialReady: false,
    lastInterstitial: 0, sessionStart: Date.now(), counters: {},
    privacyRequired: false, consentStatus: 'UNKNOWN', tracking: null,
    ids() { return (cfg.admob && cfg.admob[os]) || {}; },
    async init() {
      if (!this.enabled) return;
      const AdMob = P('AdMob');
      if (!AdMob) { this.enabled = false; return; }
      try {
        // 1) Google UMP consent (GDPR / US states); 2) Apple App Tracking Transparency; 3) SDK init
        let info = await AdMob.requestConsentInfo(cfg.testAds && cfg.consentDebugEEA ? { debugGeography: 1, testDeviceIdentifiers: cfg.testDevices || [] } : {});
        if (info.isConsentFormAvailable && info.status === 'REQUIRED') info = await AdMob.showConsentForm();
        this.consentStatus = info.status;
        this.privacyRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
        this.canRequest = info.canRequestAds !== false;
        if (os === 'ios') {
          const t = await AdMob.trackingAuthorizationStatus();
          if (t.status === 'notDetermined') await AdMob.requestTrackingAuthorization();
          this.tracking = (await AdMob.trackingAuthorizationStatus()).status;
        }
        await AdMob.initialize({ initializeForTesting: !!cfg.testAds, testingDevices: cfg.testDevices || [], maxAdContentRating: cfg.maxAdContentRating || 'ParentalGuidance' });
        AdMob.addListener('bannerAdSizeChanged', (s) => setAdHeight(s && s.height ? s.height : 0));
        AdMob.addListener('bannerAdFailedToLoad', () => setAdHeight(0));
        AdMob.addListener('interstitialAdDismissed', () => { this.interstitialReady = false; this.prepareInterstitial(); });
        AdMob.addListener('interstitialAdFailedToShow', () => { this.interstitialReady = false; this.prepareInterstitial(); });
        this.ready = true;
        if (this.canRequest) { this.showBanner(); this.prepareInterstitial(); }
      } catch (e) {
        this.ready = false;
      }
    },
    async showBanner() {
      const AdMob = P('AdMob'); const id = this.ids().banner;
      if (!this.ready || !this.canRequest || !id || this.bannerShown) return;
      try {
        await AdMob.showBanner({ adId: id, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER', margin: 0, isTesting: !!cfg.testAds, npa: this.tracking === 'denied' });
        this.bannerShown = true;
      } catch (e) { setAdHeight(0); }
    },
    async hideBanner() { if (!this.bannerShown) return; try { await P('AdMob').hideBanner(); } catch (e) { /* ignore */ } this.bannerShown = false; setAdHeight(0); },
    async resumeBanner() { if (!this.ready || this.bannerShown) return; try { await P('AdMob').resumeBanner(); this.bannerShown = true; } catch (e) { this.showBanner(); } },
    async prepareInterstitial() {
      const id = this.ids().interstitial;
      if (!this.ready || !this.canRequest || !id) return;
      try { await P('AdMob').prepareInterstitial({ adId: id, isTesting: !!cfg.testAds, npa: this.tracking === 'denied' }); this.interstitialReady = true; } catch (e) { this.interstitialReady = false; }
    },
    /* Full-screen ad only at natural breaks, with a frequency cap. Resolves when the ad is closed (or immediately). */
    async maybeInterstitial(reason) {
      if (!this.ready || !this.interstitialReady) return false;
      const now = Date.now(), gap = (cfg.interstitialMinGapSec || 180) * 1000;
      this.counters[reason] = (this.counters[reason] || 0) + 1;
      const every = (cfg.interstitialEvery && cfg.interstitialEvery[reason]) || 1;
      if (now - this.sessionStart < 60000 || now - this.lastInterstitial < gap || this.counters[reason] % every !== 0) return false;
      const AdMob = P('AdMob');
      return new Promise((resolve) => {
        let done = false;
        const fin = (ok) => { if (done) return; done = true; resolve(ok); };
        AdMob.addListener('interstitialAdDismissed', () => fin(true)).then((h) => setTimeout(() => h.remove && h.remove(), 120000));
        AdMob.showInterstitial().then(() => { this.lastInterstitial = Date.now(); }).catch(() => fin(false));
        setTimeout(() => fin(false), 90000);
      });
    },
    async privacyOptions() { try { await P('AdMob').showPrivacyOptionsForm(); return true; } catch (e) { return false; } }
  };
  function setAdHeight(h) { document.documentElement.style.setProperty('--ad-h', Math.round(h || 0) + 'px'); document.documentElement.classList.toggle('has-ad', h > 0); }

  function toBase64(data) {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  const Platform = {
    native, os, cfg, Ads,
    edition: cfg.edition,
    get isMobileEdition() { return cfg.edition === 'mobile'; },
    get isFree() { return ['mobile', 'site', 'desktop'].includes(cfg.edition); },
    tauri: !!root.__TAURI__,
    async init() {
      document.documentElement.classList.add('pf-' + os);
      if (cfg.edition === 'mobile') document.documentElement.classList.add('ed-mobile');
      if (['mobile', 'site', 'desktop'].includes(cfg.edition)) document.documentElement.classList.add('ed-free');
      if (root.__TAURI__) {
        document.documentElement.classList.add('pf-desktop');
        // external links open in the system browser
        document.addEventListener('click', (e) => {
          const a = e.target.closest && e.target.closest('a[href^="http"]');
          if (!a || !root.__TAURI__.opener) return;
          e.preventDefault(); root.__TAURI__.opener.openUrl(a.href);
        });
      }
      if (!native) return;
      try { const SB = P('StatusBar'); if (SB) { await SB.setStyle({ style: 'DARK' }); if (os === 'android') await SB.setBackgroundColor({ color: '#121419' }); } } catch (e) { /* ignore */ }
      try { const SS = P('SplashScreen'); if (SS) setTimeout(() => SS.hide(), 300); } catch (e) { /* ignore */ }
      Ads.init();
    },
    /* Native: write to the cache directory and open the system share sheet (Files, AirDrop, mail, Guitar Pro…). */
    async saveFile(filename, data) {
      const T = root.__TAURI__;
      if (T && T.dialog && T.fs) {
        const ext = (filename.split('.').pop() || '').toLowerCase();
        const path = await T.dialog.save({ defaultPath: filename, filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [] });
        if (!path) return false;
        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
        await T.fs.writeFile(path, bytes);
        return true;
      }
      if (!native) return null;
      const FS = P('Filesystem'), Share = P('Share');
      if (!FS || !Share) return null;
      const safe = filename.replace(/[\\/:*?"<>|]+/g, '_');
      const w = await FS.writeFile({ path: safe, data: toBase64(data), directory: 'CACHE', recursive: true });
      try { await Share.share({ title: safe, url: w.uri, dialogTitle: 'Сохранить или отправить' }); }
      catch (e) { if (!/cancel/i.test(String(e && (e.message || e)))) throw e; return false; }
      return true;
    },
    haptic() { try { const H = P('Haptics'); if (H) H.impact({ style: 'LIGHT' }); } catch (e) { /* ignore */ } }
  };
  root.GTSPlatform = Platform;
})(window);
