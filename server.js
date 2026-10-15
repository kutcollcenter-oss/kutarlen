// Сайт-продукт для риелторов: у каждого риелтора свой кабинет, свои квартиры и своя ссылка.
// Владелец (role: owner) создаёт риелторам доступы, продлевает оплату и видит общую статистику.
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const db = require('./lib/db');
const seed = require('./lib/seed');
const { publicApt, roomsLabel, money, isListed, typeOf, TYPES } = require('./lib/calc');
const { resolveMap } = require('./lib/maps');
const pages = require('./lib/pages');
const auth = require('./lib/auth');
const tenants = require('./lib/tenants');
const analytics = require('./lib/analytics');

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const SESSION_DAYS = 30;

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 30 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

// ---------- Данные ----------
const D = () => db.data;
const base = req => `${req.protocol}://${req.get('host')}`;
const realtorById = id => D().realtors.find(r => r.id === id);
const realtorBySlug = slug => D().realtors.find(r => r.slug === slug);
const userOf = r => D().users.find(u => u.realtorId === r.id);
// Владелец сервиса себе не платит: его сайт работает всегда, без срока и лимита
const isOwnerRealtor = r => D().users.some(u => u.role === 'owner' && u.realtorId === r.id);
const statusOf = r => (isOwnerRealtor(r) ? { active: true, code: 'unlimited', label: 'Владелец — без ограничений' } : tenants.status(r));
const slugTaken = (slug, except) => D().realtors.some(r => r !== except && (r.slug === slug || (r.oldSlugs || []).includes(slug)));
const aptsOf = rid => D().apartments.filter(a => a.realtorId === rid);
const findApt = (rid, id) => D().apartments.find(a => a.id === id && a.realtorId === rid);
const isVisible = isListed; // статусов нет: на сайте все квартиры с ценой; проданную удаляют
const siteUrl = (req, r) => `${base(req)}/${r.slug}`;
const ctxOf = (r, req) => ({ s: r.settings, base: base(req), prefix: `/${r.slug}`, slug: r.slug });
const pub = (r, a, req) => publicApt(a, r.settings, base(req), `/${r.slug}`);
const aptLabel = a => `${a.title ? a.title + ' · ' : ''}${roomsLabel(a.rooms)}, ${a.area} м²`;

function similarTo(r, a, req, limit = 4) {
  const ref = a ? pub(r, a, req) : null;
  return aptsOf(r.id)
    .filter(x => isVisible(x) && (!a || (x.id !== a.id && typeOf(x) === typeOf(a))))
    .map(x => pub(r, x, req))
    .sort((x, y) => {
      if (!ref) return 0;
      const sx = Math.abs(x.rooms - ref.rooms) * 2 + Math.abs(x.price - ref.price) / (ref.price || 1);
      const sy = Math.abs(y.rooms - ref.rooms) * 2 + Math.abs(y.price - ref.price) / (ref.price || 1);
      return sx - sy;
    })
    .slice(0, limit);
}

// ---------- Фото ----------
async function savePhoto(buffer) {
  const name = crypto.randomBytes(8).toString('hex');
  const img = sharp(buffer, { failOn: 'none' }).rotate();
  await img.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 }).toFile(path.join(UPLOAD_DIR, `${name}.webp`));
  await img.clone().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 72 }).toFile(path.join(UPLOAD_DIR, `${name}-t.webp`));
  await img.clone().resize({ width: 1200, height: 630, fit: 'cover' })
    .jpeg({ quality: 78, mozjpeg: true }).toFile(path.join(UPLOAD_DIR, `${name}-og.jpg`));
  return name;
}

