// Серверный рендер страниц (нужен для SEO и превью ссылок в WhatsApp)
const fs = require('fs');
const path = require('path');
const { money, waLink, roomsLabel } = require('./calc');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = v => JSON.stringify(v).replace(/</g, '\\u003c');

const INDEX_TPL = path.join(__dirname, '..', 'views', 'index.html');
// Версия для сброса кэша CSS/JS: меняется при изменении файлов
const ASSETS = ['css/style.css', 'js/common.js', 'js/app.js', 'js/apartment.js'].map(p => path.join(__dirname, '..', 'public', p));
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

function head({ title, description, image, url, settings }) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
${image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">` : ''}
<meta name="theme-color" content="#f2f1ee">
<script>document.documentElement.classList.add('js');setTimeout(function(){document.documentElement.classList.add('ready','pl-done')},4000)</script>
<link rel="icon" href="/img/logo.png">
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

// Шапка. Верхнее меню и кнопка WhatsApp видны только на ноутбуке (≥1024 px), на телефоне и планшете — нижнее меню.
function header(s, home = false) {
  const p = home ? '' : '/';
  return `<header class="topbar"><div class="wrap">
  <a href="/" class="brand"><img src="/img/logo.png" alt="СК «Кут»" width="50" height="30"><span><b>${esc(s.name)}</b><small>${esc(s.role || '')}</small></span></a>
  <nav class="nav"><a href="${p}#catalog">Квартиры</a><a href="${p}#installment">Рассрочка</a><a href="${p}#reviews-sec">Отзывы</a><a href="${p}#faq-sec">Вопросы</a></nav>
  <a href="${esc(waLink(s.whatsapp, GENERAL_WA))}" class="btn btn-wa head-cta" data-wa="header" target="_blank" rel="noopener">${WA_ICON}WhatsApp</a>
</div></header>`;
}

// Нижнее меню — на телефоне и на ноутбуке. home=true: якоря на главной, иначе ссылки на главную.
function tabbar(s, { home = false, active = '', waText = GENERAL_WA, waPlace = 'tabbar', aptId = '' } = {}) {
  const p = home ? '' : '/';
  const item = (key, href, icon, label) =>
    `<a href="${href}" class="tab${active === key ? ' on' : ''}" data-tab="${key}">${icon}<span>${label}</span></a>`;
  return `<nav class="tabbar" aria-label="Меню">
  ${item('home', home ? '#top' : '/', ICONS.home, 'Главная')}
  ${item('catalog', `${p}#catalog`, ICONS.grid, 'Квартиры')}
  ${item('reviews', `${p}#reviews-sec`, ICONS.star, 'Отзывы')}
  <a href="${esc(waLink(s.whatsapp, waText))}" class="tab tab-wa" id="tabWa" data-wa="${waPlace}"${aptId ? ` data-id="${aptId}"` : ''} target="_blank" rel="noopener">${WA_ICON}<span>WhatsApp</span></a>
</nav>`;
}

function footer(s) {
  const links = [
    s.whatsapp && `<a href="${esc(waLink(s.whatsapp, GENERAL_WA))}" data-wa="footer" target="_blank" rel="noopener">${WA_ICON}WhatsApp</a>`,
    s.instagram && `<a href="${esc(igLink(s))}" target="_blank" rel="noopener">${ICONS.insta}Instagram</a>`,
  ].filter(Boolean).join('');
  const office = s.officeAddress
    ? (s.officeLink ? `<a href="${esc(s.officeLink)}" target="_blank" rel="noopener">${ICONS.pin}${esc(s.officeAddress)}</a>` : `<span>${ICONS.pin}${esc(s.officeAddress)}</span>`)
    : '';
  return `<footer class="footer"><div class="wrap">
  <img src="/img/logo.png" alt="СК «Кут»" class="footer-logo">
  <div class="footer-name">${esc(s.name)} · ${esc(s.role || '')}</div>
  <div class="footer-links">${links}${office}</div>
  <div class="footer-bottom"><a href="/privacy">Политика конфиденциальности</a><span>© ${new Date().getFullYear()}</span></div>
</div></footer>`;
}

function scripts(s, extra = {}, files = ['common']) {
  return `<script>window.__DATA__=${json({ settings: publicSettings(s), waIcon: WA_ICON, icons: ICONS, ...extra })}</script>
${files.map(f => `<script src="/js/${f}.js?v=${version()}"></script>`).join('\n')}`;
}

function renderIndex(settings, apartments, base) {
  const tpl = fs.readFileSync(INDEX_TPL, 'utf8');
  const s = settings;
  const description = `${s.tagline}. Подбор квартир по первоначальному взносу и ежемесячному платежу.`;
  return tpl
    .replace('<!--HEAD-->', head({ title: `${s.name} — ${s.tagline}`, description, image: s.photo ? base + s.photo.replace(/\.webp$/, '-og.jpg') : null, url: base + '/', settings: s }))
    .replace('<!--HEADER-->', header(s, true))
    .replace('<!--FOOTER-->', footer(s) + tabbar(s, { home: true, active: 'home' }))
    .replace('<!--SCRIPTS-->', scripts(s, { apartments }, ['common', 'app']));
}

function miniCard(a) {
  return `<a class="mini" href="${a.url}">
  ${a.photos[0] ? `<img src="${a.photos[0].thumb}" alt="" loading="lazy">` : '<div class="ph"></div>'}
  <div><b>${a.roomsLabel}, ${a.area} м²</b><span>${a.installment ? `${money(a.monthly, a.currency)} / мес` : money(a.price, a.currency)}</span></div></a>`;
}

function renderApartment(a, settings, similar, base) {
  const s = settings;
  const cur = a.currency;
  const title = `${a.roomsLabel}, ${a.area} м² — ${money(a.price, cur)}${a.installment ? `, от ${money(a.monthly, cur)}/мес` : ''}`;
  const desc = [a.title, a.address, a.installment ? `Взнос от ${money(a.down, cur)}, рассрочка ${a.months} мес.` : a.type === 'cash' ? 'Оплата наличными' : '100% оплата'].filter(Boolean).join(' · ');
  const wa = waLink(s.whatsapp, a.waText);

  const gallery = a.photos.length
    ? a.photos.map((p, i) => `<img src="${p.src}" alt="Фото ${i + 1}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}>`).join('')
    : '<div class="ph big"></div>';

  // Калькулятор: клиент может внести больше минимального взноса — платёж в месяц уменьшится
  const calc = a.installment ? `
    <section class="calc" id="calc">
      <div class="calc-main">
        <span>Платёж в месяц</span>
        <b id="cMonthly">${money(a.monthly, cur)}</b>
        <small id="cTerm">${a.months} мес. рассрочки</small>
      </div>
      <div class="calc-down">
        <div class="field-head"><label for="cDownInput">Первоначальный взнос</label><span class="calc-min">мин. ${money(a.down, cur)}</span></div>
        <div class="calc-input"><input id="cDownInput" type="text" inputmode="numeric" value="${money(a.down, '')}" aria-label="Первоначальный взнос"><span>${esc(cur)}</span></div>
        <input type="range" id="cDown" class="range" aria-label="Первоначальный взнос">
        <p class="calc-hint" id="cHint">Внесите больше — платёж в месяц станет меньше</p>
      </div>
      <dl class="calc-rows">
        <div><dt>Цена квартиры</dt><dd>${money(a.price, cur)}</dd></div>
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
        <p class="co-hint" id="coHint">Если внести ${money(a.cash.price, cur)} сразу — квартира ваша без рассрочки и дешевле</p>
        <a class="btn btn-wa co-btn" id="cashWa" href="${esc(waLink(s.whatsapp, a.cash.waText))}" data-wa="apartment-cash" data-id="${a.id}" target="_blank" rel="noopener">${WA_ICON}Хочу купить за наличные</a>
      </div>` : ''}
    </section>` : `
    <section class="calc">
      <div class="calc-main"><span>${a.type === 'cash' ? 'Цена · оплата наличными' : 'Цена при 100% оплате'}</span><b>${money(a.price, cur)}</b><small>${money(a.pricePerM2, cur)} за м²</small></div>
    </section>`;

  const rows = [
    ['Оплата', a.installment ? `Рассрочка, ${a.months} мес.` : 'Наличными'],
    ['Комнаты', a.roomsLabel],
    ['Площадь', `${a.area} м²`],
    a.floorFrom && ['Этаж', `от ${a.floorFrom} этажа и выше`],
    a.floors && ['Этажность дома', `${a.floors}`],
    a.address && ['Адрес', a.address],
  ].filter(Boolean);

  return `<!doctype html><html lang="ru"><head>
${head({ title, description: desc, image: a.photos[0] ? base + a.photos[0].og : null, url: base + a.url, settings: s })}
</head><body class="apt-page">
${header(s)}
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
      ${a.floorFrom ? `<span>${ICONS.floor}от ${a.floorFrom} эт.${a.floors ? ` из ${a.floors}` : ''}</span>` : ''}
    </div>
    ${calc}
    <a class="btn btn-wa btn-lg apt-cta" id="aptWa" href="${esc(wa)}" data-wa="apartment" data-id="${a.id}" target="_blank" rel="noopener">${WA_ICON}Хочу эту квартиру</a>
    <section class="specs"><h2>Характеристики</h2>
      <dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    </section>
    ${a.details ? `<section class="details"><h2>Детали</h2><p>${esc(a.details).replace(/\n/g, '<br>')}</p></section>` : ''}
  </div>
  ${a.map.embed ? `<section class="map"><h2>На карте</h2>
    <iframe loading="lazy" title="Карта" src="${esc(a.map.embed)}" referrerpolicy="no-referrer-when-downgrade"></iframe>
    ${a.map.link ? `<a class="btn btn-ghost map-open" href="${esc(a.map.link)}" target="_blank" rel="noopener">${ICONS.pin}Открыть в Google Картах</a>` : ''}
  </section>` : ''}
  ${similar.length ? `<section class="similar"><h2>Похожие квартиры</h2><div class="mini-list">${similar.map(miniCard).join('')}</div></section>` : ''}
</main>
${footer(s)}
${tabbar(s, { active: 'catalog', waText: a.waText, waPlace: 'apartment-tab', aptId: a.id })}
${scripts(s, { apartment: a, base }, ['common', 'apartment'])}
</body></html>`;
}

function renderGone(settings, similar, base, reason) {
  const s = settings;
  return `<!doctype html><html lang="ru"><head>
${head({ title: `Квартира ${reason} — ${s.name}`, description: 'Посмотрите похожие квартиры в продаже', url: base + '/', settings: s })}
<meta name="robots" content="noindex">
</head><body class="apt-page">
${header(s)}
<main class="wrap gone">
  <h1>Эта квартира уже ${reason}</h1>
  <p>Но есть похожие варианты — или напишите, и я подберу вручную.</p>
  ${similar.length ? `<div class="mini-list">${similar.map(miniCard).join('')}</div>` : ''}
  <a class="btn btn-wa btn-lg" href="${esc(waLink(s.whatsapp, 'Здравствуйте! Квартира, которую я смотрел(а), уже продана. Подберите, пожалуйста, похожую.'))}" data-wa="gone" target="_blank" rel="noopener">${WA_ICON}Подберу вручную</a>
</main>
${footer(s)}
${tabbar(s, { active: 'catalog' })}
${scripts(s)}
</body></html>`;
}

function renderPrivacy(s, base) {
  return `<!doctype html><html lang="ru"><head>
${head({ title: `Политика конфиденциальности — ${s.name}`, description: 'Политика конфиденциальности', url: base + '/privacy', settings: s })}
</head><body class="apt-page">
${header(s)}
<main class="wrap gone"><h1>Политика конфиденциальности</h1><p>${esc(s.privacy).replace(/\n/g, '<br>')}</p></main>
${footer(s)}
${tabbar(s)}
${scripts(s)}
</body></html>`;
}

module.exports = { renderIndex, renderApartment, renderGone, renderPrivacy, roomsLabel };

