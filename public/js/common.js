// Общие функции для всех публичных страниц
(function () {
  const D = window.__DATA__ || {};
  const S = D.settings || {};
  const nf = new Intl.NumberFormat('ru-RU');

  const RS = {
    S,
    money: (n, cur) => (n == null ? '—' : `${nf.format(Math.round(n))} ${cur || ''}`.trim()),
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    wa: text => `https://wa.me/${String(S.whatsapp || '').replace(/\D/g, '')}?text=${encodeURIComponent(text)}`,
    track(type, id) {
      const body = JSON.stringify({ type, id });
      try {
        if (!navigator.sendBeacon || !navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }))) {
          fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
        }
      } catch (e) {}
      // Цель аналитики: нажатие кнопки WhatsApp
      try { window.gtag && gtag('event', 'whatsapp_click', { place: type, apartment_id: id || '' }); } catch (e) {}
      try { window.ym && window.YM_ID && ym(window.YM_ID, 'reachGoal', 'whatsapp_click', { place: type }); } catch (e) {}
      try { window.fbq && fbq('track', 'Contact'); } catch (e) {}
    },
  };
  window.RS = RS;

  document.addEventListener('click', e => {
    const a = e.target.closest('[data-wa]');
    if (a) RS.track(a.dataset.wa, a.dataset.id || null);
  });

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
