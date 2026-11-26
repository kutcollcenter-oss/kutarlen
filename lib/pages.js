// Серверный рендер страниц (нужен для SEO и превью ссылок в WhatsApp)
const fs = require('fs');
const path = require('path');
const logoBg = require('./logo-bg');
const { money, waLink, roomsLabel, handoverLabel } = require('./calc');
const { t, plural, dict } = require('./i18n');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = v => JSON.stringify(v).replace(/</g, '\\u003c');

const INDEX_TPL = path.join(__dirname, '..', 'views', 'index.html');
// Версия для сброса кэша CSS/JS: меняется при изменении файлов
const ASSETS = ['css/style.css', 'css/apple.css', 'css/landing.css', 'js/common.js', 'js/app.js', 'js/apartment.js', 'js/aichat.js', 'js/complex.js', 'js/partner-promo.js'].map(p => path.join(__dirname, '..', 'public', p));
const version = () => Math.max(...ASSETS.map(p => fs.statSync(p).mtimeMs)).toString(36).replace('.', '');

const WA_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.5 1.1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>';

const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  bed: svg('<path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M12 4v6"/><path d="M2 18h20"/>'),
  area: svg('<path d="M10 15v-3"/><path d="M14 15v-3"/><path d="M18 15v-3"/><path d="M2 8V4"/><path d="M22 6H2"/><path d="M22 8V4"/><path d="M6 15v-3"/><rect x="2" y="12" width="20" height="8" rx="2"/>'),
  calendar: svg('<path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>'),
  floor: svg('<path d="M10 12h4"/><path d="M10 8h4"/><path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/>'),
  pin: svg('<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>'),
  home: svg('<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  user: svg('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  grid: svg('<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>'),
  star: svg('<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>'),
  insta: svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>'),
};

// Иконки — набор Lucide (lucide.dev, лицензия ISC: бесплатно, можно в коммерции), кроме Instagram

// Логотип сервиса kvartiry.asia: иконка во вкладке на всех страницах (Яндекс и Google показывают
// одну иконку на весь сайт рядом с ним в поиске) и картинка превью ссылки, если у страницы нет своей.
// Логотип менеджера остаётся на самих страницах и иконкой на экране телефона.
const BRAND = { name: 'kvartiry.asia', icon: '/img/brand/icon-32.png', icon192: '/img/brand/icon-192.png', touch: '/img/brand/icon-180.png', og: '/img/brand/og.jpg', logo: '/img/brand/logo.png' };

// Структурированные данные для Google и Яндекса (schema.org в формате JSON-LD).
// «<» экранируется, чтобы текст из базы не мог закрыть тег <script>.
const jsonLd = data => (data ? `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>` : '');

// theme: 'apple' — сайты менеджеров в стиле iPhone (apple.css поверх style.css); 'studio' — страница /partner без него
// Открыли из Instagram (или Facebook) — их встроенный браузер медленный и часто не открывает сайт.
// Android: один раз за визит перекидываем в Chrome (если его нет — остаёмся). Перекидываем только когда страница
// уже загрузилась: попытка перехода во время загрузки обрывает её, и остаётся белый экран.
// iPhone: Instagram не даёт открыть Safari (попытка через x-safari-https оставляла белый экран до обновления) —
// только подсказка сверху, как открыть вручную.
const OPEN_IN_BROWSER = `<script>(function(){var ua=navigator.userAgent||'';if(!/Instagram|FBAN|FBAV|FB_IAB/.test(ua))return;
var u=location.href,and=/Android/i.test(ua),ios=/iPhone|iPad|iPod/i.test(ua);
if(and){var tried=true;try{tried=!!sessionStorage.getItem('extOpen');sessionStorage.setItem('extOpen','1')}catch(e){}
if(!tried)window.addEventListener('load',function(){setTimeout(function(){location.href='intent://'+u.replace(/^https?:\\/\\//,'')+'#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url='+encodeURIComponent(u)+';end'},300)})}
document.addEventListener('DOMContentLoaded',function(){var b=document.createElement('div');b.className='iab-tip';
b.innerHTML='<span>Сайт быстрее работает в '+(ios?'Safari':'Chrome')+': нажмите <b>⋯</b> вверху справа → «'+(ios?'Открыть в браузере':'Открыть в Chrome')+'»</span><button type="button" aria-label="Закрыть">×</button>';
b.querySelector('button').onclick=function(){b.remove()};document.body.insertBefore(b,document.body.firstChild)});})();</script>
<style>.iab-tip{position:relative;z-index:9999;display:flex;align-items:center;gap:10px;padding:10px 14px;background:#1d1d1f;color:#fff;font:14px/1.35 -apple-system,system-ui,sans-serif}.iab-tip span{flex:1}.iab-tip button{border:0;background:none;color:#fff;font-size:22px;line-height:1;padding:0 4px;cursor:pointer}</style>`;

