# Tab Studio

Табулатуры, аккорды и ноты из записи гитары. Один код (`app/`) собирается в четыре версии:

| Версия | Технология | Где | Реклама |
|---|---|---|---|
| **Сайт** | статический сайт + PWA (устанавливается, работает офлайн) | любой хостинг с HTTPS | нет |
| **Десктоп** | Tauri 2 | Windows, macOS, Linux | нет |
| **iOS / Android** | Capacitor 8 | App Store, Google Play | AdMob |

Во всех версиях можно войти в один аккаунт. Проекты, история версий, коллекции, настройки и исходные записи синхронизируются между устройствами. Без входа всё работает локально.

```
app/                    код приложения (общий)
config/tabstudio.config.js   настройки: Supabase, ссылка на политику, реклама
scripts/build-app.mjs   сборка app/ под платформу (библиотеки и шрифты кладутся локально)
supabase/               схема базы и инструкция по серверу аккаунтов
platforms/web/          сайт: manifest, service worker, иконки, заголовки безопасности, nginx.conf
platforms/desktop/      Tauri: src-tauri/ (Rust), иконки, права доступа
platforms/mobile/       Capacitor: ios/, android/, материалы App Store, docs/PUBLISHING.md
.github/workflows/      CI: установщики для Windows/macOS/Linux, публикация сайта на GitHub Pages
```

## 1. Подготовка (один раз)
1. Node.js 20+. В корне: `npm install`.
2. Сервер аккаунтов: создайте проект Supabase по `supabase/README.md`, впишите URL и anon-ключ в `config/tabstudio.config.js`.

## 2. Сайт
```bash
npm run build:web        # → platforms/web/dist
npm run serve:web        # локальная проверка на http://localhost:8080
```
Загрузите `platforms/web/dist` на любой хостинг с HTTPS: Netlify, Vercel, Cloudflare Pages, GitHub Pages (`.github/workflows/web.yml`) или свой nginx (`platforms/web/nginx.conf`).
- В `_headers` / `nginx.conf` замените `YOUR-PROJECT` на поддомен вашего проекта Supabase.
- HTTPS обязателен: без него браузер не даст доступ к микрофону и не включит офлайн-режим.

## 3. Десктоп
Нужны Rust (rustup.rs) и системные зависимости Tauri (tauri.app → Prerequisites).
```bash
cd platforms/desktop && npm install && cd ../..
npm run dev:desktop      # запуск в режиме разработки
npm run build:desktop    # установщик для текущей ОС → platforms/desktop/src-tauri/target/release/bundle/
```
Установщики сразу для всех ОС собирает GitHub Actions: Actions → **Desktop installers** → Run workflow. Результат появится черновиком релиза.
- **macOS:** без подписи Apple Developer ID при первом запуске нужно открыть приложение через правый клик → «Открыть». Для подписи и нотаризации добавьте секреты `APPLE_*` в репозиторий (см. workflow).
- **Windows:** без сертификата подписи SmartScreen покажет предупреждение «Неизвестный издатель».
- **Linux:** запись с микрофона зависит от WebKitGTK и может быть недоступна. Загрузка файлов работает.

## 4. iOS и Android
См. `platforms/mobile/docs/PUBLISHING.md`.
```bash
cd platforms/mobile && npm install && npm run ios
```

## 5. Обновление версии
Меняйте `version` в `config/tabstudio.config.js`, `platforms/desktop/src-tauri/tauri.conf.json` и `Cargo.toml`, а для мобильной версии — Version/Build в Xcode и `versionCode` в `android/app/build.gradle`.
