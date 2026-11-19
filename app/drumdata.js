/* Данные ударных: инструменты, библиотека ритмов, 40 рудиментов PAS.
 * Ячейки: '.' пауза, 'x' удар, 'X' акцент, 'g' призрачная нота (тихо). Длина строки = такты × доли × деления доли. */
(function (root) {
  'use strict';
  const INSTR = {
    crash: { ru: 'Крэш', short: 'CR', midi: 49, group: 'kit' },
    ride: { ru: 'Райд', short: 'RD', midi: 51, group: 'kit' },
    hho: { ru: 'Хай-хэт открытый', short: 'HO', midi: 46, group: 'kit' },
    hhc: { ru: 'Хай-хэт закрытый', short: 'HH', midi: 42, group: 'kit' },
    hhp: { ru: 'Хай-хэт педалью', short: 'HP', midi: 44, group: 'kit' },
    tomh: { ru: 'Том высокий', short: 'T1', midi: 50, group: 'kit' },
    tomm: { ru: 'Том средний', short: 'T2', midi: 47, group: 'kit' },
    tomf: { ru: 'Напольный том', short: 'FT', midi: 43, group: 'kit' },
    snare: { ru: 'Малый барабан', short: 'SN', midi: 38, group: 'kit' },
    rim: { ru: 'Римшот / сайдстик', short: 'RM', midi: 37, group: 'kit' },
    clap: { ru: 'Хлопок', short: 'CP', midi: 39, group: 'kit' },
    kick: { ru: 'Бочка', short: 'BD', midi: 36, group: 'kit' },
    sub: { ru: 'Саб 808', short: '808', midi: 35, group: 'kit' },
    cowbell: { ru: 'Ковбелл', short: 'CB', midi: 56, group: 'perc' },
    agogoh: { ru: 'Агого высокий', short: 'AH', midi: 67, group: 'perc' },
    agogol: { ru: 'Агого низкий', short: 'AL', midi: 68, group: 'perc' },
    claves: { ru: 'Клавес', short: 'CL', midi: 75, group: 'perc' },
    shaker: { ru: 'Маракас / шейкер', short: 'SH', midi: 70, group: 'perc' },
    tamb: { ru: 'Тамбурин', short: 'TB', midi: 54, group: 'perc' },
    guiro: { ru: 'Гуиро', short: 'GU', midi: 73, group: 'perc' },
    congah: { ru: 'Конга высокая', short: 'CH', midi: 63, group: 'perc' },
    congal: { ru: 'Конга низкая', short: 'CO', midi: 64, group: 'perc' },
    bongoh: { ru: 'Бонго высокий', short: 'BH', midi: 60, group: 'perc' },
    bongol: { ru: 'Бонго низкий', short: 'BL', midi: 61, group: 'perc' },
    timbh: { ru: 'Тимбалес высокий', short: 'TH', midi: 65, group: 'perc' },
    timbl: { ru: 'Тимбалес низкий', short: 'TL', midi: 66, group: 'perc' }
  };
  const ORDER = Object.keys(INSTR);
  const E8 = 'x.x.x.x.x.x.x.x.', Q = 'x...x...x...x...', B24 = '....x.......x...';
  const P = (id, name, cat, bpm, o) => Object.assign({ id, name, cat, bpm, beats: 4, sub: 4, bars: 1, swing: 0 }, o);
  const PATTERNS = [
    // 10 базовых ритмов
    P('rockyou', 'We Will Rock You', 'Базовые', 81, { t: { kick: 'x.x.....x.x.....', clap: '....X.......X...' }, d: 'Два удара бочки и хлопок: стадионный ритм Queen.' }),
    P('backbeat', 'Бэкбит', 'Базовые', 100, { t: { hhc: E8, snare: B24, kick: 'x.......x.......' }, d: 'Основа рока и поп-музыки: бочка на 1 и 3, малый на 2 и 4.' }),
    P('rockbeat', 'Рок-бит', 'Базовые', 112, { t: { hhc: E8, snare: B24, kick: 'x.......x.x.....' }, d: 'Бэкбит с дополнительной бочкой на «3 и».' }),
    P('popbeat', 'Поп-бит', 'Базовые', 104, { t: { hhc: E8, snare: B24, kick: 'x.....x.x.......' }, d: 'Синкопа бочкой на «2 и» тянет ритм вперёд.' }),
    P('fourfloor', 'Четыре в пол', 'Базовые', 122, { t: { hho: '..x...x...x...x.', hhc: 'x...x...x...x...', snare: B24, kick: Q }, d: 'Бочка на каждую долю: диско, хаус, техно.' }),
    P('onedrop', 'One Drop', 'Базовые', 76, { t: { hhc: E8, rim: '........X.......', kick: '........x.......' }, d: 'Регги: первая доля пустая, бочка и римшот вместе на 3.' }),
    P('motown', 'Мотаун', 'Базовые', 116, { t: { tamb: E8, hhc: E8, snare: 'x...X...x...X...', kick: 'x.......x.....x.' }, d: 'Малый на каждую долю с акцентом на 2 и 4, тамбурин восьмыми.' }),
    P('slowblues', 'Медленный блюз (12/8)', 'Базовые', 60, { sub: 3, t: { ride: 'xxxxxxxxxxxx', snare: '...X.....X..', kick: 'x.....x....g' }, d: 'Четыре доли по три триольные восьмые.' }),
    P('shuffle', 'Шаффл', 'Базовые', 112, { sub: 3, t: { hhc: 'x.xx.xx.xx.x', snare: '...X.....X..', kick: 'x.....x.....' }, d: 'Восьмые «с прыжком»: первая и третья триольная.' }),
    P('swing', 'Медленный свинг', 'Базовые', 92, { sub: 3, t: { ride: 'x..x.xx..x.x', hhp: '...x.....x..', kick: 'g..g..g..g..' }, d: 'Джазовый райд «спэнг-а-лэнг», хай-хэт педалью на 2 и 4.' }),
    // жанры
    P('funk', 'Фанк', 'Стили', 98, { t: { hhc: 'xxxxxxxxxxxxxxxx', snare: '.g..X..g.g..X..g', kick: 'x.x.......x..x..' }, d: 'Шестнадцатые на хэте и призрачные ноты малого.' }),
    P('hiphop', 'Хип-хоп (бум-бэп)', 'Стили', 90, { swing: 22, t: { hhc: E8, snare: B24, kick: 'x......x..x.....' }, d: 'Тяжёлая бочка с оттяжкой, лёгкий свинг.' }),
    P('rnb', 'R&B', 'Стили', 86, { swing: 14, t: { hhc: 'x.xxx.x.x.xxx.x.', rim: '....X.......X...', kick: 'x..x....x.x....x' }, d: 'Мягкий римшот и плотные шестнадцатые хэта.' }),
    P('bossa', 'Босса-нова', 'Стили', 130, { bars: 2, t: { hhc: E8 + E8, rim: 'x..x..x...x..x..x..x..x...x..x..', kick: 'x..xx..xx..xx..xx..xx..xx..xx..x' }, d: 'Бразильская клаве римшотом поверх «качающейся» бочки.' }),
    P('reggaeton', 'Реггетон (dembow)', 'Стили', 96, { t: { hhc: E8, snare: '...x..x....x..x.', kick: Q }, d: 'Бочка на доли и характерная синкопа малого.' }),
    P('waltz', 'Вальс 3/4', 'Стили', 140, { beats: 3, t: { hhc: 'x.x.x.x.x.x.', snare: '....x...x...', kick: 'x...........' }, d: 'Раз-два-три: бочка на первую, малый на вторую и третью.' }),
    P('six8', 'Баллада 6/8', 'Стили', 66, { beats: 2, sub: 6, t: { hhc: 'xxxxxxxxxxxx', snare: '......X.....', kick: 'x....x......' }, d: 'Две доли по три восьмые, малый на «4».' }),
    P('rock1', 'Рок 1 (шаблон)', 'Стили', 120, { t: { hhc: E8, snare: B24, kick: 'x.x...x.x.x...x.' }, d: 'Насыщенная бочка в духе хард-рока.' }),
    // электроника
    P('house', 'Дип-хаус', 'Электроника', 122, { t: { hho: '..x...x...x...x.', hhc: 'gg.gg.gg.gg.gg.g', clap: B24, kick: Q }, d: 'Открытый хэт на слабые восьмые, хлопок на 2 и 4.' }),
    P('techno', 'Техно', 'Электроника', 132, { t: { hho: '..x...x...x...x.', hhc: '..........x.....', clap: B24, kick: Q }, d: 'Бочка в пол и открытый хэт на «и».' }),
    P('ukg', 'UK garage (2-step)', 'Электроника', 132, { swing: 30, t: { rim: '...x..x....x.x..', hhc: '..x...x...x...x.', clap: B24, kick: 'x.........x.....' }, d: 'Пропущенная бочка на 3 и свинг шестнадцатых.' }),
    P('dubstep', 'Дабстеп', 'Электроника', 140, { t: { hho: '......x.......x.', hhc: 'x.x.x...x.x.x...', snare: '........X.......', kick: 'x.........x.....' }, d: 'Половинный темп: малый на 3.' }),
    P('trap', 'Трэп', 'Электроника', 140, { t: { hhc: 'x.x.x.xxx.x.xxxx', snare: '........X.......', kick: 'x......x..x.....', sub: 'x......x..x.....' }, d: 'Дроби хай-хэта и саб 808 вместе с бочкой.' }),
    P('dnb', "Драм-н-бейс", 'Электроника', 174, { t: { hhc: E8, snare: B24, kick: 'x.........x.....' }, d: 'Быстрый двухшаговый ритм: бочка на 1 и «3 и».' }),
    P('jungle', 'Джангл', 'Электроника', 165, { t: { hhc: E8, snare: '....X..g.g..X..g', kick: 'x.x.......xx....' }, d: 'Нарезанный брейк с призрачными нотами.' }),
    P('footwork', 'Футворк', 'Электроника', 160, { t: { rim: 'xxxxxxxxxxxxxxxx', hhc: '..x...x...x...x.', clap: B24, kick: 'x..x..x.x..x..x.' }, d: 'Триольная бочка на 160 BPM.' }),
    // брейкбиты
    P('funkydrummer', 'The Funky Drummer', 'Брейкбиты', 100, { bars: 2, t: { hho: '..........x...............x.....', hhc: 'xxxxxxxxxx.xxxxxxxxxxxxxxx.xxxxx', snare: '....X..g.g.gX..g.g..X..g.g.gX..g', kick: 'x.x.......x..x..x.x.......x.....' }, d: 'По мотивам знаменитого брейка: шестнадцатые и призрачные ноты.' }),
    P('impeach', 'Impeach the President', 'Брейкбиты', 96, { bars: 2, t: { hho: '....................x...........', hhc: 'x.x.x.x.x.x.x.x.x.x...x.x.x.x.x.', snare: '....X.......X.......X.......X...', kick: 'x......x.x......x......x...x....' }, d: 'Классика сэмплинга: упругая бочка и открытый хэт.' }),
    P('levee', 'When the Levee Breaks', 'Брейкбиты', 72, { t: { hhc: E8, snare: B24, kick: 'xx........xx....' }, d: 'Тяжёлый и медленный: двойная бочка на 1 и «3 и».' }),
    P('coldsweat', 'Cold Sweat', 'Брейкбиты', 112, { bars: 2, t: { ride: E8 + E8, snare: '........X..X..X.....X...X..X....', kick: 'x.........x.......x.....x.......' }, d: 'Фанк с малым на смещённых долях.' }),
    P('mardigras', 'Take Me to the Mardi Gras', 'Брейкбиты', 100, { t: { agogoh: 'x...x...x...x...', agogol: '..x...x...x...x.', hhc: E8, snare: '........X.......', kick: 'x.........x..x..' }, d: 'Брейк с агого — любимец хип-хоп продюсеров.' }),
    // латина и мир
    P('salsa', 'Сальса (клаве 3-2)', 'Латина', 180, { bars: 2, t: { claves: 'x..x..x.........x...x...........'.slice(0, 32), cowbell: 'x...x...x...x...x...x...x...x...', timbh: 'x.xx.x.xx.x.x.x.x.xx.x.xx.x.x.x.', guiro: 'x.xxx.xxx.xxx.xxx.xxx.xxx.xxx.xx', congah: '......xx......xx......xx......xx', congal: '....x.......x.......x.......x...', bongoh: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.', shaker: E8 + E8, kick: '......x.......x.......x.......x.' }, d: 'Сон-клаве 3-2, каскара, гуиро, тумбао конг.' }),
    P('samba', 'Самба', 'Латина', 100, { t: { shaker: 'xxxxxxxxxxxxxxxx', tamb: 'x.xxx.xxx.xxx.xx', agogoh: 'x..x..x.x..x..x.', snare: 'g.gg.gg.g.gg.gg.', kick: 'x.......x.......', tomf: '....x.......x...' }, d: 'Сурду на 2 и 4, тамбурин и агого.' }),
    P('afro', 'Афро 12/8', 'Латина', 110, { sub: 3, t: { cowbell: 'x.x.xx.x.x.x', shaker: 'xxxxxxxxxxxx', congah: '..x..x..x..x', congal: 'x.....x.....', kick: 'x.....x.....' }, d: 'Колокольный паттерн «стандарт 12/8».' })
  ];
  // salsa clave: 3-side (1, 2&, 4) + 2-side (2, 3) in 16ths across two bars
  PATTERNS.find((p) => p.id === 'salsa').t.claves = 'x.....x.....x.......x...x.......';

  /* 40 PAS rudiments. Tokens per grid step: R/L stroke, '>' accent, 'f' flam, 'd' drag, 'z' buzz, '-' rest. sub = steps per beat. */
  const RUDIMENTS = [
    ['Одиночные удары (Single Stroke Roll)', 'Дроби', 4, 'R L R L R L R L'],
    ['Single Stroke Four', 'Дроби', 6, 'R L R >L - - L R L >R - -'],
    ['Single Stroke Seven', 'Дроби', 6, 'R L R L R L >R - - - - - L R L R L R >L - - - - -'],
    ['Многоударная дробь (Multiple Bounce Roll)', 'Дроби', 4, 'zR zL zR zL zR zL zR zL'],
    ['Тройные удары (Triple Stroke Roll)', 'Дроби', 6, 'R R R L L L R R R L L L'],
    ['Двойные удары (Double Stroke Roll)', 'Дроби', 4, 'R R L L R R L L'],
    ['Пятиударная дробь (Five Stroke Roll)', 'Дроби', 8, 'R R L L >R - - - L L R R >L - - -'],
    ['Шестиударная дробь (Six Stroke Roll)', 'Дроби', 8, '>R - L L R R >L - >R - L L R R >L -'],
    ['Семиударная дробь (Seven Stroke Roll)', 'Дроби', 8, 'L L R R L L >R - R R L L R R >L -'],
    ['Девятиударная дробь (Nine Stroke Roll)', 'Дроби', 8, 'R R L L R R L L >R - - - - - - -'],
    ['Десятиударная дробь (Ten Stroke Roll)', 'Дроби', 8, 'R R L L R R L L >R - >L - - - - -'],
    ['Одиннадцатиударная (Eleven Stroke Roll)', 'Дроби', 8, 'R R L L R R L L R R >L - - - - -'],
    ['Тринадцатиударная (Thirteen Stroke Roll)', 'Дроби', 8, 'R R L L R R L L R R L L >R - - -'],
    ['Пятнадцатиударная (Fifteen Stroke Roll)', 'Дроби', 8, 'R R L L R R L L R R L L R R >L - - - - - - - - - - - - - - - - -'],
    ['Семнадцатиударная (Seventeen Stroke Roll)', 'Дроби', 8, 'R R L L R R L L R R L L R R L L >R - - - - - - -'],
    ['Парадидл (Single Paradiddle)', 'Парадидлы', 4, '>R L R R >L R L L'],
    ['Двойной парадидл (Double Paradiddle)', 'Парадидлы', 6, '>R L R L R R >L R L R L L'],
    ['Тройной парадидл (Triple Paradiddle)', 'Парадидлы', 4, '>R L R L R L R R >L R L R L R L L'],
    ['Парадидл-дидл (Single Paradiddle-Diddle)', 'Парадидлы', 6, '>R L R R L L >R L R R L L'],
    ['Флэм (Flam)', 'Флэмы', 2, 'fR - fL -'],
    ['Флэм-акцент (Flam Accent)', 'Флэмы', 3, 'f>R L R f>L R L'],
    ['Флэм-тэп (Flam Tap)', 'Флэмы', 4, 'fR R fL L fR R fL L'],
    ['Фламакью (Flamacue)', 'Флэмы', 4, 'fR >L R L fR - - - fL >R L R fL - - -'],
    ['Флэм-парадидл (Flam Paradiddle)', 'Флэмы', 4, 'f>R L R R f>L R L L'],
    ['Single Flammed Mill', 'Флэмы', 4, 'fR R L R fL L R L'],
    ['Флэм-парадидл-дидл (Flam Paradiddle-Diddle)', 'Флэмы', 6, 'f>R L R R L L f>L R L L R R'],
    ['Патафлафла (Pataflafla)', 'Флэмы', 4, 'fR L R fL fR L R fL'],
    ['Швейцарский триоль (Swiss Army Triplet)', 'Флэмы', 3, 'fR R L fR R L'],
    ['Обратный флэм-тэп (Inverted Flam Tap)', 'Флэмы', 4, 'fR L fL R fR L fL R'],
    ['Флэм-драг (Flam Drag)', 'Флэмы', 6, 'f>R - dL - R - f>L - dR - L -'],
    ['Драг (Drag)', 'Драги', 2, 'dR - dL -'],
    ['Single Drag Tap', 'Драги', 2, 'dR >L dL >R'],
    ['Double Drag Tap', 'Драги', 3, 'dR dR >L dL dL >R'],
    ['Урок 25 (Lesson 25)', 'Драги', 4, 'dR L >R - dL R >L -'],
    ['Single Dragadiddle', 'Драги', 4, '>R dR L R R >L dL R L L - -'],
    ['Драг-парадидл №1 (Drag Paradiddle #1)', 'Драги', 6, '>R dR L R R - >L dL R L L -'],
    ['Драг-парадидл №2 (Drag Paradiddle #2)', 'Драги', 6, '>R dR dR L R R >L dL dL R L L'],
    ['Ратамакью (Single Ratamacue)', 'Драги', 6, 'dR L R >L - - dL R L >R - -'],
    ['Двойной ратамакью (Double Ratamacue)', 'Драги', 6, 'dR dR L R >L - dL dL R L >R -'],
    ['Тройной ратамакью (Triple Ratamacue)', 'Драги', 6, 'dR dR dR L R >L dL dL dL R L >R']
  ].map(([name, cat, sub, seq], i) => ({ n: i + 1, name, cat, sub, steps: seq.split(' ').map(parseStroke) }));
  function parseStroke(tok) {
    if (tok === '-') return null;
    const s = { hand: tok.slice(-1), accent: tok.includes('>'), flam: tok.includes('f'), drag: tok.includes('d'), buzz: tok.includes('z') };
    return s;
  }
  root.GTSDrumData = { INSTR, ORDER, PATTERNS, RUDIMENTS };
})(typeof self !== 'undefined' ? self : window);
