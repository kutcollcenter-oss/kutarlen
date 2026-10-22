// Ссылка на Google Карты или 2ГИС → точка для встроенной карты на странице квартиры.
// Google: короткие ссылки «Поделиться» (maps.app.goo.gl, goo.gl/maps), полные ссылки google.com/maps,
// код встраивания <iframe src="…/maps/embed…">, просто координаты «42.87, 74.59».
// 2ГИС: короткие ссылки go.2gis.com, полные 2gis.kg/…/geo/…/74.60,42.87 и ссылки с ?m=74.60,42.87/17.
// У 2ГИС в ссылке сначала долгота, потом широта.

const num = s => Number(String(s).replace(',', '.'));
const okLat = v => Number.isFinite(v) && Math.abs(v) <= 90;
const okLng = v => Number.isFinite(v) && Math.abs(v) <= 180;

// Координаты и название места из полной ссылки Google Карт
function parseMapUrl(url) {
  let u = url;
  try { u = decodeURIComponent(url); } catch (e) {}
  const pick = (re) => { const m = u.match(re); return m && okLat(num(m[1])) && okLng(num(m[2])) ? { lat: num(m[1]), lng: num(m[2]) } : null; };
  // Точное место метки (!3d…!4d…) надёжнее центра экрана (@…)
  const point = pick(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
    || pick(/[?&](?:q|query|ll|center|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/)
    || pick(/\/search\/(-?\d+\.\d+),\s*\+?(-?\d+\.\d+)/)
    || pick(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const place = (u.match(/\/maps\/place\/([^/@?]+)/) || [])[1];
  const q = (u.match(/[?&](?:q|query)=([^&]+)/) || [])[1];
  const name = (place || q || '').replace(/\+/g, ' ').trim();
  if (point) return { ...point, name };
  if (name) return { query: name };
  return null;
}

// Координаты из ссылки 2ГИС (порядок «долгота,широта»)
function parse2gisUrl(url) {
  let u = url;
  try { u = decodeURIComponent(url); } catch (e) {}
  const pick = re => { const m = u.match(re); return m && okLng(num(m[1])) && okLat(num(m[2])) ? { lat: num(m[2]), lng: num(m[1]) } : null; };
  // Точка объекта в пути (…/geo/<id>/74.6,42.8) надёжнее центра карты (?m=74.6,42.8/16)
  return pick(/\/(?:geo|firm|point)\/[^/?#]*\/(-?\d+\.\d+),(-?\d+\.\d+)/)
    || pick(/\/(-?\d{2,3}\.\d+),(-?\d{1,2}\.\d+)(?:[/?#]|$)/)
    || pick(/[?&]m=(-?\d+\.\d+),(-?\d+\.\d+)/);
}
const is2gis = host => /(^|\.)2gis\.[a-z]+$/.test(host);

// В ссылке 2ГИС только номер дома (…/geo/70030077092700735) — берём его точку со страницы 2ГИС.
// Страница содержит данные объекта: "id":"<номер>" … "point":{"lon":…,"lat":…}. Не вышло — null.
async function point2gis(url) {
  const id = (url.match(/\/geo\/(\d{10,})/) || [])[1];
  if (!id) return null;
  try {
    const r = await fetch(`https://2gis.kg/geo/${id}`, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return null;
    const html = await r.text();
    const at = html.indexOf(`"id":"${id}`);
    if (at < 0) return null;
    const m = html.slice(at, at + 3000).match(/"point":\{"(lat|lon)":(-?\d+\.\d+),"(lat|lon)":(-?\d+\.\d+)\}/);
    if (!m) return null;
    const v = { [m[1]]: Number(m[2]), [m[3]]: Number(m[4]) };
    return okLat(v.lat) && okLng(v.lon) ? { lat: v.lat, lng: v.lon } : null;
  } catch (e) { return null; }
}

// Короткие ссылки раскрываем по редиректам (на сервере, у клиента ничего не грузится)
async function expand(url) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(7000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    const loc = r.headers.get('location');
    if (!loc) break;
    url = new URL(loc, url).href;
    const h = new URL(url).hostname;
    if (!/goo\.gl/.test(h) && h !== 'go.2gis.com') break;
  }
  return url;
}

// Возвращает { link, lat, lng } | { link, query } | { link, embed } | { link, error }; source: 'google' | '2gis'
async function resolveMap(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  let s = raw;
  const src = s.match(/src=["']([^"']+)["']/);
  if (src) s = src[1];

  const coords = s.match(/^(-?\d{1,2}[.,]\d+)\s*[,;]\s*(-?\d{1,3}[.,]\d+)$/);
  if (coords && okLat(num(coords[1])) && okLng(num(coords[2]))) {
    const lat = num(coords[1]), lng = num(coords[2]);
    return { link: `https://www.google.com/maps?q=${lat},${lng}`, lat, lng };
  }
  if (!/^https?:\/\//i.test(s)) return { link: raw, error: 'Это не ссылка. В Google Картах или 2ГИС нажмите «Поделиться» → «Копировать ссылку».' };

  let host;
  try { host = new URL(s).hostname; } catch (e) { return { link: raw, error: 'Ссылка не распознана' }; }

  // 2ГИС
  if (is2gis(host)) {
    let full = s;
    if (host === 'go.2gis.com') {
      try { full = await expand(s); } catch (e) { return { link: raw, source: '2gis', error: 'Не удалось открыть короткую ссылку 2ГИС — вставьте полную ссылку из адресной строки' }; }
    }
    const p = parse2gisUrl(full) || await point2gis(full);
    // Не нашли точку — кнопка «Открыть в 2ГИС» всё равно работает, а карта строится по адресу
    return p ? { link: raw, source: '2gis', ...p } : { link: raw, source: '2gis' };
  }
  if (/\/maps\/embed/.test(s)) return { link: raw, embed: s };
  if (!/(^|\.)google\.[a-z.]+$|goo\.gl$/.test(host)) return { link: raw, error: 'Нужна ссылка с Google Карт или 2ГИС' };

  let full = s;
  if (/goo\.gl$/.test(host)) {
    try { full = await expand(s); } catch (e) { return { link: raw, error: 'Не удалось открыть короткую ссылку — проверьте интернет на сервере или вставьте полную ссылку' }; }
  }
  const p = parseMapUrl(full);
  if (!p) return { link: raw, source: 'google', error: 'В ссылке не нашлось места на карте. Откройте точку в Google Картах и скопируйте ссылку ещё раз.' };
  return { link: raw, source: 'google', ...p };
}

// URL для <iframe> — работает без ключа Google API
function embedUrl(map, address) {
  if (map && map.embed) return map.embed;
  if (map && Number.isFinite(map.lat)) return `https://maps.google.com/maps?q=${map.lat},${map.lng}&z=17&output=embed`;
  if (map && map.query) return `https://maps.google.com/maps?q=${encodeURIComponent(map.query)}&z=17&output=embed`;
  if (address) return `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=16&output=embed`;
  return null;
}

module.exports = { resolveMap, parseMapUrl, parse2gisUrl, embedUrl };
