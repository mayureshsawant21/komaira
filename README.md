# Komaira Boutique

Online cosmetics store for Komaira Boutique, hosted free on **GitHub Pages**:

- Store: **https://mayureshsawant21.github.io/komaira/**
- Admin: **https://mayureshsawant21.github.io/komaira/admin/**

GitHub Pages can only host static files, so the products, orders, logins and photos are kept in **Supabase** (a free hosted database). Until you connect Supabase, the store runs in **demo mode**: it has sample products, and anything you change is saved only in your own browser. That lets you try the store and the admin panel straight away.

## What's included

**Storefront**
- Homepage **banner slider** for offers and announcements: headline, text, a button that links anywhere, image or colour background, autoplay, swipe on phones, and optional start/end dates.
- Rotating **announcement bar** at the top of every page.
- Sections for shop-by-category, bestsellers, offers, new arrivals and customer reviews.
- Product listing with search, sorting, price / in-stock / on-sale filters and pages.
- Product pages with:
  - a photo gallery
  - **shades / sizes** with colour swatches and their own stock and price
  - MRP vs. selling price with the % off
  - description, how to use, ingredients
  - reviews and related products
- Bag with a free-shipping progress bar and **coupon codes**.
- Checkout as a guest or with an account. It checks Indian addresses (state, 6-digit PIN, mobile number).
- **Payments:**
  - **Cash on Delivery**.
  - **UPI** (Google Pay, PhonePe, Paytm…): the customer pays your UPI ID and enters the transaction ID. You check it and mark the order paid.
- Order confirmation and tracking page, plus "Track your order" by order number and email.
- Customer accounts: order history, saved address, wishlist, password reset.
- Contact form, newsletter sign-up, and editable info pages (About, Shipping, Returns, Privacy, Terms).
- Works on phones, tablets and computers.

**Admin panel** (`/komaira/admin`)
- **Dashboard:** live visitors, today's visitors and sales, 30-day charts, recent orders, low-stock alerts, top sellers.
- **Products:**
  - add, edit, duplicate or delete
  - photos (resized automatically), price and MRP, SKU, brand, size
  - stock and a low-stock alert level, shades/sizes
  - badge, tags, featured flag, draft/active, search-engine fields
- **Categories:** categories and sub-categories with images, ordering and show/hide.
- **Banners & offers:** slider slides with a live preview, ordering, show/hide and scheduling; announcement bar text.
- **Orders:**
  - filter and search, status updates (confirmed → processing → shipped → delivered / cancelled)
  - courier and tracking number, payment status
  - "Send status on WhatsApp" button
  - printable invoice / packing slip, CSV export
  - cancelling an order puts the stock back
- **Visitors:**
  - every store page is tracked: unique visitors and page views per page, product, category and day
  - where visitors come from, devices, browsers, live visitors, latest activity
  - your own visits are not counted
- **Also:** coupons, customers, review approval, contact messages, newsletter subscribers (CSV export), info pages, settings (shipping fee, free-shipping threshold, COD, UPI ID, contact details, social links) and admin team.

## Step 1 — switch on GitHub Pages (once)

1. On GitHub, open the repository → **Settings** → **Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Open the **Actions** tab. If the "Deploy to GitHub Pages" run failed before Pages was switched on, click **Re-run all jobs**.

After 1–2 minutes the store is live at https://mayureshsawant21.github.io/komaira/ (in demo mode). Every later commit redeploys it automatically.

## Step 2 — go live with Supabase (about 10 minutes)

1. Create a free project at [supabase.com](https://supabase.com). Choose the **Mumbai (ap-south-1)** region.
2. In Supabase, open **SQL Editor → New query**. Paste all of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
   - Optional: run [`supabase/seed.sql`](supabase/seed.sql) the same way to start with the sample products.
3. Create your admin login: **Authentication → Users → Add user**, enter your email and a strong password, and tick **Auto Confirm User**. Then run this in the SQL Editor:
   ```sql
   select make_admin('you@example.com', 'Your Name');
   ```
4. In **Authentication → URL Configuration**, set **Site URL** to `https://mayureshsawant21.github.io/komaira/`. Sign-up and password-reset emails link there.
5. In **Project Settings → API**, copy the **Project URL** and the **anon public** key.
   - On GitHub, open [`assets/js/config.js`](assets/js/config.js), click the ✏️ (edit), paste both values and **Commit changes**.
   - The anon key is designed to be public; all data is protected inside the database.
6. Wait for the deploy, then sign in at `/komaira/admin`. Add your categories, products and banners, and set your **UPI ID** under **Settings**.

Run `schema.sql` again whenever you update to a newer version of this code. It is safe to re-run and keeps your data.

## How it works

```
index.html, admin/index.html   the store and the admin panel (static pages)
assets/js/store/               storefront: page frame, pages, bag
assets/js/admin/               admin panel screens
assets/js/core/                helpers, database connection (Supabase or demo)
assets/css/                    styles
assets/vendor/                 Supabase and Chart.js libraries (bundled, no CDN needed)
supabase/schema.sql            database tables + all shop logic (pricing, stock, coupons, orders, analytics)
supabase/seed.sql              optional sample products, banners, coupons and reviews
tests/                         database tests
tools/serve.js, tools/e2e.js   local preview server and browser test
```

**Security**
- All data lives in a private database schema. The website can only call specific database functions.
- Prices, stock and coupons are always worked out by the database, so a shopper can't change what they pay.
- Admin functions check that the signed-in user is an admin.
- Photos are uploaded to Supabase Storage, and only admins can upload.

## Working on it locally

Requires Node.js 20+.

```bash
npm install
npm start          # preview at http://localhost:8080/komaira/ (admin at /komaira/admin/)
npm test           # database tests (runs Postgres in-process)
npm run test:e2e   # full browser test (needs Playwright + Chromium)
```

## Limits to know about

- **Order emails:** there are none yet. New orders show in the admin dashboard (with a badge), and you can message customers on WhatsApp from the order page. Automatic emails or card payments (Razorpay) would need a small Supabase Edge Function, which can be added later.
- **Search engines:** the store uses `#/` page links so it can run on GitHub Pages. Google indexes these less well than normal page addresses. For serious SEO later, the same code can move to Netlify or Vercel with a custom domain.
- **Free Supabase plan:** a project is paused if it gets no traffic for about a week. A store with regular visitors stays active, but if it does get paused, open the Supabase dashboard and click **Restore**.
