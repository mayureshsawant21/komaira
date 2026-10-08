// Storefront pages. Each route returns { title, description, html, track, after(root) }.
import { html, raw, discountPercent, formatText, truncate, fmtDate, storeHref, hashWith, toPaise, formData, isEmail } from '../core/util.js';
import { icon } from '../core/icons.js';
import * as cart from './cart.js';

const STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand',
  'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];

/* ---------- Shared pieces ---------- */

const placeholder = (name, cls = 'img-placeholder') => html`<span class="${cls}"><span>${(name || '?').charAt(0)}</span></span>`;

function stars(rating, size = 16) {
  return html`<span class="stars" aria-label="${rating} out of 5 stars">${[1, 2, 3, 4, 5].map((i) => html`<span class="${i <= Math.round(rating) ? 'on' : ''}">${icon('star', size)}</span>`)}</span>`;
}

function productCard(p, ctx) {
  const fromPrice = p.variant_count > 0 && p.min_variant_price != null ? p.min_variant_price : p.price;
  const off = discountPercent(p.price, p.compare_at_price);
  const soldOut = p.available <= 0;
  return html`
    <article class="product-card${soldOut ? ' is-sold-out' : ''}">
      <a href="#/product/${p.slug}" class="product-media" tabindex="-1" aria-hidden="true">
        ${p.image ? html`<img src="${p.image}" alt="" loading="lazy" class="img-main">${p.image2 ? html`<img src="${p.image2}" alt="" loading="lazy" class="img-alt">` : ''}` : placeholder(p.name)}
        <span class="card-badges">
          ${soldOut ? html`<span class="badge badge-dark">Sold out</span>` : p.badge ? html`<span class="badge">${p.badge}</span>` : ''}
          ${off && !soldOut ? html`<span class="badge badge-sale">${off}% off</span>` : ''}
        </span>
      </a>
      <button type="button" class="wish-btn wish-pos" data-wishlist="${p.id}" aria-label="Save ${p.name} to wishlist">${icon('heart', 18)}</button>
      <div class="product-info">
        ${p.brand ? html`<span class="product-brand">${p.brand}</span>` : ''}
        <h3 class="product-name"><a href="#/product/${p.slug}">${p.name}</a></h3>
        ${p.review_count > 0 ? html`<span class="rating-mini" aria-label="Rated ${p.rating} out of 5">${icon('star', 13)} ${p.rating} <span>(${p.review_count})</span></span>` : ''}
        <div class="price-row">
          <span class="price">${p.variant_count > 0 && fromPrice !== p.price ? 'From ' : ''}${ctx.money(fromPrice)}</span>
          ${off ? html`<s class="price-compare">${ctx.money(p.compare_at_price)}</s>` : ''}
        </div>
      </div>
      ${soldOut ? '' : p.variant_count > 0
        ? html`<a href="#/product/${p.slug}" class="btn btn-outline btn-block btn-sm card-cta">Choose ${(p.variant_label || 'option').toLowerCase()}</a>`
        : html`<form class="card-cta" data-quick-add data-product-id="${p.id}" data-stock="${p.available}"><button type="submit" class="btn btn-outline btn-block btn-sm">Add to bag</button></form>`}
    </article>`;
}

const grid = (items, ctx, extra = '') => html`<div class="product-grid ${extra}">${items.map((p) => productCard(p, ctx))}</div>`;

function empty(iconName, title, text, cta) {
  return html`<div class="empty-state">${icon(iconName, 40)}<h2>${title}</h2><p>${text}</p>${cta || ''}</div>`;
}

/* ---------- Home ---------- */

async function home(route, ctx) {
  const d = await ctx.backend.rpc('home_data');
  const s = ctx.settings;
  const banners = d.banners.length ? d.banners : [{ id: 0, eyebrow: `Welcome to ${s.store_name}`, title: 'Beauty, thoughtfully curated.',
    subtitle: 'Discover skincare and makeup essentials chosen for how they make you feel.', cta_text: 'Shop now', cta_link: '#/shop', bg_color: '#f3e6e1', text_theme: 'dark', align: 'left' }];
  const featured = d.featured.length ? d.featured : d.newest;
  const homeCats = ctx.categories.filter((c) => c.show_on_home && !c.parent_id);
  const autoplay = Number(s.banner_autoplay_seconds) || 0;

  const slide = (b, i) => html`
    <div class="slide text-${b.text_theme} align-${b.align}${i === 0 ? ' is-active' : ''}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${banners.length}" style="--slide-bg: ${/^#[0-9a-f]{6}$/i.test(b.bg_color || '') ? b.bg_color : '#f3e6e1'}" ${i ? raw('aria-hidden="true"') : ''}>
      ${b.image ? html`<picture class="slide-media">${b.mobile_image ? html`<source media="(max-width: 700px)" srcset="${b.mobile_image}">` : ''}<img src="${b.image}" alt="" ${i === 0 ? raw('fetchpriority="high"') : raw('loading="lazy"')}></picture>` : html`<div class="slide-art" aria-hidden="true"></div>`}
      <div class="container slide-content">
        ${b.eyebrow ? html`<span class="eyebrow">${b.eyebrow}</span>` : ''}
        ${i === 0 ? html`<h1 class="slide-title">${b.title}</h1>` : html`<h2 class="slide-title">${b.title}</h2>`}
        ${b.subtitle ? html`<p class="slide-sub">${b.subtitle}</p>` : ''}
        ${b.cta_text && b.cta_link ? html`<a href="${storeHref(b.cta_link)}" class="btn ${b.text_theme === 'light' ? 'btn-light' : 'btn-primary'} btn-lg" ${i ? raw('tabindex="-1"') : ''}>${b.cta_text} ${icon('arrow-right', 18)}</a>` : ''}
      </div>
    </div>`;

  return {
    title: '',
    track: { type: 'home', title: 'Home' },
    html: html`
      <section class="hero" aria-roledescription="carousel" aria-label="Offers and announcements" data-slider data-autoplay="${autoplay}">
        <div class="hero-track">${banners.map(slide)}</div>
        ${banners.length > 1 ? html`
          <button class="slider-arrow prev" type="button" aria-label="Previous slide" data-prev>${icon('chevron-left', 22)}</button>
          <button class="slider-arrow next" type="button" aria-label="Next slide" data-next>${icon('chevron-right', 22)}</button>
          <div class="slider-dots" role="tablist" aria-label="Choose slide">
            ${banners.map((b, i) => html`<button type="button" role="tab" class="${i === 0 ? 'is-active' : ''}" aria-label="Slide ${i + 1}" aria-selected="${i === 0}" data-dot="${i}"><span></span></button>`)}
          </div>` : ''}
      </section>

      <section class="promises" aria-label="Why shop with us"><div class="container promises-grid">
        ${[['truck', s.promise_1], ['shield', s.promise_2], ['refresh', s.promise_3], ['lock', s.promise_4]].filter(([, t]) => t)
          .map(([ic, t]) => html`<div class="promise">${icon(ic, 22)}<span>${t}</span></div>`)}
      </div></section>

      ${homeCats.length ? html`
      <section class="section"><div class="container">
        <div class="section-head"><h2 class="section-title">Shop by category</h2><a href="#/shop" class="link-arrow">View all ${icon('arrow-right', 16)}</a></div>
        <div class="category-grid">
          ${homeCats.map((c, i) => html`
            <a href="#/category/${c.slug}" class="category-card">
              <span class="category-img tone-${i % 4}">${c.image ? html`<img src="${c.image}" alt="" loading="lazy">` : html`<span class="category-initial">${c.name.charAt(0)}</span>`}</span>
              <span class="category-name">${c.name}</span>
              <span class="category-count">${c.product_count} product${c.product_count === 1 ? '' : 's'}</span>
            </a>`)}
        </div>
      </div></section>` : ''}

      ${featured.length ? html`
      <section class="section"><div class="container">
        <div class="section-head"><h2 class="section-title">${s.home_featured_title || 'Bestsellers'}</h2><a href="#/shop?sort=popular" class="link-arrow">Shop all ${icon('arrow-right', 16)}</a></div>
        ${grid(featured, ctx)}
      </div></section>` : ''}

      ${d.on_sale.length ? html`
      <section class="section section-tint"><div class="container offer-split">
        <div class="offer-copy">
          <span class="eyebrow">Limited time</span>
          <h2 class="section-title">Offers you'll love</h2>
          <p>Hand-picked favourites at special prices — while stocks last.</p>
          <a href="#/shop?sale=1" class="btn btn-primary">Shop offers</a>
        </div>
        ${grid(d.on_sale, ctx, 'product-grid-compact')}
      </div></section>` : ''}

      ${d.newest.length && d.featured.length ? html`
      <section class="section"><div class="container">
        <div class="section-head"><h2 class="section-title">${s.home_new_title || 'New arrivals'}</h2><a href="#/shop?sort=newest" class="link-arrow">See what's new ${icon('arrow-right', 16)}</a></div>
        ${grid(d.newest, ctx)}
      </div></section>` : ''}

      ${!featured.length ? html`<section class="section"><div class="container">${empty('sparkle', 'Our shelves are being stocked', 'New products are arriving soon. Join our list below to hear first.')}</div></section>` : ''}

      ${d.reviews.length ? html`
      <section class="section section-tint"><div class="container">
        <h2 class="section-title center">Loved by our customers</h2>
        <div class="testimonials">
          ${d.reviews.map((r) => html`
            <figure class="testimonial">${stars(r.rating)}
              <blockquote>“${truncate(r.body, 220)}”</blockquote>
              <figcaption><strong>${r.name}</strong> on <a href="#/product/${r.product_slug}">${r.product_name}</a></figcaption>
            </figure>`)}
        </div>
      </div></section>` : ''}`,
    after: (root) => bindSlider(root.querySelector('[data-slider]')),
  };
}

