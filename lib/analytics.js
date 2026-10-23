// Подробная аналитика кабинета.
// События пишутся построчно в data/events/ГГГГ-ММ.jsonl (дописывание — дёшево и не трогает основную базу).
// Событие: { t: время, r: менеджер, e: тип, p: страница, a: квартира, pl: где нажали, v: посетитель, s: источник, d: устройство }
//   e = view (просмотр страницы) | filter (пользовался фильтром) | calc (менял взнос) | cash (взноса хватило на наличные) | wa (нажал WhatsApp)
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', 'events');
const KEEP_MONTHS = 13;

const month = t => t.slice(0, 7);
const fileOf = m => path.join(DIR, `${m}.jsonl`);

function append(ev) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.appendFile(fileOf(month(ev.t)), JSON.stringify(ev) + '\n', () => {});
}

function appendMany(list) {
  fs.mkdirSync(DIR, { recursive: true });
  const byMonth = {};
  for (const ev of list) (byMonth[month(ev.t)] ||= []).push(JSON.stringify(ev));
  for (const [m, lines] of Object.entries(byMonth)) fs.appendFileSync(fileOf(m), lines.join('\n') + '\n');
}

// Кэш разобранных файлов: перечитываем файл, только если он изменился
const cache = new Map();
function readMonth(m) {
  const f = fileOf(m);
  let st;
  try { st = fs.statSync(f); } catch (e) { return []; }
  const c = cache.get(f);
  if (c && c.size === st.size && c.mtime === st.mtimeMs) return c.list;
  const list = [];
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line) continue;
    try { list.push(JSON.parse(line)); } catch (e) { /* битая строка — пропускаем */ }
  }
  cache.set(f, { size: st.size, mtime: st.mtimeMs, list });
  return list;
}

