// Komaira Boutique admin panel: sign-in, layout and routing.
import { html, raw, money as fmtMoney, parseHash, esc } from '../core/util.js';
import { getBackend, IS_DEMO } from '../core/backend.js';
import { routes } from './views.js';

const root = document.getElementById('admin');
const ctx = {
  backend: null,
  me: null,
  settings: {},
  money: (v) => fmtMoney(v, ctx.settings.currency_symbol || '₹'),
  navigate: (hash) => { if (location.hash === hash) render(); else location.hash = hash; },
  rerender: () => render(),
  toast,
  flash: (type, text) => sessionStorage.setItem('kb_admin_flash', JSON.stringify({ type, text })),
  isDemo: IS_DEMO,
};

const NAV = [
  ['dashboard', '/', 'Dashboard', 'grid'],
  ['orders', '/orders', 'Orders', 'bag', 'orders'],
  ['products', '/products', 'Products', 'tag'],
  ['categories', '/categories', 'Categories', 'folder'],
  ['banners', '/banners', 'Banners & offers', 'image'],
  ['coupons', '/coupons', 'Coupons', 'ticket'],
  ['customers', '/customers', 'Customers', 'users'],
  ['reviews', '/reviews', 'Reviews', 'star', 'reviews'],
  ['analytics', '/analytics', 'Visitors', 'chart'],
  ['messages', '/messages', 'Messages', 'mail', 'messages'],
  ['subscribers', '/subscribers', 'Subscribers', 'send'],
  ['pages', '/pages', 'Pages', 'file'],
  ['settings', '/settings', 'Settings', 'cog'],
];
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  bag: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4V8Z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .7 3.5 2.8 3.5 6"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  send: '<path d="m3 11 18-8-8 18-2-8-8-2Z"/>',
  file: '<path d="M6 3h8l5 5v13H6V3Z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
};
const svg = (name) => raw(`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`);

/* ---------- Boot & sign-in ---------- */
async function boot() {
  try {
    ctx.backend = await getBackend('admin');
  } catch (err) {
    root.innerHTML = String(html`<div class="login-page"><div class="login-card"><div class="brand brand-center"><span>Komaira</span><small>Admin</small></div><div class="alert alert-error">${err.message}</div></div></div>`);
    return;
  }
  const user = await ctx.backend.auth.user();
  if (!user) return showLogin();
  await enter();
}

async function enter() {
  try {
    ctx.me = await ctx.backend.rpc('admin_me');
  } catch (err) {
    return showLogin(err.message);
  }
  if (!ctx.me.is_admin) {
    const user = await ctx.backend.auth.user();
    await ctx.backend.auth.signOut();
    return showLogin(`${user?.email || 'This account'} is not an admin yet. In Supabase, open SQL Editor and run: select make_admin('${user?.email || 'you@example.com'}');`);
  }
  localStorage.setItem('komaira-is-admin', '1'); // so your own store visits aren't counted as visitors
  ctx.settings = (await ctx.backend.rpc('store_bootstrap')).settings || {};
  root.innerHTML = String(layout());
  bindLayout();
  window.addEventListener('hashchange', render);
  render();
}

function showLogin(error = '') {
  root.innerHTML = String(html`
    <div class="login-page">
      <form class="login-card" data-login>
        <div class="brand brand-center"><span>Komaira</span><small>Admin</small></div>
        ${error ? html`<div class="alert alert-error" role="alert">${error}</div>` : ''}
        <div class="alert alert-error" data-error role="alert" hidden></div>
        <label class="field"><span>Email</span><input type="email" name="email" required autocomplete="username" autofocus></label>
        <label class="field"><span>Password</span><input type="password" name="password" required autocomplete="current-password"></label>
        <button class="btn btn-primary btn-block" type="submit">Sign in</button>
        <a class="back-link" href="../">← Back to store</a>
      </form>
    </div>`);
  root.querySelector('[data-login]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      await ctx.backend.auth.signIn(e.target.email.value.trim(), e.target.password.value);
      await enter();
    } catch (err) {
      const box = root.querySelector('[data-error]');
      box.textContent = err.message;
      box.hidden = false;
      btn.disabled = false;
    }
  });
}