function bindSlider(slider) {
  if (!slider) return;
  const slides = [...slider.querySelectorAll('.slide')];
  const dots = [...slider.querySelectorAll('[data-dot]')];
  const seconds = Number(slider.dataset.autoplay) || 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  slider.style.setProperty('--autoplay', `${seconds}s`);
  let index = 0;
  let timer = null;
  const restart = () => {
    clearTimeout(timer);
    if (!document.body.contains(slider)) return;
    if (seconds > 0 && slides.length > 1 && !slider.classList.contains('is-paused') && !reduce) timer = setTimeout(() => go(index + 1), seconds * 1000);
  };
  const go = (n) => {
    if (slides.length < 2) return;
    const set = (i, on) => {
      slides[i].classList.toggle('is-active', on);
      if (on) slides[i].removeAttribute('aria-hidden'); else slides[i].setAttribute('aria-hidden', 'true');
      slides[i].querySelectorAll('a').forEach((a) => (on ? a.removeAttribute('tabindex') : a.setAttribute('tabindex', '-1')));
      if (dots[i]) { dots[i].classList.toggle('is-active', on); dots[i].setAttribute('aria-selected', String(on)); }
    };
    set(index, false);
    index = (n + slides.length) % slides.length;
    set(index, true);
    restart();
  };
  slider.querySelector('[data-prev]')?.addEventListener('click', () => go(index - 1));
  slider.querySelector('[data-next]')?.addEventListener('click', () => go(index + 1));
  dots.forEach((d) => d.addEventListener('click', () => go(Number(d.dataset.dot))));
  const pause = () => { slider.classList.add('is-paused'); clearTimeout(timer); };
  const resume = () => { slider.classList.remove('is-paused'); restart(); };
  slider.addEventListener('mouseenter', pause);
  slider.addEventListener('mouseleave', resume);
  slider.addEventListener('focusin', pause);
  slider.addEventListener('focusout', resume);
  let startX = null;
  slider.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
  slider.addEventListener('touchend', (e) => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 45) go(index + (dx < 0 ? 1 : -1));
    startX = null;
  });
  if (reduce) slider.classList.add('is-paused');
  restart();
}

/* ---------- Listing (shop, category, search) ---------- */

const PER_PAGE = 12;
const SORTS = [['featured', 'Featured'], ['popular', 'Bestselling'], ['newest', 'Newest'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['name', 'Name A–Z']];

async function listing(route, ctx) {
  const isCategory = route.parts[0] === 'category';
  const q = route.query;
  const page = Math.max(1, Number(q.page) || 1);
  const params = {
    category: isCategory ? route.parts[1] : undefined, q: q.q, sort: q.sort, inStock: q.stock === '1', onSale: q.sale === '1',
    min: toPaise(q.min), max: toPaise(q.max), limit: PER_PAGE, offset: (page - 1) * PER_PAGE,
  };
  const data = await ctx.backend.rpc('list_products', params);
  const category = data.category;
  if (isCategory && !category) return null;
  const heading = category ? category.name : q.q ? `Results for “${q.q}”` : q.sale === '1' ? 'On sale' : 'Shop all';
  const intro = category ? category.description : q.q ? '' : 'Our full edit of skincare, makeup and beauty essentials.';
  const pages = Math.max(1, Math.ceil(data.total / PER_PAGE));
  const base = isCategory ? `/category/${category.slug}` : '/shop';
  const chips = category ? category.children : (!q.q ? ctx.tree : []);

  return {
    title: heading,
    description: truncate(intro || `Shop ${heading} at ${ctx.settings.store_name}`),
    track: { type: category ? 'category' : q.q ? 'search' : 'shop', id: category?.id, title: heading },
    html: html`
      <section class="page-hero"><div class="container">
        <nav class="breadcrumbs" aria-label="Breadcrumb">
          <a href="#/">Home</a><span>/</span>
          ${category ? html`<a href="#/shop">Shop</a><span>/</span>${category.parent ? html`<a href="#/category/${category.parent.slug}">${category.parent.name}</a><span>/</span>` : ''}<span aria-current="page">${category.name}</span>` : html`<span aria-current="page">Shop</span>`}
        </nav>
        <h1 class="page-title">${heading}</h1>
        ${intro ? html`<p class="page-intro">${intro}</p>` : ''}
        ${chips.length ? html`<div class="chip-row">${chips.map((c) => html`<a class="chip" href="#/category/${c.slug}">${c.name}</a>`)}</div>` : ''}
      </div></section>
      <section class="container listing">
        <form class="toolbar" data-filters>
          <span class="result-count">${data.total} product${data.total === 1 ? '' : 's'}</span>
          <div class="toolbar-filters">
            <label class="check-pill"><input type="checkbox" name="stock" ${q.stock === '1' ? raw('checked') : ''}> In stock</label>
            <label class="check-pill"><input type="checkbox" name="sale" ${q.sale === '1' ? raw('checked') : ''}> On sale</label>
            <div class="price-filter">
              <label class="sr-only" for="min">Minimum price</label>
              <input id="min" type="number" name="min" min="0" placeholder="Min ${ctx.settings.currency_symbol}" value="${q.min || ''}">
              <span>–</span>
              <label class="sr-only" for="max">Maximum price</label>
              <input id="max" type="number" name="max" min="0" placeholder="Max ${ctx.settings.currency_symbol}" value="${q.max || ''}">
              <button type="submit" class="btn btn-sm btn-outline">Go</button>
            </div>
            <label class="select-wrap"><span class="sr-only">Sort by</span>
              <select name="sort">${SORTS.map(([v, l]) => html`<option value="${v}" ${(q.sort || 'featured') === v ? raw('selected') : ''}>${l}</option>`)}</select>
            </label>
          </div>
        </form>
        ${data.items.length ? html`${grid(data.items, ctx)}${pagination(base, q, page, pages)}`
          : empty('search', 'No products found', 'Try removing a filter or searching for something else.', html`<a href="#/shop" class="btn btn-outline">Browse all products</a>`)}
      </section>`,
    after: (root) => {
      const form = root.querySelector('[data-filters]');
      const apply = () => {
        const f = formData(form);
        ctx.navigate(hashWith(base, { q: q.q, sort: f.sort === 'featured' ? '' : f.sort, stock: f.stock ? '1' : '', sale: f.sale ? '1' : '', min: f.min, max: f.max }));
      };
      form.addEventListener('submit', (e) => { e.preventDefault(); apply(); });
      form.addEventListener('change', (e) => { if (!['min', 'max'].includes(e.target.name)) apply(); });
    },
  };
}

function pagination(base, query, page, pages) {
  if (pages <= 1) return '';
  const link = (n) => hashWith(base, { ...query, page: n === 1 ? '' : n });
  const nums = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 2) nums.push(html`<a href="${link(i)}" class="${i === page ? 'is-current' : ''}" ${i === page ? raw('aria-current="page"') : ''}>${i}</a>`);
    else if (Math.abs(i - page) === 3) nums.push(html`<span>…</span>`);
  }
  return html`<nav class="pagination" aria-label="Pages">
    ${page > 1 ? html`<a href="${link(page - 1)}" aria-label="Previous page">${icon('chevron-left', 18)}</a>` : ''}${nums}
    ${page < pages ? html`<a href="${link(page + 1)}" aria-label="Next page">${icon('chevron-right', 18)}</a>` : ''}</nav>`;
}

