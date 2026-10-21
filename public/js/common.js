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
    const minTime = new Promise(r => setTimeout(r, 600)); // заставка короткая: клиент из Instagram не должен ждать
    const loaded = new Promise(r => (document.readyState === 'complete' ? r() : window.addEventListener('load', r, { once: true })));
    const maxTime = new Promise(r => setTimeout(r, 1800)); // не держим заставку дольше 1,8 с на медленном интернете
    Promise.race([Promise.all([minTime, loaded]), maxTime]).then(() => {
      root.classList.add('pl-done');
      try { sessionStorage.setItem('pl', '1'); } catch (e) {}
      setTimeout(ready, 150);
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

  // ---------- Подсказка «рука с пальцем» на ползунке ----------
  // Ползунок с атрибутом data-hint: пока он на экране, каждые 3 секунды рука «берёт» бегунок
  // и проводит его в сторону и обратно. Ушёл с экрана — рука прячется, вернулся — снова показывается.
  // Клиент тронул ползунок — рука пропадает до конца визита. Подпись видна только первые 6 секунд.
  const HAND = '<svg viewBox="0 0 72 80" aria-hidden="true"><path d="M24 44V10a6 6 0 0 1 12 0v22a5 5 0 0 1 10 0v2a5 5 0 0 1 10 0v3a5 5 0 0 1 10 0v21c0 11-8 18-19 18h-6c-7 0-12-3-16-9L5 54a5.5 5.5 0 0 1 8.5-7L24 56Z" fill="#fff" stroke="#252f23" stroke-width="2.6" stroke-linejoin="round"/><path d="M36 33v11M46 34v10M56 37v8" stroke="#252f23" stroke-width="2" stroke-linecap="round" opacity=".35"/></svg>';
  function handHint(input) {
    const key = 'hint:' + location.pathname;
    const done = () => { try { return !!sessionStorage.getItem(key); } catch (e) { return false; } };
    if (done()) return;
    const host = input.parentElement;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    let hand = null, tip = null, tipShown = false, io2 = null, delay = null;
    const hide = () => {
      [hand, tip].forEach(el => { if (el) { el.classList.add('out'); setTimeout(() => el.remove(), 400); } });
      hand = tip = null;
    };
    const show = () => {
      if (hand || done() || !input.offsetWidth) return;
      const thumb = 26;
      const p = (input.value - input.min) / ((input.max - input.min) || 1);
      const x = input.offsetLeft + thumb / 2 + p * (input.offsetWidth - thumb);
      const y = input.offsetTop + input.offsetHeight / 2;
      const dx = Math.round(input.offsetWidth * 0.35) * (p > 0.5 ? -1 : 1); // тянем в сторону, где есть место
      hand = document.createElement('div');
      hand.className = 'hand-hint';
      hand.style.left = `${x}px`;
      hand.style.top = `${y}px`;
      hand.style.setProperty('--dx', `${dx}px`);
      hand.innerHTML = `<span class="hand-dot"></span>${HAND}`;
      host.appendChild(hand);
      // Подпись стоит на месте по центру под ползунком; показываем один раз
      if (input.dataset.hint && !tipShown) {
        tipShown = true;
        tip = document.createElement('div');
        tip.className = 'hand-tip';
        tip.style.top = `${y + 62}px`;
        tip.textContent = input.dataset.hint;
        host.appendChild(tip);
        const t = tip;
        setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); if (tip === t) tip = null; }, 6000);
      }
    };
    const stop = () => {
      try { sessionStorage.setItem(key, '1'); } catch (e) {}
      clearTimeout(delay);
      hide();
      if (io2) io2.disconnect();
    };
    ['pointerdown', 'touchstart', 'input', 'keydown'].forEach(t => input.addEventListener(t, stop, { passive: true }));
    if (!('IntersectionObserver' in window) || calm) return;
    io2 = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) delay = setTimeout(show, 700);
      else { clearTimeout(delay); hide(); }
    }, { threshold: 1, rootMargin: '0px 0px -15% 0px' });
    io2.observe(input);
  }
  // Ползунки могут появиться после отрисовки фильтра — ждём загрузки страницы
  window.addEventListener('load', () => document.querySelectorAll('input[type=range][data-hint]').forEach(handHint), { once: true });

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

  // ---------- Фото: автолистание каждые 2 секунды и просмотр на весь экран ----------
  const SLIDE_MS = 2000;
  const lbOpen = () => document.documentElement.classList.contains('lb-on');

  // Карточки квартир: листаем только те, что видны на экране и не под курсором
  const shown = new Set();
  const slideIo = 'IntersectionObserver' in window
    ? new IntersectionObserver(es => es.forEach(e => (e.isIntersecting ? shown.add(e.target) : shown.delete(e.target))), { threshold: 0.4 })
    : null;
  function showSlide(el, i) {
    const imgs = el.querySelectorAll('.cp-track img');
    el.dataset.i = i;
    el.querySelector('.cp-track').style.transform = `translateX(-${i * 100}%)`;
    el.querySelectorAll('.cp-dots i').forEach((d, k) => d.classList.toggle('on', k === i));
    // Следующее фото подгружаем заранее, чтобы при перелистывании не было пустого кадра
    const next = imgs[(i + 1) % imgs.length];
    if (next) next.loading = 'eager';
  }
  RS.slides = function (list) {
    list.forEach(el => {
      if (el.querySelectorAll('.cp-track img').length < 2) return;
      el.dataset.i = 0;
      el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') el.dataset.hover = 1; });
      el.addEventListener('pointerleave', () => { delete el.dataset.hover; });
      if (slideIo) slideIo.observe(el); else shown.add(el);
    });
  };
  if (!calm) setInterval(() => {
    if (document.hidden || lbOpen()) return;
    shown.forEach(el => {
      if (!el.isConnected) { shown.delete(el); return; }
      if (el.dataset.hover) return;
      const n = el.querySelectorAll('.cp-track img').length;
      showSlide(el, (+el.dataset.i + 1) % n);
    });
  }, SLIDE_MS);

  // Просмотр фото на весь экран — родное окно <dialog>: фокус остаётся внутри, Esc закрывает,
  // после закрытия фокус возвращается туда, откуда открыли. Открытие и закрытие — плавные (рецепт transitions.dev «Modal»).
  const LB_CLOSE_MS = 150;
  let lb;
  function lbGo(d) {
    const strip = lb.querySelector('.lb-strip');
    const n = strip.children.length;
    const i = (Math.round(strip.scrollLeft / strip.clientWidth) + d + n) % n;
    strip.scrollTo({ left: i * strip.clientWidth, behavior: calm ? 'auto' : 'smooth' });
  }
  function lbCount() {
    const strip = lb.querySelector('.lb-strip');
    const n = strip.children.length;
    lb.querySelector('.lb-count').textContent = `${Math.min(n, Math.round(strip.scrollLeft / strip.clientWidth) + 1)} из ${n}`;
  }
  RS.lightbox = function (srcs, start = 0, opts = {}) {
    if (!srcs.length) return;
    if (!lb) {
      lb = document.createElement('dialog');
      lb.className = 'lb';
      lb.setAttribute('aria-label', 'Фото квартиры');
      lb.innerHTML = `<div class="lb-strip"></div>
        <button class="lb-btn lb-close" type="button" aria-label="Закрыть">✕</button>
        <button class="lb-btn lb-prev" type="button" aria-label="Предыдущее фото">‹</button>
        <button class="lb-btn lb-next" type="button" aria-label="Следующее фото">›</button>
        <div class="lb-bar"><span class="lb-count" aria-live="polite"></span><a class="btn btn-primary lb-more" hidden></a></div>`;
      document.body.appendChild(lb);
      const strip = lb.querySelector('.lb-strip');
      strip.addEventListener('scroll', lbCount, { passive: true });
      lb.querySelector('.lb-prev').addEventListener('click', () => lbGo(-1));
      lb.querySelector('.lb-next').addEventListener('click', () => lbGo(1));
      lb.querySelector('.lb-close').addEventListener('click', () => RS.lightboxClose());
      // Нажатие мимо фото закрывает просмотр
      strip.addEventListener('click', e => { if (e.target.tagName !== 'IMG') RS.lightboxClose(); });
      // Esc: закрываем сами, чтобы успела сыграть анимация закрытия
      lb.addEventListener('cancel', e => { e.preventDefault(); RS.lightboxClose(); });
      lb.addEventListener('keydown', e => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); lbGo(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); lbGo(1); }
      });
    }
    const strip = lb.querySelector('.lb-strip');
    strip.innerHTML = srcs.map((s, i) => `<div class="lb-slide"><img src="${RS.esc(s)}" alt="Фото ${i + 1} из ${srcs.length}" ${Math.abs(i - start) > 1 ? 'loading="lazy"' : ''}></div>`).join('');
    lb.classList.toggle('lb-one', srcs.length < 2);
    const more = lb.querySelector('.lb-more');
    more.hidden = !opts.href;
    if (opts.href) { more.href = opts.href; more.textContent = opts.label || 'Подробнее'; }
    lb.classList.remove('is-closing');
    document.documentElement.classList.add('lb-on');
    if (!lb.open) lb.showModal();
    strip.scrollLeft = start * strip.clientWidth;
    lbCount();
    requestAnimationFrame(() => lb.classList.add('is-open'));
  };
  RS.lightboxClose = function () {
    if (!lb || !lb.open) return;
    lb.classList.remove('is-open');
    lb.classList.add('is-closing');
    setTimeout(() => {
      lb.classList.remove('is-closing');
      lb.close();
      document.documentElement.classList.remove('lb-on');
    }, calm ? 0 : LB_CLOSE_MS);
  };

  // Галерея на странице квартиры: листается сама, по нажатию — на весь экран
  const g = document.getElementById('gallery');
  const cnt = document.getElementById('gcount');
  if (g && g.querySelector('img')) {
    const imgs = [...g.querySelectorAll('img')];
    const n = imgs.length;
    const at = () => Math.min(n - 1, Math.round(g.scrollLeft / g.clientWidth));
    if (cnt) g.addEventListener('scroll', () => { cnt.textContent = `${at() + 1} / ${n}`; }, { passive: true });
    imgs.forEach((img, i) => img.addEventListener('click', () => RS.lightbox(imgs.map(x => x.currentSrc || x.src), i)));
    if (n > 1 && !calm) {
      // Клиент сам листает или держит курсор на фото — автолистание ждёт
      let pausedTill = 0;
      const pause = ms => { pausedTill = Date.now() + ms; };
      ['pointerdown', 'touchstart', 'wheel'].forEach(t => g.addEventListener(t, () => pause(6000), { passive: true }));
      g.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') pause(1e9); });
      g.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') pause(0); });
      let visible = true;
      if (slideIo) new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(g);
      setInterval(() => {
        if (!visible || document.hidden || lbOpen() || Date.now() < pausedTill) return;
        const next = (at() + 1) % n;
        imgs[(next + 1) % n].loading = 'eager';
        g.scrollTo({ left: next * g.clientWidth, behavior: 'smooth' });
      }, SLIDE_MS);
    }
  }
})();
