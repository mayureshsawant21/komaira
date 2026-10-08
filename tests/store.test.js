const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'komaira-test-'));
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.UPLOAD_DIR = tmp;
process.env.ADMIN_EMAIL = 'owner@komaira.test';
process.env.ADMIN_PASSWORD = 'super-secret-pass';
process.env.RAZORPAY_KEY_ID = '';
process.env.SMTP_HOST = '';

const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db');

const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function agent() {
  const a = request.agent(app);
  return {
    a,
    async csrf(url = '/') {
      const res = await a.get(url).set('User-Agent', BROWSER);
      const m = res.text.match(/data-csrf="([a-f0-9]+)"/) || res.text.match(/name="_csrf" value="([a-f0-9]+)"/);
      assert.ok(m, `no CSRF token on ${url} (status ${res.status})`);
      return m[1];
    },
  };
}

async function adminAgent() {
  const ad = agent();
  const token = await ad.csrf('/admin/login');
  const res = await ad.a.post('/admin/login').type('form').send({ _csrf: token, email: 'owner@komaira.test', password: 'super-secret-pass', next: '/admin' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/admin');
  ad.token = await ad.csrf('/admin');
  return ad;
}

let admin;
let categoryId;
let productId;

test('admin login rejects missing CSRF token and wrong password', async () => {
  const ad = agent();
  const noToken = await ad.a.post('/admin/login').type('form').send({ email: 'owner@komaira.test', password: 'super-secret-pass' });
  assert.equal(noToken.status, 403);
  const token = await ad.csrf('/admin/login');
  const wrong = await ad.a.post('/admin/login').type('form').send({ _csrf: token, email: 'owner@komaira.test', password: 'nope' });
  assert.equal(wrong.status, 401);
  const blocked = await request(app).get('/admin/products');
  assert.equal(blocked.status, 302);
  assert.match(blocked.headers.location, /^\/admin\/login/);
});

test('admin can sign in and create a category with an image', async () => {
  admin = await adminAgent();
  const res = await admin.a.post('/admin/categories')
    .field('_csrf', admin.token)
    .field('name', 'Lip Care')
    .field('description', 'Balms and scrubs')
    .field('is_active', 'on')
    .field('show_on_home', 'on')
    .attach('image', PNG, { filename: 'lips.png', contentType: 'image/png' });
  assert.equal(res.status, 302);
  const cat = db.prepare("SELECT * FROM categories WHERE name = 'Lip Care'").get();
  assert.ok(cat);
  assert.equal(cat.slug, 'lip-care');
  assert.match(cat.image, /^\/uploads\/.+\.png$/);
  assert.ok(fs.existsSync(path.join(tmp, path.basename(cat.image))));
  categoryId = cat.id;
});

test('multipart forms without a CSRF token are rejected', async () => {
  const res = await admin.a.post('/admin/categories').field('name', 'Sneaky');
  assert.equal(res.status, 403);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM categories WHERE name = 'Sneaky'").get().n, 0);
});

test('admin can add a product with images and shade variants', async () => {
  const res = await admin.a.post('/admin/products')
    .field('_csrf', admin.token)
    .field('name', 'Silk Lip Balm')
    .field('category_id', String(categoryId))
    .field('brand', 'Komaira')
    .field('price', '399')
    .field('compare_at_price', '499.50')
    .field('stock', '0')
    .field('status', 'active')
    .field('is_featured', 'on')
    .field('variant_label', 'Shade')
    .field('description', 'Soft balm.\n\n- Shea\n- Vitamin E')
    .field('variant_id', '').field('variant_name', 'Clear').field('variant_color', '').field('variant_price', '').field('variant_stock', '3').field('variant_sku', 'SLB-C')
    .field('variant_id', '').field('variant_name', 'Cherry').field('variant_color', '#c2384a').field('variant_price', '449').field('variant_stock', '5').field('variant_sku', 'SLB-R')
    .attach('images', PNG, { filename: 'a.png', contentType: 'image/png' })
    .attach('images', PNG, { filename: 'b.png', contentType: 'image/png' })
    .attach('images', Buffer.from('<svg onload=alert(1)>'), { filename: 'evil.png', contentType: 'image/png' });
  assert.equal(res.status, 302, res.text);
  const p = db.prepare("SELECT * FROM products WHERE name = 'Silk Lip Balm'").get();
  productId = p.id;
  assert.equal(p.price, 39900);
  assert.equal(p.compare_at_price, 49950);
  assert.equal(p.slug, 'silk-lip-balm');
  const images = db.prepare('SELECT * FROM product_images WHERE product_id = ?').all(p.id);
  assert.equal(images.length, 2, 'fake image should be discarded');
  const variants = db.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort_order').all(p.id);
  assert.deepEqual(variants.map((v) => [v.name, v.color, v.price, v.stock, v.sku]), [
    ['Clear', null, null, 3, 'SLB-C'],
    ['Cherry', '#c2384a', 44900, 5, 'SLB-R'],
  ]);
});

test('product validation keeps the form and explains the problem', async () => {
  const res = await admin.a.post('/admin/products').field('_csrf', admin.token).field('name', '').field('price', '');
  assert.equal(res.status, 400);
  assert.match(res.text, /Product name is required/);
});

test('admin can create a homepage banner slide that shows on the storefront', async () => {
  const res = await admin.a.post('/admin/banners')
    .field('_csrf', admin.token)
    .field('title', 'Diwali Glow Sale')
    .field('eyebrow', 'Limited time')
    .field('cta_text', 'Shop now')
    .field('cta_link', 'javascript:alert(1)')
    .field('is_active', 'on')
    .field('bg_color', '#ffeedd');
  assert.equal(res.status, 302);
  const b = db.prepare("SELECT * FROM banners WHERE title = 'Diwali Glow Sale'").get();
  assert.ok(!b.cta_link.startsWith('javascript:'), 'unsafe links are neutralised');
  const ended = db.prepare("INSERT INTO banners (title, is_active, ends_at) VALUES ('Old offer', 1, '2020-01-01 00:00:00')").run();
  const home = await request(app).get('/').set('User-Agent', BROWSER);
  assert.equal(home.status, 200);
  assert.match(home.text, /Diwali Glow Sale/);
  assert.match(home.text, /Silk Lip Balm/);
  assert.doesNotMatch(home.text, /Old offer/, 'expired banners are hidden');
  db.prepare('DELETE FROM banners WHERE id = ?').run(ended.lastInsertRowid);
});

test('shopper journey: browse, add a shade, apply coupon, check out with COD', async () => {
  db.prepare("INSERT INTO coupons (code, type, value, min_order) VALUES ('TEN', 'percent', 10, 0)").run();
  const shopper = agent();
  const token = await shopper.csrf('/product/silk-lip-balm');
  const cherry = db.prepare("SELECT id FROM product_variants WHERE name = 'Cherry'").get().id;

  const noVariant = await shopper.a.post('/cart/add').set('Accept', 'application/json').type('form').send({ _csrf: token, product_id: productId, qty: 1 });
  assert.equal(noVariant.status, 400, 'a shade must be chosen');

  const add = await shopper.a.post('/cart/add').set('Accept', 'application/json').type('form').send({ _csrf: token, product_id: productId, variant_id: cherry, qty: 9 });
  assert.equal(add.status, 200);
  assert.equal(add.body.count, 5, 'quantity is capped at available stock');

  await shopper.a.post('/cart/coupon').type('form').send({ _csrf: token, code: 'ten' });
  const cart = await shopper.a.get('/cart').set('User-Agent', BROWSER);
  assert.match(cart.text, /TEN<\/strong> applied/);

  const bad = await shopper.a.post('/checkout').type('form').send({ _csrf: token, name: 'Asha', email: 'bad', payment_method: 'cod' });
  assert.equal(bad.status, 400);

  const res = await shopper.a.post('/checkout').type('form').send({
    _csrf: token, name: 'Asha Rao', email: 'asha@example.com', phone: '9876543210', address_line1: '12 MG Road',
    city: 'Pune', state: 'Maharashtra', pincode: '411001', payment_method: 'cod',
  });
  assert.equal(res.status, 302, res.text);
  assert.match(res.headers.location, /^\/order\/KB-\d+\?t=[a-f0-9]+&placed=1$/);

  const order = db.prepare("SELECT * FROM orders WHERE email = 'asha@example.com'").get();
  assert.equal(order.subtotal, 5 * 44900);
  assert.equal(order.discount, Math.round(5 * 44900 * 0.1));
  assert.equal(order.shipping, 0, 'free shipping above threshold');
  assert.equal(order.total, order.subtotal - order.discount);
  assert.equal(order.status, 'confirmed');
  assert.equal(db.prepare('SELECT stock FROM product_variants WHERE id = ?').get(cherry).stock, 0);
  assert.equal(db.prepare("SELECT used_count FROM coupons WHERE code = 'TEN'").get().used_count, 1);

  const page = await shopper.a.get(res.headers.location).set('User-Agent', BROWSER);
  assert.equal(page.status, 200);
  assert.match(page.text, /Thank you, Asha/);
  const stranger = await request(app).get(`/order/${order.order_number}`);
  assert.equal(stranger.status, 404, 'orders are private without the access token');
});

test('admin sees the order, can cancel it, and stock is restored', async () => {
  const order = db.prepare("SELECT * FROM orders WHERE email = 'asha@example.com'").get();
  const list = await admin.a.get('/admin/orders');
  assert.match(list.text, new RegExp(order.order_number));
  const show = await admin.a.get(`/admin/orders/${order.id}`);
  assert.equal(show.status, 200);
  const res = await admin.a.post(`/admin/orders/${order.id}`).type('form')
    .send({ _csrf: admin.token, status: 'cancelled', payment_status: 'pending', courier: '', tracking_number: '' });
  assert.equal(res.status, 302);
  assert.equal(db.prepare('SELECT status FROM orders WHERE id = ?').get(order.id).status, 'cancelled');
  assert.equal(db.prepare("SELECT stock FROM product_variants WHERE name = 'Cherry'").get().stock, 5);
  const csv = await admin.a.get('/admin/orders/export.csv');
  assert.equal(csv.status, 200);
  assert.match(csv.text, /Asha Rao/);
  const invoice = await admin.a.get(`/admin/orders/${order.id}/invoice`);
  assert.equal(invoice.status, 200);
});

test('page visits are tracked per page and shown in analytics (bots ignored)', async () => {
  db.prepare('DELETE FROM page_views').run();
  const visitor = request.agent(app);
  await visitor.get('/').set('User-Agent', BROWSER).set('Referer', 'https://www.instagram.com/komaira');
  await visitor.get('/product/silk-lip-balm').set('User-Agent', BROWSER);
  await visitor.get('/product/silk-lip-balm').set('User-Agent', BROWSER);
  await request(app).get('/').set('User-Agent', 'Googlebot/2.1');
  await request(app).get('/does-not-exist').set('User-Agent', BROWSER);
  await visitor.get('/account/login?next=/cart').set('User-Agent', BROWSER);

  const rows = db.prepare('SELECT * FROM page_views ORDER BY id').all();
  assert.equal(rows.length, 4);
  assert.equal(rows[3].path, '/account/login', 'full path is recorded for pages in sub-routers');
  assert.equal(new Set(rows.map((r) => r.visitor_id)).size, 1, 'same visitor across pages');
  assert.equal(rows[0].referrer, 'instagram.com');
  assert.equal(rows[1].page_type, 'product');
  assert.equal(rows[1].ref_id, productId);

  const report = await admin.a.get('/admin/analytics?days=7');
  assert.equal(report.status, 200);
  assert.match(report.text, /\/product\/silk-lip-balm/);
  assert.match(report.text, /instagram\.com/);

  const before = db.prepare('SELECT COUNT(*) AS n FROM page_views').get().n;
  await admin.a.get('/');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM page_views').get().n, before, "the owner's own visits are not counted");
});

test('reviews wait for approval before appearing', async () => {
  const v = agent();
  const token = await v.csrf('/product/silk-lip-balm');
  await v.a.post('/product/silk-lip-balm/review').type('form').send({ _csrf: token, rating: 5, name: 'Meera', body: 'Lovely balm <script>x</script>' });
  const review = db.prepare("SELECT * FROM reviews WHERE name = 'Meera'").get();
  assert.equal(review.status, 'pending');
  let page = await request(app).get('/product/silk-lip-balm');
  assert.doesNotMatch(page.text, /Lovely balm/);
  await admin.a.post(`/admin/reviews/${review.id}/approve`).type('form').send({ _csrf: admin.token });
  page = await request(app).get('/product/silk-lip-balm');
  assert.match(page.text, /Lovely balm &lt;script&gt;/, 'review text is escaped');
});

test('customers can register, and their account shows orders', async () => {
  const c = agent();
  const token = await c.csrf('/account/register');
  const res = await c.a.post('/account/register').type('form').send({ _csrf: token, name: 'Asha Rao', email: 'asha@example.com', password: 'longenough1' });
  assert.equal(res.status, 302);
  const page = await c.a.get('/account').set('User-Agent', BROWSER);
  assert.equal(page.status, 200);
  assert.match(page.text, /KB-\d+/, 'earlier guest order is linked to the new account');
});

test('every admin screen renders', async () => {
  const order = db.prepare('SELECT id FROM orders LIMIT 1').get();
  const customer = db.prepare('SELECT id FROM customers LIMIT 1').get();
  const banner = db.prepare('SELECT id FROM banners LIMIT 1').get();
  const coupon = db.prepare('SELECT id FROM coupons LIMIT 1').get();
  const page = db.prepare('SELECT id FROM pages LIMIT 1').get();
  const urls = ['/admin', '/admin/products', '/admin/products/new', `/admin/products/${productId}/edit`, '/admin/categories', '/admin/categories/new',
    `/admin/categories/${categoryId}/edit`, '/admin/banners', '/admin/banners/new', `/admin/banners/${banner.id}/edit`, '/admin/orders',
    `/admin/orders/${order.id}`, '/admin/customers', `/admin/customers/${customer.id}`, '/admin/coupons', '/admin/coupons/new',
    `/admin/coupons/${coupon.id}/edit`, '/admin/reviews', '/admin/analytics', '/admin/analytics?days=1', '/admin/messages', '/admin/subscribers',
    '/admin/subscribers/export.csv', '/admin/pages', '/admin/pages/new', `/admin/pages/${page.id}/edit`, '/admin/settings'];
  for (const url of urls) {
    const res = await admin.a.get(url);
    assert.equal(res.status, 200, `${url} → ${res.status}`);
  }
});

test('storefront pages render', async () => {
  for (const url of ['/', '/shop', '/shop?q=balm', '/shop?sort=price_asc&stock=1', '/category/lip-care', '/product/silk-lip-balm', '/cart', '/contact',
    '/pages/about', '/track-order', '/account/login', '/account/register', '/sitemap.xml', '/robots.txt']) {
    const res = await request(app).get(url).set('User-Agent', BROWSER);
    assert.equal(res.status, 200, `${url} → ${res.status}`);
  }
  const search = await request(app).get('/shop?q=balm');
  assert.match(search.text, /Silk Lip Balm/);
});

test('deleting a category keeps its products', async () => {
  await admin.a.post(`/admin/categories/${categoryId}/delete`).type('form').send({ _csrf: admin.token });
  assert.equal(db.prepare('SELECT category_id FROM products WHERE id = ?').get(productId).category_id, null);
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
