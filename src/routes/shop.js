const express = require('express');
const db = require('../db');
const config = require('../config');
const catalog = require('../lib/catalog');
const orders = require('../lib/orders');
const { toPaise, toInt, paginate, isValidEmail, truncate, escapeHtml } = require('../lib/helpers');

const router = express.Router();
const PER_PAGE = 12;

router.get('/', (req, res) => {
  const featured = catalog.listProducts({ featured: true, limit: 8 }).items;
  const newest = catalog.listProducts({ sort: 'newest', limit: 8 }).items;
  const onSale = catalog.listProducts({ onSale: true, sort: 'newest', limit: 4 }).items;
  const homeCategories = catalog.activeCategories().filter((c) => c.show_on_home && !c.parent_id);
  const reviews = db.prepare(`SELECT r.*, p.name AS product_name, p.slug AS product_slug FROM reviews r
      JOIN products p ON p.id = r.product_id WHERE r.status = 'approved' AND r.rating >= 4 ORDER BY r.created_at DESC LIMIT 3`).all();
  res.locals.track = { type: 'home', title: 'Home' };
  res.render('shop/home', {
    banners: catalog.activeBanners(),
    featured: featured.length ? featured : newest,
    newest,
    onSale,
    homeCategories,
    reviews,
  });
});

function listingFilters(req) {
  return {
    q: String(req.query.q || '').trim().slice(0, 80),
    sort: String(req.query.sort || ''),
    minPrice: toPaise(req.query.min) ?? undefined,
    maxPrice: toPaise(req.query.max) ?? undefined,
    inStock: req.query.stock === '1',
    onSale: req.query.sale === '1',
    page: Math.max(1, toInt(req.query.page, 1)),
  };
}

function renderListing(req, res, { category = null, heading, intro, trackType }) {
  const f = listingFilters(req);
  const base = { categoryId: category?.id, q: f.q, sort: f.sort, minPrice: f.minPrice, maxPrice: f.maxPrice, inStock: f.inStock, onSale: f.onSale };
  const { total } = catalog.listProducts({ ...base, limit: 1 });
  const pager = paginate(total, f.page, PER_PAGE);
  const { items } = catalog.listProducts({ ...base, limit: PER_PAGE, offset: pager.offset });
  const subcategories = category ? catalog.activeCategories().filter((c) => c.parent_id === category.id) : [];
  res.locals.track = { type: trackType, id: category?.id, title: heading };
  res.render('shop/listing', {
    title: heading,
    metaDescription: truncate(intro || category?.description || `Shop ${heading} at ${res.locals.settings.store_name}`),
    heading,
    intro,
    category,
    subcategories,
    products: items,
    pager,
    filters: f,
  });
}

router.get('/shop', (req, res) => {
  const q = String(req.query.q || '').trim();
  renderListing(req, res, {
    heading: q ? `Results for “${q.slice(0, 80)}”` : req.query.sale === '1' ? 'On sale' : 'Shop all',
    intro: q ? '' : 'Our full edit of skincare, makeup and beauty essentials.',
    trackType: q ? 'search' : 'shop',
  });
});

router.get('/category/:slug', (req, res, next) => {
  const category = db.prepare('SELECT * FROM categories WHERE slug = ? AND is_active = 1').get(req.params.slug);
  if (!category) return next();
  category.parent = category.parent_id ? db.prepare('SELECT name, slug FROM categories WHERE id = ?').get(category.parent_id) : null;
  renderListing(req, res, { category, heading: category.name, intro: category.description, trackType: 'category' });
});

router.get('/product/:slug', (req, res, next) => {
  const product = catalog.getProductBySlug(req.params.slug);
  if (!product) return next();
  const reviews = db.prepare("SELECT * FROM reviews WHERE product_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 50").all(product.id);
  const related = catalog.listProducts({ categoryId: product.category_id, excludeId: product.id, limit: 4 }).items;
  const inWishlist = req.customer
    ? Boolean(db.prepare('SELECT 1 FROM wishlist WHERE customer_id = ? AND product_id = ?').get(req.customer.id, product.id))
    : false;
  res.locals.track = { type: 'product', id: product.id, title: product.name };
  res.render('shop/product', {
    title: product.meta_title || product.name,
    metaDescription: product.meta_description || truncate(product.short_description || product.description),
    ogImage: product.images[0]?.path,
    product,
    reviews,
    related,
    inWishlist,
  });
});

