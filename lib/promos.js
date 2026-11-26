// Промокоды партнёров для страницы /partner (например, SUETA для подписчиков @suetaakg).
// Ссылка партнёра: kvartiry.asia/p/SUETA (или /partner?promo=SUETA) — на странице сверху «Промокод SUETA: …»,
// а в каждое сообщение «Хочу подключить…» сам дописывается «Промокод: SUETA». Код запоминается на 30 дней.
// Владелец заводит коды в кабинете («Менеджеры» → «Промокоды») и видит переходы и нажатия по каждому.
const CODE_RE = /^[A-Z0-9]{3,20}$/;
const norm = v => String(v || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);

function mount(app, { D, save, requireAuth, ownerOnly, cookies }) {
  const all = () => { const d = D(); if (!d.promos || typeof d.promos !== 'object') d.promos = {}; return d.promos; };
  const get = code => { const p = all()[norm(code)]; return p && p.active !== false ? p : null; };

  // Промокод для этой страницы: из адреса (?promo=) или запомненный в cookie
  function fromReq(req, res) {
    const q = norm(req.query.promo);
    if (q) {
      const p = get(q);
      if (p) {
        p.visits = (p.visits || 0) + 1; save();
        res.setHeader('Set-Cookie', `promo=${p.code}; Path=/; Max-Age=${30 * 86400}; SameSite=Lax${req.secure ? '; Secure' : ''}`);
      }
      return p;
    }
    return get(cookies(req).promo);
  }

  // Короткая ссылка для Instagram: /p/SUETA → /partner?promo=SUETA
  app.get('/p/:code', (req, res) => {
    const p = get(req.params.code);
    res.redirect(302, p ? `/partner?promo=${p.code}` : '/partner');
  });
  // Проверить код, который человек ввёл сам на странице
  app.get('/api/promo/:code', (req, res) => {
    const p = get(req.params.code);
    if (!p) return res.status(404).json({ error: 'Такого промокода нет' });
    res.json({ code: p.code, offer: p.offer || '', discount: p.discount || 0 });
  });
  // Нажатие кнопки «Хочу подключить» с промокодом — для счётчика у владельца
  app.post('/api/promo/:code/click', (req, res) => {
    const p = get(req.params.code);
    if (p) { p.clicks = (p.clicks || 0) + 1; save(); }
    res.status(204).end();
  });

  // Владелец
  const disc = v => Math.max(0, Math.min(90, Math.round(Number(v) || 0)));
  const view = p => ({ code: p.code, partner: p.partner || '', offer: p.offer || '', discount: p.discount || 0, percent: p.percent || 0, active: p.active !== false, visits: p.visits || 0, clicks: p.clicks || 0, createdAt: p.createdAt });
  app.get('/api/owner/promos', requireAuth, ownerOnly, (req, res) => res.json(Object.values(all()).map(view)));
  app.post('/api/owner/promos', requireAuth, ownerOnly, (req, res) => {
    const b = req.body || {}, code = norm(b.code);
    if (!CODE_RE.test(code)) return res.status(400).json({ error: 'Промокод — от 3 до 20 латинских букв и цифр, например SUETA' });
    if (all()[code]) return res.status(400).json({ error: 'Такой промокод уже есть' });
    all()[code] = { code, partner: String(b.partner || '').trim().slice(0, 80), offer: String(b.offer || '').trim().slice(0, 120),
      discount: disc(b.discount), percent: Math.max(0, Math.min(100, Number(b.percent) || 0)), active: true, visits: 0, clicks: 0, createdAt: new Date().toISOString() };
    save();
    res.json(Object.values(all()).map(view));
  });
  app.put('/api/owner/promos/:code', requireAuth, ownerOnly, (req, res) => {
    const p = all()[norm(req.params.code)];
    if (!p) return res.status(404).json({ error: 'Промокод не найден' });
    const b = req.body || {};
    if ('partner' in b) p.partner = String(b.partner || '').trim().slice(0, 80);
    if ('offer' in b) p.offer = String(b.offer || '').trim().slice(0, 120);
    if ('discount' in b) p.discount = disc(b.discount);
    if ('percent' in b) p.percent = Math.max(0, Math.min(100, Number(b.percent) || 0));
    if ('active' in b) p.active = !!b.active;
    save();
    res.json(Object.values(all()).map(view));
  });
  app.delete('/api/owner/promos/:code', requireAuth, ownerOnly, (req, res) => {
    delete all()[norm(req.params.code)];
    save();
    res.json(Object.values(all()).map(view));
  });

  return { fromReq };
}

module.exports = { mount };
