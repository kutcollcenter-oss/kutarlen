// Калькулятор рассрочки и подготовка квартиры для публичной части
//
// Тип квартиры = способ оплаты:
//   installment — рассрочка, в сомах:
//     Цена = Цена за м² × Площадь
//     Платёж в месяц = (Цена − Первоначальный взнос) / Срок, мес.
//     Риелтор задаёт минимальный взнос и срок; клиент может внести больше — платёж уменьшится.
//   cash — наличные, цена в долларах, без рассрочки.
const { embedUrl } = require('./maps');
const nf = new Intl.NumberFormat('ru-RU');

const TYPES = { installment: 'Рассрочка', cash: 'Наличные' };
// Старые значения из первых версий базы
const typeOf = a => (a.type === 'cash' || a.type === 'resale' ? 'cash' : 'installment');

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
    type: 'installment', area, price, ppm,
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
  const parts = [`${roomsLabel(a.rooms)}, ${c.area} м²`];
  if (a.floorFrom) parts.push(`от ${a.floorFrom} этажа`);
  parts.push(`цена за наличные ${money(c.cash.price, cur)} (${money(c.cash.ppm, cur)} за м², скидка ${money(c.cash.discount, cur)} за м²)`);
  const name = a.title ? ` (${a.title})` : '';
  return `Здравствуйте! Хочу купить эту квартиру за наличные${name}: ${parts.join(', ')}\n${url}`;
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

function waText(a, c, cur, url, down) {
  const parts = [`${roomsLabel(a.rooms)}, ${c.area} м²`];
  if (a.floorFrom) parts.push(`от ${a.floorFrom} этажа`);
  parts.push(`цена ${money(c.price, cur)}`);
  if (c.installment) {
    const d = down ?? c.down;
    parts.push(`взнос ${money(d, cur)}`);
    parts.push(`${money(monthlyFor(c.price, d, c.months), cur)} в месяц на ${c.months} мес.`);
  } else if (c.type === 'cash') {
    parts.push('наличными');
  }
  const name = a.title ? ` (${a.title})` : '';
  return `Здравствуйте! Хочу купить эту квартиру${name}: ${parts.join(', ')}\n${url}`;
}

function waLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function isListed(a) {
  return calc(a).price > 0;
}

function publicApt(a, settings, base) {
  const c = calc(a);
  const cur = currencyOf(c.type, settings);
  const url = `/kvartira/${a.id}`;
  const tags = [];
  if (c.installment) tags.push('Рассрочка');
  if (c.type === 'cash') tags.push('Наличные');
  (a.tags || []).forEach(t => { if (t && !tags.includes(t)) tags.push(t); });
  return {
    id: a.id,
    type: c.type,
    currency: cur,
    title: a.title || '',
    rooms: Number(a.rooms) || 0,
    roomsLabel: roomsLabel(a.rooms),
    area: c.area,
    pricePerM2: c.ppm,
    price: c.price,
    down: c.down,
    months: c.months,
    monthly: c.monthly,
    installment: c.installment,
    floorFrom: Number(a.floorFrom) || null,
    floors: Number(a.floors) || null,
    address: a.address || '',
    details: a.details || '',
    photos: (a.photos || []).map(photoUrls),
    // Карта: точка из ссылки Google Карт, иначе — поиск по адресу
    map: {
      embed: embedUrl(a.map && !a.map.error ? a.map : null, a.address),
      link: a.map && a.map.link && /^https?:\/\//.test(a.map.link) ? a.map.link : null,
    },
    tags,
    createdAt: a.createdAt,
    url,
    waText: waText(a, c, cur, base + url),
    cash: c.cash ? { ...c.cash, waText: cashWaText(a, c, cur, base + url) } : null,
  };
}

module.exports = { typeOf, calc, monthlyFor, roomsLabel, money, photoUrls, waText, waLink, publicApt, isListed, currencyOf, TYPES };