// Логотип: сохраняем прозрачность, без обрезки
async function saveLogo(buffer) {
  const name = crypto.randomBytes(8).toString('hex');
  await sharp(buffer, { failOn: 'none' }).rotate().trim({ threshold: 10 })
    .resize({ height: 200, width: 600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(UPLOAD_DIR, `${name}.webp`));
  return `/uploads/${name}.webp`;
}

function removePhotoFiles(name) {
  const used = D().apartments.some(a => (a.photos || []).includes(name));
  if (used) return; // фото ещё используется в дубликате
  for (const f of [`${name}.webp`, `${name}-t.webp`, `${name}-og.jpg`]) {
    fs.unlink(path.join(UPLOAD_DIR, f), () => {});
  }
}

// ---------- Сессии ----------
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(p => p[0]));
}
function requireAuth(req, res, next) {
  const user = auth.readToken(D().secret, cookies(req).sess, id => D().users.find(u => u.id === id));
  const realtor = user && realtorById(user.realtorId);
  if (!user || !realtor) return res.status(401).json({ error: 'auth' });
  req.user = user;
  req.realtor = realtor;
  next();
}
function ownerOnly(req, res, next) {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  next();
}
function setSession(req, res, user) {
  const secure = req.secure ? '; Secure' : '';
  const token = user ? auth.makeToken(D().secret, user, SESSION_DAYS) : '';
  res.setHeader('Set-Cookie', `sess=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${user ? SESSION_DAYS * 86400 : 0}${secure}`);
}

// Простая защита от перебора: задержка после неудачных попыток с одного IP
const fails = new Map();
const failDelay = ip => Math.min(((fails.get(ip) || {}).n || 0) * 700, 5000);

// ---------- Статика (раньше страниц риелторов, чтобы /admin не принимался за ссылку) ----------
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
// Страница кабинета: к файлам скрипта и стилей добавляется версия, чтобы после обновления не открывалась старая копия из кэша
const ADMIN_DIR = path.join(__dirname, 'admin');
app.get(['/admin/', '/admin/index.html'], (req, res) => {
  const v = f => Math.round(fs.statSync(path.join(ADMIN_DIR, f)).mtimeMs).toString(36);
  const html = fs.readFileSync(path.join(ADMIN_DIR, 'index.html'), 'utf8')
    .replace('/admin/admin.css', `/admin/admin.css?v=${v('admin.css')}`)
    .replace('/admin/admin.js', `/admin/admin.js?v=${v('admin.js')}`);
  res.set('Cache-Control', 'no-cache').type('html').send(html);
});
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

// ---------- Публичная часть ----------
// Главная домена: страница продукта (или сайт выбранного риелтора — настраивается владельцем)
app.get('/', (req, res) => {
  const root = realtorById(D().product.rootRealtorId);
  if (root && statusOf(root).active) return res.redirect(302, `/${root.slug}`);
  // Пример для страницы продукта — сайт владельца: ссылка, фото, имя и одна квартира в рассрочку
  const owner = realtorById((D().users.find(u => u.role === 'owner') || {}).realtorId);
  const demo = {};
  if (owner && statusOf(owner).active) {
    const list = aptsOf(owner.id).filter(isVisible).map(a => pub(owner, a, req));
    if (list.length) demo.url = `/${owner.slug}`;
    demo.name = owner.settings.name;
    demo.photo = owner.settings.photo;
    const a = list.find(x => x.installment && x.photos.length) || list.find(x => x.installment);
    if (a) demo.apt = { thumb: a.photos[0] && a.photos[0].thumb, title: `${a.roomsLabel}, ${a.area} м²`, monthly: a.monthly, currency: a.currency };
  }
  res.send(pages.renderLanding(D().product, base(req), demo));
});

// Старые ссылки вида /kvartira/<id> (до кабинетов) ведут на сайт риелтора этой квартиры
app.get('/kvartira/:id', (req, res) => {
  const a = D().apartments.find(x => x.id === req.params.id);
  const r = a && realtorById(a.realtorId);
  if (!r) return res.status(404).send(pages.renderInvalid(D().product, base(req)));
  res.redirect(301, `/${r.slug}/kvartira/${a.id}`);
});
app.get('/privacy', (req, res) => res.redirect(302, '/'));
app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /admin\nDisallow: /api/\n'));

