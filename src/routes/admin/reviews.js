const express = require('express');
const db = require('../../db');
const { toInt } = require('../../lib/helpers');

const router = express.Router();
router.use((req, res, next) => { res.locals.section = 'reviews'; next(); });

router.get('/', (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  const reviews = db.prepare(`SELECT r.*, p.name AS product_name, p.slug AS product_slug FROM reviews r
      JOIN products p ON p.id = r.product_id WHERE r.status = ? ORDER BY r.created_at DESC LIMIT 200`).all(status);
  const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS n FROM reviews GROUP BY status').all().map((r) => [r.status, r.n]));
  res.render('admin/reviews', { title: 'Reviews', reviews, status, counts });
});

router.post('/:id/:action', (req, res) => {
  const id = toInt(req.params.id);
  const action = req.params.action;
  if (action === 'approve') db.prepare("UPDATE reviews SET status = 'approved' WHERE id = ?").run(id);
  else if (action === 'reject') db.prepare("UPDATE reviews SET status = 'rejected' WHERE id = ?").run(id);
  else if (action === 'delete') db.prepare('DELETE FROM reviews WHERE id = ?').run(id);
  res.redirect('/admin/reviews' + (['pending', 'approved', 'rejected'].includes(req.body.from) ? `?status=${req.body.from}` : ''));
});

module.exports = router;