/* ---------- Product ---------- */

async function product(route, ctx) {
  const p = await ctx.backend.rpc('get_product', { slug: route.parts[1] });
  if (!p) return null;
  const s = ctx.settings;
  const hasVariants = p.variants.length > 0;
  const first = p.variants.find((v) => v.stock > 0) || p.variants[0];
  const startPrice = hasVariants && first ? first.price : p.price;
  const startStock = hasVariants ? (first ? first.stock : 0) : p.stock;
  const off = discountPercent(startPrice, p.compare_at_price);
  const stockLine = (n) => (n <= 0 ? html`<span class="stock-out">Out of stock</span>`
    : n <= (p.low_stock_threshold || 5) ? html`<span class="stock-low">Only ${n} left — order soon</span>`
      : html`<span class="stock-in">${icon('check', 16)} In stock, ready to ship</span>`);
  const detail = (title, body, open = false) => (body ? html`<details ${open ? raw('open') : ''}><summary>${title} ${icon('chevron-down', 18)}</summary><div class="prose">${body}</div></details>` : '');

  return {
    title: p.meta_title || p.name,
    description: p.meta_description || truncate(p.short_description || p.description),
    track: { type: 'product', id: p.id, title: p.name },
    html: html`
      <div class="container"><nav class="breadcrumbs" aria-label="Breadcrumb">
        <a href="#/">Home</a><span>/</span>
        ${p.category_slug ? html`<a href="#/category/${p.category_slug}">${p.category_name}</a><span>/</span>` : ''}
        <span aria-current="page">${p.name}</span>
      </nav></div>
      <section class="container product-layout">
        <div class="gallery" data-gallery>
          <div class="gallery-main">
            ${p.images.length ? html`<img src="${p.images[0].url}" alt="${p.images[0].alt || p.name}" data-gallery-main>` : placeholder(p.name)}
            ${off ? html`<span class="badge badge-sale gallery-badge">${off}% off</span>` : ''}
          </div>
          ${p.images.length > 1 ? html`<div class="gallery-thumbs">${p.images.map((img, i) => html`
            <button type="button" class="thumb${i === 0 ? ' is-active' : ''}" data-src="${img.url}" data-alt="${img.alt || p.name}" aria-label="Show image ${i + 1}"><img src="${img.url}" alt="" loading="lazy"></button>`)}</div>` : ''}
        </div>

        <div class="product-detail">
          ${p.brand ? html`<span class="product-brand">${p.brand}</span>` : ''}
          <h1 class="product-title">${p.name}</h1>
          ${p.review_count > 0 ? html`<button type="button" class="rating-line linklike-plain" data-scroll="#reviews">${stars(p.rating)} ${p.rating} · ${p.review_count} review${p.review_count === 1 ? '' : 's'}</button>` : ''}
          <div class="price-block">
            <span class="price price-lg" data-price>${ctx.money(startPrice)}</span>
            <s class="price-compare" data-compare ${off ? '' : raw('hidden')}>${p.compare_at_price ? ctx.money(p.compare_at_price) : ''}</s>
            <span class="save-pill" data-save ${off ? '' : raw('hidden')}>Save ${off}%</span>
          </div>
          <p class="tax-note">Inclusive of all taxes${p.size ? ` · ${p.size}` : ''}</p>
          ${p.short_description ? html`<p class="lead">${p.short_description}</p>` : ''}

          <form class="buy-box" data-buy>
            ${hasVariants ? html`
              <fieldset class="variant-picker">
                <legend>${p.variant_label || 'Option'}: <strong data-variant-name>${first ? first.name : ''}</strong></legend>
                <div class="variant-options">
                  ${p.variants.map((v) => html`
                    <label class="variant${v.color ? ' variant-swatch' : ''}${v.stock <= 0 ? ' is-out' : ''}" title="${v.name}${v.stock <= 0 ? ' — sold out' : ''}">
                      <input type="radio" name="variant_id" value="${v.id}" ${first && first.id === v.id ? raw('checked') : ''} ${v.stock <= 0 ? raw('disabled') : ''}
                        data-name="${v.name}" data-price="${v.price}" data-stock="${v.stock}">
                      ${v.color ? html`<span class="swatch" style="--swatch: ${v.color}"></span><span class="sr-only">${v.name}</span>` : html`<span class="variant-label">${v.name}</span>`}
                    </label>`)}
                </div>
              </fieldset>` : ''}
            <p class="stock-line" data-stock-line>${stockLine(startStock)}</p>
            <div class="buy-row">
              <div class="qty" data-qty>
                <button type="button" aria-label="Decrease quantity" data-step="-1">${icon('minus', 16)}</button>
                <input type="number" name="qty" value="1" min="1" max="${Math.max(1, Math.min(10, startStock))}" aria-label="Quantity">
                <button type="button" aria-label="Increase quantity" data-step="1">${icon('plus', 16)}</button>
              </div>
              <button type="submit" class="btn btn-primary btn-lg grow" data-add-btn ${startStock <= 0 ? raw('disabled') : ''}>${p.available <= 0 ? 'Sold out' : 'Add to bag'}</button>
            </div>
            <button type="button" class="btn btn-outline btn-block" data-buy-now ${startStock <= 0 ? raw('disabled') : ''}>Buy it now</button>
          </form>

          <button type="button" class="link-btn wish-inline${p.in_wishlist ? ' is-saved' : ''}" data-wishlist="${p.id}">${icon('heart', 18)} <span data-wish-text>${p.in_wishlist ? 'Saved to wishlist' : 'Add to wishlist'}</span></button>

          <ul class="mini-promises">
            <li>${icon('truck', 18)} ${Number(s.free_shipping_threshold) > 0 ? `Free shipping over ${ctx.money(s.free_shipping_threshold)}` : 'Fast delivery across India'}</li>
            <li>${icon('shield', 18)} 100% authentic</li>
            ${s.cod_enabled === '1' ? html`<li>${icon('package', 18)} Cash on Delivery available</li>` : ''}
          </ul>
          <div class="accordion">
            ${detail('Description', p.description ? formatText(p.description) : '', true)}
            ${detail('Suitable for', p.skin_type ? html`<p>${p.skin_type}</p>` : '')}
            ${detail('How to use', p.how_to_use ? formatText(p.how_to_use) : '')}
            ${detail('Ingredients', p.ingredients ? formatText(p.ingredients) : '')}
            ${detail('Shipping & returns', html`<p>Dispatched within 1–2 business days. Unopened products can be returned within 7 days. <a href="#/pages/returns">Read our returns policy</a>.</p>`)}
          </div>
          ${p.sku ? html`<p class="sku">SKU: ${p.sku}</p>` : ''}
        </div>
      </section>

      <section class="container section reviews" id="reviews">
        <div class="reviews-head">
          <div>
            <h2 class="section-title">Reviews</h2>
            ${p.review_count ? html`<p class="rating-summary"><strong>${p.rating}</strong> out of 5 · based on ${p.review_count} review${p.review_count === 1 ? '' : 's'}</p>` : html`<p class="muted">No reviews yet — be the first to share your thoughts.</p>`}
          </div>
          <button type="button" class="btn btn-outline" data-toggle-review>Write a review</button>
        </div>
        <form class="review-form card" data-review-form hidden>
          <fieldset class="star-input"><legend>Your rating</legend>
            ${[5, 4, 3, 2, 1].map((i) => html`<input type="radio" id="star${i}" name="rating" value="${i}" ${i === 5 ? raw('required') : ''}><label for="star${i}" aria-label="${i} star${i > 1 ? 's' : ''}">${icon('star', 26)}</label>`)}
          </fieldset>
          <div class="form-grid">
            <label class="field"><span>Name</span><input name="name" required maxlength="80"></label>
            <label class="field"><span>Title <em>(optional)</em></span><input name="title" maxlength="120"></label>
          </div>
          <label class="field"><span>Your review</span><textarea name="body" rows="4" required maxlength="2000"></textarea></label>
          <button class="btn btn-primary" type="submit">Submit review</button>
        </form>
        <div class="review-list">
          ${p.reviews.map((r) => html`
            <article class="review">${stars(r.rating, 15)}
              ${r.title ? html`<h3>${r.title}</h3>` : ''}<p>${r.body}</p>
              <footer><strong>${r.name}</strong> · ${fmtDate(r.created_at)}${r.verified ? html` · <span class="verified">Verified customer</span>` : ''}</footer>
            </article>`)}
        </div>
      </section>

      ${p.related.length ? html`<section class="container section"><h2 class="section-title">You may also like</h2>${grid(p.related, ctx)}</section>` : ''}`,
    after: (root) => {
      const main = root.querySelector('[data-gallery-main]');
      root.querySelectorAll('.thumb').forEach((t) => t.addEventListener('click', () => {
        root.querySelectorAll('.thumb').forEach((x) => x.classList.remove('is-active'));
        t.classList.add('is-active');
        main.src = t.dataset.src;
        main.alt = t.dataset.alt;
      }));
      root.querySelector('[data-scroll]')?.addEventListener('click', () => root.querySelector('#reviews').scrollIntoView({ behavior: 'smooth' }));

      const form = root.querySelector('[data-buy]');
      const qtyInput = form.qty;
      const selected = () => form.querySelector('input[name=variant_id]:checked');
      const currentStock = () => (hasVariants ? Number(selected()?.dataset.stock || 0) : p.stock);
      form.querySelectorAll('input[name=variant_id]').forEach((r) => r.addEventListener('change', () => {
        const price = Number(r.dataset.price);
        const stock = Number(r.dataset.stock);
        root.querySelector('[data-price]').textContent = ctx.money(price);
        root.querySelector('[data-variant-name]').textContent = r.dataset.name;
        const o = discountPercent(price, p.compare_at_price);
        root.querySelector('[data-compare]').hidden = !o;
        const save = root.querySelector('[data-save]');
        save.hidden = !o;
        save.textContent = `Save ${o}%`;
        root.querySelector('[data-stock-line]').innerHTML = String(stockLine(stock));
        qtyInput.max = Math.max(1, Math.min(10, stock));
        if (Number(qtyInput.value) > Number(qtyInput.max)) qtyInput.value = qtyInput.max;
        root.querySelector('[data-add-btn]').disabled = stock <= 0;
        root.querySelector('[data-buy-now]').disabled = stock <= 0;
      }));
      const addToBag = () => {
        const variantId = hasVariants ? Number(selected()?.value) : null;
        if (hasVariants && !variantId) { ctx.toast(`Please choose a ${(p.variant_label || 'option').toLowerCase()}.`, { error: true }); return null; }
        return cart.add(p.id, variantId, Number(qtyInput.value) || 1, currentStock());
      };
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const r = addToBag();
        if (r) ctx.toast(r.limited ? `Only ${r.qty} can be added for this item.` : 'Added to your bag.', { link: { href: '#/cart', label: 'View bag' } });
      });
      root.querySelector('[data-buy-now]').addEventListener('click', () => { if (addToBag()) ctx.navigate('#/checkout'); });

      const reviewForm = root.querySelector('[data-review-form]');
      if (ctx.user?.user_metadata?.full_name) reviewForm.name.value = ctx.user.user_metadata.full_name;
      root.querySelector('[data-toggle-review]').addEventListener('click', () => { reviewForm.hidden = !reviewForm.hidden; if (!reviewForm.hidden) reviewForm.querySelector('input[name=rating]').focus(); });
      reviewForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await ctx.backend.rpc('submit_review', { slug: p.slug, ...formData(reviewForm) });
          reviewForm.reset();
          reviewForm.hidden = true;
          ctx.toast('Thank you! Your review will appear once it has been approved.');
        } catch (err) { ctx.toast(err.message, { error: true }); }
      });
    },
  };
}

