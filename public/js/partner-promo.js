// /partner: в каждом тарифе две кнопки — «Подключить…» (сразу WhatsApp, без промокода)
// и «У меня есть промокод». Вторая открывает окно: вписал код → в WhatsApp уходит сообщение
// этого тарифа с ценой со скидкой и строкой «Промокод: …». Больше нигде на странице промокода нет (решение 27.11.2026).
(function () {
  const nf = new Intl.NumberFormat('ru-RU');
  let dlg = null, pending = null;

  function build() {
    dlg = document.createElement('div');
    dlg.className = 'lx-pask';
    dlg.innerHTML = `<div class="lx-pask-box" role="dialog" aria-modal="true" aria-labelledby="lxAskT">
      <button type="button" class="lx-pask-x" aria-label="Закрыть">×</button>
      <h3 id="lxAskT">Промокод</h3>
      <p class="lx-pask-tier"></p>
      <form><input name="code" maxlength="20" autocomplete="off" autocapitalize="characters" aria-label="Промокод" placeholder="Впишите промокод">
        <div class="lx-pask-err" aria-live="polite"></div>
        <button class="lx-btn gold" type="submit">Написать с промокодом</button></form>
    </div>`;
    document.body.appendChild(dlg);
    const close = () => { dlg.classList.remove('on'); pending = null; };
    dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('.lx-pask-x')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && dlg.classList.contains('on')) close(); });
    dlg.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const a = pending; if (!a) return;
      const code = dlg.querySelector('input').value.trim(); // русские буквы сервер понимает сам
      const err = dlg.querySelector('.lx-pask-err');
      if (!code) { err.textContent = 'Впишите промокод'; return; }
      const r = await fetch('/api/promo/' + encodeURIComponent(code)).catch(() => null);
      if (!r) { err.textContent = 'Нет связи — попробуйте ещё раз'; return; }
      if (!r.ok) { err.textContent = 'Такого промокода нет — проверьте написание'; return; }
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
    const b = e.target.closest && e.target.closest('.lx-tier-promo');
    if (!b) return;
    const a = b.closest('.lx-tier') && b.closest('.lx-tier').querySelector('a.lx-tier-btn');
    if (!a) return;
    if (!dlg) build();
    pending = a;
    const name = b.closest('.lx-tier').querySelector('.lx-tier-name');
    dlg.querySelector('.lx-pask-tier').textContent = `Тариф «${name ? name.textContent : ''}». Впишите промокод — скидка будет в сообщении.`;
    dlg.querySelector('.lx-pask-err').textContent = '';
    dlg.querySelector('input').value = '';
    dlg.classList.add('on');
    setTimeout(() => dlg.querySelector('input').focus(), 50);
  });
})();
