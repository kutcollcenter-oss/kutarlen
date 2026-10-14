// Главная страница: наполнение блоков, фильтр и калькулятор
(function () {
  const { S, money, esc, wa } = window.RS;
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
  $('heroSub').textContent = `${S.name}${role ? ` — ${role[0].toLowerCase() + role.slice(1)}` : ''}. Подберу квартиру под ваш взнос и ежемесячный платёж.`;
  $('badgeName').textContent = S.name;
  $('badgeRole').textContent = S.role || '';
  $('heroPhoto').innerHTML = S.photo
    ? `<img src="${esc(S.photo)}" alt="${esc(S.name)}" fetchpriority="high">`
    : `<div class="hero-initials">${esc(S.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2))}</div>`;
  const waGeneral = wa('Здравствуйте! Хочу подобрать квартиру.');
  $('heroWa').href = waGeneral;
  $('heroWa').insertAdjacentHTML('afterbegin', D.waIcon);
  $('ctaWa').href = waGeneral;
  $('ctaWa').insertAdjacentHTML('afterbegin', D.waIcon);
  $('ctaTitle').textContent = S.ctaTitle;
  $('ctaText').textContent = S.ctaText || '';
  $('heroKicker').textContent = S.heroKicker || '';
  $('heroKicker').hidden = !S.heroKicker;
  $('heroPoints').innerHTML = lines(S.heroPoints).map(p => `<li>${esc(p)}</li>`).join('');
  $('aboutTitle').innerHTML = `Привет! Я ${esc(S.name)} <span class="hl">и помогу с квартирой</span>`;
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
        <div class="stars" aria-label="5 из 5">★★★★★</div>
        <blockquote>${esc(text.join(' '))}</blockquote>
        <figcaption><span class="avatar">${esc((who || '?')[0])}</span><span><b>${esc(who)}</b>${date ? `<small>${esc(date)}</small>` : ''}</span></figcaption>
      </figure>`;
    }).join('');
  } else $('reviews-sec').remove();

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
  const monthlyAt = (a, d) => (a.price <= d ? 0 : Math.ceil((a.price - d) / a.months));
  const cur = type => (type === 'cash' ? S.currencyCash || '$' : S.currencyInstallment || 'сом');

  const st = { type: 'installment' };
  let B;
  const ofType = () => APTS.filter(a => a.type === st.type);

  function reset() {
    const L = ofType();
    const inst = L.filter(a => a.installment);
    B = {
      down: bounds(inst.map(a => a.down).concat(inst.map(a => a.price))),
      monthly: bounds(inst.map(a => a.monthly).concat([0])),
      price: bounds(L.map(a => a.price)),
      area: bounds(L.map(a => a.area), 60),
    };
    Object.assign(st, {
      down: null, monthly: null, // null — не задано («любой»)
      price: [B.price.min, B.price.max], area: [B.area.min, B.area.max], rooms: new Set(),
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
  const [pLo, pHi] = $('fPrice').querySelectorAll('input');
  const [aLo, aHi] = $('fArea').querySelectorAll('input');

  function syncInputs() {
    setupRange(fDown, B.down, st.down ?? B.down.max);
    setupRange(fMonthly, B.monthly, st.monthly ?? B.monthly.max);
    setupRange(pLo, B.price, st.price[0]); setupRange(pHi, B.price, st.price[1]);
    setupRange(aLo, B.area, st.area[0]); setupRange(aHi, B.area, st.area[1]);
    $('fType').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === st.type));
    $('fRooms').querySelectorAll('button').forEach(b => b.classList.toggle('on', st.rooms.has(b.dataset.v)));
    const isNew = st.type === 'installment';
    $('fDownWrap').hidden = !isNew;
    $('fMonthlyWrap').hidden = !isNew;
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
  dual(pLo, pHi, 'price');
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
    update();
  });
  $('fReset').addEventListener('click', () => { reset(); syncInputs(); update(); });
  $('sort').addEventListener('change', update);

  function match(a) {
    if (a.price < st.price[0] || a.price > st.price[1]) return false;
    if (a.area < st.area[0] || a.area > st.area[1]) return false;
    if (st.rooms.size && !st.rooms.has(a.rooms >= 4 ? '4' : String(a.rooms))) return false;
    return true;
  }

  const SORTS = {
    monthly: (a, b) => a.o.monthly - b.o.monthly || a.price - b.price,
    down: (a, b) => a.o.down - b.o.down,
    price: (a, b) => a.price - b.price,
    ppm: (a, b) => a.pricePerM2 - b.pricePerM2,
    new: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
  };

  const tagCls = t => (t === 'Скидка' ? ' tag-sale' : t === 'Рассрочка' ? ' tag-inst' : '');

  function card(a) {
    const c = a.currency;
    const photo = a.photos[0] ? `<img src="${a.photos[0].thumb}" alt="" loading="lazy">` : '<div class="ph"></div>';
    const url = a.installment && a.o.down !== a.down ? `${a.url}?down=${a.o.down}` : a.url;
    const main = a.installment
      ? `<div class="card-price"><b>${money(a.o.monthly, c)}</b><span>/ мес</span></div>`
      : `<div class="card-price"><b>${money(a.price, c)}</b><span>${a.type === 'cash' ? 'наличные' : '100% оплата'}</span></div>`;
    const pay = a.installment
      ? `<div class="pay-row">
          <div><span>Взнос</span><b>${money(a.o.down, c)}</b></div>
          <div><span>Срок</span><b>${a.months} мес.</b></div>
          <div><span>Цена</span><b>${money(a.price, c)}</b></div>
        </div>`
      : '';
    const text = a.installment ? a.waText.replace(/взнос [^,]+, [^,]+ в месяц на \d+ мес\./, `взнос ${money(a.o.down, c)}, ${money(a.o.monthly, c)} в месяц на ${a.months} мес.`).replace(a.url, url) : a.waText;
    return `<article class="card">
      <a class="card-link" href="${url}">
        <div class="card-photo">${photo}<div class="tags">${a.tags.map(t => `<span class="tag${tagCls(t)}">${esc(t)}</span>`).join('')}</div></div>
        <div class="card-body">
          ${main}
          <div class="card-title">${a.roomsLabel}, ${a.area} м²${a.title ? ` · ${esc(a.title)}` : ''}</div>
          ${a.address ? `<div class="card-addr">${I.pin}${esc(a.address)}</div>` : ''}
          ${pay}
          <div class="feats">
            <span>${I.bed}${a.roomsLabel}</span><span>${I.area}${a.area} м²</span>
            ${a.floorFrom ? `<span>${I.floor}от ${a.floorFrom} эт.</span>` : ''}
            <span class="feats-ppm">${money(a.pricePerM2, c)}/м²</span>
          </div>
        </div>
      </a>
      <div class="card-actions"><a class="btn btn-wa" href="${esc(wa(text))}" data-wa="card" data-id="${a.id}" target="_blank" rel="noopener">${D.waIcon}Написать в WhatsApp</a></div>
    </article>`;
  }

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many;
  }

  function update() {
    const c = cur(st.type);
    $('oDown').textContent = st.down == null ? 'любой' : money(st.down, c);
    $('oMonthly').textContent = st.monthly == null ? 'любой' : `до ${money(st.monthly, c)}`;
    $('oPrice').textContent = `${money(st.price[0], c)} – ${money(st.price[1], c)}`;
    $('oArea').textContent = `${st.area[0]} – ${st.area[1]} м²`;
    [fDown, fMonthly].forEach(paintRange);
    paintDual($('fPrice'), st.price, B.price);
    paintDual($('fArea'), st.area, B.area);

    const list = ofType().filter(match)
      .map(a => ({ ...a, o: offer(a) }))
      .filter(a => a.o)
      .sort(SORTS[$('sort').value]);
    $('count').textContent = `Найдено: ${list.length} ${plural(list.length, 'квартира', 'квартиры', 'квартир')}`;
    if (list.length) {
      $('cards').innerHTML = list.map(card).join('');
    } else {
      const budget = [
        st.down != null && `взнос до ${money(st.down, c)}`,
        st.monthly != null && `платёж до ${money(st.monthly, c)} в месяц`,
        st.rooms.size && `комнат: ${[...st.rooms].map(r => (r === '0' ? 'студия' : r === '4' ? '4+' : r)).join(', ')}`,
      ].filter(Boolean).join(', ');
      const kind = st.type === 'cash' ? 'за наличные' : 'в рассрочку';
      const text = `Здравствуйте! Подберите, пожалуйста, квартиру ${kind}${budget ? `: ${budget}` : ''}.`;
      $('cards').innerHTML = `<div class="empty">
        <p><b>Под эти условия сейчас нет квартир на сайте.</b><br>Напишите — подберу вручную.</p>
        <a class="btn btn-wa btn-lg" href="${esc(wa(text))}" data-wa="empty" target="_blank" rel="noopener">${D.waIcon}Подберу вручную</a>
      </div>`;
    }
  }

  // Если вторички нет — вкладку не показываем
  if (!APTS.some(a => a.type === 'cash')) $('fType').hidden = true;
  reset();
  syncInputs();
  update();

  // Анимации появления: блоки, наполненные выше, и первая выдача карточек.
  // Дальнейшие перерисовки фильтра карточки не анимируют, чтобы не мигали.
  window.RS.reveal();
  window.RS.reveal($('cards'), '.card');

})();
