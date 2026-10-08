const db = require('../db');

const PRODUCT_CARD_SELECT = `
  SELECT p.*, c.name AS category_name, c.slug AS category_slug,
    (SELECT path FROM product_images WHERE product_id = p.id ORDER BY sort_order, id LIMIT 1) AS image,
    (SELECT path FROM product_images WHERE product_id = p.id ORDER BY sort_order, id LIMIT 1 OFFSET 1) AS image2,
    (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE product_id = p.id AND status = 'approved') AS rating,
    (SELECT COUNT(*) FROM reviews WHERE product_id = p.id AND status = 'approved') AS review_count,
    (SELECT COUNT(*) FROM product_variants WHERE product_id = p.id) AS variant_count,
    (SELECT MIN(COALESCE(price, p.price)) FROM product_variants WHERE product_id = p.id) AS min_variant_price,
    CASE WHEN EXISTS (SELECT 1 FROM product_variants WHERE product_id = p.id)
      THEN (SELECT COALESCE(SUM(stock), 0) FROM product_variants WHERE product_id = p.id)
      ELSE p.stock END AS available
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id`;

const SORTS = {
  featured: 'p.is_featured DESC, p.created_at DESC',
  newest: 'p.created_at DESC',
  price_asc: 'p.price ASC',
  price_desc: 'p.price DESC',
  name: 'p.name COLLATE NOCASE ASC',
  popular: '(SELECT COUNT(*) FROM order_items oi WHERE oi.product_id = p.id) DESC, p.is_featured DESC',
};

/** Category id plus all of its sub-category ids. */
function categoryTreeIds(categoryId) {
  return db.prepare(`WITH RECURSIVE tree(id) AS (
      SELECT ? UNION ALL SELECT c.id FROM categories c JOIN tree t ON c.parent_id = t.id)
    SELECT id FROM tree`).all(categoryId).map((r) => r.id);
}

/**
 * Lists active products with filters. Returns { items, total }.
 * opts: { categoryId, q, minPrice, maxPrice, sort, featured, inStock, limit, offset, excludeId }
 */
function listProducts(opts = {}) {
  const where = ["p.status = 'active'"];
  const params = {};
  if (opts.categoryId) {
    const ids = categoryTreeIds(opts.categoryId);
    where.push(`p.category_id IN (${ids.map((_, i) => `@cat${i}`).join(',')})`);
    ids.forEach((id, i) => { params[`cat${i}`] = id; });
  }
  if (opts.q) {
    where.push('(p.name LIKE @q OR p.brand LIKE @q OR p.tags LIKE @q OR p.short_description LIKE @q OR c.name LIKE @q)');
    params.q = `%${String(opts.q).replace(/[%_]/g, '')}%`;
  }
  if (Number.isFinite(opts.minPrice)) { where.push('p.price >= @minPrice'); params.minPrice = opts.minPrice; }
  if (Number.isFinite(opts.maxPrice)) { where.push('p.price <= @maxPrice'); params.maxPrice = opts.maxPrice; }
  if (opts.featured) where.push('p.is_featured = 1');
  if (opts.onSale) where.push('p.compare_at_price > p.price');
  if (opts.excludeId) { where.push('p.id != @excludeId'); params.excludeId = opts.excludeId; }

  const whereSql = where.join(' AND ');
  const inner = `${PRODUCT_CARD_SELECT} WHERE ${whereSql}`;
  const stockFilter = opts.inStock ? 'WHERE available > 0' : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM (${inner}) ${stockFilter}`).get(params).n;
  const order = SORTS[opts.sort] || SORTS.featured;
  const items = db.prepare(`SELECT * FROM (${inner} ORDER BY ${order}) ${stockFilter} LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: opts.limit || 24, offset: opts.offset || 0 });
  return { items, total };
}

function getProductBySlug(slug, { includeDraft = false } = {}) {
  const p = db.prepare(`${PRODUCT_CARD_SELECT} WHERE p.slug = ? ${includeDraft ? '' : "AND p.status = 'active'"}`).get(slug);
  if (!p) return null;
  p.images = db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order, id').all(p.id);
  p.variants = db.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort_order, id').all(p.id);
  return p;
}

function activeCategories() {
  return db.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status = 'active') AS product_count
    FROM categories c WHERE c.is_active = 1 ORDER BY c.sort_order, c.name`).all();
}

/** Active categories arranged as a tree: top-level categories with a `children` array. */
function categoryTree() {
  const all = activeCategories();
  const byId = new Map(all.map((c) => [c.id, { ...c, children: [] }]));
  const roots = [];
  for (const c of byId.values()) {
    if (c.parent_id && byId.has(c.parent_id)) byId.get(c.parent_id).children.push(c);
    else roots.push(c);
  }
  return roots;
}

function activeBanners() {
  return db.prepare(`SELECT * FROM banners WHERE is_active = 1
      AND (starts_at IS NULL OR starts_at = '' OR starts_at <= datetime('now', '+330 minutes'))
      AND (ends_at IS NULL OR ends_at = '' OR ends_at >= datetime('now', '+330 minutes'))
    ORDER BY sort_order, id`).all();
}

module.exports = { listProducts, getProductBySlug, activeCategories, categoryTree, activeBanners, categoryTreeIds, PRODUCT_CARD_SELECT };
