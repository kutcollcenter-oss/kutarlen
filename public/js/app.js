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
  $('heroSub').textContent = L('heroSub', { who: `${S.name}${role ? ` — ${role[0].toLowerCase() + role.slice(1)}` : ''}` });
  $('badgeName').textContent = S.name;
  $('badgeRole').textContent = S.role || '';
  $('heroPhoto').innerHTML = S.photo
    ? `<img src="${esc(S.photo)}" alt="${esc(S.name)}" fetchpriority="high">`
    : `<div class="hero-initials">${esc(S.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2))}</div>`;
  const waGeneral = wa(L('waGeneral'));
  $('ctaWa').href = waGeneral;
  $('ctaWa').insertAdjacentHTML('afterbegin', D.waIcon);
  $('ctaTitle').textContent = S.ctaTitle;
  $('ctaText').textContent = S.ctaText || '';
  $('heroKicker').textContent = S.heroKicker || '';
  $('heroKicker').hidden = !S.heroKicker;
  $('heroPoints').innerHTML = lines(S.heroPoints).map(p => `<li>${esc(p)}</li>`).join('');
  $('aboutTitle').innerHTML = L('aboutTitleHtml', { name: esc(S.name) });
  $('aboutText').textContent = S.about;
  if (S.officeAddress) {
    $('officeAddr').textContent = S.officeAddress;
    if (S.officeLink) $('office').href = S.officeLink; else $('officeLinkText').remove();
  } else $('office').remove();

  const STAT_ICONS = [
    '<path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="9"/>',
    '<path d="M7 10v11M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 18.4 21H7V10l4-8a3 3 0 0 1 3 3.9Z"/><path d="M3 10h4v11H3z"/>',
    '<path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/>',
    '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  ];
  const stats = lines(S.stats).map(l => l.split('|').map(x => x.trim()));
  $('stats').innerHTML = stats.map(([v, l], i) =>
    `<div class="stat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${STAT_ICONS[i % STAT_ICONS.length]}</svg><div><b>${esc(v)}</b><span>${esc(l || '')}</span></div></div>`).join('');

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
    return { min: Math.floor(Math.min(...vals) / step) * step, max: Math.ceil(Math.max(...vals) / step) * step, step };
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
  // Город: null — все города. Всё остальное в фильтре (ползунки, комнаты) считается по квартирам выбранного города.
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
    if (!ph || !ph.querySelector('img')) return;
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
    // Все фото квартиры в карточке: листаются сами, по нажатию открываются на весь экран
    const photo = a.photos.length
      ? `<div class="cp-track">${a.photos.map(p => `<img src="${p.thumb}" alt="" loading="lazy">`).join('')}</div>
         ${a.photos.length > 1 ? `<div class="cp-dots">${a.photos.map((p, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</div>` : ''}`
      : '<div class="ph"></div>';
    const url = a.installment && a.o.down !== a.down ? `${a.url}?down=${a.o.down}` : a.url;
    const main = a.installment
      ? `<div class="card-price"><b>${money(a.o.monthly, c)}</b><span>${L('perMonth')}</span></div>`
      : `<div class="card-price"><b>${money(a.price, c)}</b><span>${L(cashLike(a.type) ? 'cashWord' : 'fullPay')}</span></div>`;
    const pay = a.installment
      ? `<div class="pay-row">
          <div><span>${L('down')}</span><b>${money(a.o.down, c)}</b></div>
          <div><span>${L('term')}</span><b>${L('months', { n: a.months })}</b></div>
          <div><span>${L('price')}</span><b>${money(a.price, c)}</b></div>
        </div>`
      : '';
    // Строки взноса и платежа в сообщении — под выбранный в фильтре взнос
    const text = a.installment ? replacePay(a.waText, money(a.o.down, c), L('waMonthlyFor', { x: money(a.o.monthly, c), n: a.months })).replace(a.url, url) : a.waText;
    return `<article class="card">
      <a class="card-link" href="${url}">
        <div class="card-photo" data-id="${a.id}">${photo}<div class="tags">${a.tags.map(t => `<span class="tag${tagCls(t)}">${esc(t)}</span>`).join('')}</div></div>
        <div class="card-body">
          ${main}
          <div class="card-title">${a.roomsLabel}, ${a.area} ${a.unit}${a.title ? ` · ${esc(a.title)}` : ''}</div>
          ${a.address ? `<div class="card-addr">${I.pin}${esc(a.address)}</div>` : ''}
          ${pay}
          <div class="feats">
            ${a.type === 'commercial' || a.type === 'land' ? '' : `<span>${I.bed}${a.roomsLabel}</span>`}<span>${I.area}${a.area} ${a.unit}</span>
            ${a.floorFrom ? `<span>${I.floor}${L('fromFloor', { f: a.floorFrom })}</span>` : ''}
            <span class="feats-ppm">${money(a.pricePerM2, c)}/${L(a.type === 'land' ? 'perSot' : 'perM2')}</span>
          </div>
        </div>
      </a>
      <div class="card-actions"><a class="btn btn-wa" href="${esc(wa(text))}" data-wa="card" data-id="${a.id}" target="_blank" rel="noopener">${D.waIcon}${L('writeWa')}</a></div>
    </article>`;
  }

  // Подменить в сообщении строки «Взнос: …» и «В месяц: …» (их начала — в словаре: waDown, waMonthly)
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function replacePay(text, down, monthly) {
    const re = new RegExp(`${escRe(L('waDown'))}[^\\n]*\\n${escRe(L('waMonthly'))}[^\\n]*`);
    return text.replace(re, `${L('waDown')}${down}\n${L('waMonthly')}${monthly}`);
  }

  function update() {
    const c = cur(st.type);
    if (!cashLike(st.type)) syncMonthly();
    const u = L(st.type === 'land' ? 'perSot' : 'perM2');
    $('oDown').textContent = st.down == null ? L('any') : money(st.down, c);
    $('oMonthly').textContent = st.monthly == null ? L('any') : L('upTo', { x: money(st.monthly, c) });
    $('oArea').textContent = st.area[0] === st.area[1] ? `${st.area[0]} ${u}` : `${st.area[0]} – ${st.area[1]} ${u}`;
    [fDown, fMonthly].forEach(paintRange);
    paintDual($('fArea'), st.area, B.area);

    const list = ofType().filter(match)
      .map(a => ({ ...a, o: offer(a) }))
      .filter(a => a.o)
      .sort(SORTS[$('sort').value]);
    const wordsKey = { commercial: 'wordsCommercial', land: 'wordsLand' }[st.type] || 'wordsApartment';
    $('count').textContent = L('found', { n: list.length, word: plural(wordsKey, list.length) });
    if (list.length) {
      $('cards').innerHTML = list.map(card).join('');
      window.RS.slides($('cards').querySelectorAll('.card-photo'));
    } else {
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

  // Города: кнопки «Все города» и каждый город, где есть квартиры. Один город — переключателя нет.
  const cities = ['Бишкек', 'Ош'].filter(c => APTS.some(a => a.city === c));
  if (cities.length > 1) {
    $('fCity').innerHTML = ['', ...cities].map(c => `<button type="button" data-v="${esc(c)}" class="${c ? '' : 'on'}">${c ? esc(c) : L('allCities')}</button>`).join('');
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
  if (TYPE_ORDER.filter(has).length < 2) $('fType').hidden = true;
  if (!has(st.type)) st.type = TYPE_ORDER.find(has) || 'installment';
  reset();
  syncInputs();
  update();

  // Анимации появления: блоки, наполненные выше, и первая выдача карточек.
  // Дальнейшие перерисовки фильтра карточки не анимируют, чтобы не мигали.
  window.RS.reveal();
  window.RS.reveal($('cards'), '.card');

})();
