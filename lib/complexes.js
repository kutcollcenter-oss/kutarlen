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
      c = reg()[key] = { name: clean(a.title), city: a.city || 'Бишкек', district: a.district || '', address: /^https?:/i.test(a.address || '') ? '' : (a.address || ''), map: a.map ? { ...a.map } : null, createdBy: a.realtorId, createdAt: new Date().toISOString() };
    }
    a.title = c.name;
    for (const k of FIELDS) a[k] = c[k] || (k === 'city' ? 'Бишкек' : '');
    delete a.map2gis;
    if (c.map) a.map = { ...c.map }; else delete a.map;
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
    c.updatedAt = new Date().toISOString();
    let n = 0;
    for (const a of D().apartments) if (keyOf(a) === key) { apply(a, { create: false }); n++; }
    save();
    return { complex: c, apartments: n };
  }

  const list = () => Object.entries(reg()).map(([key, c]) => ({ key, ...c, n: D().apartments.filter(a => keyOf(a) === key).length }));
  return { apply, buildOnce, update, list, get, keyOf };
}

module.exports = { mount };
