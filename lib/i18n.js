// Языки сайта для клиентов: русский (по умолчанию) и кыргызский.
// Переводится только интерфейс: кнопки, заголовки, фильтр, расчёт, сообщения в WhatsApp.
// Тексты, которые пишет менеджер («Обо мне», «Детали», вопросы, отзывы, метки), показываются как написаны.
// {x} в строке — подстановка: t('ky', 'foundN', { n: 5 }).
// Ключи с окончанием Html вставляются без экранирования — в них только наша разметка.

const LANGS = ['ru', 'ky'];

const DICT = {
  ru: {
    langName: 'Русский', langShort: 'Рус', htmlLang: 'ru', ogLocale: 'ru_RU',
    // Меню
    navApartments: 'Квартиры', navReviews: 'Отзывы', navQuestions: 'Вопросы', navHome: 'Главная', menu: 'Меню',
    // Первый экран
    pickApartment: 'Подобрать квартиру', writeWa: 'Написать в WhatsApp',
    heroSub: '{who}. Подберу квартиру под ваш взнос и ежемесячный платёж.',
    metaIndex: '{tagline}. Подбор квартир по первоначальному взносу и ежемесячному платежу.',
    waGeneral: 'Здравствуйте! Хочу подобрать квартиру.',
    // Новости
    soon: 'Скоро', newsH2Html: 'Узнайте <span class="hl">первыми</span>', newsBtn: 'Узнать первым',
    waNews: 'Здравствуйте! Хочу узнать первым: {title}',
    // Каталог
    catalogKicker: 'Подбор квартир', catalogH2Html: 'Квартиры под <span class="hl">ваш бюджет</span>',
    catalogLead: 'Укажите, сколько готовы внести сейчас и платить в месяц — сразу покажу подходящие квартиры.',
    typeInstallment: 'Рассрочка · сом', typeCommercial: 'Коммерция · сом', typeCash: 'Наличные · $', typeLand: 'Участки · $',
    myDown: 'Мой первоначальный взнос', hintDown: 'Двигайте — укажите, сколько готовы внести',
    monthlyUpTo: 'Платёж в месяц до', hintMonthly: 'Двигайте — подберём квартиры под ваш платёж',
    rooms: 'Комнаты', areaM2: 'Площадь, м²', areaSot: 'Площадь, соток', areaFrom: 'Площадь от', areaTo: 'Площадь до',
    resetFilter: 'Сбросить фильтр', sortLabel: 'Сортировка',
    sortMonthly: 'Платёж в месяц: от меньшего', sortDown: 'Взнос: от меньшего', sortPpm: 'Цена за м²: от дешёвых', sortPpmLand: 'Цена за сотку: от дешёвых',
    any: 'любой', upTo: 'до {x}', allCities: 'Все города',
    found: 'Найдено: {n} {word}',
    wordsApartment: 'квартира|квартиры|квартир', wordsCommercial: 'помещение|помещения|помещений', wordsLand: 'участок|участка|участков',
    emptyHtml: '<b>Под эти условия сейчас нет {many} на сайте.</b><br>Напишите — подберу вручную.', pickManually: 'Подберу вручную',
    waPick: 'Здравствуйте! Подберите, пожалуйста, {kind}{where}{budget}.',
    kindInstallment: 'квартиру в рассрочку', kindCommercial: 'коммерческое помещение в рассрочку', kindCash: 'квартиру за наличные', kindLand: 'участок',
    inCity: ' в городе {city}', budgetDown: 'взнос до {x}', budgetMonthly: 'платёж до {x} в месяц', budgetRooms: 'комнат: {x}', roomsOneOrStudio: '1 или студия',
    moreApartment: 'Подробнее о квартире', moreCommercial: 'Подробнее о помещении', moreLand: 'Подробнее об участке', more: 'Подробнее',
    // Карточка
    perMonth: '/ мес', cashWord: 'наличные', fullPay: '100% оплата', down: 'Взнос', term: 'Срок', price: 'Цена', months: '{n} мес.',
    fromFloor: 'от {f} эт.', perSot: 'сот.', perM2: 'м²',
    // Блоки главной
    instKicker: 'Рассрочка', instH2Html: 'Как работает <span class="hl">рассрочка</span>', docsTitle: 'Какие документы нужны',
    aboutKicker: 'Обо мне', aboutTitleHtml: 'Привет! Я {name} <span class="hl">и помогу с квартирой</span>',
    office: 'Офис продаж', open2gis: 'Открыть в 2ГИС →',
    reviewsKicker: 'Отзывы', reviewsH2Html: 'Что говорят <span class="hl">клиенты</span>', stars: '5 из 5',
    faqKicker: 'Вопросы и ответы', faqH2Html: 'Частые <span class="hl">вопросы</span>',
    // Подвал
    footerCta: 'Хотите такой же сайт?', footerCtaText: 'Личный сайт с подбором квартир и заявками в WhatsApp — для менеджеров по недвижимости',
    footerCtaBtn: 'Узнать на kvartiry.asia →', privacy: 'Политика конфиденциальности', docsNav: 'Документы',
    // Страница квартиры
    titleFromMonthly: ', от {x}/мес', descDown: 'Взнос от {x}, рассрочка {n} мес.', payCash: 'Оплата наличными', photoN: 'фото {i}',
    calcDown: 'Первоначальный взнос', calcMin: 'мин. {x}', calcHint: 'Внесите больше — платёж в месяц станет меньше',
    calcMonthly: 'Платёж в месяц', calcTerm: '{n} мес. рассрочки', calcFull: 'Полная оплата', calcNoInst: 'без рассрочки',
    calcRest: 'Остаток в рассрочку', calcPpm: 'Цена за м²', calcNote: 'Расчёт предварительный, точные условия — в договоре.',
    coBadge: 'Выгодно', coHead: 'Оплата наличными', coLine: '{ppm} за м² вместо {old} · скидка {d} за м²', coSaveHtml: 'Вы сэкономите <b>{x}</b>',
    coHint: 'Если внести {x} сразу — {own} без рассрочки и дешевле', ownApartment: 'квартира ваша', ownCommercial: 'помещение ваше',
    coHit: 'Этой суммы хватает, чтобы купить за наличные — вы сэкономите {x}',
    cHintHitHtml: 'За наличные дешевле: <b>{x}</b>, экономия {s}', wantCash: 'Хочу купить за наличные',
    priceCash: 'Цена · оплата наличными', priceFull: 'Цена при 100% оплате', ppmM2: '{x} за м²', ppmSot: '{x} за сотку',
    floorFromOf: 'от {f} эт.{of}', floorOf: ' из {n}', houseFloors: 'дом {n} эт.',
    wantApartment: 'Хочу эту квартиру', wantCommercial: 'Хочу это помещение', wantLand: 'Хочу этот участок',
    details: 'Детали', onMap: 'На карте', map: 'Карта',
    similarApartment: 'Похожие квартиры', similarCommercial: 'Похожие помещения', similarLand: 'Похожие участки',
    // Просмотр фото
    lbLabel: 'Фото квартиры', lbClose: 'Закрыть', lbPrev: 'Предыдущее фото', lbNext: 'Следующее фото', lbCount: '{i} из {n}', lbAlt: 'Фото {i} из {n}',
    // Квартира продана
    goneTitle: 'Квартира продана — {name}', goneDesc: 'Посмотрите похожие квартиры в продаже', goneH1: 'Эта квартира уже продана',
    goneText: 'Но есть похожие варианты — или напишите, и я подберу вручную.',
    waGone: 'Здравствуйте! Квартира, которую я смотрел(а), уже продана. Подберите, пожалуйста, похожую.',
    // Сайт временно не работает
    soonTitle: '{name} — подборка обновляется', soonDesc: 'Подборка квартир обновляется', soonH1: 'Подборка квартир обновляется',
    soonText: 'Сейчас здесь идёт обновление: добавляются новые варианты и актуальные цены. Загляните немного позже — всё снова будет на этой странице.',
    soonNote: 'Если вы уже на связи с менеджером — пишите, как обычно',
    // Объект и сообщение в WhatsApp
    studio: 'Студия', roomsN: '{n}-комн.', kindCommercialLabel: 'Коммерческое помещение', kindLandLabel: 'Участок',
    tagInstallment: 'Рассрочка', tagCommercial: 'Коммерция', tagCash: 'Наличные', handover: 'Сдача: {x}',
    itApartment: 'эту квартиру', itCommercial: 'это помещение', itLand: 'этот участок',
    waWant: 'Здравствуйте! Хочу купить {it}{name}:', waWantCash: 'Здравствуйте! Хочу купить {it} за наличные{name}:',
    waFloor: 'от {f} этажа', waPrice: 'Цена: {x}', waDown: 'Взнос: ', waMonthly: 'В месяц: ', waMonthlyFor: '{x} на {n} мес.',
    waFullPay: '{x} (полная оплата)', waCashPay: 'Оплата наличными', waCashPrice: 'Цена за наличные: {x}', waCashPpm: 'За м²: {x} (скидка {d})',
  },

  ky: {
    langName: 'Кыргызча', langShort: 'Кыр', htmlLang: 'ky', ogLocale: 'ky_KG',
    navApartments: 'Батирлер', navReviews: 'Пикирлер', navQuestions: 'Суроолор', navHome: 'Башкы бет', menu: 'Меню',
    pickApartment: 'Батир тандоо', writeWa: 'WhatsApp аркылуу жазуу',
    heroSub: '{who}. Алгачкы жана айлык төлөмүңүзгө ылайык батир тандап берем.',
    metaIndex: '{tagline}. Алгачкы жана айлык төлөм боюнча батир тандоо.',
    waGeneral: 'Саламатсызбы! Батир тандагым келет.',
    soon: 'Жакында', newsH2Html: 'Биринчилерден болуп <span class="hl">билиңиз</span>', newsBtn: 'Биринчи билүү',
    waNews: 'Саламатсызбы! Биринчилерден болуп билгим келет: {title}',
    catalogKicker: 'Батир тандоо', catalogH2Html: 'Бюджетиңизге <span class="hl">ылайык батирлер</span>',
    catalogLead: 'Азыр канча төлөй аларыңызды жана айына канча төлөөрүңүздү көрсөтүңүз — ылайыктуу батирлерди дароо көрсөтөм.',
    typeInstallment: 'Бөлүп төлөө · сом', typeCommercial: 'Коммерция · сом', typeCash: 'Накталай · $', typeLand: 'Жер тилкелери · $',
    myDown: 'Менин алгачкы төлөмүм', hintDown: 'Жылдырыңыз — канча төлөй аларыңызды көрсөтүңүз',
    monthlyUpTo: 'Айлык төлөм', hintMonthly: 'Жылдырыңыз — төлөмүңүзгө ылайык батирлерди тандайбыз',
    rooms: 'Бөлмөлөр', areaM2: 'Аянты, м²', areaSot: 'Аянты, сотых', areaFrom: 'Аянты, эң аз', areaTo: 'Аянты, эң көп',
    resetFilter: 'Фильтрди тазалоо', sortLabel: 'Иреттөө',
    sortMonthly: 'Айлык төлөм: азынан баштап', sortDown: 'Алгачкы төлөм: азынан баштап', sortPpm: '1 м² баасы: арзанынан баштап', sortPpmLand: '1 сотых баасы: арзанынан баштап',
    any: 'каалаган', upTo: '{x} чейин', allCities: 'Бардык шаарлар',
    found: 'Табылды: {n} {word}',
    // Кыргызча сандан кийин зат атооч көптүк санда турбайт: «5 батир»
    wordsApartment: 'батир|батир|батир', wordsCommercial: 'жай|жай|жай', wordsLand: 'жер тилкеси|жер тилкеси|жер тилкеси',
    emptyHtml: '<b>Бул шарттарга ылайык {many} азырынча жок.</b><br>Жазыңыз — өзүм тандап берем.', pickManually: 'Өзүм тандап берем',
    waPick: 'Саламатсызбы! Сураныч, {kind} тандап бериңиз{where}{budget}.',
    kindInstallment: 'бөлүп төлөөгө батир', kindCommercial: 'бөлүп төлөөгө коммерциялык жай', kindCash: 'накталай акчага батир', kindLand: 'жер тилкесин',
    inCity: ' ({city} шаары)', budgetDown: 'алгачкы төлөм {x} чейин', budgetMonthly: 'айлык төлөм {x} чейин', budgetRooms: 'бөлмөлөр: {x}', roomsOneOrStudio: '1 же студия',
    moreApartment: 'Батир жөнүндө кененирээк', moreCommercial: 'Жай жөнүндө кененирээк', moreLand: 'Жер тилкеси жөнүндө кененирээк', more: 'Кененирээк',
    perMonth: '/ ай', cashWord: 'накталай', fullPay: '100% төлөм', down: 'Алгачкы төлөм', term: 'Мөөнөтү', price: 'Баасы', months: '{n} ай',
    fromFloor: '{f}-кабаттан', perSot: 'сотых', perM2: 'м²',
    instKicker: 'Бөлүп төлөө', instH2Html: 'Бөлүп төлөө <span class="hl">кантип иштейт</span>', docsTitle: 'Кандай документтер керек',
    aboutKicker: 'Мен жөнүндө', aboutTitleHtml: 'Салам! Мен {name}, <span class="hl">батир табууга жардам берем</span>',
    office: 'Сатуу кеңсеси', open2gis: '2ГИСте ачуу →',
    reviewsKicker: 'Пикирлер', reviewsH2Html: 'Кардарлар <span class="hl">эмне дейт</span>', stars: '5тен 5',
    faqKicker: 'Суроо-жооп', faqH2Html: 'Көп берилүүчү <span class="hl">суроолор</span>',
    footerCta: 'Ушундай сайт керекпи?', footerCtaText: 'Кыймылсыз мүлк менеджерлери үчүн жеке сайт: батир тандоо жана WhatsApp аркылуу арыздар',
    footerCtaBtn: 'kvartiry.asia сайтынан билүү →', privacy: 'Купуялык саясаты', docsNav: 'Документтер',
    titleFromMonthly: ', айына {x} баштап', descDown: 'Алгачкы төлөм {x} баштап, {n} айга бөлүп төлөө', payCash: 'Накталай төлөм', photoN: 'сүрөт {i}',
    calcDown: 'Алгачкы төлөм', calcMin: 'эң аз {x}', calcHint: 'Көбүрөөк төлөсөңүз — айлык төлөм азаят',
    calcMonthly: 'Айлык төлөм', calcTerm: '{n} айга бөлүп төлөө', calcFull: 'Толук төлөм', calcNoInst: 'бөлүп төлөөсүз',
    calcRest: 'Бөлүп төлөөгө калган сумма', calcPpm: '1 м² баасы', calcNote: 'Эсеп болжолдуу, так шарттар келишимде көрсөтүлөт.',
    coBadge: 'Пайдалуу', coHead: 'Накталай төлөм', coLine: '1 м² — {ppm} ({old} ордуна) · 1 м² үчүн {d} арзан', coSaveHtml: 'Сиз <b>{x}</b> үнөмдөйсүз',
    coHint: 'Дароо {x} төлөсөңүз — {own} бөлүп төлөөсүз жана арзаныраак', ownApartment: 'батир сиздики', ownCommercial: 'жай сиздики',
    coHit: 'Бул сумма накталай сатып алууга жетет — {x} үнөмдөйсүз',
    cHintHitHtml: 'Накталай арзаныраак: <b>{x}</b>, үнөм {s}', wantCash: 'Накталай сатып алгым келет',
    priceCash: 'Баасы · накталай төлөм', priceFull: '100% төлөгөндөгү баасы', ppmM2: '1 м² — {x}', ppmSot: '1 сотых — {x}',
    floorFromOf: '{f}-кабаттан{of}', floorOf: ', {n} кабаттуу үй', houseFloors: '{n} кабаттуу үй',
    wantApartment: 'Бул батирди каалайм', wantCommercial: 'Бул жайды каалайм', wantLand: 'Бул жер тилкесин каалайм',
    details: 'Кошумча маалымат', onMap: 'Картада', map: 'Карта',
    similarApartment: 'Окшош батирлер', similarCommercial: 'Окшош жайлар', similarLand: 'Окшош жер тилкелери',
    lbLabel: 'Батирдин сүрөттөрү', lbClose: 'Жабуу', lbPrev: 'Мурунку сүрөт', lbNext: 'Кийинки сүрөт', lbCount: '{i} / {n}', lbAlt: 'Сүрөт {i} / {n}',
    goneTitle: 'Батир сатылды — {name}', goneDesc: 'Сатыктагы окшош батирлерди караңыз', goneH1: 'Бул батир сатылып кетти',
    goneText: 'Бирок окшош варианттар бар — же жазыңыз, өзүм тандап берем.',
    waGone: 'Саламатсызбы! Мен караган батир сатылып кетиптир. Сураныч, окшошун тандап бериңиз.',
    soonTitle: '{name} — тизме жаңыланууда', soonDesc: 'Батирлер тизмеси жаңыланууда', soonH1: 'Батирлер тизмеси жаңыланууда',
    soonText: 'Азыр бул жерде жаңылоо жүрүп жатат: жаңы варианттар жана актуалдуу баалар кошулууда. Бир аздан кийин кайра кириңиз — баары ушул баракта болот.',
    soonNote: 'Эгер менеджер менен байланышта болсоңуз — кадимкидей жаза бериңиз',
    studio: 'Студия', roomsN: '{n} бөлмөлүү', kindCommercialLabel: 'Коммерциялык жай', kindLandLabel: 'Жер тилкеси',
    tagInstallment: 'Бөлүп төлөө', tagCommercial: 'Коммерция', tagCash: 'Накталай', handover: 'Тапшыруу: {x}',
    itApartment: 'Бул батирди', itCommercial: 'Бул жайды', itLand: 'Бул жер тилкесин',
    waWant: 'Саламатсызбы! {it} сатып алгым келет{name}:', waWantCash: 'Саламатсызбы! {it} накталай сатып алгым келет{name}:',
    waFloor: '{f}-кабаттан', waPrice: 'Баасы: {x}', waDown: 'Алгачкы төлөм: ', waMonthly: 'Айына: ', waMonthlyFor: '{x}, {n} ай',
    waFullPay: '{x} (толук төлөм)', waCashPay: 'Накталай төлөм', waCashPrice: 'Накталай баасы: {x}', waCashPpm: '1 м²: {x} (арзандатуу {d})',
  },
};

const langOk = l => (LANGS.includes(l) ? l : 'ru');
// t('ky', 'found', { n: 3, word: 'батир' }) → «Табылды: 3 батир». Нет перевода — берём русский.
function t(lang, key, vars) {
  const s = DICT[langOk(lang)][key] ?? DICT.ru[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? '')) : s;
}
// 1 квартира, 2 квартиры, 5 квартир (по-кыргызски форма одна)
function plural(lang, key, n) {
  const [one, few, many] = t(lang, key).split('|');
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? few : many;
}
const dict = lang => DICT[langOk(lang)];

module.exports = { LANGS, t, plural, dict, langOk };
