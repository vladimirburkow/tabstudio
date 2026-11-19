// Сборка веб-кода Tab Studio для платформы: node scripts/build-app.mjs <web|desktop|mobile> [outDir]
// Копирует app/, кладёт библиотеки и шрифты локально (работа офлайн), генерирует config.js с редакцией.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
const OUT = {
  web: 'platforms/web/dist',
  desktop: 'platforms/desktop/dist',
  mobile: 'platforms/mobile/www'
};
if (!OUT[target]) { console.error('Укажите платформу: web | desktop | mobile'); process.exit(1); }
const out = path.resolve(root, process.argv[3] || OUT[target]);
const cfgPath = process.env.TABSTUDIO_CONFIG ? path.resolve(process.env.TABSTUDIO_CONFIG) : path.join(root, 'config/tabstudio.config.js');
const cfg = (await import(pathToFileURL(cfgPath).href)).default;
const nm = (p) => {
  for (const base of [root, path.join(root, 'platforms', target)]) { const f = path.join(base, 'node_modules', p); if (fs.existsSync(f)) return f; }
  throw new Error('Не найден ' + p + ': выполните npm install в корне репозитория');
};

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });
fs.cpSync(path.join(root, 'app'), out, { recursive: true });
fs.copyFileSync(nm('@coderline/alphatab/dist/alphaTab.min.js'), path.join(out, 'vendor/alphaTab.min.js'));
fs.copyFileSync(nm('jspdf/dist/jspdf.umd.min.js'), path.join(out, 'vendor/jspdf.umd.min.js'));
fs.copyFileSync(nm('@supabase/supabase-js/dist/umd/supabase.js'), path.join(out, 'vendor/supabase.js'));
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });
const faces = [['Unbounded', 'unbounded', [500, 600, 700]], ['IBM Plex Sans', 'ibm-plex-sans', [400, 500, 600]], ['JetBrains Mono', 'jetbrains-mono', [500, 700]]];
let css = '';
for (const [family, pkg, weights] of faces) for (const w of weights) for (const sub of ['cyrillic', 'latin']) {
  const file = `${pkg}-${sub}-${w}-normal.woff2`;
  fs.copyFileSync(nm(`@fontsource/${pkg}/files/${file}`), path.join(out, 'fonts', file));
  const range = sub === 'cyrillic' ? 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116' : 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
  css += `@font-face{font-family:'${family}';font-style:normal;font-weight:${w};font-display:swap;src:url(${file}) format('woff2');unicode-range:${range};}\n`;
}
fs.writeFileSync(path.join(out, 'fonts/fonts.css'), css);

const edition = target === 'web' ? 'site' : target;
const runtime = { edition, version: cfg.version, privacyUrl: cfg.privacyUrl };
if (cfg.supabase && cfg.supabase.url && cfg.supabase.anonKey) runtime.supabase = cfg.supabase;
if (target === 'mobile') Object.assign(runtime, cfg.mobileAds);
fs.writeFileSync(path.join(out, 'config.js'), '/* сгенерировано scripts/build-app.mjs из config/tabstudio.config.js */\nwindow.GTS_CONFIG = ' + JSON.stringify(runtime, null, 2) + ';\n');

let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
html = html
  .replace(/<link rel="preconnect"[^>]*>\n?/g, '')
  .replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link href="fonts/fonts.css" rel="stylesheet">')
  .replace(/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\/[\d.]+\/jspdf\.umd\.min\.js/, 'vendor/jspdf.umd.min.js')
  .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/@coderline\/alphatab@[\d.]+\/dist\/alphaTab\.min\.js/, 'vendor/alphaTab.min.js')
  .replace('<script src="account.js"></script>', '<script src="config.js"></script>\n<script src="vendor/supabase.js"></script>\n<script src="account.js"></script>');
if (target === 'web') {
  html = html.replace('</head>', '<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icons/icon-192.png">\n<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">\n<meta name="description" content="Tab Studio: табулатуры, аккорды и ноты из записи гитары. Редактор табов, квинтовый круг, 63 гаммы, генератор прогрессий.">\n</head>');
  html = html.replace('</body>', `<script>if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');</script>\n</body>`);
  fs.cpSync(path.join(root, 'platforms/web/public'), out, { recursive: true });
  // service worker cache list = every file of the build
  const files = [];
  (function walk(d, rel) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f), r = rel ? rel + '/' + f : f; if (fs.statSync(p).isDirectory()) walk(p, r); else if (!/^(sw\.js|_headers|netlify\.toml|vercel\.json|nginx\.conf)$/.test(r)) files.push(r); } })(out, '');
  const sw = fs.readFileSync(path.join(out, 'sw.js'), 'utf8').replace('__FILES__', JSON.stringify(['./'].concat(files))).replace('__VERSION__', cfg.version + '-' + Date.now().toString(36));
  fs.writeFileSync(path.join(out, 'sw.js'), sw);
}
if (/https:\/\/(cdn|fonts)/.test(html)) throw new Error('В index.html остались внешние ссылки');
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log(`Tab Studio ${cfg.version} · ${target} → ${path.relative(root, out)} ${runtime.supabase ? '(аккаунты включены)' : '(аккаунты выключены: заполните supabase в config/tabstudio.config.js)'}`);
