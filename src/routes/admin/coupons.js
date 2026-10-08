const express = require('express');
const db = require('../../db');
const { toInt, toPaise, checkbox } = require('../../lib/helpers');

const router = express.Router();
router.use((req, res, next) => { res.locals.section = 'coupons'; next(); });

router.get('/', (req, res) => {
  const coupons = db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all();
  res.render('admin/coupons/index', { title: 'Coupons', coupons });
});

router.get('/new', (req, res) => {
  res.render('admin/coupons/form', { title: 'New coupon', coupon: { type: 'percent', is_active: 1, min_order: 0 }, errors: [] });
});

function readCoupon(body) {
  const type = body.type === 'fixed' ? 'fixed' : 'percent';
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
  return {
    code: String(body.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30),
    description: String(body.description || '').trim().slice(0, 200) || null,
    type,
    value: type === 'percent' ? Math.min(100, Math.max(0, toInt(body.value, 0))) : (toPaise(body.value) || 0),
    min_order: toPaise(body.min_order) || 0,
    max_uses: body.max_uses === '' || body.max_uses === undefined ? null : Math.max(0, toInt(body.max_uses, 0)),
    starts_at: date(body.starts_at),
    ends_at: date(body.ends_at),
    is_active: checkbox(body.is_active),
  };
}

function validate(c, id = 0) {
  const errors = [];
  if (!c.code) errors.push('Coupon code is required (letters and numbers).');
  if (c.value <= 0) errors.push('Discount value must be more than zero.');
  if (c.code && db.prepare('SELECT 1 FROM coupons WHERE code = ? AND id != ?').get(c.code, id)) errors.push('That code already exists.');
  return errors;
}

router.post('/', (req, res) => {
  const c = readCoupon(req.body);
  const errors = validate(c);
  if (errors.length) return res.status(400).render('admin/coupons/form', { title: 'New coupon', coupon: c, errors });
  db.prepare(`INSERT INTO coupons (code, description, type, value, min_order, max_uses, starts_at, ends_at, is_active)
      VALUES (@code, @description, @type, @value, @min_order, @max_uses, @starts_at, @ends_at, @is_active)`).run(c);
  req.flash('success', `Coupon ${c.code} created.`);
  res.redirect('/admin/coupons');
});

router.get('/:id/edit', (req, res, next) => {
  const coupon = db.prepare('SELECT * FROM coupons WHERE id = ?').get(toInt(req.params.id));
  if (!coupon) return next();
  res.render('admin/coupons/form', { title: `Edit ${coupon.code}`, coupon, errors: [] });
});

router.post('/:id', (req, res, next) => {
  const existing = db.prepare('SELECT * FROM coupons WHERE id = ?').get(toInt(req.params.id));
  if (!existing) return next();
  const c = readCoupon(req.body);
  const errors = validate(c, existing.id);
  if (errors.length) return res.status(400).render('admin/coupons/form', { title: `Edit ${existing.code}`, coupon: { ...existing, ...c }, errors });
  db.prepare(`UPDATE coupons SET code = @code, description = @description, type = @type, value = @value, min_order = @min_order,
      max_uses = @max_uses, starts_at = @starts_at, ends_at = @ends_at, is_active = @is_active WHERE id = @id`).run({ ...c, id: existing.id });
  req.flash('success', 'Coupon saved.');
  res.redirect('/admin/coupons');
});

router.post('/:id/delete', (req, res) => {
  db.prepare('DELETE FROM coupons WHERE id = ?').run(toInt(req.params.id));
  req.flash('success', 'Coupon deleted.');
  res.redirect('/admin/coupons');
});

module.exports = router;
