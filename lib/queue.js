// Очередь на продажу нового ЖК: клиенты записываются сами на сайте менеджера.
// Один клиент (по ИНН) — у одного менеджера; в записи может быть несколько квартир.
// Клиент находит и правит свою запись по ИНН + № ID-карты (по одному ФИО найти чужую запись нельзя).
// Фото паспорта не хранятся — только поля. Данные — в базе (data/db.json), в GitHub не попадают.

// Версия текста согласия: в записи хранится, на какой текст клиент согласился
const CONSENT_VER = '2026-11-02';
const CONSENT_TEXT = 'Я даю согласие на обработку моих персональных данных (ФИО, дата рождения, данные ID-карты, ИНН, адрес, телефоны, e-mail) '
  + 'для записи в очередь на покупку квартиры и связи со мной. Данные увидят мой менеджер и владелец сервиса kvartiry.asia; '
  + 'когда начнутся продажи, они будут переданы строительной компании для оформления покупки. Данные хранятся на сервере в Германии. '
  + 'Согласие можно отозвать в любой момент: «Проверить мою запись» → «Удалить мою запись».';

const ROOMS = [1, 2, 3, 4]; // 4 — «4 и больше»
const MAX_WANTS = 5;

const clean = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const digits = v => String(v ?? '').replace(/\D/g, '');
const normIdNo = v => String(v ?? '').toUpperCase().replace(/[\s-]/g, '').replace(/[АВЕКМНОРСТХ]/g, c => 'ABEKMHOPCTX'['АВЕКМНОРСТХ'.indexOf(c)]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date().toISOString().slice(0, 10);
const yearsAgo = n => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - n); return d.toISOString().slice(0, 10); };

// «дд.мм.гггг» тоже принимаем — так пишут с телефона
function normDate(v) {
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  const iso = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s;
  return DATE.test(iso) && !Number.isNaN(Date.parse(iso)) ? iso : '';
}

// Проверка и приведение полей. Возвращает { data, errors } — errors: { поле: 'текст ошибки' }
function validate(b, { partial = false } = {}) {
  const data = {}, errors = {};
  const need = (k, ok, msg) => { if (!ok) errors[k] = msg; };
  data.fio = clean(b.fio, 120);
  need('fio', data.fio.split(' ').length >= 2 && data.fio.length >= 5, 'Напишите фамилию и имя полностью, как в паспорте');
  data.birth = normDate(b.birth);
  need('birth', data.birth && data.birth <= yearsAgo(18) && data.birth >= yearsAgo(100), 'Дата рождения: дд.мм.гггг, клиенту должно быть 18 лет');
  data.idNo = normIdNo(b.idNo);
  need('idNo', /^[A-Z]{2}\d{6,8}$/.test(data.idNo), 'Номер ID-карты — две буквы и цифры, например ID1234567');
  data.inn = digits(b.inn);
  need('inn', /^[12]\d{13}$/.test(data.inn), 'ИНН — 14 цифр, начинается с 1 или 2');
  data.issuedBy = clean(b.issuedBy, 100);
  need('issuedBy', data.issuedBy.length >= 2, 'Кем выдан ID-карта, например «МКК 211031»');
  data.issueDate = normDate(b.issueDate);
  need('issueDate', data.issueDate && data.issueDate <= today() && data.issueDate > data.birth, 'Дата выдачи: дд.мм.гггг');
  data.address = clean(b.address, 200);
  need('address', data.address.length >= 5, 'Адрес прописки, как в паспорте');
  data.email = clean(b.email, 100).toLowerCase();
  need('email', !data.email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email), 'Проверьте e-mail');
  data.phone1 = digits(b.phone1);
  need('phone1', data.phone1.length >= 9 && data.phone1.length <= 15, 'Телефон: например 0700 123 456');
  data.phone2 = digits(b.phone2);
  need('phone2', !data.phone2 || (data.phone2.length >= 9 && data.phone2.length <= 15), 'Проверьте второй телефон');
  const wants = (Array.isArray(b.wants) ? b.wants : []).map(w => ({ rooms: parseInt(w && w.rooms) })).filter(w => ROOMS.includes(w.rooms));
  data.wants = wants.slice(0, MAX_WANTS);
  need('wants', data.wants.length > 0, 'Выберите хотя бы одну квартиру');
  if (partial) for (const k of Object.keys(data)) if (!(k in b)) { delete data[k]; delete errors[k]; }
  return { data, errors };
}

// Те же ИНН и № ID-карты — это владелец записи
const owns = (rec, inn, idNo) => rec && rec.inn === digits(inn) && rec.idNo === normIdNo(idNo);

// Что видит сам клиент (без служебных полей)
function forClient(rec) {
  const { realtorId, consentIp, note, movedFrom, ...rest } = rec;
  return rest;
}

// Защита от подбора номера ID-карты к чужому ИНН:
// к одному ИНН — не больше 5 неверных попыток за час; с одного IP — не больше 30 за 15 минут
// (у мобильных операторов один IP на многих абонентов, поэтому лимит по IP мягкий).
const tries = new Map(); // 'ip:…' | 'inn:…' → { n, reset }
const LIMITS = { ip: [30, 15 * 60000], inn: [5, 60 * 60000] };
const over = key => { const t = tries.get(key); return !!(t && t.reset > Date.now() && t.n >= LIMITS[key.split(':')[0]][0]); };
function tooMany(ip, inn) {
  return over('ip:' + ip) || (!!inn && over('inn:' + digits(inn)));
}
function failed(ip, inn) {
  for (const key of ['ip:' + ip, inn ? 'inn:' + digits(inn) : '']) {
    if (!key) continue;
    const t = tries.get(key);
    if (!t || t.reset < Date.now()) tries.set(key, { n: 1, reset: Date.now() + LIMITS[key.split(':')[0]][1] });
    else t.n++;
  }
  if (tries.size > 50000) tries.clear(); // память не растёт бесконечно
}

// Таблица для Excel (CSV с BOM, разделитель «;» — так Excel в русской раскладке открывает по колонкам)
const ROOM_WORD = n => (n >= 4 ? '4+' : String(n));
function toCsv(list, realtorName) {
  const fmt = d => (d ? d.split('-').reverse().join('.') : '');
  const head = ['№', 'Дата записи', 'Менеджер', 'ФИО', 'Дата рождения', '№ ID-карты', 'ИНН', 'Кем выдан', 'Дата выдачи',
    'Адрес', 'E-mail', 'Телефон 1', 'Телефон 2', 'Квартиры (комнат)', 'Заметка'];
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  // ИНН и телефоны — как текст, иначе Excel покажет «2,12E+13» и съест ноль в начале
  const asText = v => (v ? `="${v}"` : '');
  const rows = list.map((r, i) => [i + 1, fmt(r.createdAt.slice(0, 10)), realtorName(r.realtorId), r.fio, fmt(r.birth), r.idNo, asText(r.inn),
    r.issuedBy, fmt(r.issueDate), r.address, r.email, asText(r.phone1), asText(r.phone2), r.wants.map(w => ROOM_WORD(w.rooms)).join(', '), r.note || '']);
  return '﻿' + [head, ...rows].map(row => row.map(q).join(';')).join('\r\n');
}

module.exports = { CONSENT_VER, CONSENT_TEXT, ROOMS, MAX_WANTS, validate, owns, forClient, tooMany, failed, normIdNo, digits, toCsv };
