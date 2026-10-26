// Калькулятор рассрочки и подготовка квартиры для публичной части
//
// Тип квартиры = способ оплаты:
//   installment — рассрочка, в сомах:
//     Цена = Цена за м² × Площадь
//     Платёж в месяц = (Цена − Первоначальный взнос) / Срок, мес.
//     Менеджер задаёт минимальный взнос и срок; клиент может внести больше — платёж уменьшится.
//   commercial — коммерческое помещение: считается точно как рассрочка (сом, взнос, срок).
//   cash — наличные, цена в долларах, без рассрочки.
//   land — участок: как наличные (общая цена в долларах), площадь в сотках, без комнат и этажей.
const { embedUrl } = require('./maps');
const { t } = require('./i18n');
// lang — язык сайта клиента ('ru' по умолчанию, 'ky' — кыргызский): подписи и текст сообщения в WhatsApp
const nf = new Intl.NumberFormat('ru-RU');

const TYPES = { installment: 'Рассрочка', commercial: 'Коммерция', cash: 'Наличные', land: 'Участок' };
// Старые значения из первых версий базы: resale → cash, всё неизвестное → installment
const typeOf = a => (a.type === 'cash' || a.type === 'resale' ? 'cash' : a.type === 'commercial' || a.type === 'land' ? a.type : 'installment');
// Срок сдачи — только у рассрочки и коммерции
const handoverOf = a => (typeOf(a) === 'installment' || typeOf(a) === 'commercial' ? String(a.handover || '').trim() : '');
// Как показать срок: «Сдача: IV квартал 2027»; «Дом сдан», «Сдан в эксплуатацию в 2024» — как есть
const handoverLabel = (h, lang) => (/^(?:(?:дом|объект|жк|здание)\s+)?сдан/i.test(h) ? h : t(lang, 'handover', { x: h }));
// Без рассрочки, одна цена в долларах: наличные и участки
const isCashType = t => t === 'cash' || t === 'land';
// «2-комн.» для квартир, «Коммерческое помещение» для коммерции, «Участок» для участков
const itLabel = (a, lang) => t(lang, { commercial: 'itCommercial', land: 'itLand' }[typeOf(a)] || 'itApartment');
const kindLabel = (a, lang) => ({ commercial: t(lang, 'kindCommercialLabel'), land: t(lang, 'kindLandLabel') }[typeOf(a)] || roomsLabel(a.rooms, lang));
// Единица площади: у участков сотки
const unitOf = (a, lang) => (typeOf(a) === 'land' ? t(lang, 'perSot') : 'м²');

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function currencyOf(type, settings) {
  return isCashType(type) ? (settings.currencyCash || '$') : (settings.currencyInstallment || 'сом');
}

function monthlyFor(price, down, months) {
  if (!months || price <= down) return 0;
  return Math.ceil((price - down) / months);
}

function calc(a) {
  const area = num(a.area);
  if (isCashType(typeOf(a))) {
    const price = Math.round(num(a.price));
    return { type: typeOf(a), area, price, ppm: area ? Math.round(price / area) : 0, installment: false, down: null, months: null, monthly: null };
  }
  const ppm = num(a.pricePerM2);
  const price = Math.round(area * ppm);
  const down = Math.min(Math.round(num(a.down)), price);
  const months = Math.floor(num(a.months));
  const installment = months > 0 && price > down;
  return {
    type: typeOf(a), area, price, ppm,
    installment,
    down: installment ? down : null,
    months: installment ? months : null,
    monthly: installment ? monthlyFor(price, down, months) : null,
    cash: cashOffer(area, ppm, price, num(a.cashDiscount)),
  };
}

// Покупка за наличные квартиры из рассрочки: скидка X сом за м².
//   Цена за наличные = (Цена за м² − X) × Площадь,  Экономия = Цена в рассрочку − Цена за наличные
function cashOffer(area, ppm, price, discount) {
  if (!discount || !price) return null;
  const d = Math.min(discount, ppm);
  const cashPpm = ppm - d;
  const cashPrice = Math.round(area * cashPpm);
  return { discount: d, ppm: cashPpm, price: cashPrice, savings: price - cashPrice };
}

function cashWaText(a, c, cur, url, lang) {
  const lines = aptLines(a, c, lang);
  lines.push(t(lang, 'waCashPrice', { x: money(c.cash.price, cur) }));
  lines.push(t(lang, 'waCashPpm', { x: money(c.cash.ppm, cur), d: money(c.cash.discount, cur) }));
  const name = a.title ? ` (${a.title})` : '';
  return `${t(lang, 'waWantCash', { it: itLabel(a, lang), name })}\n${lines.join('\n')}\n\n${url}`;
}

function roomsLabel(rooms, lang) {
  const r = Number(rooms) || 0;
  return r === 0 ? t(lang, 'studio') : t(lang, 'roomsN', { n: r });
}

function money(n, currency) {
  if (n == null) return '—';
  return `${nf.format(Math.round(n))} ${currency || ''}`.trim();
}