// Сайт риелтора. Неизвестная ссылка → «Ссылка недействительна»; не оплачен → «временно недоступен».
// Адрес, который риелтору поменяли (или старый, с кодом), переадресуется на новый — отправленные ссылки не ломаются.
function siteOf(req, res) {
  const slug = req.params.slug;
  const go = to => { res.redirect(301, req.originalUrl.replace(`/${slug}`, `/${to}`)); return null; };
  if (slug !== slug.toLowerCase()) return go(slug.toLowerCase());
  const r = tenants.SLUG_RE.test(slug) && realtorBySlug(slug);
  if (!r) {
    const moved = D().realtors.find(x => (x.oldSlugs || []).includes(slug));
    if (moved) return go(moved.slug);
    res.status(404).send(pages.renderInvalid(D().product, base(req)));
    return null;
  }
  if (!statusOf(r).active) { res.status(503).set('Retry-After', '86400').send(pages.renderUnavailable(ctxOf(r, req))); return null; }
  return r;
}

app.get('/:slug', (req, res, next) => {
  if (req.params.slug.includes('.')) return next(); // файлы (favicon.ico и т.п.) — дальше, к статике
  const r = siteOf(req, res); if (!r) return;
  const list = aptsOf(r.id).filter(isVisible).map(a => pub(r, a, req));
  res.send(pages.renderIndex(ctxOf(r, req), list));
});

app.get('/:slug/kvartira/:id', (req, res) => {
  const r = siteOf(req, res); if (!r) return;
  const a = findApt(r.id, req.params.id);
  if (!a || !isVisible(a)) return res.status(404).send(pages.renderGone(ctxOf(r, req), similarTo(r, null, req)));
  res.send(pages.renderApartment(ctxOf(r, req), pub(r, a, req), similarTo(r, a, req)));
});

// /имя/admin — вход в кабинет этого риелтора (логин подставляется сам)
app.get('/:slug/admin', (req, res) => {
  const slug = req.params.slug.toLowerCase();
  const r = realtorBySlug(slug) || D().realtors.find(x => (x.oldSlugs || []).includes(slug));
  const u = r && userOf(r);
  res.redirect(302, u ? `/admin/?u=${encodeURIComponent(u.login)}` : '/admin/');
});

app.get('/:slug/privacy', (req, res) => {
  const r = siteOf(req, res); if (!r) return;
  res.send(pages.renderPrivacy(ctxOf(r, req)));
});

// ---------- Аналитика: приём событий с сайта ----------
const EVENTS = new Set(['view', 'filter', 'calc', 'cash', 'wa']);
const PAGES = new Set(['home', 'apt', 'gone', 'privacy']);
const rate = new Map(); // ip → { n, reset }
const clip = (v, n) => (v == null ? null : String(v).slice(0, n));

app.post('/api/track', express.text({ type: '*/*' }), (req, res) => {
  res.status(204).end();
  const now = Date.now();
  const q = rate.get(req.ip) || { n: 0, reset: now + 60e3 };
  if (now > q.reset) { q.n = 0; q.reset = now + 60e3; }
  if (++q.n > 120) return; // больше 120 событий в минуту с одного IP — не записываем
  rate.set(req.ip, q);

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { return; } }
  if (!b || !EVENTS.has(b.e)) return;
  const r = realtorBySlug(String(b.slug || ''));
  if (!r) return;
  const apt = b.a ? findApt(r.id, String(b.a)) : null;
  const ev = {
    t: new Date().toISOString(), r: r.id, e: b.e,
    p: PAGES.has(b.p) ? b.p : null,
    a: apt ? apt.id : null,
    pl: clip(b.pl, 30),
    v: /^[a-z0-9]{6,16}$/.test(b.v || '') ? b.v : null,
    s: /^[a-z0-9_-]{1,30}$/.test(b.s || '') ? b.s : 'direct',
    d: b.d === 'd' ? 'd' : 'm',
  };
  analytics.append(ev);
  if (ev.e === 'wa') notifyTelegram(r, apt, ev, req).catch(() => {});
});

