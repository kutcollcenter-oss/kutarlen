// Скрытая страница владельца /money — учёт доходов и расходов.
// Вход по цифровому паролю. Пароля в коде нет: первый раз его задаёт владелец, вошедший в кабинет /admin; потом меняется на странице. Ссылки на страницу нигде нет, поисковикам закрыта.
// Данные — в основной базе (data/db.json → money), поэтому попадают в ежедневные копии.
const auth = require('./auth');

const PIN_RE = /^\d{2,12}$/;
const SESSION_DAYS = 30;
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

// Защита от подбора: короткий пароль подбирается быстро, поэтому
//  — с одного IP: 5 ошибок → вход закрыт на 15 минут;
//  — со всех IP вместе: 10 ошибок за час → вход закрыт на 6 часов (подбор короткого пароля займёт сутки и больше).
const ipFails = new Map(); // ip → { n, until, t }
let allFails = { n: 0, t: 0, until: 0 };
const now = () => Date.now();

function locked(ip) {
  const f = ipFails.get(ip);
  if (f && f.until > now()) return Math.ceil((f.until - now()) / 60000);
  if (allFails.until > now()) return Math.ceil((allFails.until - now()) / 60000);
  return 0;
}
function failed(ip) {
  const f = ipFails.get(ip) && ipFails.get(ip).t > now() - 3600e3 ? ipFails.get(ip) : { n: 0, until: 0 };
  f.n++; f.t = now();
  if (f.n >= 5) { f.until = now() + 15 * 60e3; f.n = 0; }
  ipFails.set(ip, f);
  if (ipFails.size > 10000) ipFails.clear();
  if (allFails.t < now() - 3600e3) allFails = { n: 0, t: now(), until: 0 };
  allFails.n++;
  if (allFails.n >= 10) { allFails.until = now() + 6 * 3600e3; allFails.n = 0; allFails.t = now(); }
}

