const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireCustomer, loginLimiter } = require('../middleware/auth');
const { isValidEmail, safeNext, toInt } = require('../lib/helpers');
const { PRODUCT_CARD_SELECT } = require('../lib/catalog');

const router = express.Router();

/** Regenerates the session on login (prevents session fixation) while keeping the bag. */
function startSession(req, customerId, cb) {
  const keep = { cart: req.session.cart, couponCode: req.session.couponCode, adminId: req.session.adminId };
  req.session.regenerate((err) => {
    if (err) return cb(err);
    Object.assign(req.session, keep, { customerId });
    cb();
  });
}

router.get('/login', (req, res) => {
  if (req.customer) return res.redirect('/account');
  res.locals.track = { type: 'account', title: 'Login' };
  res.render('account/login', { title: 'Sign in', next: safeNext(req.query.next, '/account'), form: {} });
});

router.post('/login', loginLimiter(), (req, res, next) => {
  const email = String(req.body.email || '').trim();
  const nextUrl = safeNext(req.body.next, '/account');
  const fail = (msg) => {
    res.locals.flash = { error: msg };
    res.status(401).render('account/login', { title: 'Sign in', next: nextUrl, form: { email } });
  };
  if (req.rateLimited) return fail('Too many attempts. Please wait a few minutes and try again.');
  const c = db.prepare('SELECT * FROM customers WHERE email = ?').get(email);
  if (!c || !bcrypt.compareSync(String(req.body.password || ''), c.password_hash)) return fail('Incorrect email or password.');
  startSession(req, c.id, (err) => {
    if (err) return next(err);
    req.flash('success', `Welcome back, ${c.name.split(' ')[0]}!`);
    res.redirect(nextUrl);
  });
});

router.get('/register', (req, res) => {
  if (req.customer) return res.redirect('/account');
  res.locals.track = { type: 'account', title: 'Register' };
  res.render('account/register', { title: 'Create account', next: safeNext(req.query.next, '/account'), form: {} });
});

router.post('/register', (req, res, next) => {
  const form = {
    name: String(req.body.name || '').trim().slice(0, 100),
    email: String(req.body.email || '').trim().toLowerCase().slice(0, 200),
    phone: String(req.body.phone || '').replace(/[^\d+]/g, '').slice(0, 15),
  };
  const password = String(req.body.password || '');
  const nextUrl = safeNext(req.body.next, '/account');
  let error = null;
  if (!form.name) error = 'Please enter your name.';
  else if (!isValidEmail(form.email)) error = 'Please enter a valid email.';
  else if (password.length < 8) error = 'Password must be at least 8 characters.';
  else if (db.prepare('SELECT 1 FROM customers WHERE email = ?').get(form.email)) error = 'An account with this email already exists. Please sign in.';
  if (error) {
    res.locals.flash = { error };
    return res.status(400).render('account/register', { title: 'Create account', next: nextUrl, form });
  }
  const info = db.prepare('INSERT INTO customers (name, email, phone, password_hash) VALUES (?, ?, ?, ?)')
    .run(form.name, form.email, form.phone || null, bcrypt.hashSync(password, 10));
  // Link earlier guest orders placed with the same email.
  db.prepare('UPDATE orders SET customer_id = ? WHERE customer_id IS NULL AND email = ?').run(info.lastInsertRowid, form.email);
  startSession(req, info.lastInsertRowid, (err) => {
    if (err) return next(err);
    req.flash('success', `Welcome to ${res.locals.settings.store_name}, ${form.name.split(' ')[0]}!`);
    res.redirect(nextUrl);
  });
});

router.post('/logout', (req, res) => {
  delete req.session.customerId;
  req.flash('success', 'You have been signed out.');
  res.redirect('/');
});

router.get('/', requireCustomer, (req, res) => {
  const orders = db.prepare(`SELECT o.*, (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS item_count
      FROM orders o WHERE customer_id = ? ORDER BY created_at DESC`).all(req.customer.id);
  const profile = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.customer.id);
  res.locals.track = { type: 'account', title: 'My account' };
  res.render('account/dashboard', { title: 'My account', orders, profile });
});

router.post('/profile', requireCustomer, (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 100);
  if (!name) {
    req.flash('error', 'Name cannot be empty.');
    return res.redirect('/account#profile');
  }
  db.prepare('UPDATE customers SET name = ?, phone = ?, address_line1 = ?, address_line2 = ?, city = ?, state = ?, pincode = ? WHERE id = ?').run(
    name,
    String(req.body.phone || '').replace(/[^\d+]/g, '').slice(0, 15) || null,
    String(req.body.address_line1 || '').trim().slice(0, 200) || null,
    String(req.body.address_line2 || '').trim().slice(0, 200) || null,
    String(req.body.city || '').trim().slice(0, 100) || null,
    String(req.body.state || '').trim().slice(0, 100) || null,
    String(req.body.pincode || '').trim().slice(0, 10) || null,
    req.customer.id,
  );
  req.flash('success', 'Your details have been saved.');
  res.redirect('/account#profile');
});

router.post('/password', requireCustomer, (req, res) => {
  const c = db.prepare('SELECT password_hash FROM customers WHERE id = ?').get(req.customer.id);
  const next = String(req.body.new_password || '');
  if (!bcrypt.compareSync(String(req.body.current_password || ''), c.password_hash)) {
    req.flash('error', 'Your current password is incorrect.');
  } else if (next.length < 8) {
    req.flash('error', 'New password must be at least 8 characters.');
  } else {
    db.prepare('UPDATE customers SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 10), req.customer.id);
    req.flash('success', 'Password updated.');
  }
  res.redirect('/account#password');
});

router.get('/wishlist', requireCustomer, (req, res) => {
  const products = db.prepare(`SELECT * FROM (${PRODUCT_CARD_SELECT}) x
      WHERE x.id IN (SELECT product_id FROM wishlist WHERE customer_id = ?) AND x.status = 'active'`).all(req.customer.id);
  res.locals.track = { type: 'wishlist', title: 'Wishlist' };
  res.render('account/wishlist', { title: 'Wishlist', products });
});

router.post('/wishlist/toggle', (req, res) => {
  const productId = toInt(req.body.product_id);
  const json = String(req.get('accept') || '').includes('application/json');
  if (!req.customer) {
    if (json) return res.status(401).json({ error: 'Please sign in to save items.', login: '/account/login' });
    return res.redirect('/account/login?next=' + encodeURIComponent(safeNext(req.body.back, '/')));
  }
  const exists = db.prepare('SELECT 1 FROM wishlist WHERE customer_id = ? AND product_id = ?').get(req.customer.id, productId);
  if (exists) db.prepare('DELETE FROM wishlist WHERE customer_id = ? AND product_id = ?').run(req.customer.id, productId);
  else if (db.prepare('SELECT 1 FROM products WHERE id = ?').get(productId)) db.prepare('INSERT INTO wishlist (customer_id, product_id) VALUES (?, ?)').run(req.customer.id, productId);
  if (json) return res.json({ saved: !exists });
  res.redirect(safeNext(req.body.back, '/account/wishlist'));
});

module.exports = router;
