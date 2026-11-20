// Учёт доходов и расходов как продукт: у каждого человека свой учёт по адресу /money/<имя>.
// Людей заводит владелец в кабинете /admin («Учёт денег»): пишет имя и отдаёт человеку ссылку-приглашение.
// По ссылке человек сам придумывает цифровой пароль; пароля в коде нет. Владелец может сбросить пароль (новая ссылка) или удалить учёт.
// Старый общий учёт владельца (data/db.json → money) при первом запуске переезжает в /money/arlen с тем же паролем (войти нужно заново),
// а старый адрес /money ведёт на главный учёт. Страницы закрыты от поисковиков, ссылок на них нигде нет.
// Данные — в основной базе (data/db.json → moneyUsers), поэтому попадают в ежедневные копии.
const auth = require('./auth');
const crypto = require('crypto');

const PIN_RE = /^\d{2,12}$/;
const NAME_RE = /^[a-z0-9][a-z0-9-]{1,29}$/;
const MAIN_NAME = 'arlen';
// Вход держится сутки: на том же телефоне через 24 часа пароль спросят снова, на новом — сразу
const SESSION_DAYS = 1;
const CURRENCIES = ['сом', '$'];
// debt — деньги по долгу прошли через кошелёк: дал в долг / вернул сам (flow: out) или взял в долг / мне вернули (flow: in).
// В доходы и расходы не входят — меняют только остаток кошелька.
const KINDS = ['in', 'out', 'move', 'goal', 'debt'];

// Начальные категории и кошельки — их можно переименовать, удалить или добавить свои в «Настройках»
const DEFAULT_CATS = [
  { kind: 'in', name: 'Зарплата', icon: '💰', color: '#7cc242' },
  { kind: 'in', name: 'Комиссия', icon: '🏠', color: '#6a4fd6' },
  { kind: 'in', name: 'Подписки', icon: '🌐', color: '#2f9ee8' },
  { kind: 'out', name: 'Всё для дома', icon: '🏡', color: '#5b3fc4' },
  { kind: 'out', name: 'Карманные', icon: '🥤', color: '#f06292' },
  { kind: 'out', name: 'Продукты', icon: '🛒', color: '#29b6f6' },
  { kind: 'out', name: 'Транспорт', icon: '🚕', color: '#ffc107' },
  { kind: 'out', name: 'Еда', icon: '🍔', color: '#9ccc3c' },
  { kind: 'out', name: 'Развлечения', icon: '🌴', color: '#ec407a' },
  { kind: 'out', name: 'Связь', icon: '📱', color: '#1e4fc2' },
  { kind: 'out', name: 'Одежда', icon: '👕', color: '#283593' },
  { kind: 'out', name: 'Реклама', icon: '📣', color: '#ff7043' },
  { kind: 'out', name: 'Сервер и сайт', icon: '🖥️', color: '#607d8b' },
  { kind: 'out', name: 'Подарки', icon: '🎁', color: '#26c6da' },
];
const DEFAULT_WALLETS = [
  { name: 'Наличные', icon: '👛', color: '#42a5f5', currency: 'сом', start: 0 },
  { name: 'Карта', icon: '💳', color: '#e53935', currency: 'сом', start: 0 },
];

