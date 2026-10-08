/**
 * Adds demo categories, products, banners, a coupon and reviews so you can see the store in action.
 * Usage: npm run seed            (only seeds when there are no products yet)
 *        npm run seed -- --force (adds the demo data anyway)
 */
const db = require('../src/db');
const { uniqueSlug } = require('../src/lib/helpers');

const force = process.argv.includes('--force');
if (!force && db.prepare('SELECT COUNT(*) AS n FROM products').get().n > 0) {
  console.log('Products already exist — skipping demo data. Use "npm run seed -- --force" to add it anyway.');
  process.exit(0);
}

const rupees = (n) => Math.round(n * 100);

const categories = [
  { name: 'Skincare', description: 'Cleansers, serums and moisturisers for healthy, glowing skin.' },
  { name: 'Makeup', description: 'Complexion, cheeks and everyday essentials.' },
  { name: 'Lips', description: 'Lipsticks, tints and balms in shades you will reach for daily.' },
  { name: 'Eyes', description: 'Kajal, mascara and liners for every look.' },
  { name: 'Fragrance', description: 'Signature scents and body mists.' },
  { name: 'Bath & Body', description: 'Little rituals for everyday self-care.' },
];

const products = [
  { cat: 'Skincare', name: 'Vitamin C Glow Serum', brand: 'Komaira', size: '30 ml', price: 799, compare: 999, stock: 40, featured: 1, badge: 'Bestseller',
    short: 'A lightweight serum with 10% vitamin C to brighten dull skin and fade dark spots.',
    desc: 'Our hero serum for a radiant, even-toned complexion.\n\n- 10% stabilised vitamin C\n- Niacinamide to refine pores\n- Hyaluronic acid for hydration\n\nLightweight, non-sticky and suitable for daily use.',
    how: 'Apply 3–4 drops to clean skin every morning. Follow with moisturiser and sunscreen.', ingredients: 'Aqua, Ascorbyl Glucoside, Niacinamide, Sodium Hyaluronate, Glycerin, Ferulic Acid.', skin: 'All skin types, dull skin', tags: 'vitamin c, brightening, serum' },
  { cat: 'Skincare', name: 'Hydrating Gel Moisturiser', brand: 'Komaira', size: '50 g', price: 549, stock: 55, featured: 1,
    short: 'Oil-free gel cream that delivers 72-hour hydration without heaviness.', desc: 'A water-light gel that sinks in instantly, perfect for humid weather and oily skin.',
    how: 'Massage onto face and neck morning and night.', ingredients: 'Aqua, Glycerin, Ceramide NP, Squalane, Aloe Barbadensis Leaf Juice.', skin: 'Oily & combination skin', tags: 'moisturiser, gel, hydration' },
  { cat: 'Skincare', name: 'SPF 50 Invisible Sunscreen', brand: 'Komaira', size: '50 ml', price: 499, compare: 599, stock: 3, badge: 'New',
    short: 'No white cast, no greasiness — just broad-spectrum protection.', desc: 'Broad-spectrum SPF 50 PA++++ with a weightless, matte finish that sits beautifully under makeup.',
    how: 'Apply generously 15 minutes before sun exposure. Reapply every 2–3 hours.', skin: 'All skin types', tags: 'sunscreen, spf, matte' },
  { cat: 'Skincare', name: 'Gentle Foaming Cleanser', brand: 'Komaira', size: '100 ml', price: 349, stock: 70,
    short: 'A pH-balanced daily cleanser that removes impurities without stripping.', desc: 'Soft foam, fresh skin. Removes sunscreen and light makeup while keeping your barrier happy.', tags: 'cleanser, face wash' },
  { cat: 'Lips', name: 'Velvet Matte Lipstick', brand: 'Komaira', size: '4.2 g', price: 599, compare: 699, featured: 1, badge: 'Bestseller', variantLabel: 'Shade',
    short: 'Creamy, comfortable matte colour that lasts up to 10 hours.', desc: 'Intense colour payoff in a single swipe, enriched with shea butter so lips never feel dry.',
    how: 'Apply directly from the bullet, starting at the centre of the lips.', tags: 'lipstick, matte, long-lasting',
    variants: [['Rose Nude', '#c48b80', 12], ['Brick Red', '#9b3a2f', 9], ['Berry Wine', '#7a2945', 6], ['Mauve Mist', '#a87582', 0]] },
  { cat: 'Lips', name: 'Tinted Lip Oil', brand: 'Komaira', size: '6 ml', price: 449, featured: 1, badge: 'New', variantLabel: 'Shade',
    short: 'A glossy, non-sticky lip oil with a sheer wash of colour.', desc: 'Nourishing jojoba and rosehip oils with a mirror-shine finish.', tags: 'lip oil, gloss',
    variants: [['Clear Glow', '#f2d4cc', 20], ['Peach Kiss', '#f0a58e', 14], ['Cherry Pop', '#c2384a', 11]] },
  { cat: 'Makeup', name: 'Skin Tint Foundation', brand: 'Komaira', size: '30 ml', price: 899, compare: 1099, variantLabel: 'Shade',
    short: 'Light-coverage tint with a natural, skin-like finish.', desc: 'Buildable coverage that evens out skin tone while letting your skin breathe. Infused with hyaluronic acid.', tags: 'foundation, skin tint',
    variants: [['Fair 01', '#f1d3bd', 8], ['Light 02', '#e4b896', 10], ['Medium 03', '#c99673', 12], ['Tan 04', '#a8774f', 7]] },
  { cat: 'Makeup', name: 'Cream Blush Stick', brand: 'Komaira', size: '6 g', price: 499, featured: 1, variantLabel: 'Shade',
    short: 'Blendable cream blush for a fresh, flushed look.', desc: 'Swipe, tap and go. A sheer, buildable flush that melts into skin.', tags: 'blush, cream',
    variants: [['Petal', '#e79a98', 15], ['Coral', '#ef8466', 12]] },
  { cat: 'Eyes', name: 'Smudge-proof Kajal', brand: 'Komaira', size: '0.35 g', price: 249, stock: 120, featured: 1,
    short: 'Intense black kajal that stays put for 12 hours.', desc: 'Glides on smoothly in one stroke and stays smudge-proof and waterproof all day.', tags: 'kajal, kohl, eyeliner' },
  { cat: 'Eyes', name: 'Lash Lift Mascara', brand: 'Komaira', size: '8 ml', price: 449, compare: 549, stock: 35,
    short: 'Lengthens and lifts lashes without clumping.', desc: 'A flexible formula with a curved brush that coats every lash from root to tip.', tags: 'mascara, volume' },
  { cat: 'Fragrance', name: 'Jasmine Dusk Eau de Parfum', brand: 'Komaira', price: 1499, compare: 1799, badge: 'Limited', variantLabel: 'Size',
    short: 'A warm floral of jasmine, sandalwood and a hint of vanilla.', desc: 'Inspired by evening walks through jasmine gardens. Long-lasting and elegant.', tags: 'perfume, floral, jasmine',
    variants: [['30 ml', null, 10, 1499], ['50 ml', null, 6, 2199]] },
  { cat: 'Bath & Body', name: 'Rose & Shea Body Butter', brand: 'Komaira', size: '200 g', price: 599, stock: 28,
    short: 'Rich, whipped body butter for soft, nourished skin.', desc: 'Deeply moisturising shea and cocoa butters with a delicate rose scent.', tags: 'body butter, moisturiser, rose' },
];

