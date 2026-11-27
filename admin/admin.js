// Кабинет менеджера: квартиры, свой сайт, подробная аналитика.
// Владелец сервиса (role: owner) дополнительно видит раздел «Менеджеры»: доступы, оплата, лимиты.
// Рассчитан на телефон. Статусов у квартир нет: квартира либо на сайте, либо удалена.
(function () {
  const app = document.getElementById('app');
  const TYPES = { installment: 'Рассрочка', commercial: 'Коммерция', cash: 'Наличные', land: 'Участок' };
  const typeOf = a => (a.type === 'cash' || a.type === 'resale' ? 'cash' : a.type === 'commercial' || a.type === 'land' ? a.type : 'installment');
  // Наличные и участки — одна цена в $, без рассрочки; у участка площадь в сотках
  const cashLike = t => t === 'cash' || t === 'land';
  // Подпись и пример для поля «Название» в зависимости от вида объекта
  const TITLE_HINT = {
    installment: ['Название (ЖК / дом)', 'Например: ЖК «Ала-Тоо Резиденс»'],
    cash: ['Название (ЖК / дом)', 'Например: дом у парка, ЖК «Ала-Тоо»'],
    commercial: ['Название (ЖК / бизнес-центр)', 'Например: БЦ «Орион», ЖК «Ала-Тоо»'],
    land: ['Район или массив', 'Например: Арча-Бешик, Ак-Орго, Кок-Жар'],
  };
  const nf = new Intl.NumberFormat('ru-RU');
  let settings = null;
  let me = null; // { login, role, defaultPassword, realtor: { url, status, plan, count }, product }
  let listFilter = 'all';
  let listQuery = '';   // поиск в списке квартир
  let profileTab = 'main'; // открытая вкладка «Профиля»

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cur = type => (cashLike(type) ? settings.currencyCash || '$' : settings.currencyInstallment || 'сом');
  const money = (n, c) => (n == null ? '—' : `${nf.format(Math.round(n))} ${c}`);
  const rooms = r => (+r === 0 ? 'Студия' : `${r}-комн.`);
  const isOwner = () => me && me.role === 'owner';
  // 1 квартира, 2 квартиры, 5 квартир
  const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? few : many; };
  const flats = n => `${n} ${plural(n, 'квартира', 'квартиры', 'квартир')}`;
  // Выбор города в окнах копирования квартир
  const citySelect = () => `<label class="f" style="margin:14px 0 4px"><span>Какие квартиры</span><select id="mCity"><option value="">Все города</option><option>Бишкек</option><option>Ош</option></select></label>`;

  // Текст ошибки в элемент формы; если формы уже нет на экране (например, сессия истекла) — всплывающим сообщением
  const showErr = (id, msg) => { const el = document.getElementById(id); if (el) el.textContent = msg; else if (msg && msg !== 'auth') toast(msg); };

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    // Длинное сообщение показываем дольше, чтобы успеть прочитать
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), Math.min(6000, 2000 + String(msg).length * 40));
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

  // ---------- Кабинет как приложение на телефоне (иконка на главном экране) ----------
  // Android/Chrome сам предлагает установку (beforeinstallprompt) — запоминаем и показываем по нашей кнопке.
  // На iPhone установки по кнопке нет — показываем, где нажать в Safari. Плашку можно скрыть, она больше не появится.
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });
  const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const installHidden = () => { try { return localStorage.getItem('installHide') === '1'; } catch (e) { return false; } };
  function installBanner() {
    if (isInstalled() || installHidden()) return '';
    return `<div class="install" id="inst">
      <img src="/img/brand/icon-192.png" alt="" width="44" height="44">
      <div class="install-txt"><b>Кабинет как приложение</b><span>Иконка на экране телефона — открывается одним нажатием</span></div>
      <button type="button" class="btn btn-primary" id="instGo">Установить</button>
      <button type="button" class="install-x" id="instX" aria-label="Скрыть">×</button>
    </div>`;
  }
  function bindInstall() {
    const go = document.getElementById('instGo'); if (!go) return;
    document.getElementById('instX').onclick = () => {
      try { localStorage.setItem('installHide', '1'); } catch (e) {}
      document.getElementById('inst').remove();
    };
    go.onclick = async () => {
      if (installPrompt) {
        installPrompt.prompt();
        const r = await installPrompt.userChoice.catch(() => null);
        installPrompt = null;
        if (r && r.outcome === 'accepted') { const b = document.getElementById('inst'); if (b) b.remove(); toast('Кабинет установлен'); }
        return;
      }
      const ua = navigator.userAgent;
      const ios = /iPhone|iPad|iPod/i.test(ua);
      const android = /Android/i.test(ua);
      const html = ios
        ? '<ol class="howto-list"><li>Откройте кабинет в <b>Safari</b></li><li>Нажмите <b>«Поделиться»</b> — квадрат со стрелкой вверх внизу экрана</li><li>Выберите <b>«На экран «Домой»»</b> и нажмите <b>«Добавить»</b></li></ol>'
        : android
          ? '<ol class="howto-list"><li>Откройте кабинет в <b>Chrome</b></li><li>Нажмите <b>⋮</b> — три точки справа вверху</li><li>Выберите <b>«Установить приложение»</b> или <b>«Добавить на главный экран»</b></li></ol>'
          : '<ol class="howto-list"><li>Откройте кабинет в <b>Chrome</b> или <b>Edge</b></li><li>В адресной строке справа нажмите значок установки <b>⊕</b> (или меню <b>⋮</b> → «Установить»)</li></ol>';
      modal({ title: 'Как установить кабинет', html, okText: 'Понятно', cancelText: '' });
    };
  }

  // «Шторка» действий снизу, как в iOS: actionSheet('Название', [{ key, label, danger }]) → key или null
  function actionSheet(title, items) {
    return new Promise(resolve => {
      const wrap = document.createElement('div');
      wrap.className = 'modal sheet';
      wrap.innerHTML = `<div class="sheet-box" role="dialog" aria-modal="true">
        <div class="sheet-group">
          ${title ? `<div class="sheet-title">${esc(title)}</div>` : ''}
          ${items.map(i => `<button type="button" class="sheet-btn${i.danger ? ' danger' : ''}" data-k="${esc(i.key)}">${esc(i.label)}</button>`).join('')}
        </div>
        <button type="button" class="sheet-btn sheet-cancel" data-k="">Отмена</button>
      </div>`;
      document.body.appendChild(wrap);
      const close = v => { wrap.remove(); document.removeEventListener('keydown', key); resolve(v); };
      const key = e => { if (e.key === 'Escape') close(null); };
      document.addEventListener('keydown', key);
      wrap.onclick = e => {
        if (e.target === wrap) return close(null);
        const b = e.target.closest('[data-k]'); if (b) close(b.dataset.k || null);
      };
      requestAnimationFrame(() => wrap.classList.add('open'));
    });
  }

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
  // Обложка входа: зачем кабинет менеджеру + форма входа + связь с владельцем сервиса (новый кабинет, техподдержка)
  const WA_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.5 1.1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>';
  const SKYLINE = '<svg class="auth-sky" viewBox="0 0 600 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><path d="M0 220V150h40v-40h30v40h20V90h50v130M140 220V120h28V70h34v50h22v100M224 220V40h60v180M284 220V100h44v-30h30v150M358 220V130h40v-50h46v140M444 220V60h56v160M500 220V140h36v-30h34v110h30" /><path class="win" d="M236 60h8M256 60h8M236 84h8M256 84h8M236 108h8M256 108h8M456 82h8M476 82h8M456 106h8M476 106h8M180 92h8M108 112h8M376 102h8" /></svg>';
  const fmtPhone = p => String(p || '').replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})(\d{3})$/, '+$1 $2 $3 $4');
  const waTo = (p, text) => `https://wa.me/${String(p).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

  // Почему снова показан вход (например, «долго не пользовались») — показывается один раз
  let loginNote = '';
  async function renderLogin() {
    stopIdle();
    const preLogin = esc(new URLSearchParams(location.search).get('u') || '');
    app.innerHTML = `<div class="auth">
      <section class="auth-cover">
        ${SKYLINE}
        <div class="auth-cover-in">
          <img class="auth-logo" src="/img/brand/logo.png" alt="kvartiry.asia" width="160" height="111">
          <div class="auth-kicker">Кабинет менеджера</div>
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
          <label class="check remember"><input type="checkbox" id="rm"> <span>Это мой телефон или компьютер — не выходить</span></label>
          <p class="hint remember-hint">На чужом устройстве не ставьте галочку: кабинет сам закроется через час без действий или когда закроете вкладку.</p>
          ${loginNote ? `<p class="note-box">${esc(loginNote)}</p>` : ''}
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
          <a class="auth-wa" href="${esc(waTo(p.whatsapp, 'Здравствуйте! Хочу открыть себе кабинет менеджера.'))}" target="_blank" rel="noopener">${WA_SVG}Открыть кабинет</a>
          <a class="auth-wa ghost" href="${esc(waTo(p.whatsapp, 'Здравствуйте! Нужна техподдержка по кабинету менеджера.'))}" target="_blank" rel="noopener">Техподдержка</a>
        </div>
        <a class="auth-phone" href="${esc(waTo(p.whatsapp, 'Здравствуйте!'))}" target="_blank" rel="noopener">WhatsApp ${esc(fmtPhone(p.whatsapp))}</a>`;
    }).catch(() => {});
    loginNote = '';
    // Пока сервер отвечает, кнопка показывает «Входим…» (после неверного пароля сервер нарочно ждёт до 5 секунд).
    // Нет ответа 20 секунд — пишем, что нет связи, вместо «мёртвой» кнопки.
    document.getElementById('lf').onsubmit = async e => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      if (btn.disabled) return;
      btn.disabled = true; btn.textContent = 'Входим…'; showErr('le', '');
      const slow = setTimeout(() => showErr('le', 'Интернет медленный — ждём ответа сервера…'), 6000);
      try {
        await Promise.race([
          api('POST', '/api/admin/login', { login: document.getElementById('lg').value, password: document.getElementById('pw').value, remember: document.getElementById('rm').checked }),
          new Promise((_, no) => setTimeout(() => no(new Error('Нет связи с сервером. Проверьте интернет (или выключите VPN) и попробуйте ещё раз.')), 20000)),
        ]);
        clearTimeout(slow);
        start();
      } catch (err) {
        clearTimeout(slow);
        showErr('le', err.message === 'Failed to fetch' || err.name === 'TypeError' ? 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.' : err.message);
        btn.disabled = false; btn.textContent = 'Войти';
      }
    };
  }

  const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const NAV = [
    ['list', 'Квартиры', svg('<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>')],
    ['analytics', 'Аналитика', svg('<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>')],
    ['site', 'Сайт', svg('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'), false, true],
    ['settings', 'Профиль', svg('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>')],
    ['realtors', 'Менеджеры', svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>'), true],
  ];

  // Верхнее меню — на ноутбуке; на телефоне и планшете — нижнее меню (как на сайте)
  function nav(active) {
    const items = NAV.filter(([h, , , ownerOnly]) => (!ownerOnly || isOwner()));
    // «Сайт» открывает свой сайт для клиентов в новой вкладке, остальные пункты — разделы кабинета
    const href = (h, ext) => (ext ? `href="${esc(me.realtor.url)}" target="_blank" rel="noopener"` : `href="#${h}"`);
    const top = items.map(([h, label, , , ext]) => `<a ${href(h, ext)} class="tl${active === h ? ' on' : ''}${ext ? ' ext' : ''}">${label}${ext ? ' ↗' : ''}</a>`).join('');
    const bottom = items.map(([h, label, icon, , ext]) => `<a ${href(h, ext)} class="${active === h ? 'on' : ''}${ext ? ' ext' : ''}">${icon}<span>${label}</span></a>`).join('');
    return `<div class="top"><div class="wrap">
      <span class="top-title">${esc(me.realtor.name)}</span>
      ${top}
      <span class="sp"></span>
      <button id="logout">Выйти</button>
    </div></div>${banner(active)}
    <nav class="atab" aria-label="Меню кабинета">${bottom}</nav>`;
  }

  // Ссылка для клиентов и предупреждения: оплата, пароль по умолчанию
  function banner(active) {
    const r = me.realtor, st = r.status;
    const warn = [];
    if (!st.active) warn.push(`<div class="warn bad">${esc(st.label)}. Сайт для клиентов отключён — ${me.product.whatsapp ? `<a href="https://wa.me/${esc(me.product.whatsapp.replace(/\D/g, ''))}" target="_blank">напишите владельцу сервиса</a>` : 'свяжитесь с владельцем сервиса'}, чтобы продлить.</div>`);
    if (me.defaultPassword) warn.push(`<div class="warn bad">У вас пароль по умолчанию. <a href="#settings">Смените его</a> — иначе в кабинет может войти кто угодно.</div>`);
    // Без номера WhatsApp заявки с сайта никуда не уходят — поэтому кнопки WhatsApp на сайте скрыты, пока номера нет
    // (на главной «Квартир», пока видны «4 шага», это уже сказано во 2-м шаге)
    const stepsShown = active === 'list' && !/^#(edit|zk)/.test(location.hash) && !!setupBox();
    if (!hasWa() && !stepsShown) warn.push(`<div class="warn bad">Укажите номер WhatsApp — без него клиенты не смогут вам написать, кнопки WhatsApp на вашем сайте скрыты. ${active === 'settings' ? 'Поле «Номер WhatsApp» — ниже, в разделе «Контакты».' : '<a href="#settings">Указать номер</a>'}</div>`);
    // Главная страница «Квартир» (не форма квартиры и не ЖК)
    const home = active === 'list' && !/^#(edit|zk)/.test(location.hash);
    const steps = home ? setupBox() : '';
    // Ссылку для клиентов показываем только на «Квартирах» — на остальных страницах есть кнопка «Сайт ↗».
    // Пока новый менеджер проходит «4 шага», ссылка — внутри шагов, отдельный блок не нужен.
    const link = home && !steps ? `
      <div class="linkbox"><span>Ваша ссылка для клиентов</span>
        <div class="linkrow"><code>${esc(r.url)}</code>
          <button class="btn" data-copy="${esc(r.url)}">Копировать</button></div>
        <div class="hint" style="margin-top:6px">Вход в кабинет с телефона: <b>${esc(r.url)}/admin</b></div>
      </div>` : '';
    // Тариф: полностью — в «Профиле», на «Квартирах» — одна строка (и только когда есть что сказать)
    const plan = active === 'settings' ? tariffBox() : home ? tariffLine() : '';
    // «Приведите менеджера» — когда сайт уже наполнен, новичку сначала нужно настроить свой
    const refer = home && !steps && (aptCount || r.count) ? referBox() : '';
    if (!warn.length && !steps && !link && !plan && !refer) return '';
    return `<div class="wrap wrap-banner">${warn.join('')}${steps}${plan}${refer}${link}</div>`;
  }

  const hasWa = () => !!String((settings && settings.whatsapp) || '').replace(/\D/g, '');
  // ---------- «Начните за 4 шага» — для нового менеджера, пока не всё сделано ----------
  // Шаги 1–3 видны по данным (фото, WhatsApp, квартиры), шаг 4 — отмечаем, когда менеджер открыл свой сайт.
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* приватный режим */ } };
  const siteSeenKey = () => `siteSeen_${me.login}`;
  function setupBox() {
    if (isOwner() || lsGet(`setupHide_${me.login}`) === '1') return '';
    const r = me.realtor;
    const done = [!!(settings && settings.photo), hasWa(), !!(aptCount || r.count), lsGet(siteSeenKey()) === '1'];
    // Фото, WhatsApp и квартиры уже есть — менеджер не новичок, шаги не показываем (свой сайт он и так открывал)
    if (done[0] && done[1] && done[2]) return '';
    const items = [
      ['Загрузите своё фото', 'Клиенты охотнее пишут, когда видят человека', '#settings', 'Загрузить'],
      ['Укажите номер WhatsApp', 'Сюда придут заявки. Пока номера нет, кнопки WhatsApp на сайте скрыты', '#settings', 'Указать'],
      ['Добавьте ЖК и первую квартиру', 'Цена за м², взнос и срок — расчёт сделает сайт', '#zk-new', 'Добавить'],
      ['Откройте свой сайт', r.url.replace(/^https?:\/\//, ''), r.url, 'Открыть'],
    ];
    const n = done.filter(Boolean).length;
    return `<div class="setup">
      <div class="setup-head"><b>Начните за 4 шага</b><span>${n} из 4</span></div>
      <div class="setup-bar"><i style="width:${n * 25}%"></i></div>
      <ol class="setup-list">${items.map(([t, sub, href, btn], i) => `<li class="${done[i] ? 'ok' : ''}">
        <span class="setup-n">${done[i] ? '✓' : i + 1}</span>
        <span class="setup-t"><b>${t}</b><small>${esc(sub)}</small></span>
        ${done[i] ? '' : `<a class="btn${i === done.indexOf(false) ? ' btn-primary' : ''}" href="${esc(href)}"${i === 3 ? ' target="_blank" rel="noopener" data-site-open' : ''}>${btn}</a>`}
      </li>`).join('')}</ol>
      ${n >= 2 ? `<div class="setup-foot"><button type="button" class="setup-x" data-setup-hide>Скрыть подсказку</button></div>` : ''}
    </div>`;
  }
  // Открыл свой сайт (из шагов или кнопкой «Сайт ↗») — шаг 4 выполнен
  document.addEventListener('click', e => {
    if (!me) return;
    if (e.target.closest('[data-site-open], a.ext')) { lsSet(siteSeenKey(), '1'); setTimeout(() => { if (!/^#(edit|zk)/.test(location.hash)) route(); }, 300); }
    if (e.target.closest('[data-setup-hide]')) { lsSet(`setupHide_${me.login}`, '1'); route(); }
  });

  // Тариф одной строкой на «Квартирах»: срок и лимит. Без срока и без лимита — не показываем вовсе.
  function tariffLine() {
    if (isOwner()) return '';
    const plan = me.realtor.plan || {}, until = plan.paidUntil, max = Number(plan.maxApartments) || 0;
    if (!until && !max) return '';
    const days = until ? Math.round((Date.parse(until) - Date.parse(new Date().toISOString().slice(0, 10))) / 864e5) : null;
    const tone = days === null ? '' : days < 0 ? ' bad' : days <= 5 ? ' warn-t' : '';
    const parts = [];
    if (days !== null) parts.push(days < 0 ? `оплата закончилась ${fmtDate(until)}` : days === 0 ? 'последний день оплаты' : `оплачено до ${fmtDate(until)} · осталось ${days} ${daysWord(days)}`);
    if (max) parts.push(`квартир ${aptCount || me.realtor.count || 0} из ${max}`);
    return `<a class="tariff-line${tone}" href="#settings"><span>Тариф</span><b>${parts.join(' · ')}</b><i>${days !== null && days <= 5 ? 'Продлить' : 'Подробнее'} →</i></a>`;
  }

  function bindNav() {
    document.getElementById('logout').onclick = async () => { await api('POST', '/api/admin/logout'); renderLogin(); };
    app.querySelectorAll('[data-copy]').forEach(b => { b.onclick = () => copy(b.dataset.copy); });
    app.querySelectorAll('[data-copy-text]').forEach(b => { b.onclick = () => copy(b.dataset.copyText, 'Текст со ссылкой скопирован'); });
  }
  // Ссылка с приветствием — готовое сообщение для клиентов
  const withText = url => `Здравствуйте! Все мои квартиры с ценами и расчётом рассрочки здесь: ${url}`;

  // ---------- Лимит тарифа ----------
  // Лимит исчерпан: добавить и дублировать нельзя, остальное работает как обычно —
  // квартиры остаются на сайте, их можно менять и удалять (проданные удаляют — место освобождается).
  // «Мой тариф» для менеджера: до какой даты оплачено, сколько дней осталось, квартиры из лимита, продление
  const fmtDate = d => (d ? d.split('-').reverse().join('.') : '');
  const daysWord = n => plural(Math.abs(n), 'день', 'дня', 'дней');
  const waOwner = text => (me.product.whatsapp ? `https://wa.me/${me.product.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`${text} Мой сайт: ${me.realtor.url}`)}` : '');
  function tariffBox() {
    if (isOwner()) return '';
    const r = me.realtor, plan = r.plan || {};
    const until = plan.paidUntil;
    const days = until ? Math.round((Date.parse(until) - Date.parse(new Date().toISOString().slice(0, 10))) / 864e5) : null;
    const tone = days === null ? '' : days < 0 ? ' bad' : days <= 5 ? ' warn-t' : '';
    const left = days === null ? 'Без ограничения срока'
      : days < 0 ? `Оплата закончилась ${fmtDate(until)}`
      : days === 0 ? 'Последний день оплаты' : `Осталось ${days} ${daysWord(days)}`;
    const max = Number(plan.maxApartments) || 0;
    const count = aptCount || r.count || 0;
    const extra = Number(me.product.extraPrice) || 0;
    const renew = waOwner(`Здравствуйте! Хочу продлить кабинет${until ? ` (оплачено до ${fmtDate(until)})` : ''}.`);
    // Кнопки «Добавить квартиры» здесь нет (решение 27.11.2026): о расширении лимита — окно, когда лимит исчерпан
    const prices = [me.product.priceMonth && `1 мес — ${nf.format(me.product.priceMonth)} сом`, me.product.price3 && `3 мес — ${nf.format(me.product.price3)} сом`, me.product.price6 && `6 мес — ${nf.format(me.product.price6)} сом`].filter(Boolean).join(' · ');
    return `<div class="tariff${tone}">
      <div class="tariff-head"><span>Мой тариф</span>${until ? `<small>оплачено до ${fmtDate(until)}</small>` : ''}</div>
      <div class="tariff-left">${left}</div>
      <div class="tariff-row"><span>Квартир</span><b>${max ? `${count} из ${max}` : `${count} · без ограничения`}</b></div>
      ${prices ? `<div class="tariff-row"><span>Продление</span><b>${prices}</b></div>` : ''}
      ${extra ? `<div class="tariff-row"><span>Доп. квартира</span><b>${nf.format(extra)} сом в месяц</b></div>` : ''}
      ${renew && until ? `<div class="tariff-btns"><a class="btn btn-primary" href="${renew}" target="_blank" rel="noopener">Продлить</a></div>` : ''}
    </div>`;
  }

  // «Приведите менеджера — 20 дней в подарок»: пригласить знакомого и сообщить владельцу, кого привели
  function referBox() {
    if (isOwner() || !me.realtor.url) return '';
    const partner = new URL(me.realtor.url).origin + '/partner';
    const invite = `https://wa.me/?text=${encodeURIComponent(`Привет! У меня теперь свой сайт с квартирами и калькулятором рассрочки — клиенты сами выбирают и пишут в WhatsApp. Посмотри: ${me.realtor.url}\nХочешь такой же — вот здесь: ${partner}`)}`;
    const tell = waOwner('Здравствуйте! По моей рекомендации подключается новый менеджер: (имя и телефон). Прошу 20 дней в подарок.');
    return `<div class="refer">
      <div class="refer-t">🎁 Приведите менеджера — 20 дней в подарок</div>
      <p>Порекомендуйте сайт знакомому риелтору или менеджеру. Когда он подключится, вам добавим 20 дней подписки бесплатно.</p>
      <div class="tariff-btns"><a class="btn btn-primary" href="${invite}" target="_blank" rel="noopener">Пригласить в WhatsApp</a>${tell ? `<a class="btn" href="${tell}" target="_blank" rel="noopener">Сообщить, кого пригласили</a>` : ''}</div>
    </div>`;
  }

  let aptCount = 0;
  const atLimit = () => !!(me.realtor.plan.maxApartments && aptCount >= me.realtor.plan.maxApartments);
  function limitInfo() {
    const wa = me.product.whatsapp ? `https://wa.me/${me.product.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Здравствуйте! Хочу расширить лимит квартир. Мой сайт: ${me.realtor.url}`)}` : '';
    modal({
      title: 'Лимит квартир исчерпан',
      text: `По вашему тарифу можно ${flats(me.realtor.plan.maxApartments)}, сейчас ${aptCount}. Все квартиры остаются на сайте. Чтобы добавить новую — удалите проданную или докупите места${Number(me.product.extraPrice) ? ` (${nf.format(me.product.extraPrice)} сом за квартиру в месяц)` : ''}.`,
      html: wa ? `<a class="btn btn-wa-admin" href="${wa}" target="_blank" rel="noopener">Написать о расширении тарифа</a>` : '',
      okText: 'Понятно', cancelText: '',
    });
  }

  // ---------- Квартиры по ЖК: «Квартиры» → ЖК → квартиры этого ЖК ----------
  // У ЖК одна запись: адрес, район, город, карта и фото дома (общие для всех менеджеров). В квартире — только её фото
  // (планировка, ремонт). Менять ЖК: владелец — любой; менеджер — свой новый ЖК, пока в нём нет чужих квартир.
  const zkKeyAll = t => String(t || '').replace(/[​-‍⁠﻿]/g, '').toLowerCase().replace(/[«»"'`“”„]/g, '').replace(/^(жк|ж\/к|жилой комплекс)[\s,.:-]+/, '').replace(/ө/g, 'о').replace(/ү/g, 'у').replace(/ң/g, 'н').replace(/\s+/g, ' ').trim();
  const aptZk = a => (typeOf(a) === 'land' ? '' : zkKeyAll(a.title));
  const zkPhoto = n => `/uploads/${n}-t.webp`;

  // Нажатия по строкам квартир: открыть, «⋯» — открыть на сайте / дублировать / удалить
  function bindItems(box, apts, again) {
    box.onkeydown = e => { const r = e.target.closest('.apt-row'); if (r && e.key === 'Enter' && e.target === r) location.hash = `#edit/${r.dataset.id}`; };
    box.onclick = async e => {
      const el = e.target.closest('[data-id]');
      if (!el) return;
      const id = el.dataset.id, apt = apts.find(x => x.id === id);
      if (!e.target.closest('[data-more]')) { location.hash = `#edit/${id}`; return; }
      const pick = await actionSheet(apt && (apt.title || 'Квартира'), [
        ...(apt && apt.computed.price ? [{ key: 'open', label: 'Открыть на сайте' }] : []),
        { key: 'dup', label: 'Дублировать' },
        { key: 'del', label: 'Удалить', danger: true },
      ]);
      if (!pick) return;
      if (pick === 'open') { window.open(apt.computed.url, '_blank'); return; }
      if (pick === 'dup') {
        if (atLimit()) { limitInfo(); return; }
        const a = await api('POST', `/api/admin/apartments/${id}/duplicate`);
        toast('Копия создана');
        location.hash = `#edit/${a.id}`;
      }
      if (pick === 'del') {
        if (!(await confirmBox('Удалить квартиру?', 'Она исчезнет с сайта. Например, если квартира продана.', 'Удалить', true))) return;
        await api('DELETE', `/api/admin/apartments/${id}`);
        toast('Удалено'); again();
      }
    };
  }

  async function renderList() {
    const [apts, zks] = await Promise.all([api('GET', '/api/admin/apartments'), api('GET', '/api/admin/complexes').catch(() => [])]);
    aptCount = apts.length;
    const byKey = new Map();
    apts.forEach(a => { const k = aptZk(a); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(a); });
    // Владелец видит все ЖК; менеджер — где есть его квартиры и которые он создал сам
    const shown = zks.filter(c => isOwner() || byKey.has(c.key) || c.mineCreated);
    const none = byKey.get('') || [];
    const tile = (href, name, sub, img, count) => `<a class="zk-tile" href="${href}">
        <div class="zk-tile-img">${img ? `<img src="${img}" alt="" loading="lazy">` : ''}</div>
        <div class="zk-tile-txt"><b>${esc(name)}</b><span>${esc(sub)}</span><small>${count}</small></div></a>`;
    app.innerHTML = `${nav('list')}<div class="wrap">
      ${installBanner()}
      <div class="row" style="justify-content:space-between"><h1>Квартиры</h1><a class="btn btn-primary" href="#zk-new">+ ЖК</a></div>
      <label class="search"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
        <input type="search" id="lq" placeholder="Поиск квартиры: ЖК, адрес, площадь" value="${esc(listQuery)}" autocomplete="off"></label>
      ${me.realtor.plan.maxApartments && apts.length >= me.realtor.plan.maxApartments ? `<p class="${apts.length >= me.realtor.plan.maxApartments ? 'warn' : 'hint'}" style="margin-top:-6px">Тариф: ${apts.length} из ${flats(me.realtor.plan.maxApartments)}${apts.length >= me.realtor.plan.maxApartments ? ' — лимит исчерпан, новые добавить нельзя' : ''}</p>` : ''}
      <div id="zkGrid" class="zk-grid">
        ${shown.map(c => {
          const mine = byKey.get(c.key) || [];
          const img = c.photos[0] ? zkPhoto(c.photos[0]) : mine[0] && mine[0].computed.photos[0] ? mine[0].computed.photos[0].thumb : '';
          return tile(`#zk/${encodeURIComponent(c.key)}`, c.name, [c.district, c.address].filter(Boolean).join(' · ') || c.city, img, mine.length ? `Моих квартир: ${mine.length}` : 'Квартир пока нет — добавьте');
        }).join('')}
        ${tile('#zk/_none', 'Без ЖК', 'Участки и дома без ЖК', none[0] && none[0].computed.photos[0] ? none[0].computed.photos[0].thumb : '', none.length ? `Квартир: ${none.length}` : 'Пусто')}
      </div>
      <div id="items"></div>
    </div>`;
    bindNav();
    bindInstall();
    // Поиск — сразу по всем квартирам (вместо ЖК показываем найденные квартиры)
    const drawItems = () => {
      const q = listQuery.trim().toLowerCase();
      document.getElementById('zkGrid').hidden = !!q;
      const list = q ? apts.filter(a => [a.title, a.address, a.city, a.area, a.computed && a.computed.roomsLabel].join(' ').toLowerCase().includes(q)) : [];
      document.getElementById('items').innerHTML = q ? (list.map(item).join('') || '<p class="hint">Ничего не найдено</p>') : '';
    };
    drawItems();
    document.getElementById('lq').oninput = e => { listQuery = e.target.value; drawItems(); };
    bindItems(document.getElementById('items'), apts, renderList);
  }

  // ---------- Срок сдачи ЖК по этапам (решение 27.11.2026: «только удобнее вводить») ----------
  // Хранится как раньше — текстом «IV квартал 2028, IV квартал 2030» или «Дом сдан» (его читают сайт и квартиры),
  // но вместо печати через запятую — список этапов: квартал + год, кнопка «+ Добавить этап».
  const ROMAN_Q = ['I', 'II', 'III', 'IV'];
  // Текст → { done, rows: [{ q, y } | { text }] }. Непонятную часть («ноябрь 2026») не теряем — оставляем строкой как есть.
  function parseStages(text) {
    const s = String(text || '').trim();
    if (!s) return { done: false, rows: [] }; // срок не указан — пусто, пока не нажмут «+ Добавить этап»
    if (/сдан/i.test(s)) return { done: true, rows: [] };
    const rows = s.split(/[,;]|\sи\s/).map(x => x.trim()).filter(Boolean).map(part => {
      const y = (part.match(/(?:^|\D)(20\d\d)(?!\d)/) || [])[1];
      const m = part.match(/(?:^|[^\wА-Яа-я])(IV|I{1,3}|[1-4])\s*[-–]?\s*(?:-?й\s*)?кв/i);
      const q = m ? (/\d/.test(m[1]) ? +m[1] : ROMAN_Q.indexOf(m[1].toUpperCase()) + 1) : 0;
      const clean = y && part.replace(/(IV|I{1,3}|[1-4])\s*[-–]?\s*(?:-?й\s*)?(квартал|кв\.?)/i, '').replace(/20\d\d\s*(г\.?|года?)?/, '').trim() === '';
      return y && clean ? { q, y: +y } : { text: part };
    });
    return { done: false, rows: rows.length ? rows : [{ q: 4, y: new Date().getFullYear() + 2 }] };
  }
  const stageRowText = r => (r.text != null ? r.text.trim() : r.q ? `${ROMAN_Q[r.q - 1]} квартал ${r.y}` : String(r.y));
  function stageRowHtml(r, i) {
    const now = new Date().getFullYear();
    const years = []; for (let y = now - 3; y <= now + 10; y++) years.push(y);
    if (r.y && !years.includes(r.y)) years.push(r.y);
    return `<div class="st-row" data-i="${i}"><span class="st-n">Этап ${i + 1}</span>
      ${r.text != null
        ? `<input type="text" class="st-text" value="${esc(r.text)}" maxlength="60">`
        : `<select class="st-q" aria-label="Квартал">${[0, 1, 2, 3, 4].map(q => `<option value="${q}"${q === r.q ? ' selected' : ''}>${q ? `${ROMAN_Q[q - 1]} кв.` : 'весь год'}</option>`).join('')}</select>
           <select class="st-y" aria-label="Год">${years.sort().map(y => `<option${y === r.y ? ' selected' : ''}>${y}</option>`).join('')}</select>`}
      <button type="button" class="st-x" aria-label="Убрать этап" title="Убрать этап">×</button></div>`;
  }
  function stagesEditor(text) {
    const st = parseStages(text);
    return `<div class="f stages" id="stages"><span>Срок сдачи</span>
      <input type="hidden" name="handover" value="${esc(text || '')}">
      <div class="seg st-mode"><button type="button" data-done="0"${st.done ? '' : ' class="on"'}>Строится</button><button type="button" data-done="1"${st.done ? ' class="on"' : ''}>Дом сдан</button></div>
      <div class="st-list"${st.done ? ' hidden' : ''}>${st.rows.map(stageRowHtml).join('')}</div>
      <button type="button" class="btn st-add"${st.done ? ' hidden' : ''}>+ Добавить этап</button>
      <div class="hint">Если дом сдают по очередям — добавьте этап на каждую очередь. В каждой квартире потом выбирается её этап.</div>
    </div>`;
  }
  function bindStages() {
    const box = document.getElementById('stages'); if (!box) return;
    const hidden = box.querySelector('input[name="handover"]'), list = box.querySelector('.st-list'), add = box.querySelector('.st-add');
    let done = box.querySelector('.st-mode [data-done="1"]').classList.contains('on');
    const rows = () => [...list.querySelectorAll('.st-row')].map(el => (el.querySelector('.st-text')
      ? { text: el.querySelector('.st-text').value }
      : { q: +el.querySelector('.st-q').value, y: +el.querySelector('.st-y').value }));
    const write = () => {
      if (done) { hidden.value = 'Дом сдан'; return; }
      // Одинаковые этапы не повторяем, по порядку сроков
      const seen = new Set(), out = [];
      rows().forEach(r => { const t = stageRowText(r); if (t && !seen.has(t)) { seen.add(t); out.push(r); } });
      out.sort((a, b) => (a.text != null || b.text != null ? 0 : a.y * 10 + a.q - (b.y * 10 + b.q)));
      hidden.value = out.map(stageRowText).join(', ');
    };
    const redraw = rs => { list.innerHTML = rs.map(stageRowHtml).join(''); write(); };
    box.querySelector('.st-mode').onclick = e => {
      const b = e.target.closest('[data-done]'); if (!b) return;
      done = b.dataset.done === '1';
      box.querySelectorAll('.st-mode button').forEach(x => x.classList.toggle('on', x === b));
      list.hidden = done; add.hidden = done;
      if (!done && !list.children.length) redraw([{ q: 4, y: new Date().getFullYear() + 2 }]);
      write();
    };
    add.onclick = () => {
      const rs = rows(), last = [...rs].reverse().find(r => r.y);
      rs.push(last ? { q: last.q, y: last.y + 1 } : { q: 4, y: new Date().getFullYear() + 2 }); // следующий этап — на год позже
      redraw(rs);
    };
    list.addEventListener('change', write);
    list.addEventListener('input', write);
    list.addEventListener('click', e => {
      const x = e.target.closest('.st-x'); if (!x) return;
      const rs = rows(); rs.splice(+x.closest('.st-row').dataset.i, 1);
      redraw(rs); // убрали все этапы — срок не указан
    });
    write();
  }

  // Фото дома в ЖК: загрузить, сделать главным, убрать (только если можно менять ЖК)
  function zkPhotosHtml(photos, edit) {
    return photos.map((p, i) => `<div class="photo"><img src="${zkPhoto(p)}" alt="">${i === 0 ? '<span class="main">Главное</span>' : ''}
      ${edit ? `<div class="pa">${i ? `<button type="button" data-main="${i}" title="Сделать главным">★</button>` : ''}<button type="button" data-rm="${i}" title="Убрать">✕</button></div>` : ''}</div>`).join('');
  }

  async function renderZk(key) {
    const [apts, zks] = await Promise.all([api('GET', '/api/admin/apartments'), api('GET', '/api/admin/complexes')]);
    aptCount = apts.length;
    const none = key === '_none';
    const c = none ? null : zks.find(x => x.key === key);
    if (!none && !c) { location.hash = '#list'; return; }
    const mine = apts.filter(a => aptZk(a) === (none ? '' : key));
    const edit = !!(c && c.canEdit);
    let photos = c ? [...c.photos] : [];
    app.innerHTML = `${nav('list')}<div class="wrap">
      <a class="hint" href="#list" style="display:inline-block;margin:0 0 8px">← Все ЖК</a>
      <div class="row" style="justify-content:space-between;align-items:flex-start"><h1 style="margin:0">${esc(none ? 'Без ЖК' : c.name)}</h1>
        <a class="btn btn-primary" href="#edit/new?zk=${encodeURIComponent(key)}" id="addApt">+ Квартира</a></div>
      ${c ? `<form class="card" id="zkf" style="margin-top:14px">
        <h2 style="margin-top:0">Фото дома</h2>
        <div class="hint" style="margin:-6px 0 10px">Фасад, вид сверху, двор, подъезд. Эти фото — на странице ЖК и у всех его квартир. Планировки — в самих квартирах.</div>
        <div class="photos" id="zkPhotos">${zkPhotosHtml(photos, edit)}</div>
        ${edit ? '<label class="upload"><input type="file" id="zkFiles" accept="image/*" multiple>+ Загрузить фото дома</label>' : ''}
        <h2>Адрес и карта</h2>
        ${edit ? `<div class="grid2">
            <label class="f"><span>Город</span><select name="city">${['Бишкек', 'Ош'].map(x => `<option ${(c.city || 'Бишкек') === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
            <label class="f"><span>Район</span><input type="text" name="district" value="${esc(c.district)}" maxlength="60" placeholder="Например: Джал, Восток-5"></label>
          </div>
          <label class="f"><span>Адрес</span><input type="text" name="address" value="${esc(c.address)}" maxlength="200"></label>
          <label class="f"><span>Ссылка на карту — 2ГИС или Google</span><input type="text" name="mapLink" value="${esc(c.mapLink)}" inputmode="url" placeholder="Из 2ГИС или Google Карт"></label>
          <h2>Характеристики ЖК</h2>
          ${stagesEditor(c.handover)}
          <label class="f"><span>Этажность</span><input type="text" name="floors" value="${esc(c.floors || '')}" inputmode="numeric" style="max-width:160px"></label>
          <label class="f"><span>Описание ЖК</span><textarea name="details" rows="5">${esc(c.details)}</textarea></label>
          <label class="f"><span>Описание — по-кыргызски</span><textarea name="detailsKy" rows="4" placeholder="Пусто — на кыргызской версии будет русский текст">${esc(c.detailsKy)}</textarea></label>
          <div class="err" id="zkErr"></div>
          <button class="btn btn-primary">Сохранить ЖК</button>
          <div class="hint" style="margin-top:8px">Сохранится у всех квартир этого ЖК${c.n ? ` (${c.n})` : ''}${isOwner() ? ' у всех менеджеров' : ''}.</div>`
        : `<p style="margin:0">${esc([c.city, c.district, c.address].filter(Boolean).join(' · ') || '—')}</p>
          ${c.mapLink ? `<p style="margin:6px 0 0"><a href="${esc(c.mapLink)}" target="_blank" rel="noopener">Открыть на карте ↗</a></p>` : ''}
          <h2>Характеристики ЖК</h2>
          <p style="margin:0">Срок сдачи: <b>${esc(c.handover || '—')}</b> · Этажность: <b>${esc(c.floors || '—')}</b></p>
          ${c.details ? `<p class="hint" style="white-space:pre-line;margin-top:8px">${esc(c.details)}</p>` : ''}
          <div class="hint" style="margin-top:10px">Фото дома, адрес и карту этого ЖК меняет владелец сервиса — они одинаковые у всех менеджеров. Если что-то не так, напишите ему.</div>`}
      </form>` : '<p class="hint" style="margin-top:10px">Участки и дома, которые не относятся к ЖК. Адрес и карта — в каждой квартире.</p>'}
      <h2>${none ? 'Квартиры и участки' : 'Мои квартиры в этом ЖК'} <span class="hint" style="margin:0">· ${mine.length}</span></h2>
      <div id="items">${mine.map(a => item(none ? a : { ...a, title: typeOf(a) === 'commercial' ? 'Коммерческое помещение' : `${rooms(a.rooms)}, ${a.area} м²` })).join('') || '<p class="hint">Пока пусто — нажмите «+ Квартира».</p>'}</div>
      ${c && !c.n && (isOwner() || c.mineCreated) ? `<button type="button" class="btn zk-del" id="zkDel">Удалить этот ЖК</button>
        <div class="hint" style="margin-top:6px">В ЖК нет ни одной квартиры — его можно удалить из общего списка.</div>` : ''}
    </div>`;
    const del = document.getElementById('zkDel');
    if (del) del.onclick = async () => {
      if (!(await confirmBox(`Удалить ЖК «${c.name}»?`, 'Он исчезнет из списка ЖК у всех менеджеров. Квартир в нём нет.', 'Удалить', true))) return;
      try { await api('DELETE', `/api/admin/complexes/${encodeURIComponent(key)}`); } catch (e) { if (e.message !== 'auth') toast(e.message); return; }
      toast('ЖК удалён');
      location.hash = '#list';
    };
    bindNav();
    bindItems(document.getElementById('items'), mine, () => renderZk(key));
    document.getElementById('addApt').onclick = e => { if (atLimit()) { e.preventDefault(); limitInfo(); } };
    if (!edit) return;
    const box = document.getElementById('zkPhotos');
    const savePhotos = async () => {
      await api('PUT', `/api/admin/complexes/${encodeURIComponent(key)}`, { photos });
      box.innerHTML = zkPhotosHtml(photos, true);
    };
    box.onclick = async e => {
      const m = e.target.closest('[data-main]'), r = e.target.closest('[data-rm]');
      if (m) { const [p] = photos.splice(+m.dataset.main, 1); photos.unshift(p); await savePhotos(); toast('Главное фото ЖК изменено'); }
      if (r) {
        if (!(await confirmBox('Убрать фото дома?', 'Оно исчезнет со страницы ЖК и у всех его квартир.', 'Убрать', true))) return;
        photos.splice(+r.dataset.rm, 1); await savePhotos(); toast('Фото убрано');
      }
    };
    document.getElementById('zkFiles').onchange = async e => {
      const files = [...e.target.files];
      if (!files.length) return;
      const fd = new FormData();
      files.forEach(fl => fd.append('photos', fl));
      toast(`Загрузка ${files.length} фото…`);
      try {
        const r = await api('POST', '/api/admin/photos', fd);
        photos.push(...r.photos); await savePhotos(); toast('Фото дома добавлены');
      } catch (err) { toast(err.message); }
      e.target.value = '';
    };
    bindStages();
    document.getElementById('zkf').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      try {
        const r = await api('PUT', `/api/admin/complexes/${encodeURIComponent(key)}`, { city: d.city, district: d.district, address: d.address, mapLink: d.mapLink, handover: d.handover, floors: d.floors, details: d.details, detailsKy: d.detailsKy });
        if (r.mapError) showErr('zkErr', `Ссылка на карту не распознана: ${r.mapError}`);
        else toast(`ЖК сохранён${r.apartments ? ` — у ${r.apartments} квартир` : ''}`);
      } catch (err) { showErr('zkErr', err.message); }
    };
  }

  // Новый ЖК: выбрать из базы (его уже внесли другие) или создать
  async function renderZkNew() {
    const [apts, zks] = await Promise.all([api('GET', '/api/admin/apartments'), api('GET', '/api/admin/complexes')]);
    const mineKeys = new Set(apts.map(aptZk));
    const other = zks.filter(c => !mineKeys.has(c.key) && !c.mineCreated);
    app.innerHTML = `${nav('list')}<div class="wrap">
      <a class="hint" href="#list" style="display:inline-block;margin:0 0 8px">← Все ЖК</a>
      <h1>Добавить ЖК</h1>
      ${other.length ? `<div class="card"><h2 style="margin-top:0">ЖК уже есть в базе</h2>
        <div class="hint" style="margin:-6px 0 10px">Адрес, карта и фото дома уже внесены — останется добавить свои квартиры.</div>
        <label class="f"><span>ЖК</span><select id="zkOther"><option value="">— Выберите ЖК —</option>${other.map(c => `<option value="${esc(c.key)}">${esc(c.name)}${c.city !== 'Бишкек' ? ` (${esc(c.city)})` : ''}</option>`).join('')}</select></label>
        <button type="button" class="btn btn-primary" id="zkOpen">Открыть</button></div>` : ''}
      <form class="card" id="zkNew"><h2 style="margin-top:0">Новый ЖК</h2>
        <label class="f"><span>Название ЖК</span><input type="text" name="name" maxlength="120" placeholder="Например: ЖК «Алтай Голд»" required></label>
        <div class="grid2">
          <label class="f"><span>Город</span><select name="city"><option>Бишкек</option><option>Ош</option></select></label>
          <label class="f"><span>Район</span><input type="text" name="district" maxlength="60" placeholder="Например: Джал"></label>
        </div>
        <label class="f"><span>Адрес</span><input type="text" name="address" maxlength="200"></label>
        <label class="f"><span>Ссылка на карту — 2ГИС или Google</span><input type="text" name="mapLink" inputmode="url" placeholder="Из 2ГИС или Google Карт"></label>
        <div class="err" id="zkNewErr"></div>
        <button class="btn btn-primary">Создать ЖК</button>
        <div class="hint" style="margin-top:8px">Фото дома добавите на странице ЖК сразу после создания.</div>
      </form>
    </div>`;
    bindNav();
    const open = document.getElementById('zkOpen');
    if (open) open.onclick = () => { const v = document.getElementById('zkOther').value; if (v) location.hash = `#zk/${encodeURIComponent(v)}`; else toast('Выберите ЖК'); };
    document.getElementById('zkNew').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      // Такой ЖК уже есть под другим написанием — открываем его
      const same = zks.find(c => c.key === zkKeyAll(d.name));
      if (same) { toast(`ЖК «${same.name}» уже есть — открываю его`); location.hash = `#zk/${encodeURIComponent(same.key)}`; return; }
      try {
        const r = await api('POST', '/api/admin/complexes', d);
        toast(r.exists ? `ЖК «${r.name}» уже есть — открываю его` : 'ЖК создан — добавьте фото дома и квартиры');
        location.hash = `#zk/${encodeURIComponent(r.key)}`;
      } catch (err) { showErr('zkNewErr', err.message); }
    };
  }

  function item(a) {
    const c = a.computed;
    const img = c.photos[0] ? `<img src="${c.photos[0].thumb}" alt="">` : '<div class="noimg"></div>';
    const k = c.currency;
    const line = c.installment
      ? `${money(c.price, k)} · ${money(c.monthly, k)}/мес · ${c.months} мес.`
      : c.price ? money(c.price, k) : '<span style="color:var(--bad)">Цена не указана — на сайте не видна</span>';
    // Вся строка — кнопка «Изменить»; справа «⋯» с остальными действиями
    return `<div class="item apt-row" data-id="${a.id}" role="button" tabindex="0">
      ${img}
      <div class="apt-row-txt"><div class="t">${esc(a.title || 'Без названия')}</div>
        <div class="s">${c.type === 'land' ? `Участок, ${a.area} сот.` : `${rooms(a.rooms)}, ${a.area} м² · от ${a.floorFrom || '—'} эт.`}</div>
        <div class="s">${line}</div>
        <span class="badge badge-${c.type}">${TYPES[c.type]}</span></div>
      <button type="button" class="more-btn" data-more aria-label="Ещё действия">⋯</button>
    </div>`;
  }

  // ---------- Добавление / редактирование ----------
  async function renderEdit(idArg) {
    const [id, qs] = String(idArg).split('?');
    const zkParam = new URLSearchParams(qs || '').get('zk') || '';
    const isNewRecord = id === 'new';
    let a;
    if (isNewRecord) {
      // Из папки «Без ЖК» добавляют участки и дома — сразу тип «Участок», без поля «Выберите ЖК»
      a = { type: zkParam === '_none' ? 'land' : 'installment', title: '', rooms: 1, area: '', pricePerM2: '', down: '', months: '', cashDiscount: '', price: '', floorFrom: 1, floors: '', address: '', details: '', tags: [], photos: [] };
    } else {
      const apts = await api('GET', '/api/admin/apartments');
      a = apts.find(x => x.id === id);
      if (!a) { location.hash = '#list'; return; }
      a.type = typeOf(a);
    }
    let photos = [...(a.photos || [])];
    // Куда вернуться: на страницу ЖК этой квартиры
    const backTo = () => { const k = aptZk({ type, title: form.elements.title.value }) || (zkParam && zkParam !== '_none' ? zkParam : ''); return `#zk/${encodeURIComponent(k || '_none')}`; };
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
            <button type="button" data-v="commercial">Коммерция<small>рассрочка, ${esc(cur('installment'))}</small></button>
            <button type="button" data-v="cash">Наличные<small>цены в ${esc(cur('cash'))}</small></button>
            <button type="button" data-v="land">Участок<small>цена в ${esc(cur('cash'))}, сотки</small></button>
          </div>
        </div>
        <div class="card">
          <h2 style="margin-top:0">Фото квартиры</h2>
          <div class="hint" style="margin:-6px 0 10px">Планировка, фото ремонта. Фото дома (фасад) — на странице ЖК, их добавлять сюда не нужно: на сайте они покажутся у квартиры сами.</div>
          <div class="photos" id="photos"></div>
          <label class="upload"><input type="file" id="files" accept="image/*" multiple>+ Загрузить фото (можно несколько)</label>
          <div class="hint">Первое фото — главное. Фото автоматически сжимаются.</div>
        </div>
        <div class="card">
          <label class="f" id="zkPickWrap"><span>ЖК</span><select id="zkPick"><option value="">Загружаю список ЖК…</option></select></label>
          <div class="hint" id="zkPickHint" style="margin:-6px 0 10px" hidden></div>
          <label class="f" id="titleWrap"><span id="titleLbl">Название (ЖК / дом)</span><input type="text" name="title" value="${v('title')}"></label>
          <div class="grid2">
            <label class="f" data-for="installment cash"><span>Комнаты</span><select name="rooms">${[0, 1, 2, 3, 4, 5, 6].map(r => `<option value="${r}" ${+a.rooms === r ? 'selected' : ''}>${r === 0 ? 'Студия' : r}</option>`).join('')}</select></label>
            <label class="f"><span id="areaLbl">Площадь, м²</span><input type="text" name="area" value="${v('area')}" inputmode="decimal"></label>
          </div>
          <div data-for="installment commercial">
            ${n('pricePerM2', `Цена за м², ${esc(cur('installment'))}`)}
            <div class="grid2">
              ${n('down', `Мин. взнос, ${esc(cur('installment'))}`)}
              ${n('months', 'Срок, месяцев')}
            </div>
            ${n('cashDiscount', `Скидка за наличные, ${esc(cur('installment'))} за м²`)}
            <div class="hint" style="margin:-6px 0 10px">Если клиент купит за наличные. 0 или пусто — без скидки, блок «за наличные» на сайте не показывается.</div>
          </div>
          <div data-for="cash land">${n('price', `Цена, ${esc(cur('cash'))}`)}</div>
          <div class="calcbox" id="calc"></div>
          <div class="grid2" data-for="installment commercial cash">
            ${n('floorFrom', 'С какого этажа (и выше)')}
            ${n('floors', 'Этажей в доме')}
          </div>
          <label class="f" data-for="installment commercial"><span>Срок сдачи</span><input type="text" name="handover" value="${v('handover')}" maxlength="60" placeholder="Например: IV квартал 2027 или Дом сдан"></label>
          <label class="f"><span>Город</span><select name="city">${['Бишкек', 'Ош'].map(c => `<option ${(a.city || 'Бишкек') === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
          <label class="f"><span>Район или микрорайон</span><input type="text" name="district" value="${v('district')}" maxlength="60" list="districts" placeholder="Например: Джал, Восток-5, Центр"></label>
          <datalist id="districts">${['Центр', 'Джал', 'Асанбай', 'Восток-5', 'Аламедин-1', 'Тунгуч', 'Кок-Жар', 'Магистраль', 'Ипподром', 'Филармония', 'Политех', 'Пишпек', 'Кызыл-Аскер', 'Арча-Бешик', 'Учкун', 'Джал-23', 'Мкр 5', 'Мкр 6', 'Мкр 7', 'Мкр 8', 'Мкр 10', 'Мкр 11', 'Мкр 12', 'Анар', 'Черёмушки', 'Западный'].map(x => `<option value="${x}">`).join('')}</datalist>
          ${f('address', 'Адрес')}
          <div class="mapbox">
            <label class="f"><span>Ссылка на карту — 2ГИС или Google Карты</span>
              <input type="text" name="mapLink" value="${esc((a.map || a.map2gis || {}).link || '')}" placeholder="Из 2ГИС или Google Карт" inputmode="url">
              <div class="err" id="mapErr">${(a.map || a.map2gis || {}).error ? esc((a.map || a.map2gis).error) : ''}</div>
            </label>
            <p class="mapbox-note">Вставьте ссылку из <b>2ГИС</b> или из <b>Google Карт</b>: в приложении найдите дом → «Поделиться» → «Копировать ссылку».
              Ссылка из 2ГИС — на сайте будет карта 2ГИС, из Google Карт — карта Google. Без ссылки карта строится по адресу.</p>
          </div>
          ${a.computed && a.computed.map.embed ? `<div class="map-prev"><div class="hint">Так карта выглядит на сайте:</div><iframe loading="lazy" src="${esc(a.computed.map.embed)}" title="Карта"></iframe></div>` : ''}
          <label class="f"><span>Детали</span><textarea name="details">${esc(a.details)}</textarea></label>
          <label class="f"><span>Детали — по-кыргызски</span><textarea name="detailsKy" placeholder="${esc(a.details || '')}">${esc(a.detailsKy)}</textarea><div class="hint">Для кыргызской версии сайта. Пусто — клиенты увидят русский текст.</div></label>
          <label class="f"><span>Метки через запятую</span><input type="text" name="tags" value="${esc((a.tags || []).join(', '))}" placeholder="Скидка, Дом сдан"></label>
          <label class="f"><span>Метки — по-кыргызски, через запятую</span><input type="text" name="tagsKy" value="${esc((a.tagsKy || []).join(', '))}" placeholder="${esc((a.tags || []).join(', ') || 'Арзандатуу, Үй тапшырылган')}"></label>
        </div>
        <div class="savebar">
          <a class="btn" href="#list" id="backBtn">← Назад</a>
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
      form.querySelectorAll('[data-for]').forEach(el => { el.hidden = !el.dataset.for.split(' ').includes(t); });
      document.getElementById('areaLbl').textContent = t === 'land' ? 'Площадь, соток' : 'Площадь, м²';
      // Название — подсказка под вид объекта: у участка это район или массив
      const [tl, tp] = TITLE_HINT[t] || TITLE_HINT.installment;
      document.getElementById('titleLbl').textContent = tl;
      form.elements.title.placeholder = tp;
      if (typeof showPick === 'function') showPick();
      updCalc();
    }
    // Платёж в месяц не вводится — считается: (цена за м² × м² − взнос) / срок
    function updCalc() {
      const d = readForm();
      const box = document.getElementById('calc');
      if (cashLike(type)) {
        box.innerHTML = d.price && d.area ? `Цена за ${type === 'land' ? 'сотку' : 'м²'}: ${money(d.price / d.area, cur('cash'))}` : 'Укажите цену и площадь';
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

    // ---------- ЖК: выбор из списка вместо ручного названия ----------
    // Выбрали ЖК — подставляем его название как у всех (без опечаток) и пустые поля: город, район, адрес, этажность,
    // срок сдачи (если у ЖК он один), карту. Поле, которое менеджер уже заполнил сам, не трогаем.
    // «Новый ЖК» — пишут название; если такой ЖК уже есть (другое написание) — выбираем его.
    const zkKeyOf = t => String(t || '').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').toLowerCase().replace(/[«»"'`“”„]/g, '').replace(/^(жк|ж\/к|жилой комплекс)[\s,.:-]+/, '').replace(/ө/g, 'о').replace(/ү/g, 'у').replace(/ң/g, 'н').replace(/\s+/g, ' ').trim();
    let complexes = [], autoVals = {};
    const zkPick = document.getElementById('zkPick'), zkHint = document.getElementById('zkPickHint');
    const fillFrom = c => {
      const set = (name, val) => {
        const el = form.elements[name];
        if (!el) return;
        const cur = String(el.value || '').trim();
        if (cur && cur !== String(autoVals[name] ?? '')) return; // менеджер написал своё — не трогаем
        if ((val === '' || val == null) && name === 'city') return;
        el.value = val == null ? '' : val; autoVals[name] = String(el.value); // у нового ЖК пусто — подставленное от прошлого убираем
      };
      // Город, район, адрес и карта — общие для всего ЖК: ставим как у ЖК всегда
      for (const [n, v] of [['city', c.city || 'Бишкек'], ['district', c.district], ['address', c.address], ['mapLink', c.mapLink]]) {
        if (form.elements[n]) { form.elements[n].value = v || ''; autoVals[n] = String(v || ''); }
      }
      set('floors', c.floors); set('handover', c.handover);
      updCalc();
    };
    // У ЖК один адрес и одна карта. Менять их может владелец (у всех квартир ЖК сразу) или менеджер,
    // который сам создал этот ЖК; остальным поля закрыты.
    const SHARED = ['city', 'district', 'address', 'mapLink'];
    const lockFor = c => {
      const lock = !!c;
      SHARED.forEach(n => { const el = form.elements[n]; if (el) { el.disabled = lock; const w = el.closest('label'); if (w) w.hidden = lock; } });
      const mb = form.querySelector('.mapbox'), mp = form.querySelector('.map-prev'); if (mb) mb.hidden = lock; if (mp) mp.hidden = lock;
      const mn = form.querySelector('.mapbox-note'); if (mn) mn.hidden = lock; // подсказка, где взять ссылку, — только когда поле открыто
      let note = document.getElementById('zkShared');
      if (!note) { note = document.createElement('div'); note.id = 'zkShared'; note.className = 'hint'; form.elements.city.closest('label').before(note); }
      note.hidden = !c;
      if (c) note.innerHTML = `<b>Адрес:</b> ${esc([c.city, c.district, c.address].filter(Boolean).join(' · ') || '—')}${c.mapLink ? ' · карта есть' : ''}. Адрес, карта, фото дома, этажность, срок сдачи и описание — общие для ЖК, ${c.canEdit ? `меняются <a href="#zk/${encodeURIComponent(c.key)}">на странице ЖК</a>` : 'их меняет владелец сервиса'}.`;
      // Описание и этажность — у ЖК; в квартире ЖК этих полей нет
      ['details', 'detailsKy', 'floors'].forEach(n => { const el = form.elements[n]; if (!el) return; el.disabled = lock; const w = el.closest('label'); if (w) w.hidden = lock; });
      // Срок сдачи — у ЖК. Этапов несколько (2028 и 2030) — у квартиры выбор этапа из списка ЖК
      const ho = form.elements.handover, hoWrap = ho && ho.closest('label');
      let stSel = document.getElementById('zkStage');
      if (stSel) stSel.closest('label').remove();
      if (ho && hoWrap) {
        const stages = (c && c.stages) || [];
        if (lock && stages.length > 1 && type !== 'land' && type !== 'cash') {
          hoWrap.hidden = true;
          const cur = stages.find(x => (ho.value || '').includes(x.split(' ').pop())) || '';
          hoWrap.insertAdjacentHTML('afterend', `<label class="f"><span>Этап сдачи</span><select id="zkStage"><option value="">— Выберите этап —</option>${stages.map(x => `<option ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select><div class="hint">У ЖК несколько этапов сдачи — выберите, в каком эта квартира.</div></label>`);
          stSel = document.getElementById('zkStage');
          ho.value = cur;
          stSel.onchange = () => { ho.value = stSel.value; };
        } else if (lock) { hoWrap.hidden = true; ho.value = c.handover || ''; }
        else hoWrap.hidden = !String(hoWrap.dataset.for || '').split(' ').includes(type); // новый ЖК / без ЖК — поле своё
      }
    };
    const showPick = () => {
      const land = type === 'land';
      document.getElementById('zkPickWrap').hidden = land;
      lockFor(land ? null : complexes.find(x => x.key === zkPick.value) || null); // у участка адрес свой
      const isNew = land || zkPick.value === '__new';
      document.getElementById('titleWrap').hidden = !isNew;
      if (!land && zkPick.value === '__new') document.getElementById('titleLbl').textContent = 'Название нового ЖК';
    };
    const pickKey = key => {
      const c = complexes.find(x => x.key === key);
      if (c) { form.elements.title.value = c.name; fillFrom(c); zkHint.hidden = false; zkHint.textContent = `Подставлено: ${[c.city, c.district, c.address, c.floors && c.floors + ' эт.', c.handover, c.mapLink && 'карта'].filter(Boolean).join(' · ')}. Этажность и срок сдачи проверьте — у квартиры они могут быть свои.`; }
      else zkHint.hidden = true;
      lockFor(c);
      showPick();
    };
    api('GET', '/api/admin/complexes').then(list => {
      complexes = list;
      const curKey = zkKeyOf(form.elements.title.value);
      const known = complexes.some(c => c.key === curKey);
      zkPick.innerHTML = '<option value="">— Выберите ЖК —</option>'
        + complexes.map(c => `<option value="${esc(c.key)}">${esc(c.name)}${c.city && c.city !== 'Бишкек' ? ` (${esc(c.city)})` : ''}</option>`).join('')
        + '<option value="__new">+ Новый ЖК — написать название</option>';
      zkPick.value = known ? curKey : form.elements.title.value.trim() ? '__new' : '';
      if (known) form.elements.title.value = complexes.find(c => c.key === curKey).name; // старое написание → как у всех
      lockFor(known ? complexes.find(c => c.key === curKey) : null);
      if (isNewRecord && zkParam && zkParam !== '_none' && complexes.some(c => c.key === zkParam)) { zkPick.value = zkParam; pickKey(zkParam); }
      showPick();
    }).catch(() => { zkPick.innerHTML = '<option value="__new">Написать название</option>'; zkPick.value = '__new'; showPick(); });
    zkPick.onchange = () => {
      // Новый ЖК или «не выбран»: адрес и карту от прошлого ЖК убираем, поля открываем
      const reset = () => { lockFor(null); ['district', 'address', 'mapLink'].forEach(n => { if (form.elements[n] && form.elements[n].value === (autoVals[n] || '')) form.elements[n].value = ''; }); };
      if (zkPick.value === '__new') { form.elements.title.value = ''; zkHint.hidden = true; reset(); showPick(); form.elements.title.focus(); return; }
      if (!zkPick.value) { form.elements.title.value = ''; zkHint.hidden = true; reset(); showPick(); return; }
      pickKey(zkPick.value);
    };
    // Пишут «новый» ЖК, а он уже есть под другим написанием — выбираем существующий
    form.elements.title.addEventListener('change', () => {
      if (type === 'land') return;
      const c = complexes.find(x => x.key === zkKeyOf(form.elements.title.value));
      if (c) { zkPick.value = c.key; pickKey(c.key); toast(`ЖК «${c.name}» уже есть — выбран из списка`); }
    });

    setType(type); drawPhotos();
    document.getElementById('backBtn').onclick = e => { e.preventDefault(); location.hash = backTo(); };

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
      if (type !== 'land' && !String(d.title || '').trim()) { toast('Выберите ЖК из списка или «+ Новый ЖК»'); zkPick.focus(); return; }
      const ok = cashLike(type) ? d.price > 0 && d.area > 0 : d.pricePerM2 > 0 && d.area > 0;
      if (!ok && !(await confirmBox('Сохранить без цены?', 'Цена или площадь не указаны — квартира не появится на сайте, пока их не заполните.', 'Сохранить'))) return;
      if (ok && !cashLike(type) && !(d.months > 0) && !(await confirmBox('Сохранить без срока?', 'Не указан срок рассрочки — на сайте будет только цена при 100% оплате.', 'Сохранить'))) return;
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
      location.hash = backTo();
    };
  }

  // ---------- Отзывы: редактор карточками ----------
  // На сайте отзывы хранятся текстом: «Имя | 06.10.2026», на следующих строках — отзыв, между отзывами пустая строка.
  const toISO = d => { const m = String(d || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
  const fromISO = d => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}.${m[2]}.${m[1]}` : ''; };
  function parseReviews(text) {
    return String(text || '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).map(b => {
      const [head, ...rest] = b.split('\n');
      const [name, date] = head.split('|').map(x => (x || '').trim());
      return { name, date: toISO(date) || '', dateRaw: toISO(date) ? '' : (date || ''), text: rest.join(' ').trim() };
    });
  }
  function buildReviews(list) {
    return list.filter(r => r.name || r.text)
      .map(r => `${r.name || 'Клиент'}${r.date ? ` | ${fromISO(r.date)}` : r.dateRaw ? ` | ${r.dateRaw}` : ''}\n${r.text}`)
      .join('\n\n');
  }
  function reviewsEditor(initial) {
    let list = parseReviews(initial);
    const box = document.getElementById('revList');
    const draw = () => {
      box.innerHTML = list.length ? list.map((r, i) => `<div class="rev" data-i="${i}">
        <div class="grid2">
          <label class="f"><span>Имя клиента</span><input data-k="name" value="${esc(r.name)}" placeholder="Айгерим А."></label>
          <label class="f"><span>Дата</span><input data-k="date" type="date" value="${esc(r.date)}"></label>
        </div>
        <label class="f"><span>Текст отзыва</span><textarea data-k="text" rows="3" placeholder="Что клиент написал о вас">${esc(r.text)}</textarea></label>
        <button type="button" class="btn btn-danger rev-del">Удалить отзыв</button>
      </div>`).join('') : '<p class="hint">Отзывов пока нет. Добавьте 3–5 отзывов клиентов — им доверяют больше, чем рекламе.</p>';
    };
    box.addEventListener('input', e => {
      const el = e.target.closest('[data-k]'); if (!el) return;
      const r = list[+el.closest('.rev').dataset.i];
      r[el.dataset.k] = el.value;
      if (el.dataset.k === 'date') r.dateRaw = '';
    });
    box.addEventListener('click', async e => {
      const b = e.target.closest('.rev-del'); if (!b) return;
      const i = +b.closest('.rev').dataset.i;
      const r = list[i];
      if ((r.name || r.text) && !(await confirmBox('Удалить отзыв?', r.name ? `Отзыв «${r.name}» исчезнет с сайта после сохранения.` : 'Отзыв исчезнет с сайта после сохранения.', 'Удалить', true))) return;
      list.splice(i, 1); draw();
    });
    document.getElementById('revAdd').onclick = () => {
      list.unshift({ name: '', date: new Date().toISOString().slice(0, 10), dateRaw: '', text: '' });
      draw();
      const first = box.querySelector('.rev input'); if (first) first.focus();
    };
    draw();
    return () => buildReviews(list);
  }

  // Новости «Скоро»: карточки с фото, заголовком и текстом. Фото грузятся как фото квартир (/api/admin/photos).
  const NEWS_MAX = 6;
  function newsEditor(initial) {
    const list = (Array.isArray(initial) ? initial : []).map(n => ({ ...n }));
    const box = document.getElementById('newsList');
    const add = document.getElementById('newsAdd');
    const draw = () => {
      box.innerHTML = list.length ? list.map((n, i) => `<div class="rev news-ed" data-i="${i}">
        <div class="row" style="margin-bottom:10px">
          ${n.photo ? `<img class="news-ed-img" src="/uploads/${esc(n.photo)}-t.webp" alt="">` : ''}
          <label class="upload" style="flex:1"><input type="file" accept="image/*" data-up>+ ${n.photo ? 'Заменить фото' : 'Добавить фото (необязательно)'}</label>
          ${n.photo ? '<button type="button" class="btn news-nophoto">Убрать фото</button>' : ''}
        </div>
        <label class="f"><span>Заголовок</span><input data-k="title" maxlength="120" value="${esc(n.title)}" placeholder="Например: Квартиры без первоначального взноса"></label>
        <label class="f"><span>Текст</span><textarea data-k="text" rows="3" maxlength="1000" placeholder="Например: Скоро старт продаж. Напишите — первым сообщу условия.">${esc(n.text)}</textarea></label>
        <label class="f"><span>Заголовок — по-кыргызски</span><input data-k="titleKy" maxlength="120" value="${esc(n.titleKy)}" placeholder="${esc(n.title || 'Пусто — на кыргызской версии будет русский заголовок')}"></label>
        <label class="f"><span>Текст — по-кыргызски</span><textarea data-k="textKy" rows="3" maxlength="1000" placeholder="${esc(n.text || 'Пусто — на кыргызской версии будет русский текст')}">${esc(n.textKy)}</textarea></label>
        <button type="button" class="btn btn-danger rev-del news-del">Удалить новость</button>
      </div>`).join('') : '<p class="hint">Новостей пока нет. Расскажите о том, что скоро: старт продаж, новый дом, особые условия.</p>';
      add.hidden = list.length >= NEWS_MAX;
    };
    box.addEventListener('input', e => {
      const el = e.target.closest('[data-k]'); if (!el) return;
      list[+el.closest('.news-ed').dataset.i][el.dataset.k] = el.value;
    });
    box.addEventListener('change', async e => {
      const inp = e.target.closest('[data-up]'); if (!inp || !inp.files[0]) return;
      const n = list[+inp.closest('.news-ed').dataset.i];
      const fd = new FormData(); fd.append('photos', inp.files[0]);
      toast('Загрузка фото…');
      try {
        const r = await api('POST', '/api/admin/photos', fd);
        n.photo = r.photos[0]; draw(); toast('Фото загружено — не забудьте сохранить');
      } catch (err) { toast(err.message); }
    });
    box.addEventListener('click', async e => {
      const ed = e.target.closest('.news-ed'); if (!ed) return;
      const i = +ed.dataset.i, n = list[i];
      if (e.target.closest('.news-nophoto')) { n.photo = ''; draw(); return; }
      if (!e.target.closest('.news-del')) return;
      if ((n.title || n.text) && !(await confirmBox('Удалить новость?', 'Новость исчезнет с сайта после сохранения.', 'Удалить', true))) return;
      list.splice(i, 1); draw();
    });
    add.onclick = () => {
      list.unshift({ title: '', text: '', photo: '' });
      draw();
      const first = box.querySelector('.news-ed input[data-k]'); if (first) first.focus();
    };
    draw();
    return () => list.filter(n => String(n.title || '').trim() || String(n.text || '').trim());
  }

  // ---------- Профиль (настройки сайта) ----------
  async function renderSettings() {
    settings = await api('GET', '/api/admin/settings');
    const s = settings;
    const f = (k, label, type = 'text', hint = '') => `<label class="f"><span>${label}</span><input type="${type}" name="${k}" value="${esc(s[k])}">${hint ? `<div class="hint">${hint}</div>` : ''}</label>`;
    const t = (k, label, hint = '') => `<label class="f"><span>${label}</span><textarea name="${k}" rows="6">${esc(s[k])}</textarea>${hint ? `<div class="hint">${hint}</div>` : ''}</label>`;
    // Вкладки: длинная страница разбита на части. Сохраняется вся форма сразу (кнопка «Сохранить» внизу любой вкладки).
    const TABS = [['main', 'Основное'], ['texts', 'Тексты сайта'], ['ky', 'Кыргызча'], ['news', 'Новости'], ['pw', 'Пароль']];
    app.innerHTML = `${nav('settings')}<div class="wrap"><h1>Профиль</h1>
      <div class="filters ptabs" id="ptabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" data-t="${k}">${l}</button>`).join('')}</div>
      <form id="sf">
        <div class="card" data-ptab="main"><h2 style="margin-top:0">Менеджер</h2>
          <div class="row" style="margin-bottom:12px">
            ${s.photo ? `<img src="${esc(s.photo)}" style="width:72px;height:90px;object-fit:cover;border-radius:10px">` : ''}
            <label class="upload" style="flex:1"><input type="file" id="pf" accept="image/*">+ ${s.photo ? 'Заменить фото' : 'Загрузить своё фото'}</label>
          </div>
          ${f('name', 'Имя')}
          ${f('role', 'Кем работаете', 'text', 'Например: Менеджер строительной компании «Кут»')}
          ${me.kutSite ? `<label class="f" style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" name="kutShow" ${s.kutShow === 'on' ? 'checked' : ''} style="width:auto;margin-top:3px"> <span style="margin:0">Показывать на сайте блок «Достижения компании» — сданные и строящиеся дома «${esc(me.company.name)}» (после «Обо мне»)</span></label>
          <details class="hint kut-help" style="margin:-6px 0 14px 30px"><summary style="cursor:pointer;color:var(--accent,#a8834a);font-weight:600">Подробнее — что появится на сайте</summary>
            <div style="margin-top:8px;line-height:1.5">
              На главной вашего сайта, сразу после «Обо мне», появится блок о строительной компании «${esc(me.company.name)}»:
              <ul style="margin:6px 0 6px 18px;padding:0">
                <li><b>Цифры:</b> всего объектов — ${me.company.total}, сданных жилых комплексов — ${me.company.done}, квартир уже передано владельцам — ${fmt(me.company.flatsDone)}.</li>
                <li><b>Карточки домов:</b> ${esc(me.company.sample.join(', '))} и другие — сдан или когда сдача, адрес, этажи, блоки, квартиры.</li>
                <li>В каждой карточке кнопка «Подробнее»: отделка, фасад, конструкция, коммуникации и что рядом (школы, садики, рынки).</li>
                <li>Сначала видно 6 домов (на телефоне 3), остальные — по кнопке «Показать все объекты».</li>
              </ul>
              Зачем: клиенту спокойнее покупать, когда он видит, сколько домов компания уже сдала. Цены отдела продаж и внутренние данные в блоке не показываются.
              Выключить можно в любой момент — снимите галочку и нажмите «Сохранить».
              ${s.kutShow === 'on' ? `<div style="margin-top:6px"><a href="${esc(me.realtor.url)}#company" target="_blank" rel="noopener">Посмотреть на моём сайте ↗</a></div>` : ''}
            </div>
          </details>` : ''}
        </div>
        <div class="card" data-ptab="texts"><h2 style="margin-top:0">Первый экран и цифры</h2>
          ${f('heroKicker', 'Надпись над заголовком')}
          ${f('tagline', 'Заголовок первого экрана')}
          ${t('heroPoints', 'Пункты под кнопками', 'Каждый пункт с новой строки, лучше 2–3 коротких')}
          ${t('stats', 'Цифры доверия', 'Каждая строка: значение | подпись. Например: 3 года | в недвижимости')}
        </div>
        <div class="card" data-ptab="main"><h2 style="margin-top:0">Компания и логотип</h2>
          ${f('company', 'Компания', 'text', 'Например: Строительная компания «Кут». Можно оставить пустым.')}
          <div class="row" style="margin-bottom:6px">
            ${s.logo ? `<div class="logo-prev"><img src="${esc(s.logo)}" alt=""></div>` : ''}
            <label class="upload" style="flex:1"><input type="file" id="lf2" accept="image/*">+ ${s.logo ? 'Заменить логотип' : 'Загрузить логотип'}</label>
            ${s.logo ? '<button type="button" class="btn btn-danger" id="logoDel">Убрать</button>' : ''}
          </div>
          <div class="hint">Лучше PNG с прозрачным фоном. Без логотипа на сайте показывается только имя.</div>
        </div>
        <div class="card" data-ptab="main"><h2 style="margin-top:0">Контакты</h2>
          ${f('whatsapp', 'Номер WhatsApp', 'tel', 'С кодом страны, например +996 550 022 508. Сюда приходят все заявки с сайта.')}
          ${f('instagram', 'Instagram', 'text', 'Ник, например @arlen.kut')}
          ${f('officeAddress', 'Адрес офиса')}
          ${f('officeLink', 'Ссылка на офис в 2ГИС')}
        </div>
        <div class="card" data-ptab="main"><h2 style="margin-top:0">Валюта</h2>
          <div class="grid2">${f('currencyInstallment', 'Рассрочка')}${f('currencyCash', 'Наличные')}</div>
        </div>
        <div class="card" data-ptab="ky"><h2 style="margin-top:0">Кыргызская версия сайта</h2>
          <div class="hint" style="margin:-4px 0 12px">Эти тексты видят клиенты, которые нажали на сайте «Кыр». Пустое поле — покажется русский текст. Серым в поле подсказан ваш русский вариант.</div>
          ${[['heroKicker', 'Надпись над заголовком'], ['tagline', 'Заголовок первого экрана'], ['role', 'Кем работаете'], ['heroPoints', 'Пункты под кнопками', 1],
            ['stats', 'Цифры доверия', 1], ['steps', 'Как работает рассрочка — шаги', 1], ['documents', 'Какие документы нужны', 1],
            ['faq', 'Вопросы и ответы', 1]]
            .map(([k, label, area]) => `<label class="f"><span>${label} — по-кыргызски</span>${area
              ? `<textarea name="${k}Ky" rows="5" placeholder="${esc(s[k])}">${esc(s[k + 'Ky'])}</textarea>`
              : `<input type="text" name="${k}Ky" value="${esc(s[k + 'Ky'])}" placeholder="${esc(s[k])}">`}</label>`).join('')}
        </div>
        <div class="card" data-ptab="news"><h2 style="margin-top:0">Новости «Скоро»</h2>
          <div class="hint" style="margin:-4px 0 10px">Показываются на главной сразу после первого экрана. Под каждой новостью кнопка «Узнать первым» — клиент пишет вам в WhatsApp. До ${NEWS_MAX} новостей.</div>
          <div id="newsList" class="rev-list"></div>
          <button type="button" class="btn btn-block" id="newsAdd">+ Добавить новость</button>
        </div>
        <div class="card" data-ptab="texts"><h2 style="margin-top:0">Блоки главной</h2>
          ${t('steps', 'Как работает рассрочка — шаги', 'Каждый шаг с новой строки. Пишите свои условия: с кем договор, как платёж. Пустое поле — шагов на сайте не будет')}
          ${t('documents', 'Какие документы нужны', 'Каждый пункт с новой строки. Пустое поле — пункт скрыт')}
          <div class="f"><span>Отзывы клиентов</span>
            <div id="revList" class="rev-list"></div>
            <button type="button" class="btn btn-block" id="revAdd">+ Добавить отзыв</button>
            <div class="hint">Новые отзывы появляются на сайте сверху. Пустые карточки не сохраняются.</div>
          </div>
          ${t('faq', 'Вопросы и ответы', 'Первая строка — вопрос, дальше ответ. Разделяйте пустой строкой.')}
          ${t('privacy', 'Политика конфиденциальности')}
        </div>
        <div class="savebar" id="psave"><button class="btn btn-primary">Сохранить</button></div>
      </form>
      <form class="card" id="pwf" data-ptab="pw"><h2 style="margin-top:0">Пароль от кабинета</h2>
        <div class="hint" style="margin-bottom:10px">Логин: <b>${esc(me.login)}</b></div>
        <label class="f"><span>Текущий пароль</span><input type="password" name="current" autocomplete="current-password" required></label>
        <label class="f"><span>Новый пароль</span><input type="password" name="next" autocomplete="new-password" minlength="8" required></label>
        <div class="err" id="pwErr"></div>
        <button class="btn">Сменить пароль</button>
      </form>
      <div class="card" data-ptab="pw"><h2 style="margin-top:0">Устройства</h2>
        <p class="hint" style="margin-bottom:14px">Заходили в кабинет с чужого ноутбука или телефона и забыли выйти? Нажмите — там кабинет закроется и попросит логин и пароль. Здесь вы останетесь.</p>
        <button type="button" class="btn" id="logoutAll">Выйти на всех других устройствах</button>
      </div>
    </div>`;
    bindNav();
    const showTab = t => {
      profileTab = t;
      document.querySelectorAll('#ptabs [data-t]').forEach(b => { b.classList.toggle('on', b.dataset.t === t); b.setAttribute('aria-selected', b.dataset.t === t); });
      document.querySelectorAll('[data-ptab]').forEach(el => { el.hidden = el.dataset.ptab !== t; });
      document.getElementById('psave').hidden = t === 'pw';
    };
    document.getElementById('ptabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { showTab(b.dataset.t); window.scrollTo(0, 0); } };
    showTab(profileTab);
    const form = document.getElementById('sf');
    const getReviews = reviewsEditor(s.reviews);
    const getNews = newsEditor(s.news);
    form.onsubmit = async e => {
      e.preventDefault();
      // Поля карточек отзывов и новостей без name — в форму не попадают; они собираются из карточек
      const data = Object.fromEntries(new FormData(form));
      if (form.kutShow) data.kutShow = form.kutShow.checked ? 'on' : ''; // снятая галочка тоже сохраняется
      data.reviews = getReviews();
      data.news = getNews();
      settings = await api('PUT', '/api/admin/settings', data);
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
    document.getElementById('logoutAll').onclick = async () => {
      if (!(await confirmBox('Выйти на других устройствах?', 'На всех других телефонах и компьютерах кабинет попросит логин и пароль. Здесь вы останетесь в кабинете.', 'Выйти на других'))) return;
      await api('POST', '/api/admin/logout-all');
      toast('Готово: на других устройствах кабинет закрыт');
    };
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
  let anRealtor = ''; // для владельца: '' — свой кабинет, 'all' — все, или id менеджера

  function delta(cur, prev) {
    if (!prev && !cur) return '';
    if (!prev) return '<span class="up">новое</span>';
    const d = Math.round(((cur - prev) / prev) * 100);
    return d === 0 ? '<span>0%</span>' : `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}%</span>`;
  }

  // Разговоры клиентов с ИИ-помощником на сайте менеджера — видит только сам менеджер
  async function loadMyChats() {
    const box = document.getElementById('myChats');
    if (!box) return;
    const chats = await api('GET', '/api/admin/aichat/chats').catch(() => []);
    if (!chats.length) return;
    const when = t => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    box.innerHTML = `<div class="card"><h2 style="margin-top:0">Разговоры с ИИ на вашем сайте</h2>
      <p class="hint" style="margin-top:0">Что клиенты спрашивали у ИИ-помощника (последние 30 дней). Видите только вы.</p>
      ${chats.map(c => {
        const first = (c.msgs.find(m => m.r === 'u') || {}).t || '';
        return `<details style="border:1px solid var(--line,#e5e5ea);border-radius:12px;padding:10px 12px;margin:0 0 8px">
          <summary><span class="hint" style="margin:0">${when(c.at)} · ${c.msgs.filter(m => m.r === 'u').length} вопр.${c.wants ? ` · ищет: ${esc(c.wants)}` : ''}</span><div style="margin-top:4px">«${esc(first.slice(0, 120))}»</div></summary>
          <div style="margin-top:10px">${c.msgs.map(m => m.r === 'u'
            ? `<div style="margin:8px 0 4px"><b>Клиент:</b> ${esc(m.t)}</div>`
            : `<div style="margin:0 0 8px;padding:8px 10px;border-radius:10px;background:var(--soft,#f5f5f7)"><b>ИИ:</b> ${esc(m.t).replace(/\n/g, '<br>')}</div>`).join('')}</div>
        </details>`;
      }).join('')}</div>`;
  }
  // Номера клиентов, написавших в WhatsApp (приходят сами через WhatsApp Cloud API)
  async function loadWaLeads(q) {
    const box = document.getElementById('waLeads');
    if (!box) return;
    const r = await api('GET', `/api/admin/wa-leads?${q}`).catch(() => null);
    if (!r) { box.remove(); return; }
    const when = t => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const head = '<h2 style="margin-top:0">Номера из WhatsApp</h2>';
    if (!r.on && !r.list.length) {
      box.innerHTML = head + `<p class="hint" style="margin:0">Здесь сами появятся номера всех, кто написал вам в WhatsApp: имя, номер, квартира и первое сообщение. ${isOwner() ? 'Подключите WhatsApp в разделе «Менеджеры» → «Номера из WhatsApp».' : 'Пока не подключено — подключает владелец сервиса.'}</p>`;
      return;
    }
    if (!r.list.length) { box.innerHTML = head + `<p class="hint" style="margin:0">За ${anDays} дней новых номеров нет.</p>`; return; }
    const all = r.list.map(l => '+' + l.phone).join('\n');
    box.innerHTML = head + `<div class="row" style="justify-content:space-between;align-items:center;margin:-4px 0 10px">
        <span class="hint" style="margin:0">Новых за ${anDays} дней: <b>${r.list.length}</b></span>
        <button class="btn" data-copy-text="${esc(all)}">Скопировать все номера</button></div>
      <div class="wa-list">${r.list.map(l => {
        const text = l.text.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
        return `<div class="wa-item" data-id="${esc(l.id)}">
          <div class="wa-top"><b>${esc(l.name || 'Без имени')}</b><span class="hint" style="margin:0">${when(l.firstAt)}${l.n > 1 ? ` · сообщений: ${l.n}` : ''}</span></div>
          <div class="wa-top"><a class="wa-phone" href="https://wa.me/${esc(l.phone)}" target="_blank" rel="noopener">${esc(fmtPhone(l.phone) || '+' + l.phone)}</a><button class="btn" data-del title="Удалить номер">×</button></div>
          ${l.aptTitle || l.apt ? `<div class="wa-apt">${esc(l.aptTitle || 'Квартира с сайта')}</div>` : ''}
          ${text ? `<div class="hint" style="margin:0">${esc(text.length > 140 ? text.slice(0, 140) + '…' : text)}</div>` : ''}
          ${l.who ? `<div class="hint" style="margin:0">→ ${esc(l.who)}</div>` : ''}
        </div>`;
      }).join('')}</div>
      <p class="hint">Нажмите на номер — откроется чат. Номера хранятся год, потом удаляются сами.</p>`;
    box.querySelector('[data-copy-text]').onclick = e => copy(e.currentTarget.dataset.copyText, 'Номера скопированы');
    box.querySelectorAll('[data-del]').forEach(b => { b.onclick = async () => {
      const tr = b.closest('.wa-item');
      if (!confirm('Удалить этот номер из списка?')) return;
      try { await api('DELETE', `/api/admin/wa-leads/${tr.dataset.id}`); tr.remove(); toast('Номер удалён'); } catch (err) { toast(err.message); }
    }; });
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
        <option value="">Мои квартиры</option><option value="all" ${anRealtor === 'all' ? 'selected' : ''}>Все менеджеры вместе</option>
        ${realtors.filter(x => x.role !== 'owner').map(x => `<option value="${x.id}" ${anRealtor === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
      </select></label>` : ''}

      <div class="kpis">
        ${tile('Посетители', fmt(T.visitors), P.visitors, 'людей')}
        ${tile('Просмотры', fmt(T.views), P.views, 'страниц')}
        ${tile('Заявки в WhatsApp', fmt(T.waVisitors), P.waVisitors, `нажатий: ${fmt(T.wa)}`)}
        <div class="kpi"><span>Конверсия</span><b>${T.conv}%</b><small>из посетителей написали · было ${P.conv}%</small></div>
      </div>
      <p class="hint">Проценты — сравнение с предыдущими ${anDays} днями.</p>

      <div class="card" id="waLeads"><h2 style="margin-top:0">Номера из WhatsApp</h2><p class="hint">Загружаю…</p></div>

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
        ${sources.map(([k, label]) => `<div class="tagrow"><span>${label}</span><code>${esc(myUrl)}?src=${k}</code><button class="btn" data-copy="${esc(myUrl)}?src=${k}">Копировать</button><button class="btn" data-copy-text="${esc(withText(`${myUrl}?src=${k}`))}" title="Ссылка с приветствием — для сообщений, статуса, сторис">С текстом</button></div>`).join('')}
      </div>`}
      ${isOwner() ? '' : '<div id="myChats"></div>'}
    </div>`;
    bindNav();
    loadWaLeads(q);
    if (!isOwner()) loadMyChats();
    document.getElementById('days').onclick = e => { const b = e.target.closest('button'); if (b) { anDays = +b.dataset.d; renderAnalytics(); } };
    const sel = document.getElementById('anR');
    if (sel) sel.onchange = () => { anRealtor = sel.value; renderAnalytics(); };
  }

  // ---------- Владелец: менеджеры ----------
  // +n дней к оплате: от даты окончания, а если она уже прошла — от сегодня
  const addDays = (from, n) => {
    const today = new Date().toISOString().slice(0, 10);
    const d = new Date(`${from && from >= today ? from : today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const addMonths = (from, n) => {
    const today = new Date().toISOString().slice(0, 10);
    const d = new Date(`${from && from >= today ? from : today}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    return d.toISOString().slice(0, 10);
  };

  function credentialsText(r, login, password) {
    return `Здравствуйте! Ваш кабинет готов.\n\nВаш сайт для клиентов: ${r.url}\nВход в кабинет: ${r.url}/admin\nЛогин: ${login}\nПароль: ${password}\n\nКак добавить квартиру: «Квартиры» → «+ Добавить» — она сразу появится на вашем сайте. В «Профиль» добавьте свой WhatsApp, фото и смените пароль.`;
  }

  function showCredentials(r, login, password, title) {
    const text = credentialsText(r, login, password);
    const box = document.getElementById('creds');
    box.hidden = false;
    box.innerHTML = `<h2 style="margin-top:0">${title}</h2>
      <p class="hint">Пароль показывается только сейчас — скопируйте и отправьте менеджеру.</p>
      <pre>${esc(text)}</pre>
      <div class="row"><button class="btn btn-primary" id="credCopy">Скопировать сообщение</button><button class="btn" id="credHide">Скрыть</button></div>`;
    document.getElementById('credCopy').onclick = () => copy(text, 'Сообщение скопировано');
    document.getElementById('credHide').onclick = () => { box.hidden = true; };
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Учёт денег (/money/<имя>) ----------
  // Владелец заводит человека: имя для адреса и как его звать. Человек получает ссылку-приглашение и сам придумывает пароль.
  // Сами записи людей здесь не показываются — только кто есть, задан ли пароль и когда входили.
  const moneyLink = x => `${location.origin}/money/${x.name}${x.invite ? `?invite=${x.invite}` : ''}`;
  // Учёт — бонус к подписке: привязан к менеджеру. Подписка закончилась → учёт только для просмотра.
  let MGRS = [];
  const mgrOptions = sel => `<option value="">Без привязки — работает всегда</option>${MGRS.map(m => `<option value="${esc(m.id)}" ${m.id === sel ? 'selected' : ''}>${esc(m.name || m.slug)}${m.status.active ? '' : ' — подписка закончилась'}</option>`).join('')}`;
  function moneyUsersHtml(users) {
    return `<p class="hint" style="margin:0 0 12px">У каждого человека свой учёт доходов и расходов по адресу <b>${esc(location.host)}/money/имя</b>. Вы заводите человека и отправляете ему ссылку-приглашение — по ней он сам придумает пароль. Его записи видит только он.<br>Учёт — бонус к подписке: привяжите его к менеджеру. Когда подписка закончится, записи останутся видны, но добавлять новые будет нельзя. После продления всё снова работает.</p>
      ${users.map(x => `<div class="rt" data-mu="${esc(x.name)}" style="padding:12px 0;border-top:1px solid var(--line, #eee)">
        <div><b>${esc(x.title)}</b> ${x.main ? '<span class="badge badge-installment">Вы</span>' : ''} · <a href="/money/${esc(x.name)}" target="_blank" rel="noopener">/money/${esc(x.name)}</a></div>
        ${x.main ? '' : `<label class="f" style="margin:6px 0 4px"><span>Подписка менеджера${x.expired ? ' · <b style="color:#ff9f0a">закончилась — только просмотр</b>' : ''}</span><select data-mgr>${mgrOptions(x.realtorId)}</select></label>`}
        <div class="hint" style="margin:4px 0 8px">${x.active ? `Пароль задан ✓${x.lastLogin ? ` · последний вход ${esc(fmtDate(x.lastLogin.slice(0, 10)))}` : ''}` : 'Ждёт: человек ещё не открыл приглашение'}</div>
        <div class="row" style="display:flex;flex-wrap:wrap;gap:8px">
          ${x.invite ? '<button class="btn" type="button" data-mact="copy">Скопировать приглашение</button>' : ''}
          ${x.main ? '' : '<button class="btn" type="button" data-mact="reset">Сбросить пароль</button><button class="btn btn-danger" type="button" data-mact="del">Удалить</button>'}
        </div></div>`).join('')}
      <form id="mnyNew" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line, #eee)">
        <b>+ Новый учёт</b>
        <div style="margin-top:10px">
          <label class="f"><span>Как зовут</span><input name="title" required placeholder="Айбек"></label>
          <label class="f"><span>Имя в адресе (латиницей)</span><input name="name" required autocapitalize="none" spellcheck="false" placeholder="aibek" pattern="[a-zA-Z0-9][a-zA-Z0-9\\-]{1,29}"></label>
          <label class="f"><span>Чья подписка (менеджер)</span><select name="realtorId">${mgrOptions('')}</select></label>
        </div>
        <p class="err" id="mnyErr"></p>
        <button class="btn btn-primary" type="submit">Создать и получить приглашение</button>
      </form>`;
  }
  function bindMoneyUsers(initial) {
    const body = document.getElementById('mnyBody');
    if (!body) return;
    let users = [];
    const draw = list => { users = list; body.innerHTML = moneyUsersHtml(list); bind(); };
    const invite = async x => {
      const link = moneyLink(x);
      const go = await modal({ title: `Приглашение для «${x.title}»`, html: `<p>Отправьте человеку эту ссылку (например, в WhatsApp). По ней он придумает свой пароль — после этого ссылка перестанет работать.</p><p style="word-break:break-all"><b>${esc(link)}</b></p>`, okText: 'Скопировать ссылку', cancelText: 'Закрыть' });
      if (go) await copy(link, 'Приглашение скопировано — отправьте его человеку');
    };
    function bind() {
      const nameIn = body.querySelector('#mnyNew [name=name]'), titleIn = body.querySelector('#mnyNew [name=title]');
      // Имя в адресе подставляется само из латинских букв, пока его не правили руками
      let touched = false;
      nameIn.oninput = () => { touched = true; };
      titleIn.oninput = () => { if (!touched) nameIn.value = translit(titleIn.value); };
      body.querySelector('#mnyNew').onsubmit = async e => {
        e.preventDefault();
        const f = e.target;
        try {
          const list = await api('POST', '/api/owner/money-users', { title: f.title.value, name: f.name.value, realtorId: f.realtorId.value });
          draw(list);
          const x = list.find(u => u.name === f.name.value.trim().toLowerCase());
          if (x) await invite(x);
        } catch (err) { document.getElementById('mnyErr').textContent = err.message; }
      };
      body.querySelectorAll('[data-mgr]').forEach(sel => {
        sel.onchange = async () => {
          const name = sel.closest('[data-mu]').dataset.mu;
          try { draw(await api('PUT', `/api/owner/money-users/${encodeURIComponent(name)}`, { realtorId: sel.value })); toast('Сохранено'); } catch (err) { toast(err.message); }
        };
      });
      body.querySelectorAll('[data-mact]').forEach(b => {
        b.onclick = async () => {
          const x = users.find(u => u.name === b.closest('[data-mu]').dataset.mu);
          if (!x) return;
          try {
            if (b.dataset.mact === 'copy') return invite(x);
            if (b.dataset.mact === 'reset') {
              if (!await modal({ title: 'Сбросить пароль?', text: `Учёт «${x.title}» закроется на всех телефонах. Записи останутся. Человек получит новую ссылку-приглашение и придумает новый пароль.`, okText: 'Сбросить' })) return;
              const list = await api('POST', `/api/owner/money-users/${encodeURIComponent(x.name)}/reset`);
              draw(list); return invite(list.find(u => u.name === x.name));
            }
            if (b.dataset.mact === 'del') {
              if (!await modal({ title: `Удалить учёт «${x.title}»?`, text: 'Все его записи, кошельки и долги удалятся навсегда. Вернуть их будет нельзя.', okText: 'Удалить навсегда', danger: true })) return;
              draw(await api('DELETE', `/api/owner/money-users/${encodeURIComponent(x.name)}`)); toast('Учёт удалён');
            }
          } catch (err) { toast(err.message); }
        };
      });
    }
    users = initial; bind();
  }
  // ---------- Учёт товаров (/shop/<имя>) — так же, как учёт денег: приглашение по ссылке, свой пароль ----------
  const shopLink = x => `${location.origin}/shop/${x.name}${x.invite ? `?invite=${x.invite}` : ''}`;
  function shopUsersHtml(users) {
    return `<p class="hint" style="margin:0 0 12px">Для бизнесменов: товары, закупки, продажи, расходы месяца и анализ продаж — по адресу <b>${esc(location.host)}/shop/имя</b>. Вы заводите человека и отправляете ему ссылку-приглашение — по ней он сам придумает пароль. Его товары и продажи видит только он.</p>
      ${users.map(x => `<div class="rt" data-su="${esc(x.name)}" style="padding:12px 0;border-top:1px solid var(--line, #eee)">
        <div><b>${esc(x.title)}</b> · <a href="/shop/${esc(x.name)}" target="_blank" rel="noopener">/shop/${esc(x.name)}</a></div>
        <div class="hint" style="margin:4px 0 8px">${x.active ? `Пароль задан ✓${x.lastLogin ? ` · последний вход ${esc(fmtDate(x.lastLogin.slice(0, 10)))}` : ''}` : 'Ждёт: человек ещё не открыл приглашение'}</div>
        <div class="row" style="display:flex;flex-wrap:wrap;gap:8px">
          ${x.invite ? '<button class="btn" type="button" data-sact="copy">Скопировать приглашение</button>' : ''}
          <button class="btn" type="button" data-sact="reset">Сбросить пароль</button><button class="btn btn-danger" type="button" data-sact="del">Удалить</button>
        </div></div>`).join('')}
      <form id="shpNew" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line, #eee)">
        <b>+ Новый учёт товаров</b>
        <div style="margin-top:10px">
          <label class="f"><span>Как зовут</span><input name="title" required placeholder="Магазин Айбека"></label>
          <label class="f"><span>Имя в адресе (латиницей)</span><input name="name" required autocapitalize="none" spellcheck="false" placeholder="aibek" pattern="[a-zA-Z0-9][a-zA-Z0-9\\-]{1,29}"></label>
        </div>
        <p class="err" id="shpErr"></p>
        <button class="btn btn-primary" type="submit">Создать и получить приглашение</button>
      </form>`;
  }
  // ЖК: у каждого один адрес, район, город и карта — правка сразу у всех квартир этого ЖК (у всех менеджеров)
  function zkCardHtml(zks) {
    return `<details class="card" id="zkCard"><summary><b>ЖК</b> · ${zks.length} · адрес и карта для всех квартир</summary>
      <div class="hint" style="margin:12px 0">У каждого ЖК один адрес и одна ссылка на карту. Поменяли здесь — поменяется у всех его квартир у всех менеджеров. Менеджеры эти поля у существующих ЖК не меняют.</div>
      ${zks.map(c => `<form class="zk-ed" data-key="${esc(c.key)}" style="border-top:1px solid var(--line,#333);padding:12px 0">
        <b>${esc(c.name)}</b> <span class="hint" style="margin:0">· квартир: ${c.n}</span>
        <div class="grid2" style="margin-top:8px">
          <label class="f"><span>Город</span><select name="city">${['Бишкек', 'Ош'].map(x => `<option ${(c.city || 'Бишкек') === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
          <label class="f"><span>Район</span><input type="text" name="district" value="${esc(c.district || '')}" maxlength="60"></label>
        </div>
        <label class="f"><span>Адрес</span><input type="text" name="address" value="${esc(c.address || '')}" maxlength="200"></label>
        <label class="f"><span>Ссылка на карту — 2ГИС или Google</span><input type="text" name="mapLink" value="${esc(c.mapLink || '')}" inputmode="url" placeholder="Из 2ГИС или Google Карт"></label>
        <div class="err"></div>
        <button class="btn">Сохранить для всех квартир ЖК</button>
      </form>`).join('')}
    </details>`;
  }
  function bindZkCard() {
    document.querySelectorAll('#zkCard .zk-ed').forEach(fm => {
      fm.onsubmit = async e => {
        e.preventDefault();
        const err = fm.querySelector('.err'); err.textContent = '';
        try {
          const r = await api('PUT', `/api/owner/complexes/${encodeURIComponent(fm.dataset.key)}`, Object.fromEntries(new FormData(fm)));
          if (r.mapError) err.textContent = r.mapError;
          toast(`Сохранено у ${r.apartments} квартир`);
        } catch (x) { err.textContent = x.message; }
      };
    });
  }

  // Промокоды партнёров (например, SUETA для подписчиков @suetaakg): ссылка kvartiry.asia/p/КОД, промокод сам
  // вписывается в сообщение «Хочу подключить»; видно, сколько человек перешли и нажали кнопку.
  function promosHtml(list) {
    const link = c => `${location.origin}/p/${c}`;
    return `<div class="hint" style="margin-bottom:10px">Дайте партнёру ссылку — его подписчики откроют страницу /partner, увидят свой промокод, и он сам впишется в сообщение вам в WhatsApp. Так сразу видно, кто от кого пришёл.</div>
      ${list.map(p => `<div class="promo-row" data-code="${esc(p.code)}" style="border-top:1px solid var(--line2,#333);padding:12px 0">
        <div class="row" style="justify-content:space-between;align-items:baseline"><b style="font-size:18px;letter-spacing:.06em">${esc(p.code)}</b><span class="hint" style="margin:0">${p.active ? 'работает' : 'выключен'}</span></div>
        <div class="hint" style="margin:4px 0">${esc(p.partner || '—')}${p.discount ? ` · скидка ${p.discount}% на первую оплату` : ''}${p.offer ? ` · ${esc(p.offer)}` : ''}${p.percent ? ` · партнёру ${p.percent}% от первой оплаты` : ''}</div>
        <div style="margin:6px 0">Перешли по ссылке: <b>${p.visits}</b> · нажали «Подключить»: <b>${p.clicks}</b></div>
        <div class="linkrow"><code>${esc(link(p.code))}</code><button type="button" class="btn" data-pcopy="${esc(link(p.code))}">Копировать</button></div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" data-ptoggle>${p.active ? 'Выключить' : 'Включить'}</button><button type="button" class="btn" data-pdel>Удалить</button></div>
      </div>`).join('')}
      <form id="promoNew" style="border-top:1px solid var(--line2,#333);padding-top:12px">
        <b>Новый промокод</b>
        <div class="grid2" style="margin-top:8px">
          <label class="f"><span>Код</span><input type="text" name="code" maxlength="20" placeholder="SUETA" required style="text-transform:uppercase"></label>
          <label class="f"><span>Партнёр</span><input type="text" name="partner" maxlength="80" placeholder="Алина Кайзер, @suetaakg"></label>
        </div>
        <div class="grid2">
          <label class="f"><span>Скидка подписчику, %</span><input type="text" name="discount" inputmode="numeric" placeholder="20"></label>
          <label class="f"><span>Доля партнёра от первой оплаты, %</span><input type="text" name="percent" inputmode="numeric" placeholder="50"></label>
        </div>
        <div class="err" id="promoErr"></div>
        <button class="btn btn-primary">Создать промокод</button>
      </form>`;
  }
  function bindPromos() {
    const body = document.getElementById('promoBody');
    if (!body) return;
    const redraw = list => { body.innerHTML = promosHtml(list); document.querySelector('#promoCard summary').innerHTML = `<b>Промокоды</b> · ${list.length} · для партнёров на странице /partner`; bindPromos(); };
    body.querySelectorAll('[data-pcopy]').forEach(b => { b.onclick = () => copy(b.dataset.pcopy); });
    body.querySelectorAll('.promo-row').forEach(row => {
      const code = row.dataset.code;
      row.querySelector('[data-ptoggle]').onclick = async () => { const on = row.querySelector('[data-ptoggle]').textContent === 'Включить'; redraw(await api('PUT', `/api/owner/promos/${code}`, { active: on })); };
      row.querySelector('[data-pdel]').onclick = async () => { if (await confirmBox('Удалить промокод?', `Ссылка /p/${code} перестанет работать.`, 'Удалить', true)) redraw(await api('DELETE', `/api/owner/promos/${code}`)); };
    });
    document.getElementById('promoNew').onsubmit = async e => {
      e.preventDefault();
      try { redraw(await api('POST', '/api/owner/promos', Object.fromEntries(new FormData(e.target)))); toast('Промокод создан — скопируйте ссылку для партнёра'); }
      catch (err) { showErr('promoErr', err.message); }
    };
  }

  // Номера из WhatsApp: подключение WhatsApp Cloud API (Meta)
  function waCardHtml(w) {
    const when = t => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `<details class="card" id="waCard"><summary><b>Номера из WhatsApp</b> · ${w.hasSecret ? (w.lastAt ? 'работает ✓' : 'ждёт первое сообщение') : 'не подключено'}</summary>
      <div style="margin-top:12px">
        <div class="hint" style="margin-bottom:10px">Когда клиент пишет менеджеру в WhatsApp, его имя, номер, квартира и первое сообщение сами появляются в «Аналитике» этого менеджера. Менеджер определяется по номеру WhatsApp из его профиля. Входящие сообщения у Meta бесплатны.</div>
        ${w.lastAt ? `<p class="hint">Последнее сообщение пришло: <b>${when(w.lastAt)}</b></p>` : ''}
        ${w.lastUnmatched ? `<p class="hint" style="color:var(--red,#c0392b)">Пришло сообщение на номер +${esc(w.lastUnmatched)}, но ни у одного менеджера в профиле нет такого WhatsApp. Проверьте номер в профиле менеджера.</p>` : ''}
        <ol class="hint" style="padding-left:18px;line-height:1.6">
          <li>На <b>developers.facebook.com</b> создайте приложение (тип «Бизнес») и добавьте в него <b>WhatsApp</b>.</li>
          <li>В WhatsApp → «Настройка API» добавьте номера менеджеров.</li>
          <li>В WhatsApp → «Конфигурация» → Webhook вставьте адрес и код ниже, затем подпишитесь на поле <b>messages</b>.</li>
          <li>Настройки приложения → «Основное» → «Секрет приложения»: скопируйте и вставьте сюда.</li>
        </ol>
        <div class="linkrow"><code>${esc(w.webhook)}</code><button type="button" class="btn" data-wa-copy="${esc(w.webhook)}">Копировать адрес</button></div>
        <div class="linkrow"><code>${esc(w.verifyToken)}</code><button type="button" class="btn" data-wa-copy="${esc(w.verifyToken)}">Копировать код</button></div>
        <form id="wafm" style="margin-top:12px">
          <label class="f"><span>Секрет приложения ${w.hasSecret ? '(сохранён — чтобы заменить, вставьте новый)' : ''}</span><input name="appSecret" type="password" autocomplete="off" spellcheck="false" placeholder="32 знака"></label>
          <div class="err" id="waErr"></div>
          <button class="btn btn-primary">Сохранить</button>
          ${w.hasSecret ? '<button type="button" class="btn" id="waOff">Отключить</button>' : ''}
        </form>
      </div>
    </details>`;
  }
  function bindWaCard() {
    const card = document.getElementById('waCard');
    const reopen = async () => { await renderRealtors(); document.getElementById('waCard').open = true; };
    card.querySelectorAll('[data-wa-copy]').forEach(b => { b.onclick = () => copy(b.dataset.waCopy); });
    document.getElementById('wafm').onsubmit = async e => {
      e.preventDefault();
      const v = e.target.appSecret.value.trim();
      if (!v) { showErr('waErr', 'Вставьте секрет приложения'); return; }
      try { await api('PUT', '/api/owner/wa', { appSecret: v }); toast('Сохранено'); await reopen(); } catch (err) { showErr('waErr', err.message); }
    };
    const off = document.getElementById('waOff');
    if (off) off.onclick = async () => {
      if (!confirm('Отключить? Новые номера перестанут приходить. Уже полученные останутся.')) return;
      await api('PUT', '/api/owner/wa', { appSecret: null }); toast('Отключено'); await reopen();
    };
  }

  function bindShopUsers(initial) {
    const body = document.getElementById('shpBody');
    if (!body) return;
    let users = initial;
    const draw = list => { users = list; body.innerHTML = shopUsersHtml(list); bind(); };
    const invite = async x => {
      const link = shopLink(x);
      const go = await modal({ title: `Приглашение для «${x.title}»`, html: `<p>Отправьте человеку эту ссылку (например, в WhatsApp). По ней он придумает свой пароль — после этого ссылка перестанет работать.</p><p style="word-break:break-all"><b>${esc(link)}</b></p>`, okText: 'Скопировать ссылку', cancelText: 'Закрыть' });
      if (go) await copy(link, 'Приглашение скопировано — отправьте его человеку');
    };
    function bind() {
      const nameIn = body.querySelector('#shpNew [name=name]'), titleIn = body.querySelector('#shpNew [name=title]');
      let touched = false;
      nameIn.oninput = () => { touched = true; };
      titleIn.oninput = () => { if (!touched) nameIn.value = translit(titleIn.value); };
      body.querySelector('#shpNew').onsubmit = async e => {
        e.preventDefault();
        const f = e.target;
        try {
          const list = await api('POST', '/api/owner/shop-users', { title: f.title.value, name: f.name.value });
          draw(list);
          const x = list.find(u => u.name === f.name.value.trim().toLowerCase());
          if (x) await invite(x);
        } catch (err) { document.getElementById('shpErr').textContent = err.message; }
      };
      body.querySelectorAll('[data-sact]').forEach(b => {
        b.onclick = async () => {
          const x = users.find(u => u.name === b.closest('[data-su]').dataset.su);
          if (!x) return;
          try {
            if (b.dataset.sact === 'copy') return invite(x);
            if (b.dataset.sact === 'reset') {
              if (!await modal({ title: 'Сбросить пароль?', text: `Учёт «${x.title}» закроется на всех телефонах. Товары и продажи останутся. Человек получит новую ссылку-приглашение.`, okText: 'Сбросить' })) return;
              const list = await api('POST', `/api/owner/shop-users/${encodeURIComponent(x.name)}/reset`);
              draw(list); return invite(list.find(u => u.name === x.name));
            }
            if (b.dataset.sact === 'del') {
              if (!await modal({ title: `Удалить учёт «${x.title}»?`, text: 'Все его товары, продажи и расходы удалятся навсегда. Вернуть их будет нельзя.', okText: 'Удалить навсегда', danger: true })) return;
              draw(await api('DELETE', `/api/owner/shop-users/${encodeURIComponent(x.name)}`)); toast('Учёт удалён');
            }
          } catch (err) { toast(err.message); }
        };
      });
    }
    bind();
  }
  const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', ң: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  const translit = s => String(s || '').toLowerCase().split('').map(ch => (ch in TR ? TR[ch] : ch)).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

  async function renderRealtors() {
    if (!isOwner()) { location.hash = '#list'; return; }
    const [list, product, mine, ai, mUsers, cos, sUsers, wa, zks, promoList] = await Promise.all([api('GET', '/api/owner/realtors'), api('GET', '/api/owner/product'), api('GET', '/api/admin/apartments'), api('GET', '/api/owner/aichat'), api('GET', '/api/owner/money-users'), api('GET', '/api/owner/companies'), api('GET', '/api/owner/shop-users'), api('GET', '/api/owner/wa').catch(() => null), api('GET', '/api/admin/complexes').catch(() => []), api('GET', '/api/owner/promos').catch(() => [])]);
    // Сколько квартир в рассрочку скопируется новому менеджеру (наличные не копируются)
    const myInstallment = mine.filter(a => a.computed.installment || (!cashLike(typeOf(a)) && a.computed.price)).length;
    const others = list.filter(x => x.role !== 'owner');
    MGRS = others;
    const paying = others.filter(x => x.status.active && !x.blocked).length;
    const inMonth = addMonths('', 1);
    const coName = id => (id === 'none' ? 'нет' : (cos.find(c => c.id === id) || { name: id }).name);
    const badge = x => `<span class="st st-${x.status.code}">${esc(x.status.label)}</span>`;

    app.innerHTML = `${nav('realtors')}<div class="wrap">
      <h1>Менеджеры</h1>
      <div class="kpis">
        <div class="kpi"><span>Менеджеров</span><b>${others.length}</b><small>с доступом сейчас: ${paying}</small></div>
        <div class="kpi"><span>Заявок за 30 дней</span><b>${fmt(others.reduce((s, x) => s + x.wa30, 0))}</b><small>у всех менеджеров</small></div>
      </div>

      <div class="card" id="creds" hidden></div>

      <details class="card" ${others.length ? '' : 'open'}><summary><b>+ Добавить менеджера</b></summary>
        <form id="nf" style="margin-top:12px">
          <label class="f"><span>Имя менеджера</span><input name="name" required placeholder="Айдана Асанова"></label>
          <div class="grid2">
            <label class="f"><span>Логин</span><input name="login" required autocapitalize="none" spellcheck="false" placeholder="aidana"></label>
            <label class="f"><span>Пароль</span><input name="password" placeholder="придумаем сами"></label>
          </div>
          <label class="f"><span>Адрес сайта</span><div class="slug-in"><span>${esc(location.host)}/</span><input name="slug" autocapitalize="none" spellcheck="false" placeholder="из имени, например aydana"></div></label>
          <label class="f"><span>WhatsApp менеджера</span><input name="whatsapp" type="tel" placeholder="+996 …"></label>
          <label class="f"><span>С кем работает</span><select name="companyId">${(cos || []).map(c => `<option value="${esc(c.id)}">Строительная компания «${esc(c.name)}»</option>`).join('')}<option value="none">Агентство, другой застройщик или другая страна</option></select>
            <div class="hint">От этого зависит ИИ-помощник на сайте: у менеджера компании он рассказывает о её домах и истории, у агентства — только о квартирах и условиях самого менеджера</div></label>
          <div class="grid2">
            <label class="f"><span>Оплачено до</span><input name="paidUntil" type="date" value="${inMonth}"></label>
            <label class="f"><span>Лимит квартир</span><input name="maxApartments" inputmode="numeric" value="${esc(product.includedApartments || 20)}"></label>
          </div>
          <label class="f"><span>Заметка (видите только вы)</span><input name="note" placeholder="Тариф, сумма, контакт…"></label>
          <div class="hint" style="margin:-4px 0 10px">Пустой адрес — возьмём имя латиницей. Пустой пароль — сгенерируем надёжный. Лимит 0 — без ограничения.</div>
          <label class="check"><input type="checkbox" name="partnerCta" checked> Показывать на сайте призыв «Хотите такой же сайт?» — внизу страницы, ведёт на kvartiry.asia</label>
          ${myInstallment ? `<label class="check"><input type="checkbox" name="copyApartments"> Скопировать мои квартиры в рассрочку (${flats(myInstallment)}) — менеджеру не придётся начинать с нуля</label>` : ''}
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
            <button class="btn" data-act="gift" title="Подарок за приведённого менеджера">+20 дней 🎁</button>
            <button class="btn" data-act="minus" title="Сократить срок на месяц">−1 мес</button>
            <button class="btn" data-act="date">Дата…</button>
            <button class="btn" data-act="limit">Лимит…</button>`}
            ${x.role === 'owner' || !myInstallment ? '' : '<button class="btn" data-act="copy">Копировать мои квартиры ему</button>'}
            ${x.role === 'owner' || !x.apartments ? '' : '<button class="btn" data-act="take">Копировать его квартиры мне</button>'}
            <button class="btn${x.partnerCta ? ' btn-on' : ''}" data-act="cta" title="Блок внизу сайта менеджера, ведёт на kvartiry.asia">«Хотите такой же сайт?»: ${x.partnerCta ? 'показан ✓' : 'скрыт'}</button>
            <button class="btn" data-act="company" title="Застройщик менеджера: его дома в блоке «Достижения компании» и его история у ИИ-помощника">Компания: ${esc(coName(x.companyId))}</button>
            <button class="btn${x.kutAccess ? ' btn-on' : ''}" data-act="kut" title="Доступ к блоку «Достижения компании» (дома его компании). Менеджер сам включает его у себя в профиле">Достижения компании: ${x.kutAccess ? 'доступ есть ✓' : 'нет доступа'}</button>
            <button class="btn${x.aiAccess ? ' btn-on' : ''}" data-act="ai" title="ИИ-помощник «Спросить» на сайте этого менеджера">ИИ-помощник: ${x.aiAccess ? 'включён ✓' : 'выключен'}</button>
            <button class="btn" data-act="stats">Аналитика</button>
            ${x.role === 'owner' ? '' : x.blocked
              ? '<button class="btn btn-danger-fill" data-act="block">Заблокирован · Разблокировать</button>'
              : '<button class="btn" data-act="block">Заблокировать</button>'}
            <button class="btn" data-act="pass">Новый пароль</button>
            <button class="btn" data-act="login">Логин…</button>
            <button class="btn" data-act="slug">Адрес…</button>
            ${x.role === 'owner' ? '' : '<button class="btn btn-danger" data-act="del">Удалить</button>'}
          </div>
        </div>`).join('')}</div>

      <details class="card"><summary><b>Тарифы и страница /partner</b> · цены, лимит квартир, ваш WhatsApp для продлений</summary>
        <form id="pfm" style="margin-top:12px">
          <div class="hint" style="margin-bottom:10px">Это страница по адресу <b>${esc(location.origin)}/partner</b> — её видят менеджеры, которых вы приглашаете.</div>
          <label class="f"><span>Название сервиса</span><input name="name" value="${esc(product.name)}"></label>
          <label class="f"><span>Описание</span><textarea name="tagline" rows="3">${esc(product.tagline)}</textarea></label>
          <label class="f"><span>Ваш WhatsApp для заявок от менеджеров</span><input name="whatsapp" type="tel" value="${esc(product.whatsapp)}"></label>
          <label class="f"><span>Telegram сервиса — если указан, на странице /partner кнопки ведут в Telegram, номер не показывается</span><input name="telegram" placeholder="@kvartiry_asia" autocapitalize="none" spellcheck="false" value="${esc(product.telegram || '')}"></label>
          <div class="grid2">
            <label class="f"><span>Цена за 1 месяц, сом</span><input name="priceMonth" inputmode="numeric" value="${esc(product.priceMonth)}"></label>
            <label class="f"><span>Цена за 3 месяца, сом</span><input name="price3" inputmode="numeric" value="${esc(product.price3)}"></label>
            <label class="f"><span>Цена за 6 месяцев, сом</span><input name="price6" inputmode="numeric" value="${esc(product.price6)}"></label>
          </div>
          <div class="grid2">
            <label class="f"><span>Квартир в тарифе</span><input name="includedApartments" inputmode="numeric" value="${esc(product.includedApartments)}"></label>
            <label class="f"><span>Доп. квартира, сом/мес</span><input name="extraPrice" inputmode="numeric" value="${esc(product.extraPrice)}"></label>
          </div>
          <div class="hint" style="margin:-6px 0 12px">Показываются на странице /partner и в кабинете менеджеров. «Квартир в тарифе» — лимит нового менеджера по умолчанию. Пустые цены — блок цен скрыт.</div>
          <label class="f"><span>Цена (текст, если цены выше пустые)</span><input name="priceText" value="${esc(product.priceText)}" placeholder="Например: 1 500 сом в месяц, первая неделя бесплатно"></label>
          <label class="f"><span>Что открывать по адресу ${esc(location.host)}/</span><select name="rootRealtorId">
            <option value="">Мой сайт (по умолчанию)</option>
            ${list.map(x => `<option value="${x.id}" ${product.rootRealtorId === x.id ? 'selected' : ''}>Сайт менеджера: ${esc(x.name)}</option>`).join('')}
          </select></label>
          <button class="btn btn-primary">Сохранить</button> <a class="btn" href="/partner" target="_blank">Открыть ↗</a>
        </form>
      </details>
      <details class="card" id="mnyCard"><summary><b>Учёт денег</b> · ${mUsers.length} ${mUsers.length === 1 ? 'учёт' : mUsers.length < 5 && mUsers.length > 1 ? 'учёта' : 'учётов'}</summary>
        <div id="mnyBody" style="margin-top:12px">${moneyUsersHtml(mUsers)}</div>
      </details>
      <details class="card" id="shpCard"><summary><b>Учёт товаров</b> · ${sUsers.length} ${sUsers.length === 1 ? 'учёт' : sUsers.length < 5 && sUsers.length > 1 ? 'учёта' : 'учётов'}</summary>
        <div id="shpBody" style="margin-top:12px">${shopUsersHtml(sUsers)}</div>
      </details>
      ${wa ? waCardHtml(wa) : ''}
      <details class="card" id="promoCard"><summary><b>Промокоды</b> · ${promoList.length} · для партнёров на странице /partner</summary><div id="promoBody" style="margin-top:12px">${promosHtml(promoList)}</div></details>

      <details class="card" id="aiCard"><summary><b>ИИ-помощник на сайтах</b> · ${ai.on && ai.providers.some(p => p.hasKey) ? `работает ✓ · у ${list.filter(x => x.aiAccess).length} из ${list.length}` : 'выключен'}</summary>
        <form id="aifm" style="margin-top:12px">
          <div class="hint" style="margin-bottom:10px">На сайтах выбранных менеджеров появляется золотая кнопка «Спросить». ИИ ведёт себя как опытный продавец и психолог: выясняет, что нужно человеку, отвечает про квартиры этого менеджера, снимает сомнения и ведёт в WhatsApp. Видит, что гость смотрел на сайте. ${ai.saveChats ? 'Разговоры хранятся 30 дней. Ниже — разговоры с вашего сайта: их можно прочитать и научить ИИ, где он ответил не так. Разговоры клиентов других менеджеров видят только сами менеджеры (в «Аналитике»).' : 'Разговоры не сохраняются.'}<br><b>Кому показывать</b> — кнопкой «ИИ-помощник» у каждого менеджера в списке выше (и у вас тоже). Сейчас включён у: ${list.filter(x => x.aiAccess).map(x => esc(x.name)).join(', ') || 'ни у кого'}.</div>
          <div class="kpis" style="margin-bottom:12px">
            <div class="kpi"><span>Разговоров</span><b>${ai.month.chats}</b><small>в этом месяце</small></div>
            <div class="kpi"><span>Ответов ИИ</span><b>${ai.month.msgs}</b><small>${ai.providers.filter(p => p.used).map(p => `${({ gemini: 'Gemini', groq: 'Groq', claude: 'Claude' })[p.id]}: ${p.used}`).join(' · ') || 'в этом месяце'}</small></div>
            <div class="kpi"><span>Потрачено</span><b>$${ai.month.cost.toFixed(2)}</b><small>Gemini и Groq — бесплатно</small></div>
          </div>
          <label class="f" style="display:flex;gap:10px;align-items:center"><input type="checkbox" name="on" ${ai.on ? 'checked' : ''} style="width:auto"> <span style="margin:0">Помощник работает</span></label>
          <label class="f" style="display:flex;gap:10px;align-items:center"><input type="checkbox" name="saveChats" ${ai.saveChats ? 'checked' : ''} style="width:auto"> <span style="margin:0">Сохранять разговоры 30 дней (чтобы видеть ошибки ИИ и учить его; клиент видит об этом строчку в чате)</span></label>

          ${ai.providers.map((p, i) => `<div style="border:1px solid var(--line,#e5e5ea);border-radius:14px;padding:12px 14px;margin:0 0 12px">
            <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;margin-bottom:8px"><b>${i + 1}. ${esc(p.name)}</b>
              <span class="hint" style="margin:0">${p.free ? 'бесплатно, с дневным лимитом' : 'платно, только если бесплатные не ответили'}${p.hasKey ? ` · ключ …${esc(p.keyEnd)}${p.resting ? ' · сейчас на перерыве (лимит)' : ' ✓'}` : ' · не подключён'}</span></div>
            <div class="grid2">
              <label class="f"><span>Ключ</span><input name="key_${p.id}" type="password" autocomplete="new-password" placeholder="${p.hasKey ? 'Оставьте пустым, чтобы не менять' : 'Вставьте ключ'}"></label>
              <label class="f"><span>Модель</span><input type="text" autocomplete="off" data-lpignore="true" name="model_${p.id}" value="${esc(p.model)}" placeholder="${esc(p.defaultModel)}" data-was="${esc(p.model)}"></label>
            </div>
            <div class="hint" style="margin:-6px 0 0">${{
              gemini: 'Где взять ключ: aistudio.google.com → войти через Google → «Get API key» → «Create API key». Бесплатно, карта не нужна. На бесплатном тарифе Google может использовать переписку для улучшения своих моделей.',
              groq: 'Где взять ключ: console.groq.com → войти → «API Keys» → «Create API Key». Бесплатно, карта не нужна. Запасной: отвечает, когда у Gemini кончился лимит.',
              claude: 'Не обязательно. console.anthropic.com → Billing (пополнить) → API Keys. Примерно $0.005–0.01 за разговор, тратится не больше бюджета ниже.',
            }[p.id]}${p.hasKey ? ` <a href="#" data-delkey="${p.id}">Удалить ключ</a>` : ''}</div>
          </div>`).join('')}

          <div class="grid2">
            <label class="f"><span>Бюджет Claude в месяц, $</span><input name="budget" inputmode="decimal" value="${ai.budget}"></label>
            <label class="f"><span>Сообщений в день с одного телефона</span><input name="ipLimit" inputmode="numeric" value="${ai.ipLimit}"></label>
            <label class="f"><span>Всего ответов в день</span><input name="dayLimit" inputmode="numeric" value="${ai.dayLimit}"></label>
          </div>
          <label class="f"><span>Знания ИИ (о застройщике, компании — ИИ расскажет, если клиент спросит)</span><textarea name="knowledge" rows="10">${esc(ai.knowledge)}</textarea></label>
          <div class="hint" style="margin:-6px 0 12px">Когда все лимиты исчерпаны, помощник предлагает клиенту написать в WhatsApp. <a href="#" id="aiKnowReset">Вернуть текст про «Кут» по умолчанию</a></div>
          <div class="err" id="aiErr"></div>
          <button class="btn btn-primary">Сохранить</button>
        </form>
        <div id="aiTeach" style="margin-top:22px;border-top:1px solid var(--line,#e5e5ea);padding-top:16px">
          <b>Уроки для ИИ</b> <span class="hint" style="margin:0">· ${ai.lessons.length} из 40</span>
          <div class="hint" style="margin:6px 0 10px">Урок — «на такой вопрос отвечай так». ИИ читает уроки перед каждым ответом. Проще всего учить из разговоров ниже: у ответа ИИ нажмите «Научить» и напишите, как надо было ответить.</div>
          ${ai.lessons.map(l => `<div style="border:1px solid var(--line,#e5e5ea);border-radius:12px;padding:10px 12px;margin:0 0 8px">
            <div class="hint" style="margin:0 0 4px">Клиент: «${esc(l.q)}»</div><div>→ ${esc(l.a)}</div>
            <a href="#" data-dellesson="${esc(l.id)}" class="hint" style="display:inline-block;margin-top:6px">Удалить урок</a></div>`).join('')}
          <form id="aiLessonFm" style="margin-top:10px">
            <label class="f"><span>Вопрос клиента</span><input name="q" maxlength="300" placeholder="Например: а можно без первоначального взноса?"></label>
            <label class="f"><span>Как правильно ответить</span><textarea name="a" rows="3" maxlength="600" placeholder="Например: совсем без взноса нет, самый низкий взнос — 500 000 сом. Менеджер подберёт вариант в WhatsApp."></textarea></label>
            <div class="err" id="aiLessonErr"></div>
            <button class="btn">Добавить урок</button>
          </form>
          <div style="margin-top:22px"><b>Разговоры клиентов</b> <span class="hint" style="margin:0">· ${ai.chats}</span></div>
          ${ai.saveChats ? `<div style="margin-top:8px"><button type="button" class="btn" id="aiChatsBtn">Показать разговоры</button>${ai.chats ? ' <a href="#" id="aiChatsDel" class="hint">Удалить все</a>' : ''}</div><div id="aiChats" style="margin-top:10px"></div>` : '<div class="hint">Сохранение разговоров выключено.</div>'}
        </div>
      </details>
    </div>`;
    bindNav();

    document.getElementById('nf').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      d.copyApartments = !!e.target.copyApartments && e.target.copyApartments.checked;
      d.partnerCta = !!e.target.partnerCta && e.target.partnerCta.checked;
      try {
        const res = await api('POST', '/api/owner/realtors', d);
        await renderRealtors();
        showCredentials(res.realtor, res.realtor.login, res.password, `Кабинет для «${res.realtor.name}» создан${res.copied ? ` · скопировано ${flats(res.copied)}` : ''}`);
      } catch (err) { showErr('nfErr', err.message); }
    };

    const aiForm = document.getElementById('aifm');
    const aiSave = async (d, ok) => {
      const btn = aiForm.querySelector('.btn-primary');
      btn.disabled = true; btn.textContent = 'Проверяю…';
      try {
        await api('PUT', '/api/owner/aichat', d); toast(ok);
        await renderRealtors(); document.getElementById('aiCard').open = true;
      } catch (err) { showErr('aiErr', err.message); btn.disabled = false; btn.textContent = 'Сохранить'; }
    };
    aiForm.onsubmit = e => {
      e.preventDefault();
      const f = aiForm;
      const d = { on: f.on.checked, saveChats: f.saveChats.checked, budget: f.budget.value, ipLimit: f.ipLimit.value, dayLimit: f.dayLimit.value, knowledge: f.knowledge.value, providers: {} };
      for (const p of ai.providers) {
        const x = {};
        const k = f['key_' + p.id].value.trim(); if (k) x.key = k;
        const m = f['model_' + p.id]; if (m.value.trim() !== m.dataset.was) x.model = m.value.trim();
        if (Object.keys(x).length) d.providers[p.id] = x;
      }
      aiSave(d, d.on ? 'ИИ-помощник сохранён' : 'Сохранено, помощник выключен');
    };
    aiForm.onclick = async e => {
      const del = e.target.closest('[data-delkey]');
      if (del) {
        e.preventDefault();
        if (!(await confirmBox('Удалить этот ключ?', 'Этот ИИ перестанет отвечать на сайтах. Остальные подключённые продолжат работать.', 'Удалить', true))) return;
        aiSave({ providers: { [del.dataset.delkey]: { key: null } } }, 'Ключ удалён');
      }
      if (e.target.id === 'aiKnowReset') {
        e.preventDefault();
        if (!(await confirmBox('Вернуть текст по умолчанию?', 'Ваши изменения в «Знаниях ИИ» заменятся историей компании «Кут».', 'Вернуть'))) return;
        aiSave({ knowledgeReset: true }, 'Текст про «Кут» возвращён');
      }
    };

    // Уроки и журнал разговоров
    bindMoneyUsers(mUsers);
    bindShopUsers(sUsers);
    if (wa) bindWaCard();
    bindPromos();
    const reopenAi = async () => { await renderRealtors(); document.getElementById('aiCard').open = true; document.getElementById('aiTeach').scrollIntoView({ block: 'start' }); };
    const addLesson = async (q, a, errId) => {
      try { await api('POST', '/api/owner/aichat/lessons', { q, a }); toast('Урок добавлен — ИИ учтёт его со следующего ответа'); await reopenAi(); }
      catch (err) { showErr(errId, err.message); }
    };
    document.getElementById('aiLessonFm').onsubmit = e => { e.preventDefault(); addLesson(e.target.q.value, e.target.a.value, 'aiLessonErr'); };
    const fmtWhen = t => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const showChats = async () => {
      const box = document.getElementById('aiChats');
      box.innerHTML = '<div class="hint">Загружаю…</div>';
      const chats = await api('GET', '/api/owner/aichat/chats');
      box.innerHTML = chats.length ? chats.map(c => {
        const first = (c.msgs.find(m => m.r === 'u') || {}).t || '';
        return `<details style="border:1px solid var(--line,#e5e5ea);border-radius:12px;padding:10px 12px;margin:0 0 8px">
          <summary><b>${esc(c.name)}</b> <span class="hint" style="margin:0">· ${fmtWhen(c.at)} · ${c.msgs.filter(m => m.r === 'u').length} вопр.${c.wants ? ` · ищет: ${esc(c.wants)}` : ''}</span><div style="margin-top:4px">«${esc(first.slice(0, 120))}»</div></summary>
          <div style="margin-top:10px">${c.msgs.map((m, i) => m.r === 'u'
            ? `<div style="margin:8px 0 4px"><b>Клиент:</b> ${esc(m.t)}</div>`
            : `<div style="margin:0 0 8px;padding:8px 10px;border-radius:10px;background:var(--soft,#f5f5f7)"><b>${m.p === 'шаблон' ? 'Сайт (без ИИ — лимиты кончились)' : 'ИИ'}:</b> ${esc(m.t).replace(/\n/g, '<br>')}${m.c && m.c.length ? `<div class="hint" style="margin:4px 0 0">+ показал квартир: ${m.c.length}</div>` : ''}
                <a href="#" class="hint" data-teach="${esc(m.id || '')}" data-q="${esc((c.msgs[i - 1] || {}).t || '')}" style="display:inline-block;margin-top:6px">Научить: ответил не так</a></div>`).join('')}</div>
        </details>`;
      }).join('') : '<div class="hint">Пока разговоров нет.</div>';
    };
    document.getElementById('aiTeach').onclick = async e => {
      const t = e.target;
      if (t.id === 'aiChatsBtn') { showChats().catch(err => toast(err.message)); return; }
      if (t.id === 'aiChatsDel') {
        e.preventDefault();
        if (!(await confirmBox('Удалить все разговоры?', 'Журнал очистится. Уроки останутся.', 'Удалить', true))) return;
        await api('DELETE', '/api/owner/aichat/chats'); toast('Разговоры удалены'); await reopenAi(); return;
      }
      const del = t.closest('[data-dellesson]');
      if (del) {
        e.preventDefault();
        await api('DELETE', `/api/owner/aichat/lessons/${encodeURIComponent(del.dataset.dellesson)}`); toast('Урок удалён'); await reopenAi(); return;
      }
      const teach = t.closest('[data-teach]');
      if (teach) {
        e.preventDefault();
        if (teach.nextElementSibling && teach.nextElementSibling.classList.contains('ai-teach-fm')) { teach.nextElementSibling.remove(); return; }
        const fm = document.createElement('form');
        fm.className = 'ai-teach-fm'; fm.style.marginTop = '8px';
        const eid = 'teachErr' + Math.random().toString(36).slice(2, 7);
        fm.innerHTML = `<label class="f"><span>Вопрос клиента</span><input name="q" maxlength="300"></label>
          <label class="f"><span>Как правильно ответить</span><textarea name="a" rows="3" maxlength="600" placeholder="Напишите, что ИИ должен был сказать"></textarea></label>
          <div class="err" id="${eid}"></div><button class="btn btn-primary">Запомнить урок</button>`;
        fm.q.value = teach.dataset.q;
        fm.onsubmit = ev => { ev.preventDefault(); addLesson(fm.q.value, fm.a.value, eid); };
        teach.after(fm); fm.a.focus();
      }
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
          case 'cta': await put({ partnerCta: !x.partnerCta }); toast(x.partnerCta ? 'Призыв скрыт с сайта' : 'Призыв показан на сайте'); break;
          case 'ai': await put({ aiAccess: !x.aiAccess }); toast(x.aiAccess ? 'ИИ-помощник выключен на сайте' : 'ИИ-помощник включён на сайте'); break;
          case 'kut': await put({ kutAccess: !x.kutAccess }); toast(x.kutAccess ? 'Доступ к «Достижениям компании» закрыт — блок скрыт с сайта' : 'Доступ дан — менеджер включит блок у себя в профиле'); break;
          case 'company': {
            const k = await actionSheet(`Компания «${x.name}»`, [...cos.map(c => ({ key: c.id, label: `«${c.name}»${c.id === x.companyId ? ' ✓' : ''}` })), { key: 'none', label: `Без компании${x.companyId === 'none' ? ' ✓' : ''}` }]);
            if (!k || k === x.companyId) return;
            await put({ companyId: k }); toast(k === 'none' ? 'Компания убрана: блока нет, ИИ не рассказывает о застройщике' : `Компания: «${coName(k)}» — её дома и история у этого менеджера`); break;
          }
          case 'm3': await put({ paidUntil: addMonths(x.plan.paidUntil, 3) }); toast('Продлено на 3 месяца'); break;
          case 'gift': {
            const v = addDays(x.plan.paidUntil, 20);
            if (!(await confirmBox(`Подарить «${x.name}» 20 дней?`, `Подарок за приведённого менеджера. Оплачено будет до ${fmtDate(v)}.`, 'Подарить'))) return;
            await put({ paidUntil: v }); toast(`Подарено 20 дней: до ${fmtDate(v)}`); break;
          }
          case 'minus': {
            if (!x.plan.paidUntil) { toast('Срок не ограничен — задайте дату кнопкой «Дата…»'); return; }
            const d = new Date(`${x.plan.paidUntil}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1);
            const v = d.toISOString().slice(0, 10);
            if (!(await confirmBox(`Сократить срок «${x.name}» на месяц?`, `Было: до ${fmtDate(x.plan.paidUntil)}. Станет: до ${fmtDate(v)}.${v < new Date().toISOString().slice(0, 10) ? ' Эта дата уже прошла — сайт менеджера сразу отключится.' : ''} Точную дату можно задать кнопкой «Дата…».`, 'Сократить', true))) return;
            await put({ paidUntil: v }); toast(`Срок сокращён: до ${fmtDate(v)}`); break;
          }
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
              text: `Сейчас у менеджера ${x.apartments} квартир. 0 — без ограничения. Если поставить меньше, чем есть, квартиры не удалятся — просто нельзя будет добавлять новые.`,
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
          case 'copy': {
            const room = x.plan.maxApartments ? Math.max(0, x.plan.maxApartments - x.apartments) : null;
            const asked = modal({ title: `Копировать ваши квартиры менеджеру «${x.name}»?`,
              text: `У вас все квартиры останутся. У менеджера появятся их копии (только рассрочка, наличные не копируются). Квартиры, которые у него уже есть, не повторятся.${room !== null ? ` Свободно мест по лимиту: ${room}.` : ''} Свои копии менеджер сможет менять и удалять — ваши квартиры от этого не изменятся.`,
              html: citySelect(), okText: 'Скопировать' });
            const city = document.getElementById('mCity');
            if (!(await asked)) return;
            const r = await api('POST', `/api/owner/realtors/${x.id}/copy-apartments`, { city: city.value });
            toast(r.copied
              ? `Скопировано: ${flats(r.copied)}${r.notFit ? `, не поместилось по лимиту: ${r.notFit}` : ''}`
              : r.notFit ? 'Лимит менеджера заполнен — расширьте лимит' : 'Все эти квартиры у менеджера уже есть');
            break;
          }
          case 'take': {
            const asked = modal({ title: `Копировать квартиры «${x.name}» вам?`,
              text: 'У менеджера все квартиры останутся — ничего не удаляется. В вашем кабинете появятся их копии (только те, что сейчас на сайте). Квартиры, которые у вас уже есть, не повторятся.',
              html: citySelect(), okText: 'Копировать' });
            const city = document.getElementById('mCity');
            if (!(await asked)) return;
            const r = await api('POST', `/api/owner/realtors/${x.id}/take-apartments`, { city: city.value });
            toast(r.copied ? `Добавлено вам: ${flats(r.copied)}${r.same ? `, уже были: ${r.same}` : ''}` : 'Все эти квартиры у вас уже есть');
            break;
          }
          case 'stats': anRealtor = x.role === 'owner' ? '' : x.id; location.hash = '#analytics'; return;
          case 'block':
            if (!x.blocked && !(await confirmBox(`Заблокировать «${x.name}»?`, 'Его сайт для клиентов сразу отключится, а в кабинете он увидит, что доступ закрыт. Разблокировать можно в любой момент.', 'Заблокировать', true))) return;
            await put({ blocked: !x.blocked }); break;
          case 'pass': {
            if (!(await confirmBox(`Новый пароль для «${x.name}»?`, 'Старый пароль перестанет работать, и менеджер выйдет из кабинета на всех устройствах. Новый пароль покажем один раз.', 'Выдать пароль'))) return;
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
    // В форме квартиры на телефоне нижнее меню прячем — внизу остаётся одна панель «Назад / Сохранить»
    document.body.classList.toggle('editing', h.startsWith('edit/'));
    try {
      if (h.startsWith('edit/')) await renderEdit(h.slice(5));
      else if (h === 'zk-new') await renderZkNew();
      else if (h.startsWith('zk/')) await renderZk(decodeURIComponent(h.slice(3)));
      else if (h === 'settings') await renderSettings();
      else if (h === 'analytics' || h === 'stats') await renderAnalytics();
      else if (h === 'realtors') await renderRealtors();
      else await renderList();
    } catch (e) { if (e.message !== 'auth') toast(e.message); }
  }

  // ---------- Вход на чужом устройстве: выход после часа без действий ----------
  // Пока страница кабинета открыта, она каждую минуту «отмечается» на сервере — без этого сервер через 5 минут закроет вход
  // (так кабинет закрывается, когда закрыли вкладку или браузер). Если же час никто ничего не нажимал — выходим сами
  // и показываем вход, чтобы на оставленном ноутбуке не было видно кабинета.
  let idleTimer = null, lastAct = Date.now(), lastPing = Date.now(), idleMin = 60;
  const ACT_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
  const onAct = () => { lastAct = Date.now(); };
  async function idleCheck() {
    if (Date.now() - lastAct >= idleMin * 60000) {
      stopIdle();
      try { await api('POST', '/api/admin/logout'); } catch (e) { /* уже вышли */ }
      loginNote = 'Вы долго не пользовались кабинетом, поэтому мы вышли из него. Войдите снова.';
      document.querySelectorAll('.modal').forEach(m => m.remove());
      renderLogin();
    } else if (Date.now() - lastPing >= 55000) {
      lastPing = Date.now();
      api('GET', '/api/admin/me').catch(() => {}); // если сервер уже закрыл вход — api() сам покажет вход
    }
  }
  const onVisible = () => { if (document.visibilityState === 'visible') idleCheck(); };
  function stopIdle() {
    clearInterval(idleTimer); idleTimer = null;
    ACT_EVENTS.forEach(ev => window.removeEventListener(ev, onAct, true));
    document.removeEventListener('visibilitychange', onVisible);
  }
  function startIdle(min) {
    stopIdle();
    idleMin = min;
    lastAct = lastPing = Date.now();
    ACT_EVENTS.forEach(ev => window.addEventListener(ev, onAct, { capture: true, passive: true }));
    document.addEventListener('visibilitychange', onVisible);
    idleTimer = setInterval(idleCheck, 30000);
  }

  async function start() {
    try {
      me = await api('GET', '/api/admin/me');
      if (me.short) startIdle(me.idleMin || 60); else stopIdle();
      // Пришли по ссылке «/имя/admin» другого менеджера — показываем вход, а не текущий кабинет
      const want = new URLSearchParams(location.search).get('u');
      if (want && want !== me.login) { renderLogin(); return; }
      if (want) history.replaceState(null, '', '/admin/' + location.hash);
      settings = await api('GET', '/api/admin/settings');
      window.onhashchange = route;
      route();
    } catch (e) { /* показан вход */ }
  }
  start();
})();
