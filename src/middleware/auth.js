const db = require('../db');

function loadUsers(req, res, next) {
  res.locals.customer = null;
  res.locals.admin = null;
  if (req.session.customerId) {
    const c = db.prepare('SELECT id, name, email, phone FROM customers WHERE id = ?').get(req.session.customerId);
    if (c) { req.customer = c; res.locals.customer = c; } else delete req.session.customerId;
  }
  if (req.session.adminId) {
    const a = db.prepare('SELECT id, name, email FROM admins WHERE id = ?').get(req.session.adminId);
    if (a) { req.admin = a; res.locals.admin = a; } else delete req.session.adminId;
  }
  next();
}

function requireCustomer(req, res, next) {
  if (req.customer) return next();
  res.redirect('/account/login?next=' + encodeURIComponent(req.originalUrl));
}

function requireAdmin(req, res, next) {
  if (req.admin) return next();
  if (req.method !== 'GET') return res.status(401).send('Please log in again.');
  res.redirect('/admin/login?next=' + encodeURIComponent(req.originalUrl));
}

/**
 * Very small in-memory limiter for login forms: max `limit` attempts per key per window.
 * Sets req.rateLimited so the route can show a friendly message instead of checking the password.
 */
function loginLimiter({ limit = 10, windowMs = 15 * 60 * 1000 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const key = `${req.ip}|${String(req.body?.email || '').toLowerCase()}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
    } else if (++entry.count > limit) {
      req.rateLimited = true;
    }
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    next();
  };
}

module.exports = { loadUsers, requireCustomer, requireAdmin, loginLimiter };
