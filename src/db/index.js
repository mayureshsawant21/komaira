const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const config = require('../config');

if (config.databasePath !== ':memory:') {
  fs.mkdirSync(path.dirname(path.resolve(config.databasePath)), { recursive: true });
}

const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const DEFAULT_SETTINGS = {
  store_name: 'Komaira Boutique',
  tagline: 'Beauty, thoughtfully curated.',
  currency_symbol: '₹',
  currency_code: 'INR',
  contact_email: 'hello@komaira.com',
  contact_phone: '',
  whatsapp: '',
  address: '',
  instagram: '',
  facebook: '',
  youtube: '',
  shipping_fee: '7900', // ₹79
  free_shipping_threshold: '99900', // ₹999
  cod_enabled: '1',
  cod_fee: '0',
  announcement_active: '1',
  announcement_text: 'Free shipping on orders above ₹999\nUse code WELCOME10 for 10% off your first order',
  announcement_link: '/shop',
  banner_autoplay_seconds: '6',
  home_featured_title: 'Bestsellers',
  home_new_title: 'New arrivals',
  promise_1: 'Free shipping over ₹999',
  promise_2: '100% authentic products',
  promise_3: 'Easy 7-day returns',
  promise_4: 'Secure checkout',
  meta_description: 'Komaira Boutique — curated skincare, makeup and beauty essentials delivered to your door.',
  order_prefix: 'KB',
  order_notify_email: '',
};

const DEFAULT_PAGES = [
  ['about', 'About us', 'Komaira Boutique is a curated beauty destination. We hand-pick skincare, makeup and self-care essentials that are gentle, effective and a joy to use.\n\n## Our promise\nEvery product we sell is 100% authentic and sourced directly from brands or their authorised distributors.'],
  ['shipping-policy', 'Shipping policy', 'We ship across India. Orders are dispatched within 1–2 business days and usually arrive within 3–7 business days.\n\nShipping is free on orders above the free-shipping threshold shown at checkout.'],
  ['returns', 'Returns & refunds', 'Unopened products can be returned within 7 days of delivery. For hygiene reasons, opened or used cosmetics cannot be returned unless they arrived damaged.\n\nTo start a return, contact us with your order number.'],
  ['privacy-policy', 'Privacy policy', 'We only collect the information needed to process your orders and improve our store. We never sell your personal data.'],
  ['terms', 'Terms & conditions', 'By using this website you agree to our terms of sale. Prices and availability are subject to change without notice.'],
];

function seedDefaults() {
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  const insertPage = db.prepare('INSERT OR IGNORE INTO pages (slug, title, content) VALUES (?, ?, ?)');
  db.transaction(() => {
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, v);
    for (const p of DEFAULT_PAGES) insertPage.run(...p);
  })();

  const adminCount = db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
  if (adminCount === 0 && config.admin.email && config.admin.password) {
    db.prepare('INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)').run(
      'Store Admin',
      config.admin.email,
      bcrypt.hashSync(config.admin.password, 10),
    );
    console.log(`[setup] Admin account created for ${config.admin.email}`);
  }
}

seedDefaults();

module.exports = db;
