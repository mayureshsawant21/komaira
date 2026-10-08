// Tests the database API (supabase/schema.sql) on a real Postgres engine (PGlite),
// calling functions exactly as the website does: as the "anon" or "authenticated" role.
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const sql = (f) => fs.readFileSync(path.join(__dirname, '..', 'supabase', f), 'utf8');
const ADMIN = '00000000-0000-4000-8000-000000000001';
const SHOPPER = '00000000-0000-4000-8000-000000000002';
const STRANGER = '00000000-0000-4000-8000-000000000003';
const VISITOR = 'a'.repeat(32);

let db;

async function call(fn, p = {}, { uid = null } = {}) {
  assert.match(fn, /^[a-z_]+$/);
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid || '']);
    await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`);
    const r = await tx.query(`select public.${fn}($1::jsonb) as r`, [JSON.stringify(p)]);
    return r.rows[0].r;
  });
}
const asAdmin = (fn, p) => call(fn, p, { uid: ADMIN });
async function rejects(promise, re) {
  await assert.rejects(promise, (err) => { assert.match(err.message, re); return true; });
}
const one = async (q, params) => (await db.query(q, params)).rows[0];

const order = (items, extra = {}) => ({
  items,
  payment_method: 'cod',
  customer: { name: 'Asha Rao', email: 'asha@example.com', phone: '9876543210', address_line1: '12 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
  ...extra,
});

test.before(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  db = new PGlite();
  await db.exec(sql('local-stub.sql'));
  await db.exec(sql('schema.sql'));
  await db.exec(sql('seed.sql'));
  await db.query("insert into auth.users (id, email) values ($1, 'owner@komaira.test'), ($2, 'asha@example.com'), ($3, 'x@example.com')", [ADMIN, SHOPPER, STRANGER]);
  const r = await one("select public.make_admin('owner@komaira.test', 'Owner') as r");
  assert.match(r.r, /is now an admin/);
});

test('the public cannot reach tables, admin functions or make_admin', async () => {
  await rejects(db.transaction(async (tx) => { await tx.exec('set local role anon'); await tx.query('select * from shop.orders'); }), /permission denied/);
  await rejects(db.transaction(async (tx) => { await tx.exec('set local role anon'); await tx.query("select public.make_admin('x@example.com')"); }), /permission denied/);
  await rejects(db.transaction(async (tx) => { await tx.exec('set local role authenticated'); await tx.query("select shop.is_admin()"); }), /permission denied/);
  await rejects(call('admin_dashboard'), /Not authorised/);
  await rejects(call('admin_save_product', { name: 'Hack', price: 1 }, { uid: STRANGER }), /Not authorised/);
  assert.equal((await call('admin_me', {}, { uid: STRANGER })).is_admin, false);
  assert.equal((await asAdmin('admin_me')).is_admin, true);
});

test('storefront data: bootstrap, home, listing filters and product page', async () => {
  const boot = await call('store_bootstrap');
  assert.equal(boot.settings.store_name, 'Komaira Boutique');
  assert.equal(boot.categories.length, 6);
  assert.ok(boot.pages.some((p) => p.slug === 'about'));

  const home = await call('home_data');
  assert.equal(home.banners.length, 3);
  assert.ok(home.featured.length >= 5);
  assert.equal(home.reviews.length, 3);

  const lips = await call('list_products', { category: 'lips' });
  assert.equal(lips.total, 2);
  assert.equal(lips.category.name, 'Lips');
  const cheap = await call('list_products', { sort: 'price_asc', limit: 2 });
  assert.equal(cheap.items[0].name, 'Smudge-proof Kajal');
  assert.equal(cheap.total, 12);
  assert.equal((await call('list_products', { q: '100%' })).total, 0, 'wildcards in search are escaped');
  assert.equal((await call('list_products', { q: 'kajal' })).total, 1);
  assert.equal((await call('list_products', { onSale: true })).items.every((p) => p.compare_at_price > p.price), true);
  assert.equal((await call('list_products', { max: 40000 })).items.every((p) => p.price <= 40000), true);

  const lipstick = await call('get_product', { slug: 'velvet-matte-lipstick' });
  assert.equal(lipstick.variants.length, 4);
  assert.equal(lipstick.reviews.length, 1);
  assert.equal(lipstick.related.length, 1);
  assert.equal(await call('get_product', { slug: 'nope' }), null);
});

test('admin creates a category, sub-category and a product with shades and images', async () => {
  const parent = await asAdmin('admin_save_category', { name: 'Lip Care' });
  const child = await asAdmin('admin_save_category', { name: 'Lip Balms', parent_id: parent.id });
  await rejects(asAdmin('admin_save_category', { id: parent.id, name: 'Lip Care', parent_id: child.id }), /cannot be placed inside itself/);

  await rejects(asAdmin('admin_save_product', { name: '', price: 100 }), /name is required/);
  await rejects(asAdmin('admin_save_product', { name: 'X', price: 500, compare_at_price: 400 }), /higher than the selling price/);

  const saved = await asAdmin('admin_save_product', {
    name: 'Silk Lip Balm', category_id: child.id, price: 39900, compare_at_price: 49950, status: 'active', is_featured: true,
    variant_label: 'Shade', tags: ' soft ,  vegan,,', description: 'Soft balm.',
    variants: [{ name: 'Clear', stock: 3 }, { name: 'Cherry', color: '#c2384a', price: 44900, stock: 5 }, { name: '  ', stock: 9 }],
    images: [{ url: 'https://cdn.test/a.jpg' }, { url: 'https://cdn.test/b.jpg', alt: 'Side' }],
  });
  assert.equal(saved.slug, 'silk-lip-balm');
  const p = await asAdmin('admin_product', { id: saved.id });
  assert.equal(p.tags, 'soft, vegan');
  assert.deepEqual(p.variants.map((v) => [v.name, v.color, v.price, v.stock]), [['Clear', null, null, 3], ['Cherry', '#c2384a', 44900, 5]]);
  assert.deepEqual(p.images.map((i) => [i.url, i.alt]), [['https://cdn.test/a.jpg', 'Silk Lip Balm'], ['https://cdn.test/b.jpg', 'Side']]);

  // Editing keeps variant ids, removes dropped images and reports them for deletion.
  const cherry = p.variants[1];
  const again = await asAdmin('admin_save_product', { ...p, variants: [{ ...cherry, stock: 6 }], images: [{ url: 'https://cdn.test/b.jpg' }] });
  assert.deepEqual(again.removed_images, ['https://cdn.test/a.jpg']);
  const p2 = await asAdmin('admin_product', { id: saved.id });
  assert.equal(p2.variants.length, 1);
  assert.equal(p2.variants[0].id, cherry.id);
  assert.equal(p2.variants[0].stock, 6);

  // Products in a sub-category show up in the parent category.
  assert.equal((await call('list_products', { category: 'lip-care' })).total, 1);
  const dup = await asAdmin('admin_duplicate_product', { id: saved.id });
  const copy = await asAdmin('admin_product', { id: dup.id });
  assert.equal(copy.status, 'draft');
  assert.equal(copy.slug, 'silk-lip-balm-copy');
  assert.equal((await call('list_products', { q: 'silk' })).total, 1, 'drafts are hidden from the store');
});

test('cart quote prices from the database, clamps to stock and applies coupons', async () => {
  const lip = await call('get_product', { slug: 'velvet-matte-lipstick' });
  const [rose, , , mauve] = lip.variants;
  const quote = await call('cart_quote', {
    items: [
      { product_id: lip.id, variant_id: rose.id, qty: 50, price: 1 },
      { product_id: lip.id, variant_id: mauve.id, qty: 1 },
      { product_id: lip.id, qty: 1 },
      { product_id: 999999, qty: 1 },
    ],
    coupon: 'welcome10',
  });
  assert.equal(quote.lines.length, 1);
  assert.equal(quote.lines[0].qty, 10, 'max 10 per line');
  assert.equal(quote.lines[0].price, 59900, 'client-sent price is ignored');
  assert.equal(quote.notices.length, 3);
  assert.equal(quote.coupon, 'WELCOME10');
  assert.equal(quote.discount, 59900);
  assert.equal(quote.shipping, 0);

  const small = await call('cart_quote', { items: [{ product_id: (await call('get_product', { slug: 'smudge-proof-kajal' })).id, qty: 1 }], coupon: 'GLOW20' });
  assert.match(small.coupon_error, /more to use this coupon/);
  assert.equal(small.shipping, 7900, 'shipping fee below the free-shipping threshold');
});

test('placing an order validates details, takes stock and records the coupon', async () => {
  const lip = await call('get_product', { slug: 'velvet-matte-lipstick' });
  const brick = lip.variants.find((v) => v.name === 'Brick Red');
  const items = [{ product_id: lip.id, variant_id: brick.id, qty: 2 }];

  await rejects(call('place_order', order(items, { customer: { ...order(items).customer, phone: '12345' } })), /mobile number/);
  await rejects(call('place_order', order(items, { payment_method: 'upi' })), /UPI payment is not available/);
  await rejects(call('place_order', order([{ product_id: lip.id, variant_id: brick.id, qty: 99 }])), /Only 9 left/);
  await rejects(call('place_order', order([])), /bag is empty/);

  const placed = await call('place_order', order(items, { coupon: 'WELCOME10' }));
  assert.match(placed.order_number, /^KB-\d{4}$/);
  assert.equal(placed.total, 2 * 59900 - 11980);
  assert.equal((await one('select stock from shop.product_variants where id = $1', [brick.id])).stock, 7);
  assert.equal((await one("select used_count from shop.coupons where code = 'WELCOME10'")).used_count, 1);

  assert.equal(await call('get_order', { number: placed.order_number }), null, 'orders are private without the token');
  const o = await call('get_order', { number: placed.order_number, token: placed.token });
  assert.equal(o.status, 'confirmed');
  assert.equal(o.items.length, 1);
  assert.equal(o.admin_notes, undefined, 'private admin notes are never sent to shoppers');
  assert.deepEqual(await call('find_order', { number: placed.order_number.toLowerCase(), email: 'ASHA@example.com' }), { number: placed.order_number, token: placed.token });
  assert.equal(await call('find_order', { number: placed.order_number, email: 'other@example.com' }), null);
});

test('UPI orders wait for payment; cancelling restocks and re-opening takes stock again', async () => {
  await asAdmin('admin_save_settings', { values: { upi_id: 'komaira@okhdfc', not_a_setting: 'x' } });
  assert.equal((await one("select count(*)::int as n from shop.settings where key = 'not_a_setting'")).n, 0);
  const kajal = await call('get_product', { slug: 'smudge-proof-kajal' });
  const placed = await call('place_order', order([{ product_id: kajal.id, qty: 3 }], { payment_method: 'upi' }));
  const id = (await one('select id from shop.orders where order_number = $1', [placed.order_number])).id;
  assert.equal((await asAdmin('admin_order', { id })).status, 'pending');
  assert.equal((await one('select stock from shop.products where id = $1', [kajal.id])).stock, 117);

  await asAdmin('admin_update_order', { id, status: 'cancelled', payment_status: 'pending' });
  assert.equal((await one('select stock from shop.products where id = $1', [kajal.id])).stock, 120);
  const reopened = await asAdmin('admin_update_order', { id, status: 'confirmed', payment_status: 'paid', courier: 'Delhivery', tracking_number: 'DL123', admin_notes: 'VIP' });
  assert.equal(reopened.payment_status, 'paid');
  assert.equal(reopened.tracking_number, 'DL123');
  assert.equal((await one('select stock from shop.products where id = $1', [kajal.id])).stock, 117);
  assert.ok(reopened.events.length >= 4);

  const list = await asAdmin('admin_orders', { q: 'asha', all: true });
  assert.ok(list.total >= 2);
  assert.ok(list.items[0].items_text.length > 0);
  const dash = await asAdmin('admin_dashboard');
  assert.equal(dash.daily.length, 30);
  assert.ok(dash.sales_30.revenue > 0);
});

test('visitor tracking per page; the owner is not counted; analytics report', async () => {
  const lip = await call('get_product', { slug: 'velvet-matte-lipstick' });
  await call('track_view', { visitor_id: VISITOR, path: '/', type: 'home', title: 'Home', referrer: 'instagram.com', device: 'Mobile', browser: 'Chrome', is_new: true });
  await call('track_view', { visitor_id: VISITOR, path: '/product/velvet-matte-lipstick', type: 'product', ref_id: lip.id, title: lip.name, device: 'Mobile', browser: 'Chrome' });
  await call('track_view', { visitor_id: 'b'.repeat(32), path: '/product/velvet-matte-lipstick', type: 'product', ref_id: lip.id, device: 'Desktop', browser: 'Safari', is_new: true });
  await call('track_view', { visitor_id: 'not-valid', path: '/' });
  await asAdmin('track_view', { visitor_id: 'c'.repeat(32), path: '/' });

  const a = await asAdmin('admin_analytics', { days: 7 });
  assert.equal(a.totals.views, 3);
  assert.equal(a.totals.visitors, 2);
  assert.equal(a.totals.new_visitors, 2);
  assert.equal(a.live, 2);
  const page = a.pages.find((p) => p.path === '/product/velvet-matte-lipstick');
  assert.equal(page.views, 2);
  assert.equal(page.visitors, 2);
  assert.equal(a.products[0].name, 'Velvet Matte Lipstick');
  assert.ok(a.referrers.some((r) => r.source === 'instagram.com'));
  assert.equal(a.daily.length, 7);
  assert.ok((await asAdmin('admin_products', {})).items.some((p) => p.views_30d === 2));
});

test('reviews need approval; messages and subscribers', async () => {
  await rejects(call('submit_review', { slug: 'silk-lip-balm', rating: 9, name: 'M', body: 'x' }), /star rating/);
  await call('submit_review', { slug: 'silk-lip-balm', rating: 5, name: 'Meera', body: 'Lovely' });
  assert.equal((await call('get_product', { slug: 'silk-lip-balm' })).reviews.length, 0);
  const pending = await asAdmin('admin_reviews', { status: 'pending' });
  await asAdmin('admin_review_action', { id: pending.items[0].id, action: 'approve' });
  assert.equal((await call('get_product', { slug: 'silk-lip-balm' })).reviews.length, 1);

  await rejects(call('submit_message', { name: 'A', email: 'bad', body: 'hi' }), /valid email/);
  await call('submit_message', { name: 'A', email: 'a@b.co', body: 'hi' });
  assert.equal((await asAdmin('admin_badges')).messages, 1);
  await call('subscribe', { email: 'Fan@Example.com' });
  await call('subscribe', { email: 'fan@example.com' });
  assert.equal((await asAdmin('admin_subscribers')).length, 1);
});

test('customer accounts: profile created on first visit, guest orders linked, wishlist', async () => {
  const acct = await call('my_account', {}, { uid: SHOPPER });
  assert.equal(acct.email, 'asha@example.com');
  assert.ok(acct.orders.length >= 2, 'earlier guest orders with the same verified email are linked');
  await call('save_profile', { name: 'Asha R', city: 'Pune' }, { uid: SHOPPER });
  const lip = await call('get_product', { slug: 'velvet-matte-lipstick' });
  assert.deepEqual(await call('toggle_wishlist', { product_id: lip.id }, { uid: SHOPPER }), { saved: true });
  assert.equal((await call('get_product', { slug: 'velvet-matte-lipstick' }, { uid: SHOPPER })).in_wishlist, true);
  assert.equal((await call('my_wishlist', {}, { uid: SHOPPER })).length, 1);
  await rejects(call('toggle_wishlist', { product_id: lip.id }), /sign in/);
  // A signed-in customer can open their own order without the token, but not someone else's.
  const num = acct.orders[0].order_number;
  assert.ok(await call('get_order', { number: num }, { uid: SHOPPER }));
  assert.equal(await call('get_order', { number: num }, { uid: STRANGER }), null);
});

test('banners: scheduling, ordering, safe links', async () => {
  const b = await asAdmin('admin_save_banner', { title: 'Old offer', cta_link: 'javascript:alert(1)', ends_at: '2020-01-01T00:00:00+05:30' });
  const list = await asAdmin('admin_banners');
  const saved = list.find((x) => x.id === b.id);
  assert.equal(saved.state, 'Ended');
  assert.equal(saved.cta_link, '#/javascript:alert(1)', 'unsafe links become harmless store links');
  assert.ok(!(await call('home_data')).banners.some((x) => x.title === 'Old offer'));
  await asAdmin('admin_banner_action', { id: b.id, action: 'up' });
  const order1 = (await asAdmin('admin_banners')).map((x) => x.id);
  assert.equal(order1.indexOf(b.id), order1.length - 2);
  const del = await asAdmin('admin_banner_action', { id: b.id, action: 'delete' });
  assert.deepEqual(del.removed_images, []);
  const link = await asAdmin('admin_save_banner', { title: 'Lips', cta_link: '/category/lips' });
  assert.equal((await asAdmin('admin_banners')).find((x) => x.id === link.id).cta_link, '#/category/lips');
});

test('coupons, pages, categories and team management', async () => {
  await rejects(asAdmin('admin_save_coupon', { code: 'welcome10', value: 5 }), /already exists/);
  const c = await asAdmin('admin_save_coupon', { code: 'flat 100!', type: 'fixed', value: 10000, min_order: 99900, max_uses: '1' });
  assert.equal((await one('select code from shop.coupons where id = $1', [c.id])).code, 'FLAT100');

  const pg = await asAdmin('admin_save_page', { title: 'Gift cards', content: '## Hello' });
  assert.equal((await call('get_page', { slug: 'gift-cards' })).title, 'Gift cards');
  await asAdmin('admin_delete_page', { id: pg.id });

  const cats = await asAdmin('admin_categories');
  const lips = cats.find((x) => x.slug === 'lips');
  await asAdmin('admin_delete_category', { id: lips.id });
  assert.equal((await one("select count(*)::int as n from shop.products where name = 'Velvet Matte Lipstick' and category_id is null")).n, 1, 'products are kept');

  await rejects(asAdmin('admin_add_admin', { email: 'nobody@example.com' }), /No account with that email/);
  await asAdmin('admin_add_admin', { email: 'x@example.com', name: 'Helper' });
  assert.equal((await call('admin_me', {}, { uid: STRANGER })).is_admin, true);
  await rejects(asAdmin('admin_remove_admin', { user_id: ADMIN }), /your own account/);
  await asAdmin('admin_remove_admin', { user_id: STRANGER });
  assert.equal((await call('admin_me', {}, { uid: STRANGER })).is_admin, false);
});
