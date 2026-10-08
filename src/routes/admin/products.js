const express = require('express');
const db = require('../../db');
const analytics = require('../../lib/analytics');
const { publicPath, filesFor, removeUpload } = require('../../lib/upload');
const { toPaise, toInt, checkbox, uniqueSlug, paginate } = require('../../lib/helpers');

const router = express.Router();
router.use((req, res, next) => { res.locals.section = 'products'; next(); });

const arr = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function categoryOptions() {
  const all = db.prepare('SELECT id, name, parent_id FROM categories ORDER BY sort_order, name').all();
  const out = [];
  const walk = (parentId, depth) => {
    for (const c of all.filter((x) => (x.parent_id || null) === parentId)) {
      out.push({ id: c.id, label: `${'— '.repeat(depth)}${c.name}` });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  // Categories whose parent was deleted still need to appear.
  for (const c of all) if (!out.some((o) => o.id === c.id)) out.push({ id: c.id, label: c.name });
  return out;
}

router.get('/', (req, res) => {
  const where = ['1=1'];
  const params = {};
  const q = String(req.query.q || '').trim();
  if (q) { where.push('(p.name LIKE @q OR p.sku LIKE @q OR p.brand LIKE @q)'); params.q = `%${q}%`; }
  if (req.query.category) { where.push('p.category_id = @cat'); params.cat = toInt(req.query.category); }
  if (['active', 'draft'].includes(req.query.status)) { where.push('p.status = @status'); params.status = req.query.status; }
  const stockExpr = `CASE WHEN EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)
      THEN (SELECT SUM(stock) FROM product_variants v WHERE v.product_id = p.id) ELSE p.stock END`;
  if (req.query.stock === 'low') where.push(`${stockExpr} BETWEEN 1 AND p.low_stock_threshold`);
  if (req.query.stock === 'out') where.push(`${stockExpr} <= 0`);
  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM products p WHERE ${whereSql}`).get(params).n;
  const pager = paginate(total, toInt(req.query.page, 1), 25);
  const products = db.prepare(`SELECT p.*, c.name AS category_name, ${stockExpr} AS available,
      (SELECT path FROM product_images WHERE product_id = p.id ORDER BY sort_order, id LIMIT 1) AS image,
      (SELECT COUNT(*) FROM product_variants WHERE product_id = p.id) AS variant_count,
      (SELECT COUNT(*) FROM page_views WHERE page_type = 'product' AND ref_id = p.id AND created_at >= @since) AS views_30d,
      (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = p.id AND o.status != 'cancelled') AS sold
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${whereSql} ORDER BY p.created_at DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, since: analytics.sinceDays(30), limit: pager.perPage, offset: pager.offset });
  res.render('admin/products/index', { title: 'Products', products, pager, categories: categoryOptions() });
});

function emptyProduct() {
  return { status: 'active', stock: 0, low_stock_threshold: 5, images: [], variants: [], category_id: null };
}

router.get('/new', (req, res) => {
  const p = emptyProduct();
  if (req.query.category) p.category_id = toInt(req.query.category);
  res.render('admin/products/form', { title: 'Add product', product: p, categories: categoryOptions(), errors: [] });
});

function readProduct(body) {
  return {
    name: String(body.name || '').trim().slice(0, 200),
    category_id: toInt(body.category_id) || null,
    sku: String(body.sku || '').trim().slice(0, 64) || null,
    brand: String(body.brand || '').trim().slice(0, 100) || null,
    short_description: String(body.short_description || '').trim().slice(0, 500) || null,
    description: String(body.description || '').trim() || null,
    ingredients: String(body.ingredients || '').trim() || null,
    how_to_use: String(body.how_to_use || '').trim() || null,
    size: String(body.size || '').trim().slice(0, 60) || null,
    skin_type: String(body.skin_type || '').trim().slice(0, 120) || null,
    tags: String(body.tags || '').split(',').map((t) => t.trim()).filter(Boolean).join(', ') || null,
    badge: String(body.badge || '').trim().slice(0, 30) || null,
    price: toPaise(body.price),
    compare_at_price: toPaise(body.compare_at_price),
    stock: Math.max(0, toInt(body.stock, 0)),
    low_stock_threshold: Math.max(0, toInt(body.low_stock_threshold, 5)),
    variant_label: String(body.variant_label || '').trim().slice(0, 40) || null,
    is_featured: checkbox(body.is_featured),
    status: body.status === 'draft' ? 'draft' : 'active',
    meta_title: String(body.meta_title || '').trim().slice(0, 120) || null,
    meta_description: String(body.meta_description || '').trim().slice(0, 300) || null,
    slugInput: String(body.slug || '').trim(),
  };
}

