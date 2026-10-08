const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const compression = require('compression');

const config = require('./config');
const db = require('./db');
const SqliteStore = require('./lib/session-store');
const settings = require('./lib/settings');
const helpers = require('./lib/helpers');
const catalog = require('./lib/catalog');
const cart = require('./lib/cart');
const { loadUsers } = require('./middleware/auth');
const { csrf } = require('./middleware/csrf');
const flash = require('./middleware/flash');
const { trackPageViews } = require('./lib/analytics');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(config.root, 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'", 'https://checkout.razorpay.com'],
      'style-src': ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src': ["'self'", 'data:', 'https:'],
      'frame-src': ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
      'connect-src': ["'self'", 'https://api.razorpay.com', 'https://lumberjack.razorpay.com'],
      'form-action': ["'self'"],
      'upgrade-insecure-requests': config.isProd ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());

app.use('/public', express.static(path.join(config.root, 'public'), { maxAge: config.isProd ? '7d' : 0 }));
app.use('/vendor/chart.js', express.static(path.join(config.root, 'node_modules', 'chart.js', 'dist'), { maxAge: '30d' }));
app.use('/uploads', express.static(config.uploadDir, { maxAge: '30d', fallthrough: false }));

app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '200kb' }));

app.use(session({
  store: new SqliteStore(db),
  secret: config.sessionSecret,
  name: 'kb_sid',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd ? 'auto' : false,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
}));

app.use(loadUsers);
app.use(flash);

// Values every view can use.
app.use((req, res, next) => {
  const s = settings.all();
  res.locals.settings = s;
  res.locals.h = helpers;
  res.locals.money = (v) => helpers.formatMoney(v, s.currency_symbol || '₹');
  res.locals.currentPath = req.path;
  res.locals.query = req.query;
  res.locals.baseUrl = config.baseUrl;
  res.locals.title = '';
  res.locals.metaDescription = s.meta_description;
  res.locals.navCategories = [];
  res.locals.footerPages = [];
  res.locals.cartCount = 0;
  next();
});
app.use(csrf);

app.use('/admin', require('./routes/admin'));

// Storefront: shared navigation data + visitor tracking.
app.use((req, res, next) => {
  res.locals.navCategories = catalog.categoryTree();
  res.locals.footerPages = db.prepare('SELECT slug, title FROM pages WHERE is_active = 1 AND show_in_footer = 1 ORDER BY id').all();
  res.locals.cartCount = cart.count(req);
  next();
});
app.use(trackPageViews);

app.use('/', require('./routes/shop'));
app.use('/', require('./routes/cart'));
app.use('/', require('./routes/checkout'));
app.use('/account', require('./routes/account'));

app.use((req, res) => {
  res.status(404).render('shop/error', { title: 'Page not found', message: "We couldn't find the page you were looking for." });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).render('shop/error', { title: 'File too large', message: 'Images must be smaller than 8 MB.' });
  }
  res.status(500).render('shop/error', { title: 'Something went wrong', message: 'Please try again in a moment.' });
});

module.exports = app;
