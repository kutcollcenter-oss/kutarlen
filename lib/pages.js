// Серверный рендер страниц (нужен для SEO и превью ссылок в WhatsApp)
const fs = require('fs');
const path = require('path');
const { money, waLink, roomsLabel } = require('./calc');

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
  floor: svg('<path d="M4 21V5l8-3 8 3v16M9 21v-4h6v4M8 8h1M8 12h1M15 8h1M15 12h1"/>'),
  pin: svg('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  home: svg('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>'),
  grid: svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
  star: svg('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z"/>'),
  insta: svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>'),
};

function analytics(s) {
  let h = '';
  if (s.gaId) {
    h += `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(s.gaId)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${json(s.gaId)});</script>`;
  }
  if (s.ymId) {
    h += `<script>(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${Number(s.ymId) || 0},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true});window.YM_ID=${Number(s.ymId) || 0};</script>`;
  }
  if (s.pixelId) {
    h += `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${json(s.pixelId)});fbq('track','PageView');</script>`;
  }
  return h;
}

// Логотип сервиса kvartiry.asia: иконка во вкладке на всех страницах (Яндекс и Google показывают
// одну иконку на весь сайт рядом с ним в поиске) и картинка превью ссылки, если у страницы нет своей.
// Логотип менеджера остаётся на самих страницах и иконкой на экране телефона.
const BRAND = { name: 'kvartiry.asia', icon: '/img/brand/icon-32.png', icon192: '/img/brand/icon-192.png', touch: '/img/brand/icon-180.png', og: '/img/brand/og.jpg', logo: '/img/brand/logo.png' };

// Структурированные данные для Google и Яндекса (schema.org в формате JSON-LD).
// «<» экранируется, чтобы текст из базы не мог закрыть тег <script>.
const jsonLd = data => (data ? `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>` : '');