function mount(app, { D, save, cookies, newId, isOwner }) {
  const conf = () => {
    const d = D();
    if (!d.money) d.money = { entries: [] };
    if (!Array.isArray(d.money.entries)) d.money.entries = [];
    if (!Array.isArray(d.money.cats)) { d.money.cats = DEFAULT_CATS.map(c => ({ id: newId(), ...c })); save(); }
    if (!Array.isArray(d.money.wallets)) { d.money.wallets = DEFAULT_WALLETS.map(w => ({ id: newId(), ...w })); save(); }
    for (const k of ['recurring', 'goals', 'debts']) if (!Array.isArray(d.money[k])) d.money[k] = [];
    return d.money;
  };

  // Повторяющиеся платежи (аренда, сервер, связь…): в свой день месяца запись появляется сама.
  // Месяц, за который запись уже создана (или удалена вручную), помечается в done — второй раз не создаётся.
  const ymNow = () => new Date().toISOString().slice(0, 7);
  const dayNow = () => new Date().getDate();
  const nextYm = ym => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); };
  function applyRecurring() {
    const c = conf();
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
  // «Пользователь» для подписи cookie: подпись включает хэш пароля — смена пароля выкидывает все старые входы
  const who = () => ({ id: 'money', hash: (conf().pin || {}).hash || '', sessVer: conf().sessVer });
  const isIn = req => !!conf().pin && !!auth.readSession(D().secret, cookies(req).mny, id => (id === 'money' ? who() : null));
  const setCookie = (req, res, on) => {
    const token = on ? auth.makeToken(D().secret, who(), SESSION_DAYS) : '';
    res.setHeader('Set-Cookie', `mny=${token}; HttpOnly; SameSite=Strict; Path=/; ${on ? `Max-Age=${SESSION_DAYS * 86400}` : 'Max-Age=0'}${req.secure ? '; Secure' : ''}`);
  };
  const need = (req, res, next) => (isIn(req) ? next() : res.status(401).json({ error: 'auth' }));
  const noIndex = (req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow'); res.set('Cache-Control', 'no-store'); next(); };

  // Проверка записи. Сумма — целое число > 0. Доход и расход — с категорией и кошельком,
  // перевод (move) — из кошелька в другой кошелёк. Валюта записи = валюта кошелька.
  function clean(b) {
    const c = conf(), errors = {};
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
  const COLOR = /^#[0-9a-f]{6}$/i;
  function cleanSetup(b) {
    const c = conf();
    const cats = (Array.isArray(b.cats) ? b.cats : []).slice(0, 60).map(x => ({
      id: c.cats.some(o => o.id === x.id) ? x.id : newId(), kind: x.kind === 'in' ? 'in' : 'out',
      name: str(x.name, 30), icon: str(x.icon, 4) || '•', color: COLOR.test(x.color) ? x.color : '#8e8e93',
      limit: x.kind === 'in' ? 0 : num(x.limit) })).filter(x => x.name); // лимит в месяц (сом), 0 — без лимита
    const wallets = (Array.isArray(b.wallets) ? b.wallets : []).slice(0, 20).map(x => ({
      id: c.wallets.some(o => o.id === x.id) ? x.id : newId(), name: str(x.name, 30), icon: str(x.icon, 4) || '•',
      color: COLOR.test(x.color) ? x.color : '#8e8e93', currency: CURRENCIES.includes(x.currency) ? x.currency : 'сом',
      start: Math.round(Number(String(x.start ?? 0).replace(/[\s,]/g, ''))) || 0 })).filter(x => x.name);
    return { cats, wallets };
  }
  const num = v => Math.max(0, Math.round(Number(String(v ?? 0).replace(/[\s,]/g, ''))) || 0);
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  // Повторяющиеся платежи, цели, долги — каждый список сохраняется целиком
  function cleanRecurring(list) {
    const c = conf();
    return (Array.isArray(list) ? list : []).slice(0, 50).map(x => {
      const old = c.recurring.find(o => o.id === x.id);
      return { id: old ? old.id : newId(), kind: x.kind === 'in' ? 'in' : 'out', catId: String(x.catId || ''), wallet: String(x.wallet || ''),
        amount: num(x.amount), day: Math.min(28, Math.max(1, parseInt(x.day) || 1)), note: str(x.note, 100), active: x.active !== false,
        from: old ? old.from : ymNow(), done: old ? old.done || [] : [] };
    }).filter(x => x.amount > 0 && c.cats.some(k => k.id === x.catId && k.kind === x.kind) && c.wallets.some(w => w.id === x.wallet));
  }
  function cleanGoals(list) {
    const c = conf();
    return (Array.isArray(list) ? list : []).slice(0, 20).map(x => ({
      id: c.goals.some(o => o.id === x.id) ? x.id : newId(), name: str(x.name, 30), icon: str(x.icon, 4) || '🎯',
      color: COLOR.test(x.color) ? x.color : '#ffc107', target: num(x.target), currency: CURRENCIES.includes(x.currency) ? x.currency : 'сом',
      until: DATE.test(x.until || '') ? x.until : '' })).filter(x => x.name && x.target > 0);
  }
  function cleanDebts(list) {
    const c = conf();
    return (Array.isArray(list) ? list : []).slice(0, 100).map(x => ({
      id: c.debts.some(o => o.id === x.id) ? x.id : newId(), who: str(x.who, 40), dir: x.dir === 'me' ? 'me' : 'they', // they — мне должны, me — я должен
      amount: num(x.amount), currency: CURRENCIES.includes(x.currency) ? x.currency : 'сом', due: DATE.test(x.due || '') ? x.due : '',
      note: str(x.note, 100), closed: x.closed === true, noWallet: x.noWallet === true, createdAt: (c.debts.find(o => o.id === x.id) || {}).createdAt || new Date().toISOString() }))
      .filter(x => x.who && x.amount > 0);
  }

  app.get('/money', noIndex, (req, res) => res.sendFile(require('path').join(__dirname, '..', 'views', 'money.html')));

  app.get('/api/money/me', noIndex, (req, res) => {
    conf();
    const c = conf();
    // Пароль ещё не задан — задать его может только владелец, который вошёл в кабинет
    res.json({ in: isIn(req), lockedMin: locked(req.ip), setup: !c.pin, canSetup: !c.pin && isOwner(req) });
  });
  app.post('/api/money/setpin', noIndex, (req, res) => {
    const c = conf();
    if (c.pin) return res.status(400).json({ error: 'Пароль уже задан' });
    if (!isOwner(req)) return res.status(403).json({ error: 'Сначала войдите в кабинет владельца' });
    const pin = String((req.body || {}).pin || '');
    if (!PIN_RE.test(pin)) return res.status(400).json({ error: 'Только цифры, от 2 до 12' });
    c.pin = auth.hashPassword(pin); save();
    setCookie(req, res, true);
    res.json({ ok: true });
  });
  app.post('/api/money/login', noIndex, (req, res) => {
    const c = conf();
    const wait = locked(req.ip);
    if (wait) return res.status(429).json({ error: `Слишком много попыток. Попробуйте через ${wait} мин.` });
    const pin = String((req.body || {}).pin || '');
    if (!c.pin) return res.status(400).json({ error: 'Пароль ещё не задан' });
    if (!auth.checkPassword(c.pin, pin)) {
      failed(req.ip);
      c.badTries = (c.badTries || 0) + 1; save();
      return res.status(401).json({ error: 'Неверный пароль' });
    }
    const bad = c.badTries || 0;
    c.badTries = 0; c.lastLogin = new Date().toISOString(); save();
    setCookie(req, res, true);
    res.json({ ok: true, badTries: bad });
  });
  app.post('/api/money/logout', noIndex, (req, res) => { setCookie(req, res, false); res.json({ ok: true }); });

  const all = () => { applyRecurring(); const c = conf();
    return { entries: c.entries, cats: c.cats, wallets: c.wallets, recurring: c.recurring, goals: c.goals, debts: c.debts, rate: c.rate || 0 }; };
  app.get('/api/money', noIndex, need, (req, res) => res.json(all()));
  // Повторяющиеся платежи, цели, долги, курс доллара — что прислано, то и заменяется
  app.put('/api/money/lists', noIndex, need, (req, res) => {
    const c = conf(), b = req.body || {};
    if ('goals' in b) {
      const goals = cleanGoals(b.goals);
      const gone = c.goals.find(g => !goals.some(x => x.id === g.id) && c.entries.some(e => e.goalId === g.id));
      if (gone) return res.status(400).json({ error: `На цель «${gone.name}» уже отложены деньги — сначала удалите эти записи в «Истории»` });
      const cur = goals.find(g => { const o = c.goals.find(x => x.id === g.id); return o && o.currency !== g.currency && c.entries.some(e => e.goalId === g.id); });
      if (cur) return res.status(400).json({ error: `У цели «${cur.name}» уже есть пополнения — валюту поменять нельзя` });
      c.goals = goals;
    }
    if ('recurring' in b) c.recurring = cleanRecurring(b.recurring);
    if ('debts' in b) c.debts = cleanDebts(b.debts);
    if ('rate' in b) c.rate = Math.min(100000, Math.max(0, Number(String(b.rate).replace(',', '.')) || 0));
    save();
    res.json(all());
  });
  // Выгрузка для Excel: все записи (CSV, «;», с BOM — Excel открывает по колонкам)
  app.get('/api/money.csv', noIndex, need, (req, res) => {
    const c = conf();
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const kindName = { in: 'Доход', out: 'Расход', move: 'Перевод', goal: 'На цель', debt: 'Долг' };
    const wName = id => (c.wallets.find(w => w.id === id) || {}).name || '';
    const rows = [...c.entries].sort((a, b) => a.date.localeCompare(b.date)).map(e => [e.date.split('-').reverse().join('.'), kindName[e.kind] || e.kind,
      e.cat, wName(e.wallet) + (e.toWallet ? ' → ' + wName(e.toWallet) : ''), e.kind === 'out' || e.kind === 'goal' || (e.kind === 'debt' && e.flow === 'out') ? -e.amount : e.amount, e.currency, e.note || '']);
    const csv = '﻿' + [['Дата', 'Вид', 'Категория', 'Кошелёк', 'Сумма', 'Валюта', 'Заметка'], ...rows].map(r => r.map(q).join(';')).join('\r\n');
    res.set('Content-Disposition', `attachment; filename="uchet-${new Date().toISOString().slice(0, 10)}.csv"`).type('text/csv; charset=utf-8').send(csv);
  });
  // Сохранить категории и кошельки целиком. Кошелёк, в котором есть записи, удалить нельзя.
  app.put('/api/money/setup', noIndex, need, (req, res) => {
    const c = conf();
    const { cats, wallets } = cleanSetup(req.body || {});
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
  app.post('/api/money', noIndex, need, (req, res) => {
    const { data, errors } = clean(req.body || {});
    if (Object.keys(errors).length) return res.status(400).json({ errors });
    const e = { id: newId(), ...data, createdAt: new Date().toISOString() };
    conf().entries.push(e); save();
    res.json(e);
  });
  // Смена пароля: нужен старый. Новый — только цифры, от 2 до 12. После смены все другие входы закрываются.
  app.put('/api/money/pin', noIndex, need, (req, res) => {
    const c = conf();
    const b = req.body || {};
    if (!auth.checkPassword(c.pin, String(b.old || ''))) { failed(req.ip); return res.status(400).json({ errors: { old: 'Старый пароль неверный' } }); }
    const pin = String(b.pin || '');
    if (!PIN_RE.test(pin)) return res.status(400).json({ errors: { pin: 'Только цифры, от 2 до 12' } });
    c.pin = auth.hashPassword(pin); save();
    setCookie(req, res, true); // этот телефон остаётся в учёте
    res.json({ ok: true });
  });
  app.put('/api/money/:id', noIndex, need, (req, res) => {
    const e = conf().entries.find(x => x.id === req.params.id);
    if (!e) return res.status(404).json({ error: 'Запись не найдена' });
    const { data, errors } = clean(req.body || {});
    if (Object.keys(errors).length) return res.status(400).json({ errors });
    Object.assign(e, data, { updatedAt: new Date().toISOString() }); save();
    res.json(e);
  });
  app.delete('/api/money/:id', noIndex, need, (req, res) => {
    const c = conf();
    const before = c.entries.length;
    c.entries = c.entries.filter(x => x.id !== req.params.id);
    if (c.entries.length === before) return res.status(404).json({ error: 'Запись не найдена' });
    save(); res.json({ ok: true });
  });
}

module.exports = { mount };