async function notifyTelegram(r, a, ev, req) {
  const { tgToken, tgChat } = r.settings;
  if (!tgToken || !tgChat) return;
  let text = `🟢 Нажатие WhatsApp на сайте (${ev.pl || 'кнопка'})`;
  if (ev.s && ev.s !== 'direct') text += `\nИсточник: ${analytics.SOURCE_LABEL[ev.s] || ev.s}`;
  if (a) {
    const p = pub(r, a, req);
    const cur = p.currency;
    text += `\n${p.title} · ${p.roomsLabel}, ${p.area} м²\nЦена ${money(p.price, cur)}${p.installment ? `, мин. взнос ${money(p.down, cur)}, ${p.months} мес.` : p.type === 'cash' ? ', наличные' : ''}\n${base(req)}${p.url}`;
  }
  await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: tgChat, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(8000),
  });
}

// ---------- Кабинет: вход ----------
app.post('/api/admin/login', async (req, res) => {
  await new Promise(r => setTimeout(r, failDelay(req.ip)));
  const login = String(req.body.login || '').trim().toLowerCase();
  const user = D().users.find(u => u.login === login);
  if (!auth.checkPassword(user, req.body.password)) {
    const f = fails.get(req.ip) || { n: 0 };
    f.n++; fails.set(req.ip, f);
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  fails.delete(req.ip);
  setSession(req, res, user);
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => { setSession(req, res, null); res.json({ ok: true }); });

// Для страницы входа: название сервиса и WhatsApp владельца («открыть кабинет», «техподдержка»)
app.get('/api/public/product', (req, res) => {
  res.json({ name: D().product.name, whatsapp: D().product.whatsapp });
});

app.get('/api/admin/me', requireAuth, (req, res) => {
  const r = req.realtor;
  res.json({
    login: req.user.login,
    role: req.user.role,
    defaultPassword: !!req.user.defaultPassword,
    realtor: {
      id: r.id, slug: r.slug, url: siteUrl(req, r), name: r.settings.name,
      status: statusOf(r), plan: isOwnerRealtor(r) ? { paidUntil: '', maxApartments: 0 } : r.plan, count: aptsOf(r.id).length,
    },
    product: { name: D().product.name, whatsapp: D().product.whatsapp },
  });
});

app.post('/api/admin/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (!auth.checkPassword(req.user, current)) return res.status(400).json({ error: 'Текущий пароль неверный' });
  if (typeof next !== 'string' || next.length < 8) return res.status(400).json({ error: 'Новый пароль — минимум 8 символов' });
  Object.assign(req.user, auth.hashPassword(next), { defaultPassword: false });
  db.save();
  setSession(req, res, req.user); // старые сессии на других устройствах закрываются
  res.json({ ok: true });
});

// ---------- Кабинет: квартиры (только свои) ----------
const adminApt = (r, a, req) => ({ ...a, computed: pub(r, a, req) });

app.get('/api/admin/apartments', requireAuth, (req, res) => {
  const list = aptsOf(req.realtor.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(list.map(a => adminApt(req.realtor, a, req)));
});

const FIELDS = {
  type: v => (v === 'cash' || v === 'resale' ? 'cash' : 'installment'),
  title: v => String(v || '').trim().slice(0, 120),
  rooms: v => Math.max(0, Math.min(10, parseInt(v) || 0)),
  area: v => Math.max(0, Number(v) || 0),
  pricePerM2: v => Math.max(0, Number(v) || 0),              // рассрочка, сом за м²
  down: v => Math.max(0, Number(v) || 0),                    // рассрочка, минимальный взнос
  months: v => Math.max(0, Math.min(240, parseInt(v) || 0)), // рассрочка, срок
  cashDiscount: v => Math.max(0, Number(v) || 0),            // рассрочка: скидка за наличные, сом за м²
  price: v => Math.max(0, Number(v) || 0),                   // наличные, цена в $
  floorFrom: v => Math.max(0, parseInt(v) || 0),
  floors: v => Math.max(0, parseInt(v) || 0),
  address: v => String(v || '').trim().slice(0, 200),
  details: v => String(v || '').trim().slice(0, 5000),
  tags: v => (Array.isArray(v) ? v : String(v || '').split(',')).map(t => String(t).trim()).filter(Boolean).slice(0, 8),
};
function pick(body) {
  const out = {};
  for (const k of Object.keys(FIELDS)) if (k in body) out[k] = FIELDS[k](body[k]);
  return out;
}

// Фото загружаются до сохранения квартиры; принимаем только реально существующие файлы
const PHOTO_RE = /^[0-9a-f]{16}$/;
function cleanPhotos(list) {
  if (!Array.isArray(list)) return null;
  return [...new Set(list)].filter(p => PHOTO_RE.test(p) && fs.existsSync(path.join(UPLOAD_DIR, `${p}.webp`))).slice(0, 40);
}

// Лимит тарифа: maxApartments = 0 — без ограничения
function overLimit(r) {
  if (isOwnerRealtor(r)) return 0;
  const max = Number(r.plan && r.plan.maxApartments) || 0;
  return max && aptsOf(r.id).length >= max ? max : 0;
}
const limitError = max => ({ error: `Лимит тарифа — ${max} квартир. Удалите проданные или напишите владельцу сервиса, чтобы расширить тариф.` });

app.post('/api/admin/photos', requireAuth, upload.array('photos', 30), async (req, res) => {
  try {
    const names = [];
    for (const f of req.files || []) names.push(await savePhoto(f.buffer));
    res.json({ photos: names });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'Не удалось обработать фото' });
  }
});