function head({ title, description, image, url, settings, ld }) {
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
<meta property="og:locale" content="ru_RU">
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
<link rel="stylesheet" href="/css/style.css?v=${version()}">
${analytics(settings)}`;
}

function publicSettings(s) {
  const { tgToken, tgChat, ...rest } = s;
  return rest;
}

const GENERAL_WA = 'Здравствуйте! Хочу подобрать квартиру.';
const igLink = s => `https://instagram.com/${String(s.instagram).replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '')}`;

// Логотип компании менеджера (загружается в кабинете). Нет логотипа — не показываем ничего.
function logo(s, cls = '', w = 50, h = 30) {
  return s.logo ? `<img src="${esc(s.logo)}" alt="${esc(s.company || s.name)}" class="${cls}" width="${w}" height="${h}">` : '';
}

// ctx — сайт конкретного менеджера: { s: настройки, base: «https://домен», prefix: «/aidana-k7f3q9», slug }
// Все ссылки внутри сайта идут через prefix, поэтому клиент никогда не попадает на сайт другого менеджера.

// Шапка. Верхнее меню и кнопка WhatsApp видны только на ноутбуке (≥1024 px), на телефоне и планшете — нижнее меню.
function header(ctx, home = false) {
  const { s, prefix } = ctx;
  const p = home ? '' : `${prefix}/`;
  return `<header class="topbar"><div class="wrap">
  <a href="${prefix}" class="brand">${logo(s)}<span><b>${esc(s.name)}</b><small>${esc(s.role || '')}</small></span></a>
  <nav class="nav"><a href="${p}#catalog">Квартиры</a><a href="${p}#installment">Рассрочка</a><a href="${p}#reviews-sec">Отзывы</a><a href="${p}#faq-sec">Вопросы</a></nav>
  ${s.whatsapp ? `<a href="${esc(waLink(s.whatsapp, GENERAL_WA))}" class="btn btn-wa head-cta" data-wa="header" target="_blank" rel="noopener">${WA_ICON}WhatsApp</a>` : ''}
</div></header>`;
}

// Нижнее меню — на телефоне и планшете. home=true: якоря на главной, иначе ссылки на главную менеджера.
function tabbar(ctx, { home = false, active = '', waText = GENERAL_WA, waPlace = 'tabbar', aptId = '' } = {}) {
  const { s, prefix } = ctx;
  const p = home ? '' : `${prefix}/`;
  const item = (key, href, icon, label) =>
    `<a href="${href}" class="tab${active === key ? ' on' : ''}" data-tab="${key}">${icon}<span>${label}</span></a>`;
  return `<nav class="tabbar" aria-label="Меню">
  ${item('home', home ? '#top' : prefix, ICONS.home, 'Главная')}
  ${item('catalog', `${p}#catalog`, ICONS.grid, 'Квартиры')}
  ${item('reviews', `${p}#reviews-sec`, ICONS.star, 'Отзывы')}
  <a href="${esc(waLink(s.whatsapp, waText))}" class="tab tab-wa" id="tabWa" data-wa="${waPlace}"${aptId ? ` data-id="${aptId}"` : ''} target="_blank" rel="noopener">${WA_ICON}<span>WhatsApp</span></a>
</nav>`;
}

function footer(ctx) {
  const { s, prefix } = ctx;
  const links = [
    s.whatsapp && `<a href="${esc(waLink(s.whatsapp, GENERAL_WA))}" data-wa="footer" target="_blank" rel="noopener">${WA_ICON}WhatsApp</a>`,
    s.instagram && `<a href="${esc(igLink(s))}" target="_blank" rel="noopener">${ICONS.insta}Instagram</a>`,
  ].filter(Boolean).join('');
  const office = s.officeAddress
    ? (s.officeLink ? `<a href="${esc(s.officeLink)}" target="_blank" rel="noopener">${ICONS.pin}${esc(s.officeAddress)}</a>` : `<span>${ICONS.pin}${esc(s.officeAddress)}</span>`)
    : '';
  return `<footer class="footer"><div class="wrap">
  ${logo(s, 'footer-logo', 64, 39)}
  <div class="footer-name">${esc(s.name)}${s.role ? ` · ${esc(s.role)}` : ''}</div>
  <div class="footer-links">${links}${office}</div>
  <p class="footer-partner">Хотите такой же сайт? <a href="/partner">Переходите по ссылке →</a></p>
  <div class="footer-bottom"><a href="${prefix}/privacy">Политика конфиденциальности</a><span>© ${new Date().getFullYear()}</span></div>
</div></footer>`;
}

// page — для аналитики: home | apt | gone | privacy
function scripts(ctx, page, extra = {}, files = ['common']) {
  return `<script>window.__DATA__=${json({ settings: publicSettings(ctx.s), slug: ctx.slug, page, waIcon: WA_ICON, icons: ICONS, ...extra })}</script>
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
        name: `Квартиры — ${s.name}`,
        itemListElement: apartments.map((a, i) => ({ '@type': 'ListItem', position: i + 1, url: base + a.url, name: `${a.roomsLabel}, ${a.area} м²${a.title ? ' — ' + a.title : ''}` })),
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
          '@type': a.type === 'commercial' ? 'Place' : 'Apartment',
          name: `${a.roomsLabel}, ${a.area} м²${a.title ? ' — ' + a.title : ''}`,
          numberOfRooms: a.type === 'commercial' ? undefined : (a.rooms || undefined),
          floorSize: { '@type': 'QuantitativeValue', value: a.area, unitCode: 'MTK' },
          address: a.address || undefined,
          image: a.photos.length ? a.photos.map(ph => base + ph.src) : undefined,
          description: a.details || undefined,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: s.name, item: base + prefix },
          { '@type': 'ListItem', position: 2, name: `${a.roomsLabel}, ${a.area} м²`, item: base + a.url },
        ],
      },
    ],
  };
}

function renderIndex(ctx, apartments) {
  const { s, base, prefix } = ctx;
  const tpl = fs.readFileSync(INDEX_TPL, 'utf8');
  const description = `${s.tagline}. Подбор квартир по первоначальному взносу и ежемесячному платежу.`;
  return tpl
    .replace('<!--HEAD-->', head({ title: `${s.name} — ${s.tagline}`, description, image: s.photo ? base + s.photo.replace(/\.webp$/, '-og.jpg') : null, url: base + prefix, settings: s, ld: agentLd(ctx, apartments) }))
    .replace('<!--HEADER-->', header(ctx, true))
    .replace('<!--LOGO:pl-->', s.logo ? logo(s, 'pl-logo', 160, 97) : `<div class="pl-name">${esc(s.name)}</div>`)
    .replace('<!--PL-CAP-->', esc(s.heroKicker || s.role || ''))
    .replace('<!--LOGO:badge-->', logo(s, '', 52, 31))
    .replace('<!--LOGO:office-->', logo(s, 'office-logo', 96, 58))
    .replace('<!--FOOTER-->', footer(ctx) + tabbar(ctx, { home: true, active: 'home' }))
    .replace('<!--SCRIPTS-->', scripts(ctx, 'home', { apartments }, ['common', 'app']));
}

