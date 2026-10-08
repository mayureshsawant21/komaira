const db = require('../db');
const settings = require('./settings');

const MAX_QTY = 10;

function rawCart(req) {
  if (!Array.isArray(req.session.cart)) req.session.cart = [];
  return req.session.cart;
}

const productStmt = db.prepare(`SELECT p.*,
    (SELECT path FROM product_images WHERE product_id = p.id ORDER BY sort_order, id LIMIT 1) AS image,
    (SELECT COUNT(*) FROM product_variants WHERE product_id = p.id) AS variant_count
  FROM products p WHERE p.id = ? AND p.status = 'active'`);
const variantStmt = db.prepare('SELECT * FROM product_variants WHERE id = ? AND product_id = ?');

/** Resolves a product/variant pair to a sellable line (current price & stock), or null. */
function resolveItem(productId, variantId) {
  const product = productStmt.get(productId);
  if (!product) return null;
  let variant = null;
  if (product.variant_count > 0) {
    if (!variantId) return null;
    variant = variantStmt.get(variantId, productId);
    if (!variant) return null;
  }
  return {
    product,
    variant,
    price: variant && variant.price != null ? variant.price : product.price,
    stock: variant ? variant.stock : product.stock,
  };
}

function addItem(req, productId, variantId, qty) {
  const resolved = resolveItem(productId, variantId || null);
  if (!resolved) return { ok: false, error: 'Please choose an available option.' };
  if (resolved.stock <= 0) return { ok: false, error: 'Sorry, this item is out of stock.' };
  const cart = rawCart(req);
  const vId = resolved.variant ? resolved.variant.id : null;
  const existing = cart.find((l) => l.productId === productId && l.variantId === vId);
  const wanted = (existing ? existing.qty : 0) + Math.max(1, qty);
  const finalQty = Math.min(wanted, resolved.stock, MAX_QTY);
  if (existing) existing.qty = finalQty;
  else cart.push({ productId, variantId: vId, qty: finalQty });
  const limited = finalQty < wanted;
  return { ok: true, limited, message: limited ? `Only ${finalQty} can be added for this item.` : 'Added to your bag.' };
}

function updateItem(req, index, qty) {
  const cart = rawCart(req);
  if (!cart[index]) return;
  if (qty <= 0) cart.splice(index, 1);
  else cart[index].qty = Math.min(qty, MAX_QTY);
}

function removeItem(req, index) {
  const cart = rawCart(req);
  if (cart[index]) cart.splice(index, 1);
}

function clear(req) {
  req.session.cart = [];
  delete req.session.couponCode;
}

function count(req) {
  return rawCart(req).reduce((n, l) => n + l.qty, 0);
}

/** Looks up a coupon and checks whether it applies to `subtotal`. Returns { coupon, discount, error }. */
function evaluateCoupon(code, subtotal) {
  if (!code) return { coupon: null, discount: 0 };
  const c = db.prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1').get(String(code).trim());
  if (!c) return { coupon: null, discount: 0, error: 'That coupon code is not valid.' };
  const now = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  if (c.starts_at && c.starts_at > now) return { coupon: null, discount: 0, error: 'This coupon is not active yet.' };
  if (c.ends_at && c.ends_at < now) return { coupon: null, discount: 0, error: 'This coupon has expired.' };
  if (c.max_uses != null && c.used_count >= c.max_uses) return { coupon: null, discount: 0, error: 'This coupon has reached its usage limit.' };
  if (subtotal < c.min_order) {
    const sym = settings.get('currency_symbol', '₹');
    return { coupon: null, discount: 0, error: `Add items worth ${sym}${Math.ceil((c.min_order - subtotal) / 100)} more to use this coupon.` };
  }
  const discount = c.type === 'percent'
    ? Math.round((subtotal * Math.min(c.value, 100)) / 100)
    : Math.min(c.value, subtotal);
  return { coupon: c, discount };
}

function shippingFor(subtotalAfterDiscount) {
  if (subtotalAfterDiscount <= 0) return 0;
  const threshold = settings.getInt('free_shipping_threshold', 0);
  if (threshold > 0 && subtotalAfterDiscount >= threshold) return 0;
  return settings.getInt('shipping_fee', 0);
}

/**
 * Builds the full cart with live prices and stock. Lines that are no longer sellable are
 * removed and quantities are clamped to stock, with notices explaining what changed.
 */
function getCart(req) {
  const cart = rawCart(req);
  const lines = [];
  const notices = [];
  for (let i = cart.length - 1; i >= 0; i--) {
    const l = cart[i];
    const r = resolveItem(l.productId, l.variantId);
    if (!r || r.stock <= 0) {
      notices.push(r ? `${r.product.name} is now out of stock and was removed from your bag.` : 'An item in your bag is no longer available and was removed.');
      cart.splice(i, 1);
      continue;
    }
    if (l.qty > r.stock) {
      l.qty = r.stock;
      notices.push(`Only ${r.stock} left of ${r.product.name} — quantity updated.`);
    }
  }
  cart.forEach((l, index) => {
    const r = resolveItem(l.productId, l.variantId);
    lines.push({
      index,
      productId: r.product.id,
      variantId: r.variant ? r.variant.id : null,
      name: r.product.name,
      slug: r.product.slug,
      variantName: r.variant ? r.variant.name : null,
      variantLabel: r.product.variant_label || 'Option',
      sku: (r.variant && r.variant.sku) || r.product.sku || null,
      image: r.product.image,
      price: r.price,
      compareAt: r.product.compare_at_price,
      qty: l.qty,
      stock: r.stock,
      total: r.price * l.qty,
    });
  });

  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const couponResult = evaluateCoupon(req.session.couponCode, subtotal);
  if (req.session.couponCode && couponResult.error) {
    notices.push(couponResult.error);
    delete req.session.couponCode;
  }
  const discount = couponResult.discount || 0;
  const shipping = shippingFor(subtotal - discount);
  const threshold = settings.getInt('free_shipping_threshold', 0);
  return {
    lines,
    notices,
    count: lines.reduce((n, l) => n + l.qty, 0),
    subtotal,
    coupon: couponResult.coupon,
    discount,
    shipping,
    total: subtotal - discount + shipping,
    freeShippingRemaining: threshold > 0 && subtotal - discount < threshold ? threshold - (subtotal - discount) : 0,
    freeShippingThreshold: threshold,
  };
}

module.exports = { addItem, updateItem, removeItem, clear, count, getCart, evaluateCoupon, resolveItem, MAX_QTY };