function events(fromISO, toISO, realtorId) {
  const out = [];
  const d = new Date(fromISO.slice(0, 7) + '-01T00:00:00Z');
  const end = toISO.slice(0, 7);
  while (month(d.toISOString()) <= end) {
    for (const ev of readMonth(month(d.toISOString()))) {
      if (ev.t >= fromISO && ev.t < toISO && (!realtorId || ev.r === realtorId)) out.push(ev);
    }
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

function prune() {
  const keep = new Date();
  keep.setUTCMonth(keep.getUTCMonth() - KEEP_MONTHS);
  const limit = month(keep.toISOString());
  try {
    for (const f of fs.readdirSync(DIR)) if (f.endsWith('.jsonl') && f.slice(0, 7) < limit) fs.unlinkSync(path.join(DIR, f));
  } catch (e) {}
}

const SOURCE_LABEL = {
  direct: 'Прямой заход', instagram: 'Instagram', whatsapp: 'WhatsApp', telegram: 'Telegram', facebook: 'Facebook',
  tiktok: 'TikTok', google: 'Google', yandex: 'Яндекс', youtube: 'YouTube', ads: 'Реклама', other: 'Другие сайты',
};
const PLACE_LABEL = {
  card: 'Карточка в списке', apartment: 'Страница квартиры', 'apartment-cash': 'Кнопка «за наличные»',
  'apartment-tab': 'Меню на странице квартиры', hero: 'Первый экран', news: 'Новости «Скоро»', header: 'Шапка (ноутбук)', cta: 'Финальный блок',
  tabbar: 'Нижнее меню', footer: 'Подвал', empty: '«Подберу вручную»', gone: 'Проданная квартира',
};

const uniq = list => new Set(list.map(e => e.v).filter(Boolean)).size;
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

// Сводка за последние `days` дней + сравнение с предыдущим таким же периодом
function report(realtorId, days, aptLabel = () => null) {
  const now = new Date();
  const to = new Date(now.getTime() + 60e3).toISOString();
  const from = new Date(now.getTime() - days * 864e5).toISOString();
  const prevFrom = new Date(now.getTime() - 2 * days * 864e5).toISOString();
  const cur = events(from, to, realtorId);
  const prev = events(prevFrom, from, realtorId);

  const totals = list => {
    const views = list.filter(e => e.e === 'view');
    const wa = list.filter(e => e.e === 'wa');
    const visitors = uniq(views);
    const waVisitors = uniq(wa);
    return { visitors, views: views.length, aptViews: views.filter(e => e.p === 'apt' && e.a).length, wa: wa.length, waVisitors, conv: pct(waVisitors, visitors) };
  };

  // По дням (по времени Бишкека, UTC+6)
  const dayKey = t => new Date(Date.parse(t) + 6 * 3600e3).toISOString().slice(0, 10);
  const daily = [];
  for (let i = days - 1; i >= 0; i--) daily.push({ d: dayKey(new Date(now.getTime() - i * 864e5).toISOString()), v: new Set(), views: 0, wa: 0 });
  const dayIdx = Object.fromEntries(daily.map((x, i) => [x.d, i]));
  for (const e of cur) {
    const i = dayIdx[dayKey(e.t)];
    if (i == null) continue;
    if (e.e === 'view') { daily[i].views++; if (e.v) daily[i].v.add(e.v); }
    if (e.e === 'wa') daily[i].wa++;
  }

  // Источник посетителя — первый, с которым он пришёл за период
  const firstSource = {};
  for (const e of cur) if (e.v && e.s && !firstSource[e.v]) firstSource[e.v] = e.s;
  const sources = {};
  const waBy = new Set(cur.filter(e => e.e === 'wa').map(e => e.v));
  for (const [v, s] of Object.entries(firstSource)) {
    const k = SOURCE_LABEL[s] ? s : 'other';
    sources[k] ||= { visitors: 0, wa: 0 };
    sources[k].visitors++;
    if (waBy.has(v)) sources[k].wa++;
  }

  // Воронка по уникальным посетителям
  const who = test => new Set(cur.filter(test).map(e => e.v).filter(Boolean));
  const visited = who(e => e.e === 'view');
  const funnel = [
    { label: 'Зашли на сайт', n: visited.size },
    { label: 'Пользовались фильтром', n: who(e => e.e === 'filter').size },
    { label: 'Открыли квартиру', n: who(e => e.e === 'view' && e.p === 'apt' && e.a).size },
    { label: 'Считали рассрочку', n: who(e => e.e === 'calc').size },
    { label: 'Написали в WhatsApp', n: waBy.size },
  ];

  // Квартиры
  const apts = {};
  for (const e of cur) {
    if (!e.a) continue;
    const x = (apts[e.a] ||= { id: e.a, views: 0, vis: new Set(), calc: 0, cash: 0, wa: 0 });
    if (e.e === 'view') { x.views++; if (e.v) x.vis.add(e.v); }
    if (e.e === 'calc') x.calc++;
    if (e.e === 'cash') x.cash++;
    if (e.e === 'wa') x.wa++;
  }

  const places = {};
  for (const e of cur) if (e.e === 'wa') places[e.pl || 'other'] = (places[e.pl || 'other'] || 0) + 1;

  const devices = { m: new Set(), d: new Set() };
  for (const e of cur) if (e.e === 'view' && e.v) (e.d === 'd' ? devices.d : devices.m).add(e.v);

  // Часы активности (Бишкек)
  const hours = Array(24).fill(0);
  for (const e of cur) if (e.e === 'view') hours[new Date(Date.parse(e.t) + 6 * 3600e3).getUTCHours()]++;

  return {
    days,
    totals: totals(cur),
    prev: totals(prev),
    daily: daily.map(x => ({ d: x.d, visitors: x.v.size, views: x.views, wa: x.wa })),
    sources: Object.entries(sources).map(([k, x]) => ({ key: k, label: SOURCE_LABEL[k], ...x, conv: pct(x.wa, x.visitors) }))
      .sort((a, b) => b.visitors - a.visitors),
    funnel,
    apartments: Object.values(apts).map(x => ({ id: x.id, label: aptLabel(x.id) || 'Удалена', views: x.views, visitors: x.vis.size, calc: x.calc, cash: x.cash, wa: x.wa, conv: pct(x.wa, x.vis.size) }))
      .sort((a, b) => b.wa - a.wa || b.views - a.views).slice(0, 20),
    places: Object.entries(places).map(([k, n]) => ({ label: PLACE_LABEL[k] || k, n })).sort((a, b) => b.n - a.n),
    devices: { mobile: devices.m.size, desktop: devices.d.size },
    hours,
  };
}

// Короткая сводка по всем менеджерам для владельца
function summary(days) {
  const now = new Date();
  const list = events(new Date(now.getTime() - days * 864e5).toISOString(), new Date(now.getTime() + 60e3).toISOString());
  const by = {};
  for (const e of list) {
    const x = (by[e.r] ||= { v: new Set(), wa: 0, last: '' });
    if (e.e === 'view' && e.v) x.v.add(e.v);
    if (e.e === 'wa') x.wa++;
    if (e.t > x.last) x.last = e.t;
  }
  return Object.fromEntries(Object.entries(by).map(([r, x]) => [r, { visitors: x.v.size, wa: x.wa, last: x.last }]));
}

module.exports = { append, appendMany, report, summary, prune, SOURCE_LABEL };
