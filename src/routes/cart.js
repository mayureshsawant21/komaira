const express = require('express');
const cart = require('../lib/cart');
const { toInt } = require('../lib/helpers');

const router = express.Router();

function wantsJson(req) {
  return req.xhr || String(req.get('accept') || '').includes('application/json');
}

router.get('/cart', (req, res) => {
  const c = cart.getCart(req);
  res.locals.track = { type: 'cart', title: 'Bag' };
  res.locals.cartCount = c.count;
  res.render('shop/cart', { title: 'Your bag', cart: c });
});

router.post('/cart/add', (req, res) => {
  const result = cart.addItem(req, toInt(req.body.product_id), toInt(req.body.variant_id) || null, toInt(req.body.qty, 1));
  if (wantsJson(req)) {
    return res.status(result.ok ? 200 : 400).json({ ...result, count: cart.count(req) });
  }
  req.flash(result.ok ? 'success' : 'error', result.ok ? result.message : result.error);
  if (result.ok && req.body.buy_now === '1') return res.redirect('/checkout');
  res.redirect(result.ok ? '/cart' : (req.get('referer') && new URL(req.get('referer'), 'http://x').pathname) || '/cart');
});

router.post('/cart/update', (req, res) => {
  cart.updateItem(req, toInt(req.body.index, -1), toInt(req.body.qty, 1));
  res.redirect('/cart');
});

router.post('/cart/remove', (req, res) => {
  cart.removeItem(req, toInt(req.body.index, -1));
  res.redirect('/cart');
});

router.post('/cart/coupon', (req, res) => {
  const code = String(req.body.code || '').trim();
  const c = cart.getCart(req);
  const result = cart.evaluateCoupon(code, c.subtotal);
  if (!code || result.error) {
    req.flash('error', result.error || 'Please enter a coupon code.');
  } else {
    req.session.couponCode = result.coupon.code;
    req.flash('success', `Coupon ${result.coupon.code} applied.`);
  }
  res.redirect(req.body.back === 'checkout' ? '/checkout' : '/cart');
});

router.post('/cart/coupon/remove', (req, res) => {
  delete req.session.couponCode;
  res.redirect(req.body.back === 'checkout' ? '/checkout' : '/cart');
});

module.exports = router;
