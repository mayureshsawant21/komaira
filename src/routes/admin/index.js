const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../db');
const analytics = require('../../lib/analytics');
const { requireAdmin, loginLimiter } = require('../../middleware/auth');
const { verifyCsrf } = require('../../middleware/csrf');
const { upload, keepOnlyImages } = require('../../lib/upload');
const { safeNext } = require('../../lib/helpers');

const router = express.Router();

router.use((req, res, next) => {
  res.locals.section = '';
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex');
  next();
});

router.get('/login', (req, res) => {
  if (req.admin) return res.redirect('/admin');
  res.render('admin/login', { title: 'Admin sign in', next: safeNext(req.query.next, '/admin'), email: '' });
});

router.post('/login', loginLimiter({ limit: 8 }), (req, res, next) => {
  const email = String(req.body.email || '').trim();
  const nextUrl = safeNext(req.body.next, '/admin');
  const fail = (msg) => {
    res.locals.flash = { error: msg };
    res.status(401).render('admin/login', { title: 'Admin sign in', next: nextUrl, email });
  };
  if (req.rateLimited) return fail('Too many attempts. Please wait 15 minutes and try again.');
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  if (!admin || !bcrypt.compareSync(String(req.body.password || ''), admin.password_hash)) return fail('Incorrect email or password.');
  const keep = { cart: req.session.cart, customerId: req.session.customerId };
  req.session.regenerate((err) => {
    if (err) return next(err);
    Object.assign(req.session, keep, { adminId: admin.id });
    res.redirect(nextUrl.startsWith('/admin') ? nextUrl : '/admin');
  });
});

router.post('/logout', (req, res) => {
  delete req.session.adminId;
  res.redirect('/admin/login');
});

// Everything below needs a signed-in admin.
router.use(requireAdmin);

// Multipart forms (image uploads): parse files, discard non-images, then check the CSRF token.
router.use((req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  upload.any()(req, res, (err) => {
    if (err) return next(err);
    keepOnlyImages(req, res, () => verifyCsrf(req, res, next));
  });
});

// Badge counts for the sidebar.
router.use((req, res, next) => {
  res.locals.badges = db.prepare(`SELECT
      (SELECT COUNT(*) FROM orders WHERE status IN ('pending', 'confirmed')) AS orders,
      (SELECT COUNT(*) FROM reviews WHERE status = 'pending') AS reviews,
      (SELECT COUNT(*) FROM messages WHERE is_read = 0) AS messages`).get();
  next();
});

router.get('/', (req, res) => {
  const since30 = analytics.sinceDays(30);
  const sinceToday = analytics.sinceDays(1);
  const sales = (since) => db.prepare(`SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue FROM orders
      WHERE created_at >= ? AND status != 'cancelled' AND (payment_method = 'cod' OR payment_status = 'paid')`).get(since);
  const today = sales(sinceToday);
  const month = sales(since30);
  const salesDaily = db.prepare(`SELECT date(created_at, '+330 minutes') AS day, COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orders
      FROM orders WHERE created_at >= ? AND status != 'cancelled' AND (payment_method = 'cod' OR payment_status = 'paid') GROUP BY day`).all(since30);
  const salesByDay = new Map(salesDaily.map((r) => [r.day, r]));
  const traffic = analytics.summary(30);
  const daily = traffic.daily.map((d) => ({ ...d, revenue: salesByDay.get(d.day)?.revenue || 0, orders: salesByDay.get(d.day)?.orders || 0 }));

  const recentOrders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 8').all();
  const lowStock = db.prepare(`SELECT p.id, p.name, p.low_stock_threshold,
      CASE WHEN EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)
        THEN (SELECT SUM(stock) FROM product_variants v WHERE v.product_id = p.id) ELSE p.stock END AS available
      FROM products p WHERE p.status = 'active' AND available <= p.low_stock_threshold ORDER BY available ASC LIMIT 10`).all();
  const topProducts = db.prepare(`SELECT oi.name, SUM(oi.quantity) AS qty, SUM(oi.total) AS revenue FROM order_items oi
      JOIN orders o ON o.id = oi.order_id WHERE o.created_at >= ? AND o.status != 'cancelled'
      GROUP BY oi.product_id, oi.name ORDER BY qty DESC LIMIT 5`).all(since30);
  const conversion = traffic.totals.visitors ? (month.orders / traffic.totals.visitors) * 100 : 0;

  res.render('admin/dashboard', {
    title: 'Dashboard',
    section: 'dashboard',
    today,
    month,
    visitorsToday: analytics.visitorsToday(),
    live: analytics.liveVisitors(),
    traffic,
    daily,
    recentOrders,
    lowStock,
    topProducts,
    conversion,
    counts: db.prepare(`SELECT (SELECT COUNT(*) FROM products) AS products, (SELECT COUNT(*) FROM customers) AS customers,
        (SELECT COUNT(*) FROM subscribers) AS subscribers`).get(),
  });
});

router.use('/products', require('./products'));
router.use('/categories', require('./categories'));
router.use('/banners', require('./banners'));
router.use('/orders', require('./orders'));
router.use('/customers', require('./customers'));
router.use('/coupons', require('./coupons'));
router.use('/reviews', require('./reviews'));
router.use('/analytics', require('./analytics'));
router.use('/', require('./content'));
router.use('/settings', require('./settings'));

router.use((req, res) => {
  res.status(404).render('admin/not-found', { title: 'Not found' });
});

module.exports = router;