/* ---------- Bag & checkout ---------- */

async function quote(ctx) {
  const c = cart.getCart();
  if (!c.items.length) return { lines: [], notices: [], subtotal: 0, discount: 0, shipping: 0, total: 0, count: 0, free_shipping_remaining: 0, free_shipping_threshold: 0 };
  const q = await ctx.backend.rpc('cart_quote', { items: c.items, coupon: c.coupon });
  cart.syncFromQuote(q);
  return q;
}

function couponBox(q) {
  return q.coupon
    ? html`<div class="coupon-applied"><span>${icon('check', 16)} <strong>${q.coupon}</strong> applied</span><button type="button" class="link-btn" data-coupon-remove>Remove</button></div>`
    : html`<form class="coupon-form" data-coupon><label class="sr-only" for="coupon">Coupon code</label><input id="coupon" name="code" placeholder="Coupon code" autocomplete="off"><button class="btn btn-outline btn-sm" type="submit">Apply</button></form>`;
}

function bindCoupon(root, ctx) {
  root.querySelector('[data-coupon]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = e.target.code.value.trim();
    if (!code) return;
    const c = cart.getCart();
    const q = await ctx.backend.rpc('cart_quote', { items: c.items, coupon: code });
    if (q.coupon_error || !q.coupon) { ctx.toast(q.coupon_error || 'That coupon code is not valid.', { error: true }); return; }
    cart.setCoupon(q.coupon);
    ctx.flash('success', `Coupon ${q.coupon} applied.`);
    ctx.rerender();
  });
  root.querySelector('[data-coupon-remove]')?.addEventListener('click', () => { cart.setCoupon(''); ctx.rerender(); });
}

