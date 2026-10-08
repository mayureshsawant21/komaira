const express = require('express');
const db = require('../../db');
const settings = require('../../lib/settings');
const { publicPath, filesFor, removeUpload } = require('../../lib/upload');
const { toInt, checkbox, safeLink } = require('../../lib/helpers');

const router = express.Router();
router.use((req, res, next) => { res.locals.section = 'banners'; next(); });

/** "2026-10-08T09:30" (datetime-local) -> "2026-10-08 09:30:00" (IST, comparable in SQL). */
function normalizeDateTime(v) {
  const s = String(v || '').trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (m) return `${m[1]} ${m[2]}:00`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`;
  return null;
}

router.get('/', (req, res) => {
  const banners = db.prepare('SELECT * FROM banners ORDER BY sort_order, id').all();
  const now = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  for (const b of banners) {
    b.state = !b.is_active ? 'Hidden' : b.starts_at && b.starts_at > now ? 'Scheduled' : b.ends_at && b.ends_at < now ? 'Ended' : 'Live';
  }
  res.render('admin/banners/index', { title: 'Banners & announcements', banners });
});

router.post('/announcement', (req, res) => {
  settings.setMany({
    announcement_active: checkbox(req.body.announcement_active),
    announcement_text: String(req.body.announcement_text || '').slice(0, 1000),
    announcement_link: safeLink(req.body.announcement_link),
    banner_autoplay_seconds: Math.min(30, Math.max(0, toInt(req.body.banner_autoplay_seconds, 6))),
  });
  req.flash('success', 'Announcement bar updated.');
  res.redirect('/admin/banners');
});

router.get('/new', (req, res) => {
  const next = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM banners').get().n;
  res.render('admin/banners/form', { title: 'New banner slide', banner: { is_active: 1, text_theme: 'dark', align: 'left', bg_color: '#f3e6e1', sort_order: next }, errors: [] });
});

function readBanner(body) {
  return {
    eyebrow: String(body.eyebrow || '').trim().slice(0, 80) || null,
    title: String(body.title || '').trim().slice(0, 140),
    subtitle: String(body.subtitle || '').trim().slice(0, 300) || null,
    cta_text: String(body.cta_text || '').trim().slice(0, 40) || null,
    cta_link: safeLink(body.cta_link) || null,
    bg_color: /^#[0-9a-f]{6}$/i.test(body.bg_color || '') ? body.bg_color : '#f3e6e1',
    text_theme: body.text_theme === 'light' ? 'light' : 'dark',
    align: ['left', 'center', 'right'].includes(body.align) ? body.align : 'left',
    sort_order: toInt(body.sort_order, 0),
    is_active: checkbox(body.is_active),
    starts_at: normalizeDateTime(body.starts_at),
    ends_at: normalizeDateTime(body.ends_at),
  };
}

function applyImages(req, banner, existing = {}) {
  for (const field of ['image', 'mobile_image']) {
    const f = filesFor(req, field)[0];
    banner[field] = existing[field] || null;
    if (f || checkbox(req.body[`remove_${field}`])) {
      removeUpload(existing[field]);
      banner[field] = f ? publicPath(f) : null;
    }
  }
}

router.post('/', (req, res) => {
  const b = readBanner(req.body);
  if (!b.title) return res.status(400).render('admin/banners/form', { title: 'New banner slide', banner: b, errors: ['A headline is required.'] });
  applyImages(req, b);
  db.prepare(`INSERT INTO banners (eyebrow, title, subtitle, cta_text, cta_link, image, mobile_image, bg_color, text_theme, align, sort_order, is_active, starts_at, ends_at)
      VALUES (@eyebrow, @title, @subtitle, @cta_text, @cta_link, @image, @mobile_image, @bg_color, @text_theme, @align, @sort_order, @is_active, @starts_at, @ends_at)`).run(b);
  req.flash('success', 'Banner slide added to the homepage.');
  res.redirect('/admin/banners');
});

router.get('/:id/edit', (req, res, next) => {
  const banner = db.prepare('SELECT * FROM banners WHERE id = ?').get(toInt(req.params.id));
  if (!banner) return next();
  res.render('admin/banners/form', { title: 'Edit banner slide', banner, errors: [] });
});

router.post('/:id', (req, res, next) => {
  const existing = db.prepare('SELECT * FROM banners WHERE id = ?').get(toInt(req.params.id));
  if (!existing) return next();
  const b = readBanner(req.body);
  if (!b.title) return res.status(400).render('admin/banners/form', { title: 'Edit banner slide', banner: { ...existing, ...b }, errors: ['A headline is required.'] });
  applyImages(req, b, existing);
  db.prepare(`UPDATE banners SET eyebrow = @eyebrow, title = @title, subtitle = @subtitle, cta_text = @cta_text, cta_link = @cta_link, image = @image,
      mobile_image = @mobile_image, bg_color = @bg_color, text_theme = @text_theme, align = @align, sort_order = @sort_order, is_active = @is_active,
      starts_at = @starts_at, ends_at = @ends_at WHERE id = @id`).run({ ...b, id: existing.id });
  req.flash('success', 'Banner saved.');
  res.redirect('/admin/banners');
});

router.post('/:id/toggle', (req, res) => {
  db.prepare('UPDATE banners SET is_active = 1 - is_active WHERE id = ?').run(toInt(req.params.id));
  res.redirect('/admin/banners');
});

router.post('/:id/move', (req, res) => {
  const banners = db.prepare('SELECT id FROM banners ORDER BY sort_order, id').all().map((b) => b.id);
  const id = toInt(req.params.id);
  const i = banners.indexOf(id);
  const j = req.body.dir === 'up' ? i - 1 : i + 1;
  if (i >= 0 && j >= 0 && j < banners.length) {
    [banners[i], banners[j]] = [banners[j], banners[i]];
    const stmt = db.prepare('UPDATE banners SET sort_order = ? WHERE id = ?');
    db.transaction(() => banners.forEach((bid, idx) => stmt.run(idx + 1, bid)))();
  }
  res.redirect('/admin/banners');
});

router.post('/:id/delete', (req, res) => {
  const b = db.prepare('SELECT * FROM banners WHERE id = ?').get(toInt(req.params.id));
  if (b) {
    db.prepare('DELETE FROM banners WHERE id = ?').run(b.id);
    removeUpload(b.image);
    removeUpload(b.mobile_image);
  }
  req.flash('success', 'Banner deleted.');
  res.redirect('/admin/banners');
});

module.exports = router;
