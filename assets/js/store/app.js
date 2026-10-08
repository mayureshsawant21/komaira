// Komaira Boutique storefront: loads store data, draws the page frame and routes between pages.
import { html, raw, esc, money as fmtMoney, storeHref, parseHash, randomHex } from '../core/util.js';
import { icon } from '../core/icons.js';
import { getBackend, IS_DEMO } from '../core/backend.js';
import * as cart from './cart.js';
import { routes } from './views.js';

const app = document.getElementById('app');
const ctx = {
  backend: null,
  settings: {},
  categories: [],
  tree: [],
  pages: [],
  user: null,
  money: (v) => fmtMoney(v, ctx.settings.currency_symbol || '₹'),
  navigate: (hash) => { if (location.hash === hash) render(); else location.hash = hash; },
  toast,
  refreshUser: async () => { ctx.user = await ctx.backend.auth.user(); },
  rerender: () => render(),
};

/* ---------- Boot ---------- */
async function boot() {
  try {
    ctx.backend = await getBackend('store');
    const data = await ctx.backend.rpc('store_bootstrap');
    ctx.settings = data.settings || {};
    ctx.categories = data.categories || [];
    ctx.pages = data.pages || [];
    const byId = new Map(ctx.categories.map((c) => [c.id, { ...c, children: [] }]));
    ctx.tree = [];
    for (const c of byId.values()) (c.parent_id && byId.has(c.parent_id) ? byId.get(c.parent_id).children : ctx.tree).push(c);
    ctx.user = await ctx.backend.auth.user();
    ctx.backend.auth.onRecovery(() => ctx.navigate('#/account/reset'));
  } catch (err) {
    app.innerHTML = String(html`<div class="container section empty-state">${icon('sparkle', 40)}<h1 class="page-title">We'll be right back</h1><p>${err.message}</p><button class="btn btn-primary" onclick="location.reload()">Try again</button></div>`);
    return;
  }
  app.innerHTML = String(shell());
  bindShell();
  cart.onChange(updateCartCount);
  window.addEventListener('hashchange', render);
  render();
}

