// Учёт товаров для бизнеса: у каждого человека свой учёт по адресу /shop/<имя>.
// Людей заводит владелец в кабинете /admin («Менеджеры» → «Учёт товаров»): пишет имя и отдаёт ссылку-приглашение.
// По ссылке человек сам придумывает цифровой пароль; пароля в коде нет. Владелец может сбросить пароль.
//
// Что ведёт человек:
//  — товары (название, цена продажи по умолчанию);
//  — закупки (moves.type = 'buy'): сколько штук и по какой цене за штуку купил;
//  — продажи (moves.type = 'sell'): сколько штук и по какой цене продал;
//  — расходы месяца (аренда, зарплата, доставка…).
// Остаток, себестоимость (средняя цена закупки), прибыль и анализ продаж считаются на странице.
// Данные — в основной базе (data/db.json → shopUsers), поэтому попадают в ежедневные копии.
const auth = require('./auth');
const crypto = require('crypto');
const path = require('path');

const PIN_RE = /^\d{2,12}$/;
const NAME_RE = /^[a-z0-9][a-z0-9-]{1,29}$/;
const SESSION_DAYS = 1;
// Категории товаров (одежда): у товара одна категория, по ним — фильтр в таблице и разбивка в анализе
const CATS = { men: 'Мужское', women: 'Женское', kids: 'Детское', acc: 'Аксессуары', socks: 'Носки' };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Защита от подбора пароля (как в /money): с одного IP 5 ошибок → 15 минут; со всех IP 10 ошибок за час → 6 часов
const ipFails = new Map(), allFails = new Map();
const now = () => Date.now();
function locked(name, ip) {
  const f = ipFails.get(`${name}|${ip}`), a = allFails.get(name);
  if (f && f.until > now()) return Math.ceil((f.until - now()) / 60000);
  if (a && a.until > now()) return Math.ceil((a.until - now()) / 60000);
  return 0;
}
function failed(name, ip) {
  const key = `${name}|${ip}`;
  const f = ipFails.get(key) && ipFails.get(key).t > now() - 3600e3 ? ipFails.get(key) : { n: 0, until: 0 };
  f.n++; f.t = now();
  if (f.n >= 5) { f.until = now() + 15 * 60e3; f.n = 0; }
  ipFails.set(key, f);
  if (ipFails.size > 10000) ipFails.clear();
  let a = allFails.get(name);
  if (!a || a.t < now() - 3600e3) a = { n: 0, t: now(), until: 0 };
  a.n++;
  if (a.n >= 10) { a.until = now() + 6 * 3600e3; a.n = 0; a.t = now(); }
  allFails.set(name, a);
}