const banners = [
  { eyebrow: 'Festive edit · Limited time', title: 'Flat 20% off on all lip colours', subtitle: 'Use code GLOW20 at checkout. Free shipping on orders above ₹999.', cta_text: 'Shop lips', cta_link: '/category/lips', bg_color: '#f3dcd4', text_theme: 'dark', align: 'left' },
  { eyebrow: 'New in skincare', title: 'Meet your new glow ritual', subtitle: 'Vitamin C serum, gel moisturiser and SPF 50 — the trio for radiant skin.', cta_text: 'Discover skincare', cta_link: '/category/skincare', bg_color: '#5a2a3d', text_theme: 'light', align: 'left' },
  { eyebrow: 'Welcome to Komaira', title: 'Beauty, thoughtfully curated', subtitle: 'Get 10% off your first order with code WELCOME10.', cta_text: 'Shop all', cta_link: '/shop', bg_color: '#ece3d6', text_theme: 'dark', align: 'center' },
];

db.transaction(() => {
  const catIds = {};
  categories.forEach((c, i) => {
    const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(c.name);
    catIds[c.name] = existing ? existing.id : db.prepare('INSERT INTO categories (name, slug, description, sort_order) VALUES (?, ?, ?, ?)')
      .run(c.name, uniqueSlug(db, 'categories', c.name), c.description, i).lastInsertRowid;
  });

  for (const p of products) {
    const id = db.prepare(`INSERT INTO products (category_id, name, slug, brand, size, short_description, description, how_to_use, ingredients, skin_type, tags,
        badge, price, compare_at_price, stock, variant_label, is_featured, sku)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      catIds[p.cat], p.name, uniqueSlug(db, 'products', p.name), p.brand, p.size || null, p.short, p.desc, p.how || null, p.ingredients || null,
      p.skin || null, p.tags || null, p.badge || null, rupees(p.price), p.compare ? rupees(p.compare) : null, p.stock || 0, p.variantLabel || null,
      p.featured || 0, `KB-${String(Math.floor(Math.random() * 90000) + 10000)}`,
    ).lastInsertRowid;
    (p.variants || []).forEach(([name, color, stock, price], i) => {
      db.prepare('INSERT INTO product_variants (product_id, name, color, stock, price, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, name, color, stock, price ? rupees(price) : null, i);
    });
  }

  banners.forEach((b, i) => {
    db.prepare(`INSERT INTO banners (eyebrow, title, subtitle, cta_text, cta_link, bg_color, text_theme, align, sort_order)
      VALUES (@eyebrow, @title, @subtitle, @cta_text, @cta_link, @bg_color, @text_theme, @align, @sort_order)`).run({ ...b, sort_order: i + 1 });
  });

  db.prepare(`INSERT OR IGNORE INTO coupons (code, description, type, value, min_order) VALUES ('WELCOME10', 'First order offer', 'percent', 10, 0)`).run();
  db.prepare(`INSERT OR IGNORE INTO coupons (code, description, type, value, min_order) VALUES ('GLOW20', 'Festive lip sale', 'percent', 20, ?)`).run(rupees(499));

  const review = db.prepare("INSERT INTO reviews (product_id, name, rating, title, body, status) VALUES ((SELECT id FROM products WHERE name = ? LIMIT 1), ?, ?, ?, ?, 'approved')");
  review.run('Vitamin C Glow Serum', 'Ananya S.', 5, 'My skin has never looked better', 'Using it for three weeks and my dark spots have visibly faded. Lightweight and absorbs quickly.');
  review.run('Velvet Matte Lipstick', 'Priya M.', 5, 'Perfect everyday nude', 'Rose Nude is the most flattering shade I own. Comfortable for the whole day and does not dry my lips.');
  review.run('Smudge-proof Kajal', 'Neha K.', 4, 'Truly smudge-proof', 'Survived a humid Mumbai day without moving. Would love a brown shade too!');
})();

console.log('Demo data added: categories, products, banner slides, coupons (WELCOME10, GLOW20) and reviews.');