function totals(q, ctx) {
  return html`<dl class="totals">
    <div><dt>Subtotal</dt><dd>${ctx.money(q.subtotal)}</dd></div>
    ${q.discount ? html`<div class="discount"><dt>Discount (${q.coupon})</dt><dd>−${ctx.money(q.discount)}</dd></div>` : ''}
    <div><dt>Shipping</dt><dd>${q.shipping ? ctx.money(q.shipping) : 'Free'}</dd></div>
    <div class="grand"><dt>Total</dt><dd>${ctx.money(q.total)}</dd></div>
  </dl>`;
}

const thumb = (image, name) => (image ? html`<img src="${image}" alt="">` : placeholder(name));

async function bag(route, ctx) {
  const q = await quote(ctx);
  return {
    title: 'Your bag',
    track: { type: 'cart', title: 'Bag' },
    html: html`<section class="container narrow-top">
      <h1 class="page-title">Your bag</h1>
      ${q.notices.length ? html`<div class="notice">${q.notices.map((n) => html`<p>${n}</p>`)}</div>` : ''}
      ${!q.lines.length ? empty('bag', 'Your bag is empty', "Let's find something you'll love.", html`<a href="#/shop" class="btn btn-primary">Start shopping</a>`) : html`
      <div class="cart-layout">
        <div class="cart-lines">
          ${q.free_shipping_remaining > 0 ? html`<div class="ship-progress"><p>You're <strong>${ctx.money(q.free_shipping_remaining)}</strong> away from free shipping</p>
            <div class="bar"><span style="width: ${Math.min(100, Math.round(((q.free_shipping_threshold - q.free_shipping_remaining) / q.free_shipping_threshold) * 100))}%"></span></div></div>`
            : q.free_shipping_threshold > 0 ? html`<div class="ship-progress is-done"><p>${icon('check', 16)} You've unlocked free shipping!</p></div>` : ''}
          ${q.lines.map((l, i) => html`
            <article class="cart-line">
              <a href="#/product/${l.slug}" class="cart-thumb">${thumb(l.image, l.name)}</a>
              <div class="cart-info">
                <a href="#/product/${l.slug}" class="cart-name">${l.name}</a>
                ${l.variant_name ? html`<span class="muted">${l.variant_label}: ${l.variant_name}</span>` : ''}
                <span class="cart-unit">${ctx.money(l.price)}${l.compare_at_price > l.price ? html` <s class="price-compare">${ctx.money(l.compare_at_price)}</s>` : ''}</span>
                <div class="cart-actions">
                  <div class="qty qty-sm" data-qty data-line="${i}">
                    <button type="button" aria-label="Decrease quantity" data-step="-1">${icon('minus', 14)}</button>
                    <input type="number" value="${l.qty}" min="0" max="${l.stock}" aria-label="Quantity for ${l.name}">
                    <button type="button" aria-label="Increase quantity" data-step="1">${icon('plus', 14)}</button>
                  </div>
                  <button type="button" class="link-btn muted" data-remove="${i}">${icon('trash', 16)} Remove</button>
                </div>
              </div>
              <strong class="cart-total">${ctx.money(l.total)}</strong>
            </article>`)}
        </div>
        <aside class="summary card">
          <h2>Order summary</h2>
          ${couponBox(q)}
          ${totals(q, ctx)}
          <a href="#/checkout" class="btn btn-primary btn-lg btn-block">Checkout securely</a>
          <a href="#/shop" class="btn-link-center">Continue shopping</a>
        </aside>
      </div>`}
    </section>`,
    after: (root) => {
      let t;
      root.querySelectorAll('[data-line]').forEach((box) => box.querySelector('input').addEventListener('change', (e) => {
        clearTimeout(t);
        t = setTimeout(() => { cart.setQty(Number(box.dataset.line), Number(e.target.value) || 0); ctx.rerender(); }, 300);
      }));
      root.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => { cart.setQty(Number(b.dataset.remove), 0); ctx.rerender(); }));
      bindCoupon(root, ctx);
    },
  };
}

