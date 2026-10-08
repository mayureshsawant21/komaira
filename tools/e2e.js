// End-to-end browser test of the store in demo mode (database in the browser).
// Needs Playwright with Chromium installed (npx playwright install chromium).
// Usage: npm run test:e2e   (screenshots go to ./e2e-shots, which is git-ignored)
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const assert = require('assert/strict');

function loadPlaywright() {
  try { return require('playwright'); } catch { /* fall back to a global install */ }
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}

const PORT = 8091;
// Headless browsers are (correctly) ignored by visitor tracking, so pretend to be a normal phone/desktop browser.
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const UA_PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const BASE = `http://localhost:${PORT}/komaira/`;
const SHOTS = path.join(__dirname, '..', 'e2e-shots');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGM4UdFEEmIY1TCqYfhqAACBb8IQ62u+RQAAAABJRU5ErkJggg==', 'base64');

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const errors = [];
  const newPage = async (context) => {
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|net::ERR/.test(m.text())) errors.push(`console: ${m.text()}`); });
    page.on('dialog', (d) => d.accept());
    return page;
  };
  const ready = (page, sel) => page.waitForFunction((s) => {
    const el = document.querySelector(s);
    return el && !el.hasAttribute('aria-busy') && el.innerHTML.length > 50;
  }, sel, { timeout: 60000 });
  const step = (msg) => console.log(`✓ ${msg}`);

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, userAgent: UA_DESKTOP });
    await context.addInitScript(() => { window.KOMAIRA_PGLITE_BASE = `${location.origin}/komaira/__pglite/`; });
    const admin = await newPage(context);
    const adminGo = async (hash) => { await admin.goto(`${BASE}admin/${hash}`); await ready(admin, '#content'); };

    // --- Admin: category, product with photo + shades, banner, UPI ---
    await adminGo('#/categories/new');
    await admin.fill('input[name=name]', 'Nail Paints');
    await admin.setInputFiles('[data-image-input]', { name: 'nails.png', mimeType: 'image/png', buffer: PNG });
    await admin.waitForSelector('.image-tile img[src^="data:"]');
    await Promise.all([admin.waitForURL(/#\/products\/new\?category=\d+/), admin.click('button[value=product]')]);
    await ready(admin, '#content');
    step('admin created a category with an image');

    await admin.fill('input[name=name]', 'Gloss Nail Paint');
    await admin.fill('input[name=price]', '299');
    await admin.fill('input[name=compare_at_price]', '349');
    await admin.fill('input[name=variant_label]', 'Shade');
    await admin.check('input[name=is_featured]');
    await admin.setInputFiles('[data-image-input]', [{ name: 'a.png', mimeType: 'image/png', buffer: PNG }, { name: 'b.png', mimeType: 'image/png', buffer: PNG }]);
    await admin.waitForFunction(() => document.querySelectorAll('[data-images] .image-tile img').length === 2 && !document.querySelector('.is-uploading'));
    for (const [name, stock] of [['Cherry', '5'], ['Nude', '2']]) {
      await admin.click('[data-add-variant]');
      const row = admin.locator('.variant-row:not(.variant-head)').last();
      await row.locator('[data-v=name]').fill(name);
      await row.locator('[data-v=stock]').fill(stock);
    }
    await admin.locator('.variant-row:not(.variant-head)').last().locator('[data-v=no-swatch]').check();
    await Promise.all([admin.waitForURL(/#\/products\/\d+$/), admin.click('.sticky-actions button[type=submit]')]);
    await ready(admin, '#content');
    assert.match(await admin.textContent('.alert-success'), /has been added/);
    step('admin added a product with 2 photos and 2 shades');

    await adminGo('#/banners/new');
    await admin.fill('input[name=title]', 'Nail Week: 15% off');
    await admin.fill('input[name=cta_text]', 'Shop nails');
    await admin.fill('input[name=cta_link]', '/category/nail-paints');
    assert.equal(await admin.textContent('[data-bp=title]'), 'Nail Week: 15% off');
    await Promise.all([admin.waitForURL(/#\/banners$/), admin.click('.sticky-actions button')]);
    await ready(admin, '#content');
    const lastTitle = () => admin.evaluate(() => [...document.querySelectorAll('.banner-item strong')].map((x) => x.textContent));
    await admin.click('[data-act=up] >> nth=-1');
    await admin.waitForFunction(() => [...document.querySelectorAll('.banner-item strong')].at(-2)?.textContent === 'Nail Week: 15% off');
    assert.equal((await lastTitle()).at(-2), 'Nail Week: 15% off');
    step('admin created a homepage banner (live preview works) and reordered it');

    await adminGo('#/settings');
    await admin.fill('input[name=upi_id]', 'komaira@okhdfcbank');
    await admin.click('[data-settings] .sticky-actions button');
    await admin.waitForSelector('.alert-success');
    await adminGo('#/coupons/new');
    await admin.fill('input[name=code]', 'nails15');
    await admin.fill('input[name=value]', '15');
    await Promise.all([admin.waitForURL(/#\/coupons$/), admin.click('[data-coupon] button[type=submit]')]);
    step('admin set a UPI ID and created coupon NAILS15');

    // --- Shopper (separate browser profile = separate visitor) ---
    const shopperCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: UA_PHONE });
    await shopperCtx.addInitScript(() => { window.KOMAIRA_PGLITE_BASE = `${location.origin}/komaira/__pglite/`; });
    const shop = await newPage(shopperCtx);
    // The shopper has their own demo database (demo data is per browser), so add the same product there via its admin.
    await shop.goto(`${BASE}admin/#/settings`);
    await ready(shop, '#content');
    await shop.fill('input[name=upi_id]', 'komaira@okhdfcbank');
    await shop.click('[data-settings] .sticky-actions button');
    await shop.waitForSelector('.alert-success');
    await shop.evaluate(() => localStorage.removeItem('komaira-is-admin'));

    await shop.goto(BASE);
    await ready(shop, '#view');
    await shop.waitForSelector('.slide.is-active');
    await shop.tap('[data-dot="1"]');
    await shop.waitForFunction(() => document.querySelectorAll('.slide')[1].classList.contains('is-active'));
    step('shopper homepage: slider works on mobile');

    await shop.goto(`${BASE}#/product/velvet-matte-lipstick`);
    await ready(shop, '#view');
    await shop.tap('label.variant:nth-child(2)');
    assert.equal(await shop.textContent('[data-variant-name]'), 'Brick Red');
    await shop.fill('input[name=qty]', '2');
    await shop.tap('[data-add-btn]');
    await shop.waitForSelector('[data-toast]:not([hidden])');
    assert.equal(await shop.textContent('[data-cart-count]'), '2');
    step('shopper added 2 × Brick Red to the bag');

    await shop.goto(`${BASE}#/cart`);
    await ready(shop, '#view');
    await shop.fill('[data-coupon] input', 'welcome10');
    await shop.click('[data-coupon] button');
    await shop.waitForSelector('.coupon-applied');
    assert.match(await shop.textContent('.totals .grand'), /₹1,078\.20/);
    step('coupon WELCOME10 applied: total ₹1,078.20');

    await shop.goto(`${BASE}#/checkout`);
    await ready(shop, '#view');
    await shop.click('.checkout-form button[type=submit]');
    assert.match(await shop.textContent('[data-error]'), /full name/);
    await shop.fill('input[name=name]', 'Asha Rao');
    await shop.fill('input[name=phone]', '9876543210');
    await shop.fill('input[name=email]', 'asha@example.com');
    await shop.fill('input[name=address_line1]', '12 MG Road');
    await shop.fill('input[name=city]', 'Pune');
    await shop.selectOption('select[name=state]', 'Maharashtra');
    await shop.fill('input[name=pincode]', '411001');
    await shop.check('input[value=upi]');
    await shop.screenshot({ path: path.join(SHOTS, 'checkout-mobile.png'), fullPage: true });
    await Promise.all([shop.waitForURL(/#\/order\/KB-\d+\?t=[a-f0-9]+&placed=1/), shop.click('.checkout-form button[type=submit]')]);
    await ready(shop, '#view');
    assert.match(await shop.textContent('.thanks'), /Thank you, Asha/);
    assert.match(await shop.getAttribute('.upi-app-btn', 'href'), /^upi:\/\/pay\?pa=komaira%40okhdfcbank.*am=1078\.20/);
    await shop.fill('[data-utr] input', '412345678901');
    await shop.click('[data-utr] button');
    await shop.waitForSelector('.flash-success');
    assert.equal(await shop.textContent('[data-cart-count]'), '0');
    await shop.screenshot({ path: path.join(SHOTS, 'order-upi-mobile.png'), fullPage: true });
    const orderUrl = shop.url();
    step('shopper placed a UPI order and submitted the UPI reference');

    const scrollW = await shop.evaluate(() => document.documentElement.scrollWidth);
    assert.equal(scrollW, 390, 'no horizontal scrolling on mobile');

    // Review
    await shop.goto(`${BASE}#/product/velvet-matte-lipstick`);
    await ready(shop, '#view');
    await shop.click('[data-toggle-review]');
    await shop.click('label[for=star4]');
    await shop.fill('[data-review-form] input[name=name]', 'Asha');
    await shop.fill('[data-review-form] textarea', 'Gorgeous shade <b>wow</b>');
    await shop.click('[data-review-form] button[type=submit]');
    await shop.waitForSelector('[data-toast]:not([hidden])');
    step('shopper submitted a review');

    // --- Shopper's own admin view (same demo database) processes the order ---
    await shop.goto(`${BASE}admin/#/orders`);
    await ready(shop, '#content');
    await shop.click('table a >> nth=0');
    await shop.waitForSelector('[data-update]');
    assert.match(await shop.textContent('#content'), /412345678901/);
    await shop.selectOption('select[name=payment_status]', 'paid');
    await shop.selectOption('select[name=status]', 'shipped');
    await shop.fill('input[name=courier]', 'Delhivery');
    await shop.fill('input[name=tracking_number]', 'DLV998877');
    await shop.click('[data-update] button[type=submit]');
    await shop.waitForSelector('.alert-success');
    step('admin verified the UPI reference, marked the order paid & shipped');

    await shop.goto(`${BASE}admin/#/reviews`);
    await ready(shop, '#content');
    await shop.click('[data-act=approve]');
    await shop.waitForFunction(() => !document.querySelector('[data-act=approve]'));
    await shop.evaluate(() => localStorage.removeItem('komaira-is-admin'));
    await shop.goto(orderUrl.replace('&placed=1', ''));
    await ready(shop, '#view');
    assert.match(await shop.textContent('.notice-info'), /DLV998877/);
    await shop.goto(`${BASE}#/product/velvet-matte-lipstick`);
    await ready(shop, '#view');
    assert.match(await shop.innerHTML('.review-list'), /Gorgeous shade &lt;b&gt;wow&lt;\/b&gt;/);
    step('shopper sees tracking number; approved review shows (HTML escaped)');

    await shop.goto(`${BASE}admin/#/analytics?days=7`);
    await ready(shop, '#content');
    await shop.waitForSelector('.stats');
    const analyticsText = await shop.textContent('#content');
    assert.match(analyticsText, /\/product\/velvet-matte-lipstick/);
    assert.match(analyticsText, /\/checkout/);
    assert.match(analyticsText, /Mobile/);
    await shop.screenshot({ path: path.join(SHOTS, 'analytics-mobile.png'), fullPage: true });
    step('visitor analytics lists the pages the shopper visited');

    // --- Admin's store tab sees the admin's new product & banner ---
    const store = await newPage(context);
    await store.goto(BASE);
    await ready(store, '#view');
    assert.match(await store.textContent('.hero'), /Nail Week: 15% off/);
    assert.match(await store.textContent('#view'), /Gloss Nail Paint/);
    await store.goto(`${BASE}#/category/nail-paints`);
    await ready(store, '#view');
    assert.match(await store.textContent('.result-count'), /1 product/);
    await store.screenshot({ path: path.join(SHOTS, 'category-desktop.png'), fullPage: true });
    step('admin changes appear in the storefront (shared between open tabs)');

    // --- Customer account (demo sign-up) ---
    await store.goto(`${BASE}#/account/register`);
    await ready(store, '#view');
    await store.fill('[data-auth] input[name=name]', 'Meera Shah');
    await store.fill('[data-auth] input[name=email]', 'meera@example.com');
    await store.fill('[data-auth] input[name=password]', 'longenough1');
    await Promise.all([store.waitForURL(/#\/account$/), store.click('[data-auth] button[type=submit]')]);
    await ready(store, '#view');
    assert.match(await store.textContent('.account-head'), /Hello, Meera/);
    step('customer registered and sees their account page');

    assert.deepEqual(errors, [], `browser errors:\n${errors.join('\n')}`);
    console.log('\nAll end-to-end checks passed.');
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((err) => { console.error(`✗ ${err.message}`); process.exit(1); });
