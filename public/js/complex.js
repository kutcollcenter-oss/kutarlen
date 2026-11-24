// Страница ЖК: вкладки категорий и комнат, сводка «от … м² · от …», листание и просмотр фото
(function () {
  const L = window.RS.t;
  const D = window.__DATA__;
  const $ = id => document.getElementById(id);
  const rows = [...document.querySelectorAll('.zk-apt')];
  let type = (D.complex && D.complex.type) || (rows[0] && rows[0].dataset.t);
  let room = '', stage = '';
  const ROOM_ORDER = ['0', '1', '2', '3', '4', 'commercial', 'land'];
  // Подписи как на elitka.kg: «1-комнатные», «Студии», «4+-комнатные»
  const roomName = (r, g) => (r === '0' ? L('zkStudios') : /^\d$/.test(r) ? L('zkRoomsFull', { n: r === '4' ? '4+' : r }) : g[0].dataset.l);

  // Пришли с главной после фильтра: показываем только подходящие квартиры (ids) и кнопку «Показать все».
  // Выбранный взнос (down) передаём дальше — на странице квартиры расчёт будет с ним.
  const q = window.RS.params || new URLSearchParams(location.search); // common.js уже убрал down из адреса, но сохранил здесь
  let only = q.get('ids') ? new Set(q.get('ids').split('.')) : null;
  const wantDown = +q.get('down') || 0;
  if (wantDown) rows.forEach(x => { if (x.dataset.down && wantDown > +x.dataset.down) x.href = `${x.getAttribute('href')}?down=${wantDown}`; });
  function drawOnly(all) {
    const box = $('zkOnly');
    const n = all.filter(x => only && only.has(x.dataset.id)).length;
    box.hidden = !only || !n;
    if (box.hidden) return;
    box.innerHTML = `${L('zkOnly', { n, m: all.length })} · <button type="button" id="zkAll">${L('zkShowAll')}</button>`;
    $('zkAll').onclick = () => { only = null; history.replaceState(null, '', location.pathname + `?t=${type}`); draw(); };
  }

  const yearsOf = x => (x.dataset.y ? x.dataset.y.split(' ') : []);
  function draw() {
    // Цифры вверху — выбранной категории
    document.querySelectorAll('.zkp-facts').forEach(x => { x.hidden = x.dataset.t !== type; });
    const allType = rows.filter(x => x.dataset.t === type);
    if (only && !allType.some(x => only.has(x.dataset.id))) only = null; // в этой категории нет выбранных — показываем все
    drawOnly(allType);
    const inType = only ? allType.filter(x => only.has(x.dataset.id)) : allType;
    // Этапы сдачи (например, 2028 и 2030) — вкладками, если их больше одного
    const years = [...new Set(inType.flatMap(yearsOf))].sort();
    if (stage && !years.includes(stage)) stage = '';
    const sb = $('zkStages');
    sb.innerHTML = years.length > 1
      ? [['', L('zkAllStages')], ...years.map(y => [y, `${sb.dataset.label} ${y}`])]
        .map(([v, label]) => `<button type="button" data-v="${v}" class="${v === stage ? 'on' : ''}">${label}</button>`).join('')
      : '';
    const ofType = inType.filter(x => !stage || yearsOf(x).includes(stage));
    const keys = ROOM_ORDER.filter(r => ofType.some(x => x.dataset.r === r));
    if (room && !keys.includes(room)) room = '';
    // Вкладки комнат: «Все» + по одной на каждое число комнат (только если вариантов больше одного)
    $('zkRooms').innerHTML = keys.length > 1
      ? [['', L('zkAll'), ofType.length], ...keys.map(r => { const g = ofType.filter(x => x.dataset.r === r); return [r, roomName(r, g), g.length]; })]
        .map(([v, label]) => `<button type="button" data-v="${v}" class="${v === room ? 'on' : ''}">${label}</button>`).join('')
      : '';
    const shown = ofType.filter(x => !room || x.dataset.r === room);
    rows.forEach(x => { x.hidden = !shown.includes(x); });
    // Сводка: площади, самая низкая цена, сколько предложений
    if (shown.length) {
      const areas = shown.map(x => +x.dataset.area);
      const a = Math.min(...areas), b = Math.max(...areas);
      const best = shown.reduce((m, x) => (+x.dataset.v < +m.dataset.v ? x : m), shown[0]);
      $('zkSum').innerHTML = [
        a === b ? `${a} м²` : L('zkArea', { a, b }),
        L('objFrom', { x: best.querySelector('.zk-apt-price b').innerHTML }),
        L('zkOffers', { n: shown.length }),
      ].join(' · ');
    } else $('zkSum').textContent = '';
  }
  if ($('zkTypes')) $('zkTypes').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    type = b.dataset.v; room = ''; stage = '';
    $('zkTypes').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    draw();
  });
  $('zkStages').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    stage = b.dataset.v; room = ''; draw();
  });
  $('zkRooms').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    room = b.dataset.v; draw();
  });
  draw();

  // Фото ЖК: листаются сами и пальцем, по нажатию — на весь экран
  const ph = $('zkPhoto');
  if (ph && ph.querySelector('.cp-track')) {
    window.RS.slides([ph]);
    const srcs = [...ph.querySelectorAll('.cp-track img')].map(i => i.src);
    ph.addEventListener('click', () => window.RS.lightbox(srcs, +(ph.dataset.i || 0)));
  }
})();
