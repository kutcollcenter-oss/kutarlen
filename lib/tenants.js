// Менеджеры (кабинеты): ссылки, статус оплаты, перенос базы из версии «один менеджер».
const { hashPassword } = require('./auth');

// Адрес сайта менеджера — просто имя латиницей: «/arlen», «/ernazar».
// Занято — добавляется цифра: «/arlen2». Владелец может вписать адрес вручную.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/;
// Адреса, которые заняты самим сайтом
const RESERVED = new Set(['admin', 'partner', 'api', 'uploads', 'css', 'js', 'img', 'kvartira', 'privacy', 'robots', 'sitemap', 'favicon', 'static', 'login', 'www']);

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ө: 'o', ү: 'u', ң: 'n', ә: 'a', ғ: 'g', қ: 'k', ұ: 'u', һ: 'h', і: 'i',
};

const latin = text => String(text || '').toLowerCase()
  .split('').map(ch => (ch in TRANSLIT ? TRANSLIT[ch] : ch)).join('')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Проверка адреса, вписанного вручную. Возвращает текст ошибки или ''.
function slugError(slug) {
  if (!SLUG_RE.test(slug)) return 'Адрес: латинские буквы, цифры и дефис, от 1 до 30 символов';
  if (RESERVED.has(slug)) return 'Этот адрес занят самим сайтом, выберите другой';
  return '';
}

// Адрес из имени: первое слово латиницей («Айдана Асанова» → «aydana»), при совпадении — «aydana2»
function makeSlug(name, taken = () => false) {
  let base = latin(name).split('-')[0].slice(0, 26) || 'realtor';
  if (RESERVED.has(base)) base += '1';
  let slug = base;
  for (let i = 2; taken(slug); i++) slug = `${base}${i}`;
  return slug;
}

// Адреса с кодом из прошлой версии («arlen-wte9yc») → просто имя. Старый адрес запоминается и переадресуется.
function plainSlugs(data) {
  let changed = false;
  for (const r of data.realtors) {
    if (!/-[a-z0-9]{6}$/.test(r.slug)) continue;
    const old = r.slug;
    r.slug = makeSlug(r.settings.name, x => data.realtors.some(o => o !== r && o.slug === x));
    r.oldSlugs = [...new Set([...(r.oldSlugs || []), old])];
    changed = true;
  }
  return changed;
}

const today = () => new Date().toISOString().slice(0, 10);

// Сайт менеджера работает, пока он не заблокирован и оплата не закончилась.
// paidUntil пустой — без ограничения срока (так у владельца).
function status(r) {
  if (r.blocked) return { active: false, code: 'blocked', label: 'Заблокирован' };
  const until = r.plan && r.plan.paidUntil;
  if (until && until < today()) return { active: false, code: 'expired', label: `Оплата закончилась ${until}` };
  if (!until) return { active: true, code: 'unlimited', label: 'Без ограничения срока' };
  const days = Math.round((Date.parse(until) - Date.parse(today())) / 864e5);
  return { active: true, code: days <= 5 ? 'ending' : 'active', label: `Оплачено до ${until}`, daysLeft: days };
}

// Настройки сайта нового менеджера — нейтральные, без чужих данных
function defaultSettings(name) {
  return {
    name: name || 'Менеджер',
    role: 'Менеджер',
    company: '',
    logo: '',
    photo: '',
    tagline: 'Подберу квартиру в рассрочку без банка',
    heroKicker: 'Квартиры от застройщика',
    heroPoints: 'Рассрочка без банка\nПодбор бесплатно\nПокупка из-за рубежа',
    about: 'Помогаю подобрать квартиру под ваш бюджет: первоначальный взнос и комфортный платёж в месяц. Объясняю условия рассрочки и сопровождаю до получения ключей.',
    stats: '',
    whatsapp: '',
    instagram: '',
    officeAddress: '',
    officeLink: '',
    currencyInstallment: 'сом',
    currencyCash: '$',
    ctaTitle: 'Подберу квартиру под ваш бюджет за 12 часов — бесплатно',
    ctaText: 'Напишите бюджет — взнос и комфортный платёж в месяц. Пришлю подходящие варианты в WhatsApp.',
    steps: [
      'Пишете в WhatsApp и рассказываете бюджет: взнос и комфортный платёж',
      'Подбираю варианты и показываю квартиры — вживую или по видеосвязи',
      'Бронь и договор рассрочки напрямую с застройщиком',
      'Ежемесячные платежи без банка — и ключи после сдачи дома',
    ].join('\n'),
    documents: 'Паспорт\nИНН (если есть)',
    reviews: '',
    faq: [
      'Нужен ли банк?\nНет. Рассрочка оформляется напрямую с застройщиком, без банка.',
      'Сколько стоит подбор?\nДля покупателя подбор бесплатный.',
    ].join('\n\n'),
    privacy: 'Мы не собираем персональные данные через формы на сайте. Сайт использует веб-аналитику для подсчёта посещений и нажатий. Переписка в WhatsApp регулируется политикой WhatsApp.',
    gaId: '', ymId: '', pixelId: '', tgToken: '', tgChat: '',
  };
}

function defaultProduct() {
  return {
    name: 'Сайт для менеджера',
    tagline: 'Личный сайт с подбором квартир и калькулятором рассрочки — заявки приходят прямо в WhatsApp',
    whatsapp: '',
    priceText: '',
    priceMonth: '900',   // тариф на 1 месяц, сом
    price6: '4900',      // тариф на 6 месяцев, сом
    rootRealtorId: '',
  };
}

// База версии «один менеджер» → кабинеты. Старые данные становятся кабинетом владельца.
function migrate(data, newId, ownerPassword) {
  if (data.realtors) return { changed: false };
  const realtorId = newId();
  const settings = { ...defaultSettings(), ...(data.settings || {}) };
  // У первой версии логотип «Кут» был вшит в шаблон — переносим его в настройки
  if (!settings.logo) settings.logo = '/img/logo.png';
  if (!settings.company) settings.company = 'Строительная компания «Кут»';
  delete settings.showBooked; delete settings.currency; delete settings.phone; delete settings.telegram;

  const owner = {
    id: newId(), login: 'admin', role: 'owner', realtorId,
    ...hashPassword(ownerPassword), defaultPassword: !process.env.ADMIN_PASSWORD, createdAt: new Date().toISOString(),
  };
  const realtor = {
    id: realtorId, slug: makeSlug(settings.name), settings,
    plan: { paidUntil: '', maxApartments: 0 }, blocked: false, note: 'Владелец', createdAt: new Date().toISOString(),
  };
  for (const a of data.apartments || []) a.realtorId = realtorId;
  const oldEvents = (data.events || []).map(e => ({ t: e.t, r: realtorId, e: 'wa', pl: e.type, a: e.id || null }));

  delete data.settings;
  delete data.events;
  data.product = defaultProduct();
  data.users = [owner];
  data.realtors = [realtor];
  return { changed: true, oldEvents, realtor };
}

module.exports = { SLUG_RE, slugError, makeSlug, plainSlugs, status, defaultSettings, defaultProduct, migrate, today };
