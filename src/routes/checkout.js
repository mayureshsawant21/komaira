const express = require('express');
const db = require('../db');
const cart = require('../lib/cart');
const orders = require('../lib/orders');
const settings = require('../lib/settings');
const razorpay = require('../lib/razorpay');
const mailer = require('../lib/mailer');
const config = require('../config');
const { isValidEmail } = require('../lib/helpers');

const router = express.Router();

const INDIAN_STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand',
  'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];

function paymentOptions() {
  const opts = [];
  if (razorpay.enabled()) opts.push({ value: 'razorpay', label: 'Pay online', hint: 'UPI, cards, net banking & wallets via Razorpay' });
  if (settings.get('cod_enabled') === '1' || !opts.length) {
    const fee = settings.getInt('cod_fee', 0);
    opts.push({ value: 'cod', label: 'Cash on Delivery', hint: fee ? `A small COD fee applies` : 'Pay when your order arrives', fee });
  }
  return opts;
}

function renderCheckout(req, res, form, status = 200) {
  const c = cart.getCart(req);
  res.locals.cartCount = c.count;
  res.locals.track = { type: 'checkout', title: 'Checkout' };
  res.status(status).render('shop/checkout', { title: 'Checkout', cart: c, form, states: INDIAN_STATES, payments: paymentOptions() });
}

router.get('/checkout', (req, res) => {
  const c = cart.getCart(req);
  if (!c.lines.length) {
    if (c.notices.length) req.flash('error', c.notices.join(' '));
    return res.redirect('/cart');
  }
  let form = { payment_method: paymentOptions()[0].value };
  if (req.customer) {
    const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.customer.id);
    form = { ...form, name: cust.name, email: cust.email, phone: cust.phone, address_line1: cust.address_line1, address_line2: cust.address_line2, city: cust.city, state: cust.state, pincode: cust.pincode };
  }
  renderCheckout(req, res, form);
});

function readForm(body) {
  const f = {};
  for (const k of ['name', 'email', 'phone', 'address_line1', 'address_line2', 'city', 'state', 'pincode', 'notes', 'payment_method']) {
    f[k] = String(body[k] || '').trim().slice(0, k === 'notes' ? 1000 : 200);
  }
  f.email = f.email.toLowerCase();
  f.phone = f.phone.replace(/[^\d+]/g, '');
  return f;
}

function validate(f) {
  const errors = [];
  if (!f.name) errors.push('Full name is required.');
  if (!isValidEmail(f.email)) errors.push('A valid email is required.');
  if (!/^(\+?91)?[6-9]\d{9}$/.test(f.phone)) errors.push('Please enter a valid 10-digit mobile number.');
  if (!f.address_line1) errors.push('Address is required.');
  if (!f.city) errors.push('City is required.');
  if (!INDIAN_STATES.includes(f.state)) errors.push('Please choose your state.');
  if (!/^\d{6}$/.test(f.pincode)) errors.push('Please enter a valid 6-digit PIN code.');
  if (!paymentOptions().some((p) => p.value === f.payment_method)) errors.push('Please choose a payment method.');
  return errors;
}

router.post('/checkout', (req, res) => {
  const form = readForm(req.body);
  const c = cart.getCart(req);
  if (!c.lines.length) return res.redirect('/cart');
  if (c.notices.length) {
    res.locals.flash = { error: c.notices.join(' ') };
    return renderCheckout(req, res, form, 409);
  }
  const errors = validate(form);
  if (errors.length) {
    res.locals.flash = { error: errors.join(' ') };
    return renderCheckout(req, res, form, 400);
  }

  let order;
  try {
    order = orders.createOrder(c, { ...form, customer_id: req.customer?.id });
  } catch (err) {
    if (err instanceof orders.OrderError) {
      res.locals.flash = { error: err.message };
      return renderCheckout(req, res, form, 409);
    }
    throw err;
  }

  if (req.customer) {
    db.prepare(`UPDATE customers SET phone = COALESCE(NULLIF(phone, ''), ?), address_line1 = ?, address_line2 = ?, city = ?, state = ?, pincode = ? WHERE id = ?`)
      .run(form.phone, form.address_line1, form.address_line2 || null, form.city, form.state, form.pincode, req.customer.id);
  }
  cart.clear(req);
  req.session.lastOrder = order.order_number;

  if (order.payment_method === 'razorpay') {
    return res.redirect(`/checkout/pay/${encodeURIComponent(order.order_number)}?t=${order.access_token}`);
  }
  mailer.orderPlaced(order);
  res.redirect(`/order/${encodeURIComponent(order.order_number)}?t=${order.access_token}&placed=1`);
});

function orderFromRequest(req) {
  const order = orders.getOrderByNumber(req.params.number);
  if (!order) return null;
  const token = req.query.t || req.body?.t;
  return token === order.access_token ? order : null;
}

router.get('/checkout/pay/:number', async (req, res, next) => {
  const order = orderFromRequest(req);
  if (!order || order.payment_method !== 'razorpay') return next();
  if (order.payment_status === 'paid') return res.redirect(`/order/${encodeURIComponent(order.order_number)}?t=${order.access_token}`);
  if (!razorpay.enabled()) return res.render('shop/error', { title: 'Online payments unavailable', message: 'Please contact us to complete this order.' });
  try {
    if (!order.gateway_order_id) {
      const g = await razorpay.createGatewayOrder(order.total, order.order_number);
      db.prepare('UPDATE orders SET gateway_order_id = ? WHERE id = ?').run(g.id, order.id);
      order.gateway_order_id = g.id;
    }
  } catch (err) {
    console.error('[razorpay]', err.message);
    return res.status(502).render('shop/error', { title: 'Payment gateway unavailable', message: 'We could not reach the payment gateway. Please try again in a minute.' });
  }
  res.render('shop/pay', {
    title: 'Complete payment',
    order,
    razorpay: {
      key: config.razorpay.keyId,
      amount: order.total,
      currency: 'INR',
      name: settings.get('store_name'),
      description: `Order ${order.order_number}`,
      order_id: order.gateway_order_id,
      prefill: { name: order.name, email: order.email, contact: order.phone },
    },
  });
});

router.post('/checkout/pay/:number/verify', (req, res, next) => {
  const order = orderFromRequest(req);
  if (!order) return next();
  const { razorpay_payment_id: paymentId, razorpay_order_id: gatewayOrderId, razorpay_signature: signature } = req.body;
  const back = `/order/${encodeURIComponent(order.order_number)}?t=${order.access_token}`;
  if (order.payment_status === 'paid') return res.redirect(back);
  if (gatewayOrderId !== order.gateway_order_id || !razorpay.verifySignature(gatewayOrderId, paymentId, signature)) {
    db.prepare("UPDATE orders SET payment_status = 'failed', updated_at = datetime('now') WHERE id = ?").run(order.id);
    req.flash('error', 'We could not verify your payment. If money was deducted, please contact us with your order number.');
    return res.redirect(back);
  }
  orders.markPaid(order.id, String(paymentId).slice(0, 100));
  mailer.orderPlaced(orders.getOrder(order.id));
  res.redirect(back + '&placed=1');
});

module.exports = router;
