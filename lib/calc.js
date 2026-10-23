// Калькулятор рассрочки и подготовка квартиры для публичной части
//
// Тип квартиры = способ оплаты:
//   installment — рассрочка, в сомах:
//     Цена = Цена за м² × Площадь
//     Платёж в месяц = (Цена − Первоначальный взнос) / Срок, мес.
//     Менеджер задаёт минимальный взнос и срок; клиент может внести больше — платёж уменьшится.
//   commercial — коммерческое помещение: считается точно как рассрочка (сом, взнос, срок).
//   cash — наличные, цена в долларах, без рассрочки.
const { embedUrl } = require('./maps');
const nf = new Intl.NumberFormat('ru-RU');

const TYPES = { installment: 'Рассрочка', commercial: 'Коммерция', cash: 'Наличные' };
// Старые значения из первых версий базы: resale → cash, всё неизвестное → installment
const typeOf = a => (a.type === 'cash' || a.type === 'resale' ? 'cash' : a.type === 'commercial' ? 'commercial' : 'installment');
// «2-комн.» для квартир, «Коммерческое помещение» для коммерции
const itLabel = a => (typeOf(a) === 'commercial' ? 'это помещение' : 'эту квартиру');
const kindLabel = a => (typeOf(a) === 'commercial' ? 'Коммерческое помещение' : roomsLabel(a.rooms));

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function currencyOf(type, settings) {
  return type === 'cash' ? (settings.currencyCash || '$') : (settings.currencyInstallment || 'сом');
}

function monthlyFor(price, down, months) {
  if (!months || price <= down) return 0;
  return Math.ceil((price - down) / months);
}

function calc(a) {
  const area = num(a.area);
  if (typeOf(a) === 'cash') {
    const price = Math.round(num(a.price));
    return { type: 'cash', area, price, ppm: area ? Math.round(price / area) : 0, installment: false, down: null, months: null, monthly: null };
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

function cashWaText(a, c, cur, url) {
  const lines = aptLines(a, c);
  lines.push(`Цена за наличные: ${money(c.cash.price, cur)}`);
  lines.push(`За м²: ${money(c.cash.ppm, cur)} (скидка ${money(c.cash.discount, cur)})`);
  const name = a.title ? ` (${a.title})` : '';
  return `Здравствуйте! Хочу купить ${itLabel(a)} за наличные${name}:\n${lines.join('\n')}\n\n${url}`;
}

function roomsLabel(rooms) {
  const r = Number(rooms) || 0;
  return r === 0 ? 'Студия' : `${r}-комн.`;
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
function aptLines(a, c) {
  const lines = [`${kindLabel(a)}, ${c.area} м²`];
  if (a.floorFrom) lines.push(`от ${a.floorFrom} этажа`);
  return lines;
}

function waText(a, c, cur, url, down) {
  const lines = aptLines(a, c);
  lines.push(`Цена: ${money(c.price, cur)}`);
  if (c.installment) {
    const d = down ?? c.down;
    lines.push(`Взнос: ${money(d, cur)}`);
    lines.push(`В месяц: ${money(monthlyFor(c.price, d, c.months), cur)} на ${c.months} мес.`);
  } else if (c.type === 'cash') {
    lines.push('Оплата наличными');
  }
  const name = a.title ? ` (${a.title})` : '';
  return `Здравствуйте! Хочу купить ${itLabel(a)}${name}:\n${lines.join('\n')}\n\n${url}`;
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

function publicApt(a, settings, base, prefix = "") {
  const c = calc(a);
  const cur = currencyOf(c.type, settings);
  const url = `${prefix}/kvartira/${a.id}`;
  const tags = [];
  if (c.type === 'commercial') tags.push('Коммерция');
  if (c.installment) tags.push('Рассрочка');
  if (c.type === 'cash') tags.push('Наличные');
  (a.tags || []).forEach(t => { if (t && !tags.includes(t)) tags.push(t); });
  return {
    id: a.id,
    type: c.type,
    currency: cur,
    title: a.title || '',
    rooms: Number(a.rooms) || 0,
    roomsLabel: kindLabel(a),
    area: c.area,
    pricePerM2: c.ppm,
    price: c.price,
    down: c.down,
    months: c.months,
    monthly: c.monthly,
    installment: c.installment,
    floorFrom: Number(a.floorFrom) || null,
    floors: Number(a.floors) || null,
    city: cityOf(a),
    address: a.address || '',
    details: a.details || '',
    photos: (a.photos || []).map(photoUrls),
    // Карта: ссылка 2ГИС → карта 2ГИС, ссылка Google → карта Google, без ссылки — Google по адресу
    map: {
      embed: embedUrl(mapPoint(a), a.address),
    },
    tags,
    createdAt: a.createdAt,
    url,
    waText: waText(a, c, cur, base + url),
    cash: c.cash ? { ...c.cash, waText: cashWaText(a, c, cur, base + url) } : null,
  };
}

module.exports = { CITIES, cityOf, typeOf, kindLabel, calc, monthlyFor, roomsLabel, money, photoUrls, waText, waLink, publicApt, isListed, currencyOf, TYPES };
