// ИИ-помощник на сайте менеджера: кнопка внизу справа и окно чата.
// Разговор хранится в этой вкладке (sessionStorage). Если владелец включил журнал (D.aiLog),
// сервер сохраняет текст разговора на 30 дней, чтобы владелец видел ошибки ИИ и учил его.
(function () {
  const D = window.__DATA__ || {};
  if (!D.ai || !D.slug) return;
  const ky = D.lang === 'ky';
  const s = D.settings || {};
  const T = ky ? {
    fab: 'Суроо берүү', title: 'Жардамчы', sub: 'ИИ-жардамчы · онлайн', ph: 'Суроо жазыңыз…',
    hello: `Салам! Мен ${s.name || 'менеджердин'} жардамчысымын. Батир тандоого жардам берем: бюджетиңизди же канча бөлмө керек экенин жазыңыз.`,
    helloApt: 'Салам! Бул батир боюнча суроолоруңуз барбы? Баасы, бөлүп төлөө, тапшыруу мөөнөтү — сураңыз.',
    helloSeen: 'Салам! Бир нече батирди карап чыктыңыз — салыштырып, бюджетиңизге ылайыгын тандоого жардам берейинби?', tip: 'Тандоого жардам берейинби? Айлык төлөмдү эсептеп берем',
    chips: ['Батир тандоо', 'Алгачкы төлөм канча?', 'Бөлүп төлөө кандай?', '1 бөлмөлүү барбы?'],
    wa: 'WhatsApp', more: 'Толугураак', month: '/ай', err: 'Байланыш жок. Кайра аракет кылыңыз.', send: 'Жөнөтүү', close: 'Жабуу',
    note: 'ИИ жаңылышы мүмкүн — так маалыматты менеджер WhatsAppта берет.', noteLog: ' Жардамчы жакшыраак болушу үчүн кат алышуу сакталат.', waAbout: 'Ушул батир боюнча',
  } : {
    fab: 'Спросить', title: 'Помощник', sub: 'ИИ-помощник · онлайн', ph: 'Напишите вопрос…',
    hello: `Здравствуйте! Я помощник ${s.name ? `менеджера ${s.name}` : 'менеджера'}. Помогу подобрать квартиру — напишите бюджет или сколько комнат нужно.`,
    helloApt: 'Здравствуйте! Есть вопросы по этой квартире? Цена, рассрочка, срок сдачи — спрашивайте.',
    helloSeen: 'Здравствуйте! Вижу, вы посмотрели несколько квартир — помочь сравнить и выбрать под ваш бюджет?', tip: 'Помочь с выбором? Посчитаю платёж под ваш бюджет',
    chips: ['Подобрать квартиру', 'Какой первый взнос?', 'Как работает рассрочка?', 'Есть 1-комнатные?'],
    wa: 'WhatsApp', more: 'Подробнее', month: '/мес', err: 'Нет связи. Попробуйте ещё раз.', send: 'Отправить', close: 'Закрыть',
    note: 'ИИ может ошибаться — точные условия подтвердит менеджер в WhatsApp.', noteLog: ' Переписка сохраняется, чтобы помощник отвечал лучше.', waAbout: 'Про эту квартиру',
  };
  const aptId = D.apartment ? D.apartment.id : '';
  const KEY = `aichat:${D.slug}`;
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const wa = (text) => `https://wa.me/${String(s.whatsapp || '').replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5c.4 3.9 1.5 6.4 3.3 7.9 1.5 1.3 3.6 1.9 6.2 2.1-3.9.4-6.4 1.5-7.9 3.3-1.3 1.5-1.9 3.6-2.1 6.2-.4-3.9-1.5-6.4-3.3-7.9C6.7 12.8 4.6 12.2 2 12c3.9-.4 6.4-1.5 7.9-3.3C9.2 7.2 11.8 5.1 12 2.5Z"/><path fill="currentColor" d="M19 2c.2 1.6.7 2.4 2 3-1.3.4-1.8 1.2-2 3-.2-1.6-.7-2.4-2-3 1.3-.4 1.8-1.2 2-3Z" opacity=".7"/></svg>';

  let msgs = [];   // { role: 'user'|'assistant', content, cards? }
  try { msgs = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) {}
  // Номер разговора — чтобы ответы одного разговора лежали в журнале вместе
  let chatId = '';
  try { chatId = sessionStorage.getItem(KEY + ':id') || ''; if (!chatId) { chatId = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); sessionStorage.setItem(KEY + ':id', chatId); } } catch (e) {}
  const store = () => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-30))); } catch (e) {} };

  // ---------- Что гость делает на сайте (только в этой вкладке; уходит ИИ вместе с вопросом) ----------
  const JKEY = `aijourney:${D.slug}`;
  let J = { steps: [], seen: {} };   // steps — действия по порядку; seen — квартира → сколько секунд смотрел
  try { J = { ...J, ...JSON.parse(sessionStorage.getItem(JKEY) || '{}') }; } catch (e) {}
  const saveJ = () => { try { sessionStorage.setItem(JKEY, JSON.stringify(J)); } catch (e) {} };
  const step = text => { if (J.steps[J.steps.length - 1] !== text) { J.steps.push(text); J.steps = J.steps.slice(-15); saveJ(); } };
  const $ = id => document.getElementById(id);
  const fmtMoney = (n, c) => (window.RS && window.RS.money ? window.RS.money(n, c) : `${n} ${c || ''}`);
  const A = D.apartment;
  if (A) {
    const label = `${A.roomsLabel}, ${A.area} ${A.unit}${A.title ? ` (${A.title})` : ''} — ${fmtMoney(A.price, A.currency)}${A.installment ? `, взнос от ${fmtMoney(A.down, A.currency)}` : ''}`;
    step(`Открыл квартиру ID ${A.id}: ${label}`);
    const seen = J.seen[A.id] || (J.seen[A.id] = { label, sec: 0 });
    // Время на странице квартиры: считаем, только пока вкладка на экране
    setInterval(() => { if (!document.hidden) { seen.sec += 5; saveJ(); } }, 5000);
    const calcStep = () => { const v = $('cDownInput'), m = $('cMonthly'); if (v && m) step(`В калькуляторе поставил взнос ${v.value} ${A.currency} → платёж ${m.textContent} в месяц`); };
    if ($('cDown')) $('cDown').addEventListener('change', calcStep);
    if ($('cDownInput')) $('cDownInput').addEventListener('change', calcStep);
  } else if (D.page === 'home') {
    step('Открыл главную страницу (каталог)');
    // Фильтр: записываем итог через секунду после последнего изменения
    let ft = 0;
    const filt = () => { clearTimeout(ft); ft = setTimeout(() => {
      const sum = $('fSum');
      const tabs = [...new Set([...document.querySelectorAll('.ftop .on, .ftop [aria-selected="true"]')].map(t => t.textContent.trim()))];
      const parts = [...tabs, sum && !$('fBadge').hidden && sum.textContent.trim()].filter(Boolean);
      if (parts.length) step(`Фильтр: ${parts.join(' · ')}`);
    }, 1200); };
    ['change', 'click'].forEach(t => document.addEventListener(t, e => { if (e.target.closest && e.target.closest('#filter, .ftop, .filter')) filt(); }));
  }
  // Фото в полноэкранном просмотре и нажатия WhatsApp
  new MutationObserver(() => { if (document.documentElement.classList.contains('lb-on')) step(A ? 'Листал фото квартиры на весь экран' : 'Смотрел фото на весь экран'); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('click', e => {
    const w = e.target.closest && e.target.closest('[data-wa]');
    if (w && !w.closest('.ai-box')) step(`Нажимал кнопку WhatsApp (${w.dataset.wa})`);
  });
  const journey = () => {
    const mins = s => (s >= 60 ? `${Math.round(s / 60)} мин` : `${s} сек`);
    const time = Object.values(J.seen).filter(x => x.sec >= 10).map(x => `Смотрел ${mins(x.sec)}: ${x.label}`);
    return [...J.steps, ...time].slice(-20);
  };
  const seenCount = () => Object.keys(J.seen).length;

  const fab = document.createElement('button');
  fab.type = 'button'; fab.className = 'ai-fab'; fab.setAttribute('aria-label', T.fab);
  fab.innerHTML = `${SPARK}<span>${T.fab}</span>`;

  const box = document.createElement('div');
  box.className = 'ai-box'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', T.title);
  box.innerHTML = `
    <div class="ai-head">
      <span class="ai-ava">${s.photo ? `<img src="${esc(s.photo)}" alt="">` : SPARK}<i>${SPARK}</i></span>
      <span class="ai-who"><b>${esc(s.name || T.title)}</b><small><em></em>${T.sub}</small></span>
      ${s.whatsapp ? `<a class="ai-wa" href="${esc(wa(''))}" target="_blank" rel="noopener" data-wa="aichat"${aptId ? ` data-id="${esc(aptId)}"` : ''}>${D.waIcon || ''}<span>${T.wa}</span></a>` : ''}
      <button type="button" class="ai-x" aria-label="${T.close}">✕</button>
    </div>
    <div class="ai-log" aria-live="polite"></div>
    <div class="ai-chips"></div>
    <form class="ai-form">
      <textarea rows="1" maxlength="800" placeholder="${T.ph}" aria-label="${T.ph}"></textarea>
      <button type="submit" aria-label="${T.send}"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z"/></svg></button>
    </form>
    <div class="ai-note">${T.note}${D.aiLog ? T.noteLog : ''}</div>`;
  const shade = document.createElement('div'); shade.className = 'ai-shade';
  document.body.append(shade, box, fab);

  const log = box.querySelector('.ai-log');
  const chips = box.querySelector('.ai-chips');
  const form = box.querySelector('.ai-form');
  const input = form.querySelector('textarea');
  let busy = false;

  // Текст ИИ: **жирный**, переносы строк; коды [[apt:ID]] убираем — вместо них карточки
  const fmt = t => esc(String(t).replace(/[ \t]*\[\[apt:[\w-]+\]\][ \t]*\n?/g, '').replace(/[ \t ​]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim())
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  const card = c => `<div class="ai-card">
      <a class="ai-card-main" href="${esc(c.url)}">
        ${c.photo ? `<img src="${esc(c.photo)}" alt="" loading="lazy">` : '<span class="ai-card-ph"></span>'}
        <span><b>${esc(c.label)}</b>${c.title ? `<small>${esc(c.title)}</small>` : ''}
          <strong>${c.monthly ? `${esc(c.monthly)}<i>${T.month}</i>` : esc(c.price)}</strong></span>
      </a>
      <div class="ai-card-btns"><a href="${esc(c.url)}">${T.more}</a>${s.whatsapp ? `<a class="ai-card-wa" href="${esc(wa(c.waText))}" target="_blank" rel="noopener" data-wa="aichat" data-id="${esc(c.id)}">${D.waIcon || ''}${T.wa}</a>` : ''}</div>
    </div>`;
  const bubble = m => `<div class="ai-msg ai-${m.role === 'user' ? 'me' : 'bot'}"><div class="ai-txt">${m.role === 'user' ? esc(m.content).replace(/\n/g, '<br>') : fmt(m.content)}</div>${(m.cards || []).length ? `<div class="ai-cards">${m.cards.map(card).join('')}</div>` : ''}</div>`;

  // Приветствие: на странице квартиры — про неё; если гость смотрел 2+ квартиры — предложить сравнить
  // Начатый разговор хранит своё приветствие, чтобы оно не менялось посреди беседы
  const greeting = () => {
    let g = ''; try { g = msgs.length ? sessionStorage.getItem(KEY + ':greet') || '' : ''; } catch (e) {}
    return g || (aptId ? T.helloApt : seenCount() >= 2 ? T.helloSeen : T.hello);
  };

  function render() {
    const hello = { role: 'assistant', content: greeting() };
    log.innerHTML = [hello, ...msgs].map(bubble).join('') + (busy ? '<div class="ai-msg ai-bot"><div class="ai-txt ai-dots"><i></i><i></i><i></i></div></div>' : '');
    // Подсказки: в начале — общие, потом — те, что сервер предложил к последнему ответу
    const last = msgs[msgs.length - 1];
    const list = !msgs.length ? T.chips : !busy && last.role === 'assistant' ? last.chips || [] : [];
    chips.innerHTML = list.map(c => `<button type="button">${esc(c)}</button>`).join('');
    // Кнопка WhatsApp вверху: с итогом разговора (что ищет клиент, какие квартиры показали)
    const waTop = box.querySelector('.ai-wa');
    const lastWa = [...msgs].reverse().find(m => m.wa);
    if (waTop && lastWa) waTop.href = lastWa.wa;
    log.scrollTop = log.scrollHeight;
  }

  async function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    msgs = msgs.filter(m => !m.local);
    if (!msgs.length) { try { sessionStorage.setItem(KEY + ':greet', greeting()); } catch (e) {} }
    msgs.push({ role: 'user', content: text.slice(0, 800) });
    input.value = ''; grow();
    busy = true; render(); store();
    try {
      const r = await fetch(`/api/chat/${encodeURIComponent(D.slug)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: D.lang, apt: aptId, chatId, greeting: greeting(), journey: journey(),
          shown: msgs.flatMap(m => (m.cards || []).map(c => c.id)).slice(-3),
          messages: msgs.map(m => ({ role: m.role, content: m.content })) }),
      });
      const d = await r.json();
      if (!r.ok || !d.reply) throw new Error();
      msgs.push({ role: 'assistant', content: d.reply, cards: d.cards || [], chips: (d.chips || []).slice(0, 3), wa: /^https:\/\/wa\.me\//.test(d.wa || '') ? d.wa : '' });
    } catch (e) {
      msgs.pop(); input.value = text; grow();
      msgs.push({ role: 'assistant', content: T.err, local: true });
    }
    busy = false;
    render(); store();
  }

  const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; };
  function open(on) {
    document.documentElement.classList.toggle('ai-open', on);
    if (on) { render(); if (matchMedia('(min-width: 900px)').matches) setTimeout(() => input.focus(), 250); }
  }

  // Подсказка у кнопки: один раз за визит, если гость долго смотрит квартиру или смотрел несколько
  const tip = document.createElement('button');
  tip.type = 'button'; tip.className = 'ai-tip'; tip.innerHTML = `<span>${esc(T.tip)}</span><i aria-label="${T.close}">✕</i>`;
  document.body.append(tip);
  const tipShown = () => { try { return sessionStorage.getItem(KEY + ':tip'); } catch (e) { return '1'; } };
  const hideTip = () => { tip.classList.remove('on'); try { sessionStorage.setItem(KEY + ':tip', '1'); } catch (e) {} };
  const showTip = () => { if (msgs.length || tipShown() || document.documentElement.classList.contains('ai-open')) return; tip.classList.add('on'); setTimeout(hideTip, 12000); };
  if (!tipShown()) setTimeout(showTip, A ? 35000 : seenCount() >= 2 ? 8000 : 60000);
  tip.onclick = e => { hideTip(); if (!e.target.closest('i')) open(true); };

  fab.onclick = () => { hideTip(); open(true); };
  shade.onclick = () => open(false);
  box.querySelector('.ai-x').onclick = () => open(false);
  chips.onclick = e => { const b = e.target.closest('button'); if (b) send(b.textContent); };
  form.onsubmit = e => { e.preventDefault(); send(input.value); };
  input.addEventListener('input', grow);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.documentElement.classList.contains('ai-open')) open(false); });
})();
