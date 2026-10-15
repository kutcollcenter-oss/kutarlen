// Кабинет риелтора: квартиры, свой сайт, подробная аналитика.
// Владелец сервиса (role: owner) дополнительно видит раздел «Риелторы»: доступы, оплата, лимиты.
// Рассчитан на телефон. Статусов у квартир нет: квартира либо на сайте, либо удалена.
(function () {
  const app = document.getElementById('app');
  const TYPES = { installment: 'Рассрочка', cash: 'Наличные' };
  const typeOf = a => (a.type === 'cash' || a.type === 'resale' ? 'cash' : 'installment');
  const nf = new Intl.NumberFormat('ru-RU');
  let settings = null;
  let me = null; // { login, role, defaultPassword, realtor: { url, status, plan, count }, product }
  let listFilter = 'all';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cur = type => (type === 'cash' ? settings.currencyCash || '$' : settings.currencyInstallment || 'сом');
  const money = (n, c) => (n == null ? '—' : `${nf.format(Math.round(n))} ${c}`);
  const rooms = r => (+r === 0 ? 'Студия' : `${r}-комн.`);
  const isOwner = () => me && me.role === 'owner';
  // 1 квартира, 2 квартиры, 5 квартир
  const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? few : many; };
  const flats = n => `${n} ${plural(n, 'квартира', 'квартиры', 'квартир')}`;

  // Текст ошибки в элемент формы; если формы уже нет на экране (например, сессия истекла) — всплывающим сообщением
  const showErr = (id, msg) => { const el = document.getElementById(id); if (el) el.textContent = msg; else if (msg && msg !== 'auth') toast(msg); };

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // Окно внутри страницы вместо confirm()/prompt(): системные окна заблокированы во многих браузерах
  // (встроенные в Instagram/WhatsApp, панели приложений) — кнопки с ними просто «не работали».
  // modal({ title, text, input, okText, danger }) → true/false, или введённое значение / null при отмене.
  function modal({ title, text = '', html = '', input = null, okText = 'Готово', cancelText = 'Отмена', danger = false }) {
    return new Promise(resolve => {
      const wrap = document.createElement('div');
      wrap.className = 'modal';
      wrap.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="mTitle">
        <h2 id="mTitle">${esc(title)}</h2>
        ${text ? `<p>${esc(text)}</p>` : ''}${html}
        ${input ? `<input class="modal-in" type="${input.type || 'text'}" value="${esc(input.value ?? '')}" placeholder="${esc(input.placeholder || '')}"${input.inputmode ? ` inputmode="${input.inputmode}"` : ''} autocapitalize="none" spellcheck="false">` : ''}
        <div class="err modal-err"></div>
        <div class="modal-acts">
          ${cancelText ? `<button type="button" class="btn" data-no>${esc(cancelText)}</button>` : ''}
          <button type="button" class="btn ${danger ? 'btn-danger-fill' : 'btn-primary'}" data-ok>${esc(okText)}</button>
        </div></div>`;
      document.body.appendChild(wrap);
      const inp = wrap.querySelector('input.modal-in');
      const close = v => { wrap.remove(); document.removeEventListener('keydown', key); resolve(v); };
      const ok = () => {
        const v = inp ? inp.value.trim() : true;
        const err = input && input.validate ? input.validate(v) : '';
        if (err) { wrap.querySelector('.modal-err').textContent = err; return; }
        close(v);
      };
      const no = () => close(input ? null : false);
      const key = e => { if (e.key === 'Escape') no(); if (e.key === 'Enter' && inp) ok(); };
      document.addEventListener('keydown', key);
      wrap.querySelector('[data-ok]').onclick = ok;
      const nb = wrap.querySelector('[data-no]'); if (nb) nb.onclick = no;
      wrap.onclick = e => { if (e.target === wrap) no(); };
      (inp || wrap.querySelector('[data-ok]')).focus();
      if (inp && inp.type !== 'date') inp.select();
    });
  }
  const confirmBox = (title, text, okText = 'Да', danger = false) => modal({ title, text, okText, danger });

  async function copy(text, done = 'Ссылка скопирована') {
    try { await navigator.clipboard.writeText(text); toast(done); }
    catch (e) {
      // Буфер обмена недоступен — показываем текст, чтобы скопировать вручную
      modal({ title: 'Скопируйте', html: `<textarea class="modal-in" rows="6" readonly>${esc(text)}</textarea>`, okText: 'Закрыть', cancelText: '' });
      setTimeout(() => { const t = document.querySelector('.modal textarea'); if (t) t.select(); }, 50);
    }
  }

  async function api(method, url, body) {
    const opts = { method, headers: {} };
    if (body instanceof FormData) opts.body = body;
    else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
    const r = await fetch(url, opts);
    if (r.status === 401 && !url.endsWith('/login')) { renderLogin(); throw new Error('auth'); }
    const data = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
    if (!r.ok) throw new Error((data && data.error) || 'Ошибка');
    return data;
  }

  // ---------- Вход ----------
  // Обложка входа: зачем кабинет риелтору + форма входа + связь с владельцем сервиса (новый кабинет, техподдержка)
  const WA_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.5 1.1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>';
  const SKYLINE = '<svg class="auth-sky" viewBox="0 0 600 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><path d="M0 220V150h40v-40h30v40h20V90h50v130M140 220V120h28V70h34v50h22v100M224 220V40h60v180M284 220V100h44v-30h30v150M358 220V130h40v-50h46v140M444 220V60h56v160M500 220V140h36v-30h34v110h30" /><path class="win" d="M236 60h8M256 60h8M236 84h8M256 84h8M236 108h8M256 108h8M456 82h8M476 82h8M456 106h8M476 106h8M180 92h8M108 112h8M376 102h8" /></svg>';
  const fmtPhone = p => String(p || '').replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})(\d{3})$/, '+$1 $2 $3 $4');
  const waTo = (p, text) => `https://wa.me/${String(p).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

  async function renderLogin() {
    const preLogin = esc(new URLSearchParams(location.search).get('u') || '');
    app.innerHTML = `<div class="auth">
      <section class="auth-cover">
        ${SKYLINE}
        <div class="auth-cover-in">
          <div class="auth-kicker">Кабинет риелтора</div>
          <h1>Ваш сайт продаёт квартиры, <em>пока вы на показах</em></h1>
          <ul class="auth-points">
            <li><b>Клиент подбирает сам</b> по взносу и платежу в месяц — без звонков «а что есть?»</li>
            <li><b>Заявки сразу в WhatsApp</b> — с квартирой, взносом и платежом в сообщении</li>
            <li><b>Видно, что работает</b> — откуда клиенты и какие квартиры смотрят</li>
          </ul>
        </div>
      </section>
      <section class="auth-side">
        <form class="login" id="lf">
          <h2>Вход в кабинет</h2>
          <label class="f"><span>Логин</span><input type="text" id="lg" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${preLogin}"></label>
          <label class="f"><span>Пароль</span><input type="password" id="pw" autocomplete="current-password" required></label>
          <div class="err" id="le"></div>
          <button class="btn btn-primary btn-block">Войти</button>
        </form>
        <div class="auth-help" id="authHelp" hidden></div>
      </section>
    </div>`;
    if (document.getElementById('lg').value) document.getElementById('pw').focus();
    // Номер владельца сервиса — из настроек «Главная страница сервиса»
    api('GET', '/api/public/product').then(p => {
      if (!p || !p.whatsapp) return;
      const box = document.getElementById('authHelp');
      if (!box) return;
      box.hidden = false;
      box.innerHTML = `<p class="auth-help-q">Хотите открыть себе кабинет или нужна техподдержка?</p>
        <p class="auth-help-a">Напишите в WhatsApp — ответим и поможем</p>
        <div class="auth-help-btns">
          <a class="auth-wa" href="${esc(waTo(p.whatsapp, 'Здравствуйте! Хочу открыть себе кабинет риелтора.'))}" target="_blank" rel="noopener">${WA_SVG}Открыть кабинет</a>
          <a class="auth-wa ghost" href="${esc(waTo(p.whatsapp, 'Здравствуйте! Нужна техподдержка по кабинету риелтора.'))}" target="_blank" rel="noopener">Техподдержка</a>
        </div>
        <a class="auth-phone" href="${esc(waTo(p.whatsapp, 'Здравствуйте!'))}" target="_blank" rel="noopener">WhatsApp ${esc(fmtPhone(p.whatsapp))}</a>`;
    }).catch(() => {});
    document.getElementById('lf').onsubmit = async e => {
      e.preventDefault();
      try {
        await api('POST', '/api/admin/login', { login: document.getElementById('lg').value, password: document.getElementById('pw').value });
        start();
      } catch (err) { showErr('le', err.message); }
    };
  }

  const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const NAV = [
    ['list', 'Квартиры', svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>')],
    ['analytics', 'Аналитика', svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>')],
    ['settings', 'Мой сайт', svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>')],
    ['realtors', 'Риелторы', svg('<circle cx="9" cy="8" r="3.5"/><path d="M2 20c1-3.5 3.6-5.5 7-5.5s6 2 7 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.7.9 2.9 2.6 3.5 5.2"/>'), true],
  ];

  // Верхнее меню — на ноутбуке; на телефоне и планшете — нижнее меню (как на сайте)
  function nav(active) {
    const items = NAV.filter(([, , , ownerOnly]) => !ownerOnly || isOwner());
    const top = items.map(([h, label]) => `<a href="#${h}" class="tl${active === h ? ' on' : ''}">${label}</a>`).join('');
    const bottom = items.map(([h, label, icon]) => `<a href="#${h}" class="${active === h ? 'on' : ''}">${icon}<span>${label}</span></a>`).join('');
    return `<div class="top"><div class="wrap">
      <span class="top-title">${esc(me.realtor.name)}</span>
      ${top}
      <span class="sp"></span>
      <button id="logout">Выйти</button>
    </div></div>${banner()}
    <nav class="atab" aria-label="Меню кабинета">${bottom}</nav>`;
  }

  // Ссылка для клиентов и предупреждения: оплата, пароль по умолчанию
  function banner() {
    const r = me.realtor, st = r.status;
    const warn = [];
    if (!st.active) warn.push(`<div class="warn bad">${esc(st.label)}. Сайт для клиентов отключён — ${me.product.whatsapp ? `<a href="https://wa.me/${esc(me.product.whatsapp.replace(/\D/g, ''))}" target="_blank">напишите владельцу сервиса</a>` : 'свяжитесь с владельцем сервиса'}, чтобы продлить.</div>`);
    else if (st.code === 'ending') warn.push(`<div class="warn">Оплата заканчивается через ${st.daysLeft} дн. (${esc(r.plan.paidUntil)}). Продлите, чтобы сайт не отключился.</div>`);
    if (me.defaultPassword) warn.push(`<div class="warn bad">У вас пароль по умолчанию. <a href="#settings">Смените его</a> — иначе в кабинет может войти кто угодно.</div>`);
    return `<div class="wrap wrap-banner">${warn.join('')}
      <div class="linkbox"><span>Ваша ссылка для клиентов</span>
        <div class="linkrow"><code>${esc(r.url)}</code>
          <button class="btn" data-copy="${esc(r.url)}">Копировать</button>
          <a class="btn" href="${esc(r.url)}" target="_blank">Открыть ↗</a></div>
        <div class="hint" style="margin-top:6px">Вход в кабинет с телефона: <b>${esc(r.url)}/admin</b></div>
      </div></div>`;
  }

  function bindNav() {
    document.getElementById('logout').onclick = async () => { await api('POST', '/api/admin/logout'); renderLogin(); };
    app.querySelectorAll('[data-copy]').forEach(b => { b.onclick = () => copy(b.dataset.copy); });
  }

  // ---------- Лимит тарифа ----------
  // Лимит исчерпан: добавить и дублировать нельзя, остальное работает как обычно —
  // квартиры остаются на сайте, их можно менять и удалять (проданные удаляют — место освобождается).
  let aptCount = 0;
  const atLimit = () => !!(me.realtor.plan.maxApartments && aptCount >= me.realtor.plan.maxApartments);
  function limitInfo() {
    const wa = me.product.whatsapp ? `https://wa.me/${me.product.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Здравствуйте! Хочу расширить лимит квартир. Мой сайт: ${me.realtor.url}`)}` : '';
    modal({
      title: 'Лимит квартир исчерпан',
      text: `По вашему тарифу можно ${flats(me.realtor.plan.maxApartments)}, сейчас ${aptCount}. Все квартиры остаются на сайте. Чтобы добавить новую — удалите проданную или расширьте тариф.`,
      html: wa ? `<a class="btn btn-wa-admin" href="${wa}" target="_blank" rel="noopener">Написать о расширении тарифа</a>` : '',
      okText: 'Понятно', cancelText: '',
    });
  }

  // ---------- Список квартир ----------
  async function renderList() {
    const apts = await api('GET', '/api/admin/apartments');
    const count = t => apts.filter(a => typeOf(a) === t).length;
    aptCount = apts.length;
    const shown = listFilter === 'all' ? apts : apts.filter(a => typeOf(a) === listFilter);
    app.innerHTML = `${nav('list')}<div class="wrap">
      <div class="row" style="justify-content:space-between"><h1>Квартиры</h1><a class="btn btn-primary" href="#edit/new" data-add>+ Добавить</a></div>
      ${me.realtor.plan.maxApartments ? `<p class="${apts.length >= me.realtor.plan.maxApartments ? 'warn' : 'hint'}" style="margin-top:-6px">Тариф: ${apts.length} из ${flats(me.realtor.plan.maxApartments)}${apts.length >= me.realtor.plan.maxApartments ? ' — лимит исчерпан, новые добавить нельзя' : ''}</p>` : ''}
      <div class="filters" id="lf">
        <button data-f="all" class="${listFilter === 'all' ? 'on' : ''}">Все ${apts.length}</button>
        ${Object.entries(TYPES).map(([k, v]) => `<button data-f="${k}" class="${listFilter === k ? 'on' : ''}">${v} ${count(k)}</button>`).join('')}
      </div>
      <div id="items">${shown.map(item).join('') || '<p class="hint">Пока пусто</p>'}</div>
    </div>`;
    bindNav();
    document.getElementById('lf').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      listFilter = b.dataset.f; renderList();
    };
    document.querySelector('[data-add]').onclick = e => { if (atLimit()) { e.preventDefault(); limitInfo(); } };
    document.getElementById('items').onclick = async e => {
      const el = e.target.closest('[data-id]'); const act = e.target.closest('[data-act]');
      if (!el || !act) return;
      const id = el.dataset.id;
      if (act.dataset.act === 'edit') location.hash = `#edit/${id}`;
      if (act.dataset.act === 'dup' && atLimit()) { limitInfo(); return; }
      if (act.dataset.act === 'dup') {
        const a = await api('POST', `/api/admin/apartments/${id}/duplicate`);
        toast('Копия создана');
        location.hash = `#edit/${a.id}`;
      }
      if (act.dataset.act === 'del') {
        if (!(await confirmBox('Удалить квартиру?', 'Она исчезнет с сайта. Например, если квартира продана.', 'Удалить', true))) return;
        await api('DELETE', `/api/admin/apartments/${id}`);
        toast('Удалено'); renderList();
      }
    };
  }

  function item(a) {
    const c = a.computed;
    const img = c.photos[0] ? `<img src="${c.photos[0].thumb}" alt="">` : '<div class="noimg"></div>';
    const k = c.currency;
    const line = c.installment
      ? `${money(c.price, k)} · ${money(c.monthly, k)}/мес · ${c.months} мес.`
      : c.price ? money(c.price, k) : '<span style="color:#dc2626">Цена не указана — на сайте не видна</span>';
    return `<div class="item" data-id="${a.id}">
      ${img}
      <div><div class="t">${esc(a.title || 'Без названия')} <span class="badge badge-${c.type}">${TYPES[c.type]}</span></div>
        <div class="s">${rooms(a.rooms)}, ${a.area} м² · от ${a.floorFrom || '—'} эт.</div>
        <div class="s">${line}</div></div>
      <div class="acts">
        <button class="btn" data-act="edit">✏️ Изменить</button>
        <button class="btn" data-act="dup">⧉ Дублировать</button>
        ${c.price ? `<a class="btn" href="${esc(c.url)}" target="_blank">Открыть ↗</a>` : ''}
        <button class="btn btn-danger" data-act="del">Удалить</button>
      </div>
    </div>`;
  }

  // ---------- Добавление / редактирование ----------
  async function renderEdit(id) {
    const isNewRecord = id === 'new';
    let a;
    if (isNewRecord) {
      a = { type: 'installment', title: '', rooms: 1, area: '', pricePerM2: '', down: '', months: '', cashDiscount: '', price: '', floorFrom: 1, floors: '', address: '', details: '', tags: [], photos: [] };
    } else {
      const apts = await api('GET', '/api/admin/apartments');
      a = apts.find(x => x.id === id);
      if (!a) { location.hash = '#list'; return; }
      a.type = typeOf(a);
    }
    let photos = [...(a.photos || [])];
    const v = k => esc(a[k] === 0 && k !== 'rooms' ? '' : a[k]);
    const f = (name, label, attrs = '') =>
      `<label class="f"><span>${label}</span><input type="text" name="${name}" value="${v(name)}" ${attrs}></label>`;
    const n = (name, label) => f(name, label, 'inputmode="decimal"');

    app.innerHTML = `${nav('list')}<div class="wrap">
      <h1>${isNewRecord ? 'Новая квартира' : esc(a.title || 'Квартира')}</h1>
      <form id="ef">
        <div class="card">
          <div class="seg" id="type">
            <button type="button" data-v="installment">Рассрочка<small>цены в ${esc(cur('installment'))}</small></button>
            <button type="button" data-v="cash">Наличные<small>цены в ${esc(cur('cash'))}</small></button>
          </div>
        </div>
        <div class="card">
          <h2 style="margin-top:0">Фото</h2>
          <div class="photos" id="photos"></div>
          <label class="upload"><input type="file" id="files" accept="image/*" multiple>📷 Загрузить фото (можно несколько)</label>
          <div class="hint">Первое фото — главное. Фото автоматически сжимаются.</div>
        </div>
        <div class="card">
          ${f('title', 'Название (ЖК / дом)')}
          <div class="grid2">
            <label class="f"><span>Комнаты</span><select name="rooms">${[0, 1, 2, 3, 4, 5, 6].map(r => `<option value="${r}" ${+a.rooms === r ? 'selected' : ''}>${r === 0 ? 'Студия' : r}</option>`).join('')}</select></label>
            ${n('area', 'Площадь, м²')}
          </div>
          <div data-for="installment">
            ${n('pricePerM2', `Цена за м², ${esc(cur('installment'))}`)}
            <div class="grid2">
              ${n('down', `Мин. взнос, ${esc(cur('installment'))}`)}
              ${n('months', 'Срок, месяцев')}
            </div>
            ${n('cashDiscount', `Скидка за наличные, ${esc(cur('installment'))} за м²`)}
            <div class="hint" style="margin:-6px 0 10px">Если клиент купит за наличные. 0 или пусто — без скидки, блок «за наличные» на сайте не показывается.</div>
          </div>
          <div data-for="cash">${n('price', `Цена, ${esc(cur('cash'))}`)}</div>
          <div class="calcbox" id="calc"></div>
          <div class="grid2">
            ${n('floorFrom', 'С какого этажа (и выше)')}
            ${n('floors', 'Этажей в доме')}
          </div>
          ${f('address', 'Адрес')}
          <label class="f"><span>Ссылка на Google Карты</span>
            <input type="text" name="mapLink" value="${esc(a.map ? a.map.link : '')}" placeholder="https://maps.app.goo.gl/…" inputmode="url">
            <div class="hint">Google Карты → найдите дом → «Поделиться» → «Копировать ссылку» → вставьте сюда. Без ссылки карта строится по адресу.</div>
            <div class="err" id="mapErr">${a.map && a.map.error ? esc(a.map.error) : ''}</div>
          </label>
          ${a.computed && a.computed.map.embed ? `<div class="map-prev"><div class="hint">Так карта выглядит на сайте:</div><iframe loading="lazy" src="${esc(a.computed.map.embed)}" title="Карта"></iframe></div>` : ''}
          <label class="f"><span>Детали</span><textarea name="details">${esc(a.details)}</textarea></label>
          <label class="f"><span>Метки через запятую</span><input type="text" name="tags" value="${esc((a.tags || []).join(', '))}" placeholder="Скидка, Дом сдан"></label>
        </div>
        <div class="savebar">
          <a class="btn" href="#list">← Назад</a>
          <button class="btn btn-primary">${isNewRecord ? 'Добавить на сайт' : 'Сохранить'}</button>
        </div>
      </form>
    </div>`;
    bindNav();
    const form = document.getElementById('ef');
    let type = a.type;

    const numVal = s => Number(String(s || '').replace(/\s/g, '').replace(',', '.')) || 0;
    function readForm() {
      const d = Object.fromEntries(new FormData(form));
      for (const k of ['area', 'pricePerM2', 'down', 'months', 'cashDiscount', 'price', 'floorFrom', 'floors']) d[k] = numVal(d[k]);
      d.type = type; d.photos = photos;
      return d;
    }
    function setType(t) {
      type = t;
      form.querySelectorAll('#type button').forEach(b => b.classList.toggle('on', b.dataset.v === t));
      form.querySelectorAll('[data-for]').forEach(el => { el.hidden = el.dataset.for !== t; });
      updCalc();
    }
    // Платёж в месяц не вводится — считается: (цена за м² × м² − взнос) / срок
    function updCalc() {
      const d = readForm();
      const box = document.getElementById('calc');
      if (type === 'cash') {
        box.innerHTML = d.price && d.area ? `Цена за м²: ${money(d.price / d.area, cur('cash'))}` : 'Укажите цену и площадь';
        return;
      }
      const c = cur('installment');
      const price = Math.round(d.area * d.pricePerM2);
      if (!price) { box.innerHTML = 'Укажите площадь и цену за м²'; return; }
      const down = Math.min(d.down, price);
      const monthly = d.months > 0 && price > down ? Math.ceil((price - down) / d.months) : 0;
      box.innerHTML = `Цена: <b>${money(price, c)}</b><br>` +
        (monthly ? `Платёж в месяц: <b>${money(monthly, c)}</b> × ${d.months} мес.<br><span class="hint">Клиент сможет внести больше — платёж уменьшится</span>` : 'Укажите срок — посчитаю платёж') +
        (d.cashDiscount > 0 ? `<br>За наличные: <b>${money(Math.round(d.area * Math.max(d.pricePerM2 - d.cashDiscount, 0)), c)}</b> (${money(Math.max(d.pricePerM2 - d.cashDiscount, 0), c)} за м²), экономия клиента ${money(Math.round(d.area * Math.min(d.cashDiscount, d.pricePerM2)), c)}` : '');
    }
    function drawPhotos() {
      document.getElementById('photos').innerHTML = photos.map((p, i) => `
        <div class="photo"><img src="/uploads/${p}-t.webp" alt="">
          ${i === 0 ? '<span class="main">Главное</span>' : ''}
          <div class="pa">${i ? `<button type="button" data-main="${i}" title="Сделать главным">★</button>` : ''}<button type="button" data-rm="${i}" title="Убрать">✕</button></div>
        </div>`).join('');
    }

    setType(type); drawPhotos();
    form.addEventListener('input', updCalc);
    form.querySelector('#type').onclick = e => { const b = e.target.closest('button'); if (b) setType(b.dataset.v); };

    document.getElementById('photos').onclick = e => {
      const m = e.target.closest('[data-main]'), r = e.target.closest('[data-rm]');
      if (m) { const [p] = photos.splice(+m.dataset.main, 1); photos.unshift(p); drawPhotos(); }
      if (r) { photos.splice(+r.dataset.rm, 1); drawPhotos(); }
    };
    document.getElementById('files').onchange = async e => {
      const files = [...e.target.files];
      if (!files.length) return;
      const fd = new FormData();
      files.forEach(fl => fd.append('photos', fl));
      toast(`Загрузка ${files.length} фото…`);
      try {
        const r = await api('POST', '/api/admin/photos', fd);
        photos.push(...r.photos); drawPhotos(); toast('Фото загружены — не забудьте сохранить');
      } catch (err) { toast(err.message); }
      e.target.value = '';
    };
    form.onsubmit = e => {
      e.preventDefault();
      save().catch(err => toast(err.message));
    };
    const save = async () => {
      const d = readForm();
      const ok = type === 'cash' ? d.price > 0 && d.area > 0 : d.pricePerM2 > 0 && d.area > 0;
      if (!ok && !(await confirmBox('Сохранить без цены?', 'Цена или площадь не указаны — квартира не появится на сайте, пока их не заполните.', 'Сохранить'))) return;
      if (ok && type === 'installment' && !(d.months > 0) && !(await confirmBox('Сохранить без срока?', 'Не указан срок рассрочки — на сайте будет только цена при 100% оплате.', 'Сохранить'))) return;
      const saved = isNewRecord
        ? await api('POST', '/api/admin/apartments', d)
        : await api('PUT', `/api/admin/apartments/${a.id}`, d);
      if (saved.map && saved.map.error) {
        // Квартира сохранена, но ссылку на карту распознать не удалось — остаёмся и показываем почему
        toast('Сохранено, но ссылка на карту не распознана');
        if (isNewRecord) location.hash = `#edit/${saved.id}`;
        else showErr('mapErr', saved.map.error);
        return;
      }
      toast('Сохранено');
      location.hash = '#list';
    };
  }

  // ---------- Мой сайт (настройки) ----------
  async function renderSettings() {
    settings = await api('GET', '/api/admin/settings');
    const s = settings;
    const f = (k, label, type = 'text', hint = '') => `<label class="f"><span>${label}</span><input type="${type}" name="${k}" value="${esc(s[k])}">${hint ? `<div class="hint">${hint}</div>` : ''}</label>`;
    const t = (k, label, hint = '') => `<label class="f"><span>${label}</span><textarea name="${k}" rows="6">${esc(s[k])}</textarea>${hint ? `<div class="hint">${hint}</div>` : ''}</label>`;
    app.innerHTML = `${nav('settings')}<div class="wrap"><h1>Мой сайт</h1>
      <form id="sf">
        <div class="card"><h2 style="margin-top:0">Риелтор</h2>
          <div class="row" style="margin-bottom:12px">
            ${s.photo ? `<img src="${esc(s.photo)}" style="width:72px;height:90px;object-fit:cover;border-radius:10px">` : ''}
            <label class="upload" style="flex:1"><input type="file" id="pf" accept="image/*">📷 ${s.photo ? 'Заменить фото' : 'Загрузить своё фото'}</label>
          </div>
          ${f('name', 'Имя')}
          ${f('role', 'Кем работаете', 'text', 'Например: Риелтор строительной компании «Кут»')}
          ${f('heroKicker', 'Надпись над заголовком')}
          ${f('tagline', 'Заголовок первого экрана')}
          ${t('heroPoints', 'Пункты под кнопками', 'Каждый пункт с новой строки, лучше 2–3 коротких')}
          ${t('about', 'Текст «Обо мне»')}
          ${t('stats', 'Цифры доверия', 'Каждая строка: значение | подпись. Например: 3 года | в недвижимости')}
        </div>
        <div class="card"><h2 style="margin-top:0">Компания и логотип</h2>
          ${f('company', 'Компания', 'text', 'Например: Строительная компания «Кут». Можно оставить пустым.')}
          <div class="row" style="margin-bottom:6px">
            ${s.logo ? `<div class="logo-prev"><img src="${esc(s.logo)}" alt=""></div>` : ''}
            <label class="upload" style="flex:1"><input type="file" id="lf2" accept="image/*">🏷 ${s.logo ? 'Заменить логотип' : 'Загрузить логотип'}</label>
            ${s.logo ? '<button type="button" class="btn btn-danger" id="logoDel">Убрать</button>' : ''}
          </div>
          <div class="hint">Лучше PNG с прозрачным фоном. Без логотипа на сайте показывается только имя.</div>
        </div>
        <div class="card"><h2 style="margin-top:0">Контакты</h2>
          ${f('whatsapp', 'Номер WhatsApp', 'tel', 'С кодом страны, например +996 550 022 508. Сюда приходят все заявки с сайта.')}
          ${f('instagram', 'Instagram', 'text', 'Ник, например @arlen.kut')}
          ${f('officeAddress', 'Адрес офиса')}
          ${f('officeLink', 'Ссылка на офис в 2ГИС')}
        </div>
        <div class="card"><h2 style="margin-top:0">Валюта</h2>
          <div class="grid2">${f('currencyInstallment', 'Рассрочка')}${f('currencyCash', 'Наличные')}</div>
        </div>
        <div class="card"><h2 style="margin-top:0">Блоки главной</h2>
          ${t('steps', 'Как работает рассрочка — шаги', 'Каждый шаг с новой строки')}
          ${t('documents', 'Какие документы нужны', 'Каждый пункт с новой строки')}
          ${t('reviews', 'Отзывы', 'Первая строка — «Имя | дата», дальше текст. Отзывы разделяйте пустой строкой.')}
          ${t('faq', 'Вопросы и ответы', 'Первая строка — вопрос, дальше ответ. Разделяйте пустой строкой.')}
          ${f('ctaTitle', 'Заголовок финального блока')}
          ${t('ctaText', 'Текст финального блока')}
          ${t('privacy', 'Политика конфиденциальности')}
        </div>
        <div class="card"><h2 style="margin-top:0">Уведомления и внешние счётчики</h2>
          ${f('tgToken', 'Telegram-бот: токен', 'password', 'Уведомление о каждом нажатии WhatsApp. Токен — у @BotFather')}
          ${f('tgChat', 'Telegram: chat_id получателя')}
          ${f('gaId', 'Google Analytics 4 (G-XXXX)', 'text', 'Необязательно: своя аналитика уже есть в разделе «Аналитика»')}
          ${f('ymId', 'Яндекс Метрика (номер счётчика)')}
          ${f('pixelId', 'Пиксель Meta (ID)')}
        </div>
        <div class="savebar"><button class="btn btn-primary">Сохранить</button></div>
      </form>
      <form class="card" id="pwf"><h2 style="margin-top:0">Пароль от кабинета</h2>
        <div class="hint" style="margin-bottom:10px">Логин: <b>${esc(me.login)}</b></div>
        <label class="f"><span>Текущий пароль</span><input type="password" name="current" autocomplete="current-password" required></label>
        <label class="f"><span>Новый пароль</span><input type="password" name="next" autocomplete="new-password" minlength="8" required></label>
        <div class="err" id="pwErr"></div>
        <button class="btn">Сменить пароль</button>
      </form>
    </div>`;
    bindNav();
    const form = document.getElementById('sf');
    form.onsubmit = async e => {
      e.preventDefault();
      settings = await api('PUT', '/api/admin/settings', Object.fromEntries(new FormData(form)));
      toast('Сохранено');
    };
    const upload = (input, url, field, done) => {
      document.getElementById(input).onchange = async e => {
        const fl = e.target.files[0]; if (!fl) return;
        const fd = new FormData(); fd.append(field, fl);
        toast('Загрузка…');
        try { settings = await api('POST', url, fd); renderSettings(); toast(done); } catch (err) { toast(err.message); }
      };
    };
    upload('pf', '/api/admin/settings/photo', 'photo', 'Фото обновлено');
    upload('lf2', '/api/admin/settings/logo', 'logo', 'Логотип обновлён');
    const del = document.getElementById('logoDel');
    if (del) del.onclick = async () => { settings = await api('DELETE', '/api/admin/settings/logo'); renderSettings(); };
    document.getElementById('pwf').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      try {
        await api('POST', '/api/admin/password', d);
        me.defaultPassword = false;
        e.target.reset(); showErr('pwErr', '');
        toast('Пароль изменён');
      } catch (err) { showErr('pwErr', err.message); }
    };
  }

  // ---------- Аналитика ----------
  const fmt = n => nf.format(n || 0);
  const dayLabel = d => { const [, m, dd] = d.split('-'); return `${+dd}.${m}`; };
  let anDays = 30;
  let anRealtor = ''; // для владельца: '' — свой кабинет, 'all' — все, или id риелтора

  function delta(cur, prev) {
    if (!prev && !cur) return '';
    if (!prev) return '<span class="up">новое</span>';
    const d = Math.round(((cur - prev) / prev) * 100);
    return d === 0 ? '<span>0%</span>' : `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}%</span>`;
  }

  async function renderAnalytics() {
    const q = new URLSearchParams({ days: anDays });
    if (anRealtor) q.set('realtor', anRealtor);
    const [r, realtors] = await Promise.all([
      api('GET', `/api/admin/analytics?${q}`),
      isOwner() ? api('GET', '/api/owner/realtors') : Promise.resolve([]),
    ]);
    const T = r.totals, P = r.prev;
    const maxDay = Math.max(1, ...r.daily.map(d => d.visitors));
    const maxHour = Math.max(1, ...r.hours);
    const maxSrc = Math.max(1, ...r.sources.map(s => s.visitors));
    const top = r.funnel[0].n || 1;
    const devTotal = (r.devices.mobile + r.devices.desktop) || 1;
    const sources = [['instagram', 'Instagram'], ['whatsapp', 'WhatsApp (статус, рассылка)'], ['telegram', 'Telegram'], ['tiktok', 'TikTok'], ['facebook', 'Facebook'], ['ads', 'Реклама']];
    const myUrl = me.realtor.url;
    const tile = (label, v, p, hint) => `<div class="kpi"><span>${label}</span><b>${v}</b><small>${hint} ${delta(+String(v).replace(/[^\d.]/g, ''), p)}</small></div>`;

    app.innerHTML = `${nav('analytics')}<div class="wrap">
      <div class="row" style="justify-content:space-between;align-items:flex-end"><h1>Аналитика</h1>
        <div class="filters" id="days">${[7, 30, 90].map(d => `<button data-d="${d}" class="${anDays === d ? 'on' : ''}">${d} дней</button>`).join('')}</div>
      </div>
      ${isOwner() ? `<label class="f"><span>Чья аналитика</span><select id="anR">
        <option value="">Мой сайт</option><option value="all" ${anRealtor === 'all' ? 'selected' : ''}>Все риелторы вместе</option>
        ${realtors.filter(x => x.role !== 'owner').map(x => `<option value="${x.id}" ${anRealtor === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
      </select></label>` : ''}

      <div class="kpis">
        ${tile('Посетители', fmt(T.visitors), P.visitors, 'людей')}
        ${tile('Просмотры', fmt(T.views), P.views, 'страниц')}
        ${tile('Заявки в WhatsApp', fmt(T.waVisitors), P.waVisitors, `нажатий: ${fmt(T.wa)}`)}
        <div class="kpi"><span>Конверсия</span><b>${T.conv}%</b><small>из посетителей написали · было ${P.conv}%</small></div>
      </div>
      <p class="hint">Проценты — сравнение с предыдущими ${anDays} днями.</p>

      <div class="card"><h2 style="margin-top:0">По дням</h2>
        <div class="chart">${r.daily.map(d => `<div class="col" title="${dayLabel(d.d)}: посетителей ${d.visitors}, заявок ${d.wa}">
          <div class="bar" style="height:${(d.visitors / maxDay) * 100}%">${d.wa ? `<i style="height:${Math.min(100, (d.wa / Math.max(d.visitors, 1)) * 100)}%"></i>` : ''}</div></div>`).join('')}</div>
        <div class="chart-x"><span>${dayLabel(r.daily[0].d)}</span><span>${dayLabel(r.daily[Math.floor(r.daily.length / 2)].d)}</span><span>${dayLabel(r.daily[r.daily.length - 1].d)}</span></div>
        <div class="legend"><span><i class="lv"></i>посетители</span><span><i class="lw"></i>доля написавших</span></div>
      </div>

      <div class="card"><h2 style="margin-top:0">Воронка</h2>
        ${r.funnel.map((s, i) => `<div class="fn"><div class="fn-l"><span>${s.label}</span><b>${fmt(s.n)}${i ? ` <small>${Math.round((s.n / top) * 100)}%</small>` : ''}</b></div>
          <div class="fn-bar"><i style="width:${(s.n / top) * 100}%"></i></div></div>`).join('')}
        <p class="hint">Сколько людей дошло до каждого шага. Большой провал между шагами — место, которое стоит улучшить.</p>
      </div>

      <div class="card"><h2 style="margin-top:0">Откуда приходят</h2>
        ${r.sources.length ? `<table class="tbl"><tr><th>Источник</th><th>Люди</th><th>Заявки</th><th>Конв.</th></tr>
          ${r.sources.map(s => `<tr><td>${esc(s.label)}<div class="mini-bar"><i style="width:${(s.visitors / maxSrc) * 100}%"></i></div></td><td>${fmt(s.visitors)}</td><td>${fmt(s.wa)}</td><td>${s.conv}%</td></tr>`).join('')}</table>`
        : '<p class="hint">Пока нет данных.</p>'}
      </div>

      <div class="card"><h2 style="margin-top:0">Квартиры</h2>
        ${r.apartments.length ? `<table class="tbl"><tr><th>Квартира</th><th>Люди</th><th>Расчёт</th><th>Заявки</th></tr>
          ${r.apartments.map(a => `<tr><td>${esc(a.label)}${a.cash ? `<div class="hint">хватало на наличные: ${a.cash}</div>` : ''}</td><td>${fmt(a.visitors)}</td><td>${fmt(a.calc)}</td><td><b>${fmt(a.wa)}</b></td></tr>`).join('')}</table>
          <p class="hint">«Расчёт» — сколько раз меняли взнос в калькуляторе. Много просмотров и мало заявок — проверьте цену и фото.</p>`
        : '<p class="hint">Пока нет данных.</p>'}
      </div>

      <div class="grid-2">
        <div class="card"><h2 style="margin-top:0">Где нажимают WhatsApp</h2>
          ${r.places.length ? `<table class="tbl">${r.places.map(p => `<tr><td>${esc(p.label)}</td><td><b>${fmt(p.n)}</b></td></tr>`).join('')}</table>` : '<p class="hint">Пока нет нажатий.</p>'}
        </div>
        <div class="card"><h2 style="margin-top:0">Устройства</h2>
          <div class="dev"><i style="width:${(r.devices.mobile / devTotal) * 100}%"></i></div>
          <div class="legend"><span><i class="lv"></i>телефон и планшет ${Math.round((r.devices.mobile / devTotal) * 100)}%</span><span><i class="lw"></i>компьютер ${Math.round((r.devices.desktop / devTotal) * 100)}%</span></div>
          <h2>Часы активности</h2>
          <div class="chart hours">${r.hours.map((n, h) => `<div class="col" title="${h}:00 — ${n} просмотров"><div class="bar" style="height:${(n / maxHour) * 100}%"></div></div>`).join('')}</div>
          <div class="chart-x"><span>0:00</span><span>12:00</span><span>23:00</span></div>
        </div>
      </div>

      ${anRealtor ? '' : `<div class="card"><h2 style="margin-top:0">Ссылки с метками</h2>
        <p class="hint" style="margin-top:0">Ставьте разные ссылки в разные места — и в «Откуда приходят» будет видно, какой канал приносит заявки.</p>
        ${sources.map(([k, label]) => `<div class="tagrow"><span>${label}</span><code>${esc(myUrl)}?src=${k}</code><button class="btn" data-copy="${esc(myUrl)}?src=${k}">Копировать</button></div>`).join('')}
      </div>`}
    </div>`;
    bindNav();
    document.getElementById('days').onclick = e => { const b = e.target.closest('button'); if (b) { anDays = +b.dataset.d; renderAnalytics(); } };
    const sel = document.getElementById('anR');
    if (sel) sel.onchange = () => { anRealtor = sel.value; renderAnalytics(); };
  }

  // ---------- Владелец: риелторы ----------
  const addMonths = (from, n) => {
    const today = new Date().toISOString().slice(0, 10);
    const d = new Date(`${from && from >= today ? from : today}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    return d.toISOString().slice(0, 10);
  };

  function credentialsText(r, login, password) {
    return `Здравствуйте! Ваш кабинет готов.\n\nВаш сайт для клиентов: ${r.url}\nВход в кабинет: ${r.url}/admin\nЛогин: ${login}\nПароль: ${password}\n\nКак добавить квартиру: «Квартиры» → «+ Добавить» — она сразу появится на вашем сайте. В «Мой сайт» добавьте свой WhatsApp, фото и смените пароль.`;
  }

  function showCredentials(r, login, password, title) {
    const text = credentialsText(r, login, password);
    const box = document.getElementById('creds');
    box.hidden = false;
    box.innerHTML = `<h2 style="margin-top:0">${title}</h2>
      <p class="hint">Пароль показывается только сейчас — скопируйте и отправьте риелтору.</p>
      <pre>${esc(text)}</pre>
      <div class="row"><button class="btn btn-primary" id="credCopy">Скопировать сообщение</button><button class="btn" id="credHide">Скрыть</button></div>`;
    document.getElementById('credCopy').onclick = () => copy(text, 'Сообщение скопировано');
    document.getElementById('credHide').onclick = () => { box.hidden = true; };
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function renderRealtors() {
    if (!isOwner()) { location.hash = '#list'; return; }
    const [list, product, mine] = await Promise.all([api('GET', '/api/owner/realtors'), api('GET', '/api/owner/product'), api('GET', '/api/admin/apartments')]);
    // Сколько квартир в рассрочку скопируется новому риелтору (наличные не копируются)
    const myInstallment = mine.filter(a => a.computed.installment || (typeOf(a) === 'installment' && a.computed.price)).length;
    const others = list.filter(x => x.role !== 'owner');
    const paying = others.filter(x => x.status.active && !x.blocked).length;
    const inMonth = addMonths('', 1);
    const badge = x => `<span class="st st-${x.status.code}">${esc(x.status.label)}</span>`;

    app.innerHTML = `${nav('realtors')}<div class="wrap">
      <h1>Риелторы</h1>
      <div class="kpis">
        <div class="kpi"><span>Риелторов</span><b>${others.length}</b><small>с доступом сейчас: ${paying}</small></div>
        <div class="kpi"><span>Заявок за 30 дней</span><b>${fmt(others.reduce((s, x) => s + x.wa30, 0))}</b><small>у всех риелторов</small></div>
      </div>

      <div class="card" id="creds" hidden></div>

      <details class="card" ${others.length ? '' : 'open'}><summary><b>+ Добавить риелтора</b></summary>
        <form id="nf" style="margin-top:12px">
          <label class="f"><span>Имя риелтора</span><input name="name" required placeholder="Айдана Асанова"></label>
          <div class="grid2">
            <label class="f"><span>Логин</span><input name="login" required autocapitalize="none" spellcheck="false" placeholder="aidana"></label>
            <label class="f"><span>Пароль</span><input name="password" placeholder="придумаем сами"></label>
          </div>
          <label class="f"><span>Адрес сайта</span><div class="slug-in"><span>${esc(location.host)}/</span><input name="slug" autocapitalize="none" spellcheck="false" placeholder="из имени, например aydana"></div></label>
          <label class="f"><span>WhatsApp риелтора</span><input name="whatsapp" type="tel" placeholder="+996 …"></label>
          <div class="grid2">
            <label class="f"><span>Оплачено до</span><input name="paidUntil" type="date" value="${inMonth}"></label>
            <label class="f"><span>Лимит квартир</span><input name="maxApartments" inputmode="numeric" value="30"></label>
          </div>
          <label class="f"><span>Заметка (видите только вы)</span><input name="note" placeholder="Тариф, сумма, контакт…"></label>
          <div class="hint" style="margin:-4px 0 10px">Пустой адрес — возьмём имя латиницей. Пустой пароль — сгенерируем надёжный. Лимит 0 — без ограничения.</div>
          ${myInstallment ? `<label class="check"><input type="checkbox" name="copyApartments" checked> Скопировать мои квартиры в рассрочку (${flats(myInstallment)}) — риелтору не придётся начинать с нуля</label>` : ''}
          <div class="err" id="nfErr"></div>
          <button class="btn btn-primary btn-block">Создать кабинет</button>
        </form>
      </details>

      <div id="rl">${list.map(x => `
        <div class="item rt${x.blocked ? ' is-blocked' : ''}" data-id="${x.id}">
          <div class="rt-head"><div><div class="t">${esc(x.name)} ${x.role === 'owner' ? '<span class="badge badge-installment">Вы</span>' : ''}</div>
            <div class="s">логин: ${esc(x.login)}${x.note ? ` · ${esc(x.note)}` : ''}</div></div>${badge(x)}</div>
          <div class="rt-stats">
            <span><b>${x.apartments}</b>${x.plan.maxApartments ? ` / ${x.plan.maxApartments}` : ''} квартир${x.plan.maxApartments && x.apartments >= x.plan.maxApartments ? ' <span class="st st-ending">лимит исчерпан</span>' : ''}</span>
            <span><b>${fmt(x.visitors30)}</b> посетит.</span>
            <span><b>${fmt(x.wa30)}</b> заявок</span>
            <span>${x.lastActivity ? `посл. визит ${esc(x.lastActivity.slice(0, 10))}` : 'визитов не было'}</span>
          </div>
          <div class="linkrow"><code>${esc(x.url)}</code><button class="btn" data-copy="${esc(x.url)}">Копировать</button><a class="btn" href="${esc(x.url)}" target="_blank">↗</a></div>
          <div class="acts">
            ${x.role === 'owner' ? '' : `<button class="btn" data-act="m1">+1 мес</button>
            <button class="btn" data-act="m3">+3 мес</button>
            <button class="btn" data-act="date">Дата…</button>
            <button class="btn" data-act="limit">Лимит…</button>`}
            <button class="btn" data-act="stats">Аналитика</button>
            ${x.role === 'owner' ? '' : x.blocked
              ? '<button class="btn btn-danger-fill" data-act="block">🔒 Заблокирован · Разблокировать</button>'
              : '<button class="btn" data-act="block">Заблокировать</button>'}
            <button class="btn" data-act="pass">Новый пароль</button>
            <button class="btn" data-act="login">Логин…</button>
            <button class="btn" data-act="slug">Адрес…</button>
            ${x.role === 'owner' ? '' : '<button class="btn btn-danger" data-act="del">Удалить</button>'}
          </div>
        </div>`).join('')}</div>

      <details class="card"><summary><b>Главная страница сервиса</b></summary>
        <form id="pfm" style="margin-top:12px">
          <div class="hint" style="margin-bottom:10px">Это страница по адресу ${esc(location.origin)}/ — её видят риелторы, которых вы приглашаете.</div>
          <label class="f"><span>Название сервиса</span><input name="name" value="${esc(product.name)}"></label>
          <label class="f"><span>Описание</span><textarea name="tagline" rows="3">${esc(product.tagline)}</textarea></label>
          <label class="f"><span>Ваш WhatsApp для заявок от риелторов</span><input name="whatsapp" type="tel" value="${esc(product.whatsapp)}"></label>
          <label class="f"><span>Цена (текст)</span><input name="priceText" value="${esc(product.priceText)}" placeholder="Например: 1 500 сом в месяц, первая неделя бесплатно"></label>
          <label class="f"><span>Что открывать по адресу ${esc(location.host)}/</span><select name="rootRealtorId">
            <option value="">Страницу сервиса для риелторов</option>
            ${list.map(x => `<option value="${x.id}" ${product.rootRealtorId === x.id ? 'selected' : ''}>Сайт риелтора: ${esc(x.name)}</option>`).join('')}
          </select></label>
          <button class="btn btn-primary">Сохранить</button> <a class="btn" href="/" target="_blank">Открыть ↗</a>
        </form>
      </details>
    </div>`;
    bindNav();

    document.getElementById('nf').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      d.copyApartments = !!e.target.copyApartments && e.target.copyApartments.checked;
      try {
        const res = await api('POST', '/api/owner/realtors', d);
        await renderRealtors();
        showCredentials(res.realtor, res.realtor.login, res.password, `Кабинет для «${res.realtor.name}» создан${res.copied ? ` · скопировано ${flats(res.copied)}` : ''}`);
      } catch (err) { showErr('nfErr', err.message); }
    };

    document.getElementById('pfm').onsubmit = async e => {
      e.preventDefault();
      await api('PUT', '/api/owner/product', Object.fromEntries(new FormData(e.target)));
      toast('Сохранено');
    };

    document.getElementById('rl').onclick = async e => {
      const el = e.target.closest('[data-id]'); const act = e.target.closest('[data-act]');
      if (!el || !act) return;
      const x = list.find(r => r.id === el.dataset.id);
      const put = body => api('PUT', `/api/owner/realtors/${x.id}`, body);
      try {
        switch (act.dataset.act) {
          case 'm1': await put({ paidUntil: addMonths(x.plan.paidUntil, 1) }); toast('Продлено на месяц'); break;
          case 'm3': await put({ paidUntil: addMonths(x.plan.paidUntil, 3) }); toast('Продлено на 3 месяца'); break;
          case 'date': {
            const v = await modal({
              title: `Оплачено до — ${x.name}`, text: 'Сайт работает до этой даты включительно. Очистите поле — будет без ограничения срока.',
              input: { type: 'date', value: x.plan.paidUntil || '' }, okText: 'Сохранить',
            });
            if (v === null) return;
            await put({ paidUntil: v }); toast(v ? `Оплачено до ${v}` : 'Без ограничения срока'); break;
          }
          case 'limit': {
            const v = await modal({
              title: `Лимит квартир — ${x.name}`,
              text: `Сейчас у риелтора ${x.apartments} квартир. 0 — без ограничения. Если поставить меньше, чем есть, квартиры не удалятся — просто нельзя будет добавлять новые.`,
              input: { value: String(x.plan.maxApartments || 0), inputmode: 'numeric', validate: v => (/^[0-9]{1,4}$/.test(v) ? '' : 'Введите число, например 30') },
              okText: 'Сохранить',
            });
            if (v === null) return;
            await put({ maxApartments: v }); toast(+v ? `Лимит: ${v} квартир` : 'Без ограничения'); break;
          }
          case 'login': {
            const v = await modal({
              title: `Логин — ${x.name}`, text: 'Латиница, цифры, точка или дефис, от 3 символов. Пароль не меняется.',
              input: { value: x.login, validate: v => (/^[a-z0-9._-]{3,32}$/.test(v.toLowerCase()) ? '' : 'Только латиница, цифры, точка и дефис, от 3 до 32 символов') },
              okText: 'Сохранить',
            });
            if (v === null || v.toLowerCase() === x.login) return;
            await put({ login: v.toLowerCase() });
            if (x.role === 'owner') me = await api('GET', '/api/admin/me');
            toast('Логин изменён'); break;
          }
          case 'stats': anRealtor = x.role === 'owner' ? '' : x.id; location.hash = '#analytics'; return;
          case 'block':
            if (!x.blocked && !(await confirmBox(`Заблокировать «${x.name}»?`, 'Его сайт для клиентов сразу отключится, а в кабинете он увидит, что доступ закрыт. Разблокировать можно в любой момент.', 'Заблокировать', true))) return;
            await put({ blocked: !x.blocked }); break;
          case 'pass': {
            if (!(await confirmBox(`Новый пароль для «${x.name}»?`, 'Старый пароль перестанет работать, и риелтор выйдет из кабинета на всех устройствах. Новый пароль покажем один раз.', 'Выдать пароль'))) return;
            const r = await api('POST', `/api/owner/realtors/${x.id}/password`);
            await renderRealtors();
            showCredentials(x, x.login, r.password, `Новый пароль для «${x.name}»`);
            return;
          }
          case 'slug': {
            const v = await modal({
              title: `Адрес сайта — ${x.name}`, text: `Латиница, цифры, дефис. Старый адрес (${location.host}/${x.slug}) продолжит работать и будет вести на новый.`,
              input: { value: x.slug, validate: v => (/^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/.test(v.toLowerCase()) ? '' : 'Только латиница, цифры и дефис') },
              okText: 'Сохранить',
            });
            if (v === null || v.toLowerCase() === x.slug) return;
            await put({ slug: v.toLowerCase() });
            if (x.role === 'owner') me = await api('GET', '/api/admin/me');
            toast('Адрес изменён'); break;
          }
          case 'del':
            if ((await modal({
              title: `Удалить «${x.name}»?`, text: `Удалятся кабинет, сайт и все квартиры (${x.apartments}). Это не отменить. Чтобы подтвердить, напишите УДАЛИТЬ.`,
              input: { placeholder: 'УДАЛИТЬ', validate: v => (v.toUpperCase() === 'УДАЛИТЬ' ? '' : 'Напишите слово УДАЛИТЬ') }, okText: 'Удалить навсегда', danger: true,
            })) === null) return;
            await api('DELETE', `/api/owner/realtors/${x.id}`); toast('Удалено'); break;
        }
        renderRealtors();
      } catch (err) { toast(err.message); }
    };
  }

  // ---------- Маршрутизация ----------
  async function route() {
    const h = location.hash.slice(1) || 'list';
    window.scrollTo(0, 0);
    try {
      if (h.startsWith('edit/')) await renderEdit(h.slice(5));
      else if (h === 'settings') await renderSettings();
      else if (h === 'analytics' || h === 'stats') await renderAnalytics();
      else if (h === 'realtors') await renderRealtors();
      else await renderList();
    } catch (e) { if (e.message !== 'auth') toast(e.message); }
  }

  async function start() {
    try {
      me = await api('GET', '/api/admin/me');
      // Пришли по ссылке «/имя/admin» другого риелтора — показываем вход, а не текущий кабинет
      const want = new URLSearchParams(location.search).get('u');
      if (want && want !== me.login) { renderLogin(); return; }
      settings = await api('GET', '/api/admin/settings');
      window.onhashchange = route;
      route();
    } catch (e) { /* показан вход */ }
  }
  start();
})();
