# Komaira Boutique

Online store for Komaira Boutique — starting with cosmetics. A modern, minimal storefront plus an admin panel to run the shop day to day.

Built with Node.js, Express, server-rendered EJS pages and SQLite (a single database file — no separate database server to manage).

## What's included

**Storefront**
- Homepage banner **slider** for offers and announcements (headline, text, button with link, image or colour, autoplay, swipe on mobile, scheduled start/end dates)
- Rotating **announcement bar** at the top of every page
- Shop by category, bestsellers, offers and new-arrivals sections, customer testimonials
- Product listing with search, sorting, price / in-stock / on-sale filters and pagination
- Product pages with photo gallery, **shades / sizes** (colour swatches, per-shade stock and price), MRP vs. selling price with % off, description, how to use, ingredients, reviews, related products
- Bag with free-shipping progress bar, coupon codes
- Checkout for guests or signed-in customers with Indian address validation (state, 6-digit PIN, mobile)
- Payment by **Cash on Delivery** and **online payments via Razorpay** (UPI, cards, net banking — switched on by adding your keys)
- Order confirmation & tracking page, "Track your order" lookup
- Customer accounts: order history, saved address, wishlist, password change
- Contact form, newsletter sign-up, editable info pages (About, Shipping, Returns, Privacy, Terms)
- SEO: page titles & descriptions, product structured data, `sitemap.xml`, `robots.txt`
- Fully responsive (phone, tablet, desktop)

**Admin panel** (`/admin`)
- Dashboard: live visitors, today's visitors & sales, 30-day charts, recent orders, low-stock alerts, top sellers
- **Products**: add/edit/duplicate/delete, multiple photos, price & MRP, SKU, brand, size, stock, low-stock alert level, shades/sizes, badge, tags, featured flag, draft/active, SEO fields, quick stock edits from the list
- **Categories**: create categories and sub-categories with images, ordering and visibility
- **Banners & offers**: slider slides with live preview, ordering, show/hide, scheduling; announcement bar text
- **Orders**: filter/search, status updates (confirmed → processing → shipped → delivered / cancelled), courier & tracking number, customer email notifications, printable invoice / packing slip, CSV export. Cancelling restocks items.
- **Visitors**: every storefront page tracked — unique visitors and page views per page, per product, per category, per day; traffic sources, devices, browsers, live visitors and latest activity
- Coupons (percentage or fixed, minimum order, usage limits, dates), customers, review moderation, contact messages, newsletter subscribers (CSV export), info pages, store settings (shipping fee, free-shipping threshold, COD fee, contact details, social links), admin team management

## Run it on your computer

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env      # then edit .env (admin email/password, etc.)
npm run seed              # optional: adds demo products, banners and coupons
npm start
```

- Store: http://localhost:3000
- Admin: http://localhost:3000/admin — sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` (the account is created on first start). Change the password under **Settings** afterwards.

To remove the demo data later, delete the demo products, categories and banners in the admin — or start with a fresh database by deleting `data/komaira.db` before launch.

Other commands:

```bash
npm run dev                # restarts automatically when files change
npm test                   # automated tests
npm run create-admin -- "Your Name" you@example.com "a-strong-password"   # add an admin / reset a password
```

## Getting the shop ready

1. **Settings** — store name, contact email/phone, WhatsApp, Instagram, shipping fee and free-shipping threshold, COD on/off.
2. **Categories** — e.g. Skincare, Makeup, Lips, Eyes, Fragrance.
3. **Products** — add photos (square or 4:5 portrait work best), price, MRP, stock. For lipsticks/foundations set *Variant type* to "Shade" and add each shade with its colour and stock.
4. **Banners & offers** — create slides for launch offers (desktop image ~1920×800, optional mobile image ~800×1000) and set the announcement bar text.
5. **Coupons** — e.g. `WELCOME10` for 10% off the first order.
6. **Pages** — review the About, Shipping, Returns, Privacy and Terms text.

## Online payments (Razorpay)

Create a Razorpay account, then copy your API keys into `.env`:

```
RAZORPAY_KEY_ID=rzp_live_xxx
RAZORPAY_KEY_SECRET=xxx
```

Restart the server and "Pay online" appears at checkout. Payments are verified on the server using Razorpay's signature before an order is marked paid. Use `rzp_test_…` keys first to try it out.

## Order emails

Add SMTP details (from Gmail/Google Workspace, Zoho Mail, Brevo, etc.) to `.env` to email customers their order confirmation and status updates, and to get a "new order" email yourself. Without SMTP, emails are only printed in the server log.

## Going live

The shop stores its database in `data/` and uploaded images in `uploads/`, so host it somewhere with a **persistent disk**:

- **A small VPS** (DigitalOcean, Hostinger, AWS Lightsail…): install Node.js, copy the project, set up `.env`, run with `pm2 start server.js`, and put Nginx/Caddy in front for HTTPS.
- **Render / Railway / Fly.io**: deploy with the included `Dockerfile` and attach a persistent volume for `/app/data` and `/app/uploads`.

In production set `NODE_ENV=production`, a long random `SESSION_SECRET`, and `BASE_URL` to your domain (e.g. `https://komaira.com`). Back up `data/komaira.db` and `uploads/` regularly.

## Project layout

```
server.js             start the server
src/app.js            Express app (security headers, sessions, routes)
src/db/               SQLite schema and connection
src/lib/              cart, orders, catalog, analytics, payments, email, uploads
src/routes/           storefront, cart, checkout, account
src/routes/admin/     admin panel
views/                page templates (shop/, account/, admin/, partials/)
public/               CSS, JavaScript, images
scripts/              seed demo data, create admin
tests/                automated tests
```
