// Цвет фона логотипа менеджера: берём пиксели по краю картинки и смотрим, какого цвета больше всего.
// Если фон сплошной (например, белый) — на сайте вокруг логотипа рисуется скруглённая «плашка» того же цвета,
// и логотип не выглядит вырезанным прямоугольником. Прозрачный или пёстрый край — плашки нет.
// Цвет хранится только в памяти (в базу ничего не пишется) и считается заново после перезапуска.
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const cache = new Map(); // '/uploads/x.webp' → '#ffffff' | '' ; пока считается — нет записи

function fileOf(src) {
  const s = String(src || '');
  if (/^\/uploads\/[\w.-]+$/.test(s)) return path.join(ROOT, s);
  if (/^\/img\/[\w./-]+$/.test(s) && !s.includes('..')) return path.join(ROOT, 'public', s);
  return '';
}

async function measure(file) {
  const { data, info } = await sharp(file, { failOn: 'none' })
    .resize({ width: 160, height: 160, fit: 'inside', withoutEnlargement: true, kernel: 'nearest' })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const buckets = new Map();
  let total = 0;
  const add = (x, y) => {
    const i = (y * w + x) * 4;
    total++;
    if (data[i + 3] < 230) return; // прозрачный край — плашка не нужна
    const key = (data[i] >> 4) + ',' + (data[i + 1] >> 4) + ',' + (data[i + 2] >> 4);
    const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2];
    buckets.set(key, b);
  };
  for (let x = 0; x < w; x++) { add(x, 0); add(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { add(0, y); add(w - 1, y); }
  let best = null;
  for (const b of buckets.values()) if (!best || b.n > best.n) best = b;
  // Сплошной фон — больше половины края одного цвета
  if (!best || best.n < total * 0.5) return '';
  const hex = v => Math.round(v / best.n).toString(16).padStart(2, '0');
  return '#' + hex(best.r) + hex(best.g) + hex(best.b);
}

// Посчитать цвет (если ещё не считали). Ошибки не мешают сайту — просто без плашки.
function warm(src) {
  const file = fileOf(src);
  if (!file || cache.has(src)) return;
  cache.set(src, '');
  measure(file).then(c => cache.set(src, c)).catch(() => cache.set(src, ''));
}

// Цвет для страницы: '' — плашка не нужна или ещё не посчитана (тогда начинаем считать)
function get(src) {
  if (!cache.has(src)) warm(src);
  return cache.get(src) || '';
}

module.exports = { warm, get, measure };