function photoUrls(name) {
  // og — JPEG для превью ссылки в WhatsApp (WebP там поддерживается не везде)
  return { src: `/uploads/${name}.webp`, thumb: `/uploads/${name}-t.webp`, og: `/uploads/${name}-og.jpg` };
}

// Сообщение в WhatsApp: каждый параметр с новой строки.
// Строки «Взнос:» и «В месяц:» сайт подменяет, когда клиент двигает взнос (app.js, apartment.js).
function aptLines(a, c, lang) {
  const lines = [`${kindLabel(a, lang)}, ${c.area} ${unitOf(a, lang)}`];
  if (a.floorFrom && c.type !== 'land') lines.push(t(lang, 'waFloor', { f: a.floorFrom }));
  const h = handoverOf(a);
  if (h) lines.push(handoverLabel(h, lang));
  return lines;
}

// Строки взноса и платежа начинаются с waDown / waMonthly — по ним сайт находит и подменяет их, когда клиент меняет взнос
function waText(a, c, cur, url, lang) {
  const lines = aptLines(a, c, lang);
  lines.push(t(lang, 'waPrice', { x: money(c.price, cur) }));
  if (c.installment) {
    lines.push(t(lang, 'waDown') + money(c.down, cur));
    lines.push(t(lang, 'waMonthly') + t(lang, 'waMonthlyFor', { x: money(c.monthly, cur), n: c.months }));
  } else if (isCashType(c.type)) {
    lines.push(t(lang, 'waCashPay'));
  }
  const name = a.title ? ` (${a.title})` : '';
  return `${t(lang, 'waWant', { it: itLabel(a, lang), name })}\n${lines.join('\n')}\n\n${url}`;
}

function waLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function isListed(a) {
  return calc(a).price > 0;
}

// prefix — путь сайта менеджера, например «/aidana-k7f3q9»
// Ссылка на карту квартиры (2ГИС или Google). a.map2gis — старое второе поле: читаем, пока квартиру не пересохранят.
const mapOf = a => a.map || a.map2gis || null;
// Точка для встроенной карты: из ссылки, если её удалось распознать
const mapPoint = a => { const m = mapOf(a); return m && !m.error && (Number.isFinite(m.lat) || m.query || m.embed) ? m : null; };

// Города квартир. Квартира без города (добавлена до появления выбора) — в Бишкеке.
const CITIES = ['Бишкек', 'Ош'];
const cityOf = a => (CITIES.includes(a.city) ? a.city : CITIES[0]);

function publicApt(a, settings, base, prefix = "", lang = 'ru') {
  const c = calc(a);
  const cur = currencyOf(c.type, settings);
  const url = `${prefix}/kvartira/${a.id}`;
  const tags = [];
  if (c.type === 'commercial') tags.push(t(lang, 'tagCommercial'));
  if (c.installment) tags.push(t(lang, 'tagInstallment'));
  if (isCashType(c.type)) tags.push(t(lang, 'tagCash'));
  const ho = handoverOf(a);
  if (ho) tags.push(handoverLabel(ho, lang));
  // Метки менеджера: на кыргызской версии — кыргызские (если заполнены), иначе русские
  const ky = lang === 'ky';
  const own = ky && Array.isArray(a.tagsKy) && a.tagsKy.length ? a.tagsKy : (a.tags || []);
  own.forEach(t => { if (t && !tags.includes(t)) tags.push(t); });
  return {
    id: a.id,
    type: c.type,
    currency: cur,
    title: a.title || '',
    rooms: c.type === 'land' ? 0 : Number(a.rooms) || 0,
    roomsLabel: kindLabel(a, lang),
    area: c.area,
    unit: unitOf(a, lang),
    pricePerM2: c.ppm,
    price: c.price,
    down: c.down,
    months: c.months,
    monthly: c.monthly,
    installment: c.installment,
    floorFrom: c.type === 'land' ? null : Number(a.floorFrom) || null,
    floors: c.type === 'land' ? null : Number(a.floors) || null,
    handover: handoverOf(a),
    city: cityOf(a),
    address: a.address || '',
    details: (ky && String(a.detailsKy || '').trim()) || a.details || '',
    photos: (a.photos || []).map(photoUrls),
    // Карта: ссылка 2ГИС → карта 2ГИС, ссылка Google → карта Google, без ссылки — Google по адресу
    map: {
      embed: embedUrl(mapPoint(a), a.address),
    },
    tags,
    createdAt: a.createdAt,
    url,
    waText: waText(a, c, cur, base + url, lang),
    cash: c.cash ? { ...c.cash, waText: cashWaText(a, c, cur, base + url, lang) } : null,
  };
}

module.exports = { handoverLabel, CITIES, cityOf, typeOf, isCashType, unitOf, kindLabel, calc, monthlyFor, roomsLabel, money, photoUrls, waText, waLink, publicApt, isListed, currencyOf, TYPES };
