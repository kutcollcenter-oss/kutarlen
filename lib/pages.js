// Серверный рендер страниц (нужен для SEO и превью ссылок в WhatsApp)
const fs = require('fs');
const path = require('path');
const { money, waLink, roomsLabel, handoverLabel } = require('./calc');
const { t, plural, dict } = require('./i18n');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = v => JSON.stringify(v).replace(/</g, '\\u003c');

const INDEX_TPL = path.join(__dirname, '..', 'views', 'index.html');
// Версия для сброса кэша CSS/JS: меняется при изменении файлов
const ASSETS = ['css/style.css', 'css/landing.css', 'js/common.js', 'js/app.js', 'js/apartment.js'].map(p => path.join(__dirname, '..', 'public', p));
const version = () => Math.max(...ASSETS.map(p => fs.statSync(p).mtimeMs)).toString(36).replace('.', '');

const WA_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.5 1.1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>';

const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  bed: svg('<path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 14h18M3 18v2M21 18v2M7 9V6h10v3"/>'),
  area: svg('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h3M4 14h3M9 4v3M14 4v3"/>'),
  calendar: svg('<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
  floor: svg('<path d="M4 21V5l8-3 8 3v16M9 21v-4h6v4M8 8h1M8 12h1M15 8h1M15 12h1"/>'),
  pin: svg('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  home: svg('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>'),
  grid: svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
  star: svg('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z"/>'),
  insta: svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>'),
};

// Логотип сервиса kvartiry.asia: иконка во вкладке на всех страницах (Яндекс и Google показывают
// одну иконку на весь сайт рядом с ним в поиске) и картинка превью ссылки, если у страницы нет своей.
// Логотип менеджера остаётся на самих страницах и иконкой на экране телефона.
const BRAND = { name: 'kvartiry.asia', icon: '/img/brand/icon-32.png', icon192: '/img/brand/icon-192.png', touch: '/img/brand/icon-180.png', og: '/img/brand/og.jpg', logo: '/img/brand/logo.png' };

// Структурированные данные для Google и Яндекса (schema.org в формате JSON-LD).
// «<» экранируется, чтобы текст из базы не мог закрыть тег <script>.
const jsonLd = data => (data ? `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>` : '');

function head({ title, description, image, url, settings, ld, lang = 'ru' }) {
  const origin = String(url || '').replace(/^(https?:\/\/[^/]+).*$/, '$1');
  const ownIcon = settings.logo || settings.photo;
  const ogImage = image || (origin ? origin + BRAND.og : '');
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${BRAND.name}">
<meta property="og:locale" content="${t(lang, 'ogLocale')}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}"><meta name="twitter:card" content="summary_large_image">` : ''}
<meta name="theme-color" content="#f2f1ee">
<script>document.documentElement.classList.add('js');setTimeout(function(){document.documentElement.classList.add('ready','pl-done')},4000)</script>
<link rel="icon" type="image/png" sizes="32x32" href="${BRAND.icon}">
<link rel="icon" type="image/png" sizes="192x192" href="${BRAND.icon192}">
<link rel="apple-touch-icon" href="${esc(ownIcon || BRAND.touch)}">
${jsonLd(ld)}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@300;400;500&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css?v=${version()}">`;
}

function publicSettings(s) {
  const { tgToken, tgChat, ...rest } = s;
  return rest;
}

const igLink = s => `https://instagram.com/${String(s.instagram).replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '')}`;

// Логотип компании менеджера (загружается в кабинете). Нет логотипа — не показываем ничего.
function logo(s, cls = '', w = 50, h = 30) {
  return s.logo ? `<img src="${esc(s.logo)}" alt="${esc(s.company || s.name)}" class="${cls}" width="${w}" height="${h}">` : '';
}

// ctx — сайт конкретного менеджера: { s: настройки, base: «https://домен», prefix: «/aidana-k7f3q9», slug }
// Все ссылки внутри сайта идут через prefix, поэтому клиент никогда не попадает на сайт другого менеджера.

// Есть ли у менеджера отзывы. Нет — раздела «Отзывы» на странице нет, и пункт меню тоже не показываем.
const hasReviews = s => /\S/.test(String(s.reviews || ''));

// Шапка. Верхнее меню и кнопка WhatsApp видны только на ноутбуке (≥1024 px), на телефоне и планшете — нижнее меню.
// Переключатель языка «Рус / Кыр»: ссылка ?lang=… запоминает выбор (см. server.js) и открывает ту же страницу
function langSwitch(lang) {
  return `<div class="lang-sw" role="group" aria-label="Тил / Язык">${['ru', 'ky'].map(l =>
    `<a href="?lang=${l}" hreflang="${l}" lang="${l}" title="${t(l, 'langName')}"${l === lang ? ' class="on" aria-current="true"' : ''}>${t(l, 'langShort')}</a>`).join('')}</div>`;
}

function header(ctx, home = false) {
  const { s, prefix, lang } = ctx;
  const p = home ? '' : `${prefix}/`;
  return `<header class="topbar"><div class="wrap">
  <a href="${prefix}" class="brand">${logo(s)}<span><b>${esc(s.name)}</b><small>${esc(s.role || '')}</small></span></a>
  <nav class="nav"><a href="${p}#catalog">${t(lang, 'navApartments')}</a>${hasReviews(s) ? `<a href="${p}#reviews-sec">${t(lang, 'navReviews')}</a>` : ''}<a href="${p}#faq-sec">${t(lang, 'navQuestions')}</a></nav>
  ${langSwitch(lang)}
  ${s.whatsapp ? `<a href="${esc(waLink(s.whatsapp, t(lang, 'waGeneral')))}" class="btn btn-wa head-cta" data-wa="header" target="_blank" rel="noopener">${WA_ICON}WhatsApp</a>` : ''}
</div></header>`;
}

// Нижнее меню — на телефоне и планшете. home=true: якоря на главной, иначе ссылки на главную менеджера.
function tabbar(ctx, { home = false, active = '', waText = '', waPlace = 'tabbar', aptId = '' } = {}) {
  const { s, prefix, lang } = ctx;
  if (!waText) waText = t(lang, 'waGeneral');
  const p = home ? '' : `${prefix}/`;
  const item = (key, href, icon, label) =>
    `<a href="${href}" class="tab${active === key ? ' on' : ''}" data-tab="${key}">${icon}<span>${label}</span></a>`;
  return `<nav class="tabbar" aria-label="${t(lang, 'menu')}">
  ${item('home', home ? '#top' : prefix, ICONS.home, t(lang, 'navHome'))}
  ${item('catalog', `${p}#catalog`, ICONS.grid, t(lang, 'navApartments'))}
  ${hasReviews(s) ? item('reviews', `${p}#reviews-sec`, ICONS.star, t(lang, 'navReviews')) : ''}
  <a href="${esc(waLink(s.whatsapp, waText))}" class="tab tab-wa" id="tabWa" data-wa="${waPlace}"${aptId ? ` data-id="${aptId}"` : ''} target="_blank" rel="noopener">${WA_ICON}<span>WhatsApp</span></a>
</nav>`;
}

// Подвал: тёмный фон с ночным силуэтом стройки, заметный блок «Хотите такой же сайт?» (владелец может скрыть
// его у любого менеджера — ctx.partnerCta) и строка с документами и ©.
// Имя, контакты и разделы в подвал не выводим — они уже есть на странице и в меню.
function footer(ctx) {
  const { s, prefix, lang } = ctx;
  return `<footer class="footer fx${ctx.partnerCta === false ? ' fx-short' : ''}"><div class="wrap">
  ${ctx.partnerCta === false ? '' : `<a class="fx-cta" href="/partner">
    <span class="fx-cta-text"><b>${t(lang, 'footerCta')}</b><span>${t(lang, 'footerCtaText')}</span></span>
    <span class="fx-cta-btn"><img src="/img/brand/icon-32.png" alt="" width="20" height="20">${t(lang, 'footerCtaBtn')}</span>
  </a>`}
  <div class="fx-bottom">
    <nav class="fx-legal" aria-label="${t(lang, 'docsNav')}"><a href="${prefix}/privacy">${t(lang, 'privacy')}</a></nav>
    <span class="fx-copy">${esc(s.name)} / © ${new Date().getFullYear()}</span>
  </div>
</div></footer>`;
}

// page — для аналитики: home | apt | gone | privacy
function scripts(ctx, page, extra = {}, files = ['common']) {
  // lang и t — язык страницы и словарь для скриптов (common.js, app.js, apartment.js)
  return `<script>window.__DATA__=${json({ settings: publicSettings(ctx.s), slug: ctx.slug, page, lang: ctx.lang || 'ru', t: dict(ctx.lang), waIcon: WA_ICON, icons: ICONS, ...extra })}</script>
${files.map(f => `<script src="/js/${f}.js?v=${version()}"></script>`).join('\n')}`;
}

// Код валюты для schema.org: «сом» → KGS, «$» → USD; иначе цену без валюты не указываем
const currencyCode = c => ({ 'сом': 'KGS', 'сом.': 'KGS', '$': 'USD', 'usd': 'USD' }[String(c || '').trim().toLowerCase()] || '');
const phoneOf = s => { const d = String(s.whatsapp || '').replace(/\D/g, ''); return d ? '+' + d : undefined; };
const abs = (base, u) => (u ? (/^https?:/.test(u) ? u : base + u) : undefined);

// Менеджер как риелтор + список его квартир (каталог рисуется скриптом, а так поисковик видит ссылки сразу)
function agentLd(ctx, apartments) {
  const { s, base, prefix } = ctx;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'RealEstateAgent',
        '@id': base + prefix + '#agent',
        name: s.name,
        description: s.tagline || undefined,
        url: base + prefix,
        image: abs(base, s.photo),
        logo: abs(base, s.logo),
        telephone: phoneOf(s),
        address: s.officeAddress ? { '@type': 'PostalAddress', streetAddress: s.officeAddress } : undefined,
        sameAs: s.instagram ? [igLink(s)] : undefined,
      },
      apartments.length ? {
        '@type': 'ItemList',
        name: `${t(ctx.lang, 'navApartments')} — ${s.name}`,
        itemListElement: apartments.map((a, i) => ({ '@type': 'ListItem', position: i + 1, url: base + a.url, name: `${a.roomsLabel}, ${a.area} ${a.unit}${a.title ? ' — ' + a.title : ''}` })),
      } : undefined,
    ].filter(Boolean),
  };
}

// Квартира: предложение с ценой, адресом и фото + «хлебные крошки» (сайт менеджера → квартира)
function apartmentLd(ctx, a, title) {
  const { s, base, prefix } = ctx;
  const code = currencyCode(a.currency);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Offer',
        name: title,
        url: base + a.url,
        price: code ? a.price : undefined,
        priceCurrency: code || undefined,
        availability: 'https://schema.org/InStock',
        seller: { '@type': 'RealEstateAgent', '@id': base + prefix + '#agent', name: s.name, url: base + prefix },
        itemOffered: {
          '@type': a.type === 'commercial' || a.type === 'land' ? 'Place' : 'Apartment',
          name: `${a.roomsLabel}, ${a.area} ${a.unit}${a.title ? ' — ' + a.title : ''}`,
          numberOfRooms: a.type === 'commercial' || a.type === 'land' ? undefined : (a.rooms || undefined),
          floorSize: { '@type': 'QuantitativeValue', value: a.type === 'land' ? a.area * 100 : a.area, unitCode: 'MTK' }, // сотка = 100 м²
          address: a.address || undefined,
          image: a.photos.length ? a.photos.map(ph => base + ph.src) : undefined,
          description: a.details || undefined,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: s.name, item: base + prefix },
          { '@type': 'ListItem', position: 2, name: `${a.roomsLabel}, ${a.area} ${a.unit}`, item: base + a.url },
        ],
      },
    ],
  };
}

// ---------- Главная: содержимое сразу в HTML ----------
// Роботы Instagram, Facebook, Google и Яндекса не запускают скрипты. Раньше они видели пустой заголовок, ни одной квартиры
// и одни кнопки WhatsApp — для автоматической проверки это похоже на «ловушку для заявок». Теперь весь текст и карточки
// квартир приходят в коде страницы; скрипт app.js потом перерисовывает их так же, как раньше (фильтр, анимации).
const textLines = t => String(t || '').split('\n').map(x => x.trim()).filter(Boolean);
const textBlocks = t => String(t || '').split(/\n\s*\n/).map(b => textLines(b)).filter(b => b.length);
// Вставить HTML внутрь пустого элемента с этим id (в шаблоне views/index.html они пустые)
const fillId = (html, id, inner) => html.replace(new RegExp(`(<([a-z0-9]+)[^>]*\\bid="${id}"[^>]*>)\\s*(</\\2>)`), (m, open, tag, close) => open + inner + close);

// Наличные и участки — одна цена в $, без рассрочки
const isCash = a => a.type === 'cash' || a.type === 'land';

function serverCard(a, lang) {
  const c = a.currency;
  const photo = a.photos[0] ? `<img src="${a.photos[0].thumb}" alt="${esc(`${a.roomsLabel}, ${a.area} ${a.unit}`)}" loading="lazy">` : '<div class="ph"></div>';
  const price = a.installment
    ? `<div class="card-price"><b>${money(a.monthly, c)}</b><span>${t(lang, 'perMonth')}</span></div>`
    : `<div class="card-price"><b>${money(a.price, c)}</b><span>${t(lang, isCash(a) ? 'cashWord' : 'fullPay')}</span></div>`;
  const pay = a.installment
    ? `<div class="pay-row"><div><span>${t(lang, 'down')}</span><b>${money(a.down, c)}</b></div><div><span>${t(lang, 'term')}</span><b>${t(lang, 'months', { n: a.months })}</b></div><div><span>${t(lang, 'price')}</span><b>${money(a.price, c)}</b></div></div>`
    : '';
  return `<article class="card"><a class="card-link" href="${a.url}">
      <div class="card-photo">${photo}</div>
      <div class="card-body">${price}<div class="card-title">${a.roomsLabel}, ${a.area} ${a.unit}${a.title ? ` · ${esc(a.title)}` : ''}</div>
        ${a.address ? `<div class="card-addr">${ICONS.pin}${esc(a.address)}</div>` : ''}${pay}</div></a></article>`;
}

// Новость «Скоро»: фото, заголовок, текст и кнопка «Узнать первым» — клиент пишет менеджеру в WhatsApp
function newsCard(n, s, lang) {
  const text = t(lang, 'waNews', { title: n.title || n.text.slice(0, 80) });
  const href = s.whatsapp ? waLink(s.whatsapp, text) : '#';
  return `<article class="news-card">
      ${n.photo ? `<div class="news-photo"><img src="/uploads/${esc(n.photo)}.webp" alt="${esc(n.title)}" loading="lazy"></div>` : ''}
      <div class="news-body">
        ${n.title ? `<h3>${esc(n.title)}</h3>` : ''}
        ${n.text ? `<p class="news-text">${esc(n.text).replace(/\n/g, '<br>')}</p>
        <button type="button" class="news-more" aria-expanded="false" hidden>${t(lang, 'newsMore')}</button>` : ''}
        <a class="btn btn-wa news-btn" href="${esc(href)}" data-wa="news" target="_blank" rel="noopener">${WA_ICON}${t(lang, 'newsBtn')}</a>
      </div>
    </article>`;
}

function fillIndex(html, ctx, apartments) {
  const { s, lang } = ctx;
  // Тексты шаблона {{ключ}} — из словаря на языке страницы
  html = html.replace(/\{\{(\w+)\}\}/g, (m, k) => (k.endsWith('Html') ? t(lang, k) : esc(t(lang, k))));
  // Новостей нет — блока «Скоро» на странице нет совсем
  const news = (Array.isArray(s.news) ? s.news : []).filter(n => n && (n.title || n.text));
  html = news.length
    ? fillId(html, 'news', news.map(n => newsCard(n, s, lang)).join(''))
    : html.replace(/<!--NEWS-->[\s\S]*?<!--\/NEWS-->/, '');
  const wa = s.whatsapp ? waLink(s.whatsapp, t(lang, 'waGeneral')) : '#';
  const role = String(s.role || '');
  html = fillId(html, 'heroKicker', esc(s.heroKicker || ''));
  html = fillId(html, 'heroTitle', esc(s.tagline || ''));
  html = fillId(html, 'heroSub', esc(t(lang, 'heroSub', { who: `${s.name}${role ? ` — ${role[0].toLowerCase() + role.slice(1)}` : ''}` })));
  html = fillId(html, 'heroPoints', textLines(s.heroPoints).map(x => `<li>${esc(x)}</li>`).join(''));
  html = fillId(html, 'heroPhoto', s.photo ? `<img src="${esc(s.photo)}" alt="${esc(s.name)}" fetchpriority="high">` : '');
  html = fillId(html, 'badgeName', esc(s.name));
  html = fillId(html, 'badgeRole', esc(role));
  html = fillId(html, 'cards', apartments.map(a => serverCard(a, lang)).join(''));
  html = fillId(html, 'steps', textLines(s.steps).map(x => `<li>${esc(x)}</li>`).join(''));
  html = fillId(html, 'docs', textLines(s.documents).map(x => `<li>${esc(x)}</li>`).join(''));
  html = fillId(html, 'aboutTitle', t(lang, 'aboutTitleHtml', { name: esc(s.name) }));
  html = fillId(html, 'aboutText', esc(s.about || ''));
  html = fillId(html, 'officeAddr', esc(s.officeAddress || ''));
  if (s.officeLink) html = html.replace('<a class="office" id="office"', `<a class="office" id="office" href="${esc(s.officeLink)}"`);
  html = fillId(html, 'stats', textLines(s.stats).map(l => { const [v, t] = l.split('|').map(x => x.trim()); return `<div class="stat"><div><b>${esc(v)}</b><span>${esc(t || '')}</span></div></div>`; }).join(''));
  html = fillId(html, 'reviews', textBlocks(s.reviews).map(([head, ...text]) => {
    const [who, date] = head.split('|').map(x => x.trim());
    return `<figure class="review"><blockquote>${esc(text.join(' '))}</blockquote><figcaption><span><b>${esc(who)}</b>${date ? `<small>${esc(date)}</small>` : ''}</span></figcaption></figure>`;
  }).join(''));
  html = fillId(html, 'faq', textBlocks(s.faq).map(([q, ...a]) => `<details><summary>${esc(q)}</summary><p>${esc(a.join(' '))}</p></details>`).join(''));
  html = fillId(html, 'ctaTitle', esc(s.ctaTitle || ''));
  html = fillId(html, 'ctaText', esc(s.ctaText || ''));
  // Настоящие ссылки WhatsApp вместо «#»
  html = html.replace('href="#" class="btn btn-wa btn-lg" id="heroWa"', `href="${esc(wa)}" class="btn btn-wa btn-lg" id="heroWa"`)
    .replace('href="#" class="btn btn-wa btn-lg" id="ctaWa"', `href="${esc(wa)}" class="btn btn-wa btn-lg" id="ctaWa"`);
  return html;
}

function renderIndex(ctx, apartments) {
  const { s, base, prefix } = ctx;
  const tpl = fs.readFileSync(INDEX_TPL, 'utf8');
  const description = t(ctx.lang, 'metaIndex', { tagline: s.tagline });
  return fillIndex(tpl, ctx, apartments)
    .replace('<!--HEAD-->', head({ title: `${s.name} — ${s.tagline}`, description, image: s.photo ? base + s.photo.replace(/\.webp$/, '-og.jpg') : null, url: base + prefix, settings: s, ld: agentLd(ctx, apartments), lang: ctx.lang }))
    .replace('<!--HEADER-->', header(ctx, true))
    .replace('<!--LOGO:pl-->', s.logo ? logo(s, 'pl-logo', 160, 97) : `<div class="pl-name">${esc(s.name)}</div>`)
    .replace('<!--PL-CAP-->', esc(s.heroKicker || s.role || ''))
    .replace('<!--LOGO:badge-->', logo(s, '', 52, 31))
    .replace('<!--LOGO:office-->', logo(s, 'office-logo', 96, 58))
    .replace('<!--FOOTER-->', footer(ctx) + tabbar(ctx, { home: true, active: 'home' }))
    .replace('<!--SCRIPTS-->', scripts(ctx, 'home', { apartments }, ['common', 'app']));
}

function miniCard(a, lang) {
  return `<a class="mini" href="${a.url}">
  ${a.photos[0] ? `<img src="${a.photos[0].thumb}" alt="" loading="lazy">` : '<div class="ph"></div>'}
  <div><b>${a.roomsLabel}, ${a.area} ${a.unit}</b><span>${a.installment ? `${money(a.monthly, a.currency)} ${t(lang, 'perMonth')}` : money(a.price, a.currency)}</span></div></a>`;
}

function renderApartment(ctx, a, similar) {
  const { s, base, lang } = ctx;
  const L = (k, v) => t(lang, k, v);
  const cur = a.currency;
  const title = `${a.roomsLabel}, ${a.area} ${a.unit} — ${money(a.price, cur)}${a.installment ? L('titleFromMonthly', { x: money(a.monthly, cur) }) : ''}`;
  const desc = [a.title, a.address, a.installment ? L('descDown', { x: money(a.down, cur), n: a.months }) : isCash(a) ? L('payCash') : L('fullPay')].filter(Boolean).join(' · ');
  const wa = waLink(s.whatsapp, a.waText);
  const ppmLabel = a.type === 'land' ? 'ppmSot' : 'ppmM2';

  const gallery = a.photos.length
    ? a.photos.map((p, i) => `<img src="${p.src}" alt="${esc(`${a.roomsLabel}, ${a.area} ${a.unit}${a.title ? ', ' + a.title : ''} — ${L('photoN', { i: i + 1 })}`)}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}>`).join('')
    : '<div class="ph big"></div>';

  // Калькулятор: клиент может внести больше минимального взноса — платёж в месяц уменьшится
  const calc = a.installment ? `
    <section class="calc" id="calc">
      <!-- Сначала клиент выбирает взнос, под ним сразу видит платёж в месяц -->
      <div class="calc-down">
        <div class="field-head"><label for="cDownInput">${L('calcDown')}</label><span class="calc-min">${L('calcMin', { x: money(a.down, cur) })}</span></div>
        <div class="calc-input"><input id="cDownInput" type="text" inputmode="numeric" value="${money(a.down, '')}" aria-label="${L('calcDown')}"><span>${esc(cur)}</span></div>
        <input type="range" id="cDown" class="range" aria-label="${L('calcDown')}">
        <p class="calc-hint" id="cHint">${L('calcHint')}</p>
      </div>
      <div class="calc-main" aria-live="polite">
        <span>${L('calcMonthly')}</span>
        <b id="cMonthly">${money(a.monthly, cur)}</b>
        <small id="cTerm">${L('calcTerm', { n: a.months })}</small>
      </div>
      <dl class="calc-rows">
        <div><dt>${L('price')}</dt><dd>${money(a.price, cur)}</dd></div>
        <div><dt>${L('calcRest')}</dt><dd id="cRest">${money(a.price - a.down, cur)}</dd></div>
        <div><dt>${L('calcPpm')}</dt><dd>${money(a.pricePerM2, cur)}</dd></div>
      </dl>
      <p class="calc-note">${L('calcNote')}</p>
      ${a.cash ? `
      <div class="cash-offer" id="cashOffer">
        <span class="co-badge">${L('coBadge')}</span>
        <div class="co-head"><span>${L('coHead')}</span><b>${money(a.cash.price, cur)}</b></div>
        <p class="co-line">${L('coLine', { ppm: money(a.cash.ppm, cur), old: money(a.pricePerM2, cur), d: money(a.cash.discount, cur) })}</p>
        <p class="co-save"><span class="co-mark">${L('coSaveHtml', { x: money(a.cash.savings, cur) })}</span></p>
        <p class="co-hint" id="coHint">${L('coHint', { x: money(a.cash.price, cur), own: L(a.type === 'commercial' ? 'ownCommercial' : 'ownApartment') })}</p>
        <a class="btn btn-wa co-btn" id="cashWa" href="${esc(waLink(s.whatsapp, a.cash.waText))}" data-wa="apartment-cash" data-id="${a.id}" target="_blank" rel="noopener">${WA_ICON}${L('wantCash')}</a>
      </div>` : ''}
    </section>` : `
    <section class="calc">
      <div class="calc-main"><span>${L(isCash(a) ? 'priceCash' : 'priceFull')}</span><b>${money(a.price, cur)}</b><small>${L(ppmLabel, { x: money(a.pricePerM2, cur) })}</small></div>
    </section>`;

  // Этаж и этажность — в строке под заголовком. Отдельного блока «Характеристики» нет: он повторял
  // заголовок, адрес, эту строку и срок рассрочки из расчёта.
  const floorInfo = a.floorFrom ? L('floorFromOf', { f: a.floorFrom, of: a.floors ? L('floorOf', { n: a.floors }) : '' }) : a.floors ? L('houseFloors', { n: a.floors }) : '';

  return `<!doctype html><html lang="${L('htmlLang')}"><head>
${head({ title, description: desc, image: a.photos[0] ? base + a.photos[0].og : null, url: base + a.url, settings: s, ld: apartmentLd(ctx, a, title), lang })}
</head><body class="apt-page">
${header(ctx)}
<main class="wrap apt">
  <div class="gallery-wrap">
    <div class="gallery" id="gallery">${gallery}</div>
    ${a.photos.length > 1 ? `<div class="gallery-count" id="gcount">1 / ${a.photos.length}</div>` : ''}
    <div class="tags">${a.tags.map(x => `<span class="tag${(x === 'Скидка' || x === 'Арзандатуу') ? ' tag-sale' : x === L('tagInstallment') ? ' tag-inst' : ''}">${esc(x)}</span>`).join('')}</div>
  </div>
  <div class="apt-info">
    ${a.title ? `<div class="apt-complex">${esc(a.title)}</div>` : ''}
    <h1>${a.roomsLabel}, ${a.area} ${a.unit}</h1>
    ${a.address ? `<div class="addr">${ICONS.pin}${esc(a.address)}</div>` : ''}
    <div class="feats">
      ${a.type === 'land' ? '' : `<span>${ICONS.bed}${a.roomsLabel}</span>`}<span>${ICONS.area}${a.area} ${a.unit}</span>
      ${floorInfo ? `<span>${ICONS.floor}${floorInfo}</span>` : ''}
      ${a.handover ? `<span>${ICONS.calendar}${esc(handoverLabel(a.handover, lang))}</span>` : ''}
    </div>
    ${calc}
    <a class="btn btn-wa btn-lg apt-cta" id="aptWa" href="${esc(wa)}" data-wa="apartment" data-id="${a.id}" target="_blank" rel="noopener">${WA_ICON}${L({ commercial: 'wantCommercial', land: 'wantLand' }[a.type] || 'wantApartment')}</a>
  </div>
  <!-- Детали и карта: на телефоне — после цены (кнопка встаёт между ними, см. common.js), на ноутбуке — под фото (см. .apt-more в style.css) -->
  <div class="apt-more">
    ${a.details ? `<section class="details"><h2>${L('details')}</h2><p>${esc(a.details).replace(/\n/g, '<br>')}</p></section>` : ''}
    ${a.map.embed ? `<section class="map"><h2>${L('onMap')}</h2>
      <iframe loading="lazy" title="${L('map')}" src="${esc(a.map.embed)}" referrerpolicy="no-referrer-when-downgrade"></iframe>
    </section>` : ''}
  </div>
  ${similar.length ? `<section class="similar"><h2>${L({ commercial: 'similarCommercial', land: 'similarLand' }[a.type] || 'similarApartment')}</h2><div class="mini-list">${similar.map(x => miniCard(x, lang)).join('')}</div></section>` : ''}
</main>
${footer(ctx)}
${tabbar(ctx, { active: 'catalog', waText: a.waText, waPlace: 'apartment-tab', aptId: a.id })}
${scripts(ctx, 'apt', { apartment: a, base }, ['common', 'apartment'])}
</body></html>`;
}

function renderGone(ctx, similar) {
  const { s, base, prefix, lang } = ctx;
  return `<!doctype html><html lang="${t(lang, 'htmlLang')}"><head>
${head({ title: t(lang, 'goneTitle', { name: s.name }), description: t(lang, 'goneDesc'), url: base + prefix, settings: s, lang })}
<meta name="robots" content="noindex">
</head><body class="apt-page">
${header(ctx)}
<main class="wrap gone">
  <h1>${t(lang, 'goneH1')}</h1>
  <p>${t(lang, 'goneText')}</p>
  ${similar.length ? `<div class="mini-list">${similar.map(x => miniCard(x, lang)).join('')}</div>` : ''}
  <a class="btn btn-wa btn-lg" href="${esc(waLink(s.whatsapp, t(lang, 'waGone')))}" data-wa="gone" target="_blank" rel="noopener">${WA_ICON}${t(lang, 'pickManually')}</a>
</main>
${footer(ctx)}
${tabbar(ctx, { active: 'catalog' })}
${scripts(ctx, 'gone')}
</body></html>`;
}

function renderPrivacy(ctx) {
  const { s, base, prefix, lang } = ctx;
  return `<!doctype html><html lang="${t(lang, 'htmlLang')}"><head>
${head({ title: `${t(lang, 'privacy')} — ${s.name}`, description: t(lang, 'privacy'), url: `${base}${prefix}/privacy`, settings: s, lang })}
</head><body class="apt-page">
${header(ctx)}
<main class="wrap gone"><h1>${t(lang, 'privacy')}</h1><p>${esc(s.privacy).replace(/\n/g, '<br>')}</p></main>
${footer(ctx)}
${tabbar(ctx)}
${scripts(ctx, 'privacy')}
</body></html>`;
}

// ---------- Страницы без менеджера ----------

// Простая страница-заглушка (неверная ссылка, сайт отключён)
function plainPage({ title, text, product, base }) {
  return `<!doctype html><html lang="ru"><head>
${head({ title, description: text, url: base, settings: {} })}
<meta name="robots" content="noindex">
</head><body class="plain-page">
<main class="wrap plain"><div class="plain-box">
  <div class="kicker">${esc(product.name)}</div>
  <h1>${esc(title)}</h1>
  <p>${esc(text)}</p>
</div></main>
</body></html>`;
}

// Ссылка не существует: например, клиент поменял имя менеджера в адресе
function renderInvalid(product, base) {
  return plainPage({
    product, base,
    title: 'Ссылка недействительна',
    text: 'Такой страницы нет. Попросите у вашего менеджера актуальную ссылку — она приходит в WhatsApp.',
  });
}

// Сайт менеджера отключён (не оплачен или заблокирован)
// Тон спокойный: клиент не должен видеть слов «заблокирован» или «не оплачен» —
// для него это просто обновление подборки у его менеджера.
function renderUnavailable(ctx) {
  const s = ctx.s, lang = ctx.lang;
  return `<!doctype html><html lang="${t(lang, 'htmlLang')}"><head>
${head({ title: t(lang, 'soonTitle', { name: s.name }), description: t(lang, 'soonDesc'), url: ctx.base + ctx.prefix, settings: {}, lang })}
<meta name="robots" content="noindex">
</head><body class="plain-page">
<main class="wrap plain"><div class="plain-box soon">
  ${s.photo ? `<img class="soon-photo" src="${esc(s.photo)}" alt="${esc(s.name)}">` : ''}
  <div class="kicker">${esc(s.name)}${s.role ? ` · ${esc(s.role)}` : ''}</div>
  <h1>${t(lang, 'soonH1')}</h1>
  <p>${t(lang, 'soonText')}</p>
  <p class="soon-note">${t(lang, 'soonNote')}</p>
</div></main>
</body></html>`;
}

// Главная домена: страница продукта для менеджеров. Задача — «продать» кабинет:
// тёмный дорогой стиль с золотом, живой пример сайта в телефоне, заявки, калькулятор дохода.
// demo — пример с сайта владельца: { url, name, photo, apt: { thumb, title, monthly, currency } }
function renderLanding(product, base, demo = {}) {
  const p = product;
  const wa = text => (p.whatsapp ? waLink(p.whatsapp, text) : '');
  const waJoin = wa(`Здравствуйте! Хочу подключить «${p.name}».`);
  const phone = String(p.whatsapp || '').replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})(\d{3})$/, '+$1 $2 $3 $4');
  const apt = demo.apt;
  // Цены: 1 месяц и 6 месяцев; в карточке 6 месяцев — цена за месяц и выгода
  const som = n => `${new Intl.NumberFormat('ru-RU').format(n)} сом`;
  const FLAT_PRICE = 5000000; // цена квартиры в истории калькулятора дохода
  const pm = Number(p.priceMonth) || 0, p3 = Number(p.price3) || 0, p6 = Number(p.price6) || 0;
  const per3 = p3 ? Math.round(p3 / 3) : 0, per6 = p6 ? Math.round(p6 / 6) : 0;
  const save3 = pm && p3 ? pm * 3 - p3 : 0, save6 = pm && p6 ? pm * 6 - p6 : 0;

  // Карточка тарифа в стиле Warp: название (и метка «Выгоднее всего»), крупно цена за месяц, итог и выгода,
  // кнопка на всю ширину, затем «что входит» списком с кружками. Пустые пункты (false) пропускаются.
  const included = Number(p.includedApartments) || 0, extra = Number(p.extraPrice) || 0;

  // «Уже пользуются N риелторов» с лицами (фото или первая буква имени) — под ценой на первом экране
  const users = demo.users || { count: 0, faces: [] };
  const word = n => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'риелтор' : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? 'риелтора' : 'риелторов'; };
  const face = f => (f.photo
    ? `<img src="${esc(f.photo)}" alt="" width="36" height="36" loading="lazy">`
    : `<i>${esc((f.name.trim()[0] || '•').toUpperCase())}</i>`);
  const usersLine = users.count ? `<div class="lx-users">
        <div class="lx-faces" aria-hidden="true">${users.faces.map(face).join('')}</div>
        <span>Уже ${users.count % 10 === 1 && users.count % 100 !== 11 ? 'пользуется' : 'пользуются'} <b>${users.count} ${word(users.count)}</b></span>
      </div>` : '';
  const tier = t => `<div class="lx-tier${t.best ? ' best' : ''}">
        <div class="lx-tier-top"><span class="lx-tier-name">${t.name}</span>${t.best ? '<span class="lx-tier-badge">Выгоднее всего</span>' : ''}</div>
        <div class="lx-tier-price"><b>${som(t.per)}</b><span>/ месяц</span></div>
        <dl class="lx-tier-money">
          <div><dt>Вы платите</dt><dd>${som(t.total)}${t.months > 1 ? ` за ${t.months} мес.` : ''}</dd></div>
          <div><dt>Выгода</dt><dd class="${t.save > 0 ? 'plus' : ''}">${t.save > 0 ? som(t.save) : '—'}</dd></div>
        </dl>
        ${p.whatsapp ? `<a class="lx-btn ${t.best ? 'gold' : 'ghost'} lx-tier-btn" href="${esc(wa(`Здравствуйте! Хочу подключить «${p.name}» на ${t.months === 1 ? '1 месяц' : `${t.months} месяц${t.months < 5 ? 'а' : 'ев'}`} за ${som(t.total)}.`))}" target="_blank" rel="noopener">${t.best ? WA_ICON : ''}${t.btn}</a>` : ''}
      </div>`;
  // «Что входит» — один список под тарифами, общий для всех
  const includes = [
    'Свой сайт с вашим именем',
    'Квартиры, коммерция и участки — всё на одном сайте',
    included ? `До ${included} объектов${extra ? ` (дополнительный — ${som(extra)} в месяц)` : ''}` : 'Объекты без ограничения',
    'Подбор по бюджету и калькулятор рассрочки',
    'Заявки сразу в WhatsApp',
    'Кабинет с телефона',
    'Аналитика: посетители, источники, заявки',
  ];
  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Монета и пачка купюр — рисованные, без чужих фото
  const coin = cls => `<svg class="lx-coin ${cls}" viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="g${cls}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff3c4"/><stop offset=".45" stop-color="#e2bd5c"/><stop offset="1" stop-color="#8a6420"/></radialGradient></defs><circle cx="50" cy="50" r="46" fill="url(#g${cls})"/><circle cx="50" cy="50" r="36" fill="none" stroke="#fff3c4" stroke-opacity=".55" stroke-width="2"/><text x="50" y="62" text-anchor="middle" font-family="Georgia, serif" font-size="34" font-weight="700" fill="#7a5618" fill-opacity=".8">с</text></svg>`;
  const cash = `<svg class="lx-cash" viewBox="0 0 220 140" aria-hidden="true">${[0, 1, 2].map(i => `<g transform="translate(${i * 6} ${30 - i * 12}) rotate(${-8 + i * 5} 110 60)"><rect x="10" y="20" width="190" height="90" rx="8" fill="${['#2f6b47', '#3b7d55', '#4a8f64'][i]}" stroke="#bfe3c9" stroke-opacity=".5"/><rect x="22" y="32" width="166" height="66" rx="5" fill="none" stroke="#d8f0de" stroke-opacity=".45" stroke-dasharray="4 3"/><circle cx="105" cy="65" r="20" fill="none" stroke="#e9f7ec" stroke-opacity=".7" stroke-width="2"/><text x="105" y="72" text-anchor="middle" font-family="Georgia, serif" font-size="20" fill="#e9f7ec" fill-opacity=".85">5000</text><text x="38" y="52" font-family="Georgia, serif" font-size="12" fill="#e9f7ec" fill-opacity=".7">5000</text></g>`).join('')}</svg>`;

  return `<!doctype html><html lang="ru"><head>
${head({ title: `${p.name} — ${p.tagline}`, description: p.tagline, image: base + BRAND.og, url: base + '/partner', settings: {}, ld: { '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization', name: BRAND.name, url: base + '/partner', logo: base + BRAND.logo, telephone: phoneOf(p) }, { '@type': 'WebSite', name: BRAND.name, url: base + '/' }] } })}
<link rel="stylesheet" href="/css/landing.css?v=${version()}">
</head><body class="landing lx">
<header class="lx-top"><div class="wrap">
  <a class="lx-brand" href="/partner" aria-label="kvartiry.asia — сайт для менеджеров"><img src="/img/brand/mark.png" alt="" width="58" height="30"><span><em>kvartiry<b>.asia</b></em><small>для менеджеров</small></span></a>
  <nav class="lx-nav"><a href="#income">Доход</a>${pm ? '<a href="#prices">Цены</a>' : ''}${demo.url ? `<a href="${esc(demo.url)}">Пример сайта</a>` : ''}</nav>
  <a class="lx-login" href="/admin">Вход</a>
</div></header>

<main>
  <section class="lx-hero"><div class="wrap lx-hero-in">
    <div class="lx-hero-text">
      <div class="lx-kicker">Сайт-визитка для менеджера</div>
      <h1>Клиенты выбирают квартиру сами.<span>Вы получаете комиссию.</span></h1>
      <p class="lx-sub">${esc(p.tagline)}</p>
      <div class="lx-btns">
        ${waJoin ? `<a class="lx-btn gold" href="${esc(waJoin)}" target="_blank" rel="noopener">${WA_ICON}Подключиться</a>` : ''}
        ${demo.url ? `<a class="lx-btn ghost" href="${esc(demo.url)}">Посмотреть пример →</a>` : ''}
      </div>
      ${pm ? `<a class="lx-price" href="#prices">${som(pm)} в месяц${p3 ? ` · 3 мес — ${som(p3)}` : ''}${p6 ? ` · 6 мес — ${som(p6)}` : ''}</a>` : p.priceText ? `<div class="lx-price">${esc(p.priceText)}</div>` : ''}
      ${usersLine}
    </div>

    <div class="lx-visual" aria-hidden="true">
      <div class="lx-glow"></div>
      ${cash}
      ${coin('c1')}${coin('c2')}${coin('c3')}
      <div class="lx-phone"><div class="lx-screen">
        <div class="lx-s-top">${demo.photo ? `<img src="${esc(demo.photo)}" alt="">` : '<i></i>'}<b>${esc(demo.name || 'Ваше имя')}</b></div>
        <div class="lx-s-h">Квартира в рассрочку <em>без банка</em></div>
        <div class="lx-s-card">
          ${apt && apt.thumb ? `<img src="${esc(apt.thumb)}" alt="">` : '<div class="lx-s-ph"></div>'}
          <div class="lx-s-body"><b>${apt ? esc(money(apt.monthly, apt.currency)) : '88 800 сом'}</b><span>/ мес</span><small>${apt ? esc(apt.title) : '1-комн., 42 м²'}</small></div>
        </div>
        <div class="lx-s-wa">${WA_ICON}Написать в WhatsApp</div>
      </div></div>
      <div class="lx-notes">
        <div class="lx-note n1">${WA_ICON}<div><b>Новая заявка</b><span>2-комн., взнос 1 700 000 сом</span></div></div>
        <div class="lx-note n2">${WA_ICON}<div><b>Новая заявка</b><span>Студия, 81 000 сом в месяц</span></div></div>
        <div class="lx-note n3">${WA_ICON}<div><b>Хочу купить за наличные</b><span>экономия 836 000 сом</span></div></div>
      </div>
    </div>
  </div></section>

  <section class="lx-sec" id="income"><div class="wrap">
    <div class="lx-kicker">Посчитайте сами</div>
    <h2>Одна сделка — и сайт <span>окупился</span></h2>
    <div class="lx-calc">
      <div class="lx-calc-in">
        <p class="lx-story">Представьте: клиент нашёл квартиру на вашем сайте и купил её за <b>${som(FLAT_PRICE)}</b>.</p>
        <div class="lx-ask">
          <label for="iC">Какая у вас комиссия?</label>
          <div class="lx-pct"><input type="text" id="iC" inputmode="decimal" maxlength="4" placeholder="?" autocomplete="off"><em>%</em></div>
          <div class="lx-chips">${['0,5', '1', '1,5', '2', '3'].map(v => `<button type="button" data-v="${v}">${v}%</button>`).join('')}</div>
        </div>
        <label class="lx-deals"><span>А если таких сделок в месяц</span><output id="oD"></output><input type="range" id="iD" min="1" max="10" step="1" value="2"></label>
      </div>
      <div class="lx-calc-out wait" id="oBox">
        <span>Ваша комиссия с одной квартиры</span>
        <b id="oOne">? сом</b>
        <div class="lx-more">
          <div><small id="oDl"></small><strong id="oM">—</strong></div>
          <div class="yr"><small>За год</small><strong id="oY">—</strong></div>
        </div>
        ${pm ? `<div class="lx-pay" id="oPay"></div>` : ''}
        <div class="lx-burst" id="oBurst" aria-hidden="true"></div>
      </div>
    </div>
  </div></section>

  <section class="lx-sec lx-land"><div class="wrap lx-land-in">
    <div class="lx-land-text">
      <div class="lx-kicker">Новое</div>
      <h2>Продавайте <span>и участки</span></h2>
      <p>Сотки, цена в $ и район — участок появится на вашем сайте во вкладке «Участки». Заявки придут в WhatsApp.</p>
    </div>
    <img src="/img/partner-land.webp?v=${version()}" width="1200" height="800" loading="lazy" alt="Участок на сайте менеджера: 6 соток, 45 000 $, кнопка «Хочу этот участок»">
  </div></section>

  ${pm ? `<section class="lx-sec" id="prices"><div class="wrap">
    <div class="lx-kicker">Стоимость</div>
    <h2>Меньше, чем <span>одна чашка кофе в день</span></h2>
    <div class="lx-tiers">
      ${tier({ name: '1 месяц', per: pm, months: 1, total: pm, save: 0, btn: 'Подключить на месяц' })}
      ${p3 ? tier({ name: '3 месяца', per: per3, months: 3, total: p3, save: save3, btn: 'Подключить на 3 месяца' }) : ''}
      ${p6 ? tier({ name: '6 месяцев', per: per6, months: 6, total: p6, save: save6, btn: 'Подключить на 6 месяцев', best: save6 > 0 }) : ''}
    </div>
    <div class="lx-incl" id="features">
      <div class="lx-incl-head">В любой тариф входит</div>
      <ul>${includes.map(i => `<li>${CHECK}<span>${esc(i)}</span></li>`).join('')}</ul>
    </div>
  </div></section>` : ''}

  <section class="lx-sec"><div class="wrap">
    <div class="lx-kicker">Как подключить</div>
    <h2>Свой сайт <span>сегодня</span></h2>
    <ol class="lx-steps"><li><b>Напишите в WhatsApp</b>Создадим вам кабинет с логином и паролем</li><li><b>Получите готовые квартиры</b>В кабинете уже будут варианты в рассрочку — поменяйте под себя</li><li><b>Отправляйте свою ссылку</b>Клиенты выбирают квартиру и пишут вам</li></ol>
  </div></section>

  <section class="lx-final"><div class="wrap">
    <h2>Пока вы думаете, клиенты <span>выбирают квартиры у других</span></h2>
    ${waJoin ? `<a class="lx-btn gold big" href="${esc(waJoin)}" target="_blank" rel="noopener">${WA_ICON}Подключиться в WhatsApp</a>` : ''}
    ${phone ? `<a class="lx-phone-link" href="${esc(waJoin)}" target="_blank" rel="noopener">${esc(phone)}</a>` : ''}
    ${usersLine}
    <a class="lx-help" href="${esc(wa('Здравствуйте! Нужна техподдержка по кабинету менеджера.') || '/admin')}" target="_blank" rel="noopener">Уже с нами и нужна помощь? Техподдержка →</a>
  </div></section>
</main>
<footer class="lx-foot"><div class="wrap"><span>${esc(p.name)} · © ${new Date().getFullYear()}</span><a href="/admin">Вход для менеджеров</a></div></footer>
<script>
// Калькулятор дохода
(function () {
  var nf = new Intl.NumberFormat('ru-RU');
  var $ = function (id) { return document.getElementById(id); };
  var site = ${pm};
  function kv(n) { var a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'квартиру' : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? 'квартиры' : 'квартир'; }
  function mes(n) { var a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'месяц' : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? 'месяца' : 'месяцев'; }
  function lt(y) { var a = y % 10, b = y % 100; return y + (a === 1 && b !== 11 ? ' год' : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? ' года' : ' лет'); }
  var price = ${FLAT_PRICE}, still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var shown = {}, lastBurst = 0, prevM = 0;
  // Число «бежит» от старого значения к новому — так выигрыш ощущается
  function run(id, to) {
    var el = $(id), from = shown[id] || 0, t0 = performance.now();
    shown[id] = to;
    if (still || from === to) { el.textContent = nf.format(to) + ' сом'; return; }
    (function step(t) {
      var k = Math.min((t - t0) / 700, 1), e = 1 - Math.pow(1 - k, 3);
      el.textContent = nf.format(Math.round(from + (to - from) * e)) + ' сом';
      if (k < 1 && shown[id] === to) requestAnimationFrame(step);
    })(t0);
  }
  // Золотые монетки вылетают из суммы, когда доход вырос
  function burst() {
    var now = Date.now();
    if (still || now - lastBurst < 900) return;
    lastBurst = now;
    var box = $('oBurst');
    for (var i = 0; i < 10; i++) {
      var c = document.createElement('i');
      c.style.setProperty('--x', (Math.random() * 240 - 120) + 'px');
      c.style.setProperty('--y', (-90 - Math.random() * 90) + 'px');
      c.style.setProperty('--r', (Math.random() * 540 - 270) + 'deg');
      c.style.left = (20 + Math.random() * 30) + '%';
      c.style.animationDelay = (i * 40) + 'ms';
      box.appendChild(c);
      setTimeout(function (el) { el.remove(); }, 1500, c);
    }
    var b = $('oOne');
    b.classList.remove('win'); void b.offsetWidth; b.classList.add('win');
  }
  function upd() {
    // Комиссия — то, что менеджер ввёл сам (запятая тоже понимается), от 0 до 20%
    var raw = String($('iC').value).trim();
    var c = parseFloat(raw.replace(',', '.'));
    var ok = raw !== '' && isFinite(c) && c > 0;
    c = ok ? Math.min(c, 20) : 0;
    var d = +$('iD').value, one = Math.round(price * c / 100), m = one * d;
    $('oD').textContent = d;
    $('oDl').textContent = d + ' ' + kv(d) + ' в месяц';
    $('iD').style.setProperty('--p', ((d - 1) / 9 * 100) + '%');
    [].forEach.call(document.querySelectorAll('.lx-chips button'), function (b) { b.classList.toggle('on', ok && b.dataset.v === raw); });
    $('oBox').classList.toggle('wait', !ok);
    if (!ok) {
      shown = {}; prevM = 0;
      $('oOne').textContent = '? сом'; $('oM').textContent = '—'; $('oY').textContent = '—';
    } else {
      run('oOne', one); run('oM', m); run('oY', m * 12);
      if (m > prevM) burst();
      prevM = m;
    }
    if (site && $('oPay')) {
      var n = Math.floor(one / site);
      $('oPay').innerHTML = 'Сайт стоит <b>' + nf.format(site) + ' сом в месяц</b>. ' + (n >= 1
        ? 'Одна ваша сделка оплачивает его на <b>' + (n >= 24 ? lt(Math.floor(n / 12)) : n + ' ' + mes(n)) + '</b> вперёд.'
        : 'Впишите комиссию — и посмотрите, сколько вы заработаете.');
    }
  }
  [].forEach.call(document.querySelectorAll('.lx-chips button'), function (b) {
    b.addEventListener('click', function () { $('iC').value = b.dataset.v; upd(); });
  });
  ['iD', 'iC'].forEach(function (k) { $(k).addEventListener('input', upd); });
  upd();
})();
</script>
<script src="/js/common.js?v=${version()}"></script>
</body></html>`;
}

module.exports = { renderIndex, renderApartment, renderGone, renderPrivacy, renderInvalid, renderUnavailable, renderLanding, roomsLabel };
