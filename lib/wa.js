// Номера клиентов из WhatsApp: Meta (WhatsApp Cloud API) присылает сюда каждое входящее сообщение.
// Номер клиента, имя из профиля и первое сообщение попадают в «Аналитику» того менеджера, на чей номер написали.
// Настраивает владелец в кабинете: адрес и проверочный код для Meta берёт отсюда, «секрет приложения» вводит сам.
// Подпись каждого запроса проверяется секретом приложения — подделать заявку нельзя.
const crypto = require('crypto');

const KEEP_DAYS = 365;   // заявки старше года удаляются
const MAX_LEADS = 20000; // общий предел, чтобы база не разрасталась
const digits = v => String(v || '').replace(/\D/g, '');
// Номера сравниваются по последним 9 цифрам: «+996 555 12-34-56», «0555123456» и «996555123456» — один номер
const same = (a, b) => { const x = digits(a), y = digits(b); return x.length >= 9 && y.length >= 9 && x.slice(-9) === y.slice(-9); };

function mount(app, { D, save, newId, requireAuth, ownerOnly }) {
  const conf = () => {
    const d = D();
    if (!d.waConf) d.waConf = {};
    if (!d.waConf.verifyToken) { d.waConf.verifyToken = crypto.randomBytes(18).toString('base64url'); save(); }
    return d.waConf;
  };
  const leads = () => { const d = D(); if (!Array.isArray(d.waLeads)) d.waLeads = []; return d.waLeads; };
  const noStore = (req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('X-Robots-Tag', 'noindex, nofollow'); next(); };

  // Meta проверяет адрес один раз при подключении: отвечаем её числом, если код совпал
  app.get('/api/wa/webhook', (req, res) => {
    const c = conf(), q = req.query;
    if (q['hub.mode'] === 'subscribe' && typeof q['hub.verify_token'] === 'string' && q['hub.verify_token'] === c.verifyToken) {
      return res.type('text').send(String(q['hub.challenge'] || ''));
    }
    res.sendStatus(403);
  });

  // Входящие сообщения. Тело в req.rawBody сохраняет общий express.json (нужно для проверки подписи).
  app.post('/api/wa/webhook', (req, res) => {
    const c = conf();
    if (!c.appSecret) return res.sendStatus(503);
    const sig = String(req.get('x-hub-signature-256') || '');
    const mine = 'sha256=' + crypto.createHmac('sha256', c.appSecret).update(req.rawBody || '').digest('hex');
    if (sig.length !== mine.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(mine))) return res.sendStatus(401);
    res.sendStatus(200); // Meta ждёт быстрый ответ; дальше разбираем у себя
    try { take(req.body || {}); } catch (e) { console.warn('WhatsApp: не разобрал сообщение:', e.message); }
  });

  function take(body) {
    const d = D(), c = conf(), list = leads();
    let changed = false;
    for (const entry of body.entry || []) for (const ch of entry.changes || []) {
      const v = ch.value || {};
      if (ch.field !== 'messages' || !Array.isArray(v.messages)) continue;
      const to = (v.metadata || {}).display_phone_number;
      const r = d.realtors.find(x => x.settings && same(x.settings.whatsapp, to));
      c.lastAt = new Date().toISOString(); changed = true;
      if (!r) { c.lastUnmatched = digits(to).slice(0, 20); continue; }
      const names = Object.fromEntries((v.contacts || []).map(k => [k.wa_id, (k.profile || {}).name]));
      for (const m of v.messages) {
        const phone = digits(m.from).slice(0, 20);
        if (!phone) continue;
        const at = m.timestamp ? new Date(+m.timestamp * 1000).toISOString() : new Date().toISOString();
        const text = m.type === 'text' ? String((m.text || {}).body || '') : m.type === 'button' ? String((m.button || {}).text || '') : '';
        let l = list.find(x => x.r === r.id && x.phone === phone);
        if (!l) {
          // Сообщение с сайта содержит ссылку на квартиру (…/kvartira/<id>) — по ней узнаём, какая квартира
          const id = (text.match(/\/kvartira\/([\w-]{1,40})/) || [])[1];
          const apt = id && d.apartments.find(a => a.id === id && a.realtorId === r.id);
          l = { id: newId(), r: r.id, phone, name: '', text: text.slice(0, 300), apt: apt ? apt.id : null, firstAt: at, lastAt: at, n: 0 };
          list.push(l);
        }
        l.n++;
        if (at > l.lastAt) l.lastAt = at;
        const nm = names[m.from];
        if (nm) l.name = String(nm).slice(0, 60);
      }
    }
    if (changed) { prune(); save(); }
  }

  function prune() {
    const d = D(), old = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString();
    let list = leads().filter(l => l.lastAt >= old);
    if (list.length > MAX_LEADS) list = list.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1)).slice(0, MAX_LEADS);
    d.waLeads = list;
  }

  // Чьи заявки смотреть: менеджер — свои; владелец — свои, конкретного менеджера или всех (realtor=all)
  const ridOf = req => (req.user.role === 'owner' && req.query.realtor ? (req.query.realtor === 'all' ? null : String(req.query.realtor)) : req.realtor.id);

  app.get('/api/admin/wa-leads', noStore, requireAuth, (req, res) => {
    const days = [7, 30, 90].includes(+req.query.days) ? +req.query.days : 30;
    const from = new Date(Date.now() - days * 864e5).toISOString(), rid = ridOf(req), d = D();
    const apt = id => { const a = id && d.apartments.find(x => x.id === id); return a ? (a.title || '') : ''; };
    const who = id => { const r = d.realtors.find(x => x.id === id); return r ? ((r.settings && r.settings.name) || r.slug) : ''; };
    const list = leads().filter(l => (rid ? l.r === rid : true) && l.firstAt >= from)
      .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
      .map(l => ({ id: l.id, phone: l.phone, name: l.name, text: l.text, apt: l.apt, aptTitle: apt(l.apt), firstAt: l.firstAt, lastAt: l.lastAt, n: l.n, who: rid ? '' : who(l.r) }));
    res.json({ on: !!conf().appSecret, list });
  });

  app.delete('/api/admin/wa-leads/:id', noStore, requireAuth, (req, res) => {
    const d = D(), l = leads().find(x => x.id === req.params.id);
    if (!l || (req.user.role !== 'owner' && l.r !== req.realtor.id)) return res.status(404).json({ error: 'Заявка не найдена' });
    d.waLeads = leads().filter(x => x !== l); save();
    res.json({ ok: true });
  });

  // Владелец: настройка подключения
  const state = req => {
    const c = conf();
    return { webhook: `${req.protocol}://${req.get('host')}/api/wa/webhook`, verifyToken: c.verifyToken, hasSecret: !!c.appSecret, lastAt: c.lastAt || null, lastUnmatched: c.lastUnmatched || null };
  };
  app.get('/api/owner/wa', noStore, requireAuth, ownerOnly, (req, res) => res.json(state(req)));
  app.put('/api/owner/wa', noStore, requireAuth, ownerOnly, (req, res) => {
    const c = conf(), s = (req.body || {}).appSecret;
    if (s === null) delete c.appSecret;
    else {
      const v = String(s || '').trim();
      if (!/^[a-f0-9]{32}$/i.test(v)) return res.status(400).json({ error: 'Секрет приложения — 32 знака (цифры и буквы a–f). Скопируйте его в Meta: Настройки приложения → Основное → Секрет приложения.' });
      c.appSecret = v;
    }
    save();
    res.json(state(req));
  });
}

module.exports = { mount };