function readVariants(body) {
  const ids = arr(body.variant_id);
  const names = arr(body.variant_name);
  const out = [];
  names.forEach((name, i) => {
    const n = String(name || '').trim().slice(0, 80);
    if (!n) return;
    out.push({
      id: toInt(ids[i]) || null,
      name: n,
      sku: String(arr(body.variant_sku)[i] || '').trim().slice(0, 64) || null,
      price: toPaise(arr(body.variant_price)[i]),
      stock: Math.max(0, toInt(arr(body.variant_stock)[i], 0)),
      color: /^#[0-9a-f]{6}$/i.test(arr(body.variant_color)[i] || '') ? arr(body.variant_color)[i] : null,
      sort_order: i,
    });
  });
  return out;
}

function validate(p) {
  const errors = [];
  if (!p.name) errors.push('Product name is required.');
  if (p.price === null) errors.push('Price is required.');
  if (p.compare_at_price !== null && p.price !== null && p.compare_at_price <= p.price) {
    errors.push('"Compare at" (MRP) price should be higher than the selling price — or leave it blank.');
  }
  return errors;
}

/** Saves images: removes ticked ones, applies new order/alt text, appends uploads. */
function saveImages(productId, req, productName) {
  const removeIds = arr(req.body.remove_image).map((v) => toInt(v));
  for (const id of removeIds) {
    const img = db.prepare('SELECT * FROM product_images WHERE id = ? AND product_id = ?').get(id, productId);
    if (img) {
      db.prepare('DELETE FROM product_images WHERE id = ?').run(id);
      removeUpload(img.path);
    }
  }
  const imageIds = arr(req.body.image_id);
  imageIds.forEach((id, i) => {
    db.prepare('UPDATE product_images SET sort_order = ?, alt = ? WHERE id = ? AND product_id = ?')
      .run(toInt(arr(req.body.image_order)[i], i), String(arr(req.body.image_alt)[i] || '').slice(0, 150) || null, toInt(id), productId);
  });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM product_images WHERE product_id = ?').get(productId).m;
  filesFor(req, 'images').forEach((f, i) => {
    db.prepare('INSERT INTO product_images (product_id, path, alt, sort_order) VALUES (?, ?, ?, ?)').run(productId, publicPath(f), productName, maxOrder + 1 + i);
  });
}

function saveVariants(productId, variants) {
  const keepIds = variants.filter((v) => v.id).map((v) => v.id);
  const existing = db.prepare('SELECT id FROM product_variants WHERE product_id = ?').all(productId).map((r) => r.id);
  for (const id of existing) if (!keepIds.includes(id)) db.prepare('DELETE FROM product_variants WHERE id = ?').run(id);
  for (const v of variants) {
    if (v.id && existing.includes(v.id)) {
      db.prepare('UPDATE product_variants SET name = ?, sku = ?, price = ?, stock = ?, color = ?, sort_order = ? WHERE id = ?')
        .run(v.name, v.sku, v.price, v.stock, v.color, v.sort_order, v.id);
    } else {
      db.prepare('INSERT INTO product_variants (product_id, name, sku, price, stock, color, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(productId, v.name, v.sku, v.price, v.stock, v.color, v.sort_order);
    }
  }
}

const COLUMNS = ['category_id', 'name', 'slug', 'sku', 'brand', 'short_description', 'description', 'ingredients', 'how_to_use', 'size',
  'skin_type', 'tags', 'badge', 'price', 'compare_at_price', 'stock', 'low_stock_threshold', 'variant_label', 'is_featured', 'status',
  'meta_title', 'meta_description'];

function formWithInput(req, existing) {
  const p = { ...existing, ...readProduct(req.body), slug: req.body.slug };
  p.variants = readVariants(req.body);
  return p;
}

router.post('/', (req, res) => {
  const p = readProduct(req.body);
  const variants = readVariants(req.body);
  const errors = validate(p);
  if (errors.length) {
    // Uploaded files are discarded on validation errors, so ask to re-attach them.
    for (const f of req.files || []) removeUpload(publicPath(f));
    if ((req.files || []).length) errors.push('Please re-attach your images.');
    return res.status(400).render('admin/products/form', { title: 'Add product', product: { ...emptyProduct(), ...formWithInput(req, {}) }, categories: categoryOptions(), errors });
  }
  p.slug = uniqueSlug(db, 'products', p.slugInput || p.name);
  const id = db.transaction(() => {
    const info = db.prepare(`INSERT INTO products (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map((c) => '@' + c).join(', ')})`).run(p);
    saveImages(info.lastInsertRowid, req, p.name);
    saveVariants(info.lastInsertRowid, variants);
    return info.lastInsertRowid;
  })();
  req.flash('success', `“${p.name}” has been added.`);
  res.redirect(req.body.after === 'new' ? '/admin/products/new' : `/admin/products/${id}/edit`);
});

function loadProduct(id) {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!p) return null;
  p.images = db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order, id').all(id);
  p.variants = db.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort_order, id').all(id);
  return p;
}

