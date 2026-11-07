// Подбор квартир для ИИ-помощника по точным цифрам: из слов клиента берём комнаты, взнос, платёж,
// город и тип жилья — и отбираем квартиры сами, без ИИ (бесплатные модели путают цифры).
// Отбор уходит ИИ подсказкой, а карточки в ответе сверяются с ним.

const CY = 'а-яёөүңa-z';
const word = re => new RegExp(`(^|[^${CY}])(?:${re})(?![${CY}])`, 'i');

// «500000», «500 000», «500.000», «500 тыс», «1,5 млн», «1 миллион», «500к»
const NUM = `(\\d[\\d\\s.,]*\\d|\\d)\\s*(млн|миллион[${CY}]*|тыс[${CY}]*|к(?![${CY}]))?`;
function amount(num, unit) {
  let s = String(num).trim().replace(/[\s.](?=\d{3}(\D|$))/g, '').replace(/\s/g, '').replace(',', '.');
  let n = parseFloat(s);
  if (!isFinite(n)) return null;
  const u = String(unit || '').toLowerCase();
  if (u.startsWith('млн') || u.startsWith('миллион')) n *= 1e6;
  else if (u.startsWith('тыс') || u === 'к') n *= 1e3;
  else if (n < 5000) n *= 1000; // «взнос 500» — это тысячи
  return Math.round(n);
}
// Сумма рядом с ключевым словом: «взнос 500 000» или «500 000 взнос»
function sumNear(text, keys) {
  const after = new RegExp(`(?:${keys})[^\\d\\n]{0,30}?${NUM}`, 'i').exec(text);
  if (after) return amount(after[1], after[2]);
  const before = new RegExp(`${NUM}[^\\d\\n]{0,20}?(?:${keys})`, 'i').exec(text);
  if (before) return amount(before[1], before[2]);
  return null;
}

// Что хочет клиент — по всем его сообщениям; более поздние уточнения важнее
function wantsOf(messages) {
  const w = {};
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const t = String(m.content || '').toLowerCase().replace(/ё/g, 'е');
    const r = /(\d)\s*[-‑]?\s*(?:х|x)?\s*(?:комн|ком\b|к\b|бөлмө|комнат)/i.exec(t)
      || (/однуш|однокомн|бир бөлмө/.test(t) && [0, '1']) || (/двуш|двухкомн|эки бөлмө/.test(t) && [0, '2'])
      || (/треш|трехкомн|үч бөлмө/.test(t) && [0, '3']);
    if (r) w.rooms = +r[1];
    if (/без\s+(первоначальн|перв\.|взнос|предоплат)|төлөмсүз|нулев\w* взнос|взнос\w*\s+(0|ноль)\b/.test(t)) w.down = 0;
    else {
      const d = sumNear(t, 'взнос|первоначальн|перв\\.? ?взнос|алгачкы|аванс|предоплат');
      if (d != null) w.down = d;
    }
    const mo = sumNear(t, 'в месяц|ежемесячн|платеж|платёж|айына|айлык|/мес|в мес');
    if (mo != null && mo !== w.down) w.monthly = mo;
    if (word('ош|оше|оша|ошко|оштон').test(t) && !/бишкек/.test(t)) w.city = 'Ош';
    if (/бишкек/.test(t)) w.city = 'Бишкек';
    if (/помещени|коммерц|бизнес|офис под|магазин/.test(t)) w.kind = 'commercial';
    else if (/участ|жер тилк|сотк/.test(t)) w.kind = 'land';
    else if (/наличн|накталай|вторичк/.test(t)) w.kind = 'cash';
    else if (/рассрочк|бөлүп/.test(t) || w.down != null || w.monthly != null) w.kind = w.kind && w.kind !== 'cash' ? w.kind : 'installment';
  }
  return w;
}

const KIND = { commercial: a => a.type === 'commercial', land: a => a.type === 'land',
  cash: a => !a.installment && a.type !== 'commercial' && a.type !== 'land',
  installment: a => a.installment && a.type !== 'commercial' && a.type !== 'land' };

// Отбор: подходящие (fit) или, если таких нет, ближайшие (close) — с понятным описанием условий
function pick(list, w) {
  const keys = Object.keys(w);
  if (!keys.length) return null;
  let pool = list.filter(a => (w.kind ? KIND[w.kind](a) : a.type !== 'commercial' && a.type !== 'land'));
  if (w.city) pool = pool.filter(a => a.city === w.city);
  if (w.rooms) pool = pool.filter(a => (w.rooms >= 4 ? a.rooms >= 4 : a.rooms === w.rooms));
  const minDown = Math.min(...pool.filter(a => a.installment).map(a => a.down));
  const okDown = a => w.down == null || (a.installment && (w.down === 0 ? a.down <= minDown : a.down <= w.down * 1.05));
  const okMonthly = a => w.monthly == null || (a.installment && a.monthly <= w.monthly * 1.05);
  const order = (x, y) => (x.down || 0) - (y.down || 0) || (x.monthly || x.price) - (y.monthly || y.price);
  const fit = pool.filter(a => okDown(a) && okMonthly(a)).sort(order);
  const close = fit.length ? [] : pool.slice().sort(order).slice(0, 3);
  return { fit, close, minDown: isFinite(minDown) ? minDown : null, pool: pool.length };
}

// Подсказка ИИ: что отобрал сайт
function note(w, p, money, cur = 'сом') {
  if (!p) return '';
  const cond = [
    w.kind && { installment: 'в рассрочку', cash: 'за наличные', commercial: 'помещение для бизнеса', land: 'участок' }[w.kind],
    w.rooms && `${w.rooms >= 4 ? '4+' : w.rooms}-комн.`,
    w.city && `город ${w.city}`,
    w.down === 0 ? 'без первоначального взноса' : w.down != null && `взнос до ${money(w.down, cur)}`,
    w.monthly != null && `платёж до ${money(w.monthly, cur)} в месяц`,
  ].filter(Boolean).join(', ');
  const ids = list => list.slice(0, 3).map(a => `[[apt:${a.id}]]`).join(' ');
  const lines = [`Сайт точно отобрал квартиры под условия клиента (${cond}). Показывай карточками ТОЛЬКО эти квартиры, другие не предлагай и не придумывай им взнос.`];
  if (w.down === 0) lines.push(`Квартир совсем без первоначального взноса нет. Самый низкий взнос${w.rooms ? ` у ${w.rooms}-комн.` : ''}: ${p.minDown != null ? money(p.minDown, cur) : '—'}. Скажи это честно одной фразой.`);
  if (p.fit.length) lines.push(`Подходят: ${ids(p.fit)}${p.fit.length > 3 ? ` (всего ${p.fit.length}, покажи эти)` : ''}`);
  else if (p.close.length) lines.push(`Точно под условия квартир нет. Честно скажи и предложи ближайшие: ${ids(p.close)} — или написать менеджеру в WhatsApp, он подберёт.`);
  else lines.push('Таких квартир на сайте нет. Честно скажи и предложи написать менеджеру в WhatsApp — он подберёт вручную.');
  return lines.join('\n');
}

module.exports = { wantsOf, pick, note, amount };
