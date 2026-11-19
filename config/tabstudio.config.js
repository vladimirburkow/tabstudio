/* Общие настройки всех сборок Tab Studio (сайт, десктоп, iOS, Android).
 * Заполните перед сборкой. Значения попадают в config.js каждой платформы. */
export default {
  version: '1.1.0',
  // Аккаунты и синхронизация: Supabase → Project Settings → API (см. supabase/README.md)
  supabase: {
    url: '',          // например 'https://abcdefgh.supabase.co'
    anonKey: ''       // публичный anon-ключ (его можно показывать в клиенте; данные защищает RLS)
  },
  privacyUrl: 'https://example.com/tabstudio/privacy',
  // Реклама только в мобильном приложении. Сейчас стоят ТЕСТОВЫЕ ID Google.
  mobileAds: {
    ads: true,
    testAds: true,
    testDevices: [],
    consentDebugEEA: false,
    maxAdContentRating: 'ParentalGuidance',
    interstitialMinGapSec: 180,
    interstitialEvery: { process: 1, export: 2 },
    admob: {
      ios: { banner: 'ca-app-pub-3940256099942544/2435281174', interstitial: 'ca-app-pub-3940256099942544/4411468910' },
      android: { banner: 'ca-app-pub-3940256099942544/9214589741', interstitial: 'ca-app-pub-3940256099942544/1033173712' }
    }
  }
};