// Ссылка на Google Карты: распознаём точку при сохранении (короткие ссылки раскрываются здесь, на сервере)
async function applyMap(a, body) {
  if (!('mapLink' in body)) return;
  const link = String(body.mapLink || '').trim().slice(0, 2000);
  if (!link) { delete a.map; return; }
  if (a.map && a.map.link === link && !a.map.error) return; // не изменилась
  a.map = await resolveMap(link);
}

app.post('/api/admin/apartments', requireAuth, async (req, res) => {
  const max = overLimit(req.realtor);
  if (max) return res.status(403).json(limitError(max));
  const a = {
    id: db.newId(), realtorId: req.realtor.id,
    type: 'installment', title: '', rooms: 1, area: 0, pricePerM2: 0, down: 0, months: 0, price: 0,
    floorFrom: 1, floors: 0, address: '', details: '', tags: [], photos: cleanPhotos(req.body.photos) || [],
    createdAt: new Date().toISOString(), ...pick(req.body || {}),
  };
  await applyMap(a, req.body || {});
  D().apartments.push(a);
  db.save();
  res.json(adminApt(req.realtor, a, req));
});

app.put('/api/admin/apartments/:id', requireAuth, async (req, res) => {
  const a = findApt(req.realtor.id, req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  Object.assign(a, pick(req.body || {}));
  await applyMap(a, req.body || {});
  const photos = cleanPhotos(req.body.photos);
  if (photos) {
    const removed = a.photos.filter(p => !photos.includes(p));
    a.photos = photos;
    removed.forEach(removePhotoFiles);
  }
  db.save();
  res.json(adminApt(req.realtor, a, req));
});

app.post('/api/admin/apartments/:id/duplicate', requireAuth, (req, res) => {
  const a = findApt(req.realtor.id, req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  const max = overLimit(req.realtor);
  if (max) return res.status(403).json(limitError(max));
  const copy = { ...a, id: db.newId(), photos: [...a.photos], tags: [...a.tags], createdAt: new Date().toISOString() };
  D().apartments.push(copy);
  db.save();
  res.json(adminApt(req.realtor, copy, req));
});

app.delete('/api/admin/apartments/:id', requireAuth, (req, res) => {
  const i = D().apartments.findIndex(a => a.id === req.params.id && a.realtorId === req.realtor.id);
  if (i < 0) return res.status(404).json({ error: 'not found' });
  const [a] = D().apartments.splice(i, 1);
  db.save();
  (a.photos || []).forEach(removePhotoFiles);
  res.json({ ok: true });
});

// ---------- Кабинет: настройки своего сайта ----------
const SETTINGS_KEYS = ['name', 'role', 'company', 'tagline', 'about', 'stats', 'whatsapp', 'instagram', 'officeAddress', 'officeLink',
  'currencyInstallment', 'currencyCash', 'heroKicker', 'heroPoints', 'ctaTitle', 'ctaText', 'steps', 'documents', 'reviews', 'faq', 'privacy',
  'gaId', 'ymId', 'pixelId', 'tgToken', 'tgChat'];

app.get('/api/admin/settings', requireAuth, (req, res) => res.json(req.realtor.settings));

app.put('/api/admin/settings', requireAuth, (req, res) => {
  const s = req.realtor.settings;
  for (const k of SETTINGS_KEYS) {
    if (!(k in req.body)) continue;
    s[k] = String(req.body[k] ?? '').slice(0, 10000);
  }
  db.save();
  res.json(s);
});

app.post('/api/admin/settings/photo', requireAuth, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Нет файла' });
  const name = await savePhoto(req.file.buffer);
  req.realtor.settings.photo = `/uploads/${name}.webp`;
  db.save();
  res.json(req.realtor.settings);
});

app.post('/api/admin/settings/logo', requireAuth, upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Нет файла' });
  try {
    req.realtor.settings.logo = await saveLogo(req.file.buffer);
    db.save();
    res.json(req.realtor.settings);
  } catch (e) {
    res.status(400).json({ error: 'Не удалось обработать логотип' });
  }
});

