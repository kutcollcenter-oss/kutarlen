// Какое фото: «фото ЖК» (здание снаружи, вид сверху, фасад) или «только для квартиры» (планировка, генплан, ремонт внутри).
// На странице ЖК и в карточке ЖК — только фото ЖК; на странице квартиры — все её фото.
// Новые фото сервер определяет сам — осторожно: при сомнении «только для квартиры». Менеджер может поправить в кабинете.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Фото, которые уже были на сайте 25.11.2026, — размечены вручную по превью (64 шт.)
const SEED_ZK = ['04e9501a38953e99', '11ecbacbc0b689f7', '1d6f5559ca20200a', '38fa7446e6e8e244', '42b95efb4ad8616e', '4311b2112e9672e6', '5e4b656b58d16562', '684d825ec239def0', '70f9834c3399e236', '887eec5912dd354f', 'badc7e0c8ce68f4f', 'c05411380ee050ec', 'c6c6fd3905f5ec36', 'db27a87733019f5c', 'de54e1a9e5e6b544', 'f4de616841b3d67b'];
const SEED_APT = ['0b9618eb8ce52b8d', '0e92904551a8e68c', '0f7250b13336c08c', '104293914357e5cf', '1705aca7eceecdd9', '1974d3a7097c9771', '200580ea9316f8b4', '213f84ae5a7168e5', '223a4e0f41161249', '2ae095801577ece3', '2d6bdf6eb7288146', '31793db55dfc2244', '3b410214c0a51a49', '3beba63297a2492b', '3e67aa990d97ee89', '4672f35201820b97', '4ad151f180b9eb6d', '4f73ac9654a34e8f', '5645a49bda5d6523', '64aaeca68ebc9b51', '65a36b1837ab0647', '65f4b16a98f616d0', '6a1390135314137b', '729c85f7a424185d', '786255587fff0d08', '7c636115e21ed91a', '88ef0fa45721dbd0', '8a1c282f30f2af43', '935dc705498b73d3', 'a304d82995a15024', 'a69c06e7306ef507', 'ab271e6282ea0599', 'acb44167f8cf31bf', 'ad3af5b95a1a27ee', 'bfae6043813eb048', 'c5c40c0f2022ff82', 'c9db7a6b13272e62', 'c9ec1f763505be2c', 'cd97483e5f4faac6', 'ceeb7c4925e4d608', 'e05dceda5f20d78e', 'e16e58e5da9e3561', 'ec82cd52cca3cae5', 'f0b2f9bd086c77c1', 'f394ca009631670b', 'f41da9a7bdb546ac', 'f67f351754ced107', 'fb69727364694c3d'];

// Догадка по картинке: фото ЖК — цветное (небо, зелень, фасад) и почти без белого фона; планировки — белые с линиями.
// Проверено на 64 фото сайта: находит 12 из 16 фото ЖК, ошибается в 3 из 48 (ремонт в тёплых тонах, жёлтая планировка).
async function guess(input) {
  const { data } = await sharp(input, { failOn: 'none' }).resize(64, 64, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let white = 0, sat = 0, color = 0;
  const n = data.length / 3;
  for (let k = 0; k < data.length; k += 3) {
    const r = data[k], g = data[k + 1], b = data[k + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = mx ? (mx - mn) / mx : 0;
    if (mn > 215) white++;
    sat += s;
    if (s > 0.25 && mx > 60) color++;
  }
  return white / n < 0.15 && sat / n >= 0.25 && color / n >= 0.2 ? 'zk' : 'apt';
}

// «Отпечаток» картинки (16×16, светлее/темнее среднего): одинаковые фото, загруженные под разными именами, совпадают
async function fingerprint(input) {
  const { data } = await sharp(input, { failOn: 'none' }).resize(16, 16, { fit: 'fill' }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const avg = data.reduce((s, v) => s + v, 0) / data.length;
  return [...data].map(v => (v > avg ? 1 : 0));
}
const sameImage = (a, b) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0) <= 12; // из 256 точек различий почти нет

function mount({ D, save, uploadDir }) {
  const kinds = () => { const d = D(); if (!d.photoKind) d.photoKind = {}; return d.photoKind; };
  const kindOf = name => (kinds()[name] || {}).k || 'apt';
  // Новое фото: определить и запомнить, кто загрузил (менеджер может переключить только свои фото)
  async function onUpload(name, realtorId) {
    let k = 'apt';
    try { k = await guess(path.join(uploadDir, `${name}-t.webp`)); } catch (e) {}
    kinds()[name] = { k, by: realtorId, auto: true };
    return k;
  }
  // Один раз при запуске: разметка уже загруженных фото (ручная для известных 64, догадка для остальных)
  async function prepareAll() {
    const d = D();
    d.done = d.done || {};
    if (d.done.photoKinds) return;
    const z = new Set(SEED_ZK), a = new Set(SEED_APT), m = kinds();
    const names = [...new Set(d.apartments.flatMap(x => x.photos || []))];
    let zk = 0, guessed = 0;
    for (const name of names) {
      if (m[name]) continue;
      let k;
      if (z.has(name)) k = 'zk';
      else if (a.has(name)) k = 'apt';
      else { try { k = await guess(path.join(uploadDir, `${name}-t.webp`)); } catch (e) { k = 'apt'; } guessed++; }
      const owner = d.apartments.find(x => (x.photos || []).includes(name));
      m[name] = { k, by: owner ? owner.realtorId : null, auto: !z.has(name) && !a.has(name) };
      if (k === 'zk') zk++;
    }
    d.done.photoKinds = new Date().toISOString();
    save();
    console.log(`Фото ЖК: размечено ${names.length} фото, из них фото ЖК — ${zk} (догадкой — ${guessed})`);
  }
  // Менеджер переключает: «Фото ЖК» ↔ «только для квартиры». Можно, если фото в его квартирах или он его загрузил.
  function canEdit(name, user, realtor) {
    if (user.role === 'owner') return true;
    const m = kinds()[name];
    return (m && m.by === realtor.id) || D().apartments.some(x => x.realtorId === realtor.id && (x.photos || []).includes(name));
  }
  function set(name, zk) { const m = kinds(); m[name] = { ...(m[name] || {}), k: zk ? 'zk' : 'apt', auto: false }; save(); }
  // Убрать повторы одной и той же картинки из списка фото (оставляем первое)
  async function dedupe(names) {
    const keep = [], prints = [];
    for (const n of names) {
      let fp = null;
      try { fp = await fingerprint(path.join(uploadDir, `${n}-t.webp`)); } catch (e) {}
      if (fp && prints.some(p => sameImage(p, fp))) continue;
      keep.push(n);
      if (fp) prints.push(fp);
    }
    return keep;
  }
  return { kindOf, onUpload, prepareAll, canEdit, set, dedupe };
}

module.exports = { mount, guess };
