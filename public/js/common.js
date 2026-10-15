// Общие функции для всех публичных страниц
(function () {
  const D = window.__DATA__ || {};
  const S = D.settings || {};
  const nf = new Intl.NumberFormat('ru-RU');

  // ---------- Посетитель, источник, устройство (для аналитики кабинета) ----------
  const store = (kind, key, make) => {
    try { let v = window[kind].getItem(key); if (!v) { v = make(); window[kind].setItem(key, v); } return v; } catch (e) { return make(); }
  };
  // Анонимный id посетителя — чтобы считать людей, а не просмотры. Никаких личных данных.
  const visitor = store('localStorage', 'rv', () => Math.random().toString(36).slice(2, 12).padEnd(10, '0'));
  // Источник визита: метка ?src= / utm_source в ссылке, иначе — откуда пришли (или приложение, в котором открыли)
  function detectSource() {
    const q = new URLSearchParams(location.search);
    const tag = (q.get('src') || q.get('utm_source') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30);
    if (tag) return tag;
    const ua = navigator.userAgent;
    if (/Instagram/i.test(ua)) return 'instagram';
    if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook';
    if (/musical_ly|TikTok|BytedanceWebview/i.test(ua)) return 'tiktok';
    if (/Telegram/i.test(ua)) return 'telegram';
    let host = '';
    try { host = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) {}
    if (!host || host === location.hostname) return 'direct';
    const map = [[/instagram/, 'instagram'], [/whatsapp|^wa\.me$/, 'whatsapp'], [/^t\.me$|telegram/, 'telegram'], [/facebook|^fb\./, 'facebook'],
      [/tiktok/, 'tiktok'], [/google\./, 'google'], [/yandex|^ya\.ru$/, 'yandex'], [/youtube|^youtu\.be$/, 'youtube']];
    for (const [re, name] of map) if (re.test(host)) return name;
    return 'other';
  }
  // Источник запоминаем на всю сессию: при переходах по сайту referrer уже свой.
  // Метка в ссылке (?src=) важнее запомненного — клиент мог прийти по новой ссылке.
  const urlTag = /[?&](src|utm_source)=/.test(location.search);
  const source = urlTag ? detectSource() : store('sessionStorage', 'rs', detectSource);
  if (urlTag) { try { sessionStorage.setItem('rs', source); } catch (e) {} }
  const device = window.matchMedia('(min-width: 1024px)').matches ? 'd' : 'm';


  const RS = {
    S,
    money: (n, cur) => (n == null ? '—' : `${nf.format(Math.round(n))} ${cur || ''}`.trim()),
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    wa: text => `https://wa.me/${String(S.whatsapp || '').replace(/\D/g, '')}?text=${encodeURIComponent(text)}`,
    // Событие аналитики кабинета: view | filter | calc | cash | wa
    event(e, extra = {}) {
      if (!D.slug) return;
      const body = JSON.stringify({ slug: D.slug, e, p: D.page, v: visitor, s: source, d: device, ...extra });
      try {
        if (!navigator.sendBeacon || !navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }))) {
          fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
        }
      } catch (err) {}
    },
    // Нажатие WhatsApp — главная цель: в аналитику кабинета и во внешние счётчики, если подключены
    track(place, id) {
      RS.event('wa', { pl: place, a: id || null });
      try { window.gtag && gtag('event', 'whatsapp_click', { place, apartment_id: id || '' }); } catch (e) {}
      try { window.ym && window.YM_ID && ym(window.YM_ID, 'reachGoal', 'whatsapp_click', { place }); } catch (e) {}
      try { window.fbq && fbq('track', 'Contact'); } catch (e) {}
    },
    // Отправить событие один раз за страницу (например, «пользовался фильтром»)
    once(e, extra) {
      const k = e + (extra && extra.a ? ':' + extra.a : '');
      if (sent.has(k)) return;
      sent.add(k);
      RS.event(e, extra);
    },
  };
  window.RS = RS;
  const sent = new Set();

  document.addEventListener('click', e => {
    const a = e.target.closest('[data-wa]');
    if (a) RS.track(a.dataset.wa, a.dataset.id || null);
  });

  // Просмотр страницы
  RS.event('view', { a: D.apartment ? D.apartment.id : null });

  // ---------- Чистый адрес ----------
  // В адресной строке всегда только «сайт/имя» или «сайт/имя/kvartira/…»: без «#раздел»,
  // меток источника (?src=) и служебных параметров (?down=). Метки уже прочитаны выше, параметры — в RS.params.
  RS.params = new URLSearchParams(location.search);
  const clean = new URL(location.href);
  clean.hash = '';
  if (clean.pathname.length > 1) clean.pathname = clean.pathname.replace(/\/+$/, '');
  ['src', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'down'].forEach(k => clean.searchParams.delete(k));
  let goto = location.hash.slice(1);
  try { goto = sessionStorage.getItem('goto') || goto; sessionStorage.removeItem('goto'); } catch (e) {}
  if (clean.href !== location.href) history.replaceState(null, '', clean.pathname + clean.search);

  const scrollToId = id => {
    const el = document.getElementById(id);
    if (!el) return false;
    const before = window.scrollY;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Некоторые встроенные браузеры не умеют плавную прокрутку — тогда переходим сразу
    setTimeout(() => {
      if (Math.abs(window.scrollY - before) < 2 && Math.abs(el.getBoundingClientRect().top) > 120) el.scrollIntoView({ behavior: 'instant', block: 'start' });
    }, 350);
    return true;
  };
  // Переход к разделу: на этой же странице — плавная прокрутка; с другой страницы — переход и прокрутка после загрузки
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href*="#"]');
    if (!a || a.target === '_blank') return;
    const url = new URL(a.getAttribute('href'), location.href);
    if (url.origin !== location.origin || !url.hash) return;
    const id = url.hash.slice(1);
    e.preventDefault();
    const here = p => p.replace(/\/+$/, '');
    if (here(url.pathname) === here(location.pathname)) scrollToId(id);
    else { try { sessionStorage.setItem('goto', id); } catch (err) {} location.href = here(url.pathname) || '/'; }
  });
  if (goto) window.addEventListener('load', () => setTimeout(() => scrollToId(goto), 60), { once: true });

  // ---------- Анимации ----------
  // Заставка с логотипом (только на главной, один раз за сессию) → затем html.ready запускает анимацию первого экрана.
  // Блоки с [data-reveal] проявляются при прокрутке; .section прорисовывает верхнюю линию.
  const root = document.documentElement;
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pre = document.getElementById('preloader');
  const ready = () => root.classList.add('ready');
  if (pre && !root.classList.contains('no-pl') && !calm) {
    const minTime = new Promise(r => setTimeout(r, 1500));
    const loaded = new Promise(r => (document.readyState === 'complete' ? r() : window.addEventListener('load', r, { once: true })));
    const maxTime = new Promise(r => setTimeout(r, 3500)); // не держим заставку дольше 3,5 с на медленном интернете
    Promise.race([Promise.all([minTime, loaded]), maxTime]).then(() => {
      root.classList.add('pl-done');
      try { sessionStorage.setItem('pl', '1'); } catch (e) {}
      setTimeout(ready, 350);
      setTimeout(() => pre.remove(), 1200);
    });
  } else {
    if (pre) pre.remove();
    requestAnimationFrame(ready);
  }

  const REVEAL = '.section h2, .kicker, .lead, .about-text, .office, .stat, .filter, .results-head, .steps li, .docs, .review, .faq details, .cta, .gallery-wrap, .apt-info > *, .specs, .map, .similar, .gone > *';
  const io = 'IntersectionObserver' in window && !calm
    ? new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
    : null;
  RS.reveal = (scope = document, sel = REVEAL) => {
    const els = [...scope.querySelectorAll(sel)].filter(el => !el.hasAttribute('data-reveal'));
    els.forEach(el => {
      if (!io) { el.classList.add('in'); return; }
      // Соседние элементы появляются по очереди
      const sibs = [...el.parentElement.children].filter(c => c.hasAttribute('data-reveal') || els.includes(c));
      el.style.setProperty('--d', `${Math.min(sibs.indexOf(el), 6) * 90}ms`);
      el.setAttribute('data-reveal', '');
      io.observe(el);
    });
  };
  document.querySelectorAll('.section').forEach(s => (io ? io.observe(s) : s.classList.add('in')));
  RS.reveal();

  // Нижнее меню: на главной подсвечиваем раздел, который сейчас на экране
  const tabs = [...document.querySelectorAll('.tabbar [data-tab]')];
  const targets = { catalog: document.getElementById('catalog'), reviews: document.getElementById('reviews-sec') };
  if (targets.catalog) {
    const setActive = () => {
      const y = window.scrollY + window.innerHeight * 0.35;
      let key = 'home';
      for (const k of ['catalog', 'reviews']) {
        const el = targets[k];
        if (el && el.offsetTop <= y && el.offsetTop + el.offsetHeight > y) key = k;
      }
      tabs.forEach(t => t.classList.toggle('on', t.dataset.tab === key));
    };
    window.addEventListener('scroll', setActive, { passive: true });
    setActive();
  }

  // Галерея на странице квартиры
  const g = document.getElementById('gallery');
  const cnt = document.getElementById('gcount');
  if (g && cnt) {
    const n = g.children.length;
    g.addEventListener('scroll', () => {
      const i = Math.round(g.scrollLeft / g.clientWidth);
      cnt.textContent = `${Math.min(n, i + 1)} / ${n}`;
    }, { passive: true });
  }
})();
