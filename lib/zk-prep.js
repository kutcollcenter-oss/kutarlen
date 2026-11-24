// Подготовка квартир к показу «по ЖК» (один раз при запуске, перед этим — копия базы):
//  1) убрать невидимые символы и лишние пробелы в названии и адресе;
//  2) одно ЖК, записанное по-разному («Алтай Голд», «ЖК «Алтай Голд»»), — к одному написанию (самому частому);
//  3) ссылка на карту, вписанная вместо адреса, — в поле карты; пустой адрес — адрес этого ЖК у других квартир;
//  4) пустое поле «Район» — из адреса, если район там написан (Первомайский, Пригород, мкр Джал, «(район Ипподром)»).
// Ничего не удаляет: только чистит и дополняет пустые поля.

const clean = s => String(s || '').replace(/[​-‍⁠﻿]/g, '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
// Ключ ЖК: без «ЖК», кавычек, регистра и лишних пробелов — тот же, что на сайте (public/js/app.js)
// ө ү ң считаем как о у н: «Кут Өргө» и «Кут Орго» — один ЖК
const zkKey = t => clean(t).toLowerCase().replace(/[«»"'`“”„]/g, '').replace(/^(жк|ж\/к|жилой комплекс)[\s,.:-]+/, '').replace(/ө/g, 'о').replace(/ү/g, 'у').replace(/ң/g, 'н').replace(/\s+/g, ' ').trim();
const isUrl = s => /^https?:\/\//i.test(s);

// Район из адреса
function districtOf(addr) {
  const a = clean(addr);
  if (!a || isUrl(a)) return '';
  let m = a.match(/\(\s*район\s+([^)]+)\)/i) || a.match(/\bрайон\s+([А-ЯЁӨҮҢ][\wа-яёөүң-]+)/i);
  if (m) return clean(m[1]);
  m = a.match(/\bмкр\.?\s*([\wа-яёөүң-]+)/i);
  if (m) return /^\d+$/.test(m[1]) ? `${m[1]} мкр` : m[1][0].toUpperCase() + m[1].slice(1);
  if (/пригород/i.test(a)) return 'Пригород';
  m = a.match(/(первомайск|ленинск|октябрьск|свердловск)\w*/i);
  if (m) return { первомайск: 'Первомайский район', ленинск: 'Ленинский район', октябрьск: 'Октябрьский район', свердловск: 'Свердловский район' }[m[1].toLowerCase()];
  return '';
}
const top = list => {
  const n = new Map();
  list.filter(Boolean).forEach(x => n.set(x, (n.get(x) || 0) + 1));
  return [...n.entries()].sort((a, b) => b[1] - a[1] || (/[«"]|^ЖК/i.test(b[0]) ? 1 : 0) - (/[«"]|^ЖК/i.test(a[0]) ? 1 : 0))[0]?.[0] || '';
};

function prepare(apartments, log = () => {}) {
  const st = { cleaned: 0, titles: 0, maps: 0, addresses: 0, districts: 0 };
  for (const a of apartments) {
    const t = clean(a.title), ad = clean(a.address);
    if (t !== (a.title || '') || ad !== (a.address || '')) { a.title = t; a.address = ad; st.cleaned++; }
    if (isUrl(a.address)) {
      if (!a.map && !a.map2gis) { a.map = a.address; st.maps++; }
      a.address = '';
    }
  }
  const groups = new Map();
  for (const a of apartments) {
    const k = zkKey(a.title);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  }
  for (const [k, g] of groups) {
    const title = top(g.map(a => a.title));
    const addr = top(g.map(a => a.address));
    const dist = top(g.map(a => districtOf(a.address)));
    for (const a of g) {
      if (a.title !== title) { log(`ЖК: «${a.title}» → «${title}»`); a.title = title; st.titles++; }
      if (!a.address && addr) { a.address = addr; st.addresses++; }
      if (!a.district && dist) { a.district = dist; st.districts++; }
    }
    if (dist) log(`Район «${dist}» → ЖК «${title}»`);
  }
  // Квартиры без названия ЖК: район только из своего адреса
  for (const a of apartments) if (!zkKey(a.title) && !a.district) { const d = districtOf(a.address); if (d) { a.district = d; st.districts++; } }
  return st;
}

// Адрес страницы ЖК: ключ латиницей («ЖК «Алтай Голд»» → altay-gold, «Түндүк 1» → tunduk-1)
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', ң: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const zkSlug = t => zkKey(t).split('').map(c => (c in TR ? TR[c] : c)).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

module.exports = { prepare, zkKey, zkSlug, districtOf, clean };
