const express = require('express');
const db = require('../../db');
const orders = require('../../lib/orders');
const mailer = require('../../lib/mailer');
const { toInt, paginate, ORDER_STATUSES, PAYMENT_STATUSES, checkbox, fromPaise, formatDate } = require('../../lib/helpers');

const router = express.Router();
router.use((req, res, next) => { res.locals.section = 'orders'; next(); });

function filters(query) {
  const where = ['1=1'];
  const params = {};
  const q = String(query.q || '').trim();
  if (q) { where.push('(o.order_number LIKE @q OR o.name LIKE @q OR o.email LIKE @q OR o.phone LIKE @q)'); params.q = `%${q}%`; }
  if (ORDER_STATUSES.includes(query.status)) { where.push('o.status = @status'); params.status = query.status; }
  if (PAYMENT_STATUSES.includes(query.payment)) { where.push('o.payment_status = @payment'); params.payment = query.payment; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.from || '')) { where.push("date(o.created_at, '+330 minutes') >= @from"); params.from = query.from; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.to || '')) { where.push("date(o.created_at, '+330 minutes') <= @to"); params.to = query.to; }
  return { sql: where.join(' AND '), params };
}

router.get('/', (req, res) => {
  const f = filters(req.query);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM orders o WHERE ${f.sql}`).get(f.params).n;
  const pager = paginate(total, toInt(req.query.page, 1), 25);
  const list = db.prepare(`SELECT o.*, (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS item_count
      FROM orders o WHERE ${f.sql} ORDER BY o.created_at DESC LIMIT @limit OFFSET @offset`).all({ ...f.params, limit: pager.perPage, offset: pager.offset });
  const statusCounts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').all().map((r) => [r.status, r.n]));
  res.render('admin/orders/index', { title: 'Orders', orders: list, pager, statusCounts, statuses: ORDER_STATUSES, paymentStatuses: PAYMENT_STATUSES });
});

function csvCell(v) {
  const s = String(v ?? '');
  // Neutralise spreadsheet formulas and quote everything.
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
}

router.get('/export.csv', (req, res) => {
  const f = filters(req.query);
  const rows = db.prepare(`SELECT o.*, (SELECT GROUP_CONCAT(name || COALESCE(' - ' || variant_name, '') || ' x' || quantity, '; ') FROM order_items WHERE order_id = o.id) AS items
      FROM orders o WHERE ${f.sql} ORDER BY o.created_at DESC`).all(f.params);
  const header = ['Order', 'Date', 'Status', 'Payment method', 'Payment status', 'Customer', 'Email', 'Phone', 'Address', 'City', 'State', 'PIN',
    'Items', 'Subtotal', 'Discount', 'Shipping', 'Total', 'Coupon', 'Courier', 'Tracking'];
  const lines = rows.map((o) => [o.order_number, formatDate(o.created_at, true), o.status, o.payment_method, o.payment_status, o.name, o.email, o.phone,
    [o.address_line1, o.address_line2].filter(Boolean).join(', '), o.city, o.state, o.pincode, o.items,
    fromPaise(o.subtotal), fromPaise(o.discount), fromPaise(o.shipping), fromPaise(o.total), o.coupon_code, o.courier, o.tracking_number].map(csvCell).join(','));
  res.attachment(`orders-${new Date().toISOString().slice(0, 10)}.csv`);
  res.type('text/csv').send('﻿' + [header.map(csvCell).join(','), ...lines].join('\r\n'));
});

router.get('/:id', (req, res, next) => {
  const order = orders.getOrder(toInt(req.params.id));
  if (!order) return next();
  const customerOrders = order.customer_id ? db.prepare('SELECT COUNT(*) AS n FROM orders WHERE customer_id = ?').get(order.customer_id).n : null;
  res.render('admin/orders/show', { title: `Order ${order.order_number}`, order, statuses: ORDER_STATUSES, paymentStatuses: PAYMENT_STATUSES, customerOrders });
});

router.get('/:id/invoice', (req, res, next) => {
  const order = orders.getOrder(toInt(req.params.id));
  if (!order) return next();
  res.render('admin/orders/invoice', { title: `Invoice ${order.order_number}`, order });
});

router.post('/:id', (req, res, next) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(toInt(req.params.id));
  if (!order) return next();
  const status = ORDER_STATUSES.includes(req.body.status) ? req.body.status : order.status;
  const payment = PAYMENT_STATUSES.includes(req.body.payment_status) ? req.body.payment_status : order.payment_status;
  try {
    db.transaction(() => {
      db.prepare("UPDATE orders SET courier = ?, tracking_number = ?, admin_notes = ?, payment_status = ?, updated_at = datetime('now') WHERE id = ?").run(
        String(req.body.courier || '').trim().slice(0, 80) || null,
        String(req.body.tracking_number || '').trim().slice(0, 80) || null,
        String(req.body.admin_notes || '').trim().slice(0, 2000) || null,
        payment,
        order.id,
      );
      if (payment !== order.payment_status) {
        db.prepare('INSERT INTO order_events (order_id, status, note) VALUES (?, ?, ?)').run(order.id, order.status, `Payment marked ${payment}`);
      }
      if (status !== order.status) orders.setStatus(order.id, status, String(req.body.note || '').trim().slice(0, 300) || null);
    })();
  } catch (err) {
    if (!(err instanceof orders.OrderError)) throw err;
    req.flash('error', err.message);
    return res.redirect(`/admin/orders/${order.id}`);
  }
  const updated = orders.getOrder(order.id);
  if (status !== order.status && checkbox(req.body.notify)) mailer.orderStatusChanged(updated);
  req.flash('success', status !== order.status ? `Order marked as ${status}.` : 'Order updated.');
  res.redirect(`/admin/orders/${order.id}`);
});

module.exports = router;