async function checkout(route, ctx) {
  const q = await quote(ctx);
  if (!q.lines.length) { ctx.navigate('#/cart'); return { title: 'Checkout', html: '' }; }
  const s = ctx.settings;
  const payments = [];
  if (s.upi_id) payments.push({ value: 'upi', label: 'Pay by UPI', hint: 'Google Pay, PhonePe, Paytm or any UPI app' });
  if (s.cod_enabled === '1') payments.push({ value: 'cod', label: 'Cash on Delivery', hint: Number(s.cod_fee) ? `Pay when your order arrives (+${ctx.money(s.cod_fee)} COD fee)` : 'Pay when your order arrives' });
  let form = {};
  if (ctx.user) {
    try { form = (await ctx.backend.rpc('my_account')) || {}; } catch { form = {}; }
  }
  const v = (k) => form[k] || '';
  return {
    title: 'Checkout',
    track: { type: 'checkout', title: 'Checkout' },
    html: html`<section class="container narrow-top">
      <h1 class="page-title">Checkout</h1>
      ${!ctx.user ? html`<p class="muted checkout-login">Have an account? <a href="#/account/login?next=${encodeURIComponent('#/checkout')}">Sign in</a> for faster checkout — or continue as a guest.</p>` : ''}
      ${q.notices.length ? html`<div class="notice">${q.notices.map((n) => html`<p>${n}</p>`)}</div>` : ''}
      <div class="cart-layout">
        <form class="checkout-form" id="checkout-form" novalidate data-checkout>
          <fieldset class="card"><legend>Contact</legend>
            <div class="form-grid">
              <label class="field"><span>Full name</span><input name="name" required autocomplete="name" value="${v('name')}"></label>
              <label class="field"><span>Mobile number</span><input name="phone" type="tel" required autocomplete="tel" inputmode="numeric" placeholder="10-digit mobile" value="${v('phone')}"></label>
            </div>
            <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="email" value="${v('email')}"></label>
          </fieldset>
          <fieldset class="card"><legend>Delivery address</legend>
            <label class="field"><span>House / flat, street</span><input name="address_line1" required autocomplete="address-line1" value="${v('address_line1')}"></label>
            <label class="field"><span>Area, landmark <em>(optional)</em></span><input name="address_line2" autocomplete="address-line2" value="${v('address_line2')}"></label>
            <div class="form-grid form-grid-3">
              <label class="field"><span>City</span><input name="city" required autocomplete="address-level2" value="${v('city')}"></label>
              <label class="field"><span>State</span><select name="state" required autocomplete="address-level1"><option value="">Select state</option>${STATES.map((st) => html`<option ${v('state') === st ? raw('selected') : ''}>${st}</option>`)}</select></label>
              <label class="field"><span>PIN code</span><input name="pincode" required inputmode="numeric" maxlength="6" autocomplete="postal-code" value="${v('pincode')}"></label>
            </div>
            <label class="field"><span>Order notes <em>(optional)</em></span><textarea name="notes" rows="2" placeholder="Anything we should know about delivery?"></textarea></label>
          </fieldset>
          <fieldset class="card"><legend>Payment</legend>
            ${payments.length ? html`<div class="pay-options">${payments.map((pm, i) => html`
              <label class="pay-option"><input type="radio" name="payment_method" value="${pm.value}" ${i === 0 ? raw('checked') : ''}><span><strong>${pm.label}</strong><small>${pm.hint}</small></span></label>`)}</div>`
              : html`<p class="notice">Online ordering isn't open yet. Please contact us to place an order.</p>`}
          </fieldset>
          <div class="form-error" data-error role="alert" hidden></div>
          <button type="submit" class="btn btn-primary btn-lg btn-block show-sm" ${payments.length ? '' : raw('disabled')}>Place order · ${ctx.money(q.total)}</button>
        </form>
        <aside class="summary card">
          <h2>Your order</h2>
          <ul class="summary-lines">${q.lines.map((l) => html`
            <li><span class="summary-thumb">${thumb(l.image, l.name)}<span class="qty-badge">${l.qty}</span></span>
              <span class="summary-name">${l.name}${l.variant_name ? html`<small>${l.variant_name}</small>` : ''}</span><span>${ctx.money(l.total)}</span></li>`)}</ul>
          ${couponBox(q)}
          ${totals(q, ctx)}
          <button type="submit" form="checkout-form" class="btn btn-primary btn-lg btn-block hide-sm" ${payments.length ? '' : raw('disabled')}>Place order</button>
          <p class="secure-note">${icon('lock', 14)} Your details are protected and never shared.</p>
        </aside>
      </div>
    </section>`,
    after: (root) => {
      bindCoupon(root, ctx);
      const form = root.querySelector('[data-checkout]');
      const errorBox = root.querySelector('[data-error]');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = formData(form);
        const problems = [];
        if (!f.name.trim()) problems.push('Please enter your full name.');
        if (!/^(\+?91)?[6-9]\d{9}$/.test(f.phone.replace(/[^\d+]/g, ''))) problems.push('Please enter a valid 10-digit mobile number.');
        if (!isEmail(f.email)) problems.push('Please enter a valid email address.');
        if (!f.address_line1.trim() || !f.city.trim() || !f.state) problems.push('Please complete your delivery address.');
        if (!/^\d{6}$/.test(f.pincode.trim())) problems.push('Please enter a valid 6-digit PIN code.');
        if (problems.length) { errorBox.textContent = problems.join(' '); errorBox.hidden = false; errorBox.scrollIntoView({ block: 'center' }); return; }
        errorBox.hidden = true;
        root.querySelectorAll('button[type=submit]').forEach((b) => { b.disabled = true; });
        try {
          const c = cart.getCart();
          const { payment_method: pm, ...customer } = f;
          const res = await ctx.backend.rpc('place_order', { items: c.items, coupon: c.coupon, payment_method: pm, customer });
          cart.clear();
          ctx.navigate(`#/order/${encodeURIComponent(res.order_number)}?t=${res.token}&placed=1`);
        } catch (err) {
          errorBox.textContent = err.message;
          errorBox.hidden = false;
          errorBox.scrollIntoView({ block: 'center' });
          root.querySelectorAll('button[type=submit]').forEach((b) => { b.disabled = false; });
        }
      });
    },
  };
}

/* ---------- Order status & tracking ---------- */

async function orderPage(route, ctx) {
  const o = await ctx.backend.rpc('get_order', { number: route.parts[1], token: route.query.t || '' });
  if (!o) return null;
  const s = ctx.settings;
  const steps = ['confirmed', 'processing', 'shipped', 'delivered'];
  const current = o.status === 'pending' ? -1 : steps.indexOf(o.status);
  const upiDue = o.payment_method === 'upi' && o.payment_status !== 'paid' && o.status !== 'cancelled';
  const upiLink = `upi://pay?${new URLSearchParams({ pa: s.upi_id || '', pn: s.upi_name || s.store_name, am: (o.total / 100).toFixed(2), cu: 'INR', tn: `Order ${o.order_number}` })}`;
  return {
    title: `Order ${o.order_number}`,
    track: { type: 'order', title: 'Order status' },
    html: html`<section class="container narrow-top order-page">
      ${route.query.placed === '1' ? html`<div class="thanks"><span class="thanks-icon">${icon('check', 30)}</span>
        <h1 class="page-title">Thank you, ${o.name.split(' ')[0]}!</h1>
        <p>Your order <strong>${o.order_number}</strong> has been placed.${upiDue ? ' Complete your UPI payment below to confirm it.' : " We'll send updates to " + o.email + '.'}</p></div>`
        : html`<h1 class="page-title">Order ${o.order_number}</h1><p class="muted">Placed on ${fmtDate(o.created_at, true)}</p>`}
      ${upiDue && s.upi_id ? html`
        <div class="card upi-card">
          <h2>${icon('upi', 22)} Pay ${ctx.money(o.total)} by UPI</h2>
          <a class="btn btn-primary btn-lg upi-app-btn" href="${upiLink}">Pay with a UPI app</a>
          <p class="muted small">On a computer? Open any UPI app on your phone and pay to:</p>
          <p class="upi-id"><strong>${s.upi_id}</strong> <button type="button" class="link-btn" data-copy="${s.upi_id}">Copy</button></p>
          <p class="muted small">Amount <strong>${ctx.money(o.total)}</strong> · add <strong>${o.order_number}</strong> in the note.</p>
          ${o.payment_ref ? html`<p class="notice notice-info">Thanks — we received your payment reference <strong>${o.payment_ref}</strong> and will confirm shortly.</p>` : html`
          <form class="coupon-form" data-utr><label class="sr-only" for="utr">UPI transaction ID</label>
            <input id="utr" name="ref" placeholder="UPI transaction ID (UTR) after paying" autocomplete="off"><button class="btn btn-outline btn-sm" type="submit">Submit</button></form>`}
        </div>` : ''}
      ${o.status === 'cancelled' ? html`<div class="notice">This order was cancelled. If you have questions, please <a href="#/contact">contact us</a>.</div>` : html`
        <ol class="tracker">${steps.map((st, i) => html`<li class="${i <= current ? 'is-done' : ''}${i === current ? ' is-current' : ''}"><span></span>${st.charAt(0).toUpperCase() + st.slice(1)}</li>`)}</ol>
        ${o.tracking_number ? html`<div class="notice notice-info">${icon('truck', 18)} Shipped via <strong>${o.courier || 'courier'}</strong> · Tracking number: <strong>${o.tracking_number}</strong></div>` : ''}`}
      <div class="order-grid">
        <div class="card"><h2>Items</h2>
          <ul class="summary-lines">${o.items.map((i) => html`
            <li><span class="summary-thumb">${thumb(i.image, i.name)}<span class="qty-badge">${i.quantity}</span></span>
              <span class="summary-name">${i.name}${i.variant_name ? html`<small>${i.variant_name}</small>` : ''}</span><span>${ctx.money(i.total)}</span></li>`)}</ul>
          <dl class="totals">
            <div><dt>Subtotal</dt><dd>${ctx.money(o.subtotal)}</dd></div>
            ${o.discount ? html`<div class="discount"><dt>Discount${o.coupon_code ? ` (${o.coupon_code})` : ''}</dt><dd>−${ctx.money(o.discount)}</dd></div>` : ''}
            <div><dt>Shipping</dt><dd>${o.shipping ? ctx.money(o.shipping) : 'Free'}</dd></div>
            <div class="grand"><dt>Total</dt><dd>${ctx.money(o.total)}</dd></div>
          </dl>
        </div>
        <div class="card"><h2>Delivery</h2>
          <address><strong>${o.name}</strong><br>${o.address_line1}<br>${o.address_line2 ? html`${o.address_line2}<br>` : ''}${o.city}, ${o.state} ${o.pincode}<br>${o.phone}</address>
          <h2>Payment</h2>
          <p>${o.payment_method === 'cod' ? 'Cash on Delivery' : 'UPI'} · <span class="status status-${o.payment_status}">${o.payment_status}</span></p>
        </div>
      </div>
      <p class="muted small center">Bookmark this page to check your order status any time.</p>
      <div class="center-block"><a href="#/shop" class="btn btn-outline">Continue shopping</a></div>
    </section>`,
    after: (root) => {
      root.querySelector('[data-copy]')?.addEventListener('click', (e) => {
        navigator.clipboard?.writeText(e.target.dataset.copy).then(() => ctx.toast('UPI ID copied.'));
      });
      root.querySelector('[data-utr]')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await ctx.backend.rpc('submit_payment_ref', { number: o.order_number, token: route.query.t, ref: e.target.ref.value });
          ctx.flash('success', 'Thank you! We will confirm your payment shortly.');
          ctx.rerender();
        } catch (err) { ctx.toast(err.message, { error: true }); }
      });
    },
  };
}

