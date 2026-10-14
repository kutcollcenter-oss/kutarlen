// Ссылка на Google Карты → точка для встроенной карты на странице квартиры.
// Понимает: короткие ссылки «Поделиться» (maps.app.goo.gl, goo.gl/maps), полные ссылки google.com/maps,
// код встраивания <iframe src="…/maps/embed…">, просто координаты «42.87, 74.59».

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

// Короткие ссылки раскрываем по редиректам (на сервере, у клиента ничего не грузится)
async function expand(url) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(7000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    const loc = r.headers.get('location');
    if (!loc) break;
    url = new URL(loc, url).href;
    if (!/goo\.gl/.test(new URL(url).hostname)) break;
  }
  return url;
}

// Возвращает { link, lat, lng } | { link, query } | { link, embed } | { link, error }
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
  if (!/^https?:\/\//i.test(s)) return { link: raw, error: 'Это не ссылка. В Google Картах нажмите «Поделиться» → «Копировать ссылку».' };

  let host;
  try { host = new URL(s).hostname; } catch (e) { return { link: raw, error: 'Ссылка не распознана' }; }
  if (/\/maps\/embed/.test(s)) return { link: raw, embed: s };
  if (!/(^|\.)google\.[a-z.]+$|goo\.gl$/.test(host)) return { link: raw, error: 'Нужна ссылка именно с Google Карт' };

  let full = s;
  if (/goo\.gl$/.test(host)) {
    try { full = await expand(s); } catch (e) { return { link: raw, error: 'Не удалось открыть короткую ссылку — проверьте интернет на сервере или вставьте полную ссылку' }; }
  }
  const p = parseMapUrl(full);
  if (!p) return { link: raw, error: 'В ссылке не нашлось места на карте. Откройте точку в Google Картах и скопируйте ссылку ещё раз.' };
  return { link: raw, ...p };
}

// URL для <iframe> — работает без ключа Google API
function embedUrl(map, address) {
  if (map && map.embed) return map.embed;
  if (map && Number.isFinite(map.lat)) return `https://maps.google.com/maps?q=${map.lat},${map.lng}&z=17&output=embed`;
  if (map && map.query) return `https://maps.google.com/maps?q=${encodeURIComponent(map.query)}&z=17&output=embed`;
  if (address) return `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=16&output=embed`;
  return null;
}

module.exports = { resolveMap, parseMapUrl, embedUrl };