/* ---------- Page frame ---------- */
function shell() {
  const s = ctx.settings;
  const announcements = s.announcement_active === '1' ? String(s.announcement_text || '').split('\n').map((t) => t.trim()).filter(Boolean) : [];
  const link = storeHref(s.announcement_link);
  return html`
    ${IS_DEMO ? html`<div class="demo-bar">Demo mode — sample products, saved only in this browser. <a href="admin/">Open admin</a></div>` : ''}
    ${announcements.length ? html`
      <div class="announcement" data-rotator><div class="container announcement-inner">
        ${announcements.map((a, i) => link
          ? html`<a href="${link}" class="announcement-item${i === 0 ? ' is-active' : ''}">${a}</a>`
          : html`<span class="announcement-item${i === 0 ? ' is-active' : ''}">${a}</span>`)}
      </div></div>` : ''}
    <header class="site-header">
      <div class="container header-inner">
        <button class="icon-btn menu-toggle" type="button" aria-label="Open menu" aria-expanded="false" data-menu-open>${icon('menu', 22)}</button>
        <a href="#/" class="logo" aria-label="${s.store_name} home"><span class="logo-mark">Komaira</span><span class="logo-sub">Boutique</span></a>
        <nav class="main-nav" data-menu aria-label="Main">
          <div class="menu-head"><span class="logo-mark">Komaira</span><button class="icon-btn" type="button" aria-label="Close menu" data-menu-close>${icon('close', 22)}</button></div>
          <ul>
            <li><a href="#/shop" data-nav="/shop">Shop all</a></li>
            ${ctx.tree.slice(0, 6).map((c) => html`
              <li class="${c.children.length ? 'has-children' : ''}">
                <a href="#/category/${c.slug}" data-nav="/category/${c.slug}">${c.name}</a>
                ${c.children.length ? html`<ul class="submenu">${c.children.map((sc) => html`<li><a href="#/category/${sc.slug}">${sc.name}</a></li>`)}</ul>` : ''}
              </li>`)}
            <li><a href="#/shop?sale=1" class="nav-sale">Offers</a></li>
          </ul>
          <div class="menu-foot"><a href="#/account" data-account-link>Account</a><a href="#/track-order">Track order</a><a href="#/contact">Contact</a></div>
        </nav>
        <div class="header-actions">
          <button class="icon-btn" type="button" aria-label="Search" data-search-open>${icon('search')}</button>
          <a class="icon-btn hide-sm" href="#/account" aria-label="Account">${icon('user')}</a>
          <a class="icon-btn hide-sm" href="#/account/wishlist" aria-label="Wishlist">${icon('heart')}</a>
          <a class="icon-btn bag-btn" href="#/cart" aria-label="Shopping bag">${icon('bag')}<span class="bag-count" data-cart-count></span></a>
        </div>
      </div>
      <div class="search-panel" data-search-panel hidden>
        <form class="container search-form" role="search" data-search-form>
          ${icon('search', 22)}
          <input type="search" name="q" placeholder="Search for lipstick, serum, sunscreen…" aria-label="Search products" autocomplete="off">
          <button type="button" class="icon-btn" aria-label="Close search" data-search-close>${icon('close')}</button>
        </form>
      </div>
    </header>
    <div class="menu-backdrop" data-menu-backdrop hidden></div>
    <main id="main" tabindex="-1"><div data-flash></div><div id="view"></div></main>
    <footer class="site-footer">
      <section class="newsletter" id="newsletter">
        <div class="container newsletter-inner">
          <div><h2>Join the Komaira circle</h2><p>New launches, beauty edits and members-only offers — straight to your inbox.</p></div>
          <form class="newsletter-form" data-newsletter>
            <label class="sr-only" for="nl-email">Email address</label>
            <input id="nl-email" type="email" name="email" placeholder="Your email address" required>
            <button class="btn btn-primary" type="submit">Subscribe</button>
          </form>
        </div>
      </section>
      <div class="container footer-grid">
        <div class="footer-brand">
          <a href="#/" class="logo logo-footer"><span class="logo-mark">Komaira</span><span class="logo-sub">Boutique</span></a>
          <p>${s.tagline}</p>
          <div class="socials">
            ${s.instagram ? html`<a href="${s.instagram}" target="_blank" rel="noopener" aria-label="Instagram">${icon('instagram')}</a>` : ''}
            ${s.facebook ? html`<a href="${s.facebook}" target="_blank" rel="noopener" aria-label="Facebook">${icon('facebook')}</a>` : ''}
            ${s.youtube ? html`<a href="${s.youtube}" target="_blank" rel="noopener" aria-label="YouTube">${icon('youtube')}</a>` : ''}
            ${s.whatsapp ? html`<a href="https://wa.me/${String(s.whatsapp).replace(/\D/g, '')}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon('whatsapp')}</a>` : ''}
          </div>
        </div>
        <div><h3>Shop</h3><ul>
          <li><a href="#/shop">Shop all</a></li>
          ${ctx.tree.slice(0, 6).map((c) => html`<li><a href="#/category/${c.slug}">${c.name}</a></li>`)}
          <li><a href="#/shop?sale=1">Offers</a></li>
        </ul></div>
        <div><h3>Help</h3><ul>
          <li><a href="#/track-order">Track your order</a></li>
          <li><a href="#/contact">Contact us</a></li>
          ${ctx.pages.map((p) => html`<li><a href="#/pages/${p.slug}">${p.title}</a></li>`)}
        </ul></div>
        <div><h3>Get in touch</h3><ul class="contact-list">
          ${s.contact_email ? html`<li>${icon('mail', 16)}<a href="mailto:${s.contact_email}">${s.contact_email}</a></li>` : ''}
          ${s.contact_phone ? html`<li>${icon('phone', 16)}<a href="tel:${s.contact_phone.replace(/\s/g, '')}">${s.contact_phone}</a></li>` : ''}
          ${s.address ? html`<li>${icon('pin', 16)}<span>${s.address}</span></li>` : ''}
        </ul></div>
      </div>
      <div class="container footer-bottom">
        <span>© ${new Date().getFullYear()} ${s.store_name}. All rights reserved.</span>
        <span class="pay-note">${icon('lock', 14)} UPI · Cash on Delivery</span>
      </div>
    </footer>
    <div class="toast" data-toast role="status" aria-live="polite" hidden></div>`;
}

function updateCartCount() {
  const n = cart.count();
  document.querySelectorAll('[data-cart-count]').forEach((el) => {
    el.textContent = n;
    el.classList.toggle('is-empty', !n);
  });
}

/* ---------- Routing ---------- */
let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  const route = parseHash();
  const view = document.getElementById('view');
  setMenu(false);
  document.querySelector('[data-search-panel]').hidden = true;
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('is-current', a.dataset.nav === route.path));
  view.setAttribute('aria-busy', 'true');
  let page;
  try {
    const handler = routes.find((r) => r.match(route));
    page = handler ? await handler.render(route, ctx) : null;
  } catch (err) {
    console.error(err);
    page = { title: 'Something went wrong', html: html`<section class="container section empty-state">${icon('sparkle', 40)}<h1 class="page-title">Something went wrong</h1><p>${err.message}</p><a href="#/" class="btn btn-primary">Back to home</a></section>` };
  }
  if (seq !== renderSeq) return; // a newer navigation started
  if (!page) {
    page = { title: 'Page not found', html: html`<section class="container section empty-state">${icon('sparkle', 40)}<h1 class="page-title">Page not found</h1><p>We couldn't find the page you were looking for.</p><a href="#/" class="btn btn-primary">Back to home</a></section>` };
  }
  view.innerHTML = String(page.html);
  view.removeAttribute('aria-busy');
  document.title = page.title ? `${page.title} | ${ctx.settings.store_name}` : `${ctx.settings.store_name} — ${ctx.settings.tagline}`;
  document.querySelector('meta[name=description]').setAttribute('content', page.description || ctx.settings.meta_description || '');
  if (!route.query._keepScroll) window.scrollTo(0, 0);
  showFlash();
  updateCartCount();
  bindCommon(view);
  page.after?.(view);
  track(route, page.track || { type: 'page' }, page.title);
}

