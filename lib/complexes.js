// ЖК — одна запись на объект: название, город, район, адрес, ссылка на карту (D().complexes, ключ — zkKey названия).
// У квартир этого ЖК адрес, район, город и карта всегда такие же, как у ЖК (копируются при сохранении),
// поэтому сайт, карта и поиск работают как раньше, а разных адресов у одного ЖК больше не бывает.
// Новый ЖК создаёт менеджер (вписывает адрес и ссылку один раз); менять адрес существующего ЖК — владелец.
const { zkKey, clean } = require('./zk-prep');

const FIELDS = ['city', 'district', 'address'];
const top = arr => { const n = new Map(); arr.filter(Boolean).forEach(x => n.set(x, (n.get(x) || 0) + 1)); return ([...n.entries()].sort((a, b) => b[1] - a[1])[0] || [''])[0]; };
// Самый частый адрес; поровну — более полный («Улица Тимура Фрунзе, 100 блок 5», а не «Тимура Фрунзе 100»)
const topLong = arr => { const n = new Map(); arr.filter(Boolean).forEach(x => n.set(x, (n.get(x) || 0) + 1)); return ([...n.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0] || [''])[0]; };
const isLand = a => a.type === 'land';
// Этапы сдачи ЖК из текста: «II квартал 2028, II квартал 2030» → [{y:2028,q:2},{y:2030,q:2}] (каждая часть — отдельно)
const stagesOf = text => {
  const { handoverStages } = require('./calc');
  const seen = new Set(), out = [];
  String(text || '').split(/[,;]|sиs/).forEach(part => handoverStages(part).forEach(x => { const k = x.y * 10 + x.q; if (!seen.has(k)) { seen.add(k); out.push(x); } }));
  return out.sort((a, b) => a.y * 10 + a.q - (b.y * 10 + b.q));
};
const ROMAN = ['I', 'II', 'III', 'IV'];
const stageText = x => (x.q ? `${ROMAN[x.q - 1]} квартал ${x.y}` : String(x.y));