function miniCard(a) {
  return `<a class="mini" href="${a.url}">
  ${a.photos[0] ? `<img src="${a.photos[0].thumb}" alt="" loading="lazy">` : '<div class="ph"></div>'}
  <div><b>${a.roomsLabel}, ${a.area} м²</b><span>${a.installment ? `${money(a.monthly, a.currency)} / мес` : money(a.price, a.currency)}</span></div></a>`;
}

function renderApartment(ctx, a, similar) {
  const { s, base } = ctx;
  const cur = a.currency;
  const title = `${a.roomsLabel}, ${a.area} м² — ${money(a.price, cur)}${a.installment ? `, от ${money(a.monthly, cur)}/мес` : ''}`;
  const desc = [a.title, a.address, a.installment ? `Взнос от ${money(a.down, cur)}, рассрочка ${a.months} мес.` : a.type === 'cash' ? 'Оплата наличными' : '100% оплата'].filter(Boolean).join(' · ');
  const wa = waLink(s.whatsapp, a.waText);

  const gallery = a.photos.length
    ? a.photos.map((p, i) => `<img src="${p.src}" alt="${esc(`${a.roomsLabel}, ${a.area} м²${a.title ? ', ' + a.title : ''} — фото ${i + 1}`)}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}>`).join('')
    : '<div class="ph big"></div>';

  // Калькулятор: клиент может внести больше минимального взноса — платёж в месяц уменьшится
  const calc = a.installment ? `
    <section class="calc" id="calc">
      <!-- Сначала клиент выбирает взнос, под ним сразу видит платёж в месяц -->
      <div class="calc-down">
        <div class="field-head"><label for="cDownInput">Первоначальный взнос</label><span class="calc-min">мин. ${money(a.down, cur)}</span></div>
        <div class="calc-input"><input id="cDownInput" type="text" inputmode="numeric" value="${money(a.down, '')}" aria-label="Первоначальный взнос"><span>${esc(cur)}</span></div>
        <input type="range" id="cDown" class="range" aria-label="Первоначальный взнос">
        <p class="calc-hint" id="cHint">Внесите больше — платёж в месяц станет меньше</p>
      </div>
      <div class="calc-main" aria-live="polite">
        <span>Платёж в месяц</span>
        <b id="cMonthly">${money(a.monthly, cur)}</b>
        <small id="cTerm">${a.months} мес. рассрочки</small>
      </div>
      <dl class="calc-rows">
        <div><dt>Цена</dt><dd>${money(a.price, cur)}</dd></div>
        <div><dt>Остаток в рассрочку</dt><dd id="cRest">${money(a.price - a.down, cur)}</dd></div>
        <div><dt>Цена за м²</dt><dd>${money(a.pricePerM2, cur)}</dd></div>
      </dl>
      <p class="calc-note">Расчёт предварительный, точные условия — в договоре.</p>
      ${a.cash ? `
      <div class="cash-offer" id="cashOffer">
        <span class="co-badge">Выгодно</span>
        <div class="co-head"><span>Оплата наличными</span><b>${money(a.cash.price, cur)}</b></div>
        <p class="co-line">${money(a.cash.ppm, cur)} за м² вместо ${money(a.pricePerM2, cur)} · скидка ${money(a.cash.discount, cur)} за м²</p>
        <p class="co-save"><span class="co-mark">Вы сэкономите <b>${money(a.cash.savings, cur)}</b></span></p>
        <p class="co-hint" id="coHint">Если внести ${money(a.cash.price, cur)} сразу — ${a.type === 'commercial' ? 'помещение ваше' : 'квартира ваша'} без рассрочки и дешевле</p>
        <a class="btn btn-wa co-btn" id="cashWa" href="${esc(waLink(s.whatsapp, a.cash.waText))}" data-wa="apartment-cash" data-id="${a.id}" target="_blank" rel="noopener">${WA_ICON}Хочу купить за наличные</a>
      </div>` : ''}
    </section>` : `
    <section class="calc">
      <div class="calc-main"><span>${a.type === 'cash' ? 'Цена · оплата наличными' : 'Цена при 100% оплате'}</span><b>${money(a.price, cur)}</b><small>${money(a.pricePerM2, cur)} за м²</small></div>
    </section>`;

  // Этаж и этажность — в строке под заголовком. Отдельного блока «Характеристики» нет: он повторял
  // заголовок, адрес, эту строку и срок рассрочки из расчёта.
  const floorInfo = a.floorFrom ? `от ${a.floorFrom} эт.${a.floors ? ` из ${a.floors}` : ''}` : a.floors ? `дом ${a.floors} эт.` : '';

  return `<!doctype html><html lang="ru"><head>
${head({ title, description: desc, image: a.photos[0] ? base + a.photos[0].og : null, url: base + a.url, settings: s, ld: apartmentLd(ctx, a, title) })}
</head><body class="apt-page">
${header(ctx)}
<main class="wrap apt">
  <div class="gallery-wrap">
    <div class="gallery" id="gallery">${gallery}</div>
    ${a.photos.length > 1 ? `<div class="gallery-count" id="gcount">1 / ${a.photos.length}</div>` : ''}
    <div class="tags">${a.tags.map(t => `<span class="tag${t === 'Скидка' ? ' tag-sale' : t === 'Рассрочка' ? ' tag-inst' : ''}">${esc(t)}</span>`).join('')}</div>
  </div>
  <div class="apt-info">
    ${a.title ? `<div class="apt-complex">${esc(a.title)}</div>` : ''}
    <h1>${a.roomsLabel}, ${a.area} м²</h1>
    ${a.address ? `<div class="addr">${ICONS.pin}${esc(a.address)}</div>` : ''}
    <div class="feats">
      <span>${ICONS.bed}${a.roomsLabel}</span><span>${ICONS.area}${a.area} м²</span>
      ${floorInfo ? `<span>${ICONS.floor}${floorInfo}</span>` : ''}
    </div>
    ${calc}
    <a class="btn btn-wa btn-lg apt-cta" id="aptWa" href="${esc(wa)}" data-wa="apartment" data-id="${a.id}" target="_blank" rel="noopener">${WA_ICON}Хочу ${a.type === 'commercial' ? 'это помещение' : 'эту квартиру'}</a>
  </div>
  <!-- Детали и карта: на телефоне — после цены (кнопка встаёт между ними, см. common.js), на ноутбуке — под фото (см. .apt-more в style.css) -->
  <div class="apt-more">
    ${a.details ? `<section class="details"><h2>Детали</h2><p>${esc(a.details).replace(/\n/g, '<br>')}</p></section>` : ''}
    ${a.map.embed ? `<section class="map"><h2>На карте</h2>
      <iframe loading="lazy" title="Карта" src="${esc(a.map.embed)}" referrerpolicy="no-referrer-when-downgrade"></iframe>
      ${a.map.link ? `<a class="btn btn-ghost map-open" href="${esc(a.map.link)}" target="_blank" rel="noopener">${ICONS.pin}Открыть в Google Картах</a>` : ''}
    </section>` : ''}
  </div>
  ${similar.length ? `<section class="similar"><h2>${a.type === 'commercial' ? 'Похожие помещения' : 'Похожие квартиры'}</h2><div class="mini-list">${similar.map(miniCard).join('')}</div></section>` : ''}
</main>
${footer(ctx)}
${tabbar(ctx, { active: 'catalog', waText: a.waText, waPlace: 'apartment-tab', aptId: a.id })}
${scripts(ctx, 'apt', { apartment: a, base }, ['common', 'apartment'])}
</body></html>`;
}

