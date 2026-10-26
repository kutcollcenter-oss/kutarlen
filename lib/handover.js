// Срок сдачи дома (рассрочка и коммерция).
// Раньше менеджеры писали его в «Деталях» вместе с другой информацией. При запуске сервера находим фразу о сроке,
// переносим её в отдельное поле handover и убираем из «Деталей» — остальной текст остаётся как был.
// Делается один раз: у обработанной квартиры поле handover уже есть (хотя бы пустое).

const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const trimEdges = s => String(s || '').replace(/^[\s:—–-]+/, '').replace(/[\s.,;!]+$/, '');
const LOOKS_LIKE_DATE = /\d{4}|\d\s*кв|квартал|январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр|сдан|готов/i;

// Найти срок в тексте. Возвращает { value, start, end } — что записать в поле и какой кусок текста убрать, или null.
function findHandover(text) {
  // «Срок сдачи: IV квартал 2027», «Сдача дома — 2 кв. 2026», «Сдаётся в 2027 году», «Ввод в эксплуатацию: 2028»
  const re = /(?:срок\s+сдачи|сдача|сда[её]тся|ввод\s+в\s+эксплуатацию)(?:\s+(?:дома|объекта|жк|здания))?\s*(?:[:—–-]\s*|\s+)([^\n;!]{2,80})/i;
  const m = text.match(re);
  if (m) {
    // Срок заканчивается на запятой или в конце предложения; точку в «2 кв. 2026» концом не считаем
    const raw = m[1].split(/,|\.(?=\s+[А-ЯЁA-Z]|\s*$)/)[0];
    const value = trimEdges(raw);
    if (value && LOOKS_LIKE_DATE.test(value)) {
      const start = m.index;
      const end = m.index + (m[0].length - m[1].length) + raw.length;
      // «2030 2 квартал» → «2 квартал 2030», как пишут обычно
      // «в 2030 2 квартал» → «2 квартал 2030»
      const nice = value.replace(/^в\s+(?=\d)/i, '').replace(/^(\d{4})\s*(?:г\.?|года?)?\s+((?:[IVX]+|\d)\s*(?:кв\.?|квартал))$/i, '$2 $1');
      return { value: cap(nice).slice(0, 60), start, end };
    }
  }
  // Год впереди: «2030 сдача», «2028-2030 сдача», «2029 г. сдача»
  const y = text.match(/(\d{4}(?:\s*[-–—]\s*\d{4})?)\s*(?:г\.?|года?)?\s+сда(?:ча|ётся|ется)(?![а-яё])/i);
  if (y) return { value: y[1].replace(/\s*[-–—]\s*/, '–'), start: y.index, end: y.index + y[0].length };
  // «Дом сдан», «Объект сдан в эксплуатацию в 2024» — до запятой или конца предложения
  const d = text.match(/(?:(?:дом|объект|жк|здание)\s+сдан(?![а-яё])(?!\s+в\s+аренду)|(?:^|(?<=[^а-яё]))сдан\s+в\s+эксплуатацию)[^\n;!,.]{0,40}/i);
  if (d) return { value: cap(trimEdges(d[0])).slice(0, 60), start: d.index, end: d.index + d[0].length };
  return null;
}

// Убрать кусок из текста и поправить знаки препинания вокруг
function cutOut(text, start, end) {
  const before = text.slice(0, start);
  let after = text.slice(end);
  // Срок был отдельной строкой — убираем и её перенос, чтобы не осталось пустой строки
  if (/(^|\n)[ \t]*$/.test(before)) after = after.replace(/^[ \t.,;]*(?:\n|$)/, '');
  let s = before + after;
  s = s
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.;!?])/g, '$1')        // пробел перед знаком
    .replace(/,\s*,/g, ',')                     // «, ,»
    .replace(/[,;:—–-]\s*([.!?])/g, '$1')       // «, .» → «.»
    .replace(/([.!?])\s*[,;:—–-]+\s*/g, '$1 ')  // новое предложение не начинается с запятой или тире
    .replace(/\.{2,}/g, '.')
    .replace(/^[\s,;:—–.-]+/, '')               // начало текста
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(/[,;:—–-]+$/, '.');                // хвост «…, паркинг,» → «…, паркинг.»
  // Предложение после удалённого куска начинается с большой буквы
  s = s.replace(/(^|[.!?]\s+)([а-яё])/g, (x, p, c) => p + c.toUpperCase());
  return s;
}

// Разделить «Детали» на срок и остальной текст
function splitHandover(details) {
  const text = String(details || '');
  const f = findHandover(text);
  if (!f) return { handover: '', details: text };
  return { handover: f.value, details: cutOut(text, f.start, f.end) };
}

// Один раз для квартир рассрочки и коммерции, у которых поля ещё нет. Возвращает, сколько обработано и найдено.
function migrateHandover(apartments, typeOf, log = () => {}) {
  let found = 0, touched = 0;
  for (const a of apartments) {
    if ('handover' in a) continue;
    const t = typeOf(a);
    if (t !== 'installment' && t !== 'commercial') continue;
    const r = splitHandover(a.details);
    a.handover = r.handover;
    touched++;
    if (r.handover) {
      found++;
      log(`${a.title || a.id}: срок «${r.handover}»; в «Деталях» осталось: «${r.details.slice(0, 120)}${r.details.length > 120 ? '…' : ''}»`);
      a.details = r.details;
    }
  }
  return { found, touched };
}

// Метка, в которой написан срок сдачи: «Сдача в 2030 2 квартал», «2028 сдача», «Срок сдачи IV кв. 2027»
const isHandoverTag = t => /сдач|сда[её]тся/i.test(t) && /\d{4}|квартал|\d\s*кв/i.test(t);

// Один раз: метки со сроком у рассрочки и коммерции.
//  - срок уже в поле — метку убираем (иначе на фото две похожие метки);
//  - поле пустое — переносим срок из метки в поле, метку убираем.
// Наличные не трогаем (у них нет поля срока). Возвращает { removed, moved }.
function dropHandoverTags(apartments, typeOf, log = () => {}) {
  let removed = 0, moved = 0;
  for (const a of apartments) {
    const t = typeOf(a);
    if ((t !== 'installment' && t !== 'commercial') || !Array.isArray(a.tags)) continue;
    const gone = a.tags.filter(isHandoverTag);
    if (!gone.length) continue;
    if (!String(a.handover || '').trim()) {
      a.handover = splitHandover(gone[0]).handover || gone[0].slice(0, 60);
      moved++;
      log(`${a.title || a.id}: метка «${gone.join('», «')}» → поле «${a.handover}»`);
    } else {
      removed++;
      log(`${a.title || a.id}: убрана метка «${gone.join('», «')}», срок в поле «${a.handover}»`);
    }
    a.tags = a.tags.filter(x => !isHandoverTag(x));
  }
  return { removed, moved };
}

// Сколько квартир ещё ждут переноса (чтобы сделать копию базы до изменений)
const pendingHandover = (apartments, typeOf) =>
  apartments.some(a => !('handover' in a) && ['installment', 'commercial'].includes(typeOf(a)));

module.exports = { splitHandover, migrateHandover, pendingHandover, dropHandoverTags };