function head({ title, description, image, url, settings, ld, lang = 'ru', theme = 'apple' }) {
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
<meta name="theme-color" content="${theme === 'apple' ? '#ffffff' : '#f2f1ee'}">
<script>document.documentElement.classList.add('js');setTimeout(function(){document.documentElement.classList.add('ready','pl-done')},4000)</script>
${OPEN_IN_BROWSER}
<link rel="icon" type="image/png" sizes="32x32" href="${BRAND.icon}">
<link rel="icon" type="image/png" sizes="192x192" href="${BRAND.icon192}">
<link rel="apple-touch-icon" href="${esc(ownIcon || BRAND.touch)}">
${jsonLd(ld)}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${theme === 'apple'
    ? '<link href="https://fonts.googleapis.com/css2?family=Murecho:wght@400;500;600;700&family=Nunito+Sans:wght@400;600;700&display=swap" rel="stylesheet" media="print" onload="this.media=&quot;all&quot;">' // шрифты как на elitka.kg
    : '<link href="https://fonts.googleapis.com/css2?family=Onest:wght@300;400;500&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" media="print" onload="this.media=&quot;all&quot;">'}
<link rel="stylesheet" href="/css/style.css?v=${version()}">${theme === 'apple' ? `\n<link rel="stylesheet" href="/css/apple.css?v=${version()}">` : ''}`;
}

function publicSettings(s) {
  const { tgToken, tgChat, ...rest } = s;
  return rest;
}

// Ник Instagram для показа: «@arlen.kut» — из ника или ссылки, которую ввёл менеджер
const igNick = s => '@' + String(s.instagram || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
// Словарик под «Деталями»: если в тексте есть «ПСО», «черновая отделка», «Красная книга» — объясняем одной фразой
const GLOSSARY = [
  [/(^|[^а-яё])псо(?![а-яё])/i, 'glossPso'],
  [/черн[оа]в|кара иштетүү/i, 'glossRough'],
  [/красн(ая|ой|ую) книг|кызыл китеп/i, 'glossRedBook'],
];
function glossary(text, lang) {
  const items = GLOSSARY.filter(([re]) => re.test(text)).map(([, k]) => `<li>${esc(t(lang, k))}</li>`);
  return items.length ? `<div class="gloss"><b>${esc(t(lang, 'glossTitle'))}</b><ul>${items.join('')}</ul></div>` : '';
}
const igLink = s => `https://instagram.com/${String(s.instagram).replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '')}`;

// Логотип компании менеджера (загружается в кабинете). Нет логотипа — не показываем ничего.
// Сплошной фон у логотипа (например, белый) — вокруг него плашка того же цвета (см. lib/logo-bg.js)
function logo(s, cls = '', w = 50, h = 30) {
  if (!s.logo) return '';
  const bg = logoBg.get(s.logo);
  const plate = bg ? ` style="--logo-bg:${bg}"` : '';
  return `<img src="${esc(s.logo)}" alt="${esc(s.company || s.name)}" class="${cls}${bg ? ' logo-plate' : ''}" width="${w}" height="${h}"${plate}>`;
}

// ctx — сайт конкретного менеджера: { s: настройки, base: «https://домен», prefix: «/aidana-k7f3q9», slug }
// Все ссылки внутри сайта идут через prefix, поэтому клиент никогда не попадает на сайт другого менеджера.

// Есть ли у менеджера отзывы. Нет — раздела «Отзывы» на странице нет, и пункт меню тоже не показываем.
const hasReviews = s => /\S/.test(String(s.reviews || ''));

// Шапка. Верхнее меню и кнопка WhatsApp видны только на ноутбуке (≥1024 px), на телефоне и планшете — нижнее меню.
// Переключатель языка «Рус / Кыр»: ссылка ?lang=… запоминает выбор (см. server.js) и открывает ту же страницу
function langSwitch(lang) {
  return `<div class="lang-sw" role="group" aria-label="Тил / Язык">${['ky', 'ru'].map(l =>
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
// Пример сайта (/demo): полоска сверху и вместо WhatsApp — окошко «Это пример»
const DEMO_NOTE = `<div class="demo-bar">Это пример сайта kvartiry.asia — <a href="/partner">хочу такой же →</a></div>
<div class="demo-pop" id="demoPop" hidden><div><b>Это пример сайта</b><p>Здесь клиент нажал бы кнопку — и написал бы вам в WhatsApp с готовым текстом: какая квартира, взнос и платёж.</p><a class="btn btn-wa" href="/partner">Хочу такой сайт</a><button type="button" id="demoClose">Закрыть</button></div></div>
<style>.demo-bar{position:fixed;top:0;left:0;right:0;z-index:100;background:#1d1d1f;color:#fff;text-align:center;font:500 13px/1.3 -apple-system,system-ui,sans-serif;padding:8px 12px}.demo-bar a{color:#e8c98f}body{padding-top:34px}.demo-pop{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.5);display:grid;place-items:center;padding:16px}.demo-pop[hidden]{display:none}.demo-pop>div{background:#fff;color:#1d1d1f;max-width:360px;padding:22px;border-radius:20px!important;display:grid;gap:10px;text-align:center}.demo-pop p{margin:0;color:#555;font-size:15px;line-height:1.45}.demo-pop button{background:none;border:0;color:#666;font-size:15px;padding:8px;cursor:pointer}</style>
<script>document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href*="wa.me"],a[href^="tel:"],a[href*="instagram.com"]');if(!a)return;e.preventDefault();e.stopPropagation();document.getElementById('demoPop').hidden=false;},true);document.getElementById('demoClose').onclick=function(){document.getElementById('demoPop').hidden=true;};</script>`;
// Менеджер ещё не указал номер WhatsApp: ссылки вида wa.me/?text= открывают WhatsApp без получателя — заявка теряется.
// Такие кнопки прячем (и те, что app.js/aichat.js дорисуют позже), а в кабинете менеджер видит красное предупреждение.
const NO_WA = '<style>a[href^="https://wa.me/?"]{display:none!important}</style>';
function footer(ctx) {
  const { s, prefix, lang } = ctx;
  return `<footer class="footer fx${ctx.partnerCta === false ? ' fx-short' : ''}"><div class="wrap">
  ${ctx.partnerCta === false ? '' : `<a class="fx-cta" href="/partner">
    <span class="fx-cta-text"><b>${t(lang, 'footerCta')}</b><span>${t(lang, 'footerCtaText')}</span></span>
    <span class="fx-cta-btn"><img src="/img/brand/icon-32.png" alt="" width="20" height="20">${t(lang, 'footerCtaBtn')}</span>
  </a>`}
  ${ctx.demo ? DEMO_NOTE : ''}
  ${!ctx.demo && !String(s.whatsapp || '').replace(/\D/g, '') ? NO_WA : ''}
  <div class="fx-bottom">
    <nav class="fx-legal" aria-label="${t(lang, 'docsNav')}">${s.instagram ? `<a href="${esc(igLink(s))}" target="_blank" rel="noopener">Instagram ${esc(igNick(s))}</a>` : ''}<a href="${prefix}/privacy">${t(lang, 'privacy')}</a></nav>
    <span class="fx-copy">${esc(s.name)} / © ${new Date().getFullYear()}</span>
  </div>
</div></footer>`;
}

// page — для аналитики: home | apt | gone | privacy
function scripts(ctx, page, extra = {}, files = ['common']) {
  // ИИ-помощник — на главной и на странице квартиры, если владелец включил его
  const ai = !!ctx.ai && (page === 'home' || page === 'apt');
  if (ai) files = [...files, 'aichat'];
  // lang и t — язык страницы и словарь для скриптов (common.js, app.js, apartment.js)
  return `<script>window.__DATA__=${json({ settings: publicSettings(ctx.s), slug: ctx.slug, page, lang: ctx.lang || 'ru', t: dict(ctx.lang), waIcon: WA_ICON, icons: ICONS, ai, aiLog: ai && ctx.ai === 'log', ...extra })}</script>
${files.map(f => `<script src="/js/${f}.js?v=${version()}"></script>`).join('\n')}`;
}

// Код валюты для schema.org: «сом» → KGS, «$» → USD; иначе цену без валюты не указываем
const currencyCode = c => ({ 'сом': 'KGS', 'сом.': 'KGS', '$': 'USD', 'usd': 'USD' }[String(c || '').trim().toLowerCase()] || '');
const TG_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M21.9 4.3 18.7 19.4c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13 1.4 11.5c-1-.3-1.1-1 .2-1.5L20.5 2.8c.9-.3 1.7.2 1.4 1.5z"/></svg>';
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
    ? `<p class="pay-line">${t(lang, 'payLineHtml', { down: money(a.down, c), monthly: money(a.monthly, c), n: a.months })}</p><div class="price-line">${esc(t(lang, 'priceLine', { x: money(a.price, c) }))}</div>`
    : '';
  return `<article class="card"><a class="card-link" href="${a.url}">
      <div class="card-photo">${photo}</div>
      <div class="card-body">${price}<div class="card-title">${a.roomsLabel}, ${a.area} ${a.unit}${a.title ? ` · ${esc(a.title)}` : ''}</div>
        ${a.address || a.district ? `<div class="card-addr">${ICONS.pin}${esc([a.district, a.address].filter(Boolean).join(' · '))}</div>` : ''}${pay}</div></a></article>`;
}

// Новость «Скоро»: фото, заголовок, текст и кнопка «Узнать первым» — клиент пишет менеджеру в WhatsApp
function newsCard(n, s, lang) {
  const text = t(lang, 'waNews', { title: n.title || n.text.slice(0, 80) });
  const href = s.whatsapp ? waLink(s.whatsapp, text) : '#';
  return `<article class="news-card">
      ${n.photo ? `<div class="news-photo"><img src="/uploads/${esc(n.photo)}.webp" alt="${esc(n.title)}" loading="lazy">${n.title ? `<h3 class="news-cap">${esc(n.title)}</h3>` : ''}</div>` : ''}
      <div class="news-body">
        ${n.title && !n.photo ? `<h3>${esc(n.title)}</h3>` : ''}
        ${n.title && n.photo ? `<h3 class="news-cover-title">${esc(n.title)}</h3>` : ''}
        ${n.text ? `<p class="news-text">${esc(n.text).replace(/\n/g, '<br>')}</p>
        <button type="button" class="news-more" aria-expanded="false" hidden>${t(lang, 'newsMore')}</button>` : ''}
        <a class="btn btn-wa news-btn" href="${esc(href)}" data-wa="news" target="_blank" rel="noopener">${WA_ICON}${t(lang, 'newsBtn')}</a>
      </div>
    </article>`;
}

// Первый экран на компьютере: главная кнопка «Подобрать квартиру» и цифры доверия (считаются по квартирам менеджера).
// На телефоне этот блок скрыт — там свой первый экран с фото.
function heroDesk(apartments, lang) {
  const ky = lang === 'ky';
  const flats = apartments.filter(a => a.type !== 'commercial' && a.type !== 'land');
  const inst = flats.filter(a => a.installment);
  const n = flats.length;
  const word = ky ? 'батир сайтта' : `${[1].includes(n % 10) && n % 100 !== 11 ? 'квартира' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'квартиры' : 'квартир'} на сайте`;
  const stats = [
    n && [String(n), word],
    inst.length && [`${Math.max(...inst.map(a => a.months || 0))} ${ky ? 'ай' : 'мес.'}`, ky ? 'бөлүп төлөө, банксыз' : 'рассрочка без банка'],
    inst.length && [money(Math.min(...inst.map(a => a.down)), inst[0].currency), ky ? 'алгачкы төлөм' : 'первый взнос от'],
  ].filter(Boolean);
  return `<div class="hero-desk">
        <div class="hero-cta">
          <a class="btn btn-primary hero-go" href="#catalog">${ky ? 'Батир тандоо' : 'Подобрать квартиру'}</a>
        </div>
        ${stats.length ? `<dl class="hero-stats">${stats.map(([v, l]) => `<div><dt>${esc(v)}</dt><dd>${esc(l)}</dd></div>`).join('')}</dl>` : ''}
      </div>`;
}

// Срок сдачи объекта компании (lib/kut-objects.js хранит по-русски) — по-кыргызски для кыргызской версии сайта.
// Незнакомый формат остаётся как есть.
const KY_MONTH = { январе: 'январь', феврале: 'февраль', марте: 'март', апреле: 'апрель', мае: 'май', июне: 'июнь', июле: 'июль',
  августе: 'август', сентябре: 'сентябрь', октябре: 'октябрь', ноябре: 'ноябрь', декабре: 'декабрь' };
const KY_SEASON = { зимой: 'кышында', весной: 'жазында', летом: 'жайында', осенью: 'күзүндө' };
const ROMAN = ['', 'I', 'II', 'III', 'IV'];
function kyWhen(w) {
  const s = String(w || '').trim();
  const q = x => x.replace(/(\d) квартал (\d{4})/g, (m, n, y) => `${y}-ж. ${ROMAN[n] || n} чейрек`);
  let m;
  if (s === 'Сдан') return 'Тапшырылган';
  if (s === 'Строится') return 'Курулууда';
  if ((m = s.match(/^Сдан в (\S+) (\d{4})$/)) && KY_MONTH[m[1]]) return `${m[2]}-ж. ${KY_MONTH[m[1]]} айында тапшырылган`;
  if ((m = s.match(/^Сдан (\S+) (\d{4})$/)) && KY_SEASON[m[1]]) return `${m[2]}-ж. ${KY_SEASON[m[1]]} тапшырылган`;
  if ((m = s.match(/^Сдан в (\d{4})$/))) return `${m[1]}-ж. тапшырылган`;
  if ((m = s.match(/^Сдача по очередям — (.+)$/))) return `Кезек менен тапшыруу: ${m[1]}`;
  if ((m = s.match(/^Сдача — (\S+) (\d{4})$/)) && Object.values(KY_MONTH).includes(m[1])) return `Тапшыруу: ${m[2]}-ж. ${m[1]}`;
  if ((m = s.match(/^Сдача — (.+)$/))) return `Тапшыруу: ${q(m[1])}`;
  if ((m = s.match(/^Ключи — (.+)$/))) return `Ачкычтар: ${q(m[1]).replace('(с взносом)', '(алгачкы төлөм менен)').replace('(без взноса)', '(алгачкы төлөмсүз)').replace(' или ', ' же ')}`;
  return s;
}

// Достижения компании менеджера (lib/companies.js): цифры и карточки объектов. Видны первые 6, остальные — по кнопке «Показать все».
const KUT_SHOW = 6;
function kutBlock(co, lang) {
  const ky = lang === 'ky';
  const nf = n => new Intl.NumberFormat('ru-RU').format(n);
  const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);
  const round = n => (n >= 1000 ? Math.floor(n / 100) * 100 : n);
  const all = co.objects;
  const done = all.filter(o => o.done);
  const sum = list => list.reduce((s, o) => s + (o.flats || 0), 0);
  const stats = [
    [String(all.length), ky ? 'объект — тапшырылган жана курулуп жаткан' : `${plural(all.length, 'объект', 'объекта', 'объектов')} — сданных и строящихся`],
    [String(done.length), ky ? 'үй комплекси тапшырылды' : `${plural(done.length, 'жилой комплекс', 'жилых комплекса', 'жилых комплексов')} уже сдано`],
    [`${nf(round(sum(done)))}+`, ky ? 'батир ээлерине тапшырылды' : 'квартир уже передано владельцам'],
    [`${nf(round(sum(all)))}+`, ky ? 'батир бардык долбоорлордо' : 'квартир во всех проектах'],
  ];
  const L = ky
    ? { kicker: co.fullKy, h2: 'Компаниянын <span class="hl">жетишкендиктери</span>', lead: `«${co.name}» компаниясынын тапшырылган жана курулуп жаткан үйлөрү.`,
      fl: 'кабат', bl: 'блок', fla: 'батир', finish: 'Оңдоо', facade: 'Фасад', docs: 'Документтер', build: 'Курулушу', heat: 'Коммуникация', infra: 'Жакын жерде',
      more: `Бардык объекттерди көрсөтүү (${all.length})`, less: 'Жыйноо', det: 'Толугураак', doneW: 'Тапшырылды', buildW: 'Курулууда' }
    : { kicker: co.full, h2: 'Достижения <span class="hl">компании</span>', lead: `Сданные и строящиеся дома компании «${co.name}».`,
      fl: 'эт.', bl: null, fla: null, finish: 'Отделка', facade: 'Фасад', docs: 'Документы', build: 'Конструкция', heat: 'Коммуникации', infra: 'Рядом',
      more: `Показать все объекты (${all.length})`, less: 'Свернуть', det: 'Подробнее', doneW: 'Сдан', buildW: 'Строится' };
  const row = (k, v) => (v ? `<div><dt>${L[k]}</dt><dd>${esc(v)}</dd></div>` : '');
  const card = (o, i) => {
    const nums = [
      o.floors && `<span><b>${esc(o.floors)}</b> ${L.fl}</span>`,
      o.blocks && `<span><b>${nf(o.blocks)}</b> ${ky ? L.bl : plural(o.blocks, 'блок', 'блока', 'блоков')}</span>`,
      o.flats && `<span><b>${nf(o.flats)}</b> ${ky ? L.fla : plural(o.flats, 'квартира', 'квартиры', 'квартир')}</span>`,
      o.area && `<span><b>${esc(o.area)}</b></span>`,
    ].filter(Boolean).join('');
    return `<article class="obj${i >= KUT_SHOW ? ' obj-more' : ''}">
        <span class="obj-st${o.done ? ' done' : ''}">${o.done ? '✓ ' : ''}${esc(ky ? kyWhen(o.when) : o.when)}</span>
        <h3>${esc(o.name)}</h3>
        <p class="obj-addr">${esc(o.address)}</p>
        ${nums ? `<div class="obj-nums">${nums}</div>` : ''}
        <details class="obj-det"><summary><span class="o">${L.det}</span><span class="c">${L.less}</span></summary>
          <dl class="obj-dl">${row('finish', o.finish)}${row('facade', o.facade)}${row('build', o.build)}${row('heat', o.heat)}${row('infra', o.infra)}</dl>
        </details>
      </article>`;
  };
  return `<section class="section kut-sec" id="company"><div class="wrap">
    <div class="kicker">${esc(L.kicker)}</div>
    <h2>${L.h2}</h2>
    <p class="lead kut-lead">${esc(L.lead)}</p>
    <div class="kut-stats">${stats.map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>
    <div class="objs">${all.map(card).join('')}</div>
    ${all.length > KUT_SHOW ? `<div class="kut-more-wrap"><button type="button" class="btn kut-more" data-kut-more aria-expanded="false" data-more="${esc(L.more)}" data-less="${esc(L.less)}">${esc(L.more)}</button></div>` : ''}
  </div></section>`;
}

