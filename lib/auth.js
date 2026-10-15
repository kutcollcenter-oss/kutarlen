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

const sign = (secret, user, payload) =>
  crypto.createHmac('sha256', secret + user.hash).update(payload).digest('hex');

function makeToken(secret, user, days) {
  const exp = Date.now() + days * 864e5;
  const payload = `${user.id}.${exp}`;
  return `${payload}.${sign(secret, user, payload)}`;
}

function readToken(secret, token, findUser) {
  const [id, exp, sig] = String(token || '').split('.');
  if (!id || !exp || !sig || Number(exp) < Date.now()) return null;
  const user = findUser(id);
  if (!user) return null;
  const good = sign(secret, user, `${id}.${exp}`);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good)) ? user : null;
}

module.exports = { hashPassword, checkPassword, generatePassword, makeToken, readToken };