/* ---------- Layout ---------- */
function layout() {
  return html`
    <div class="admin-shell">
      <aside class="sidebar" data-sidebar>
        <a href="#/" class="brand"><span>Komaira</span><small>Admin</small></a>
        <nav aria-label="Admin">
          ${NAV.map(([key, path, label, ic, badge]) => html`<a href="#${path}" data-section="${key}">${svg(ic)}<span>${label}</span>${badge ? html`<em class="nav-badge" data-badge="${badge}" hidden></em>` : ''}</a>`)}
        </nav>
        <div class="sidebar-foot">
          ${IS_DEMO ? html`<a href="#/setup">Go live with Supabase →</a>` : ''}
          <a href="../" target="_blank" rel="noopener">View store ↗</a>
          ${IS_DEMO ? '' : html`<button type="button" class="linklike" data-signout>Sign out</button>`}
        </div>
      </aside>
      <div class="sidebar-backdrop" data-sidebar-close hidden></div>
      <div class="admin-main">
        <header class="topbar">
          <button type="button" class="menu-btn" data-sidebar-open aria-label="Open navigation"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
          <span class="topbar-title" data-title>Admin</span>
          <span class="topbar-user">${ctx.me.name || ''}</span>
        </header>
        <div class="content" id="content"></div>
      </div>
    </div>
    <div class="toast-admin" data-toast role="status" hidden></div>`;
}

function setSidebar(open) {
  root.querySelector('[data-sidebar]').classList.toggle('is-open', open);
  root.querySelector('[data-sidebar-close]').hidden = !open;
}

function bindLayout() {
  root.querySelector('[data-sidebar-open]').addEventListener('click', () => setSidebar(true));
  root.querySelector('[data-sidebar-close]').addEventListener('click', () => setSidebar(false));
  root.querySelector('[data-signout]')?.addEventListener('click', async () => {
    await ctx.backend.auth.signOut();
    localStorage.removeItem('komaira-is-admin');
    location.hash = '';
    location.reload();
  });
}

async function refreshBadges() {
  try {
    const b = await ctx.backend.rpc('admin_badges');
    for (const [k, v] of Object.entries(b)) {
      const el = root.querySelector(`[data-badge="${k}"]`);
      if (el) { el.textContent = v; el.hidden = !v; }
    }
  } catch { /* ignore */ }
}

/* ---------- Routing ---------- */
let seq = 0;
async function render() {
  const mine = ++seq;
  const route = parseHash();
  const content = root.querySelector('#content');
  setSidebar(false);
  content.setAttribute('aria-busy', 'true');
  let page;
  try {
    const r = routes.find((x) => x.match(route));
    page = r ? await r.render(route, ctx) : null;
  } catch (err) {
    console.error(err);
    page = { section: '', title: 'Error', html: html`<div class="card empty"><h2>Something went wrong</h2><p>${err.message}</p><a class="btn" href="#/">Back to dashboard</a></div>` };
  }
  if (mine !== seq) return;
  page ||= { section: '', title: 'Not found', html: html`<div class="card empty"><h2>Not found</h2><p>That page doesn't exist or the item was deleted.</p><a class="btn" href="#/">Back to dashboard</a></div>` };
  root.querySelectorAll('[data-section]').forEach((a) => {
    const on = a.dataset.section === page.section;
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.body.classList.toggle('printing', Boolean(page.print));
  const flash = sessionStorage.getItem('kb_admin_flash');
  sessionStorage.removeItem('kb_admin_flash');
  const f = flash ? JSON.parse(flash) : null;
  content.innerHTML = String(html`
    ${IS_DEMO && !page.print ? html`<div class="demo-note">Demo mode — changes are saved only in this browser. <a href="#/setup">Connect Supabase to go live</a>.</div>` : ''}
    ${f ? html`<div class="alert alert-${f.type}" role="${f.type === 'error' ? 'alert' : 'status'}">${f.text}</div>` : ''}
    ${page.html}`);
  content.removeAttribute('aria-busy');
  root.querySelector('[data-title]').textContent = page.title;
  document.title = `${page.title} · Admin · ${ctx.settings.store_name || 'Komaira Boutique'}`;
  window.scrollTo(0, 0);
  content.querySelectorAll('form[data-confirm], button[data-confirm]').forEach((el) => el.addEventListener(el.tagName === 'FORM' ? 'submit' : 'click', (e) => {
    if (!window.confirm(el.dataset.confirm)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true));
  try { page.after?.(content); } catch (err) { console.error(err); }
  refreshBadges();
}

let toastTimer;
function toast(message, error = false) {
  const el = root.querySelector('[data-toast]');
  el.textContent = message;
  el.classList.toggle('is-error', error);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

export { esc };
boot();