router.post('/product/:slug/review', (req, res, next) => {
  const product = db.prepare("SELECT id, slug FROM products WHERE slug = ? AND status = 'active'").get(req.params.slug);
  if (!product) return next();
  const rating = toInt(req.body.rating, 0);
  const name = String(req.body.name || req.customer?.name || '').trim().slice(0, 80);
  const body = String(req.body.body || '').trim().slice(0, 2000);
  if (rating < 1 || rating > 5 || !name || !body) {
    req.flash('error', 'Please add a star rating, your name and a few words about the product.');
    return res.redirect(`/product/${product.slug}#reviews`);
  }
  db.prepare('INSERT INTO reviews (product_id, customer_id, name, rating, title, body) VALUES (?, ?, ?, ?, ?, ?)').run(
    product.id, req.customer?.id || null, name, rating, String(req.body.title || '').trim().slice(0, 120) || null, body,
  );
  req.flash('success', 'Thank you! Your review will appear once it has been approved.');
  res.redirect(`/product/${product.slug}#reviews`);
});

router.get('/pages/:slug', (req, res, next) => {
  const page = db.prepare('SELECT * FROM pages WHERE slug = ? AND is_active = 1').get(req.params.slug);
  if (!page) return next();
  res.locals.track = { type: 'page', id: page.id, title: page.title };
  res.render('shop/page', { title: page.title, page });
});

router.get('/contact', (req, res) => {
  res.locals.track = { type: 'contact', title: 'Contact' };
  res.render('shop/contact', { title: 'Contact us', form: {} });
});

router.post('/contact', (req, res) => {
  const form = {
    name: String(req.body.name || '').trim().slice(0, 100),
    email: String(req.body.email || '').trim().slice(0, 200),
    phone: String(req.body.phone || '').trim().slice(0, 30),
    subject: String(req.body.subject || '').trim().slice(0, 150),
    body: String(req.body.body || '').trim().slice(0, 5000),
  };
  if (!form.name || !isValidEmail(form.email) || !form.body) {
    res.locals.flash = { error: 'Please fill in your name, a valid email and your message.' };
    return res.status(400).render('shop/contact', { title: 'Contact us', form });
  }
  db.prepare('INSERT INTO messages (name, email, phone, subject, body) VALUES (?, ?, ?, ?, ?)').run(form.name, form.email, form.phone || null, form.subject || null, form.body);
  req.flash('success', "Thanks for reaching out! We'll get back to you soon.");
  res.redirect('/contact');
});

router.post('/newsletter', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) {
    req.flash('error', 'Please enter a valid email address.');
  } else {
    db.prepare('INSERT OR IGNORE INTO subscribers (email) VALUES (?)').run(email);
    req.flash('success', "You're on the list! Look out for offers and new arrivals.");
  }
  const back = req.get('referer');
  let target = '/';
  try { if (back && new URL(back).host === req.get('host')) target = new URL(back).pathname; } catch { /* ignore */ }
  res.redirect(target + '#newsletter');
});

router.get('/track-order', (req, res) => {
  res.locals.track = { type: 'track-order', title: 'Track order' };
  res.render('shop/track', { title: 'Track your order', form: {} });
});

router.post('/track-order', (req, res) => {
  const number = String(req.body.order_number || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const order = orders.getOrderByNumber(number);
  if (!order || order.email.toLowerCase() !== email) {
    res.locals.flash = { error: "We couldn't find an order with those details." };
    return res.status(404).render('shop/track', { title: 'Track your order', form: { order_number: number, email } });
  }
  res.redirect(`/order/${encodeURIComponent(order.order_number)}?t=${order.access_token}`);
});

router.get('/order/:number', (req, res, next) => {
  const order = orders.getOrderByNumber(req.params.number);
  if (!order) return next();
  const allowed = req.query.t === order.access_token || (req.customer && req.customer.id === order.customer_id);
  if (!allowed) return next();
  res.locals.track = { type: 'order', title: 'Order status' };
  res.render('shop/order', { title: `Order ${order.order_number}`, order, justPlaced: req.query.placed === '1' });
});

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /cart\nDisallow: /checkout\nDisallow: /account\nSitemap: ${config.baseUrl}/sitemap.xml\n`);
});

router.get('/sitemap.xml', (req, res) => {
  const urls = ['/', '/shop', '/contact'];
  for (const c of db.prepare('SELECT slug FROM categories WHERE is_active = 1').all()) urls.push(`/category/${c.slug}`);
  for (const p of db.prepare("SELECT slug FROM products WHERE status = 'active'").all()) urls.push(`/product/${p.slug}`);
  for (const p of db.prepare('SELECT slug FROM pages WHERE is_active = 1').all()) urls.push(`/pages/${p.slug}`);
  const body = urls.map((u) => `<url><loc>${escapeHtml(config.baseUrl + u)}</loc></url>`).join('');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`);
});

module.exports = router;
