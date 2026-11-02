// Сканирование ID-карты КР (бесплатно, прямо на сервере — фото никуда не отправляется и не сохраняется).
// Клиент загружает лицевую сторону и оборот (фото карты или скриншоты «Түндүк»), получает заполненные поля
// и сам проверяет их перед записью. Языки распознавания (≈10 МБ) скачиваются один раз в ocr-cache/.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Tesseract = require('tesseract.js');

const CACHE = path.join(__dirname, '..', 'ocr-cache');
const IDLE_MS = 10 * 60 * 1000; // без сканов 10 минут — выключаем, чтобы не держать память
let worker = null, idleTimer = null, queue = Promise.resolve();

async function getWorker() {
  fs.mkdirSync(CACHE, { recursive: true });
  if (!worker) worker = Tesseract.createWorker(['rus', 'eng'], 1, { cachePath: CACHE }).catch(e => { worker = null; throw e; });
  return worker;
}
function touch() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => { const w = worker; worker = null; try { (await w).terminate(); } catch (e) { /* уже выключен */ } }, IDLE_MS);
  idleTimer.unref();
}
// Фото с телефона бывают огромными и повёрнутыми: поворачиваем по EXIF, уменьшаем, делаем серым
const prepare = buf => sharp(buf).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).grayscale().png().toBuffer();

// Сканы идут по одному, чтобы сервер не перегружался
function scan(buffers) {
  const job = queue.then(async () => {
    const w = await getWorker();
    let text = '';
    for (const b of buffers) text += (await w.recognize(await prepare(b))).data.text + '\n';
    touch();
    return parseIdCard(text);
  });
  queue = job.catch(() => {});
  return job;
}

function parseIdCard(raw) {
  const lines = String(raw).split('\n').map(s => s.trim()).filter(Boolean);
  const all = lines.join('\n');
  const out = {};
  const idx = re => lines.findIndex(l => re.test(l));
  const nextValue = (re, ok = () => true) => {
    const i = idx(re);
    if (i < 0) return '';
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
      if (/^\/|Date of|Personal number|Document|Authority/i.test(lines[j])) continue; // английская подпись того же поля
      if (ok(lines[j])) return lines[j];
    }
    return '';
  };
  const ru = v => String(v || '').split('/')[0].replace(/[^А-ЯЁӨҮҢа-яёөүң\- ]/g, '').trim().split(/\s+/).filter(w => w.length > 1).join(' ');
  const date = v => (String(v || '').match(/\b(\d{2})[.,](\d{2})[.,]((?:19|20)\d{2})\b/) || []);
  const iso = m => (m[0] ? `${m[3]}-${m[2]}-${m[1]}` : '');

  // Лицевая сторона
  const name = ru(nextValue(/Имя|Name/i));
  const surname = ru(nextValue(/Фамилия|Surname/i));
  let patr = ru(nextValue(/Отчество|Patronymic/i));
  if (/Жынысы|Пол|Sex/i.test(patr) || patr.length < 3) patr = '';
  if (surname || name) out.fio = [surname, name, patr].filter(Boolean).join(' ').replace(/\s+/g, ' ');
  const birthLine = nextValue(/Дата рождения|Date of birth/i, l => date(l)[0]);
  if (birthLine) out.birth = iso(date(birthLine));

  // Оборот
  const authority = nextValue(/Орган выдачи|Authority/i);
  if (authority) out.issuedBy = authority.replace(/[^А-ЯЁA-Z0-9\- ]/gi, '').trim();
  const issueLine = nextValue(/Дата выдачи|Date of issue/i, l => date(l)[0]);
  if (issueLine) out.issueDate = iso(date(issueLine));
  const inn = all.replace(/[ ]/g, '').match(/\b[12]\d{13}\b/);
  if (inn) out.inn = inn[0];
  // № документа: «ID» + 7 цифр. Распознавание часто читает «ID» как «10», «1D», «I0»
  const docLine = nextValue(/Документ|Document/i, l => /\d{5,}/.test(l)) || '';
  const doc = docLine.replace(/\s/g, '').toUpperCase().match(/^(ID|1D|I0|10|LD|1O|IO)(\d{7})$/) || docLine.replace(/\s/g, '').toUpperCase().match(/^([A-Z]{2})(\d{7})$/);
  if (doc) out.idNo = (/^[A-Z]{2}$/.test(doc[1]) && doc[1] !== 'IO' && doc[1] !== 'LD' ? doc[1] : 'ID') + doc[2];
  // Адрес: строки после «Адрес прописки» до мусора (значки, короткие обрывки)
  const ai = idx(/Адрес прописки|Address/i);
  if (ai >= 0) {
    const parts = [];
    for (let j = ai + 1; j < lines.length; j++) {
      const l = lines[j];
      if (/[©®]|QR|кодду/i.test(l) || (l.length < 4 && !/^\d+$/.test(l))) break;
      parts.push(l);
    }
    if (parts.length) out.address = parts.join(' ').replace(/\s+/g, ' ').replace(/[!\\|]/g, 'I').replace(/дом\.\s*/i, 'дом ')
      // латинские двойники («a/a», «c.») и римские номера улиц («Шекер-1I» → «Шекер-II»)
      .replace(/\ba\/a\b/g, 'а/а').replace(/(^|[\s,])c\./g, '$1с.')
      .replace(/-([1Il|]{1,4})(?=[\s,]|$)/g, (m, r) => (/[Il|]/.test(r) ? '-' + r.replace(/[1l|]/g, 'I') : m))
      .replace(/,(?=\S)/g, ', ').trim();
  }
  // В ИНН зашита дата рождения (1-я цифра — пол, затем ддммгггг)
  const innBirth = out.inn ? `${out.inn.slice(5, 9)}-${out.inn.slice(3, 5)}-${out.inn.slice(1, 3)}` : '';
  if (!out.birth) {
    // Подпись к дате не распозналась — берём дату с карты, которая совпадает с ИНН, иначе из ИНН
    const dates = [...all.matchAll(/\b(\d{2})[.,](\d{2})[.,]((?:19|20)\d{2})\b/g)].map(iso);
    out.birth = dates.find(d => d === innBirth) || (innBirth && !Number.isNaN(Date.parse(innBirth)) ? innBirth : '');
  }
  if (out.inn && out.birth) out.innMatchesBirth = innBirth === out.birth;
  return out;
}

module.exports = { scan, parseIdCard };
