// Пароли и сессии кабинетов.
// Пароли хранятся только как хэш scrypt с солью. Сессия — подписанная cookie;
// подпись включает хэш пароля, поэтому смена пароля сразу завершает все старые сессии.
const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function checkPassword(user, password) {
  if (!user || !user.hash || typeof password !== 'string') return false;
  const test = crypto.scryptSync(password, user.salt, 64);
  const good = Buffer.from(user.hash, 'hex');
  return test.length === good.length && crypto.timingSafeEqual(test, good);
}

// Читаемый пароль без похожих символов (0/O, 1/l)
function generatePassword(len = 10) {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, b => abc[b % abc.length]).join('');
}

// sessVer — «поколение» сессий: кнопка «Выйти на всех устройствах» меняет его, и все старые cookie перестают подходить
const sign = (secret, user, payload) =>
  crypto.createHmac('sha256', secret + user.hash + (user.sessVer ? '.' + user.sessVer : '')).update(payload).digest('hex');

// Сессия «чужое устройство» (short): живёт ms миллисекунд и продлевается, пока человек пользуется кабинетом.
// Её cookie: id.exp.s.подпись; обычная («моё устройство»): id.exp.подпись
function makeToken(secret, user, days, short = false, ms = 0) {
  const exp = Date.now() + (short ? ms : days * 864e5);
  const payload = `${user.id}.${exp}${short ? '.s' : ''}`;
  return `${payload}.${sign(secret, user, payload)}`;
}

// → { user, short, exp } или null
function readSession(secret, token, findUser) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 && !(parts.length === 4 && parts[2] === 's')) return null;
  const sig = parts.pop(), [id, exp] = parts;
  if (!id || !exp || !sig || Number(exp) < Date.now()) return null;
  const user = findUser(id);
  if (!user) return null;
  const good = sign(secret, user, parts.join('.'));
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  return { user, short: parts.length === 3, exp: Number(exp) };
}

const readToken = (secret, token, findUser) => { const s = readSession(secret, token, findUser); return s ? s.user : null; };

module.exports = { hashPassword, checkPassword, generatePassword, makeToken, readToken, readSession };
