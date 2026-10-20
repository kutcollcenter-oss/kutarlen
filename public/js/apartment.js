// Страница квартиры: клиент меняет первоначальный взнос — платёж в месяц пересчитывается.
// Платёж = (Цена − Взнос) / Срок. Срок задаёт менеджер, взнос — не меньше минимального.
(function () {
  const { money, wa } = window.RS;
  const D = window.__DATA__;
  const a = D.apartment;
  if (!a || !a.installment) return;

  const $ = id => document.getElementById(id);
  const range = $('cDown'), input = $('cDownInput');
  const cur = a.currency;
  const min = a.down, max = a.price;
  const step = Math.max(1000, Math.pow(10, Math.floor(Math.log10(Math.max(max - min, 1))) - 2)); // ~100 шагов
  range.min = min; range.max = max; range.step = step;

  const monthlyAt = d => (d >= a.price ? 0 : Math.ceil((a.price - d) / a.months));
  const clamp = d => Math.min(max, Math.max(min, Math.round(d) || 0));
  const plain = n => new Intl.NumberFormat('ru-RU').format(n);

  function set(d, from) {
    d = clamp(d);
    const m = monthlyAt(d);
    if (from !== 'range') range.value = d;
    if (from !== 'input') input.value = plain(d);
    range.style.setProperty('--p', ((d - min) / (max - min || 1)) * 100 + '%');
    $('cMonthly').textContent = m ? money(m, cur) : 'Полная оплата';
    $('cTerm').textContent = m ? `${a.months} мес. рассрочки` : 'без рассрочки';
    $('cRest').textContent = money(a.price - d, cur);

    // Готовое сообщение в WhatsApp — с выбранным взносом
    const url = `${D.base}${a.url}`;
    const pay = m
      ? `Взнос: ${money(d, cur)}\nВ месяц: ${money(m, cur)} на ${a.months} мес.`
      : `Взнос: ${money(a.price, cur)} (полная оплата)`;
    // Взноса хватает на покупку за наличные — подсвечиваем выгоду и предлагаем купить дешевле
    const cash = a.cash;
    const hit = !!cash && d >= cash.price;
    if (hit && from) window.RS.once('cash', { a: a.id });
    if (cash) {
      $('cashOffer').classList.toggle('hit', hit);
      $('coHint').textContent = hit
        ? `Этой суммы хватает, чтобы купить за наличные — вы сэкономите ${money(cash.savings, cur)}`
        : `Если внести ${money(cash.price, cur)} сразу — ${a.type === 'commercial' ? 'помещение ваше' : 'квартира ваша'} без рассрочки и дешевле`;
      const hint = $('cHint');
      hint.classList.toggle('hit', hit);
      hint.innerHTML = hit
        ? `За наличные дешевле: <b>${money(cash.price, cur)}</b>, экономия ${money(cash.savings, cur)} <a href="#cashOffer">↓</a>`
        : 'Внесите больше — платёж в месяц станет меньше';
    }

    const text = hit ? cash.waText : a.waText.replace(/Взнос: [^\n]*\nВ месяц: [^\n]*/, pay);
    const link = wa(text);
    $('aptWa').href = link;
    $('aptWa').lastChild.textContent = hit ? 'Хочу купить за наличные' : a.type === 'commercial' ? 'Хочу это помещение' : 'Хочу эту квартиру';
    const tab = $('tabWa'); if (tab) tab.href = link;
  }

  // Аналитика: клиент сам менял взнос / взноса хватило на покупку за наличные (по разу на страницу)
  const used = () => window.RS.once('calc', { a: a.id });
  range.addEventListener('input', () => { used(); set(+range.value, 'range'); });
  input.addEventListener('input', () => {
    used();
    const raw = +input.value.replace(/\D/g, '');
    if (raw >= min) set(raw, 'input');
  });
  input.addEventListener('blur', () => set(+input.value.replace(/\D/g, ''))); // поправить до допустимого
  input.addEventListener('focus', () => input.select());

  // Взнос из карточки на главной (?down=) — адрес уже очищен в common.js, значение сохранено в RS.params
  const start = +((window.RS.params || new URLSearchParams(location.search)).get('down'));
  set(start || min);
})();