function renderGone(ctx, similar) {
  const { s, base, prefix } = ctx;
  return `<!doctype html><html lang="ru"><head>
${head({ title: `Квартира продана — ${s.name}`, description: 'Посмотрите похожие квартиры в продаже', url: base + prefix, settings: s })}
<meta name="robots" content="noindex">
</head><body class="apt-page">
${header(ctx)}
<main class="wrap gone">
  <h1>Эта квартира уже продана</h1>
  <p>Но есть похожие варианты — или напишите, и я подберу вручную.</p>
  ${similar.length ? `<div class="mini-list">${similar.map(miniCard).join('')}</div>` : ''}
  <a class="btn btn-wa btn-lg" href="${esc(waLink(s.whatsapp, 'Здравствуйте! Квартира, которую я смотрел(а), уже продана. Подберите, пожалуйста, похожую.'))}" data-wa="gone" target="_blank" rel="noopener">${WA_ICON}Подберу вручную</a>
</main>
${footer(ctx)}
${tabbar(ctx, { active: 'catalog' })}
${scripts(ctx, 'gone')}
</body></html>`;
}

function renderPrivacy(ctx) {
  const { s, base, prefix } = ctx;
  return `<!doctype html><html lang="ru"><head>
${head({ title: `Политика конфиденциальности — ${s.name}`, description: 'Политика конфиденциальности', url: `${base}${prefix}/privacy`, settings: s })}
</head><body class="apt-page">
${header(ctx)}
<main class="wrap gone"><h1>Политика конфиденциальности</h1><p>${esc(s.privacy).replace(/\n/g, '<br>')}</p></main>
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
  const s = ctx.s;
  return `<!doctype html><html lang="ru"><head>
${head({ title: `${s.name} — подборка обновляется`, description: 'Подборка квартир обновляется', url: ctx.base + ctx.prefix, settings: {} })}
<meta name="robots" content="noindex">
</head><body class="plain-page">
<main class="wrap plain"><div class="plain-box soon">
  ${s.photo ? `<img class="soon-photo" src="${esc(s.photo)}" alt="${esc(s.name)}">` : ''}
  <div class="kicker">${esc(s.name)}${s.role ? ` · ${esc(s.role)}` : ''}</div>
  <h1>Подборка квартир обновляется</h1>
  <p>Сейчас здесь идёт обновление: добавляются новые варианты и актуальные цены. Загляните немного позже — всё снова будет на этой странице.</p>
  <p class="soon-note">Если вы уже на связи с менеджером — пишите, как обычно</p>
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
  const pm = Number(p.priceMonth) || 0, p3 = Number(p.price3) || 0, p6 = Number(p.price6) || 0;
  const per3 = p3 ? Math.round(p3 / 3) : 0, per6 = p6 ? Math.round(p6 / 6) : 0;
  const save3 = pm && p3 ? pm * 3 - p3 : 0, save6 = pm && p6 ? pm * 6 - p6 : 0;

  // Монета и пачка купюр — рисованные, без чужих фото
  const coin = cls => `<svg class="lx-coin ${cls}" viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="g${cls}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff3c4"/><stop offset=".45" stop-color="#e2bd5c"/><stop offset="1" stop-color="#8a6420"/></radialGradient></defs><circle cx="50" cy="50" r="46" fill="url(#g${cls})"/><circle cx="50" cy="50" r="36" fill="none" stroke="#fff3c4" stroke-opacity=".55" stroke-width="2"/><text x="50" y="62" text-anchor="middle" font-family="Georgia, serif" font-size="34" font-weight="700" fill="#7a5618" fill-opacity=".8">с</text></svg>`;
  const cash = `<svg class="lx-cash" viewBox="0 0 220 140" aria-hidden="true">${[0, 1, 2].map(i => `<g transform="translate(${i * 6} ${30 - i * 12}) rotate(${-8 + i * 5} 110 60)"><rect x="10" y="20" width="190" height="90" rx="8" fill="${['#2f6b47', '#3b7d55', '#4a8f64'][i]}" stroke="#bfe3c9" stroke-opacity=".5"/><rect x="22" y="32" width="166" height="66" rx="5" fill="none" stroke="#d8f0de" stroke-opacity=".45" stroke-dasharray="4 3"/><circle cx="105" cy="65" r="20" fill="none" stroke="#e9f7ec" stroke-opacity=".7" stroke-width="2"/><text x="105" y="72" text-anchor="middle" font-family="Georgia, serif" font-size="20" fill="#e9f7ec" fill-opacity=".85">5000</text><text x="38" y="52" font-family="Georgia, serif" font-size="12" fill="#e9f7ec" fill-opacity=".7">5000</text></g>`).join('')}</svg>`;

  const features = [
    ['Подбор по бюджету', 'Клиент двигает «взнос» и «платёж в месяц» — и сам находит подходящие квартиры. Вы не тратите время на «а что есть до 5 миллионов?»'],
    ['Калькулятор рассрочки', 'На каждой квартире клиент меняет взнос и видит платёж. Есть скидка за наличные — клиент сам видит выгоду.'],
    ['Заявки сразу в WhatsApp', 'Сообщение уже с квартирой, взносом и платежом. Вам остаётся назначить показ.'],
    ['Свой сайт с вашим именем', `Адрес вида ${esc(base.replace(/^https?:\/\//, ''))}/ваше-имя — для Instagram, WhatsApp-статуса и визитки.`],
    ['Кабинет с телефона', 'Добавить квартиру — пара минут: фото, цена за м², взнос, срок. Платёж посчитается сам.'],
    ['Аналитика', 'Сколько людей зашло, откуда, какие квартиры смотрят и кто написал. Видно, какая реклама приносит клиентов.'],
  ];

  return `<!doctype html><html lang="ru"><head>
${head({ title: `${p.name} — ${p.tagline}`, description: p.tagline, image: base + BRAND.og, url: base + '/partner', settings: {}, ld: { '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization', name: BRAND.name, url: base + '/partner', logo: base + BRAND.logo, telephone: phoneOf(p) }, { '@type': 'WebSite', name: BRAND.name, url: base + '/' }] } })}
<link rel="stylesheet" href="/css/landing.css?v=${version()}">
</head><body class="landing lx">
<header class="lx-top"><div class="wrap">
  <a class="lx-brand" href="/partner" aria-label="kvartiry.asia — сайт для менеджеров"><img src="/img/brand/mark.png" alt="" width="58" height="30"><span><em>kvartiry<b>.asia</b></em><small>для менеджеров</small></span></a>
  <nav class="lx-nav"><a href="#income">Доход</a>${pm ? '<a href="#prices">Цены</a>' : ''}<a href="#features">Возможности</a>${demo.url ? `<a href="${esc(demo.url)}">Пример сайта</a>` : ''}</nav>
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
        <label><span>Средняя цена квартиры</span><output id="oP"></output><input type="range" id="iP" min="1000000" max="20000000" step="250000" value="5000000"></label>
        <label><span>Дополнительных сделок в месяц</span><output id="oD"></output><input type="range" id="iD" min="1" max="10" step="1" value="1" data-hint="Двигайте — посчитаем ваш доход"></label>
      </div>
      <div class="lx-calc-out">
        <span>Дополнительный доход</span>
        <b id="oM"></b><small>в месяц</small>
        <div class="lx-year" id="oY"></div>
        <p>Расчёт на ваших цифрах: средняя цена квартиры и число дополнительных сделок. Сайт работает за вас круглосуточно — клиенты выбирают квартиру и пишут, пока вы на показах.</p>
      </div>
    </div>
  </div></section>

  ${pm ? `<section class="lx-sec" id="prices"><div class="wrap">
    <div class="lx-kicker">Стоимость</div>
    <h2>Меньше, чем <span>одна чашка кофе в день</span></h2>
    <div class="lx-plans">
      <div class="lx-plan">
        <div class="lx-plan-name">1 месяц</div>
        <div class="lx-plan-price">${som(pm)}</div>
        <div class="lx-plan-note">оплата помесячно</div>
        ${p.whatsapp ? `<a class="lx-btn ghost" href="${esc(wa(`Здравствуйте! Хочу подключить «${p.name}» на 1 месяц за ${som(pm)}.`))}" target="_blank" rel="noopener">Подключить на месяц</a>` : ''}
      </div>
      ${p3 ? `<div class="lx-plan">
        <div class="lx-plan-name">3 месяца</div>
        <div class="lx-plan-price">${som(p3)}</div>
        <div class="lx-plan-note">≈ ${som(per3)} в месяц${save3 > 0 ? ` · выгода ${som(save3)}` : ''}</div>
        ${p.whatsapp ? `<a class="lx-btn ghost" href="${esc(wa(`Здравствуйте! Хочу подключить «${p.name}» на 3 месяца за ${som(p3)}.`))}" target="_blank" rel="noopener">Подключить на 3 месяца</a>` : ''}
      </div>` : ''}
      ${p6 ? `<div class="lx-plan best">
        ${save6 > 0 ? '<span class="lx-plan-badge">Выгодно</span>' : ''}
        <div class="lx-plan-name">6 месяцев</div>
        <div class="lx-plan-price">${som(p6)}</div>
        <div class="lx-plan-note">≈ ${som(per6)} в месяц${save6 > 0 ? ` · выгода ${som(save6)}` : ''}</div>
        ${p.whatsapp ? `<a class="lx-btn gold" href="${esc(wa(`Здравствуйте! Хочу подключить «${p.name}» на 6 месяцев за ${som(p6)}.`))}" target="_blank" rel="noopener">${WA_ICON}Подключить на 6 месяцев</a>` : ''}
      </div>` : ''}
    </div>
    <p class="lx-plans-note">В каждый тариф входит${Number(p.includedApartments) ? ` до <b>${Number(p.includedApartments)} квартир</b>` : ''} и всё остальное: свой сайт с вашим именем, кабинет, подбор по бюджету, калькулятор рассрочки, заявки в WhatsApp и аналитика.${Number(p.extraPrice) ? ` Нужно больше квартир — <b>${som(Number(p.extraPrice))} за каждую дополнительную</b> в месяц.` : ''}</p>
  </div></section>` : ''}

  <section class="lx-sec" id="features"><div class="wrap">
    <div class="lx-kicker">Возможности</div>
    <h2>Всё, чтобы клиент <span>написал именно вам</span></h2>
    <div class="lx-feats">${features.map(([t, d], i) => `<div class="lx-feat"><i>0${i + 1}</i><b>${t}</b><p>${d}</p></div>`).join('')}</div>
  </div></section>

  <section class="lx-sec"><div class="wrap">
    <div class="lx-kicker">Как подключить</div>
    <h2>Свой сайт <span>сегодня</span></h2>
    <ol class="lx-steps"><li><b>Напишите в WhatsApp</b>Создадим вам кабинет с логином и паролем</li><li><b>Получите готовые квартиры</b>В кабинете уже будут варианты в рассрочку — поменяйте под себя</li><li><b>Отправляйте свою ссылку</b>Клиенты выбирают квартиру и пишут вам</li></ol>
  </div></section>

  <section class="lx-final"><div class="wrap">
    <h2>Пока вы думаете, клиенты <span>выбирают квартиры у других</span></h2>
    ${waJoin ? `<a class="lx-btn gold big" href="${esc(waJoin)}" target="_blank" rel="noopener">${WA_ICON}Подключиться в WhatsApp</a>` : ''}
    ${phone ? `<a class="lx-phone-link" href="${esc(waJoin)}" target="_blank" rel="noopener">${esc(phone)}</a>` : ''}
    <a class="lx-help" href="${esc(wa('Здравствуйте! Нужна техподдержка по кабинету менеджера.') || '/admin')}" target="_blank" rel="noopener">Уже с нами и нужна помощь? Техподдержка →</a>
  </div></section>
</main>
<footer class="lx-foot"><div class="wrap"><span>${esc(p.name)} · © ${new Date().getFullYear()}</span><a href="/admin">Вход для менеджеров</a></div></footer>
<script>
// Калькулятор дохода
(function () {
  var nf = new Intl.NumberFormat('ru-RU');
  var $ = function (id) { return document.getElementById(id); };
  function upd() {
    // Комиссия в расчёте фиксированная — 0,7% от цены квартиры; на странице её не показываем
    var p = +$('iP').value, c = 0.7, d = +$('iD').value;
    var m = Math.round(p * c / 100 * d);
    $('oP').textContent = nf.format(p) + ' сом';
    $('oD').textContent = d;
    $('oM').textContent = '+' + nf.format(m) + ' сом';
    $('oY').textContent = '+' + nf.format(m * 12) + ' сом в год';
    ['iP', 'iD'].forEach(function (k) { var e = $(k); e.style.setProperty('--p', ((e.value - e.min) / (e.max - e.min) * 100) + '%'); });
  }
  ['iP', 'iD'].forEach(function (k) { $(k).addEventListener('input', upd); });
  upd();
})();
</script>
<script src="/js/common.js?v=${version()}"></script>
</body></html>`;
}

module.exports = { renderIndex, renderApartment, renderGone, renderPrivacy, renderInvalid, renderUnavailable, renderLanding, roomsLabel };
