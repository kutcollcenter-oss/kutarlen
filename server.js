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

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
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

const S = () => db.data.settings;
const base = req => `${req.protocol}://${req.get('host')}`;
// Статусов нет: на сайте все квартиры с заполненной ценой; проданную квартиру удаляют
const isVisible = isListed;
const findApt = id => db.data.apartments.find(a => a.id === id);

function similarTo(a, req, limit = 4) {
  const ref = a ? publicApt(a, S(), '') : null;
  return db.data.apartments
    .filter(x => isVisible(x) && (!a || (x.id !== a.id && typeOf(x) === typeOf(a))))
    .map(x => publicApt(x, S(), base(req)))
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

function removePhotoFiles(name) {
  const used = db.data.apartments.some(a => (a.photos || []).includes(name));
  if (used) return; // фото ещё используется в дубликате
  for (const f of [`${name}.webp`, `${name}-t.webp`, `${name}-og.jpg`]) {
    fs.unlink(path.join(UPLOAD_DIR, f), () => {});
  }
}

// ---------- Авторизация ----------
function sign(exp) {
  return crypto.createHmac('sha256', db.data.secret + ADMIN_PASSWORD).update(String(exp)).digest('hex');
}
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(p => p[0]));
}
function isAdmin(req) {
  const token = cookies(req).adm;
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
function auth(req, res, next) {
  if (isAdmin(req)) return next();
  res.status(401).json({ error: 'auth' });
}

// ---------- Публичные страницы ----------
app.get('/', (req, res) => {
  const list = db.data.apartments.filter(isVisible).map(a => publicApt(a, S(), base(req)));
  res.send(pages.renderIndex(S(), list, base(req)));
});

app.get('/kvartira/:id', (req, res) => {
  const a = findApt(req.params.id);
  if (!a || !isVisible(a)) {
    return res.status(404).send(pages.renderGone(S(), similarTo(null, req), base(req), 'продана'));
  }
  res.send(pages.renderApartment(publicApt(a, S(), base(req)), S(), similarTo(a, req), base(req)));
});

app.get('/privacy', (req, res) => res.send(pages.renderPrivacy(S(), base(req))));

app.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nSitemap: ${base(req)}/sitemap.xml\n`));
app.get('/sitemap.xml', (req, res) => {
  const urls = ['/', ...db.data.apartments.filter(isVisible).map(a => `/kvartira/${a.id}`)];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `<url><loc>${base(req)}${u}</loc></url>`).join('')}</urlset>`);
});

// Учёт нажатий WhatsApp (+ уведомление в Telegram, если настроено)
app.post('/api/track', express.text({ type: '*/*' }), (req, res) => {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const type = String(body.type || 'unknown').slice(0, 30);
  const id = body.id ? String(body.id).slice(0, 40) : null;
  db.data.events.push({ t: new Date().toISOString(), type, id });
  if (db.data.events.length > 20000) db.data.events.splice(0, db.data.events.length - 20000);
  db.save();
  notifyTelegram(type, id, req).catch(() => {});
  res.status(204).end();
});

