const express = require('express');
const db = require('../../db');
const analytics = require('../../lib/analytics');
const { publicPath, filesFor, removeUpload } = require('../../lib/upload');
const { toInt, checkbox, uniqueSlug } = require('../../lib/helpers');

const router = express.Router();
router.use((req, res, next) => { res.locals.section = 'categories'; next(); });

function listWithDepth() {
  const all = db.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count,
      (SELECT COUNT(*) FROM page_views v WHERE v.page_type = 'category' AND v.ref_id = c.id AND v.created_at >= ?) AS views_30d
    FROM categories c ORDER BY c.sort_order, c.name`).all(analytics.sinceDays(30));
  const out = [];
  const seen = new Set();
  const walk = (parentId, depth) => {
    for (const c of all.filter((x) => (x.parent_id || null) === parentId)) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({ ...c, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  for (const c of all) if (!seen.has(c.id)) out.push({ ...c, depth: 0 });
  return out;
}

router.get('/', (req, res) => {
  res.render('admin/categories/index', { title: 'Categories', categories: listWithDepth() });
});

router.get('/new', (req, res) => {
  res.render('admin/categories/form', { title: 'New category', category: { is_active: 1, show_on_home: 1, sort_order: 0 }, parents: listWithDepth(), errors: [] });
});

function readCategory(body) {
  return {
    name: String(body.name || '').trim().slice(0, 100),
    description: String(body.description || '').trim().slice(0, 1000) || null,
    parent_id: toInt(body.parent_id) || null,
    sort_order: toInt(body.sort_order, 0),
    is_active: checkbox(body.is_active),
    show_on_home: checkbox(body.show_on_home),
    slugInput: String(body.slug || '').trim(),
  };
}

/** True if making `parentId` the parent of `id` would create a loop. */
function wouldLoop(id, parentId) {
  let cur = parentId;
  for (let i = 0; cur && i < 50; i++) {
    if (cur === id) return true;
    cur = db.prepare('SELECT parent_id FROM categories WHERE id = ?').get(cur)?.parent_id;
  }
  return false;
}

router.post('/', (req, res) => {
  const c = readCategory(req.body);
  if (!c.name) {
    return res.status(400).render('admin/categories/form', { title: 'New category', category: c, parents: listWithDepth(), errors: ['Category name is required.'] });
  }
  const image = filesFor(req, 'image')[0];
  const info = db.prepare(`INSERT INTO categories (name, slug, description, image, parent_id, sort_order, is_active, show_on_home)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(c.name, uniqueSlug(db, 'categories', c.slugInput || c.name), c.description,
    image ? publicPath(image) : null, c.parent_id, c.sort_order, c.is_active, c.show_on_home);
  req.flash('success', `Category “${c.name}” created. Now add some products to it.`);
  res.redirect(req.body.after === 'product' ? `/admin/products/new?category=${info.lastInsertRowid}` : '/admin/categories');
});

router.get('/:id/edit', (req, res, next) => {
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(toInt(req.params.id));
  if (!category) return next();
  res.render('admin/categories/form', { title: `Edit ${category.name}`, category, parents: listWithDepth().filter((p) => p.id !== category.id), errors: [] });
});

router.post('/:id', (req, res, next) => {
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(toInt(req.params.id));
  if (!existing) return next();
  const c = readCategory(req.body);
  const errors = [];
  if (!c.name) errors.push('Category name is required.');
  if (c.parent_id && wouldLoop(existing.id, c.parent_id)) errors.push('A category cannot be placed inside itself or one of its sub-categories.');
  if (errors.length) {
    return res.status(400).render('admin/categories/form', { title: `Edit ${existing.name}`, category: { ...existing, ...c, slug: c.slugInput }, parents: listWithDepth().filter((p) => p.id !== existing.id), errors });
  }
  let image = existing.image;
  const upload = filesFor(req, 'image')[0];
  if (upload || checkbox(req.body.remove_image)) {
    removeUpload(existing.image);
    image = upload ? publicPath(upload) : null;
  }
  const slug = c.slugInput && c.slugInput !== existing.slug ? uniqueSlug(db, 'categories', c.slugInput, existing.id) : existing.slug;
  db.prepare(`UPDATE categories SET name = ?, slug = ?, description = ?, image = ?, parent_id = ?, sort_order = ?, is_active = ?, show_on_home = ? WHERE id = ?`)
    .run(c.name, slug, c.description, image, c.parent_id, c.sort_order, c.is_active, c.show_on_home, existing.id);
  req.flash('success', 'Category saved.');
  res.redirect('/admin/categories');
});

router.post('/:id/delete', (req, res) => {
  const c = db.prepare('SELECT * FROM categories WHERE id = ?').get(toInt(req.params.id));
  if (c) {
    db.transaction(() => {
      // Sub-categories move up a level; products become uncategorised (they are not deleted).
      db.prepare('UPDATE categories SET parent_id = ? WHERE parent_id = ?').run(c.parent_id, c.id);
      db.prepare('UPDATE products SET category_id = NULL WHERE category_id = ?').run(c.id);
      db.prepare('DELETE FROM categories WHERE id = ?').run(c.id);
    })();
    removeUpload(c.image);
    req.flash('success', `Category “${c.name}” deleted. Its products were kept and are now uncategorised.`);
  }
  res.redirect('/admin/categories');
});

module.exports = router;