app.delete('/api/admin/settings/logo', requireAuth, (req, res) => {
  req.realtor.settings.logo = '';
  db.save();
  res.json(req.realtor.settings);
});

// ---------- Кабинет: подробная аналитика ----------
app.get('/api/admin/analytics', requireAuth, (req, res) => {
  const days = [7, 30, 90].includes(+req.query.days) ? +req.query.days : 30;
  let rid = req.realtor.id;
  // Владелец может смотреть аналитику любого риелтора или всех сразу
  if (req.user.role === 'owner' && req.query.realtor) rid = req.query.realtor === 'all' ? null : req.query.realtor;
  const label = id => { const a = D().apartments.find(x => x.id === id); return a && aptLabel(a); };
  res.json(analytics.report(rid, days, label));
});

// ---------- Владелец: риелторы и подписки ----------
const LOGIN_RE = /^[a-z0-9._-]{3,32}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function realtorRow(r, req, stats) {
  const u = userOf(r);
  const st = stats[r.id] || { visitors: 0, wa: 0, last: '' };
  return {
    id: r.id, name: r.settings.name, slug: r.slug, url: siteUrl(req, r), login: u ? u.login : '',
    role: u ? u.role : '', status: statusOf(r), plan: r.plan, blocked: !!r.blocked, note: r.note || '',
    createdAt: r.createdAt, apartments: aptsOf(r.id).length, visitors30: st.visitors, wa30: st.wa, lastActivity: st.last,
  };
}

app.get('/api/owner/realtors', requireAuth, ownerOnly, (req, res) => {
  const stats = analytics.summary(30);
  res.json(D().realtors.map(r => realtorRow(r, req, stats)).sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : b.createdAt.localeCompare(a.createdAt))));
});

