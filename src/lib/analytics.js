const crypto = require('crypto');
const db = require('../db');

const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|monitor|curl|wget|python-requests|axios|node-fetch|go-http/i;
const COOKIE = 'kb_vid';

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function deviceOf(ua) {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return 'Tablet';
  if (/mobi|iphone|android/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

function browserOf(ua) {
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/samsungbrowser/i.test(ua)) return 'Samsung Internet';
  if (/chrome|crios/i.test(ua)) return 'Chrome';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Other';
}

function referrerHost(req) {
  const ref = req.get('referer');
  if (!ref) return null;
  try {
    const host = new URL(ref).hostname.replace(/^www\./, '');
    if (host === req.hostname.replace(/^www\./, '')) return null; // internal navigation
    return host;
  } catch {
    return null;
  }
}

const insertView = db.prepare(`INSERT INTO page_views
  (visitor_id, path, page_type, ref_id, title, referrer, device, browser, is_new)
  VALUES (@visitor_id, @path, @page_type, @ref_id, @title, @referrer, @device, @browser, @is_new)`);

/**
 * Records a page view for every storefront page that renders successfully.
 * Routes describe the page via res.locals.track = { type, id, title }.
 * Admin staff, bots and non-HTML responses are ignored.
 */
function trackPageViews(req, res, next) {
  if (req.method !== 'GET') return next();
  const ua = req.get('user-agent') || '';
  if (!ua || BOT_RE.test(ua)) return next();

  const cookies = parseCookies(req.headers.cookie);
  let visitorId = cookies[COOKIE];
  let isNew = 0;
  if (!visitorId || !/^[a-f0-9]{32}$/.test(visitorId)) {
    visitorId = crypto.randomBytes(16).toString('hex');
    isNew = 1;
  }
  // Capture now: mounted routers rewrite req.path before the response finishes.
  const pagePath = req.originalUrl.split('?')[0].slice(0, 300);
  res.cookie(COOKIE, visitorId, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax', secure: req.secure });

  res.on('finish', () => {
    if (res.statusCode !== 200) return;
    if (!String(res.get('content-type') || '').includes('text/html')) return;
    if (req.session?.adminId) return; // don't count the shop owner browsing their own store
    const t = res.locals.track || {};
    try {
      insertView.run({
        visitor_id: visitorId,
        path: pagePath,
        page_type: t.type || 'page',
        ref_id: t.id || null,
        title: (t.title || res.locals.title || '').slice(0, 200),
        referrer: referrerHost(req),
        device: deviceOf(ua),
        browser: browserOf(ua),
        is_new: isNew,
      });
    } catch (err) {
      console.error('[analytics] failed to record view', err.message);
    }
  });
  next();
}

/** SQL datetime string for N days ago at 00:00 IST, expressed in UTC (DB timestamps are UTC). */
function sinceDays(days) {
  const now = new Date(Date.now() + 5.5 * 3600 * 1000); // shift to IST
  now.setUTCHours(0, 0, 0, 0);
  now.setUTCDate(now.getUTCDate() - (days - 1));
  const utc = new Date(now.getTime() - 5.5 * 3600 * 1000);
  return utc.toISOString().slice(0, 19).replace('T', ' ');
}

// Group by IST calendar day.
const DAY = "date(created_at, '+330 minutes')";

function summary(days) {
  const since = sinceDays(days);
  const totals = db.prepare(`SELECT COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors,
      COUNT(DISTINCT CASE WHEN is_new = 1 THEN visitor_id END) AS new_visitors
      FROM page_views WHERE created_at >= ?`).get(since);

  const dailyRows = db.prepare(`SELECT ${DAY} AS day, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
      FROM page_views WHERE created_at >= ? GROUP BY day ORDER BY day`).all(since);
  const byDay = new Map(dailyRows.map((r) => [r.day, r]));
  const daily = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() + 5.5 * 3600 * 1000 - i * 86400000).toISOString().slice(0, 10);
    const r = byDay.get(d);
    daily.push({ day: d, views: r ? r.views : 0, visitors: r ? r.visitors : 0 });
  }

  const pages = db.prepare(`SELECT path, MAX(title) AS title, page_type, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors,
      MAX(created_at) AS last_seen
      FROM page_views WHERE created_at >= ? GROUP BY path ORDER BY views DESC LIMIT 200`).all(since);

  const products = db.prepare(`SELECT p.id, p.name, p.slug, COUNT(*) AS views, COUNT(DISTINCT v.visitor_id) AS visitors
      FROM page_views v JOIN products p ON p.id = v.ref_id
      WHERE v.page_type = 'product' AND v.created_at >= ? GROUP BY p.id ORDER BY views DESC LIMIT 20`).all(since);

  const categories = db.prepare(`SELECT c.id, c.name, c.slug, COUNT(*) AS views, COUNT(DISTINCT v.visitor_id) AS visitors
      FROM page_views v JOIN categories c ON c.id = v.ref_id
      WHERE v.page_type = 'category' AND v.created_at >= ? GROUP BY c.id ORDER BY views DESC LIMIT 20`).all(since);

  const referrers = db.prepare(`SELECT COALESCE(referrer, 'Direct / none') AS source, COUNT(DISTINCT visitor_id) AS visitors, COUNT(*) AS views
      FROM page_views WHERE created_at >= ? GROUP BY source ORDER BY visitors DESC LIMIT 15`).all(since);

  const devices = db.prepare(`SELECT device, COUNT(DISTINCT visitor_id) AS visitors FROM page_views
      WHERE created_at >= ? GROUP BY device ORDER BY visitors DESC`).all(since);

  const browsers = db.prepare(`SELECT browser, COUNT(DISTINCT visitor_id) AS visitors FROM page_views
      WHERE created_at >= ? GROUP BY browser ORDER BY visitors DESC`).all(since);

  return { totals, daily, pages, products, categories, referrers, devices, browsers };
}

function liveVisitors(minutes = 5) {
  const since = new Date(Date.now() - minutes * 60000).toISOString().slice(0, 19).replace('T', ' ');
  return db.prepare('SELECT COUNT(DISTINCT visitor_id) AS n FROM page_views WHERE created_at >= ?').get(since).n;
}

function visitorsToday() {
  return db.prepare('SELECT COUNT(DISTINCT visitor_id) AS n, COUNT(*) AS views FROM page_views WHERE created_at >= ?').get(sinceDays(1));
}

module.exports = { trackPageViews, summary, liveVisitors, visitorsToday, sinceDays, parseCookies };
