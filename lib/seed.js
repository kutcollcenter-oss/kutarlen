// Демо-данные для первого запуска. Запуск вручную: npm run seed (перезапишет базу)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const db = require('./db');
const tenants = require('./tenants');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

const settings = {
  name: 'Арлен',
  role: 'Риелтор строительной компании «Кут»',
  tagline: 'Квартира от СК «Кут» в рассрочку без банка',
  about: 'Я помогаю приобрести квартиру от строительной компании «Кут» и работаю в компании уже год. Подберу вариант под ваш первоначальный взнос и ежемесячный платёж, подробно объясню условия рассрочки и отвечу на все вопросы — без спешки. Сопровождаю на всех этапах: от первого сообщения до получения ключей. Если вы за рубежом — покажу квартиру по видеосвязи.',
  stats: [
    '1 год | работаю в СК «Кут»',
    '7 | отзывов довольных клиентов',
    'Без банка | рассрочка от застройщика',
    '12 часов | на подбор вариантов',
  ].join('\n'),
  whatsapp: '+996550022508',
  instagram: '',
  officeAddress: 'Бишкек, ул. Шабдан баатыра, 630',
  officeLink: 'https://go.2gis.com/IgaHn',
  currencyInstallment: 'сом',
  currencyCash: '$',
  heroKicker: 'Квартиры от застройщика',
  heroPoints: 'Рассрочка без банка\nПодбор бесплатно\nПокупка из-за рубежа',
  ctaText: 'Напишите бюджет — взнос и комфортный платёж в месяц. Пришлю подходящие варианты в WhatsApp.',
  ctaTitle: 'Подберу квартиру под ваш бюджет за 12 часов — бесплатно',
  steps: [
    'Пишете в WhatsApp и рассказываете бюджет: взнос и комфортный платёж',
    'Подбираю варианты и показываю квартиры — вживую или по видеосвязи',
    'Бронь и договор рассрочки напрямую со строительной компанией «Кут»',
    'Ежемесячные платежи без банка — и ключи после сдачи дома',
  ].join('\n'),
  documents: 'Паспорт\nИНН (если есть)\nДля покупки из-за рубежа — нотариальная доверенность',
  reviews: [
    'Ниязова Ф.А. | 06.10.2026\nАрлен сага терең ыраазычылык билдиргим келет. Анткени Арлен өз ишин сүйгөн, жоопкерчиликтүү, мыкты адис деп билдим. Ар бир сурообузга көңүл буруп, шашпай жооп берип, кардарларга болгон мамилең өтө жакшы экен. Ишиңде ар дайым ийгиликтер көп болсун, ден-соолугуң чың болсун. Бийиктиктерге жете бер.',
    'Эгизалиев Д.М. | 21.07.2026\nӨтө мыкты жигит экен.',
    'Турдахун к.Н. | 01.07.2026\nАрлен, чоң, чоң рахмат! Көрсөткөн кызматыңызга абдан ыраазы болуп калдым. Ишиңизди мыкты жана жоопкерчилик менен аткарат экенсиз. Ишиңизге ийгиликтерди, көптөгөн ыраазы кардарларды каалайм! Дайыма адамдардын жакшылыгына себепчи болуп, элдин батасын алып жүрө бериңиз!',
    'Мураталиева К.Ш. | 19.05.2026\nӨз жумушун так аткарган жоопкерчиликтүү жигит экен. Азаматсын иним!',
    'Бакытбеков Т.Б. | 15.05.2026\nЖаш болсо да жумушка болгон мамилеси бөлөк бала экен. Тактык жоопкерчиликтүү жана өтө кичипейил бала экен, молодец.',
    'Анашов Э.А. | 11.05.2026\nБизда ушул жигиттин түшүндүрмөсү аркылуу 2-комнат үйлүү болдук, жакшы шашпай баардык суроолоруңа так түшүндүрөт экен, молодец, бар бол иним.',
    'Бакытбек к.М. | 11.05.2026\nЖакшы түшүндүрүп берет экен. Жоопкерчиликтүү жигит. Всем советую!',
  ].join('\n\n'),
  faq: [
    'Какой минимальный первоначальный взнос?\nЗависит от дома и квартиры. Взнос по каждой квартире указан в карточке — или напишите, подберу вариант под вашу сумму.',
    'На какой срок даётся рассрочка?\nСрок рассчитывается по каждой квартире и указан в карточке: взнос, платёж в месяц и количество месяцев.',
    'Нужен ли банк?\nНет. Рассрочка оформляется напрямую со строительной компанией «Кут», без банка.',
    'Когда сдаётся дом?\nСроки сдачи разные по каждому дому — уточню по квартире, которая вам понравилась.',
    'Можно ли купить, находясь за границей?\nДа. Покажу квартиру по видеосвязи и расскажу, как оформить покупку удалённо.',
    'Сколько стоит подбор?\nДля покупателя подбор бесплатный.',
  ].join('\n\n'),
  privacy: 'Мы не собираем персональные данные через формы на сайте. Сайт использует системы веб-аналитики (Google Analytics / Яндекс Метрика) для подсчёта посещений и нажатий. Переписка в WhatsApp регулируется политикой WhatsApp.',
  gaId: '',
  ymId: '',
  pixelId: '',
  tgToken: '',
  tgChat: '',
  photo: '',
};

