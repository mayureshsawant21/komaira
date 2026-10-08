const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../db');
const settings = require('../../lib/settings');
const razorpay = require('../../lib/razorpay');
const config = require('../../config');
const { toPaise, toInt, checkbox, isValidEmail, safeLink } = require('../../lib/helpers');

const router = express.Router();
router.use((req, res, next) => { res.locals.section = 'settings'; next(); });

const TEXT_FIELDS = ['store_name', 'tagline', 'contact_email', 'contact_phone', 'whatsapp', 'address', 'instagram', 'facebook', 'youtube',
  'home_featured_title', 'home_new_title', 'promise_1', 'promise_2', 'promise_3', 'promise_4', 'meta_description', 'order_notify_email'];

router.get('/', (req, res) => {
  res.render('admin/settings', {
    title: 'Settings',
    admins: db.prepare('SELECT id, name, email, created_at FROM admins ORDER BY id').all(),
    razorpayEnabled: razorpay.enabled(),
    smtpEnabled: Boolean(config.smtp.host),
  });
});

router.post('/', (req, res) => {
  const values = {};
  for (const k of TEXT_FIELDS) values[k] = String(req.body[k] || '').trim().slice(0, 500);
  for (const k of ['instagram', 'facebook', 'youtube']) values[k] = values[k] ? safeLink(values[k]) : '';
  if (!values.store_name) values.store_name = 'Komaira Boutique';
  values.shipping_fee = toPaise(req.body.shipping_fee) || 0;
  values.free_shipping_threshold = toPaise(req.body.free_shipping_threshold) || 0;
  values.cod_enabled = checkbox(req.body.cod_enabled);
  values.cod_fee = toPaise(req.body.cod_fee) || 0;
  values.order_prefix = String(req.body.order_prefix || 'KB').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'KB';
  settings.setMany(values);
  req.flash('success', 'Settings saved.');
  res.redirect('/admin/settings');
});

router.post('/password', (req, res) => {
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  const next = String(req.body.new_password || '');
  if (!bcrypt.compareSync(String(req.body.current_password || ''), admin.password_hash)) req.flash('error', 'Current password is incorrect.');
  else if (next.length < 10) req.flash('error', 'New password must be at least 10 characters.');
  else {
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 10), admin.id);
    req.flash('success', 'Your password has been changed.');
  }
  res.redirect('/admin/settings#security');
});

router.post('/admins', (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 100);
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!name || !isValidEmail(email) || password.length < 10) {
    req.flash('error', 'Enter a name, a valid email and a password of at least 10 characters.');
  } else if (db.prepare('SELECT 1 FROM admins WHERE email = ?').get(email)) {
    req.flash('error', 'An admin with that email already exists.');
  } else {
    db.prepare('INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)').run(name, email, bcrypt.hashSync(password, 10));
    req.flash('success', `${name} can now sign in to the admin panel.`);
  }
  res.redirect('/admin/settings#team');
});

router.post('/admins/:id/delete', (req, res) => {
  const id = toInt(req.params.id);
  if (id === req.admin.id) req.flash('error', "You can't remove your own account.");
  else {
    db.prepare('DELETE FROM admins WHERE id = ?').run(id);
    req.flash('success', 'Admin removed.');
  }
  res.redirect('/admin/settings#team');
});

module.exports = router;