function mount(app, { D, save, cookies, newId, isOwner, requireAuth, ownerOnly }) {
  const accounts = () => { const d = D(); if (!d.shopUsers || typeof d.shopUsers !== 'object') d.shopUsers = {}; return d.shopUsers; };
  const conf = c => { for (const k of ['products', 'moves', 'expenses']) if (!Array.isArray(c[k])) c[k] = []; return c; };

  // Вход: свой cookie у каждого учёта (shp_<имя>); подпись включает хэш пароля — смена пароля закрывает старые входы
  const who = (name, c) => ({ id: `shop:${name}`, hash: (c.pin || {}).hash || '', sessVer: c.sessVer });
  const isIn = (req, name, c) => !!c.pin && !!auth.readSession(D().secret, cookies(req)[`shp_${name}`], id => (id === `shop:${name}` ? who(name, c) : null));
  const setCookie = (req, res, name, c, on) => {
    const token = on ? auth.makeToken(D().secret, who(name, c), SESSION_DAYS) : '';
    res.setHeader('Set-Cookie', `shp_${name}=${token}; HttpOnly; SameSite=Strict; Path=/; ${on ? `Max-Age=${SESSION_DAYS * 86400}` : 'Max-Age=0'}${req.secure ? '; Secure' : ''}`);
  };
  const noIndex = (req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow'); res.set('Cache-Control', 'no-store'); next(); };
  const acct = (req, res, next) => {
    const name = String(req.params.user || '').toLowerCase();
    const c = NAME_RE.test(name) && accounts()[name];
    if (!c) return res.status(404).json({ error: 'Такого учёта нет' });
    req.sName = name; req.sc = conf(c); next();
  };
  const need = (req, res, next) => (isIn(req, req.sName, req.sc) ? next() : res.status(401).json({ error: 'auth' }));

  const str = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const num = v => Math.round(Number(String(v ?? '').replace(/[\s,]/g, '').replace(',', '.')));
  const today = () => new Date().toISOString().slice(0, 10);
  const dateOf = v => (DATE.test(v || '') && !Number.isNaN(Date.parse(v)) ? v : '');
  // Сколько штук товара сейчас на складе
  const stockOf = (c, pid, skipId) => c.moves.filter(m => m.productId === pid && m.id !== skipId)
    .reduce((s, m) => s + (m.type === 'buy' ? m.qty : -m.qty), 0);

  function cleanProduct(b) {
    const errors = {};
    const name = str(b.name, 60);
    if (!name) errors.name = 'Напишите название товара';
    const sellPrice = b.sellPrice === '' || b.sellPrice == null ? 0 : num(b.sellPrice);
    if (!(sellPrice >= 0) || sellPrice > 1e10) errors.sellPrice = 'Цена — число';
    const cat = b.cat in CATS ? b.cat : '';
    if (!cat) errors.cat = 'Выберите категорию';
    return { data: { name, cat, sellPrice: sellPrice || 0, note: str(b.note, 120) }, errors };
  }
  function cleanMove(c, b, id) {
    const errors = {};
    const type = b.type === 'sell' ? 'sell' : 'buy';
    const p = c.products.find(x => x.id === b.productId);
    if (!p) errors.productId = 'Выберите товар';
    const qty = num(b.qty), price = num(b.price);
    if (!(qty > 0) || qty > 1e7) errors.qty = 'Сколько штук — число больше нуля';
    if (!(price >= 0) || price > 1e10 || String(b.price ?? '').trim() === '') errors.price = 'Цена за штуку — число';
    const date = dateOf(b.date) || today();
    // Нельзя продать больше, чем есть на складе
    if (p && type === 'sell' && qty > 0) {
      const left = stockOf(c, p.id, id);
      if (qty > left) errors.qty = left > 0 ? `На складе только ${left} шт.` : 'Этого товара нет на складе — сначала добавьте закупку';
    }
    // Нельзя уменьшить закупку так, что проданного станет больше, чем куплено
    if (p && type === 'buy' && id && qty > 0) {
      const left = stockOf(c, p.id, id) + qty;
      if (left < 0) errors.qty = `Уже продано больше — минимум ${qty - left} шт.`;
    }
    // Скидка — сумма в сомах на всю продажу. Покупатель платит qty × price − скидка; прибыль меньше на сумму скидки.
    let discount = 0;
    if (type === 'sell' && String(b.discount ?? '').trim() !== '') {
      discount = num(b.discount);
      if (!(discount >= 0)) errors.discount = 'Скидка — число';
      else if (qty > 0 && price >= 0 && discount > qty * price) errors.discount = 'Скидка больше суммы продажи';
    }
    return { data: { type, productId: p ? p.id : '', qty, price, discount: discount || 0, date, note: str(b.note, 120) }, errors };
  }
  function cleanExpense(b) {
    const errors = {};
    const name = str(b.name, 60);
    if (!name) errors.name = 'На что потрачено';
    const amount = num(b.amount);
    if (!(amount > 0) || amount > 1e11) errors.amount = 'Сумма — число больше нуля';
    const date = dateOf(b.date) || today();
    return { data: { name, amount, date }, errors };
  }

  // ---------- Страница ----------
  const page = (req, res) => res.sendFile(path.join(__dirname, '..', 'views', 'shop.html'));
  app.get('/shop/:user', noIndex, (req, res, next) => (accounts()[String(req.params.user).toLowerCase()] ? page(req, res) : next()));

  // ---------- Вход ----------
  const okInvite = (c, code) => !!c.invite && typeof code === 'string' && code.length === c.invite.length
    && crypto.timingSafeEqual(Buffer.from(code), Buffer.from(c.invite));
  app.get('/api/s/:user/me', noIndex, acct, (req, res) => {
    const c = req.sc;
    const canSetup = !c.pin && (okInvite(c, String(req.query.invite || '')) || isOwner(req));
    res.json({ in: isIn(req, req.sName, c), lockedMin: locked(req.sName, req.ip), setup: !c.pin, canSetup, title: c.title || req.sName });
  });
  app.post('/api/s/:user/setpin', noIndex, acct, (req, res) => {
    const c = req.sc, b = req.body || {};
    if (c.pin) return res.status(400).json({ error: 'Пароль уже задан' });
    if (!okInvite(c, String(b.invite || '')) && !isOwner(req)) return res.status(403).json({ error: 'Ссылка-приглашение устарела — попросите новую' });
    const pin = String(b.pin || '');
    if (!PIN_RE.test(pin)) return res.status(400).json({ error: 'Только цифры, от 2 до 12' });
    c.pin = auth.hashPassword(pin); delete c.invite; c.activatedAt = new Date().toISOString(); save();
    setCookie(req, res, req.sName, c, true);
    res.json({ ok: true });
  });
  app.post('/api/s/:user/login', noIndex, acct, (req, res) => {
    const c = req.sc;
    const wait = locked(req.sName, req.ip);
    if (wait) return res.status(429).json({ error: `Слишком много попыток. Попробуйте через ${wait} мин.` });
    if (!c.pin) return res.status(400).json({ error: 'Пароль ещё не задан' });
    if (!auth.checkPassword(c.pin, String((req.body || {}).pin || ''))) { failed(req.sName, req.ip); return res.status(401).json({ error: 'Неверный пароль' }); }
    c.lastLogin = new Date().toISOString(); save();
    setCookie(req, res, req.sName, c, true);
    res.json({ ok: true });
  });
  app.post('/api/s/:user/logout', noIndex, acct, (req, res) => { setCookie(req, res, req.sName, req.sc, false); res.json({ ok: true }); });
  app.put('/api/s/:user/pin', noIndex, acct, need, (req, res) => {
    const c = req.sc, b = req.body || {};
    if (!auth.checkPassword(c.pin, String(b.old || ''))) { failed(req.sName, req.ip); return res.status(400).json({ errors: { old: 'Старый пароль неверный' } }); }
    const pin = String(b.pin || '');
    if (!PIN_RE.test(pin)) return res.status(400).json({ errors: { pin: 'Только цифры, от 2 до 12' } });
    c.pin = auth.hashPassword(pin); save();
    setCookie(req, res, req.sName, c, true);
    res.json({ ok: true });
  });

  // ---------- Данные ----------
  const all = c => ({ products: c.products, moves: c.moves, expenses: c.expenses, cats: CATS });
  app.get('/api/s/:user', noIndex, acct, need, (req, res) => res.json(all(req.sc)));

  // Товар. При создании можно сразу указать первую закупку (сколько штук и за сколько купил).
  app.post('/api/s/:user/products', noIndex, acct, need, (req, res) => {
    const c = req.sc, b = req.body || {};
    if (c.products.length >= 2000) return res.status(400).json({ error: 'Слишком много товаров' });
    const { data, errors } = cleanProduct(b);
    const p = { id: newId(), ...data, createdAt: new Date().toISOString() };
    let first = null;
    if (String(b.qty ?? '').trim() !== '') {
      c.products.push(p); // временно — чтобы проверка закупки нашла товар
      const m = cleanMove(c, { type: 'buy', productId: p.id, qty: b.qty, price: b.buyPrice, date: b.date });
      c.products.pop();
      if (m.errors.qty) errors.qty = m.errors.qty;
      if (m.errors.price) errors.buyPrice = m.errors.price;
      first = m.data;
    }
    if (Object.keys(errors).length) return res.status(400).json({ errors });
    c.products.push(p);
    if (first) c.moves.push({ id: newId(), ...first, createdAt: new Date().toISOString() });
    save(); res.json(all(c));
  });
  app.put('/api/s/:user/products/:id', noIndex, acct, need, (req, res) => {
    const c = req.sc, p = c.products.find(x => x.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'Товар не найден' });
    const { data, errors } = cleanProduct(req.body || {});
    if (Object.keys(errors).length) return res.status(400).json({ errors });
    Object.assign(p, data, { updatedAt: new Date().toISOString() }); save();
    res.json(all(c));
  });
  // Удалить товар вместе со всеми его закупками и продажами
  app.delete('/api/s/:user/products/:id', noIndex, acct, need, (req, res) => {
    const c = req.sc;
    if (!c.products.some(x => x.id === req.params.id)) return res.status(404).json({ error: 'Товар не найден' });
    c.products = c.products.filter(x => x.id !== req.params.id);
    c.moves = c.moves.filter(m => m.productId !== req.params.id);
    save(); res.json(all(c));
  });

  // Закупка или продажа
  app.post('/api/s/:user/moves', noIndex, acct, need, (req, res) => {
    const c = req.sc;
    if (c.moves.length >= 50000) return res.status(400).json({ error: 'Слишком много записей' });
    const { data, errors } = cleanMove(c, req.body || {});
    if (Object.keys(errors).length) return res.status(400).json({ errors });
    c.moves.push({ id: newId(), ...data, createdAt: new Date().toISOString() }); save();
    res.json(all(c));
  });
  app.put('/api/s/:user/moves/:id', noIndex, acct, need, (req, res) => {
    const c = req.sc, m = c.moves.find(x => x.id === req.params.id);
    if (!m) return res.status(404).json({ error: 'Запись не найдена' });
    const { data, errors } = cleanMove(c, { ...req.body, type: m.type, productId: m.productId }, m.id);
    if (Object.keys(errors).length) return res.status(400).json({ errors });
    Object.assign(m, data, { updatedAt: new Date().toISOString() }); save();
    res.json(all(c));
  });
  app.delete('/api/s/:user/moves/:id', noIndex, acct, need, (req, res) => {
    const c = req.sc, m = c.moves.find(x => x.id === req.params.id);
    if (!m) return res.status(404).json({ error: 'Запись не найдена' });
    // Удалить закупку нельзя, если без неё продано больше, чем куплено
    if (m.type === 'buy' && stockOf(c, m.productId, m.id) < 0) return res.status(400).json({ error: 'Эти штуки уже проданы — сначала удалите продажи' });
    c.moves = c.moves.filter(x => x !== m); save();
    res.json(all(c));
  });

  // Расходы месяца
  app.post('/api/s/:user/expenses', noIndex, acct, need, (req, res) => {
    const c = req.sc;
    if (c.expenses.length >= 20000) return res.status(400).json({ error: 'Слишком много записей' });
    const { data, errors } = cleanExpense(req.body || {});
    if (Object.keys(errors).length) return res.status(400).json({ errors });
    c.expenses.push({ id: newId(), ...data, createdAt: new Date().toISOString() }); save();
    res.json(all(c));
  });
  app.delete('/api/s/:user/expenses/:id', noIndex, acct, need, (req, res) => {
    const c = req.sc, before = c.expenses.length;
    c.expenses = c.expenses.filter(x => x.id !== req.params.id);
    if (c.expenses.length === before) return res.status(404).json({ error: 'Запись не найдена' });
    save(); res.json(all(c));
  });

  // Выгрузка для Excel: таблица товаров с итогами (CSV, «;», с BOM)
  app.get('/api/s/:user/csv', noIndex, acct, need, (req, res) => {
    const c = req.sc;
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = c.products.map(p => {
      const ms = c.moves.filter(m => m.productId === p.id);
      const buy = ms.filter(m => m.type === 'buy'), sell = ms.filter(m => m.type === 'sell');
      const bq = buy.reduce((s, m) => s + m.qty, 0), bs = buy.reduce((s, m) => s + m.qty * m.price, 0);
      const sq = sell.reduce((s, m) => s + m.qty, 0), disc = sell.reduce((s, m) => s + (m.discount || 0), 0);
      const ss = sell.reduce((s, m) => s + m.qty * m.price, 0) - disc;
      const avg = bq ? bs / bq : 0;
      return [p.name, CATS[p.cat] || '', bq, Math.round(avg), bs, sq, disc, ss, Math.round(ss - sq * avg), bq - sq];
    });
    const csv = '﻿' + [['Товар', 'Категория', 'Купил, шт', 'Цена закупки за шт', 'Закупка, сом', 'Продал, шт', 'Скидки, сом', 'Выручка, сом', 'Прибыль, сом', 'Остаток, шт'], ...rows]
      .map(r => r.map(q).join(';')).join('\r\n');
    res.set('Content-Disposition', `attachment; filename="tovary-${req.sName}-${today()}.csv"`).type('text/csv; charset=utf-8').send(csv);
  });

  // ---------- Кабинет владельца: люди с учётом товаров ----------
  // Владелец видит только имя, дату и задан ли пароль — сами товары и продажи ему не показываются.
  const code = () => crypto.randomBytes(18).toString('base64url');
  const row = (name, c) => ({ name, title: c.title || name, createdAt: c.createdAt || '', active: !!c.pin,
    invite: c.pin ? '' : (c.invite || ''), lastLogin: c.lastLogin || '' });
  const list = () => Object.entries(accounts()).map(([n, c]) => row(n, c)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  app.get('/api/owner/shop-users', requireAuth, ownerOnly, (req, res) => res.json(list()));
  app.post('/api/owner/shop-users', requireAuth, ownerOnly, (req, res) => {
    const b = req.body || {};
    const name = String(b.name || '').trim().toLowerCase();
    if (!NAME_RE.test(name)) return res.status(400).json({ errors: { name: 'Латинские буквы, цифры и «-», от 2 до 30 знаков' } });
    if (accounts()[name]) return res.status(400).json({ errors: { name: 'Такое имя уже занято' } });
    accounts()[name] = { title: str(b.title, 40) || name, createdAt: new Date().toISOString(), invite: code() };
    save(); res.json(list());
  });
  app.post('/api/owner/shop-users/:name/reset', requireAuth, ownerOnly, (req, res) => {
    const c = accounts()[req.params.name];
    if (!c) return res.status(404).json({ error: 'Нет такого учёта' });
    delete c.pin; c.invite = code(); c.sessVer = (c.sessVer || 0) + 1; save();
    res.json(list());
  });
  app.delete('/api/owner/shop-users/:name', requireAuth, ownerOnly, (req, res) => {
    if (!accounts()[req.params.name]) return res.status(404).json({ error: 'Нет такого учёта' });
    delete accounts()[req.params.name]; save();
    res.json(list());
  });
}

module.exports = { mount };