async function trackOrder(route, ctx) {
  return {
    title: 'Track your order',
    track: { type: 'track-order', title: 'Track order' },
    html: html`<section class="container narrow-top auth-wrap"><div class="card auth-card">
      <h1 class="page-title">Track your order</h1>
      <p class="muted">Enter your order number (e.g. KB-1001) and the email used at checkout.</p>
      <form data-track>
        <label class="field"><span>Order number</span><input name="number" required></label>
        <label class="field"><span>Email</span><input name="email" type="email" required></label>
        <button class="btn btn-primary btn-block" type="submit">Find my order</button>
      </form></div></section>`,
    after: (root) => root.querySelector('[data-track]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await ctx.backend.rpc('find_order', formData(e.target));
      if (!r) { ctx.toast("We couldn't find an order with those details.", { error: true }); return; }
      ctx.navigate(`#/order/${encodeURIComponent(r.number)}?t=${r.token}`);
    }),
  };
}

/* ---------- Contact & info pages ---------- */

async function contact(route, ctx) {
  const s = ctx.settings;
  return {
    title: 'Contact us',
    track: { type: 'contact', title: 'Contact' },
    html: html`<section class="container narrow-top contact-layout">
      <div>
        <h1 class="page-title">Contact us</h1>
        <p class="page-intro">Questions about a product, your order or a recommendation? We'd love to help.</p>
        <ul class="contact-list big">
          ${s.contact_email ? html`<li>${icon('mail')}<a href="mailto:${s.contact_email}">${s.contact_email}</a></li>` : ''}
          ${s.contact_phone ? html`<li>${icon('phone')}<a href="tel:${s.contact_phone.replace(/\s/g, '')}">${s.contact_phone}</a></li>` : ''}
          ${s.whatsapp ? html`<li>${icon('whatsapp')}<a href="https://wa.me/${s.whatsapp.replace(/\D/g, '')}" target="_blank" rel="noopener">Chat on WhatsApp</a></li>` : ''}
          ${s.address ? html`<li>${icon('pin')}<span>${s.address}</span></li>` : ''}
        </ul>
      </div>
      <form class="card" data-contact>
        <div class="form-grid">
          <label class="field"><span>Name</span><input name="name" required></label>
          <label class="field"><span>Email</span><input name="email" type="email" required></label>
        </div>
        <div class="form-grid">
          <label class="field"><span>Phone <em>(optional)</em></span><input name="phone" type="tel"></label>
          <label class="field"><span>Subject <em>(optional)</em></span><input name="subject"></label>
        </div>
        <label class="field"><span>Message</span><textarea name="body" rows="5" required></textarea></label>
        <button class="btn btn-primary" type="submit">Send message</button>
      </form>
    </section>`,
    after: (root) => root.querySelector('[data-contact]').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await ctx.backend.rpc('submit_message', formData(e.target));
        e.target.reset();
        ctx.toast("Thanks for reaching out! We'll get back to you soon.");
      } catch (err) { ctx.toast(err.message, { error: true }); }
    }),
  };
}

async function infoPage(route, ctx) {
  const pg = await ctx.backend.rpc('get_page', { slug: route.parts[1] });
  if (!pg) return null;
  return {
    title: pg.title,
    description: truncate(pg.content),
    track: { type: 'page', id: pg.id, title: pg.title },
    html: html`<article class="container narrow-top cms-page"><h1 class="page-title">${pg.title}</h1><div class="prose">${formatText(pg.content)}</div></article>`,
  };
}

/* ---------- Customer accounts ---------- */

function authPage(ctx, mode, next) {
  const isLogin = mode === 'login';
  return html`<section class="container narrow-top auth-wrap"><div class="card auth-card">
    <h1 class="page-title">${isLogin ? 'Welcome back' : 'Create your account'}</h1>
    <p class="muted">${isLogin ? 'Sign in to track orders, save favourites and check out faster.' : 'Track orders, build your wishlist and get member-only offers.'}</p>
    <form data-auth>
      ${isLogin ? '' : html`<label class="field"><span>Full name</span><input name="name" required autocomplete="name"></label>`}
      <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="email"></label>
      ${isLogin ? '' : html`<label class="field"><span>Mobile <em>(optional)</em></span><input name="phone" type="tel" autocomplete="tel"></label>`}
      <label class="field"><span>Password</span><input name="password" type="password" required minlength="8" autocomplete="${isLogin ? 'current-password' : 'new-password'}">${isLogin ? '' : html`<small>At least 8 characters</small>`}</label>
      <div class="form-error" data-error role="alert" hidden></div>
      <button class="btn btn-primary btn-block" type="submit">${isLogin ? 'Sign in' : 'Create account'}</button>
    </form>
    ${isLogin ? html`<p class="auth-switch"><button type="button" class="link-btn" data-forgot>Forgot password?</button></p>` : ''}
    <p class="auth-switch">${isLogin ? html`New here? <a href="#/account/register?next=${encodeURIComponent(next)}">Create an account</a>` : html`Already have an account? <a href="#/account/login?next=${encodeURIComponent(next)}">Sign in</a>`}</p>
  </div></section>`;
}

