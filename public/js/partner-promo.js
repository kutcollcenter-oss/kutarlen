// /partner: выбрали тариф без промокода — спрашиваем «Есть промокод?».
// Ввёл код — в WhatsApp уходит сообщение с ценой со скидкой и «Промокод: …»; «Пропустить» — обычное сообщение.
(function () {
  if (document.querySelector('.lx-promo')) return; // промокод уже есть (пришёл по ссылке партнёра) — не спрашиваем
  const nf = new Intl.NumberFormat('ru-RU');
  let dlg = null, pending = null;

  function build() {
    dlg = document.createElement('div');
    dlg.className = 'lx-pask';
    dlg.innerHTML = `<div class="lx-pask-box" role="dialog" aria-modal="true" aria-labelledby="lxAskT">
      <button type="button" class="lx-pask-x" aria-label="Закрыть">×</button>
      <h3 id="lxAskT">Есть промокод?</h3>
      <p>Если вам дали промокод — впишите его, скидка будет в сообщении. Нет кода — просто нажмите «Пропустить».</p>
      <form><input name="code" maxlength="20" autocomplete="off" aria-label="Промокод">
        <div class="lx-pask-err" aria-live="polite"></div>
        <button class="lx-btn gold" type="submit">Применить и написать</button>
        <button class="lx-btn ghost lx-pask-skip" type="button">Пропустить</button></form>
    </div>`;
    document.body.appendChild(dlg);
    const close = () => { dlg.classList.remove('on'); pending = null; };
    dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('.lx-pask-x')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && dlg.classList.contains('on')) close(); });
    dlg.querySelector('.lx-pask-skip').addEventListener('click', () => { const a = pending; close(); if (a) location.href = a.href; });
    dlg.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const a = pending; if (!a) return;
      const code = dlg.querySelector('input').value.trim(); // русские буквы сервер понимает сам
      const err = dlg.querySelector('.lx-pask-err');
      if (!code) { err.textContent = 'Впишите промокод или нажмите «Пропустить»'; return; }
      const r = await fetch('/api/promo/' + encodeURIComponent(code)).catch(() => null);
      if (!r || !r.ok) { err.textContent = 'Такого промокода нет — проверьте или нажмите «Пропустить»'; return; }
      const p = await r.json();
      // Сообщение тарифа + цена со скидкой + промокод
      const url = new URL(a.href);
      let text = url.searchParams.get('text') || '';
      const total = Number(a.dataset.total) || 0;
      if (p.discount && total) text += ` Со скидкой ${p.discount}% по промокоду — ${nf.format(Math.round(total * (100 - p.discount) / 100))} сом.`;
      text += `\n\nПромокод: ${p.code}`;
      // Пробелы — как %20 (не «+»): так текст в WhatsApp точно без плюсов
      url.searchParams.delete('text');
      const rest = url.searchParams.toString();
      if (navigator.sendBeacon) navigator.sendBeacon('/api/promo/' + p.code + '/click');
      close();
      location.href = url.origin + url.pathname + '?' + (rest ? rest + '&' : '') + 'text=' + encodeURIComponent(text);
    });
  }

  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a.lx-tier-btn');
    if (!a) return;
    e.preventDefault();
    if (!dlg) build();
    pending = a;
    dlg.querySelector('.lx-pask-err').textContent = '';
    dlg.querySelector('input').value = '';
    dlg.classList.add('on');
    setTimeout(() => dlg.querySelector('input').focus(), 50);
  });
})();