app.post('/api/owner/realtors', requireAuth, ownerOnly, (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 80);
  const login = String(b.login || '').trim().toLowerCase();
  if (!name) return res.status(400).json({ error: 'Укажите имя риелтора' });
  if (!LOGIN_RE.test(login)) return res.status(400).json({ error: 'Логин: 3–32 символа, латиница, цифры, точка, дефис' });
  if (D().users.some(u => u.login === login)) return res.status(400).json({ error: 'Такой логин уже занят' });
  const password = b.password && String(b.password).length >= 8 ? String(b.password) : auth.generatePassword();
  const slug = b.slug ? String(b.slug).trim().toLowerCase() : tenants.makeSlug(name, slugTaken);
  const slugErr = b.slug ? tenants.slugError(slug) || (slugTaken(slug) ? 'Этот адрес уже занят другим риелтором' : '') : '';
  if (slugErr) return res.status(400).json({ error: slugErr });
  const r = {
    id: db.newId(), slug,
    settings: tenants.defaultSettings(name),
    plan: { paidUntil: DATE_RE.test(b.paidUntil || '') ? b.paidUntil : '', maxApartments: Math.max(0, parseInt(b.maxApartments) || 0) },
    blocked: false, note: String(b.note || '').slice(0, 300), createdAt: new Date().toISOString(),
  };
  if (b.whatsapp) r.settings.whatsapp = String(b.whatsapp).slice(0, 30);
  D().realtors.push(r);
  D().users.push({ id: db.newId(), login, role: 'realtor', realtorId: r.id, ...auth.hashPassword(password), createdAt: new Date().toISOString() });
  const copied = b.copyApartments === false ? 0 : copyOwnerApartments(req.realtor, r);
  db.save();
  res.json({ realtor: realtorRow(r, req, {}), password, copied }); // пароль показывается один раз
});

// Стартовый набор новому риелтору: копии квартир владельца в рассрочку (наличные не копируются).
// Копий не больше лимита тарифа. Фото общие — файлы не дублируются, удаление копии их не трогает.
function copyOwnerApartments(owner, r) {
  const max = Number(r.plan.maxApartments) || Infinity;
  const src = aptsOf(owner.id).filter(a => isVisible(a) && typeOf(a) === 'installment').slice(0, max);
  for (const a of src) {
    D().apartments.push({
      ...a, id: db.newId(), realtorId: r.id,
      photos: [...(a.photos || [])], tags: [...(a.tags || [])],
      ...(a.map ? { map: { ...a.map } } : {}),
    });
  }
  return src.length;
}

function ownedRealtor(req, res) {
  const r = realtorById(req.params.id);
  if (!r) { res.status(404).json({ error: 'not found' }); return null; }
  return r;
}

app.put('/api/owner/realtors/:id', requireAuth, ownerOnly, (req, res) => {
  const r = ownedRealtor(req, res); if (!r) return;
  const b = req.body || {};
  const isOwn = r.id === req.realtor.id;
  if ('paidUntil' in b) r.plan.paidUntil = DATE_RE.test(b.paidUntil || '') ? b.paidUntil : '';
  if ('maxApartments' in b) r.plan.maxApartments = Math.max(0, parseInt(b.maxApartments) || 0);
  if ('blocked' in b && !isOwn) r.blocked = !!b.blocked;
  if ('note' in b) r.note = String(b.note || '').slice(0, 300);
  if ('slug' in b) {
    const slug = String(b.slug || '').trim().toLowerCase();
    if (slug !== r.slug) {
      const err = tenants.slugError(slug) || (slugTaken(slug, r) ? 'Этот адрес уже занят другим риелтором' : '');
      if (err) return res.status(400).json({ error: err });
      // старый адрес запоминаем: ссылки, которые уже разосланы клиентам, будут вести на новый
      r.oldSlugs = [...new Set([...(r.oldSlugs || []), r.slug])].filter(x => x !== slug);
      r.slug = slug;
    }
  }
  if ('login' in b) {
    const login = String(b.login || '').trim().toLowerCase();
    const u = userOf(r);
    if (!LOGIN_RE.test(login)) return res.status(400).json({ error: 'Логин: 3–32 символа, латиница, цифры, точка, дефис' });
    if (D().users.some(x => x.login === login && x !== u)) return res.status(400).json({ error: 'Такой логин уже занят' });
    if (u) u.login = login;
  }
  db.save();
  res.json(realtorRow(r, req, analytics.summary(30)));
});