async function account(route, ctx) {
  const sub = route.parts[1] || '';
  const next = route.query.next && route.query.next.startsWith('#/') ? route.query.next : '#/account';

  if (sub === 'login' || sub === 'register') {
    if (ctx.user) { ctx.navigate(next); return { title: 'Account', html: '' }; }
    return {
      title: sub === 'login' ? 'Sign in' : 'Create account',
      track: { type: 'account', title: sub === 'login' ? 'Login' : 'Register' },
      html: authPage(ctx, sub, next),
      after: (root) => {
        const form = root.querySelector('[data-auth]');
        const err = root.querySelector('[data-error]');
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = formData(form);
          err.hidden = true;
          try {
            if (sub === 'login') {
              await ctx.backend.auth.signIn(f.email.trim(), f.password);
            } else {
              if (f.password.length < 8) throw new Error('Password must be at least 8 characters.');
              const r = await ctx.backend.auth.signUp(f.email.trim(), f.password, { full_name: f.name.trim(), phone: f.phone || '' });
              if (r.needsConfirmation) {
                form.closest('.auth-card').innerHTML = String(html`<h1 class="page-title">Check your inbox</h1><p>We've sent a confirmation link to <strong>${f.email}</strong>. Click it to activate your account, then sign in.</p><a href="#/account/login" class="btn btn-primary">Go to sign in</a>`);
                return;
              }
            }
            await ctx.refreshUser();
            ctx.flash('success', sub === 'login' ? 'Welcome back!' : `Welcome to ${ctx.settings.store_name}!`);
            ctx.navigate(next);
          } catch (ex) { err.textContent = ex.message; err.hidden = false; }
        });
        root.querySelector('[data-forgot]')?.addEventListener('click', async () => {
          const email = form.email.value.trim();
          if (!isEmail(email)) { err.textContent = 'Enter your email above first, then tap "Forgot password?".'; err.hidden = false; return; }
          try { await ctx.backend.auth.resetPassword(email); ctx.toast('Password reset link sent — check your inbox.'); } catch (ex) { err.textContent = ex.message; err.hidden = false; }
        });
      },
    };
  }

  if (!ctx.user) { ctx.navigate(`#/account/login?next=${encodeURIComponent(location.hash)}`); return { title: 'Account', html: '' }; }

  if (sub === 'reset') {
    return {
      title: 'New password',
      html: html`<section class="container narrow-top auth-wrap"><form class="card auth-card" data-reset>
        <h1 class="page-title">Choose a new password</h1>
        <label class="field"><span>New password</span><input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
        <button class="btn btn-primary btn-block" type="submit">Save password</button></form></section>`,
      after: (root) => root.querySelector('[data-reset]').addEventListener('submit', async (e) => {
        e.preventDefault();
        try { await ctx.backend.auth.updatePassword(e.target.password.value); ctx.flash('success', 'Password updated.'); ctx.navigate('#/account'); } catch (ex) { ctx.toast(ex.message, { error: true }); }
      }),
    };
  }

  if (sub === 'wishlist') {
    const items = await ctx.backend.rpc('my_wishlist');
    return {
      title: 'Wishlist',
      track: { type: 'wishlist', title: 'Wishlist' },
      html: html`<section class="container narrow-top"><h1 class="page-title">Your wishlist</h1>
        ${items.length ? grid(items.map((p) => ({ ...p })), ctx) : empty('heart', 'Nothing saved yet', 'Tap the heart on any product to save it here.', html`<a href="#/shop" class="btn btn-primary">Discover products</a>`)}</section>`,
      after: (root) => root.querySelectorAll('[data-wishlist]').forEach((b) => b.classList.add('is-saved')),
    };
  }

  const me = await ctx.backend.rpc('my_account');
  return {
    title: 'My account',
    track: { type: 'account', title: 'My account' },
    html: html`<section class="container narrow-top">
      <div class="account-head">
        <div><h1 class="page-title">Hello${me.name ? `, ${me.name.split(' ')[0]}` : ''}</h1><p class="muted">${me.email}</p></div>
        <div class="account-links">
          <a href="#/account/wishlist" class="btn btn-outline btn-sm">${icon('heart', 16)} Wishlist</a>
          <button class="btn btn-outline btn-sm" type="button" data-signout>Sign out</button>
        </div>
      </div>
      <div class="account-grid">
        <div class="card"><h2>Your orders</h2>
          ${!me.orders.length ? html`<p class="muted">You haven't placed any orders yet.</p><a href="#/shop" class="btn btn-primary btn-sm">Start shopping</a>` : html`
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Order</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>${me.orders.map((o) => html`<tr>
              <td><a href="#/order/${encodeURIComponent(o.order_number)}?t=${o.token}">${o.order_number}</a></td><td>${fmtDate(o.created_at)}</td>
              <td>${o.item_count}</td><td>${ctx.money(o.total)}</td><td><span class="status status-${o.status}">${o.status}</span></td></tr>`)}</tbody>
          </table></div>`}
        </div>
        <form class="card" data-profile><h2>Details & address</h2>
          <div class="form-grid">
            <label class="field"><span>Name</span><input name="name" required value="${me.name || ''}"></label>
            <label class="field"><span>Mobile</span><input name="phone" type="tel" value="${me.phone || ''}"></label>
          </div>
          <label class="field"><span>Address</span><input name="address_line1" value="${me.address_line1 || ''}"></label>
          <label class="field"><span>Area, landmark</span><input name="address_line2" value="${me.address_line2 || ''}"></label>
          <div class="form-grid form-grid-3">
            <label class="field"><span>City</span><input name="city" value="${me.city || ''}"></label>
            <label class="field"><span>State</span><select name="state"><option value="">Select state</option>${STATES.map((st) => html`<option ${me.state === st ? raw('selected') : ''}>${st}</option>`)}</select></label>
            <label class="field"><span>PIN code</span><input name="pincode" value="${me.pincode || ''}"></label>
          </div>
          <button class="btn btn-primary btn-sm" type="submit">Save details</button>
        </form>
        <form class="card" data-password><h2>Change password</h2>
          <label class="field"><span>New password</span><input name="password" type="password" required minlength="8" autocomplete="new-password"></label>
          <button class="btn btn-outline btn-sm" type="submit">Update password</button>
        </form>
      </div>
    </section>`,
    after: (root) => {
      root.querySelector('[data-signout]').addEventListener('click', async () => {
        await ctx.backend.auth.signOut();
        await ctx.refreshUser();
        ctx.flash('success', 'You have been signed out.');
        ctx.navigate('#/');
      });
      root.querySelector('[data-profile]').addEventListener('submit', async (e) => {
        e.preventDefault();
        try { await ctx.backend.rpc('save_profile', formData(e.target)); ctx.toast('Your details have been saved.'); } catch (ex) { ctx.toast(ex.message, { error: true }); }
      });
      root.querySelector('[data-password]').addEventListener('submit', async (e) => {
        e.preventDefault();
        try { await ctx.backend.auth.updatePassword(e.target.password.value); e.target.reset(); ctx.toast('Password updated.'); } catch (ex) { ctx.toast(ex.message, { error: true }); }
      });
    },
  };
}

/* ---------- Route table ---------- */

export const routes = [
  { match: (r) => r.path === '/', render: home },
  { match: (r) => r.path === '/shop' || (r.parts[0] === 'category' && r.parts.length === 2), render: listing },
  { match: (r) => r.parts[0] === 'product' && r.parts.length === 2, render: product },
  { match: (r) => r.path === '/cart', render: bag },
  { match: (r) => r.path === '/checkout', render: checkout },
  { match: (r) => r.parts[0] === 'order' && r.parts.length === 2, render: orderPage },
  { match: (r) => r.path === '/track-order', render: trackOrder },
  { match: (r) => r.path === '/contact', render: contact },
  { match: (r) => r.parts[0] === 'pages' && r.parts.length === 2, render: infoPage },
  { match: (r) => r.parts[0] === 'account', render: account },
];
