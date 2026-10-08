const express = require('express');
const db = require('../../db');
const { toInt, paginate } = require('../../lib/helpers');

const router = express.Router();
router.use((req, res, next) => { res.locals.section = 'customers'; next(); });

router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  const where = q ? 'WHERE c.name LIKE @q OR c.email LIKE @q OR c.phone LIKE @q' : '';
  const params = q ? { q: `%${q}%` } : {};
  const total = db.prepare(`SELECT COUNT(*) AS n FROM customers c ${where}`).get(params).n;
  const pager = paginate(total, toInt(req.query.page, 1), 30);
  const customers = db.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count,
      (SELECT COALESCE(SUM(total), 0) FROM orders o WHERE o.customer_id = c.id AND o.status != 'cancelled') AS spent,
      (SELECT MAX(created_at) FROM orders o WHERE o.customer_id = c.id) AS last_order
    FROM customers c ${where} ORDER BY c.created_at DESC LIMIT @limit OFFSET @offset`).all({ ...params, limit: pager.perPage, offset: pager.offset });
  const guests = db.prepare('SELECT COUNT(DISTINCT email) AS n FROM orders WHERE customer_id IS NULL').get().n;
  res.render('admin/customers/index', { title: 'Customers', customers, pager, guests });
});

router.get('/:id', (req, res, next) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(toInt(req.params.id));
  if (!customer) return next();
  const orders = db.prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC').all(customer.id);
  const wishlist = db.prepare('SELECT p.id, p.name FROM wishlist w JOIN products p ON p.id = w.product_id WHERE w.customer_id = ?').all(customer.id);
  res.render('admin/customers/show', { title: customer.name, customer, orders, wishlist });
});

module.exports = router;