router.get('/:id/edit', (req, res, next) => {
  const product = loadProduct(toInt(req.params.id));
  if (!product) return next();
  const stats = db.prepare(`SELECT COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors FROM page_views
      WHERE page_type = 'product' AND ref_id = ? AND created_at >= ?`).get(product.id, analytics.sinceDays(30));
  res.render('admin/products/form', { title: `Edit ${product.name}`, product, categories: categoryOptions(), errors: [], stats });
});

router.post('/:id', (req, res, next) => {
  const existing = loadProduct(toInt(req.params.id));
  if (!existing) return next();
  const p = readProduct(req.body);
  const variants = readVariants(req.body);
  const errors = validate(p);
  if (errors.length) {
    for (const f of req.files || []) removeUpload(publicPath(f));
    if ((req.files || []).length) errors.push('Please re-attach your new images.');
    return res.status(400).render('admin/products/form', { title: `Edit ${existing.name}`, product: { ...formWithInput(req, existing), id: existing.id, images: existing.images }, categories: categoryOptions(), errors });
  }
  p.slug = p.slugInput && p.slugInput !== existing.slug ? uniqueSlug(db, 'products', p.slugInput, existing.id) : existing.slug;
  db.transaction(() => {
    db.prepare(`UPDATE products SET ${COLUMNS.map((c) => `${c} = @${c}`).join(', ')}, updated_at = datetime('now') WHERE id = @id`).run({ ...p, id: existing.id });
    saveImages(existing.id, req, p.name);
    saveVariants(existing.id, variants);
  })();
  req.flash('success', 'Product saved.');
  res.redirect(`/admin/products/${existing.id}/edit`);
});

router.post('/:id/duplicate', (req, res, next) => {
  const src = loadProduct(toInt(req.params.id));
  if (!src) return next();
  const copy = { ...src, name: `${src.name} (copy)`, slug: uniqueSlug(db, 'products', `${src.slug}-copy`), status: 'draft', sku: null };
  const id = db.transaction(() => {
    const info = db.prepare(`INSERT INTO products (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map((c) => '@' + c).join(', ')})`).run(
      Object.fromEntries(COLUMNS.map((c) => [c, copy[c] ?? null])),
    );
    for (const v of src.variants) {
      db.prepare('INSERT INTO product_variants (product_id, name, sku, price, stock, color, sort_order) VALUES (?, ?, NULL, ?, ?, ?, ?)')
        .run(info.lastInsertRowid, v.name, v.price, v.stock, v.color, v.sort_order);
    }
    return info.lastInsertRowid;
  })();
  req.flash('success', 'Product duplicated as a draft. Add images and publish when ready.');
  res.redirect(`/admin/products/${id}/edit`);
});

router.post('/:id/delete', (req, res) => {
  const id = toInt(req.params.id);
  const images = db.prepare('SELECT path FROM product_images WHERE product_id = ?').all(id);
  const info = db.prepare('DELETE FROM products WHERE id = ?').run(id);
  if (info.changes) images.forEach((i) => removeUpload(i.path));
  req.flash('success', 'Product deleted.');
  res.redirect('/admin/products');
});

router.post('/:id/stock', (req, res) => {
  // Quick stock update from the product list.
  db.prepare("UPDATE products SET stock = ?, updated_at = datetime('now') WHERE id = ?").run(Math.max(0, toInt(req.body.stock, 0)), toInt(req.params.id));
  req.flash('success', 'Stock updated.');
  res.redirect('/admin/products' + (/^\?[\w=&%+.-]*$/.test(req.body.qs || '') ? req.body.qs : ''));
});

module.exports = router;
