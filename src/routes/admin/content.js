const express = require('express');
const db = require('../../db');
const { toInt, checkbox, uniqueSlug, formatDate } = require('../../lib/helpers');

const router = express.Router();

// ---- Pages (About, Shipping policy, …) ----
router.get('/pages', (req, res) => {
  res.render('admin/pages/index', { title: 'Pages', section: 'pages', pages: db.prepare('SELECT * FROM pages ORDER BY id').all() });
});

router.get('/pages/new', (req, res) => {
  res.render('admin/pages/form', { title: 'New page', section: 'pages', page: { is_active: 1, show_in_footer: 1 }, errors: [] });
});

function readPage(body) {
  return {
    title: String(body.title || '').trim().slice(0, 120),
    content: String(body.content || '').slice(0, 50000),
    is_active: checkbox(body.is_active),
    show_in_footer: checkbox(body.show_in_footer),
  };
}

router.post('/pages', (req, res) => {
  const p = readPage(req.body);
  if (!p.title) return res.status(400).render('admin/pages/form', { title: 'New page', section: 'pages', page: p, errors: ['Title is required.'] });
  db.prepare('INSERT INTO pages (slug, title, content, is_active, show_in_footer) VALUES (?, ?, ?, ?, ?)')
    .run(uniqueSlug(db, 'pages', req.body.slug || p.title), p.title, p.content, p.is_active, p.show_in_footer);
  req.flash('success', 'Page created.');
  res.redirect('/admin/pages');
});

router.get('/pages/:id/edit', (req, res, next) => {
  const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(toInt(req.params.id));
  if (!page) return next();
  res.render('admin/pages/form', { title: `Edit ${page.title}`, section: 'pages', page, errors: [] });
});

router.post('/pages/:id', (req, res, next) => {
  const existing = db.prepare('SELECT * FROM pages WHERE id = ?').get(toInt(req.params.id));
  if (!existing) return next();
  const p = readPage(req.body);
  if (!p.title) return res.status(400).render('admin/pages/form', { title: 'Edit page', section: 'pages', page: { ...existing, ...p }, errors: ['Title is required.'] });
  db.prepare("UPDATE pages SET title = ?, content = ?, is_active = ?, show_in_footer = ?, updated_at = datetime('now') WHERE id = ?")
    .run(p.title, p.content, p.is_active, p.show_in_footer, existing.id);
  req.flash('success', 'Page saved.');
  res.redirect('/admin/pages');
});

router.post('/pages/:id/delete', (req, res) => {
  db.prepare('DELETE FROM pages WHERE id = ?').run(toInt(req.params.id));
  req.flash('success', 'Page deleted.');
  res.redirect('/admin/pages');
});

// ---- Contact messages ----
router.get('/messages', (req, res) => {
  const messages = db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 300').all();
  res.render('admin/messages', { title: 'Messages', section: 'messages', messages });
});

router.post('/messages/:id/read', (req, res) => {
  db.prepare('UPDATE messages SET is_read = 1 - is_read WHERE id = ?').run(toInt(req.params.id));
  res.redirect('/admin/messages');
});

router.post('/messages/:id/delete', (req, res) => {
  db.prepare('DELETE FROM messages WHERE id = ?').run(toInt(req.params.id));
  req.flash('success', 'Message deleted.');
  res.redirect('/admin/messages');
});

// ---- Newsletter subscribers ----
router.get('/subscribers', (req, res) => {
  const subscribers = db.prepare('SELECT * FROM subscribers ORDER BY created_at DESC').all();
  res.render('admin/subscribers', { title: 'Subscribers', section: 'subscribers', subscribers });
});

router.get('/subscribers/export.csv', (req, res) => {
  const rows = db.prepare('SELECT email, created_at FROM subscribers ORDER BY created_at DESC').all();
  res.attachment('subscribers.csv');
  res.type('text/csv').send(['email,subscribed_on', ...rows.map((r) => `"${r.email.replace(/"/g, '""')}","${formatDate(r.created_at)}"`)].join('\r\n'));
});

router.post('/subscribers/:id/delete', (req, res) => {
  db.prepare('DELETE FROM subscribers WHERE id = ?').run(toInt(req.params.id));
  res.redirect('/admin/subscribers');
});

module.exports = router;
