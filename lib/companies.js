// Строительные компании, с которыми работают менеджеры. У каждого менеджера — своя компания (r.companyId):
// блок «Достижения компании» на его сайте и знания ИИ-помощника берутся только из неё.
// Новая компания: файл с её домами (как kut-objects.js) и история для ИИ (как ai-knowledge.js) + строка ниже.
// Потом владелец выбирает её у менеджера в кабинете («Менеджеры» → кнопка компании).
const COMPANIES = {
  kut: {
    id: 'kut', name: 'Кут',
    full: 'Строительная компания «Кут»', fullKy: '«Кут» курулуш компаниясы',
    objects: require('./kut-objects'),
    knowledge: require('./ai-knowledge'), // историю «Кут» владелец может поправить в кабинете («Знания ИИ»)
  },
};
const DEFAULT_ID = 'kut'; // у менеджеров, заведённых до выбора компании
const NONE = 'none';      // менеджер без компании: блока нет, ИИ не рассказывает о застройщике

const companyOf = r => {
  const id = r && r.companyId ? r.companyId : DEFAULT_ID;
  return id === NONE ? null : COMPANIES[id] || null;
};
const companyList = () => Object.values(COMPANIES).map(c => ({ id: c.id, name: c.name }));
const validId = id => id === NONE || !!COMPANIES[id];

// Сводка для ИИ: сколько сдано и строится, каждый дом одной строкой. Цен нет.
const nf = n => new Intl.NumberFormat('ru-RU').format(n);
const flatsOf = list => list.reduce((s, o) => s + (o.flats || 0), 0);
function stats(co) {
  const done = co.objects.filter(o => o.done), build = co.objects.filter(o => !o.done);
  return { done, build, flatsDone: flatsOf(done) };
}
function facts(co) {
  const { done, build, flatsDone } = stats(co);
  return [
    `Всего объектов: ${co.objects.length}. Сдано: ${done.length} жилых комплексов (${nf(flatsDone)} квартир передано владельцам). Строится: ${build.length}.`,
    'Сданные:',
    ...done.map(o => `- ${o.name} — ${o.when}; ${o.address}; ${o.floors} эт., ${o.blocks} блоков, ${o.flats} квартир; ${o.finish}; документы: ${o.docs}`),
    'Строятся:',
    ...build.map(o => `- ${o.name} — ${o.when}; ${o.address}; ${o.floors} эт.${o.flats ? `, ${o.flats} квартир` : ''}; ${o.finish}`),
  ].join('\n');
}

module.exports = { COMPANIES, NONE, companyOf, companyList, validId, stats, facts, nf };