async function notifyTelegram(type, id, req) {
  const { tgToken, tgChat } = S();
  if (!tgToken || !tgChat) return;
  const a = id && findApt(id);
  let text = `🟢 Нажатие WhatsApp (${type})`;
  if (a) {
    const p = publicApt(a, S(), base(req));
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

// ---------- Админка: API ----------
let loginFails = 0;
app.post('/api/admin/login', async (req, res) => {
  if (loginFails > 5) await new Promise(r => setTimeout(r, 2000));
  const ok = typeof req.body.password === 'string' && req.body.password.length === ADMIN_PASSWORD.length &&
    crypto.timingSafeEqual(Buffer.from(req.body.password), Buffer.from(ADMIN_PASSWORD));
  if (!ok) { loginFails++; return res.status(401).json({ error: 'Неверный пароль' }); }
  loginFails = 0;
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `adm=${exp}.${sign(exp)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`);
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'adm=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/admin/me', auth, (req, res) => res.json({ ok: true }));

const adminApt = a => ({ ...a, computed: publicApt(a, S(), '') });

app.get('/api/admin/apartments', auth, (req, res) => {
  const list = [...db.data.apartments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(list.map(adminApt));
});

const FIELDS = {
  type: v => (v === 'cash' || v === 'resale' ? 'cash' : 'installment'),
  title: v => String(v || '').trim().slice(0, 120),
  rooms: v => Math.max(0, Math.min(10, parseInt(v) || 0)),
  area: v => Math.max(0, Number(v) || 0),
  pricePerM2: v => Math.max(0, Number(v) || 0), // новостройка, сом за м²
  down: v => Math.max(0, Number(v) || 0),       // новостройка, минимальный взнос
  months: v => Math.max(0, Math.min(240, parseInt(v) || 0)), // рассрочка, срок
  cashDiscount: v => Math.max(0, Number(v) || 0),            // рассрочка: скидка за наличные, сом за м²
  price: v => Math.max(0, Number(v) || 0),      // вторичка, цена в $
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

app.post('/api/admin/photos', auth, upload.array('photos', 30), async (req, res) => {
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

app.post('/api/admin/apartments', auth, async (req, res) => {
  const a = {
    id: db.newId(), type: 'installment', title: '', rooms: 1, area: 0, pricePerM2: 0, down: 0, months: 0, price: 0,
    floorFrom: 1, floors: 0, address: '', details: '', tags: [], photos: cleanPhotos(req.body.photos) || [],
    createdAt: new Date().toISOString(), ...pick(req.body || {}),
  };
  await applyMap(a, req.body || {});
  db.data.apartments.push(a);
  db.save();
  res.json(adminApt(a));
});

app.put('/api/admin/apartments/:id', auth, async (req, res) => {
  const a = findApt(req.params.id);
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
  res.json(adminApt(a));
});

app.post('/api/admin/apartments/:id/duplicate', auth, (req, res) => {
  const a = findApt(req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  const copy = { ...a, id: db.newId(), photos: [...a.photos], tags: [...a.tags], createdAt: new Date().toISOString() };
  db.data.apartments.push(copy);
  db.save();
  res.json(adminApt(copy));
});

app.delete('/api/admin/apartments/:id', auth, (req, res) => {
  const i = db.data.apartments.findIndex(a => a.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'not found' });
  const [a] = db.data.apartments.splice(i, 1);
  db.save();
  (a.photos || []).forEach(removePhotoFiles);
  res.json({ ok: true });
});

const SETTINGS_KEYS = ['name', 'role', 'tagline', 'about', 'stats', 'whatsapp', 'instagram', 'officeAddress', 'officeLink',
  'currencyInstallment', 'currencyCash', 'heroKicker', 'heroPoints', 'ctaTitle', 'ctaText', 'steps', 'documents', 'reviews', 'faq', 'privacy',
  'gaId', 'ymId', 'pixelId', 'tgToken', 'tgChat'];

app.get('/api/admin/settings', auth, (req, res) => res.json(S()));

app.put('/api/admin/settings', auth, (req, res) => {
  for (const k of SETTINGS_KEYS) {
    if (!(k in req.body)) continue;
    S()[k] = String(req.body[k] ?? '').slice(0, 10000);
  }
  db.save();
  res.json(S());
});

app.post('/api/admin/settings/photo', auth, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Нет файла' });
  const name = await savePhoto(req.file.buffer);
  S().photo = `/uploads/${name}.webp`;
  db.save();
  res.json(S());
});

app.get('/api/admin/stats', auth, (req, res) => {
  const since = Date.now() - 30 * 864e5;
  const ev = db.data.events;
  const last30 = ev.filter(e => Date.parse(e.t) >= since);
  const byApt = {};
  last30.filter(e => e.id).forEach(e => { byApt[e.id] = (byApt[e.id] || 0) + 1; });
  const byType = {};
  last30.forEach(e => { byType[e.type] = (byType[e.type] || 0) + 1; });
  const top = Object.entries(byApt).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => {
    const a = findApt(id);
    return { id, n, label: a ? `${a.title} · ${roomsLabel(a.rooms)}, ${a.area} м²` : 'удалена' };
  });
  const counts = Object.fromEntries(Object.keys(TYPES).map(t => [t, db.data.apartments.filter(a => isVisible(a) && typeOf(a) === t).length]));
  res.json({ total: ev.length, last30: last30.length, byType, top, counts });
});

// ---------- Статика ----------
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

app.use((req, res) => res.status(404).send(pages.renderGone(S(), similarTo(null, req), base(req), 'не найдена')));

(async () => {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!db.exists()) await seed();
  db.load();
  db.scheduleBackups();
  app.listen(PORT, () => {
    console.log(`Сайт:    http://localhost:${PORT}`);
    console.log(`Админка: http://localhost:${PORT}/admin`);
    if (!process.env.ADMIN_PASSWORD) console.log('ВНИМАНИЕ: задайте пароль админки через переменную ADMIN_PASSWORD');
  });
})();