// Новый пароль: старые сессии риелтора сразу закрываются
app.post('/api/owner/realtors/:id/password', requireAuth, ownerOnly, (req, res) => {
  const r = ownedRealtor(req, res); if (!r) return;
  const u = userOf(r);
  if (!u) return res.status(404).json({ error: 'not found' });
  const password = auth.generatePassword();
  Object.assign(u, auth.hashPassword(password), { defaultPassword: false });
  db.save();
  res.json({ password });
});

app.delete('/api/owner/realtors/:id', requireAuth, ownerOnly, (req, res) => {
  const r = ownedRealtor(req, res); if (!r) return;
  if (r.id === req.realtor.id) return res.status(400).json({ error: 'Свой кабинет удалить нельзя' });
  const photos = aptsOf(r.id).flatMap(a => a.photos || []);
  D().apartments = D().apartments.filter(a => a.realtorId !== r.id);
  D().users = D().users.filter(u => u.realtorId !== r.id);
  D().realtors = D().realtors.filter(x => x.id !== r.id);
  if (D().product.rootRealtorId === r.id) D().product.rootRealtorId = '';
  db.save();
  photos.forEach(removePhotoFiles);
  res.json({ ok: true });
});

const PRODUCT_KEYS = ['name', 'tagline', 'whatsapp', 'priceText', 'rootRealtorId'];
app.get('/api/owner/product', requireAuth, ownerOnly, (req, res) => res.json(D().product));
app.put('/api/owner/product', requireAuth, ownerOnly, (req, res) => {
  for (const k of PRODUCT_KEYS) if (k in req.body) D().product[k] = String(req.body[k] ?? '').slice(0, 500);
  if (D().product.rootRealtorId && !realtorById(D().product.rootRealtorId)) D().product.rootRealtorId = '';
  db.save();
  res.json(D().product);
});

app.use((req, res) => res.status(404).send(pages.renderInvalid(D().product, base(req))));

(async () => {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!db.exists()) await seed();
  db.load();
  // База версии «один риелтор» → кабинеты (один раз, при первом запуске новой версии)
  const m = tenants.migrate(D(), db.newId, process.env.ADMIN_PASSWORD || 'admin');
  if (m.changed) {
    db.save();
    if (m.oldEvents.length) analytics.appendMany(m.oldEvents);
    console.log(`База перенесена в кабинеты. Ваш сайт: /${m.realtor.slug}. Вход в кабинет: логин admin`);
  }
  if (tenants.plainSlugs(D())) {
    db.save();
    console.log('Адреса сайтов переведены на простые имена: ' + D().realtors.map(r => '/' + r.slug).join(', '));
  }
  analytics.prune();
  db.scheduleBackups();
  app.listen(PORT, () => {
    const owner = D().users.find(u => u.role === 'owner');
    const own = owner && realtorById(owner.realtorId);
    console.log(`Сайт:    http://localhost:${PORT}${own ? '/' + own.slug : ''}`);
    console.log(`Кабинет: http://localhost:${PORT}/admin  (логин ${owner ? owner.login : 'admin'})`);
    if (owner && owner.defaultPassword) console.log('ВНИМАНИЕ: смените пароль владельца в кабинете (Профиль → Пароль)');
  });
})();
