const db = require('../db');

let cache = null;

function all() {
  if (!cache) {
    cache = {};
    for (const row of db.prepare('SELECT key, value FROM settings').all()) cache[row.key] = row.value ?? '';
  }
  return cache;
}

function get(key, fallback = '') {
  const v = all()[key];
  return v === undefined || v === null ? fallback : v;
}

function getInt(key, fallback = 0) {
  const n = Number.parseInt(get(key), 10);
  return Number.isFinite(n) ? n : fallback;
}

function setMany(values) {
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  db.transaction(() => {
    for (const [k, v] of Object.entries(values)) stmt.run(k, v == null ? '' : String(v));
  })();
  cache = null;
}

module.exports = { all, get, getInt, setMany };
