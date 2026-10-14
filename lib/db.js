// Хранилище: один JSON-файл + ежедневные резервные копии
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP_BACKUPS = 30;

let state = null;

function exists() {
  return fs.existsSync(DB_FILE);
}

function load() {
  state = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  state.events = state.events || [];
  return state;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function write(data) {
  state = data;
  save();
}

function backup() {
  if (!exists()) return;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const target = path.join(BACKUP_DIR, `db-${day}.json`);
  fs.copyFileSync(DB_FILE, target);
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('db-')).sort();
  files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))
    .forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
}

function scheduleBackups() {
  backup();
  setInterval(backup, 24 * 60 * 60 * 1000).unref();
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

module.exports = {
  get data() { return state; },
  exists, load, save, write, backup, scheduleBackups, newId, DATA_DIR,
};
