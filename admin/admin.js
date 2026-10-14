// Админка: квартиры, настройки, статистика. Рассчитана на телефон.
// Статусов нет: квартира либо на сайте, либо удалена.
(function () {
  const app = document.getElementById('app');
  const TYPES = { installment: 'Рассрочка', cash: 'Наличные' };
  const typeOf = a => (a.type === 'cash' || a.type === 'resale' ? 'cash' : 'installment');
  const nf = new Intl.NumberFormat('ru-RU');
  let settings = null;
  let listFilter = 'all';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cur = type => (type === 'cash' ? settings.currencyCash || '$' : settings.currencyInstallment || 'сом');
  const money = (n, c) => (n == null ? '—' : `${nf.format(Math.round(n))} ${c}`);
  const rooms = r => (+r === 0 ? 'Студия' : `${r}-комн.`);

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1800);
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
  function renderLogin() {
    app.innerHTML = `<form class="login" id="lf">
      <h1>Вход в админку</h1>
      <label class="f"><span>Пароль</span><input type="password" id="pw" autocomplete="current-password" required></label>
      <div class="err" id="le"></div>
      <button class="btn btn-primary btn-block">Войти</button>
    </form>`;
    document.getElementById('lf').onsubmit = async e => {
      e.preventDefault();
      try {
        await api('POST', '/api/admin/login', { password: document.getElementById('pw').value });
        start();
      } catch (err) { document.getElementById('le').textContent = err.message; }
    };
  }

  function nav(active) {
    return `<div class="top"><div class="wrap">
      <a href="#list" class="${active === 'list' ? 'on' : ''}">Квартиры</a>
      <a href="#settings" class="${active === 'settings' ? 'on' : ''}">Настройки</a>
      <a href="#stats" class="${active === 'stats' ? 'on' : ''}">Статистика</a>
      <span class="sp"></span>
      <a href="/" target="_blank">Сайт ↗</a>
      <button id="logout">Выйти</button>
    </div></div>`;
  }
  function bindNav() {
    document.getElementById('logout').onclick = async () => { await api('POST', '/api/admin/logout'); renderLogin(); };
  }

  // ---------- Список квартир ----------
  async function renderList() {
    const apts = await api('GET', '/api/admin/apartments');
    const count = t => apts.filter(a => typeOf(a) === t).length;
    const shown = listFilter === 'all' ? apts : apts.filter(a => typeOf(a) === listFilter);
    app.innerHTML = `${nav('list')}<div class="wrap">
      <div class="row" style="justify-content:space-between"><h1>Квартиры</h1><a class="btn btn-primary" href="#edit/new">+ Добавить</a></div>
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
    document.getElementById('items').onclick = async e => {
      const el = e.target.closest('[data-id]'); const act = e.target.closest('[data-act]');
      if (!el || !act) return;
      const id = el.dataset.id;
      if (act.dataset.act === 'edit') location.hash = `#edit/${id}`;
      if (act.dataset.act === 'dup') {
        const a = await api('POST', `/api/admin/apartments/${id}/duplicate`);
        toast('Копия создана');
        location.hash = `#edit/${a.id}`;
      }
      if (act.dataset.act === 'del') {
        if (!confirm('Удалить квартиру с сайта? Например, если она продана.')) return;
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
        ${c.price ? `<a class="btn" href="/kvartira/${a.id}" target="_blank">Открыть ↗</a>` : ''}
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
    form.onsubmit = async e => {
      e.preventDefault();
      const d = readForm();
      const ok = type === 'cash' ? d.price > 0 && d.area > 0 : d.pricePerM2 > 0 && d.area > 0;
      if (!ok && !confirm('Цена или площадь не указаны — квартира не появится на сайте. Сохранить?')) return;
      if (ok && type === 'installment' && !(d.months > 0) && !confirm('Не указан срок рассрочки — на сайте будет только цена при 100% оплате. Сохранить?')) return;
      const saved = isNewRecord
        ? await api('POST', '/api/admin/apartments', d)
        : await api('PUT', `/api/admin/apartments/${a.id}`, d);
      if (saved.map && saved.map.error) {
        // Квартира сохранена, но ссылку на карту распознать не удалось — остаёмся и показываем почему
        toast('Сохранено, но ссылка на карту не распознана');
        if (isNewRecord) location.hash = `#edit/${saved.id}`;
        else document.getElementById('mapErr').textContent = saved.map.error;
        return;
      }
      toast('Сохранено');
      location.hash = '#list';
    };
  }

  // ---------- Настройки ----------
  async function renderSettings() {
    settings = await api('GET', '/api/admin/settings');
    const s = settings;
    const f = (k, label, type = 'text', hint = '') => `<label class="f"><span>${label}</span><input type="${type}" name="${k}" value="${esc(s[k])}">${hint ? `<div class="hint">${hint}</div>` : ''}</label>`;
    const t = (k, label, hint = '') => `<label class="f"><span>${label}</span><textarea name="${k}" rows="6">${esc(s[k])}</textarea>${hint ? `<div class="hint">${hint}</div>` : ''}</label>`;
    app.innerHTML = `${nav('settings')}<div class="wrap"><h1>Настройки сайта</h1>
      <form id="sf">
        <div class="card"><h2 style="margin-top:0">Риелтор</h2>
          <div class="row" style="margin-bottom:12px">
            ${s.photo ? `<img src="${esc(s.photo)}" style="width:72px;height:90px;object-fit:cover;border-radius:10px">` : ''}
            <label class="upload" style="flex:1"><input type="file" id="pf" accept="image/*">📷 ${s.photo ? 'Заменить фото' : 'Загрузить фото'}</label>
          </div>
          ${f('name', 'Имя')}
          ${f('role', 'Кем работаете', 'text', 'Например: Риелтор строительной компании «Кут»')}
          ${f('heroKicker', 'Надпись над заголовком')}
          ${f('tagline', 'Заголовок первого экрана')}
          ${t('heroPoints', 'Пункты под кнопками', 'Каждый пункт с новой строки, лучше 2–3 коротких')}
          ${t('about', 'Текст «Обо мне»')}
          ${t('stats', 'Цифры доверия', 'Каждая строка: значение | подпись. Например: 1 год | в компании «Кут»')}
        </div>
        <div class="card"><h2 style="margin-top:0">Контакты</h2>
          ${f('whatsapp', 'Номер WhatsApp', 'tel', 'С кодом страны, например +996 550 022 508')}
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
        <div class="card"><h2 style="margin-top:0">Аналитика и уведомления</h2>
          ${f('gaId', 'Google Analytics 4 (G-XXXX)')}
          ${f('ymId', 'Яндекс Метрика (номер счётчика)')}
          ${f('pixelId', 'Пиксель Meta (ID)')}
          ${f('tgToken', 'Telegram-бот: токен', 'password', 'Уведомление о каждом нажатии WhatsApp. Токен — у @BotFather')}
          ${f('tgChat', 'Telegram: chat_id получателя')}
        </div>
        <div class="savebar"><button class="btn btn-primary">Сохранить настройки</button></div>
      </form></div>`;
    bindNav();
    const form = document.getElementById('sf');
    form.onsubmit = async e => {
      e.preventDefault();
      settings = await api('PUT', '/api/admin/settings', Object.fromEntries(new FormData(form)));
      toast('Сохранено');
    };
    document.getElementById('pf').onchange = async e => {
      const fl = e.target.files[0]; if (!fl) return;
      const fd = new FormData(); fd.append('photo', fl);
      toast('Загрузка…');
      settings = await api('POST', '/api/admin/settings/photo', fd);
      renderSettings(); toast('Фото обновлено');
    };
  }

  // ---------- Статистика ----------
  async function renderStats() {
    const st = await api('GET', '/api/admin/stats');
    const places = { card: 'Карточка в списке', apartment: 'Страница квартиры', 'apartment-tab': 'Меню на странице квартиры', hero: 'Первый экран', cta: 'Финальный блок', tabbar: 'Нижнее меню', footer: 'Подвал', empty: '«Подберу вручную»', gone: 'Проданная квартира' };
    app.innerHTML = `${nav('stats')}<div class="wrap"><h1>Нажатия WhatsApp</h1>
      <div class="stat-grid">
        <div><b>${st.last30}</b>за 30 дней</div><div><b>${st.total}</b>всего</div>
        <div><b>${st.counts.installment}</b>в рассрочку на сайте</div><div><b>${st.counts.cash}</b>за наличные на сайте</div>
      </div>
      <h2>Откуда нажимают (30 дней)</h2>
      <table>${Object.entries(st.byType).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<tr><td>${esc(places[k] || k)}</td><td style="text-align:right"><b>${n}</b></td></tr>`).join('') || '<tr><td>Пока нет данных</td></tr>'}</table>
      <h2>Популярные квартиры (30 дней)</h2>
      <table>${st.top.map(x => `<tr><td>${esc(x.label)}</td><td style="text-align:right"><b>${x.n}</b></td></tr>`).join('') || '<tr><td>Пока нет данных</td></tr>'}</table>
    </div>`;
    bindNav();
  }

  // ---------- Маршрутизация ----------
  async function route() {
    const h = location.hash.slice(1) || 'list';
    window.scrollTo(0, 0);
    try {
      if (h.startsWith('edit/')) await renderEdit(h.slice(5));
      else if (h === 'settings') await renderSettings();
      else if (h === 'stats') await renderStats();
      else await renderList();
    } catch (e) { if (e.message !== 'auth') toast(e.message); }
  }

  async function start() {
    try {
      settings = await api('GET', '/api/admin/settings');
      window.onhashchange = route;
      route();
    } catch (e) { /* показан вход */ }
  }
  start();
})();