function fillIndex(html, ctx, apartments) {
  const { s, lang } = ctx;
  // Тексты шаблона {{ключ}} — из словаря на языке страницы
  html = html.replace(/\{\{(\w+)\}\}/g, (m, k) => (k.endsWith('Html') ? t(lang, k) : esc(t(lang, k))));
  // Новостей нет — блока «Скоро» на странице нет совсем
  const news = (Array.isArray(s.news) ? s.news : []).filter(n => n && (n.title || n.text));
  // У всех новостей есть фото — на компьютере и планшете фото новости становится фоном всего блока (как первый экран);
  // новостей несколько — фон и карточка сменяются сами каждые 4 секунды (app.js); внизу стрелки и точки — листать самому
  const cover = news.length > 0 && news.every(n => /^[0-9a-f]{16}$/.test(n.photo || ''));
  html = news.length
    ? fillId(html, 'news', news.map((n, i) => {
      const c = newsCard(n, s, lang);
      return cover ? c.replace('<article class="news-card"', `<article class="news-card${i ? '' : ' on'}" data-i="${i}"`) : c;
    }).join(''))
    : html.replace(/<!--NEWS-->[\s\S]*?<!--\/NEWS-->/, '');
  if (cover) {
    const bgs = `<div class="news-bgs" aria-hidden="true">${news.map((n, i) => `<div class="news-bg${i ? '' : ' on'}" style="background-image:url('/uploads/${n.photo}.webp')"></div>`).join('')}</div>`;
    const dots = news.length > 1 ? `<div class="news-dots"><button type="button" class="news-arr" data-step="-1" aria-label="${lang === 'ky' ? 'Мурунку' : 'Предыдущая'}">‹</button>${news.map((n, i) => `<button type="button" data-i="${i}" class="${i ? '' : 'on'}" aria-label="${i + 1}"></button>`).join('')}<button type="button" class="news-arr" data-step="1" aria-label="${lang === 'ky' ? 'Кийинки' : 'Следующая'}">›</button></div>` : '';
    html = html.replace('<section class="section news-sec" id="news-sec"><div class="wrap">', `<section class="section news-sec news-cover" id="news-sec">${bgs}<div class="wrap">`);
    if (dots) html = html.replace(/<\/div><\/section>(\s*<!--\/NEWS-->)/, `${dots}</div></section>$1`);
  }
  const role = String(s.role || '');
  html = fillId(html, 'heroKicker', esc(s.heroKicker || ''));
  html = fillId(html, 'heroTitle', esc(s.tagline || ''));
  // Есть фото менеджера — на телефоне оно на весь первый экран (класс hero-cover)
  if (s.photo) html = html.replace('<section class="hero">', '<section class="hero hero-cover">');
  html = fillId(html, 'heroPoints', textLines(s.heroPoints).map(x => `<li>${esc(x)}</li>`).join(''));
  html = html.replace('<!--HERO-DESK-->', heroDesk(apartments, lang));
  html = fillId(html, 'heroPhoto', s.photo ? `<img src="${esc(s.photo)}" alt="${esc(s.name)}" fetchpriority="high">` : '');
  html = fillId(html, 'badgeName', esc(s.name));
  html = fillId(html, 'badgeRole', esc(role));
  html = fillId(html, 'cards', apartments.map(a => serverCard(a, lang)).join(''));
  html = fillId(html, 'steps', textLines(s.steps).map(x => `<li>${esc(x)}</li>`).join(''));
  html = fillId(html, 'docs', textLines(s.documents).map(x => `<li>${esc(x)}</li>`).join(''));
  // Instagram менеджера — заметной кнопкой под «Обо мне» (ник вводится в кабинете, «Профиль» → «Контакты»)
  // «Обо мне»: фото менеджера кружком с золотой каймой
  html = html.replace('<!--ABOUT-PHOTO-->', ''); // фото в «Обо мне» убрано (оно и так на первом экране)
  html = html.replace('<!--KUT-->', ctx.kut ? kutBlock(ctx.kut, lang) : '');
  html = html.replace('<!--INSTA-->', s.instagram
    ? `<a class="insta-link" href="${esc(igLink(s))}" target="_blank" rel="noopener">${ICONS.insta}<span><small>${t(lang, 'myInstagram')}</small><b>${esc(igNick(s))}</b></span></a>`
    : '');
  html = fillId(html, 'officeAddr', esc(s.officeAddress || ''));
  if (s.officeLink) html = html.replace('<a class="office" id="office"', `<a class="office" id="office" href="${esc(s.officeLink)}"`);
  html = fillId(html, 'stats', textLines(s.stats).map(l => { const [v, t] = l.split('|').map(x => x.trim()); return `<div class="stat"><div><b>${esc(v)}</b><span>${esc(t || '')}</span></div></div>`; }).join(''));
  html = fillId(html, 'reviews', textBlocks(s.reviews).map(([head, ...text]) => {
    const [who, date] = head.split('|').map(x => x.trim());
    return `<figure class="review"><blockquote>${esc(text.join(' '))}</blockquote><figcaption><span><b>${esc(who)}</b>${date ? `<small>${esc(date)}</small>` : ''}</span></figcaption></figure>`;
  }).join(''));
  html = fillId(html, 'faq', textBlocks(s.faq).map(([q, ...a]) => `<details><summary>${esc(q)}</summary><p>${esc(a.join(' '))}</p></details>`).join(''));
  // Нижний блок одинаковый у всех: выбрать квартиру и нажать «Хочу» (WhatsApp — в карточке квартиры)
  html = fillId(html, 'ctaTitle', t(lang, 'ctaTitleHtml'));
  html = fillId(html, 'ctaText', esc(t(lang, 'ctaText')));
  // Настоящие ссылки WhatsApp вместо «#»
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
  // Квартира в ЖК: этажность дома — на странице ЖК, здесь только этаж квартиры
  const floorInfo = a.floorFrom ? L('floorFromOf', { f: a.floorFrom, of: a.floors && !a.inZk ? L('floorOf', { n: a.floors }) : '' }) : a.floors && !a.inZk ? L('houseFloors', { n: a.floors }) : '';

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
    ${a.title ? (a.zk ? `<a class="apt-complex" href="${a.zk}?t=${a.type}">${esc(a.title)} →</a>` : `<div class="apt-complex">${esc(a.title)}</div>`) : ''}
    <h1>${a.roomsLabel}, ${a.area} ${a.unit}</h1>
    ${a.address || a.district ? `<div class="addr">${ICONS.pin}${esc([a.district, a.address].filter(Boolean).join(' · '))}</div>` : ''}
    <div class="feats">
      ${a.type === 'land' ? '' : `<span>${ICONS.bed}${a.roomsLabel}</span>`}<span>${ICONS.area}${a.area} ${a.unit}</span>
      ${floorInfo ? `<span>${ICONS.floor}${floorInfo}</span>` : ''}
      ${a.handover ? `<span>${ICONS.calendar}${esc(handoverLabel(a.handover, lang))}</span>` : ''}
    </div>
    ${a.floorFrom && a.type !== 'land' ? `<p class="floor-note">${L('floorChoice')}</p>` : ''}
    ${calc}
    <a class="btn btn-wa btn-lg apt-cta" id="aptWa" href="${esc(wa)}" data-wa="apartment" data-id="${a.id}" target="_blank" rel="noopener">${WA_ICON}${L({ commercial: 'wantCommercial', land: 'wantLand' }[a.type] || 'wantApartment')}</a>
  </div>
  <!-- Детали и карта: на телефоне — после цены (кнопка встаёт между ними, см. common.js), на ноутбуке — под фото (см. .apt-more в style.css) -->
  <div class="apt-more">
    ${a.details ? `<section class="details"><h2>${L('details')}</h2><p>${esc(a.details).replace(/\n/g, '<br>')}</p>${glossary(a.details, lang)}</section>` : ''}
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

// ---------- Страница ЖК: фото, главные цифры, кнопка WhatsApp, квартиры по комнатам, карта ----------
function renderComplex(ctx, name, list, { url, type, about = '' } = {}) {
  const { s, base, lang } = ctx;
  const L = (k, v) => t(lang, k, v);
  const top = arr => { const n = new Map(); arr.filter(Boolean).forEach(x => n.set(x, (n.get(x) || 0) + 1)); return ([...n.entries()].sort((a, b) => b[1] - a[1])[0] || [''])[0]; };
  const min = arr => Math.min(...arr.filter(v => v > 0));
  const place = [top(list.map(a => a.district)), top(list.map(a => a.address).filter(x => !/^https?:/i.test(x)))].filter(Boolean).join(' · ');
  // Фото: все фото квартир ЖК без повторов (первые 15)
  const seen = new Set(), photos = [];
  // Только фото ЖК (здание снаружи), без планировок — они на страницах квартир
  list.forEach(a => a.photos.forEach(p => { if (p.zk && !seen.has(p.src) && photos.length < 15) { seen.add(p.src); photos.push(p); } }));
  // Цифры вверху — по выбранной категории (рассрочка, коммерция…), чтобы «от …» совпадало со списком ниже
  const TYPES0 = ['installment', 'commercial', 'cash', 'land'].filter(x => list.some(a => a.type === x));
  const sel = TYPES0.includes(type) ? type : TYPES0[0];
  const floors = Math.max(0, ...list.map(a => a.floors || 0));
  // Цифры одной категории; на странице — блок на каждую категорию, виден блок выбранной вкладки
  const factsFor = tp => {
    const base0 = list.filter(a => a.type === tp);
    const inst = base0.filter(a => a.installment), cur = (inst[0] || base0[0]).currency;
    // Все этапы сдачи: «II кв. 2028, II кв. 2030»
    const stageMap = new Map();
    base0.forEach(a => (a.stages || []).forEach(x => { const k = x.y * 10 + x.q; if (!stageMap.has(k)) stageMap.set(k, x); }));
    const stages = [...stageMap.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1])
      .filter((x, i, all) => x.q || !all.some(o => o.y === x.y && o.q)); // «2028» и «II кв. 2028» — один этап
    const handover = stages.length ? stages.map(x => (x.q ? L('hoQ', { q: ['I', 'II', 'III', 'IV'][x.q - 1], y: x.y }) : String(x.y))).join(', ') : top(base0.map(a => a.handover));
    return [
      [L('zkPpm'), L('objFrom', { x: money(min(base0.map(a => a.pricePerM2)), cur) })],
      inst.length && [L('zkDown'), L('objFrom', { x: money(min(inst.map(a => a.down)), cur) })],
      inst.length && [L('zkMonthly'), L('objFrom', { x: money(min(inst.map(a => a.monthly)), cur) })],
      inst.length && [L('zkTerm'), L('zkTermV', { n: Math.max(...inst.map(a => a.months)) })],
      handover && [L('zkHandover'), esc(handover)],
      floors && [L('zkFloors'), L('zkFloorsV', { n: floors })],
      [L('zkCount'), String(base0.length)],
    ].filter(Boolean);
  };
  const facts = factsFor(sel);
  const wa = waLink(s.whatsapp, `${L('zkWa', { name })}\n\n${base}${url}`);
  const map = (list.find(a => a.map && a.map.embed) || {}).map;
  // Вкладки: категории (если их несколько) и комнаты
  const TYPES = ['installment', 'commercial', 'cash', 'land'].filter(x => list.some(a => a.type === x));
  const typeLabel = { installment: L('typeInstallment'), commercial: L('typeCommercial'), cash: L('typeCash'), land: L('typeLand') };
  const roomKey = a => (a.type === 'land' || a.type === 'commercial' ? a.type : String(Math.min(a.rooms, 4)));
  // Квартира в ЖК — карточка как на elitka.kg: крупная планировка сверху, платёж, комнаты и площадь, строки условий
  const row = a => {
    const c = a.currency;
    const lines = [
      a.installment && [L('price'), money(a.price, c)],
      a.installment && [L('zkDown'), money(a.down, c)],
      a.installment && [L('zkTerm'), L('months', { n: a.months })],
      !a.installment && [L('zkPpm'), `${money(a.pricePerM2, c)}/${a.unit}`],
      a.floorFrom && [L('zkFloor'), L('fromFloor', { f: a.floorFrom })],
      a.handover && [L('zkHandover'), handoverLabel(a.handover, lang).replace(/^[^:]*:\s*/, '')],
    ].filter(Boolean);
    return `<a class="zk-apt" href="${a.url}" data-id="${esc(a.id)}" data-down="${a.installment ? a.down : ''}" data-t="${a.type}" data-r="${roomKey(a)}" data-y="${(a.stages || []).map(x => x.y).join(' ')}" data-l="${esc(a.roomsLabel)}" data-area="${a.area}" data-v="${a.installment ? a.monthly : a.price}">
      <div class="zk-apt-ph">${a.photos[0] ? `<img src="${a.photos[0].thumb}" alt="${esc(a.roomsLabel)}" loading="lazy">` : '<div class="ph"></div>'}</div>
      <div class="zk-apt-body">
        <div class="zk-apt-price">${a.installment
          ? `<b>${money(a.monthly, c)} <small>${L('perMonth')}</small></b>`
          : `<b>${money(a.price, c)}</b><span>${L(a.type === 'cash' || a.type === 'land' ? 'cashWord' : 'fullPay')}</span>`}</div>
        <div class="zk-apt-head"><span>${esc(a.roomsLabel)}</span><b>${a.area} ${a.unit}</b></div>
        <dl class="zk-apt-dl">${lines.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        <span class="zk-apt-btn">${L('zkMore')}</span>
      </div>
    </a>`;
  };
  const sorted = list.slice().sort((x, y) => (x.rooms - y.rooms) || ((x.installment ? x.monthly : x.price) - (y.installment ? y.monthly : y.price)));
  const title = `${name}${place ? ' — ' + place : ''}`;
  return `<!doctype html><html lang="${L('htmlLang')}"><head>
${head({ title: `${title} | ${s.name}`, description: facts.map(f => `${f[0]}: ${f[1]}`).join(' · '), image: photos[0] ? base + photos[0].og : null, url: base + url, settings: s, lang })}
</head><body class="zk-page">
${header(ctx)}
<main class="wrap zkp">
  <a class="zkp-back" href="${ctx.prefix}#catalog">← ${L('zkBack')}</a>
  <h1>${esc(name)}</h1>
  ${place ? `<div class="zkp-addr">${ICONS.pin}<span>${esc(place)}</span></div>` : ''}
  <div class="zkp-top${photos.length ? '' : ' no-photo'}">
    ${photos.length ? `<div class="card-photo zkp-photo" id="zkPhoto"><div class="cp-track">${photos.map((p, i) => `<img src="${p.src}" alt="${esc(name)}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}>`).join('')}</div>${photos.length > 1 ? `<div class="zkp-count">${L('zkPhotos', { n: photos.length })}</div>` : ''}</div>` : ''}
    <div class="zkp-side">
      ${TYPES0.map(tp => `<dl class="zkp-facts" data-t="${tp}"${tp === sel ? '' : ' hidden'}>${factsFor(tp).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`).join('')}
      ${s.whatsapp ? `<a class="btn btn-wa btn-lg zkp-wa" href="${esc(wa)}" data-wa="complex" target="_blank" rel="noopener">${WA_ICON}${L('zkAsk')}</a>` : ''}
    </div>
  </div>

  ${about ? `<section class="details zkp-about"><h2>${L('zkAbout')}</h2><p>${esc(about).replace(/\n/g, '<br>')}</p>${glossary(about, lang)}</section>` : ''}

  <section class="zkp-list">
    <h2>${L('zkApts')}</h2>
    ${TYPES.length > 1 ? `<div class="seg zkp-types" id="zkTypes">${TYPES.map(x => `<button type="button" data-v="${x}" class="${x === (TYPES.includes(type) ? type : TYPES[0]) ? 'on' : ''}">${esc(typeLabel[x])}</button>`).join('')}</div>` : ''}
    <div class="chips zkp-rooms zkp-stages" id="zkStages" data-label="${esc(L('zkStage'))}"></div>
    <div class="chips zkp-rooms" id="zkRooms"></div>
    <p class="zkp-only" id="zkOnly" hidden></p>
    <p class="zkp-sum" id="zkSum"></p>
    <div class="zkp-apts" id="zkApts">${sorted.map(row).join('')}</div>
  </section>

  ${map && map.embed ? `<section class="map zkp-map"><h2>${L('onMap')}</h2><iframe loading="lazy" title="${L('map')}" src="${esc(map.embed)}" referrerpolicy="no-referrer-when-downgrade"></iframe></section>` : ''}
</main>
${footer(ctx)}
${tabbar(ctx, { active: 'catalog', waText: `${L('zkWa', { name })}\n\n${base}${url}`, waPlace: 'complex-tab' })}
${scripts(ctx, 'zhk', { complex: { type: TYPES.includes(type) ? type : TYPES[0] } }, ['common', 'complex'])}
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
function renderLanding(product, base, demo = {}, promo = null) {
  const p = product;
  // Промокод партнёра (kvartiry.asia/p/SUETA): дописывается в каждое сообщение «Хочу подключить»
  const promoLine = promo ? `\n\nПромокод: ${promo.code}` : '';
  const promoDisc = promo ? Number(promo.discount) || 0 : 0;
  const discTotal = n => Math.round((n * (100 - promoDisc)) / 100);
  // Контакт сервиса: Telegram (если указан) — тогда личный номер владельца на странице не показывается
  const tgUser = String(p.telegram || '').trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '').replace(/[^\w]/g, '');
  const wa = text => (tgUser ? `https://t.me/${tgUser}?text=${encodeURIComponent(text + promoLine)}` : p.whatsapp ? waLink(p.whatsapp, text + promoLine) : '');
  const MSG_ICON = tgUser ? TG_ICON : WA_ICON;
  const msgName = tgUser ? 'Telegram' : 'WhatsApp';
  const waJoin = wa(`Здравствуйте! Хочу подключить «${p.name}».`);
  const phone = tgUser ? '@' + tgUser : String(p.whatsapp || '').replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})(\d{3})$/, '+$1 $2 $3 $4');
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
    ? `<img src="${esc(f.photo)}" alt="" width="56" height="56" loading="lazy">`
    : `<i>${esc((f.name.trim()[0] || '•').toUpperCase())}</i>`);
  const usersLine = users.count ? `<div class="lx-users">
        <div class="lx-faces" aria-hidden="true">${users.faces.map(face).join('')}${users.count > users.faces.length ? `<i class="lx-more-faces">+${users.count - users.faces.length}</i>` : ''}</div>
        <span>Уже ${users.count % 10 === 1 && users.count % 100 !== 11 ? 'пользуется' : 'пользуются'} <b>${users.count} ${word(users.count)}</b></span>
      </div>` : '';
  const tier = t => `<div class="lx-tier${t.best ? ' best' : ''}">
        <div class="lx-tier-top"><span class="lx-tier-name">${t.name}</span>${t.best ? '<span class="lx-tier-badge">Выгоднее всего</span>' : ''}</div>
        <div class="lx-tier-price"><b>${som(t.per)}</b><span>/ месяц</span></div>
        <dl class="lx-tier-money">
          <div><dt>Вы платите</dt><dd>${promoDisc ? `<s class="lx-old">${som(t.total)}</s> ${som(discTotal(t.total))}` : som(t.total)}${t.months > 1 ? ` за ${t.months} мес.` : ''}</dd></div>
          <div><dt>Выгода</dt><dd class="${t.save > 0 ? 'plus' : ''}">${t.save > 0 ? som(t.save) : '—'}</dd></div>
        </dl>
        ${p.whatsapp || tgUser ? `<a class="lx-btn ${t.best ? 'gold' : 'ghost'} lx-tier-btn" data-total="${t.total}" href="${esc(wa(`Здравствуйте! Хочу подключить «${p.name}» на ${t.months === 1 ? '1 месяц' : `${t.months} месяц${t.months < 5 ? 'а' : 'ев'}`} за ${som(t.total)}.${promoDisc ? ` Со скидкой ${promoDisc}% по промокоду — ${som(discTotal(t.total))}.` : ''}`))}" target="_blank" rel="noopener">${t.best ? MSG_ICON : ''}${t.btn}</a>` : ''}
      </div>`;
  // «Что входит» — один список под тарифами, общий для всех
  const includes = [
    'Свой сайт с вашим именем',
    'Квартиры, коммерция и участки — всё на одном сайте',
    included ? `До ${included} ${included % 10 === 1 && included % 100 !== 11 ? 'квартиры' : 'квартир'}${extra ? ` (дополнительная — ${som(extra)} в месяц)` : ''}` : 'Квартиры без ограничения',
    'Подбор по бюджету и калькулятор рассрочки',
    'Заявки сразу в WhatsApp',
    'Кабинет с телефона',
    'Аналитика: посетители, источники, заявки',
    'Бонус: личный сайт учёта доходов и расходов',
  ];
  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Монета и пачка купюр — рисованные, без чужих фото
  const coin = cls => `<svg class="lx-coin ${cls}" viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="g${cls}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff3c4"/><stop offset=".45" stop-color="#e2bd5c"/><stop offset="1" stop-color="#8a6420"/></radialGradient></defs><circle cx="50" cy="50" r="46" fill="url(#g${cls})"/><circle cx="50" cy="50" r="36" fill="none" stroke="#fff3c4" stroke-opacity=".55" stroke-width="2"/><text x="50" y="62" text-anchor="middle" font-family="Georgia, serif" font-size="34" font-weight="700" fill="#7a5618" fill-opacity=".8">с</text></svg>`;
  const cash = `<svg class="lx-cash" viewBox="0 0 220 140" aria-hidden="true">${[0, 1, 2].map(i => `<g transform="translate(${i * 6} ${30 - i * 12}) rotate(${-8 + i * 5} 110 60)"><rect x="10" y="20" width="190" height="90" rx="8" fill="${['#2f6b47', '#3b7d55', '#4a8f64'][i]}" stroke="#bfe3c9" stroke-opacity=".5"/><rect x="22" y="32" width="166" height="66" rx="5" fill="none" stroke="#d8f0de" stroke-opacity=".45" stroke-dasharray="4 3"/><circle cx="105" cy="65" r="20" fill="none" stroke="#e9f7ec" stroke-opacity=".7" stroke-width="2"/><text x="105" y="72" text-anchor="middle" font-family="Georgia, serif" font-size="20" fill="#e9f7ec" fill-opacity=".85">5000</text><text x="38" y="52" font-family="Georgia, serif" font-size="12" fill="#e9f7ec" fill-opacity=".7">5000</text></g>`).join('')}</svg>`;

  return `<!doctype html><html lang="ru"><head>
${head({ title: `${p.name} — ${p.tagline}`, description: p.tagline, image: base + BRAND.og, url: base + '/partner', settings: {}, ld: { '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization', name: BRAND.name, url: base + '/partner', logo: base + BRAND.logo, telephone: tgUser ? undefined : phoneOf(p) }, { '@type': 'WebSite', name: BRAND.name, url: base + '/' }] }, theme: 'studio' })}
<link href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Unbounded:wght@500;600;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
<link rel="stylesheet" href="/css/landing.css?v=${version()}">
</head><body class="landing lx">
${promo ? `<div class="lx-promo" data-promo="${esc(promo.code)}">🎁 Ваш промокод <b>${esc(promo.code)}</b>${promo.offer ? ` — ${esc(promo.offer)}` : Number(promo.discount) ? ` — скидка ${Number(promo.discount)}% на первую оплату` : ''}. Он уже вписан в сообщение — просто нажмите «Подключить».</div>` : ''}
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
        <span id="oDl">Ваша комиссия в месяц</span>
        <b id="oM">? сом</b>
        <div class="lx-more">
          <div><small>С одной квартиры</small><strong id="oOne">—</strong></div>
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

  <!-- Бонус к подписке: личный учёт денег (/money/имя) -->
  <section class="lx-sec lx-money" id="money"><div class="wrap lx-land-in">
    <div class="lx-land-text">
      <div class="lx-kicker">Бонус к подписке</div>
      <h2>Свой учёт денег <span>в подарок</span></h2>
      <p>Вместе с сайтом — личная страница для учёта доходов и расходов. Комиссии, зарплата, траты, долги «кто мне должен», цели на квартиру или машину — всё с телефона.</p>
      <ul class="lx-m-list">
        <li>${CHECK}<span>Доходы и расходы по категориям, лимиты на месяц</span></li>
        <li>${CHECK}<span>Долги: кому дали и у кого взяли, с датой возврата</span></li>
        <li>${CHECK}<span>Цели и кошельки: наличные, карта, $</span></li>
        <li>${CHECK}<span>Под паролем — видите только вы</span></li>
      </ul>
    </div>
    <div class="lx-m-phone" aria-hidden="true"><div class="lx-m-screen">
      <div class="lx-m-top"><small>Ноябрь</small><b>Остаток</b><strong>184 500 сом</strong></div>
      <div class="lx-m-two"><div class="in"><small>Доходы</small><b>+320 000</b></div><div class="out"><small>Расходы</small><b>−135 500</b></div></div>
      <div class="lx-m-row"><i>💼</i><span>Комиссия · ЖК Белек<small>сегодня</small></span><b class="in">+250 000</b></div>
      <div class="lx-m-row"><i>🛒</i><span>Продукты<small>вчера</small></span><b>−4 300</b></div>
      <div class="lx-m-row"><i>⛽</i><span>Бензин<small>вчера</small></span><b>−2 000</b></div>
      <div class="lx-m-row"><i>🤝</i><span>Айбек должен<small>до 30 ноября</small></span><b class="debt">15 000</b></div>
      <div class="lx-m-goal"><span>🎯 На квартиру</span><em><i style="width:38%"></i></em><small>38% · 760 000 из 2 000 000</small></div>
    </div></div>
  </div></section>

  <!-- Порядок: сначала что входит и как подключить, тариф выбирают последним -->
  <section class="lx-sec"><div class="wrap">
    <div class="lx-incl" id="features">
      <div class="lx-incl-head">В любой тариф входит</div>
      <ul>${includes.map(i => `<li>${CHECK}<span>${esc(i)}</span></li>`).join('')}</ul>
    </div>
  </div></section>

  <section class="lx-sec"><div class="wrap">
    <div class="lx-kicker">Как подключить</div>
    <h2>Свой сайт <span>сегодня</span></h2>
    <ol class="lx-steps"><li><b>Выберите тариф ниже</b>Нажмите кнопку — откроется WhatsApp, создадим вам кабинет с логином и паролем</li><li><b>Получите готовые квартиры</b>В кабинете уже будут варианты в рассрочку — поменяйте под себя</li><li><b>Отправляйте свою ссылку</b>Клиенты выбирают квартиру и пишут вам</li></ol>
  </div></section>

  ${pm ? `<section class="lx-sec" id="prices"><div class="wrap">
    <div class="lx-kicker">Стоимость</div>
    <h2>Меньше, чем <span>одна чашка кофе в день</span></h2>
    ${promo ? '' : `<form class="lx-promo-form" id="promoForm"><label>Есть промокод? <input name="code" maxlength="20" autocomplete="off"></label><button class="lx-btn ghost">Применить</button><span class="lx-promo-err" id="promoErr"></span></form>`}
    <div class="lx-tiers">
      ${tier({ name: '1 месяц', per: pm, months: 1, total: pm, save: 0, btn: 'Подключить на месяц' })}
      ${p3 ? tier({ name: '3 месяца', per: per3, months: 3, total: p3, save: save3, btn: 'Подключить на 3 месяца' }) : ''}
      ${p6 ? tier({ name: '6 месяцев', per: per6, months: 6, total: p6, save: save6, btn: 'Подключить на 6 месяцев', best: save6 > 0 }) : ''}
    </div>
  </div></section>` : ''}

  <section class="lx-final"><div class="wrap">
    <h2>Пока вы думаете, клиенты <span>выбирают квартиры у других</span></h2>
    ${waJoin ? `<a class="lx-btn gold big" href="${esc(waJoin)}" target="_blank" rel="noopener">${MSG_ICON}Подключиться в ${msgName}</a>` : ''}
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
    var b = $('oM');
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
    $('oDl').textContent = 'Ваша комиссия за ' + d + ' ' + kv(d) + ' в месяц';
    $('iD').style.setProperty('--p', ((d - 1) / 9 * 100) + '%');
    [].forEach.call(document.querySelectorAll('.lx-chips button'), function (b) { b.classList.toggle('on', ok && b.dataset.v === raw); });
    $('oBox').classList.toggle('wait', !ok);
    if (!ok) {
      shown = {}; prevM = 0;
      $('oM').textContent = '? сом'; $('oOne').textContent = '—'; $('oY').textContent = '—';
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
<script>(function(){var f=document.getElementById("promoForm");if(f){f.addEventListener("submit",function(e){e.preventDefault();var c=(f.code.value||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");if(!c)return;fetch("/api/promo/"+encodeURIComponent(c)).then(function(r){if(r.ok)location.href="/partner?promo="+encodeURIComponent(c);else document.getElementById("promoErr").textContent="Такого промокода нет";});});}var bar=document.querySelector(".lx-promo");if(bar&&navigator.sendBeacon){var code=bar.getAttribute("data-promo");document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href*=\"wa.me\"],a[href*=\"t.me/\"]");if(a)navigator.sendBeacon("/api/promo/"+code+"/click");});}})();</script>
<script src="/js/partner-promo.js?v=${version()}"></script>
</body></html>`;
}

module.exports = { renderComplex, renderIndex, renderApartment, renderGone, renderPrivacy, renderInvalid, renderUnavailable, renderLanding, roomsLabel };
