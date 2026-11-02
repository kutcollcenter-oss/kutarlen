// Очередь на новый ЖК: запись клиента (сначала показываем данные для проверки, потом отправляем)
// и «Проверить мою запись» — по ИНН + № ID-карты, с правкой и удалением.
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = (window.__DATA__ || {}).slug;
  const ROOMS = [[1, '1-комнатная'], [2, '2-комнатная'], [3, '3-комнатная'], [4, '4 комнаты и больше']];
  const LABELS = {
    fio: 'ФИО', birth: 'Дата рождения', idNo: '№ ID-карты', inn: 'ИНН (ПИН)', issuedBy: 'Кем выдана', issueDate: 'Дата выдачи',
    address: 'Адрес прописки', phone1: 'Телефон', phone2: 'Второй телефон',
  };
  const KEYS = Object.keys(LABELS);
  const fmtDate = d => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('.') : d || '—');
  const roomName = n => (ROOMS.find(r => r[0] === n) || [0, '—'])[1];

  async function send(method, url, body) {
    const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    let j = {};
    try { j = await r.json(); } catch (e) { /* пустой ответ */ }
    return { ok: r.ok, status: r.status, data: j };
  }

  // Список квартир: в каждой строке — сколько комнат и пожелания, лишнюю можно убрать
  function wantsBox(box, list) {
    const row = (rooms, wish = '') => {
      const d = document.createElement('div');
      d.className = 'qwant';
      d.innerHTML = `<span class="qwant-n"></span><select aria-label="Сколько комнат">${ROOMS.map(([v, t]) => `<option value="${v}"${v === rooms ? ' selected' : ''}>${t}</option>`).join('')}</select><button type="button" class="qdel" aria-label="Убрать">×</button><input class="qwish" type="text" maxlength="200" placeholder="Пожелания: например, 3 этаж, окна на юг" value="${esc(wish)}">`;
      d.querySelector('.qdel').onclick = () => { d.remove(); renum(); };
      box.appendChild(d);
      renum();
    };
    const renum = () => [...box.children].forEach((c, i, all) => {
      c.querySelector('.qwant-n').textContent = `Квартира ${i + 1}`;
      c.querySelector('.qdel').hidden = all.length < 2;
    });
    (list && list.length ? list : [{ rooms: 1 }]).forEach(w => row(w.rooms, w.wish));
    return { add: () => { if (box.children.length < 5) row(1); }, get: () => [...box.children].map(c => ({ rooms: +c.querySelector('select').value, wish: c.querySelector('.qwish').value.trim() })) };
  }

  const showErrors = (root, errors) => {
    root.querySelectorAll('.qerr').forEach(e => { e.textContent = errors[e.dataset.err] || ''; });
    const first = Object.keys(errors).map(k => root.querySelector(`[data-err="${k}"]`)).find(e => e && e.textContent);
    if (first) first.closest('.qf, .qconsent, form, div').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const readFields = (root, prefix) => Object.fromEntries(KEYS.map(k => [k, (root.querySelector(`#${prefix}_${k}`) || {}).value || '']));

  // Сводка для проверки
  const summary = (d, wants) => `<dl class="qsum">${KEYS.map(k => `<div><dt>${LABELS[k]}</dt><dd>${esc(/birth|issueDate/.test(k) ? fmtDate(d[k]) : d[k] || '—')}</dd></div>`).join('')}
    <div><dt>Квартиры</dt><dd>${wants.map((w, i) => `${i + 1}) ${roomName(w.rooms)}${w.wish ? ` — ${esc(w.wish)}` : ''}`).join('<br>')}</dd></div></dl>`;

  // ---------- Заполнить по фото ID-карты ----------
  // Фото уходят на наш сервер только для распознавания и там не сохраняются
  function scanBox(box, url, prefix) {
    if (!box) return;
    const inputs = [...box.querySelectorAll('input[type=file]')];
    const go = box.querySelector('.qscan-go'), msg = box.querySelector('.qscan-msg');
    inputs.forEach(i => i.onchange = () => {
      i.closest('.qfile').classList.toggle('qfile-on', !!i.files.length);
      if (i.files.length) i.nextElementSibling.textContent = `✓ ${i.dataset.side === 'front' ? 'Лицевая сторона' : 'Оборот'}`;
      go.disabled = !inputs.some(x => x.files.length);
    });
    go.onclick = async () => {
      const fd = new FormData();
      inputs.forEach(i => { if (i.files[0]) fd.append('cards', i.files[0]); });
      go.disabled = true; msg.className = 'qscan-msg'; msg.textContent = 'Распознаём… обычно 5–15 секунд';
      let j = {}, ok = false;
      try { const r = await fetch(url, { method: 'POST', body: fd }); ok = r.ok; j = await r.json(); } catch (e) { j = { error: 'Нет связи. Проверьте интернет.' }; }
      go.disabled = false;
      if (!ok) { msg.classList.add('qscan-bad'); msg.textContent = j.error || 'Не получилось. Заполните поля вручную.'; return; }
      // Клиент уже в очереди — поля не заполняем, ведём туда, где его запись
      if (j.queued) {
        const m = j.queued.manager || {};
        msg.classList.add('qscan-found');
        msg.innerHTML = j.queued.code === 'mine'
          ? `<b>Вы уже в очереди у этого менеджера.</b> Посмотреть запись, исправить данные или добавить квартиру можно в разделе «Проверить мою запись».<a class="btn btn-primary" href="/${esc(slug)}/ochered/proverka">Проверить мою запись</a>`
          : `<b>Вы уже в очереди у менеджера ${esc(m.name)}.</b> Записаться можно только у одного менеджера. Чтобы добавить ещё квартиру или исправить данные — перейдите на его сайт.<a class="btn btn-primary" href="${esc(m.url)}/ochered/proverka">Перейти к менеджеру ${esc(m.name)}</a>`;
        return;
      }
      const got = KEYS.filter(k => j[k]);
      got.forEach(k => { const el = document.getElementById(`${prefix}_${k}`); if (el) { el.value = j[k]; el.classList.add('qfilled'); } });
      if (!got.length) { msg.classList.add('qscan-bad'); msg.textContent = 'Не удалось прочитать карту. Попробуйте фото чётче или заполните вручную.'; return; }
      const miss = ['fio', 'birth', 'idNo', 'inn', 'issuedBy', 'issueDate', 'address'].filter(k => !j[k]).map(k => LABELS[k]);
      msg.innerHTML = `Заполнено полей: ${got.length}. <b>Сверьте каждое с паспортом</b>${miss.length ? `, допишите: ${esc(miss.join(', '))}` : ''}. Телефон введите сами.`
        + (j.innMatchesBirth === false ? '<br><b>Внимание:</b> дата рождения не совпадает с ИНН — проверьте обе.' : '');
    };
  }

  // ---------- Запись ----------
  const form = $('qForm');
  if (form) {
    scanBox($('qScan'), `/api/queue/${slug}/scan`, 'q');
    const wants = wantsBox($('qWants'));
    $('qAddWant').onclick = wants.add;
    const review = $('qReview');
    form.onsubmit = e => {
      e.preventDefault();
      const d = readFields(form, 'q');
      const w = wants.get();
      const errors = {};
      KEYS.filter(k => k !== 'phone2').forEach(k => { if (!d[k].trim()) errors[k] = 'Заполните это поле'; });
      if (!$('q_consent').checked) errors.consent = 'Без согласия записать нельзя';
      showErrors(form, errors);
      if (Object.keys(errors).length) return;
      form.hidden = true;
      review.hidden = false;
      review.innerHTML = `<h2>Проверьте данные</h2><p class="qhint">Сверьте с паспортом. Ошибка в ИНН или номере ID-карты помешает оформить покупку.</p>
        ${summary(d, w)}<div class="qerr qbig" id="qSendErr"></div>
        <div class="qbtns"><button class="btn" type="button" id="qBack">Исправить</button><button class="btn btn-primary" type="button" id="qGo">Всё верно — записаться</button></div>`;
      review.scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('qBack').onclick = () => { review.hidden = true; form.hidden = false; };
      $('qGo').onclick = async () => {
        $('qGo').disabled = true;
        const r = await send('POST', `/api/queue/${slug}/join`, { ...d, wants: w, consent: true }).catch(() => ({ ok: false, data: { error: 'Нет связи. Проверьте интернет и нажмите ещё раз.' } }));
        $('qGo').disabled = false;
        if (r.ok) {
          review.innerHTML = `<div class="qdone"><div class="qdone-i">✓</div><h2>Вы записаны</h2><p>Менеджер свяжется с вами, когда начнутся продажи. Проверить или исправить свои данные можно в разделе «Проверить мою запись» — по ИНН и номеру ID-карты.</p><a class="btn" href="/${esc(slug)}/ochered/proverka">Проверить мою запись</a></div>`;
          return;
        }
        if (r.data.errors) { review.hidden = true; form.hidden = false; showErrors(form, r.data.errors); return; }
        if (r.data.code === 'mine') {
          review.innerHTML = `<div class="qdone"><h2>Вы уже записаны</h2><p>Вы уже в очереди у этого менеджера. В разделе «Проверить мою запись» можно добавить квартиры или исправить данные.</p><a class="btn btn-primary" href="/${esc(slug)}/ochered/proverka">Проверить мою запись</a></div>`;
          return;
        }
        if (r.data.code === 'other' && r.data.manager) {
          review.innerHTML = `<div class="qdone"><h2>Вы уже в очереди</h2><p>Вы записаны у менеджера <b>${esc(r.data.manager.name)}</b>. Записаться можно только у одного менеджера.</p><a class="btn btn-primary" href="${esc(r.data.manager.url)}/ochered/proverka">Перейти к менеджеру ${esc(r.data.manager.name)}</a></div>`;
          return;
        }
        $('qSendErr').textContent = r.data.error || 'Не получилось записать. Попробуйте ещё раз.';
      };
    };
  }

  // ---------- Проверить мою запись ----------
  const check = $('qCheck'), mine = $('qMine');
  let auth = null;
  const field = (k, v) => {
    const type = /birth|issueDate/.test(k) ? 'date' : /phone/.test(k) ? 'tel' : 'text';
    return `<label class="qf"><span>${LABELS[k]}</span><input id="m_${k}" type="${type}" value="${esc(v)}"><em class="qerr" data-err="${k}"></em></label>`;
  };
  function showMine(rec) {
    mine.hidden = false;
    mine.innerHTML = `<div class="qfound">Ваша запись найдена${rec.manager ? ` · менеджер <a href="${esc(rec.manager.url)}">${esc(rec.manager.name)}</a>` : ''}</div>
      <form id="qEdit" novalidate><div class="qgrid">${KEYS.map(k => field(k, rec[k])).join('')}</div>
      <h2>Квартиры</h2><div id="mWants"></div><button type="button" class="qadd" id="mAddWant">+ Ещё квартира</button><em class="qerr" data-err="wants"></em>
      <div class="qerr qbig" id="mErr"></div>
      <div class="qbtns"><button class="btn btn-primary" type="submit">Сохранить изменения</button></div></form>
      <button type="button" class="qremove" id="mDel">Удалить мою запись и отозвать согласие</button>`;
    const w = wantsBox($('mWants'), rec.wants);
    $('mAddWant').onclick = w.add;
    const ed = $('qEdit');
    ed.onsubmit = async e => {
      e.preventDefault();
      const d = readFields(ed, 'm');
      const r = await send('PUT', '/api/queue/me', { ...auth, ...d, wants: w.get() }).catch(() => ({ ok: false, data: { error: 'Нет связи. Попробуйте ещё раз.' } }));
      if (r.ok) { auth = { authInn: r.data.inn, authIdNo: r.data.idNo }; showMine(r.data); mine.querySelector('.qfound').insertAdjacentHTML('afterend', '<p class="qsaved">Изменения сохранены ✓</p>'); return; }
      if (r.data.errors) return showErrors(ed, r.data.errors);
      $('mErr').textContent = r.data.error || 'Не получилось сохранить.';
    };
    // Подтверждение прямо на странице: всплывающее окно confirm() браузер Instagram и другие встроенные браузеры не показывают
    $('mDel').onclick = () => {
      const del = $('mDel');
      del.hidden = true;
      del.insertAdjacentHTML('afterend', `<div class="qdel-ask" id="mDelAsk"><b>Точно удалить вашу запись?</b>
        <p>Данные будут стёрты, место в очереди пропадёт. Вернуть нельзя.</p><div class="qerr qbig" id="mDelErr"></div>
        <div class="qbtns"><button type="button" class="btn" id="mDelNo">Отмена</button><button type="button" class="btn qdel-yes" id="mDelYes">Да, удалить</button></div></div>`);
      $('mDelAsk').scrollIntoView({ behavior: 'smooth', block: 'center' });
      $('mDelNo').onclick = () => { $('mDelAsk').remove(); del.hidden = false; };
      $('mDelYes').onclick = async () => {
        $('mDelYes').disabled = true;
        const r = await send('DELETE', '/api/queue/me', auth).catch(() => ({ ok: false, data: { error: 'Нет связи. Проверьте интернет.' } }));
        if (r.ok) { auth = null; mine.innerHTML = '<div class="qdone"><div class="qdone-i">✓</div><h2>Запись удалена</h2><p>Ваши данные стёрты из очереди, согласие отозвано.</p></div>'; mine.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
        $('mDelYes').disabled = false;
        $('mDelErr').textContent = r.data.error || 'Не получилось удалить. Попробуйте ещё раз.';
      };
    };
  }
  if (check) check.onsubmit = async e => {
    e.preventDefault();
    const a = { authInn: $('c_inn').value, authIdNo: $('c_idNo').value };
    const r = await send('POST', '/api/queue/check', a).catch(() => ({ ok: false, data: { error: 'Нет связи. Проверьте интернет.' } }));
    showErrors(check, r.ok ? {} : { check: r.data.error || 'Запись не найдена' });
    if (!r.ok) { mine.hidden = true; return; }
    auth = a;
    showMine(r.data);
    mine.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
})();