function mount({ D, save }) {
  const reg = () => { const d = D(); if (!d.complexes || typeof d.complexes !== 'object') d.complexes = {}; return d.complexes; };
  const keyOf = a => (isLand(a) ? '' : zkKey(a.title));
  const get = key => (key ? reg()[key] || null : null);

  // Квартира → как у её ЖК. Нет такого ЖК — это новый: создаём запись из полей квартиры.
  function apply(a, { create = true } = {}) {
    const key = keyOf(a);
    if (!key) return null;
    let c = get(key);
    if (!c) {
      if (!create) return null;
      c = reg()[key] = { name: clean(a.title), city: a.city || 'Бишкек', district: a.district || '', address: /^https?:/i.test(a.address || '') ? '' : (a.address || ''), map: a.map ? { ...a.map } : null,
        handover: String(a.handover || '').trim(), floors: Number(a.floors) || 0, details: String(a.details || '').trim(), detailsKy: String(a.detailsKy || '').trim(), createdBy: a.realtorId, createdAt: new Date().toISOString() };
    }
    a.title = c.name;
    for (const k of FIELDS) a[k] = c[k] || (k === 'city' ? 'Бишкек' : '');
    delete a.map2gis;
    if (c.map) a.map = { ...c.map }; else delete a.map;
    // Этажность и срок сдачи — у ЖК. Этапов несколько (2028 и 2030) — у квартиры свой этап из списка ЖК.
    if (c.floors) a.floors = c.floors;
    const st = stagesOf(c.handover);
    if (c.handover && st.length <= 1) a.handover = c.handover;
    return c;
  }

  // Один раз: собрать записи ЖК из уже внесённых квартир (самые частые название, город, район, адрес, карта)
  function buildOnce(log = () => {}) {
    const d = D();
    d.done = d.done || {};
    if (d.done.complexes) return false;
    const groups = new Map();
    for (const a of d.apartments) {
      const k = keyOf(a);
      if (!k) continue;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(a);
    }
    const r = reg();
    for (const [k, g] of groups) {
      if (r[k]) continue;
      const link = top(g.map(a => (a.map || a.map2gis || {}).link));
      const withMap = g.find(a => (a.map || a.map2gis || {}).link === link);
      const addrs = [...new Set(g.map(a => clean(a.address)).filter(x => x && !/^https?:/i.test(x)))];
      r[k] = {
        name: top(g.map(a => clean(a.title))), city: top(g.map(a => a.city || 'Бишкек')), district: top(g.map(a => a.district)),
        address: topLong(g.map(a => clean(a.address)).filter(x => !/^https?:/i.test(x))),
        map: withMap ? { ...(withMap.map || withMap.map2gis) } : null, createdAt: new Date().toISOString(),
      };
      if (addrs.length > 1) log(`«${r[k].name}»: было ${addrs.length} адреса (${addrs.join(' / ')}) → «${r[k].address}»`);
    }
    let changed = 0;
    for (const a of d.apartments) {
      const before = JSON.stringify([a.title, a.city, a.district, a.address, a.map]);
      if (apply(a, { create: false }) && JSON.stringify([a.title, a.city, a.district, a.address, a.map]) !== before) changed++;
    }
    d.done.complexes = new Date().toISOString();
    save();
    log(`записей ЖК: ${Object.keys(r).length}, квартир приведено к адресу своего ЖК: ${changed}`);
    return true;
  }

  // Владелец меняет ЖК: всё сразу у всех квартир этого ЖК (у всех менеджеров)
  function update(key, patch) {
    const c = get(key);
    if (!c) return null;
    for (const k of FIELDS) if (k in patch) c[k] = String(patch[k] || '').trim().slice(0, k === 'address' ? 200 : 60) || (k === 'city' ? 'Бишкек' : '');
    if ('map' in patch) c.map = patch.map;
    if (Array.isArray(patch.photos)) c.photos = patch.photos.slice(0, 30);
    if ('handover' in patch) c.handover = String(patch.handover || '').trim().slice(0, 120);
    if ('floors' in patch) c.floors = Math.max(0, Math.min(200, parseInt(patch.floors) || 0));
    if ('details' in patch) c.details = String(patch.details || '').trim().slice(0, 5000);
    if ('detailsKy' in patch) c.detailsKy = String(patch.detailsKy || '').trim().slice(0, 5000);
    c.updatedAt = new Date().toISOString();
    let n = 0;
    for (const a of D().apartments) if (keyOf(a) === key) { apply(a, { create: false }); n++; }
    save();
    return { complex: c, apartments: n };
  }

  // Новый ЖК из кабинета (раздел «Квартиры» → «+ ЖК»). Такой уже есть (другое написание) — возвращаем его.
  function create(name, fields, realtorId) {
    const key = zkKey(name);
    if (!key) return { error: 'Напишите название ЖК' };
    if (get(key)) return { key, exists: true };
    reg()[key] = {
      name: clean(name).slice(0, 120), city: fields.city || 'Бишкек', district: String(fields.district || '').trim().slice(0, 60),
      address: String(fields.address || '').trim().slice(0, 200), map: fields.map || null, photos: fields.photos || [],
      handover: String(fields.handover || '').trim().slice(0, 120), floors: Math.max(0, parseInt(fields.floors) || 0),
      details: String(fields.details || '').trim().slice(0, 5000), detailsKy: String(fields.detailsKy || '').trim().slice(0, 5000),
      createdBy: realtorId, createdAt: new Date().toISOString(),
    };
    save();
    return { key };
  }

  // Один раз: фото дома (фасад, вид сверху), которые лежали в квартирах, переезжают в их ЖК;
  // в квартирах остаются планировки и фото ремонта. Файлы фото не удаляются.
  function movePhotosOnce(kindOf, log = () => {}) {
    const d = D();
    d.done = d.done || {};
    if (d.done.zkPhotos) return false;
    const r = reg(), count = new Map();
    let moved = 0;
    for (const a of d.apartments) {
      const key = keyOf(a);
      if (!key || !r[key]) continue;
      const zk = (a.photos || []).filter(p => kindOf(p) === 'zk');
      if (!zk.length) continue;
      if (!count.has(key)) count.set(key, new Map());
      zk.forEach((p, i) => { const m = count.get(key); m.set(p, (m.get(p) || 0) + 100 - i); });
      a.photos = a.photos.filter(p => !zk.includes(p));
      moved += zk.length;
    }
    for (const [key, m] of count) {
      const c = r[key];
      const have = new Set(c.photos || []);
      c.photos = [...(c.photos || []), ...[...m.entries()].sort((x, y) => y[1] - x[1]).map(e => e[0]).filter(p => !have.has(p))].slice(0, 30);
      log(`«${c.name}»: фото дома — ${c.photos.length}`);
    }
    d.done.zkPhotos = new Date().toISOString();
    save();
    log(`из квартир убрано повторов фото дома: ${moved}`);
    return true;
  }

  // Один раз: срок сдачи, этажность и описание — из квартир в их ЖК (самые частые; этапы сдачи — все).
  // В квартирах эти поля остаются как были (ничего не удаляется); на сайте для квартир ЖК берутся у ЖК.
  function infoOnce(log = () => {}) {
    const d = D();
    d.done = d.done || {};
    if (d.done.zkInfo) return false;
    const groups = new Map();
    for (const a of d.apartments) { const k = keyOf(a); if (!k || !reg()[k]) continue; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); }
    for (const [k, g] of groups) {
      const c = reg()[k];
      if (!c.handover) {
        const seen = new Set(), all = [];
        g.forEach(a => stagesOf(a.handover).forEach(x => { const kk = x.y * 10 + x.q; if (!seen.has(kk)) { seen.add(kk); all.push(x); } }));
        // «2028» и «II квартал 2028» — один этап
        const st = all.filter(x => x.q || !all.some(o => o.y === x.y && o.q)).sort((a, b) => a.y * 10 + a.q - (b.y * 10 + b.q));
        c.handover = st.length ? st.map(stageText).join(', ') : top(g.map(a => String(a.handover || '').trim()));
      }
      if (!c.floors) c.floors = Number(top(g.map(a => a.floors && String(a.floors)))) || 0;
      // Описание: и частое, и содержательное (сколько раз × длина) — «ПСО» из 3 букв не перебьёт нормальный текст
      const best = arr => { const n = new Map(); arr.filter(Boolean).forEach(x => n.set(x, (n.get(x) || 0) + 1)); return ([...n.entries()].sort((x, y) => y[1] * y[0].length - x[1] * x[0].length)[0] || [''])[0]; };
      if (!c.details) c.details = best(g.map(a => String(a.details || '').trim()));
      if (!c.detailsKy) c.detailsKy = best(g.map(a => String(a.detailsKy || '').trim()));
      log(`«${c.name}»: срок ${c.handover || '—'}, этажей ${c.floors || '—'}, описание ${c.details ? c.details.length + ' знаков' : 'нет'}`);
    }
    for (const a of d.apartments) if (reg()[keyOf(a)]) apply(a, { create: false });
    d.done.zkInfo = new Date().toISOString();
    save();
    return true;
  }

  const list = () => Object.entries(reg()).map(([key, c]) => ({ key, ...c, n: D().apartments.filter(a => keyOf(a) === key).length }));
  // Удалить пустой ЖК (без единой квартиры у всех менеджеров) — например, созданный для проверки
  function remove(key) {
    if (!get(key)) return { error: 'ЖК не найден' };
    if (D().apartments.some(a => keyOf(a) === key)) return { error: 'В этом ЖК есть квартиры — сначала удалите их' };
    const photos = reg()[key].photos || [];
    delete reg()[key];
    save();
    return { ok: true, photos };
  }

  return { apply, buildOnce, update, create, remove, movePhotosOnce, infoOnce, list, get, keyOf, stagesOf, stageText };
}

module.exports = { mount };
