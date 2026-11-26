// Главная страница: наполнение блоков, фильтр и калькулятор
(function () {
  const { S, money, esc, wa } = window.RS;
  const L = window.RS.t, plural = (k, n) => window.RS.plural(k, n); // тексты на языке страницы (lib/i18n.js)
  const D = window.__DATA__;
  const APTS = D.apartments;
  const $ = id => document.getElementById(id);
  const lines = t => String(t || '').split('\n').map(s => s.trim()).filter(Boolean);
  const blocks = t => String(t || '').split(/\n\s*\n/).map(b => lines(b)).filter(b => b.length);

  // ---------- Контент ----------
  const I = D.icons;
  // Последние 1–3 слова заголовка выделены акцентом; каждое слово обёрнуто для анимации «выезда снизу»
  const words = String(S.tagline || '').split(' ').filter(Boolean);
  const cut = Math.max(1, words.length - (words.length > 4 ? 3 : 1));
  $('heroTitle').innerHTML = words.map((w, i) =>
    `<span class="w${i >= cut ? ' hl' : ''}"><span style="--i:${i}">${esc(w)}</span></span>`).join(' ');
  const role = String(S.role || '');
  $('badgeName').textContent = S.name;
  $('badgeRole').textContent = S.role || '';
  $('heroPhoto').innerHTML = S.photo
    ? `<img src="${esc(S.photo)}" alt="${esc(S.name)}" fetchpriority="high">`
    : `<div class="hero-initials">${esc(S.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2))}</div>`;
  // Нижний блок «Выберите квартиру — и напишите» заполняет сервер (одинаковый у всех менеджеров)
  $('heroKicker').textContent = S.heroKicker || '';
  $('heroKicker').hidden = !S.heroKicker;
  $('heroPoints').innerHTML = lines(S.heroPoints).map(p => `<li>${esc(p)}</li>`).join('');
  if (S.officeAddress) {
    $('officeAddr').textContent = S.officeAddress;
    if (S.officeLink) $('office').href = S.officeLink; else $('officeLinkText').remove();
  } else $('office').remove();

  const STAT_ICONS = [
    '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    '<path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/><path d="M7 10v12"/>',
    '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    '<path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z"/>',
  ];
  const stats = lines(S.stats).map(l => l.split('|').map(x => x.trim()));
  $('stats').innerHTML = stats.map(([v, l], i) =>
    `<div class="stat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${STAT_ICONS[i % STAT_ICONS.length]}</svg><div><b>${esc(v)}</b><span>${esc(l || '')}</span></div></div>`).join('');

  // Нечего показать (нет офиса, Instagram и цифр) — блок «Где нас найти» убираем целиком
  if (!S.officeAddress && !S.instagram && !stats.length && $('about')) $('about').remove();

  $('steps').innerHTML = lines(S.steps).map(s => `<li>${esc(s)}</li>`).join('');
  const docs = lines(S.documents);
  if (docs.length) $('docs').innerHTML = docs.map(s => `<li>${esc(s)}</li>`).join('');
  else $('docsWrap').remove();

  const reviews = blocks(S.reviews);
  if (reviews.length) {
    // Первая строка отзыва: «Имя | дата»
    $('reviews').innerHTML = reviews.map(([head, ...text]) => {
      const [who, date] = head.split('|').map(x => x.trim());
      return `<figure class="review">
        <div class="stars" aria-label="${L('stars')}">★★★★★</div>
        <blockquote>${esc(text.join(' '))}</blockquote>
        <figcaption><span class="avatar">${esc((who || '?')[0])}</span><span><b>${esc(who)}</b>${date ? `<small>${esc(date)}</small>` : ''}</span></figcaption>
      </figure>`;
    }).join('');
  } else $('reviews-sec').remove();

  // Новости «Скоро»: длинный текст сворачиваем до 3 строк и показываем кнопку «Читать подробнее».
  // Текст помещается целиком — кнопки нет. Без скрипта текст виден полностью.
  document.querySelectorAll('.news-card').forEach(card => {
    const p = card.querySelector('.news-text'), btn = card.querySelector('.news-more');
    if (!p || !btn) return;
    const fit = () => {
      if (btn.getAttribute('aria-expanded') === 'true') return;
      p.classList.add('is-clamped');
      const long = p.scrollHeight > p.clientHeight + 2;
      p.classList.toggle('is-clamped', long);
      btn.hidden = !long;
    };
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      p.classList.toggle('is-clamped', !open);
      btn.textContent = L(open ? 'newsLess' : 'newsMore');
    });
    fit();
    window.addEventListener('load', fit, { once: true }); // шрифт догрузился — высота текста могла измениться
  });

  // «Скоро» с фото на фоне (компьютер, планшет): несколько новостей — фон и карточка сменяются каждые 4 секунды.
  // Мышка на карточке или фокус внутри — пауза (чтобы дочитать); точки внизу — переключить вручную.
  const newsSec = document.querySelector('.news-cover');
  if (newsSec) {
    const cards = [...newsSec.querySelectorAll('.news-card')], bgs = [...newsSec.querySelectorAll('.news-bg')], dots = [...newsSec.querySelectorAll('.news-dots button[data-i]')];
    if (cards.length > 1) {
      let cur = 0, hold = false;
      const wide = window.matchMedia('(min-width: 640px)');
      const show = k => {
        cur = (k + cards.length) % cards.length;
        [cards, bgs, dots].forEach(list => list.forEach((el, j) => el.classList.toggle('on', j === cur)));
        // «Читать подробнее»: у скрытой карточки высоту текста не измерить — проверяем, когда она показана
        const p = cards[cur].querySelector('.news-text'), b = cards[cur].querySelector('.news-more');
        if (p && b && b.getAttribute('aria-expanded') !== 'true') { p.classList.add('is-clamped'); const long = p.scrollHeight > p.clientHeight + 2; p.classList.toggle('is-clamped', long); b.hidden = !long; }
      };
      // Сами — каждые 4 секунды; листнули вручную (стрелки, точки, свайп) — отсчёт заново
      let timer = null;
      const restart = () => { clearInterval(timer); timer = setInterval(() => { if (!hold && !document.hidden && wide.matches) show(cur + 1); }, 4000); };
      restart();
      const go = k => { show(k); restart(); };
      // Свайп пальцем по блоку (планшет): влево — следующая, вправо — предыдущая
      let x0 = null, y0 = 0;
      newsSec.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
      newsSec.addEventListener('touchend', e => {
        if (x0 === null || !wide.matches) return;
        const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
        x0 = null;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(cur + (dx < 0 ? 1 : -1));
      });
      const box = newsSec.querySelector('.news');
      box.addEventListener('pointerenter', () => { hold = true; });
      box.addEventListener('pointerleave', () => { hold = false; });
      box.addEventListener('focusin', () => { hold = true; });
      box.addEventListener('focusout', () => { hold = false; });
      const dotsBox = newsSec.querySelector('.news-dots');
      if (dotsBox) dotsBox.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.step) go(cur + +b.dataset.step); else go(+b.dataset.i); });
    }
  }

  $('faq').innerHTML = blocks(S.faq).map(([q, ...a]) =>
    `<details><summary>${esc(q)}</summary><p>${esc(a.join(' '))}</p></details>`).join('');

  // ---------- Фильтр ----------
  // Новостройки — рассрочка в сомах: платёж = (цена − взнос) / срок.
  // Клиент указывает, сколько готов внести и платить; для каждой квартиры считаем взнос и платёж.
  // Вторичка — наличные в долларах, без рассрочки.
  const nice = x => {
    if (x <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(x)));
    return [1, 2, 5, 10].map(m => m * p).find(v => v >= x);
  };
  const bounds = (vals, steps = 100) => {
    vals = vals.filter(v => v != null);
    if (!vals.length) return { min: 0, max: 0, step: 1 };
    const step = nice((Math.max(...vals) - Math.min(...vals)) / steps || 1);
    // Шаг 0.1 или 0.2: компьютер считает дроби неточно (20.700000000000003) — округляем до знаков шага
    const r = v => +v.toFixed(Math.max(0, -Math.floor(Math.log10(step))));
    return { min: r(Math.floor(Math.min(...vals) / step) * step), max: r(Math.ceil(Math.max(...vals) / step) * step), step };
  };
  // Границы с заданным шагом: ползунок «Мой первоначальный взнос» двигается ровно по 100 000
  const fixedBounds = (vals, step) => {
    vals = vals.filter(v => v != null);
    if (!vals.length) return { min: 0, max: 0, step };
    return { min: Math.floor(Math.min(...vals) / step) * step, max: Math.ceil(Math.max(...vals) / step) * step, step };
  };
  const DOWN_STEP = 100000;
  const monthlyAt = (a, d) => (a.price <= d ? 0 : Math.ceil((a.price - d) / a.months));
  // Наличные и участки — одна цена в $, без рассрочки; у участков площадь в сотках
  const cashLike = t => t === 'cash' || t === 'land';
  const TYPE_ORDER = ['installment', 'commercial', 'cash', 'land'];
  const cur = type => (cashLike(type) ? S.currencyCash || '$' : S.currencyInstallment || 'сом');

  const st = { type: 'installment' };
  let B;
  // Город: null — город не выбран (на сайте квартиры одного города). Всё остальное в фильтре (ползунки, комнаты) считается по квартирам выбранного города.
  st.city = null;
  const ofType = () => APTS.filter(a => a.type === st.type && (!st.city || a.city === st.city));

  function reset() {
    const L = ofType();
    const inst = L.filter(a => a.installment);
    B = {
      down: fixedBounds(inst.map(a => a.down).concat(inst.map(a => a.price)), DOWN_STEP),
      monthly: bounds(inst.map(a => a.monthly).concat([0])),
      area: bounds(L.map(a => a.area), 60),
    };
    Object.assign(st, {
      down: null, monthly: null, // null — не задано («любой»)
      area: [B.area.min, B.area.max], rooms: new Set(),
    });
  }

  // Взнос и платёж, которые покажем клиенту по этой квартире, или null, если не подходит
  function offer(a) {
    if (!a.installment) return { down: a.price, monthly: 0 };
    let d = a.down;
    if (st.monthly != null) d = Math.max(d, a.price - st.monthly * a.months); // сколько внести, чтобы уложиться в платёж
    else if (st.down != null) d = Math.max(d, Math.min(st.down, a.price));    // вносит всю готовую сумму
    d = Math.min(Math.round(d), a.price);
    if (st.down != null && d > st.down) return null;
    return { down: d, monthly: monthlyAt(a, d) };
  }

  // Левый край ползунка «Платёж в месяц до» — самый маленький платёж, который реально возможен:
  // клиент вносит выбранную сумму (не больше цены), считаем платёж по каждой подходящей квартире и берём минимум.
  // Квартиры, где выбранного взноса меньше минимального, не учитываем. Округляем вверх до шага ползунка,
  // чтобы на самом краю хотя бы одна квартира точно подходила.
  function minMonthly() {
    const L = ofType().filter(a => a.installment && match(a) && (st.down == null || st.down >= a.down));
    if (!L.length) return B.monthly.min;
    const m = Math.min(...L.map(a => monthlyAt(a, st.down == null ? a.price : Math.min(st.down, a.price))));
    const s = B.monthly.step;
    return Math.min(B.monthly.max, Math.ceil(m / s) * s);
  }
  function syncMonthly() {
    const min = minMonthly();
    fMonthly.min = min;
    if (st.monthly != null && st.monthly < min) st.monthly = min; // взнос изменился — платёж не ниже возможного
    fMonthly.value = st.monthly ?? B.monthly.max;
  }

  function setupRange(el, b, val) { el.min = b.min; el.max = b.max; el.step = b.step; el.value = val; }
  function paintRange(el) {
    const p = ((el.value - el.min) / (el.max - el.min || 1)) * 100;
    el.style.setProperty('--p', p + '%');
  }
  function paintDual(wrap, [lo, hi], b) {
    const span = b.max - b.min || 1;
    wrap.style.setProperty('--lo', ((lo - b.min) / span) * 100 + '%');
    wrap.style.setProperty('--hi', ((hi - b.min) / span) * 100 + '%');
  }

  const fDown = $('fDown'), fMonthly = $('fMonthly');
  const [aLo, aHi] = $('fArea').querySelectorAll('input');

  function syncInputs() {
    setupRange(fDown, B.down, st.down ?? B.down.max);
    setupRange(fMonthly, B.monthly, st.monthly ?? B.monthly.max);
    setupRange(aLo, B.area, st.area[0]); setupRange(aHi, B.area, st.area[1]);
    $('fType').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === st.type));
    $('fRooms').querySelectorAll('button').forEach(b => b.classList.toggle('on', st.rooms.has(b.dataset.v)));
    // Коммерция считается как рассрочка: те же ползунки взноса и платежа, только без комнат
    const isNew = !cashLike(st.type);
    $('fDownWrap').hidden = !isNew;
    $('fMonthlyWrap').hidden = !isNew;
    $('fRoomsWrap').hidden = st.type === 'commercial' || st.type === 'land';
    const land = st.type === 'land';
    $('lArea').textContent = L(land ? 'areaSot' : 'areaM2');
    $('sortPpm').textContent = L(land ? 'sortPpmLand' : 'sortPpm');
    drawQuick();
  }

  // ---------- Быстрые суммы: «до 500 тыс», «до 1 млн», … ----------
  // Кнопки строятся по квартирам выбранной категории: примерно четверть, половина и большинство квартир подходят.
  // Нажатие ставит сумму так же, как ползунок; ползунок остаётся ниже для точной суммы.
  const shortMoney = n => (n >= 1e6
    ? `${(n / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ${L('million')}`
    : `${Math.round(n / 1e3)} ${L('thousand')}`);
  // Округление вверх до ровной суммы: до 100 тыс — по 10 тыс, до 1 млн — по 50 тыс, дальше — по 250 тыс
  const niceUp = x => {
    const step = x < 1e5 ? 1e4 : x < 1e6 ? 5e4 : 2.5e5;
    return Math.ceil(x / step) * step;
  };
  function quickValues(vals, qs) {
    vals = vals.filter(v => v > 0).sort((a, b) => a - b);
    if (vals.length < 2) return [];
    return [...new Set(qs.map(q => niceUp(vals[Math.floor(q * (vals.length - 1))])))];
  }
  const QUICK = { down: 'qDown', monthly: 'qMonthly' };
  function drawQuick() {
    const inst = ofType().filter(a => a.installment);
    // Платёж в месяц — суммы пониже (люди чаще ищут недорогой платёж): примерно 15%, 40% и 70% квартир подходят
    const vals = { down: quickValues(inst.map(a => a.down), [0.25, 0.5, 0.8]), monthly: quickValues(inst.map(a => a.monthly), [0.15, 0.4, 0.7]) };
    for (const key in QUICK) {
      const box = $(QUICK[key]);
      box.innerHTML = vals[key].map(v => `<button type="button" data-v="${v}">${esc(L('quickUpTo', { x: shortMoney(v) }))}</button>`).join('')
        + `<button type="button" data-v="">${esc(L('anySum'))}</button>`;
      box.hidden = !vals[key].length;
      box.nextElementSibling.hidden = !vals[key].length; // «Или выберите точную сумму»
    }
    markQuick();
  }
  function markQuick() {
    for (const key in QUICK) {
      $(QUICK[key]).querySelectorAll('button').forEach(b =>
        b.classList.toggle('on', b.dataset.v === '' ? st[key] == null : +b.dataset.v === st[key]));
    }
  }
  for (const key in QUICK) {
    $(QUICK[key]).addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const v = b.dataset.v === '' ? null : +b.dataset.v;
      st[key] = v;
      const range = key === 'down' ? fDown : fMonthly;
      range.value = v == null ? B[key].max : v;
      update();
    });
  }

  fDown.addEventListener('input', () => { st.down = +fDown.value >= B.down.max ? null : +fDown.value; update(); });
  fMonthly.addEventListener('input', () => { st.monthly = +fMonthly.value >= B.monthly.max ? null : +fMonthly.value; update(); });
  function dual(lo, hi, key) {
    const on = which => () => {
      let a = +lo.value, b = +hi.value;
      if (a > b) { if (which === 'lo') a = b; else b = a; lo.value = a; hi.value = b; }
      st[key] = [a, b];
      update();
    };
    lo.addEventListener('input', on('lo'));
    hi.addEventListener('input', on('hi'));
  }
  dual(aLo, aHi, 'area');

  $('fType').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.dataset.v === st.type) return;
    st.type = b.dataset.v; reset(); syncInputs(); update();
  });
  $('fRooms').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const v = b.dataset.v;
    st.rooms.has(v) ? st.rooms.delete(v) : st.rooms.add(v);
    b.classList.toggle('on', st.rooms.has(v));
    fitArea();
    update();
  });
  $('fReset').addEventListener('click', () => { reset(); syncInputs(); update(); });
  $('sort').addEventListener('change', update);
  // Аналитика: посетитель пользовался фильтром (один раз за визит страницы)
  ['input', 'click'].forEach(t => $('filter').addEventListener(t, () => window.RS.once('filter')));

  // Нажатие на фото в карточке — просмотр всех фото на весь экран (остальная карточка ведёт на страницу квартиры)
  $('cards').addEventListener('click', e => {
    const ph = e.target.closest('.card-photo');
    if (!ph || !ph.querySelector('img') || ph.classList.contains('zk-photo')) return; // фото ЖК — ведёт на страницу ЖК
    e.preventDefault();
    const a = APTS.find(x => String(x.id) === ph.dataset.id);
    if (!a) return;
    const link = ph.closest('.card-link');
    window.RS.lightbox(a.photos.map(p => p.src), +(ph.dataset.i || 0), {
      href: link && link.getAttribute('href'),
      label: L({ commercial: 'moreCommercial', land: 'moreLand' }[a.type] || 'moreApartment'),
    });
  });

  // Отдельной кнопки «Студия» нет: студии показываются вместе с однокомнатными; 4 и больше — кнопка «4+»
  const roomKey = a => (a.rooms >= 4 ? '4' : a.rooms <= 1 ? '1' : String(a.rooms));
  const roomsOk = a => !st.rooms.size || st.rooms.has(roomKey(a));

  function match(a) {
    if (a.area < st.area[0] || a.area > st.area[1]) return false;
    if (!roomsOk(a)) return false;
    return true;
  }

  // Ползунок площади подстраивается под выбранные комнаты: края — самая маленькая и самая большая
  // площадь среди квартир с этим числом комнат. Выбор комнат меняется — площадь снова на всю ширину.
  function fitArea() {
    const L = ofType().filter(roomsOk);
    B.area = bounds((L.length ? L : ofType()).map(a => a.area), 60);
    st.area = [B.area.min, B.area.max];
    setupRange(aLo, B.area, st.area[0]); setupRange(aHi, B.area, st.area[1]);
  }

  const SORTS = {
    monthly: (a, b) => a.o.monthly - b.o.monthly || a.price - b.price,
    down: (a, b) => a.o.down - b.o.down,
    ppm: (a, b) => a.pricePerM2 - b.pricePerM2,
  };

  const tagCls = t => ((t === 'Скидка' || t === 'Арзандатуу') ? ' tag-sale' : t === L('tagInstallment') ? ' tag-inst' : '');

  function card(a) {
    const c = a.currency;
    // На главной в карточке одно (главное) фото — не листается; по нажатию все фото открываются на весь экран
    const photo = a.photos.length
      ? `<div class="cp-track"><img src="${a.photos[0].thumb}" alt="" loading="lazy"></div>`
      : '<div class="ph"></div>';
    const url = a.installment && a.o.down !== a.down ? `${a.url}?down=${a.o.down}` : a.url;
    const main = a.installment
      ? `<div class="card-price"><b>${money(a.o.monthly, c)}</b><span>${L('perMonth')}</span></div>`
      : `<div class="card-price"><b>${money(a.price, c)}</b><span>${L(cashLike(a.type) ? 'cashWord' : 'fullPay')}</span></div>`;
    // Главное о рассрочке — одной фразой: «Внесёте 800 000 сом → дальше 81 000 сом в месяц, 24 мес.»
    const pay = a.installment
      ? `<p class="pay-line">${L('payLineHtml', { down: money(a.o.down, c), monthly: money(a.o.monthly, c), n: a.months })}</p>
        <div class="price-line">${esc(L('priceLine', { x: money(a.price, c) }))}</div>`
      : '';
    // Строки взноса и платежа в сообщении — под выбранный в фильтре взнос
    const text = a.installment ? replacePay(a.waText, money(a.o.down, c), L('waMonthlyFor', { x: money(a.o.monthly, c), n: a.months })).replace(a.url, url) : a.waText;
    return `<article class="card">
      <a class="card-link" href="${url}">
        <div class="card-photo" data-id="${a.id}">${photo}<div class="tags">${a.tags.map(t => `<span class="tag${tagCls(t)}">${esc(t)}</span>`).join('')}</div></div>
        <div class="card-body">
          ${main}
          <div class="card-title">${a.roomsLabel}, ${a.area} ${a.unit}</div>
          ${a.title ? `<div class="card-zk">${esc(a.title)}</div>` : ''}
          ${a.address || a.district ? `<div class="card-addr">${I.pin}${esc([a.district, String(a.address || '').replace(/[​-‍⁠﻿]/g, '').trim()].filter(x => x && !/^https?:/i.test(x)).join(' · '))}</div>` : ''}
          ${pay}
          <div class="feats">
            ${''/* комнаты и площадь уже есть в названии карточки — здесь не повторяем */}
            ${a.floorFrom ? `<span>${I.floor}${L('fromFloor', { f: a.floorFrom })}</span>` : ''}
            <span class="feats-ppm">${money(a.pricePerM2, c)}/${L(a.type === 'land' ? 'perSot' : 'perM2')}</span>
          </div>
        </div>
      </a>
      <div class="card-actions"><a class="btn btn-wa btn-want" href="${esc(wa(text))}" data-wa="card" data-id="${a.id}" target="_blank" rel="noopener">${D.waIcon}${L({ commercial: 'wantCommercial', land: 'wantLand' }[a.type] || 'wantApartment')}</a></div>
    </article>`;
  }

  // ---------- ЖК (как на elitka.kg): одна карточка на объект; нажали — открылась страница ЖК со всеми его квартирами ----------
  // Ключ ЖК — адрес его страницы (a.zk, считает сервер): «Алтай Голд» и «ЖК «Алтай Голд»» — один ЖК
  const zkClean = s => String(s || '').replace(/[​-‍⁠﻿]/g, '').replace(/\s+/g, ' ').trim();
  const objKey = a => `${a.zk || a.url}|${a.city || ''}`;
  const topOf = list => { const n = new Map(); list.filter(Boolean).forEach(x => n.set(x, (n.get(x) || 0) + 1)); return ([...n.entries()].sort((a, b) => b[1] - a[1])[0] || [''])[0]; };
  function groupObjs(list) {
    const m = new Map();
    list.forEach(a => { const k = objKey(a); if (!m.has(k)) m.set(k, []); m.get(k).push(a); });
    return [...m.values()];
  }
  // Район и адрес ЖК: самые частые среди его квартир (ссылку на карту вместо адреса не показываем)
  const placeOf = g => [topOf(g.map(a => a.district)), topOf(g.map(a => zkClean(a.address)).filter(x => !/^https?:/i.test(x)))].filter(Boolean).join(' · ');
  function objCard(g) {
    const a0 = g[0], c = a0.currency;
    // Только фото ЖК (здание снаружи), без планировок; без повторов
    const seenPh = new Set(), photos = [];
    g.forEach(a => a.photos.forEach(p => { if (p.zk && !seenPh.has(p.src) && photos.length < 1) { seenPh.add(p.src); photos.push(p); } }));
    const photo = photos.length
      ? `<div class="cp-track">${photos.map(p => `<img src="${p.thumb}" alt="" loading="lazy">`).join('')}</div>
`
      : '<div class="ph"></div>';
    const main = a => (a.installment ? a.o.monthly : a.price);
    const best = g.reduce((x, a) => (main(a) < main(x) ? a : x), g[0]);
    const unitWord = a0.installment ? L('perMonth') : '';
    // Варианты по комнатам: «1-комн. от 42 м² ······ от 45 000 сом / мес»
    const kinds = new Map();
    g.forEach(a => { const k = a.roomsLabel; const x = kinds.get(k) || { rooms: a.rooms, area: Infinity, v: Infinity }; x.area = Math.min(x.area, a.area); x.v = Math.min(x.v, main(a)); kinds.set(k, x); });
    const rows = [...kinds.entries()].sort((x, y) => x[1].rooms - y[1].rooms)
      .map(([k, x]) => `<li><span class="ok-k">${esc(k)} <small>${L('objFrom', { x: `${+x.area.toFixed(1)} ${a0.unit}` })}</small></span><i></i><b>${L('objFrom', { x: money(x.v, c) })}${unitWord ? ` <small>${unitWord}</small>` : ''}</b></li>`).join('');
    const years = [...new Set(g.flatMap(a => (a.stages || []).map(x => x.y)))].sort();
    const tag = years.length > 1
      ? `<span class="tag">${esc(L('handover', { x: years.join(` ${L('hoAnd')} `) }))}</span>`
      : a0.zkTag ? `<span class="tag">${esc(a0.zkTag)}</span>`
      : a0.handover ? `<span class="tag">${esc(a0.tags.find(t => t.includes(a0.handover)) || a0.handover)}</span>` : '';
    const place = placeOf(g);
    const name = a0.title || a0.address || L('objOther');
    // Куда ведёт карточка ЖК — с учётом фильтра:
    //  • под фильтр подходит одна квартира (или у ЖК нет названия) — сразу на неё, с выбранным взносом;
    //  • подходят не все квартиры ЖК — на страницу ЖК только с ними (ids), там есть «Показать все»;
    //  • подходят все — на страницу ЖК.
    const aptHref = a => (a.installment && a.o.down !== a.down ? `${a.url}?down=${a.o.down}` : a.url);
    const total = APTS.filter(x => x.zk === a0.zk && x.type === a0.type).length;
    const down = a0.installment && st.down != null ? `&down=${st.down}` : '';
    const href = !a0.zk || g.length === 1 ? aptHref(a0)
      : g.length < total ? `${a0.zk}?t=${encodeURIComponent(st.type)}&ids=${g.map(a => a.id).join('.')}${down}`
        : `${a0.zk}?t=${encodeURIComponent(st.type)}${down}`;
    return `<a class="zk" href="${esc(href)}">
        <div class="card-photo zk-photo">${photo}<div class="tags">${tag}</div></div>
        <div class="zk-body">
          <h3 class="zk-name">${esc(name)}</h3>
          ${place && place !== name ? `<div class="zk-addr">${I.pin}<span>${esc(place)}</span></div>` : ''}
          <div class="zk-price">${L('objFrom', { x: `<b>${money(main(best), c)}</b>` })}${unitWord ? ` <span>${unitWord}</span>` : ''}</div>
          ${kinds.size > 1 ? `<ul class="zk-kinds">${rows}</ul>` : `<div class="zk-one">${esc(a0.roomsLabel)} · ${L('objFrom', { x: `${+Math.min(...g.map(a => a.area)).toFixed(1)} ${a0.unit}` })}</div>`}
        </div>
    </a>`;
  }
  function drawObjs(list) {
    const box = $('cards');
    box.classList.add('zk-view');
    // У ЖК нет фото дома — пустую карточку ЖК не показываем: сразу его квартиры (с планировками), как при фильтре
    box.innerHTML = groupObjs(list).map(g => (g.some(a => a.photos.some(p => p.zk)) ? objCard(g) : g.map(card).join(''))).join('');
  }

  // Подменить в сообщении строки «Взнос: …» и «В месяц: …» (их начала — в словаре: waDown, waMonthly)
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function replacePay(text, down, monthly) {
    const re = new RegExp(`${escRe(L('waDown'))}[^\\n]*\\n${escRe(L('waMonthly'))}[^\\n]*`);
    return text.replace(re, `${L('waDown')}${down}\n${L('waMonthly')}${monthly}`);
  }

  let lastCount = 0;
  function update() {
    const c = cur(st.type);
    if (!cashLike(st.type)) syncMonthly();
    const u = L(st.type === 'land' ? 'perSot' : 'perM2');
    $('oDown').textContent = st.down == null ? L('any') : money(st.down, c);
    $('oMonthly').textContent = st.monthly == null ? L('any') : L('upTo', { x: money(st.monthly, c) });
    const n = v => +(+v).toFixed(1); // площадь — не больше одного знака после точки
    $('oArea').textContent = st.area[0] === st.area[1] ? `${n(st.area[0])} ${u}` : `${n(st.area[0])} – ${n(st.area[1])} ${u}`;
    [fDown, fMonthly].forEach(paintRange);
    paintDual($('fArea'), st.area, B.area);
    markQuick();

    const list = ofType().filter(match)
      .map(a => ({ ...a, o: offer(a) }))
      .filter(a => a.o)
      .sort(SORTS[$('sort').value]);
    const wordsKey = { commercial: 'wordsCommercial', land: 'wordsLand' }[st.type] || 'wordsApartment';
    $('count').textContent = L('found', { n: list.length, word: plural(wordsKey, list.length) });
    // Сводка выбора на кнопке «Подобрать» и число на кнопке листа
    if ($('fSum')) {
      const parts = [
        st.down != null && L('fDownTo', { x: money(st.down, c) }),
        st.monthly != null && L('fMonthlyTo', { x: money(st.monthly, c) }),
        st.rooms.size && L('fRoomsSel', { x: [...st.rooms].sort().map(r => (r === '4' ? '4+' : r)).join(', ') }),
        B && B.area && (st.area[0] > B.area.min || st.area[1] < B.area.max) && L('fAreaSel', { a: n(st.area[0]), b: n(st.area[1]) }),
      ].filter(Boolean);
      $('fSum').textContent = parts.join(' · ') || L('fAll');
      $('fBadge').hidden = !parts.length;
      $('fBadge').textContent = parts.length;
      $('fDone').textContent = L('fShow', { n: list.length });
    }
    lastCount = list.length;
    if (window.__wiz) window.__wiz();
    // Как на elitka.kg: без фильтра — ЖК; выбрали взнос, платёж, комнаты или площадь — сами квартиры
    // (в карточке — ЖК и адрес), нажатие открывает квартиру
    const filtered = st.down != null || st.monthly != null || st.rooms.size > 0
      || !!(B && B.area && (st.area[0] > B.area.min || st.area[1] < B.area.max));
    if (list.length && !filtered) {
      drawObjs(list);
    } else if (list.length) {
      $('cards').classList.remove('zk-view');
      $('cards').innerHTML = list.map(card).join('');
    } else {
      $('cards').classList.remove('zk-view');
      const budget = [
        st.down != null && L('budgetDown', { x: money(st.down, c) }),
        st.monthly != null && L('budgetMonthly', { x: money(st.monthly, c) }),
        st.rooms.size && L('budgetRooms', { x: [...st.rooms].map(r => (r === '1' ? L('roomsOneOrStudio') : r === '4' ? '4+' : r)).join(', ') }),
      ].filter(Boolean).join(', ');
      const kind = L({ land: 'kindLand', cash: 'kindCash', commercial: 'kindCommercial' }[st.type] || 'kindInstallment');
      const where = st.city ? L('inCity', { city: st.city }) : '';
      const text = L('waPick', { kind, where, budget: budget ? `: ${budget}` : '' });
      $('cards').innerHTML = `<div class="empty">
        <p>${L('emptyHtml', { many: esc(plural(wordsKey, 5)) })}</p>
        <a class="btn btn-wa btn-lg" href="${esc(wa(text))}" data-wa="empty" target="_blank" rel="noopener">${D.waIcon}${L('pickManually')}</a>
      </div>`;
    }
  }

  // Города: кнопка на каждый город, где есть квартиры, сразу выбран первый (Бишкек). «Все города» нет.
  // Один город — переключателя нет.
  const cities = ['Бишкек', 'Ош'].filter(c => APTS.some(a => a.city === c));
  if (cities.length > 1) {
    st.city = cities[0];
    $('fCity').innerHTML = cities.map((c, i) => `<button type="button" data-v="${esc(c)}" class="${i ? '' : 'on'}">${esc(c)}</button>`).join('');
    $('fCity').hidden = false;
    $('fCity').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const v = b.dataset.v || null; if (v === st.city) return;
      st.city = v;
      $('fCity').querySelectorAll('button').forEach(x => x.classList.toggle('on', (x.dataset.v || null) === v));
      // В выбранном городе может не быть квартир текущей категории — переключаемся на ту, что есть
      if (!ofType().length) { const t = TYPE_ORDER.find(t => APTS.some(a => a.type === t && (!v || a.city === v))); if (t) st.type = t; }
      reset(); syncInputs(); update();
    });
  }

  // Вкладки только тех категорий, что есть на сайте; если категория одна — вкладок нет
  const has = t => APTS.some(a => a.type === t);
  $('fType').querySelectorAll('button').forEach(b => { b.hidden = !has(b.dataset.v); });
  // На телефоне вкладки стоят по две в ряд: если их нечётное число, последняя — на всю ширину
  const shownTabs = [...$('fType').querySelectorAll('button')].filter(b => !b.hidden);
  if (shownTabs.length % 2) shownTabs[shownTabs.length - 1].classList.add('wide');
  if (TYPE_ORDER.filter(has).length < 2) $('fType').hidden = true;
  // ---------- Компактный подбор ----------
  // Над фильтром — вкладки (город, тип) и строка-кнопка «Подобрать» со сводкой выбора.
  // На телефоне сам фильтр — лист снизу: открывается кнопкой, внизу «Показать: N». На компьютере фильтр как раньше.
  const filterEl = $('filter');
  const ftop = document.createElement('div');
  ftop.className = 'ftop';
  filterEl.before(ftop);
  ftop.append($('fCity'), $('fType'));
  ftop.insertAdjacentHTML('beforeend', `<button type="button" class="fbar" id="fOpen" aria-controls="filter" aria-expanded="false">
    <span class="fbar-i" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/></svg></span>
    <span class="fbar-t"><b>${L('fPick')}</b><small id="fSum"></small></span><i class="fbar-n" id="fBadge" hidden></i><span class="fbar-go" aria-hidden="true">›</span></button>`);
  filterEl.insertAdjacentHTML('afterbegin', `<div class="fsheet-head"><b>${L('fSheet')}</b><button type="button" class="fsheet-x" id="fClose" aria-label="${L('fClose')}">×</button></div>`);
  filterEl.insertAdjacentHTML('beforeend', '<div class="fsheet-foot"><button type="button" class="btn btn-lg" id="fDone"></button></div>');
  document.body.insertAdjacentHTML('beforeend', '<div class="fshade" id="fShade" hidden></div>');
  const sheet = open => {
    filterEl.classList.toggle('open', open);
    $('fShade').hidden = !open;
    document.documentElement.classList.toggle('fsheet-open', open);
    $('fOpen').setAttribute('aria-expanded', String(open));
    if (!open) $('count').scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  $('fOpen').onclick = () => sheet(true);
  ['fClose', 'fDone', 'fShade'].forEach(id => { $(id).onclick = () => sheet(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && filterEl.classList.contains('open')) sheet(false); });

  // ---------- Пошаговый подбор (телефон, рассрочка и коммерция) ----------
  // На месте кнопки «Подобрать»: шаг 1 — сколько внести сразу, шаг 2 — сколько платить в месяц,
  // дальше — итог с кнопками «Изменить» и «Комнаты, площадь» (открывает полный фильтр).
  // Нажатие ставит те же значения, что ползунки в фильтре, поэтому всё остаётся согласованным.
  let wzStep = 1;
  ftop.insertAdjacentHTML('beforeend', '<div class="wiz" id="wiz" aria-live="polite"></div>');
  const wiz = $('wiz');
  // Платёж в месяц под выбранный взнос: самый маленький возможный платёж по каждой квартире
  function monthlyQuick() {
    const inst = ofType().filter(a => a.installment && match(a) && (st.down == null || st.down >= a.down));
    const vals = inst.map(a => monthlyAt(a, st.down == null ? a.down : Math.min(st.down, a.price)));
    return fewQuick(vals, [0.2, 0.5, 0.8]);
  }
  // Квартир мало (одна) — всё равно даём одну кнопку с ровной суммой
  const fewQuick = (vals, qs) => { const q = quickValues(vals, qs); const v = vals.filter(x => x > 0); return q.length || !v.length ? q : [niceUp(Math.min(...v))]; };
  const downQuick = () => fewQuick(ofType().filter(a => a.installment).map(a => a.down), [0.25, 0.5, 0.8]);
  const chip = (v, label, on) => `<button type="button" class="wz-chip${on ? ' on' : ''}" data-v="${v}">${esc(label)}</button>`;
  function drawWiz() {
    const show = !cashLike(st.type) && downQuick().length > 0;
    wiz.hidden = !show;
    $('fOpen').classList.toggle('wz-off', show);
    if (!show) return;
    const c = cur(st.type);
    const fits = `<span class="wz-fits">${esc(L('wFits', { n: lastCount }))} ${esc(plural({ commercial: 'wordsCommercial', land: 'wordsLand' }[st.type] || 'wordsApartment', lastCount))}</span>`;
    if (wzStep === 3) {
      const parts = [
        st.down != null && L('fDownTo', { x: money(st.down, c) }),
        st.monthly != null && L('fMonthlyTo', { x: money(st.monthly, c) }),
        st.rooms.size && L('fRoomsSel', { x: [...st.rooms].sort().map(r => (r === '4' ? '4+' : r)).join(', ') }),
      ].filter(Boolean);
      wiz.innerHTML = `<div class="wz-done">
          <span class="wz-ok" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span>
          <span class="wz-t"><b>${esc(L('wDone'))}</b><small>${esc(parts.join(' · ') || L('fAll'))}</small></span>
        </div>
        <div class="wz-acts"><button type="button" class="wz-btn" data-go="1">${esc(L('wEdit'))}</button><button type="button" class="wz-btn" data-go="more">${esc(L('wMore'))}</button></div>`;
      return;
    }
    const key = wzStep === 1 ? 'down' : 'monthly';
    const vals = wzStep === 1 ? downQuick() : monthlyQuick();
    wiz.innerHTML = `<div class="wz-head"><span class="wz-step">${esc(L('wStep', { n: wzStep }))}</span>
        <span class="wz-bar"><i class="on"></i><i${wzStep === 2 ? ' class="on"' : ''}></i></span>
        ${wzStep === 2 ? `<button type="button" class="wz-back" data-go="1">${esc(L('wBack'))}</button>` : ''}</div>
      <b class="wz-q">${esc(L(wzStep === 1 ? 'wDownQ' : 'wMonthlyQ'))}</b>
      <div class="wz-chips" data-k="${key}">${vals.map(v => chip(v, L('quickUpTo', { x: shortMoney(v) }), st[key] === v)).join('')}${chip('', L('anySum'), false)}</div>
      <div class="wz-foot">${fits}<button type="button" class="wz-link" data-go="more">${esc(L('wMore'))} ›</button></div>`;
  }
  wiz.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.go === 'more') { sheet(true); return; }
    if (b.dataset.go === '1') { wzStep = 1; drawWiz(); return; }
    const box = b.closest('.wz-chips'); if (!box) return;
    const key = box.dataset.k;
    const v = b.dataset.v === '' ? null : +b.dataset.v;
    st[key] = v;
    if (key === 'down') { fDown.value = v == null ? B.down.max : v; st.monthly = null; wzStep = 2; }
    else { fMonthly.value = v == null ? B.monthly.max : v; wzStep = 3; }
    update();
    if (wzStep === 3) $('count').scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  // Тип или город сменились — подбор начинается заново
  [$('fType'), $('fCity'), $('fReset')].forEach(el => el && el.addEventListener('click', () => { wzStep = 1; drawWiz(); }));
  window.__wiz = drawWiz;

  if (!has(st.type)) st.type = TYPE_ORDER.find(has) || 'installment';
  // В выбранном сразу городе нет квартир этой категории — берём ту, что в нём есть
  if (!ofType().length) st.type = TYPE_ORDER.find(t => APTS.some(a => a.type === t && (!st.city || a.city === st.city))) || st.type;
  reset();
  syncInputs();
  update();

  // Анимации появления: блоки, наполненные выше, и первая выдача карточек.
  // Дальнейшие перерисовки фильтра карточки не анимируют, чтобы не мигали.
  window.RS.reveal();
  window.RS.reveal($('cards'), '.card');

})();