/* ---------- Visitor tracking ---------- */
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
function track(route, t, title) {
  try {
    if (localStorage.getItem('komaira-is-admin') === '1') return; // the owner's own visits aren't counted
    const ua = navigator.userAgent || '';
    if (/bot|crawl|spider|slurp|preview|headless|lighthouse/i.test(ua)) return;
    let visitor = localStorage.getItem('kb_vid');
    let isNew = false;
    if (!/^[a-f0-9]{32}$/.test(visitor || '')) {
      visitor = randomHex(16);
      localStorage.setItem('kb_vid', visitor);
      isNew = true;
    }
    let referrer = null;
    if (!sessionStorage.getItem('kb_ref')) {
      sessionStorage.setItem('kb_ref', '1');
      try {
        const host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : '';
        if (host && host !== location.hostname.replace(/^www\./, '')) referrer = host;
      } catch { /* ignore */ }
    }
    ctx.backend.rpc('track_view', {
      visitor_id: visitor, path: route.path, type: t.type, ref_id: t.id || null, title: t.title || title || '',
      referrer, device: deviceOf(ua), browser: browserOf(ua), is_new: isNew,
    }).catch(() => {});
  } catch { /* tracking must never break the page */ }
}

/* ---------- Flash messages & toast ---------- */
export function flash(type, text) { sessionStorage.setItem('kb_flash', JSON.stringify({ type, text })); }
ctx.flash = flash;
function showFlash() {
  const box = document.querySelector('[data-flash]');
  const raw0 = sessionStorage.getItem('kb_flash');
  sessionStorage.removeItem('kb_flash');
  if (!raw0) { box.innerHTML = ''; return; }
  const f = JSON.parse(raw0);
  box.innerHTML = String(html`<div class="flash-wrap container"><div class="flash flash-${f.type}" role="${f.type === 'error' ? 'alert' : 'status'}">${f.type === 'success' ? icon('check', 18) : ''}<span>${f.text}</span></div></div>`);
}
let toastTimer;
function toast(message, { error = false, link = null } = {}) {
  const el = document.querySelector('[data-toast]');
  el.innerHTML = String(html`<span>${message}</span>${link ? html` <a href="${link.href}">${link.label}</a>` : ''}`);
  el.classList.toggle('is-error', error);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3800);
}

