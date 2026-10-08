// The shopping bag lives in this browser (localStorage); prices are always re-checked by the server.
const KEY = 'komaira-cart';
const listeners = new Set();

function read() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { items: Array.isArray(c.items) ? c.items : [], coupon: c.coupon || '' };
  } catch {
    return { items: [], coupon: '' };
  }
}
function write(c) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* storage full or blocked */ }
  listeners.forEach((fn) => fn(count()));
}

export const getCart = read;
export const count = () => read().items.reduce((n, l) => n + (Number(l.qty) || 0), 0);
export const onChange = (fn) => listeners.add(fn);

export function add(productId, variantId, qty, maxStock = 10) {
  const c = read();
  const line = c.items.find((l) => l.product_id === productId && (l.variant_id || null) === (variantId || null));
  const wanted = (line ? line.qty : 0) + Math.max(1, qty);
  const finalQty = Math.min(wanted, maxStock, 10);
  if (line) line.qty = finalQty;
  else c.items.push({ product_id: productId, variant_id: variantId || null, qty: finalQty });
  write(c);
  return { limited: finalQty < wanted, qty: finalQty };
}

export function setQty(index, qty) {
  const c = read();
  if (!c.items[index]) return;
  if (qty <= 0) c.items.splice(index, 1);
  else c.items[index].qty = Math.min(qty, 10);
  write(c);
}

export function setCoupon(code) {
  const c = read();
  c.coupon = code || '';
  write(c);
}

/** Replaces the stored bag with the lines the server accepted (drops sold-out items, clamps quantities). */
export function syncFromQuote(quote) {
  const c = read();
  c.items = quote.lines.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id, qty: l.qty }));
  if (quote.coupon_error) c.coupon = '';
  write(c);
}

export function clear() { write({ items: [], coupon: '' }); }