// Рассрочка (сом): [ЖК, комнаты, м², сом за м², мин. взнос, срок мес., от этажа, этажность, метки, адрес, оттенок фото]
const newBuild = [
  ['ЖК «Восток»', 1, 42, 92000, 1200000, 30, 3, 12, [], 'Бишкек, ул. Ахунбаева 120', 210],
  ['ЖК «Восток»', 2, 65, 88000, 1700000, 36, 5, 12, ['Скидка'], 'Бишкек, ул. Ахунбаева 120', 210],
  ['ЖК «Ала-Тоо Резиденс»', 0, 28, 98000, 800000, 24, 2, 9, [], 'Бишкек, ул. Токтогула 200', 25],
  ['ЖК «Парк Сити»', 3, 92, 90000, 2500000, 36, 7, 16, [], 'Бишкек, ул. Раззакова 50', 145],
  ['ЖК «Южный»', 4, 125, 85000, 3200000, 36, 3, 10, ['Скидка'], 'Бишкек, ул. Ахунбаева 98', 35],
  ['ЖК «Ала-Тоо Резиденс»', 1, 38, 95000, 1000000, 24, 6, 9, [], 'Бишкек, ул. Токтогула 200', 25],
];
// Наличные ($): [название, комнаты, м², цена $, этаж, этажность, метки, адрес, оттенок]
const resale = [
  ['Дом у парка', 2, 60, 62000, 4, 9, ['С ремонтом'], 'Бишкек, мкр. Джал', 300],
  ['Сталинка в центре', 3, 80, 85000, 2, 4, [], 'Бишкек, ул. Киевская', 190],
];
function svg(hue, label, variant) {
  const w = 1200, h = 800;
  let blds = '';
  const n = 5 + variant;
  for (let i = 0; i < n; i++) {
    const bw = 110 + ((i * 53 + variant * 31) % 90);
    const bh = 260 + ((i * 97 + variant * 41) % 330);
    const x = i * (w / n) + ((i * 17) % 30);
    const y = h - bh;
    const light = 88 - (i % 3) * 6;
    blds += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="hsl(${hue},18%,${light}%)"/>`;
    for (let wy = y + 24; wy < h - 30; wy += 38) {
      for (let wx = x + 16; wx < x + bw - 24; wx += 30) {
        const lit = (wx * 7 + wy * 3 + variant) % 5 === 0;
        blds += `<rect x="${wx}" y="${wy}" width="14" height="20" rx="2" fill="${lit ? `hsl(42,90%,70%)` : `hsl(${hue},30%,${light - 22}%)`}"/>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="hsl(${hue},55%,62%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},60%,86%)"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g)"/>
<circle cx="${950 - variant * 200}" cy="170" r="70" fill="hsl(45,100%,92%)" opacity=".85"/>
${blds}
</svg>`;
}

async function makePhoto(hue, label, variant) {
  const name = crypto.randomBytes(8).toString('hex');
  const img = sharp(Buffer.from(svg(hue, label, variant)));
  await img.clone().webp({ quality: 78 }).toFile(path.join(UPLOAD_DIR, `${name}.webp`));
  await img.clone().resize({ width: 640 }).webp({ quality: 72 }).toFile(path.join(UPLOAD_DIR, `${name}-t.webp`));
  await img.clone().resize({ width: 1200, height: 630, fit: 'cover' }).jpeg({ quality: 78 }).toFile(path.join(UPLOAD_DIR, `${name}-og.jpg`));
  return name;
}

const DETAILS = 'Монолитный каркас, панорамные окна, черновая отделка. Закрытый двор, детская площадка, подземный паркинг.';

async function photos(hue, label) {
  const list = [];
  for (let v = 0; v < 3; v++) list.push(await makePhoto(hue, label, v));
  return list;
}

// keepSettings: заменить только квартиры, сохранив настройки, пароль-секрет и статистику
async function seed({ keepSettings = false } = {}) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const list = [];
  let t = Date.now();
  const at = () => new Date(t -= 3600e3).toISOString();
  for (const [title, rooms, area, pricePerM2, down, months, floorFrom, floors, tags, address, hue] of newBuild) {
    list.push({ id: db.newId(), type: 'installment', title, rooms, area, pricePerM2, down, months, price: 0,
      cashDiscount: Math.round(pricePerM2 * 0.08 / 1000) * 1000, // демо: ~8% скидки за наличные
      floorFrom, floors, address, tags, photos: await photos(hue, title), details: DETAILS + ' Сдача дома — IV квартал 2027.', createdAt: at() });
  }
  for (const [title, rooms, area, price, floorFrom, floors, tags, address, hue] of resale) {
    list.push({ id: db.newId(), type: 'cash', title, rooms, area, pricePerM2: 0, down: 0, months: 0, price,
      floorFrom, floors, address, tags, photos: await photos(hue, title), details: 'Квартира на вторичном рынке, оплата наличными.', createdAt: at() });
  }
  if (keepSettings && db.exists()) {
    // Заменить только демо-квартиры кабинета владельца; кабинеты, настройки и аналитика остаются
    const data = db.load();
    const owner = (data.users || []).find(u => u.role === 'owner');
    if (!owner) throw new Error('В базе нет владельца — запустите сайт один раз, чтобы перенести базу');
    list.forEach(a => { a.realtorId = owner.realtorId; });
    data.apartments = data.apartments.filter(a => a.realtorId !== owner.realtorId).concat(list);
    db.write(data);
  } else {
    // Новая база: собираем в формате «один риелтор» и переносим в кабинеты тем же кодом, что и старые базы
    const data = { secret: crypto.randomBytes(32).toString('hex'), settings: { ...settings, logo: '/img/logo.png', company: 'Строительная компания «Кут»' }, apartments: list, events: [] };
    tenants.migrate(data, db.newId, process.env.ADMIN_PASSWORD || 'admin');
    db.write(data);
  }
  console.log(`Демо-квартиры созданы: ${list.length}`);
}
module.exports = seed;
module.exports.settings = settings;

if (require.main === module) {
  if (db.exists() && !process.argv.includes('--force') && !process.argv.includes('--keep-settings')) {
    console.log('База уже есть. Для перезаписи: npm run seed');
  } else {
    seed({ keepSettings: process.argv.includes('--keep-settings') }).catch(e => { console.error(e); process.exit(1); });
  }
}