/* ---------- Shell interactions ---------- */
function setMenu(open) {
  const menu = document.querySelector('[data-menu]');
  if (!menu) return;
  menu.classList.toggle('is-open', open);
  document.querySelector('[data-menu-backdrop]').hidden = !open;
  document.querySelector('[data-menu-open]').setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
}

function bindShell() {
  const $ = (s) => document.querySelector(s);
  $('[data-menu-open]').addEventListener('click', () => setMenu(true));
  $('[data-menu-close]').addEventListener('click', () => setMenu(false));
  $('[data-menu-backdrop]').addEventListener('click', () => setMenu(false));
  const panel = $('[data-search-panel]');
  $('[data-search-open]').addEventListener('click', () => { panel.hidden = !panel.hidden; if (!panel.hidden) panel.querySelector('input').focus(); });
  $('[data-search-close]').addEventListener('click', () => { panel.hidden = true; });
  $('[data-search-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    if (q) ctx.navigate(`#/shop?q=${encodeURIComponent(q)}`);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setMenu(false); panel.hidden = true; } });
  $('[data-skip]')?.addEventListener('click', (e) => { e.preventDefault(); $('#main').focus(); });
  $('[data-newsletter]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      await ctx.backend.rpc('subscribe', { email: form.email.value });
      form.reset();
      toast("You're on the list! Look out for offers and new arrivals.");
    } catch (err) { toast(err.message, { error: true }); }
  });
  const rot = $('[data-rotator]');
  const items = rot ? rot.querySelectorAll('.announcement-item') : [];
  if (items.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let i = 0;
    setInterval(() => { items[i].classList.remove('is-active'); i = (i + 1) % items.length; items[i].classList.add('is-active'); }, 4000);
  }
}

/** Behaviour shared by many pages: add-to-bag buttons on cards, wishlist hearts, quantity steppers. */
function bindCommon(root) {
  root.querySelectorAll('form[data-quick-add]').forEach((form) => form.addEventListener('submit', (e) => {
    e.preventDefault();
    const r = cart.add(Number(form.dataset.productId), null, 1, Number(form.dataset.stock) || 10);
    toast(r.limited ? `Only ${r.qty} can be added for this item.` : 'Added to your bag.', { link: { href: '#/cart', label: 'View bag' } });
  }));
  root.querySelectorAll('[data-wishlist]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!ctx.user) {
      toast('Sign in to save favourites.', { link: { href: `#/account/login?next=${encodeURIComponent(location.hash)}`, label: 'Sign in' } });
      return;
    }
    try {
      const r = await ctx.backend.rpc('toggle_wishlist', { product_id: Number(btn.dataset.wishlist) });
      btn.classList.toggle('is-saved', r.saved);
      const label = btn.querySelector('[data-wish-text]');
      if (label) label.textContent = r.saved ? 'Saved to wishlist' : 'Add to wishlist';
      toast(r.saved ? 'Saved to your wishlist.' : 'Removed from your wishlist.', r.saved ? { link: { href: '#/account/wishlist', label: 'View' } } : {});
    } catch (err) { toast(err.message, { error: true }); }
  }));
  root.querySelectorAll('[data-qty]').forEach((box) => {
    const input = box.querySelector('input[type=number]');
    box.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
      const next = Math.min(Number(input.max || 99), Math.max(Number(input.min || 0), (Number(input.value) || 0) + Number(b.dataset.step)));
      if (next === Number(input.value)) return;
      input.value = next;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }));
  });
}

export { ctx, esc, raw };
boot();
