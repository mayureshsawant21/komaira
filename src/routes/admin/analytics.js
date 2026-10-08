const express = require('express');
const analytics = require('../../lib/analytics');
const db = require('../../db');

const router = express.Router();
router.use((req, res, next) => { res.locals.section = 'analytics'; next(); });

const RANGES = { 1: 'Today', 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days', 365: 'Last 12 months' };

router.get('/', (req, res) => {
  const days = RANGES[req.query.days] ? Number(req.query.days) : 30;
  const data = analytics.summary(days);
  const recent = db.prepare('SELECT * FROM page_views ORDER BY id DESC LIMIT 25').all();
  res.render('admin/analytics', {
    title: 'Visitors & analytics',
    days,
    ranges: RANGES,
    data,
    recent,
    live: analytics.liveVisitors(),
  });
});

module.exports = router;
