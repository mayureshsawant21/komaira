const db = require('../db');
const settings = require('./settings');
const { randomToken } = require('./helpers');

class OrderError extends Error {}

const insertOrder = db.prepare(`INSERT INTO orders
  (order_number, access_token, customer_id, name, email, phone, address_line1, address_line2, city, state, pincode, country, notes,
   subtotal, discount, shipping, total, coupon_code, payment_method, payment_status, status)
  VALUES (@order_number, @access_token, @customer_id, @name, @email, @phone, @address_line1, @address_line2, @city, @state, @pincode, @country, @notes,
   @subtotal, @discount, @shipping, @total, @coupon_code, @payment_method, 'pending', @status)`);
const insertItem = db.prepare(`INSERT INTO order_items
  (order_id, product_id, variant_id, name, variant_name, sku, image, price, quantity, total)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const takeProductStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');
const takeVariantStock = db.prepare('UPDATE product_variants SET stock = stock - ? WHERE id = ? AND stock >= ?');
const insertEvent = db.prepare('INSERT INTO order_events (order_id, status, note) VALUES (?, ?, ?)');

/**
 * Creates an order from a priced cart (see cart.getCart) inside one transaction:
 * reserves stock, records coupon usage and writes items. Throws OrderError when stock ran out.
 */
const createOrder = db.transaction((cart, details) => {
  if (!cart.lines.length) throw new OrderError('Your bag is empty.');
  const isCod = details.payment_method === 'cod';
  const codFee = isCod ? settings.getInt('cod_fee', 0) : 0;
  const shipping = cart.shipping + codFee;
  const info = insertOrder.run({
    order_number: `TMP-${randomToken(6)}`,
    access_token: randomToken(16),
    customer_id: details.customer_id || null,
    name: details.name,
    email: details.email,
    phone: details.phone,
    address_line1: details.address_line1,
    address_line2: details.address_line2 || null,
    city: details.city,
    state: details.state,
    pincode: details.pincode,
    country: 'India',
    notes: details.notes || null,
    subtotal: cart.subtotal,
    discount: cart.discount,
    shipping,
    total: cart.subtotal - cart.discount + shipping,
    coupon_code: cart.coupon ? cart.coupon.code : null,
    payment_method: details.payment_method,
    status: isCod ? 'confirmed' : 'pending',
  });
  const orderId = info.lastInsertRowid;
  const orderNumber = `${settings.get('order_prefix', 'KB') || 'KB'}-${1000 + Number(orderId)}`;
  db.prepare('UPDATE orders SET order_number = ? WHERE id = ?').run(orderNumber, orderId);

  for (const l of cart.lines) {
    const taken = l.variantId
      ? takeVariantStock.run(l.qty, l.variantId, l.qty)
      : takeProductStock.run(l.qty, l.productId, l.qty);
    if (taken.changes !== 1) throw new OrderError(`Sorry, ${l.name}${l.variantName ? ` (${l.variantName})` : ''} just sold out. Please review your bag.`);
    insertItem.run(orderId, l.productId, l.variantId, l.name, l.variantName, l.sku, l.image, l.price, l.qty, l.total);
  }
  if (cart.coupon) db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?').run(cart.coupon.id);
  insertEvent.run(orderId, isCod ? 'confirmed' : 'pending', isCod ? 'Order placed — Cash on Delivery' : 'Order placed — awaiting online payment');
  return getOrder(orderId);
});

/** Puts stock back for every item in an order (used when an order is cancelled). */
const restock = db.transaction((orderId) => {
  for (const item of db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId)) {
    if (item.variant_id) db.prepare('UPDATE product_variants SET stock = stock + ? WHERE id = ?').run(item.quantity, item.variant_id);
    else if (item.product_id) db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.quantity, item.product_id);
  }
});

/** Changes order status, keeping stock in sync when an order is cancelled or un-cancelled. */
const setStatus = db.transaction((orderId, status, note) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order || order.status === status) return order;
  if (status === 'cancelled') restock(orderId);
  if (order.status === 'cancelled') {
    // Re-opening a cancelled order takes the stock again (if still available).
    for (const item of db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId)) {
      const r = item.variant_id
        ? takeVariantStock.run(item.quantity, item.variant_id, item.quantity)
        : item.product_id ? takeProductStock.run(item.quantity, item.product_id, item.quantity) : { changes: 1 };
      if (r.changes !== 1) throw new OrderError(`Not enough stock of ${item.name} to re-open this order.`);
    }
  }
  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, orderId);
  insertEvent.run(orderId, status, note || null);
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
});

function getOrder(id) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return null;
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
  order.events = db.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY id').all(id);
  return order;
}

function getOrderByNumber(number) {
  const row = db.prepare('SELECT id FROM orders WHERE order_number = ? COLLATE NOCASE').get(String(number || '').trim());
  return row ? getOrder(row.id) : null;
}

function markPaid(orderId, paymentRef) {
  db.transaction(() => {
    db.prepare(`UPDATE orders SET payment_status = 'paid', payment_ref = ?,
        status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END, updated_at = datetime('now') WHERE id = ?`)
      .run(paymentRef, orderId);
    insertEvent.run(orderId, 'confirmed', `Payment received (${paymentRef})`);
  })();
}

module.exports = { createOrder, setStatus, getOrder, getOrderByNumber, markPaid, OrderError };