// Защита от подбора (у каждого учёта своя): короткий пароль подбирается быстро, поэтому
//  — с одного IP: 5 ошибок → вход закрыт на 15 минут;
//  — со всех IP вместе: 10 ошибок за час → вход в этот учёт закрыт на 6 часов.
const ipFails = new Map(); // «имя|ip» → { n, until, t }
const allFails = new Map(); // имя → { n, t, until }
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
  // Все учёты: { имя: учёт }. Старый общий учёт владельца переезжает на /money/arlen.
  const accounts = () => {
    const d = D();
    if (!d.moneyUsers || typeof d.moneyUsers !== 'object') {
      d.moneyUsers = {};
      if (d.money) { d.moneyUsers[MAIN_NAME] = { ...d.money, title: 'Арлен', main: true, createdAt: new Date().toISOString() }; delete d.money; }
      save();
    }
    return d.moneyUsers;
  };
  const conf = c => {
    if (!Array.isArray(c.entries)) c.entries = [];
    if (!Array.isArray(c.cats)) { c.cats = DEFAULT_CATS.map(x => ({ id: newId(), ...x })); save(); }
    if (!Array.isArray(c.wallets)) { c.wallets = DEFAULT_WALLETS.map(w => ({ id: newId(), ...w })); save(); }
    for (const k of ['recurring', 'goals', 'debts']) if (!Array.isArray(c[k])) c[k] = [];
    return c;
  };
  const mainName = () => Object.keys(accounts()).find(n => accounts()[n].main) || Object.keys(accounts())[0] || '';

  // Повторяющиеся платежи (аренда, сервер, связь…): в свой день месяца запись появляется сама.
  // Месяц, за который запись уже создана (или удалена вручную), помечается в done — второй раз не создаётся.
  const ymNow = () => new Date().toISOString().slice(0, 7);
  const dayNow = () => new Date().getDate();
  const nextYm = ym => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); };
  function applyRecurring(c) {
    let changed = false;
    for (const r of c.recurring) {
      if (!r.active) continue;
      const cat = c.cats.find(x => x.id === r.catId), wallet = c.wallets.find(w => w.id === r.wallet);
      if (!cat || !wallet) continue;
      r.done = Array.isArray(r.done) ? r.done : [];
      for (let ym = r.from || ymNow(), n = 0; ym <= ymNow() && n < 24; ym = nextYm(ym), n++) {
        if (r.done.includes(ym) || (ym === ymNow() && r.day > dayNow())) continue;
        c.entries.push({ id: newId(), kind: r.kind, amount: r.amount, date: `${ym}-${String(r.day).padStart(2, '0')}`, wallet: wallet.id,
          currency: wallet.currency, catId: cat.id, cat: cat.name, note: r.note || '', recId: r.id, createdAt: new Date().toISOString() });
        r.done.push(ym); changed = true;
      }
    }
    if (changed) save();
  }

  // Вход. Подпись cookie включает хэш пароля — смена или сброс пароля выкидывает все старые входы.
  // У каждого учёта свой cookie (mny_<имя>), поэтому на одном телефоне можно держать открытыми несколько учётов.
  const who = (name, c) => ({ id: `money:${name}`, hash: (c.pin || {}).hash || '', sessVer: c.sessVer });
  const isIn = (req, name, c) => {
    if (!c.pin) return false;
    const ck = cookies(req);
    return !!auth.readSession(D().secret, ck[`mny_${name}`], id => (id === `money:${name}` ? who(name, c) : null));
  };
  const setCookie = (req, res, name, c, on) => {
    const token = on ? auth.makeToken(D().secret, who(name, c), SESSION_DAYS) : '';
    const cks = [`mny_${name}=${token}; HttpOnly; SameSite=Strict; Path=/; ${on ? `Max-Age=${SESSION_DAYS * 86400}` : 'Max-Age=0'}${req.secure ? '; Secure' : ''}`];
    if (c.main) cks.push(`mny=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${req.secure ? '; Secure' : ''}`); // старый cookie больше не нужен
    res.setHeader('Set-Cookie', cks);
  };
  const noIndex = (req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow'); res.set('Cache-Control', 'no-store'); next(); };
  // Учёт из адреса: /api/m/<имя>/…
  const acct = (req, res, next) => {
    const name = String(req.params.user || '').toLowerCase();
    const c = NAME_RE.test(name) && accounts()[name];
    if (!c) return res.status(404).json({ error: 'Такого учёта нет' });
    req.mName = name; req.mc = conf(c); next();
  };
  const need = (req, res, next) => (isIn(req, req.mName, req.mc) ? next() : res.status(401).json({ error: 'auth' }));

  // Проверка записи. Сумма — целое число > 0. Доход и расход — с категорией и кошельком,
  // перевод (move) — из кошелька в другой кошелёк. Валюта записи = валюта кошелька.
  function clean(c, b) {
    const errors = {};
    const amount = Math.round(Number(String(b.amount ?? '').replace(/[\s,]/g, '')));
    if (!(amount > 0) || amount > 1e12) errors.amount = 'Сумма — число больше нуля';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') && !Number.isNaN(Date.parse(b.date)) ? b.date : '';
    if (!date) errors.date = 'Выберите дату';
    const kind = KINDS.includes(b.kind) ? b.kind : 'out';
    const wallet = c.wallets.find(w => w.id === b.wallet);
    if (!wallet) errors.wallet = 'Выберите кошелёк';
    const data = { kind, amount, date, wallet: wallet ? wallet.id : '', currency: wallet ? wallet.currency : 'сом',
      note: String(b.note || '').replace(/\s+/g, ' ').trim().slice(0, 200) };
    if (kind === 'goal') {
      // Отложить на цель: деньги уходят из кошелька в копилку цели (валюта та же)
      const g = c.goals.find(x => x.id === b.goalId);
      if (!g) errors.goalId = 'Выберите цель';
      else if (wallet && g.currency !== wallet.currency) errors.wallet = `Цель «${g.name}» в ${g.currency} — выберите кошелёк в той же валюте`;
      data.goalId = g ? g.id : '';
      data.cat = g ? `Цель: ${g.name}` : 'Цель';
    } else if (kind === 'debt') {
      const d = (c.debts || []).find(x => x.id === b.debtId);
      if (!d) errors.debtId = 'Долг не найден';
      else if (wallet && d.currency !== wallet.currency) errors.wallet = `Долг в ${d.currency} — выберите кошелёк в той же валюте`;
      data.debtId = d ? d.id : '';
      data.flow = b.flow === 'in' ? 'in' : 'out';
      const what = !d ? 'Долг' : d.dir === 'they' ? (data.flow === 'out' ? 'Дал в долг' : 'Вернули долг') : (data.flow === 'in' ? 'Взял в долг' : 'Вернул долг');
      data.cat = d ? `${what}: ${d.who}` : what;
    } else if (kind === 'move') {
      const to = c.wallets.find(w => w.id === b.toWallet);
      if (!to || to === wallet) errors.toWallet = 'Выберите другой кошелёк';
      else if (wallet && to.currency !== wallet.currency) errors.toWallet = 'Перевод только между кошельками в одной валюте';
      data.toWallet = to ? to.id : '';
      data.cat = 'Перевод';
    } else {
      const cat = c.cats.find(x => x.id === b.catId && x.kind === kind);
      if (!cat) errors.cat = 'Выберите категорию';
      data.catId = cat ? cat.id : '';
      data.cat = cat ? cat.name : '';
    }
    return { data, errors };
  }

  // Списки категорий и кошельков (свои названия, иконки, цвета). Удалённая категория остаётся в старых записях по имени.
  const str = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
  // Значок — один эмодзи, в том числе составной (семья, флаг, цвет кожи): берём первый знак целиком
  const SEG = new Intl.Segmenter('ru', { granularity: 'grapheme' });
  const icon = (v, def) => { const g = [...SEG.segment(String(v || '').trim())][0]; return g && g.segment.length <= 16 ? g.segment : def; };
  const COLOR = /^#[0-9a-f]{6}$/i;
  const num = v => Math.max(0, Math.round(Number(String(v ?? 0).replace(/[\s,]/g, ''))) || 0);
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  function cleanSetup(c, b) {
    const cats = (Array.isArray(b.cats) ? b.cats : []).slice(0, 60).map(x => ({
      id: c.cats.some(o => o.id === x.id) ? x.id : newId(), kind: x.kind === 'in' ? 'in' : 'out',
      name: str(x.name, 30), icon: icon(x.icon, '•'), color: COLOR.test(x.color) ? x.color : '#8e8e93',
      limit: x.kind === 'in' ? 0 : num(x.limit) })).filter(x => x.name); // лимит в месяц (сом), 0 — без лимита
    const wallets = (Array.isArray(b.wallets) ? b.wallets : []).slice(0, 20).map(x => ({
      id: c.wallets.some(o => o.id === x.id) ? x.id : newId(), name: str(x.name, 30), icon: icon(x.icon, '•'),
      color: COLOR.test(x.color) ? x.color : '#8e8e93', currency: CURRENCIES.includes(x.currency) ? x.currency : 'сом',
      start: Math.round(Number(String(x.start ?? 0).replace(/[\s,]/g, ''))) || 0 })).filter(x => x.name);
    return { cats, wallets };
  }
  // Повторяющиеся платежи, цели, долги — каждый список сохраняется целиком
  function cleanRecurring(c, list) {
    return (Array.isArray(list) ? list : []).slice(0, 50).map(x => {
      const old = c.recurring.find(o => o.id === x.id);
      return { id: old ? old.id : newId(), kind: x.kind === 'in' ? 'in' : 'out', catId: String(x.catId || ''), wallet: String(x.wallet || ''),
        amount: num(x.amount), day: Math.min(28, Math.max(1, parseInt(x.day) || 1)), note: str(x.note, 100), active: x.active !== false,
        from: old ? old.from : ymNow(), done: old ? old.done || [] : [] };
    }).filter(x => x.amount > 0 && c.cats.some(k => k.id === x.catId && k.kind === x.kind) && c.wallets.some(w => w.id === x.wallet));
  }
  function cleanGoals(c, list) {
    return (Array.isArray(list) ? list : []).slice(0, 20).map(x => ({
      id: c.goals.some(o => o.id === x.id) ? x.id : newId(), name: str(x.name, 30), icon: icon(x.icon, '🎯'),
      color: COLOR.test(x.color) ? x.color : '#ffc107', target: num(x.target), currency: CURRENCIES.includes(x.currency) ? x.currency : 'сом',
      until: DATE.test(x.until || '') ? x.until : '' })).filter(x => x.name && x.target > 0);
  }
  function cleanDebts(c, list) {
    return (Array.isArray(list) ? list : []).slice(0, 100).map(x => ({
      id: c.debts.some(o => o.id === x.id) ? x.id : newId(), who: str(x.who, 40), dir: x.dir === 'me' ? 'me' : 'they', // they — мне должны, me — я должен
      amount: num(x.amount), currency: CURRENCIES.includes(x.currency) ? x.currency : 'сом', due: DATE.test(x.due || '') ? x.due : '',
      note: str(x.note, 100), closed: x.closed === true, noWallet: x.noWallet === true, createdAt: (c.debts.find(o => o.id === x.id) || {}).createdAt || new Date().toISOString() }))
      .filter(x => x.who && x.amount > 0);
  }

  // ---------- Страницы ----------
  const page = (req, res) => res.sendFile(require('path').join(__dirname, '..', 'views', 'money.html'));
  // Старый адрес /money — на главный учёт владельца
  app.get('/money', noIndex, (req, res) => (mainName() ? res.redirect(302, `/money/${mainName()}`) : res.status(404).send('Not found')));
  app.get('/money/:user', noIndex, (req, res, next) => (accounts()[String(req.params.user).toLowerCase()] ? page(req, res) : next()));

  // ---------- Вход ----------
  const okInvite = (c, code) => !!c.invite && typeof code === 'string' && code.length === c.invite.length
    && crypto.timingSafeEqual(Buffer.from(code), Buffer.from(c.invite));
  app.get('/api/m/:user/me', noIndex, acct, (req, res) => {
    const c = req.mc;
    // Пароль ещё не задан — задать его можно по ссылке-приглашению (или владельцу, который вошёл в кабинет)
    const canSetup = !c.pin && (okInvite(c, String(req.query.invite || '')) || isOwner(req));
    res.json({ in: isIn(req, req.mName, c), lockedMin: locked(req.mName, req.ip), setup: !c.pin, canSetup, title: c.title || req.mName });
  });
  app.post('/api/m/:user/setpin', noIndex, acct, (req, res) => {
    const c = req.mc, b = req.body || {};
    if (c.pin) return res.status(400).json({ error: 'Пароль уже задан' });
    if (!okInvite(c, String(b.invite || '')) && !isOwner(req)) return res.status(403).json({ error: 'Ссылка-приглашение устарела — попросите новую' });
    const pin = String(b.pin || '');
    if (!PIN_RE.test(pin)) return res.status(400).json({ error: 'Только цифры, от 2 до 12' });
    c.pin = auth.hashPassword(pin); delete c.invite; c.activatedAt = new Date().toISOString(); save();
    setCookie(req, res, req.mName, c, true);
    res.json({ ok: true });
  });
  app.post('/api/m/:user/login', noIndex, acct, (req, res) => {
    const c = req.mc;
    const wait = locked(req.mName, req.ip);
    if (wait) return res.status(429).json({ error: `Слишком много попыток. Попробуйте через ${wait} мин.` });
    const pin = String((req.body || {}).pin || '');
    if (!c.pin) return res.status(400).json({ error: 'Пароль ещё не задан' });
    if (!auth.checkPassword(c.pin, pin)) {
      failed(req.mName, req.ip);
      c.badTries = (c.badTries || 0) + 1; save();
      return res.status(401).json({ error: 'Неверный пароль' });
    }
    const bad = c.badTries || 0;
    c.badTries = 0; c.lastLogin = new Date().toISOString(); save();
    setCookie(req, res, req.mName, c, true);
    res.json({ ok: true, badTries: bad });
  });
  app.post('/api/m/:user/logout', noIndex, acct, (req, res) => { setCookie(req, res, req.mName, req.mc, false); res.json({ ok: true }); });

  // ---------- Данные учёта ----------
  const all = c => { applyRecurring(c);
    return { entries: c.entries, cats: c.cats, wallets: c.wallets, recurring: c.recurring, goals: c.goals, debts: c.debts, rate: c.rate || 0 }; };
  app.get('/api/m/:user', noIndex, acct, need, (req, res) => res.json(all(req.mc)));
  // Повторяющиеся платежи, цели, долги, курс доллара — что прислано, то и заменяется
  app.put('/api/m/:user/lists', noIndex, acct, need, (req, res) => {
    const c = req.mc, b = req.body || {};
    if ('goals' in b) {
      const goals = cleanGoals(c, b.goals);
      const gone = c.goals.find(g => !goals.some(x => x.id === g.id) && c.entries.some(e => e.goalId === g.id));
      if (gone) return res.status(400).json({ error: `На цель «${gone.name}» уже отложены деньги — сначала удалите эти записи в «Истории»` });
      const cur = goals.find(g => { const o = c.goals.find(x => x.id === g.id); return o && o.currency !== g.currency && c.entries.some(e => e.goalId === g.id); });
      if (cur) return res.status(400).json({ error: `У цели «${cur.name}» уже есть пополнения — валюту поменять нельзя` });
      c.goals = goals;
    }
    if ('recurring' in b) c.recurring = cleanRecurring(c, b.recurring);
    if ('debts' in b) c.debts = cleanDebts(c, b.debts);
    if ('rate' in b) c.rate = Math.min(100000, Math.max(0, Number(String(b.rate).replace(',', '.')) || 0));
    save();
    res.json(all(c));
  });
  // Выгрузка для Excel: все записи (CSV, «;», с BOM — Excel открывает по колонкам)
  app.get('/api/m/:user/csv', noIndex, acct, need, (req, res) => {
    const c = req.mc;
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const kindName = { in: 'Доход', out: 'Расход', move: 'Перевод', goal: 'На цель', debt: 'Долг' };
    const wName = id => (c.wallets.find(w => w.id === id) || {}).name || '';
    const rows = [...c.entries].sort((a, b) => a.date.localeCompare(b.date)).map(e => [e.date.split('-').reverse().join('.'), kindName[e.kind] || e.kind,
      e.cat, wName(e.wallet) + (e.toWallet ? ' → ' + wName(e.toWallet) : ''), e.kind === 'out' || e.kind === 'goal' || (e.kind === 'debt' && e.flow === 'out') ? -e.amount : e.amount, e.currency, e.note || '']);
    const csv = '﻿' + [['Дата', 'Вид', 'Категория', 'Кошелёк', 'Сумма', 'Валюта', 'Заметка'], ...rows].map(r => r.map(q).join(';')).join('\r\n');
    res.set('Content-Disposition', `attachment; filename="uchet-${req.mName}-${new Date().toISOString().slice(0, 10)}.csv"`).type('text/csv; charset=utf-8').send(csv);
  });
  // Сохранить категории и кошельки целиком. Кошелёк, в котором есть записи, удалить нельзя.
  app.put('/api/m/:user/setup', noIndex, acct, need, (req, res) => {
    const c = req.mc;
    const { cats, wallets } = cleanSetup(c, req.body || {});
    if (!wallets.length) return res.status(400).json({ error: 'Нужен хотя бы один кошелёк' });
    const gone = c.wallets.filter(w => !wallets.some(x => x.id === w.id) && c.entries.some(e => e.wallet === w.id || e.toWallet === w.id));
    if (gone.length) return res.status(400).json({ error: `В кошельке «${gone[0].name}» есть записи — сначала удалите или перенесите их` });
    // Валюту кошелька с записями менять нельзя: суммы бы перепутались
    const cur = wallets.find(w => { const o = c.wallets.find(x => x.id === w.id); return o && o.currency !== w.currency && c.entries.some(e => e.wallet === w.id || e.toWallet === w.id); });
    if (cur) return res.status(400).json({ error: `У кошелька «${cur.name}» уже есть записи — валюту поменять нельзя` });
    // Переименованная категория — новое имя и в старых записях
    for (const e of c.entries) { const x = cats.find(k => k.id === e.catId); if (x) e.cat = x.name; }
    c.cats = cats; c.wallets = wallets; save();
    res.json({ cats, wallets });
  });
  app.post('/api/m/:user/e', noIndex, acct, need, (req, res) => {
    const { data, errors } = clean(req.mc, req.body || {});
    if (Object.keys(errors).length) return res.status(400).json({ errors });
    const e = { id: newId(), ...data, createdAt: new Date().toISOString() };
    req.mc.entries.push(e); save();
    res.json(e);
  });
  // Смена пароля: нужен старый. Новый — только цифры, от 2 до 12. После смены все другие входы закрываются.
  app.put('/api/m/:user/pin', noIndex, acct, need, (req, res) => {
    const c = req.mc, b = req.body || {};
    if (!auth.checkPassword(c.pin, String(b.old || ''))) { failed(req.mName, req.ip); return res.status(400).json({ errors: { old: 'Старый пароль неверный' } }); }
    const pin = String(b.pin || '');
    if (!PIN_RE.test(pin)) return res.status(400).json({ errors: { pin: 'Только цифры, от 2 до 12' } });
    c.pin = auth.hashPassword(pin); save();
    setCookie(req, res, req.mName, c, true); // этот телефон остаётся в учёте
    res.json({ ok: true });
  });
  app.put('/api/m/:user/e/:id', noIndex, acct, need, (req, res) => {
    const e = req.mc.entries.find(x => x.id === req.params.id);
    if (!e) return res.status(404).json({ error: 'Запись не найдена' });
    const { data, errors } = clean(req.mc, req.body || {});
    if (Object.keys(errors).length) return res.status(400).json({ errors });
    Object.assign(e, data, { updatedAt: new Date().toISOString() }); save();
    res.json(e);
  });
  app.delete('/api/m/:user/e/:id', noIndex, acct, need, (req, res) => {
    const c = req.mc;
    const before = c.entries.length;
    c.entries = c.entries.filter(x => x.id !== req.params.id);
    if (c.entries.length === before) return res.status(404).json({ error: 'Запись не найдена' });
    save(); res.json({ ok: true });
  });

  // ---------- Кабинет владельца: люди с учётом ----------
  // Владелец видит только имя, дату и задан ли пароль — сами записи людей ему не показываются.
  const code = () => crypto.randomBytes(18).toString('base64url');
  const row = (name, c) => ({ name, title: c.title || name, main: !!c.main, createdAt: c.createdAt || '', active: !!c.pin,
    invite: c.pin ? '' : (c.invite || ''), lastLogin: c.lastLogin || '' });
  const list = () => Object.entries(accounts()).map(([n, c]) => row(n, c)).sort((a, b) => (b.main - a.main) || a.createdAt.localeCompare(b.createdAt));
  app.get('/api/owner/money-users', requireAuth, ownerOnly, (req, res) => res.json(list()));
  app.post('/api/owner/money-users', requireAuth, ownerOnly, (req, res) => {
    const b = req.body || {};
    const name = String(b.name || '').trim().toLowerCase();
    if (!NAME_RE.test(name)) return res.status(400).json({ errors: { name: 'Латинские буквы, цифры и «-», от 2 до 30 знаков' } });
    if (accounts()[name]) return res.status(400).json({ errors: { name: 'Такое имя уже занято' } });
    accounts()[name] = { title: str(b.title, 40) || name, createdAt: new Date().toISOString(), invite: code() };
    save(); res.json(list());
  });
  // Сбросить пароль: старые входы закрываются, человек получает новую ссылку-приглашение. Записи остаются.
  app.post('/api/owner/money-users/:name/reset', requireAuth, ownerOnly, (req, res) => {
    const c = accounts()[req.params.name];
    if (!c) return res.status(404).json({ error: 'Нет такого учёта' });
    delete c.pin; c.invite = code(); c.sessVer = (c.sessVer || 0) + 1; save();
    res.json(list());
  });
  app.delete('/api/owner/money-users/:name', requireAuth, ownerOnly, (req, res) => {
    const c = accounts()[req.params.name];
    if (!c) return res.status(404).json({ error: 'Нет такого учёта' });
    if (c.main) return res.status(400).json({ error: 'Свой главный учёт удалить нельзя' });
    delete accounts()[req.params.name]; save();
    res.json(list());
  });
}

module.exports = { mount };
