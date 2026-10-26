// Страница квартиры: клиент меняет первоначальный взнос — платёж в месяц пересчитывается.
// Платёж = (Цена − Взнос) / Срок. Срок задаёт менеджер, взнос — не меньше минимального.
(function () {
  const { money, wa } = window.RS;
  const L = window.RS.t; // тексты на языке страницы (lib/i18n.js)
  const D = window.__DATA__;
  const a = D.apartment;
  if (!a || !a.installment) return;

  const $ = id => document.getElementById(id);
  const range = $('cDown'), input = $('cDownInput');
  const cur = a.currency;
  const min = a.down, max = a.price;
  const step = 100000; // взнос двигается по 100 000; точную сумму можно ввести в поле
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
    $('cMonthly').textContent = m ? money(m, cur) : L('calcFull');
    $('cTerm').textContent = m ? L('calcTerm', { n: a.months }) : L('calcNoInst');
    $('cRest').textContent = money(a.price - d, cur);

    // Готовое сообщение в WhatsApp — с выбранным взносом
    const url = `${D.base}${a.url}`;
    // Строки взноса и платежа: их начала — в словаре (waDown, waMonthly), так их и находим в тексте
    const pay = m
      ? `${L('waDown')}${money(d, cur)}\n${L('waMonthly')}${L('waMonthlyFor', { x: money(m, cur), n: a.months })}`
      : `${L('waDown')}${L('waFullPay', { x: money(a.price, cur) })}`;
    // Взноса хватает на покупку за наличные — подсвечиваем выгоду и предлагаем купить дешевле
    const cash = a.cash;
    const hit = !!cash && d >= cash.price;
    if (hit && from) window.RS.once('cash', { a: a.id });
    if (cash) {
      $('cashOffer').classList.toggle('hit', hit);
      $('coHint').textContent = hit
        ? L('coHit', { x: money(cash.savings, cur) })
        : L('coHint', { x: money(cash.price, cur), own: L(a.type === 'commercial' ? 'ownCommercial' : 'ownApartment') });
      const hint = $('cHint');
      hint.classList.toggle('hit', hit);
      hint.innerHTML = hit
        ? `${L('cHintHitHtml', { x: money(cash.price, cur), s: money(cash.savings, cur) })} <a href="#cashOffer">↓</a>`
        : L('calcHint');
    }

    const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const payRe = new RegExp(`${escRe(L('waDown'))}[^\\n]*\\n${escRe(L('waMonthly'))}[^\\n]*`);
    const text = hit ? cash.waText : a.waText.replace(payRe, pay);
    const link = wa(text);
    $('aptWa').href = link;
    $('aptWa').lastChild.textContent = L(hit ? 'wantCash' : a.type === 'commercial' ? 'wantCommercial' : 'wantApartment');
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
