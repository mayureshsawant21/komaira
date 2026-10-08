// Admin panel screens. Each route returns { section, title, html, after(root), print? }.
import { html, raw, fmtDate, toPaise, fromPaise, formData, hashWith, plural, toLocalInput, fromLocalInput, storeHref } from '../core/util.js';

const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const sel = (cond) => (cond ? raw('selected') : '');
const chk = (cond) => (cond ? raw('checked') : '');
const thumbCell = (url, name) => html`<td class="thumb-cell">${url ? html`<img src="${url}" alt="">` : html`<span class="thumb-ph">${(name || '?').charAt(0)}</span>`}</td>`;
const pill = (status, label = status) => html`<span class="pill pill-${String(status).toLowerCase()}">${label}</span>`;
const storeLink = (path) => `../#${path}`;

/** Wires a form: runs `fn(data)` on submit, shows errors in [data-error] (or a toast), and disables buttons meanwhile. */
function onSubmit(form, ctx, fn) {
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const buttons = form.querySelectorAll('button[type=submit]');
    const errBox = form.querySelector('[data-error]');
    if (errBox) errBox.hidden = true;
    buttons.forEach((b) => { b.disabled = true; });
    try {
      await fn(formData(form), e.submitter);
    } catch (err) {
      if (errBox) { errBox.textContent = err.message; errBox.hidden = false; errBox.scrollIntoView({ block: 'center' }); } else ctx.toast(err.message, true);
    } finally {
      buttons.forEach((b) => { b.disabled = false; });
    }
  });
}

/** Buttons like <button data-act="delete" data-id="3">: runs handler(id, button). */
function onAction(root, name, ctx, fn) {
  root.querySelectorAll(`[data-act="${name}"]`).forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await fn(b.dataset.id, b); } catch (err) { ctx.toast(err.message, true); } finally { b.disabled = false; }
  }));
}

function pager(base, query, page, total, perPage) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return '';
  const link = (n) => hashWith(base, { ...query, page: n === 1 ? '' : n });
  const items = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 2) items.push(html`<a href="${link(i)}" class="${i === page ? 'is-current' : ''}">${i}</a>`);
    else if (Math.abs(i - page) === 3) items.push(html`<span>…</span>`);
  }
  return html`<nav class="pagination admin-pagination" aria-label="Pages">${page > 1 ? html`<a href="${link(page - 1)}">‹</a>` : ''}${items}${page < pages ? html`<a href="${link(page + 1)}">›</a>` : ''}</nav>`;
}

function filterForm(root, base, ctx, keep = {}) {
  const form = root.querySelector('[data-filters]');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    ctx.navigate(hashWith(base, { ...keep, ...formData(form) }));
  });
}

function downloadCsv(filename, rows) {
  const cell = (v) => {
    const s = String(v ?? '');
    return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const csv = `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function whenChartReady(cb) {
  if (window.Chart) return cb();
  let tries = 0;
  const t = setInterval(() => { if (window.Chart || ++tries > 40) { clearInterval(t); if (window.Chart) cb(); } }, 100);
}

function barChart(canvas, labels, values, label, format) {
  if (!canvas || !window.Chart) return;
  const color = getComputedStyle(document.documentElement).getPropertyValue('--series-1').trim() || '#2a78d6';
  // eslint-disable-next-line no-new
  new window.Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ label, data: values, backgroundColor: color, hoverBackgroundColor: color, borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'bottom', maxBarThickness: 22, categoryPercentage: 0.85, barPercentage: 0.9 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { label: (c) => `${label}: ${format ? format(c.parsed.y) : c.parsed.y}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#877b80', maxRotation: 0, autoSkipPadding: 14, font: { size: 11 } } },
        y: { beginAtZero: true, grid: { color: '#f0ecea' }, border: { display: false }, ticks: { color: '#877b80', precision: 0, font: { size: 11 }, callback: (v) => (format ? format(v) : v) } },
      },
    },
  });
}
const shortDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/* =========================================================================
   Dashboard
   ========================================================================= */
async function dashboard(route, ctx) {
  const d = await ctx.backend.rpc('admin_dashboard');
  const conversion = d.visitors_30 ? ((d.sales_30.orders / d.visitors_30) * 100).toFixed(1) : '0.0';
  return {
    section: 'dashboard',
    title: 'Dashboard',
    html: html`
      <div class="page-head">
        <div><h1>Hello${ctx.me.name ? `, ${ctx.me.name.split(' ')[0]}` : ''}</h1><p class="muted">Here's how ${ctx.settings.store_name} is doing.</p></div>
        <div class="actions"><a href="#/products/new" class="btn btn-primary">+ Add product</a><a href="#/banners/new" class="btn">+ New banner</a></div>
      </div>
      <div class="stats">
        <div class="stat"><span class="stat-label">Live now</span><strong class="stat-value"><span class="live-dot" aria-hidden="true"></span>${d.live}</strong><span class="stat-sub">visitors in the last 5 min</span></div>
        <div class="stat"><span class="stat-label">Visitors today</span><strong class="stat-value">${d.visitors_today}</strong><span class="stat-sub">${plural(d.views_today, 'page view')}</span></div>
        <div class="stat"><span class="stat-label">Sales today</span><strong class="stat-value">${ctx.money(d.sales_today.revenue)}</strong><span class="stat-sub">${plural(d.sales_today.orders, 'order')}</span></div>
        <div class="stat"><span class="stat-label">Sales · 30 days</span><strong class="stat-value">${ctx.money(d.sales_30.revenue)}</strong><span class="stat-sub">${plural(d.sales_30.orders, 'order')} · avg ${ctx.money(d.sales_30.orders ? Math.round(d.sales_30.revenue / d.sales_30.orders) : 0)}</span></div>
        <div class="stat"><span class="stat-label">Visitors · 30 days</span><strong class="stat-value">${d.visitors_30}</strong><span class="stat-sub">${conversion}% placed an order</span></div>
      </div>
      <div class="grid-2">
        <section class="card"><div class="card-head"><h2>Visitors per day</h2><a href="#/analytics">Full report →</a></div>
          <div class="chart-box"><canvas id="chart-visitors" role="img" aria-label="Bar chart of unique visitors per day for the last 30 days"></canvas></div></section>
        <section class="card"><div class="card-head"><h2>Sales per day</h2><a href="#/orders">All orders →</a></div>
          <div class="chart-box"><canvas id="chart-sales" role="img" aria-label="Bar chart of sales per day for the last 30 days"></canvas></div></section>
      </div>
      <div class="grid-2">
        <section class="card"><div class="card-head"><h2>Recent orders</h2><a href="#/orders">View all →</a></div>
          ${!d.recent_orders.length ? html`<p class="muted">No orders yet. Once customers check out, they'll appear here.</p>` : html`
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>${d.recent_orders.map((o) => html`<tr>
              <td><a href="#/orders/${o.id}"><strong>${o.order_number}</strong></a><br><small class="muted">${fmtDate(o.created_at, true)}</small></td>
              <td>${o.name}</td>
              <td>${ctx.money(o.total)}<br><small class="muted">${o.payment_method === 'cod' ? 'COD' : 'UPI'} · ${o.payment_status}</small></td>
              <td>${pill(o.status)}</td></tr>`)}</tbody>
          </table></div>`}
        </section>
        <div class="stack">
          <section class="card"><div class="card-head"><h2>Most visited pages · 30 days</h2></div>
            ${!d.top_pages.length ? html`<p class="muted">No visits recorded yet.</p>` : html`<ol class="rank-list">${d.top_pages.map((p) => html`<li><a href="${storeLink(p.path)}" target="_blank" rel="noopener">${p.title || p.path}</a><span>${plural(p.visitors, 'visitor')}</span></li>`)}</ol>`}
          </section>
          <section class="card"><div class="card-head"><h2>Low stock</h2><a href="#/products?stock=low">Manage →</a></div>
            ${!d.low_stock.length ? html`<p class="muted">All products are well stocked.</p>` : html`<ol class="rank-list">${d.low_stock.map((p) => html`<li><a href="#/products/${p.id}">${p.name}</a><span class="${p.available <= 0 ? 'text-danger' : 'text-warn'}">${p.available <= 0 ? 'Out of stock' : `${p.available} left`}</span></li>`)}</ol>`}
          </section>
          <section class="card"><div class="card-head"><h2>Top sellers · 30 days</h2></div>
            ${!d.top_products.length ? html`<p class="muted">No sales yet.</p>` : html`<ol class="rank-list">${d.top_products.map((p) => html`<li><span>${p.name}</span><span>${p.qty} sold · ${ctx.money(p.revenue)}</span></li>`)}</ol>`}
          </section>
        </div>
      </div>
      <p class="muted small">Store totals: ${plural(d.counts.products, 'product')} · ${plural(d.counts.customers, 'registered customer')} · ${plural(d.counts.subscribers, 'newsletter subscriber')}</p>`,
    after: (root) => whenChartReady(() => {
      const labels = d.daily.map((x) => shortDay(x.day));
      barChart(root.querySelector('#chart-visitors'), labels, d.daily.map((x) => x.visitors), 'Visitors');
      const sym = ctx.settings.currency_symbol || '₹';
      barChart(root.querySelector('#chart-sales'), labels, d.daily.map((x) => x.revenue), 'Sales', (v) => sym + Math.round(v / 100).toLocaleString('en-IN'));
    }),
  };
}

/* =========================================================================
   Orders
   ========================================================================= */
async function orders(route, ctx) {
  const q = route.query;
  const page = Math.max(1, Number(q.page) || 1);
  const d = await ctx.backend.rpc('admin_orders', { ...q, page });
  return {
    section: 'orders',
    title: 'Orders',
    html: html`
      <div class="page-head"><div><h1>Orders</h1><p class="muted">${plural(d.total, 'order')}</p></div>
        <div class="actions"><button type="button" class="btn" data-export>Export CSV</button></div></div>
      <div class="tabs">
        <a href="#/orders" class="${!q.status ? 'is-active' : ''}">All</a>
        ${ORDER_STATUSES.map((s) => html`<a href="#/orders?status=${s}" class="${q.status === s ? 'is-active' : ''}">${cap(s)} <em>${d.status_counts[s] || 0}</em></a>`)}
      </div>
      <form class="filters" data-filters>
        <input type="search" name="q" placeholder="Order #, name, email or phone" value="${q.q || ''}">
        <select name="payment"><option value="">Any payment</option>${PAYMENT_STATUSES.map((s) => html`<option value="${s}" ${sel(q.payment === s)}>${s}</option>`)}</select>
        <label class="inline-label">From <input type="date" name="from" value="${q.from || ''}"></label>
        <label class="inline-label">To <input type="date" name="to" value="${q.to || ''}"></label>
        <button class="btn" type="submit">Filter</button>
      </form>
      ${!d.items.length ? html`<div class="card empty"><h2>No orders found</h2><p>Orders appear here as soon as customers check out.</p></div>` : html`
      <div class="card flush"><div class="table-wrap"><table class="table">
        <thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead>
        <tbody>${d.items.map((o) => html`<tr>
          <td><a href="#/orders/${o.id}"><strong>${o.order_number}</strong></a></td>
          <td>${fmtDate(o.created_at, true)}</td>
          <td>${o.name}<br><small class="muted">${o.city}, ${o.state}</small></td>
          <td>${o.item_count}</td>
          <td><strong>${ctx.money(o.total)}</strong></td>
          <td>${o.payment_method === 'cod' ? 'COD' : 'UPI'}<br>${pill(o.payment_status)}${o.payment_ref && o.payment_status !== 'paid' ? html`<br><small class="text-warn">Ref sent</small>` : ''}</td>
          <td>${pill(o.status)}</td></tr>`)}</tbody>
      </table></div></div>
      ${pager('/orders', q, page, d.total, 25)}`}`,
    after: (root) => {
      filterForm(root, '/orders', ctx, { status: q.status });
      root.querySelector('[data-export]').addEventListener('click', async () => {
        const all = await ctx.backend.rpc('admin_orders', { ...q, all: true });
        const rows = [['Order', 'Date', 'Status', 'Payment method', 'Payment status', 'Payment ref', 'Customer', 'Email', 'Phone', 'Address', 'City', 'State', 'PIN',
          'Items', 'Subtotal', 'Discount', 'Shipping', 'Total', 'Coupon', 'Courier', 'Tracking']];
        for (const o of all.items) {
          rows.push([o.order_number, fmtDate(o.created_at, true), o.status, o.payment_method, o.payment_status, o.payment_ref, o.name, o.email, o.phone,
            [o.address_line1, o.address_line2].filter(Boolean).join(', '), o.city, o.state, o.pincode, o.items_text,
            fromPaise(o.subtotal), fromPaise(o.discount), fromPaise(o.shipping), fromPaise(o.total), o.coupon_code, o.courier, o.tracking_number]);
        }
        downloadCsv(`orders-${new Date().toISOString().slice(0, 10)}.csv`, rows);
      });
    },
  };
}

async function orderDetail(route, ctx) {
  const o = await ctx.backend.rpc('admin_order', { id: Number(route.parts[1]) });
  if (!o) return null;
  const wa = String(o.phone || '').replace(/\D/g, '').replace(/^(\d{10})$/, '91$1');
  const statusMsg = encodeURIComponent(`Hi ${o.name.split(' ')[0]}, your ${ctx.settings.store_name} order ${o.order_number} is ${o.status}.${o.tracking_number ? ` Tracking: ${o.courier || ''} ${o.tracking_number}.` : ''} Track it here: ${new URL(`../#/order/${o.order_number}?t=${o.access_token}`, location.href).href}`);
  return {
    section: 'orders',
    title: `Order ${o.order_number}`,
    html: html`
      <div class="page-head">
        <div><a href="#/orders" class="back">← Orders</a><h1>${o.order_number} ${pill(o.status)}</h1><p class="muted">Placed ${fmtDate(o.created_at, true)}</p></div>
        <div class="actions"><a href="#/orders/${o.id}/invoice" class="btn">Invoice / packing slip</a></div>
      </div>
      <div class="form-layout">
        <div class="form-main">
          <section class="card"><h2>Items</h2>
            <div class="table-wrap"><table class="table">
              <thead><tr><th></th><th>Product</th><th>Price</th><th>Qty</th><th>Total</th></tr></thead>
              <tbody>${o.items.map((i) => html`<tr>${thumbCell(i.image, i.name)}
                <td>${i.product_id ? html`<a href="#/products/${i.product_id}">${i.name}</a>` : i.name}${i.variant_name ? html`<br><small class="muted">${i.variant_name}</small>` : ''}${i.sku ? html`<br><small class="muted">SKU ${i.sku}</small>` : ''}</td>
                <td>${ctx.money(i.price)}</td><td>${i.quantity}</td><td>${ctx.money(i.total)}</td></tr>`)}</tbody>
            </table></div>
            <dl class="totals">
              <div><dt>Subtotal</dt><dd>${ctx.money(o.subtotal)}</dd></div>
              ${o.discount ? html`<div><dt>Discount ${o.coupon_code ? `(${o.coupon_code})` : ''}</dt><dd>−${ctx.money(o.discount)}</dd></div>` : ''}
              <div><dt>Shipping</dt><dd>${o.shipping ? ctx.money(o.shipping) : 'Free'}</dd></div>
              <div class="grand"><dt>Total</dt><dd>${ctx.money(o.total)}</dd></div>
            </dl>
          </section>
          <section class="card"><h2>Timeline</h2>
            <ol class="timeline">${o.events.slice().reverse().map((e) => html`<li>${pill(e.status)} ${e.note || ''} <small class="muted">${fmtDate(e.created_at, true)}</small></li>`)}</ol>
          </section>
        </div>
        <aside class="form-side">
          <form class="card" data-update>
            <h2>Update order</h2>
            <div class="form-error" data-error hidden></div>
            <label class="field"><span>Order status</span><select name="status">${ORDER_STATUSES.map((s) => html`<option value="${s}" ${sel(o.status === s)}>${cap(s)}</option>`)}</select><small>Cancelling puts the items back in stock.</small></label>
            <label class="field"><span>Payment status</span><select name="payment_status">${PAYMENT_STATUSES.map((s) => html`<option value="${s}" ${sel(o.payment_status === s)}>${cap(s)}</option>`)}</select>
              ${o.payment_method === 'upi' && o.payment_ref ? html`<small>Customer's UPI ref: <strong>${o.payment_ref}</strong> — check it in your bank/UPI app, then mark Paid.</small>` : ''}</label>
            <div class="field-row">
              <label class="field"><span>Courier</span><input name="courier" value="${o.courier || ''}" placeholder="Delhivery, Blue Dart…"></label>
              <label class="field"><span>Tracking no.</span><input name="tracking_number" value="${o.tracking_number || ''}"></label>
            </div>
            <label class="field"><span>Note for timeline (optional)</span><input name="note" maxlength="300"></label>
            <label class="field"><span>Private notes</span><textarea name="admin_notes" rows="2">${o.admin_notes || ''}</textarea></label>
            <button class="btn btn-primary btn-block" type="submit">Save changes</button>
            ${wa.length >= 12 ? html`<a class="btn btn-block mt" href="https://wa.me/${wa}?text=${raw(statusMsg)}" target="_blank" rel="noopener">Send status on WhatsApp</a>` : ''}
          </form>
          <section class="card">
            <h2>Customer</h2>
            <p><strong>${o.name}</strong><br><a href="mailto:${o.email}">${o.email}</a><br><a href="tel:${o.phone}">${o.phone}</a></p>
            ${o.customer_id ? html`<p><a href="#/customers/${o.customer_id}">View customer profile</a> · ${plural(o.customer_orders, 'order')}</p>` : html`<p class="muted small">Guest checkout</p>`}
            <h2>Shipping address</h2>
            <address>${o.address_line1}<br>${o.address_line2 ? html`${o.address_line2}<br>` : ''}${o.city}, ${o.state} ${o.pincode}<br>${o.country}</address>
            ${o.notes ? html`<h2>Customer note</h2><p>${o.notes}</p>` : ''}
            <h2>Payment</h2><p>${o.payment_method === 'cod' ? 'Cash on Delivery' : 'UPI'}${o.payment_ref ? html`<br><small class="muted">Ref: ${o.payment_ref}</small>` : ''}</p>
          </section>
        </aside>
      </div>`,
    after: (root) => onSubmit(root.querySelector('[data-update]'), ctx, async (f) => {
      await ctx.backend.rpc('admin_update_order', { id: o.id, ...f });
      ctx.flash('success', f.status !== o.status ? `Order marked as ${f.status}.` : 'Order updated.');
      ctx.rerender();
    }),
  };
}

async function invoice(route, ctx) {
  const o = await ctx.backend.rpc('admin_order', { id: Number(route.parts[1]) });
  if (!o) return null;
  const s = ctx.settings;
  return {
    section: 'orders',
    title: `Invoice ${o.order_number}`,
    print: true,
    html: html`
      <div class="no-print" style="display:flex;gap:8px;margin-bottom:16px"><a href="#/orders/${o.id}" class="btn">← Back to order</a><button class="btn btn-primary" type="button" data-print>Print</button></div>
      <div class="invoice-sheet">
        <header class="invoice-head">
          <div><div class="brand"><span>${s.store_name}</span></div><p class="muted">${s.address}<br>${s.contact_email} ${s.contact_phone ? `· ${s.contact_phone}` : ''}</p></div>
          <div class="right"><h1>Invoice</h1><p><strong>${o.order_number}</strong><br>${fmtDate(o.created_at)}</p></div>
        </header>
        <div class="invoice-parties">
          <div><h3>Ship to</h3><p><strong>${o.name}</strong><br>${o.address_line1}<br>${o.address_line2 ? html`${o.address_line2}<br>` : ''}${o.city}, ${o.state} ${o.pincode}<br>${o.phone}</p></div>
          <div><h3>Payment</h3><p>${o.payment_method === 'cod' ? 'Cash on Delivery' : 'UPI'}<br>Status: ${o.payment_status}</p></div>
        </div>
        <table class="table">
          <thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
          <tbody>${o.items.map((i) => html`<tr><td>${i.name}${i.variant_name ? ` — ${i.variant_name}` : ''}</td><td>${i.sku || ''}</td><td>${i.quantity}</td><td>${ctx.money(i.price)}</td><td>${ctx.money(i.total)}</td></tr>`)}</tbody>
        </table>
        <dl class="totals invoice-totals">
          <div><dt>Subtotal</dt><dd>${ctx.money(o.subtotal)}</dd></div>
          ${o.discount ? html`<div><dt>Discount</dt><dd>−${ctx.money(o.discount)}</dd></div>` : ''}
          <div><dt>Shipping</dt><dd>${o.shipping ? ctx.money(o.shipping) : 'Free'}</dd></div>
          <div class="grand"><dt>Total</dt><dd>${ctx.money(o.total)}</dd></div>
        </dl>
        <p class="muted small">Prices are inclusive of all taxes. Thank you for shopping with ${s.store_name}!</p>
      </div>`,
    after: (root) => root.querySelector('[data-print]').addEventListener('click', () => window.print()),
  };
}

/* =========================================================================
   Products
   ========================================================================= */
function categoryOptions(cats) {
  const out = [];
  const seen = new Set();
  const walk = (parent, depth) => {
    for (const c of cats.filter((x) => (x.parent_id || null) === parent)) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({ ...c, depth, label: `${'— '.repeat(depth)}${c.name}` });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  for (const c of cats) if (!seen.has(c.id)) out.push({ ...c, depth: 0, label: c.name });
  return out;
}

async function products(route, ctx) {
  const q = route.query;
  const page = Math.max(1, Number(q.page) || 1);
  const [d, cats] = await Promise.all([ctx.backend.rpc('admin_products', { ...q, page }), ctx.backend.rpc('admin_categories')]);
  const options = categoryOptions(cats);
  return {
    section: 'products',
    title: 'Products',
    html: html`
      <div class="page-head"><div><h1>Products</h1><p class="muted">${plural(d.total, 'product')}</p></div>
        <div class="actions"><a href="#/products/new" class="btn btn-primary">+ Add product</a></div></div>
      <form class="filters" data-filters>
        <input type="search" name="q" placeholder="Search name, SKU or brand" value="${q.q || ''}">
        <select name="category"><option value="">All categories</option>${options.map((c) => html`<option value="${c.id}" ${sel(String(q.category) === String(c.id))}>${c.label}</option>`)}</select>
        <select name="status"><option value="">Any status</option><option value="active" ${sel(q.status === 'active')}>Active</option><option value="draft" ${sel(q.status === 'draft')}>Draft</option></select>
        <select name="stock"><option value="">Any stock</option><option value="low" ${sel(q.stock === 'low')}>Low stock</option><option value="out" ${sel(q.stock === 'out')}>Out of stock</option></select>
        <button class="btn" type="submit">Filter</button>
        ${Object.keys(q).length ? html`<a href="#/products" class="muted">Clear</a>` : ''}
      </form>
      ${!d.items.length ? html`<div class="card empty"><h2>No products ${Object.keys(q).length ? 'match these filters' : 'yet'}</h2><p>Start by creating a category, then add your first product with photos, price and stock.</p><a href="#/products/new" class="btn btn-primary">+ Add product</a></div>` : html`
      <div class="card flush"><div class="table-wrap"><table class="table">
        <thead><tr><th></th><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Views (30d)</th><th>Sold</th><th>Status</th><th></th></tr></thead>
        <tbody>${d.items.map((p) => html`<tr>
          ${thumbCell(p.image, p.name)}
          <td><a href="#/products/${p.id}"><strong>${p.name}</strong></a><br><small class="muted">${[p.brand, p.sku].filter(Boolean).join(' · ')}</small></td>
          <td>${p.category_name || '—'}</td>
          <td>${ctx.money(p.price)}${p.compare_at_price ? html`<br><s class="muted small">${ctx.money(p.compare_at_price)}</s>` : ''}</td>
          <td>${p.variant_count > 0
            ? html`<span class="${p.available <= 0 ? 'text-danger' : p.available <= p.low_stock_threshold ? 'text-warn' : ''}">${p.available}</span><br><small class="muted">${p.variant_count} ${(p.variant_label || 'variant').toLowerCase()}s</small>`
            : html`<form class="inline-stock" data-stock="${p.id}"><input type="number" name="stock" value="${p.stock}" min="0" aria-label="Stock for ${p.name}" class="${p.stock <= 0 ? 'is-danger' : p.stock <= p.low_stock_threshold ? 'is-warn' : ''}"><button type="submit" class="btn btn-xs">Save</button></form>`}</td>
          <td>${p.views_30d}</td><td>${p.sold}</td>
          <td>${pill(p.status)}${p.is_featured ? html` <span class="pill">Featured</span>` : ''}</td>
          <td class="row-actions"><a href="${storeLink(`/product/${p.slug}`)}" target="_blank" rel="noopener">View</a><a href="#/products/${p.id}">Edit</a></td></tr>`)}</tbody>
      </table></div></div>
      ${pager('/products', q, page, d.total, 25)}`}`,
    after: (root) => {
      filterForm(root, '/products', ctx);
      root.querySelectorAll('[data-stock]').forEach((f) => onSubmit(f, ctx, async (v) => {
        await ctx.backend.rpc('admin_set_stock', { id: Number(f.dataset.stock), stock: Number(v.stock) || 0 });
        ctx.toast('Stock updated.');
      }));
    },
  };
}

function variantRow(v = {}) {
  return html`<div class="variant-row">
    <input type="hidden" data-v="id" value="${v.id || ''}">
    <input data-v="name" value="${v.name || ''}" placeholder="e.g. Rose Nude" aria-label="Variant name">
    <span class="swatch-input"><input type="color" data-v="color" value="${v.color || '#d8a7a0'}" aria-label="Swatch colour" ${v.color ? '' : raw('disabled')}><label class="check"><input type="checkbox" data-v="no-swatch" ${chk(!v.color)}> none</label></span>
    <input data-v="price" inputmode="decimal" value="${fromPaise(v.price)}" placeholder="Same" aria-label="Variant price">
    <input type="number" data-v="stock" min="0" value="${v.stock ?? 0}" aria-label="Variant stock">
    <input data-v="sku" value="${v.sku || ''}" aria-label="Variant SKU">
    <button type="button" class="icon-x" data-remove-variant aria-label="Remove variant">×</button>
  </div>`;
}

function imageManager(root, ctx, images, folder, { single = false } = {}) {
  const box = root.querySelector('[data-images]');
  const input = root.querySelector('[data-image-input]');
  const draw = () => {
    box.innerHTML = String(html`${images.map((img, i) => html`
      <div class="image-tile${img.uploading ? ' is-uploading' : ''}">
        ${img.url ? html`<img src="${img.url}" alt="">` : html`<div class="thumb-ph" style="width:100%;aspect-ratio:1">…</div>`}
        ${img.uploading ? html`<span class="muted">Uploading…</span>` : html`
          ${!single && i === 0 ? html`<span class="main-tag">Main photo</span>` : ''}
          ${single ? '' : html`<label class="mini-field">Alt text <input data-alt="${i}" value="${img.alt || ''}"></label>`}
          <div class="tile-actions">
            ${single ? '' : html`<button type="button" data-move="${i}" data-dir="-1" ${i === 0 ? raw('disabled') : ''} aria-label="Move left">←</button><button type="button" data-move="${i}" data-dir="1" ${i === images.length - 1 ? raw('disabled') : ''} aria-label="Move right">→</button>`}
            <button type="button" data-remove-img="${i}">Remove</button>
          </div>`}
      </div>`)}`);
    box.querySelectorAll('[data-alt]').forEach((el) => el.addEventListener('input', () => { images[Number(el.dataset.alt)].alt = el.value; }));
    box.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.move);
      const j = i + Number(b.dataset.dir);
      [images[i], images[j]] = [images[j], images[i]];
      draw();
    }));
    box.querySelectorAll('[data-remove-img]').forEach((b) => b.addEventListener('click', () => { images.splice(Number(b.dataset.removeImg), 1); draw(); }));
  };
  const zone = input.closest('.dropzone');
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, () => zone.classList.add('is-over')));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, () => zone.classList.remove('is-over')));
  input.addEventListener('change', async () => {
    const files = Array.from(input.files);
    input.value = '';
    if (single) images.splice(0, images.length);
    for (const file of single ? files.slice(0, 1) : files) {
      const slot = { url: '', alt: '', uploading: true };
      images.push(slot);
      draw();
      try {
        slot.url = await ctx.backend.upload(file, folder);
        slot.uploading = false;
      } catch (err) {
        images.splice(images.indexOf(slot), 1);
        ctx.toast(err.message, true);
      }
      draw();
    }
  });
  draw();
  return { busy: () => images.some((i) => i.uploading) };
}

async function productForm(route, ctx) {
  const isNew = route.parts[1] === 'new';
  const [p, cats] = await Promise.all([
    isNew ? Promise.resolve({ status: 'active', stock: 0, low_stock_threshold: 5, images: [], variants: [], category_id: route.query.category || null }) : ctx.backend.rpc('admin_product', { id: Number(route.parts[1]) }),
    ctx.backend.rpc('admin_categories'),
  ]);
  if (!p) return null;
  const options = categoryOptions(cats);
  const images = p.images.map((i) => ({ url: i.url, alt: i.alt || '' }));
  return {
    section: 'products',
    title: isNew ? 'Add product' : p.name,
    html: html`
      <div class="page-head">
        <div><a href="#/products" class="back">← Products</a><h1>${isNew ? 'Add product' : p.name}</h1>
          ${p.stats ? html`<p class="muted">${plural(p.stats.views, 'view')} from ${plural(p.stats.visitors, 'visitor')} in the last 30 days</p>` : ''}</div>
        ${isNew ? '' : html`<div class="actions"><a href="${storeLink(`/product/${p.slug}`)}" target="_blank" rel="noopener" class="btn">View in store ↗</a><button class="btn" type="button" data-duplicate>Duplicate</button></div>`}
      </div>
      <form class="form-layout" data-product novalidate>
        <div class="form-main">
          <div class="form-error" data-error hidden></div>
          <section class="card"><h2>Basic details</h2>
            <label class="field"><span>Product name *</span><input name="name" required maxlength="200" value="${p.name || ''}" placeholder="e.g. Velvet Matte Lipstick"></label>
            <div class="field-row">
              <label class="field"><span>Brand</span><input name="brand" value="${p.brand || ''}" placeholder="e.g. Komaira"></label>
              <label class="field"><span>Size / quantity</span><input name="size" value="${p.size || ''}" placeholder="e.g. 30 ml, 4.2 g"></label>
            </div>
            <label class="field"><span>Short description</span><textarea name="short_description" rows="2" maxlength="500" placeholder="One or two lines shown near the price">${p.short_description || ''}</textarea></label>
            <label class="field"><span>Full description</span><textarea name="description" rows="7" placeholder="Benefits, texture, finish… Use a blank line for a new paragraph, '- ' for bullet points and **bold**.">${p.description || ''}</textarea></label>
            <div class="field-row">
              <label class="field"><span>How to use</span><textarea name="how_to_use" rows="4">${p.how_to_use || ''}</textarea></label>
              <label class="field"><span>Ingredients</span><textarea name="ingredients" rows="4">${p.ingredients || ''}</textarea></label>
            </div>
            <label class="field"><span>Suitable for (skin type / concern)</span><input name="skin_type" value="${p.skin_type || ''}" placeholder="e.g. All skin types, dry skin, sensitive skin"></label>
          </section>
          <section class="card"><h2>Images</h2>
            <p class="hint">The first image is the main photo. JPG, PNG or WebP — photos are resized automatically. Square or 4:5 portrait photos look best.</p>
            <div class="image-grid" data-images></div>
            <label class="dropzone"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple data-image-input><span><strong>Click to upload</strong> or drag photos here</span></label>
          </section>
          <section class="card"><h2>Pricing</h2>
            <div class="field-row three">
              <label class="field"><span>Selling price (${ctx.settings.currency_symbol}) *</span><input name="price" inputmode="decimal" required value="${fromPaise(p.price)}" placeholder="599"></label>
              <label class="field"><span>MRP / compare-at price</span><input name="compare_at_price" inputmode="decimal" value="${fromPaise(p.compare_at_price)}" placeholder="799"><small>Shown crossed out to highlight a discount</small></label>
              <label class="field"><span>SKU</span><input name="sku" value="${p.sku || ''}" placeholder="KB-LIP-001"></label>
            </div>
          </section>
          <section class="card"><h2>Inventory & variants</h2>
            <div class="field-row three">
              <label class="field"><span>Stock quantity</span><input type="number" name="stock" min="0" value="${p.stock || 0}"><small>Used when the product has no shades/sizes</small></label>
              <label class="field"><span>Low-stock alert at</span><input type="number" name="low_stock_threshold" min="0" value="${p.low_stock_threshold ?? 5}"></label>
              <label class="field"><span>Variant type</span><input name="variant_label" value="${p.variant_label || ''}" placeholder="Shade, Size, Fragrance…" list="variant-labels"></label>
            </div>
            <datalist id="variant-labels"><option>Shade</option><option>Size</option><option>Colour</option><option>Fragrance</option><option>Pack</option></datalist>
            <p class="hint">Selling multiple shades or sizes? Add each one below with its own stock. Leave price blank to use the main price.</p>
            <div class="variants" data-variants>
              <div class="variant-row variant-head" aria-hidden="true"><span>Name</span><span>Swatch</span><span>Price</span><span>Stock</span><span>SKU</span><span></span></div>
              ${p.variants.map((v) => variantRow(v))}
            </div>
            <button type="button" class="btn" data-add-variant>+ Add shade / size</button>
          </section>
          <section class="card"><h2>Search engine listing</h2>
            <label class="field"><span>URL handle</span><div class="prefix-input"><span>#/product/</span><input name="slug" value="${p.slug || ''}" placeholder="auto-generated from name"></div></label>
            <label class="field"><span>Page title</span><input name="meta_title" maxlength="120" value="${p.meta_title || ''}" placeholder="Defaults to product name"></label>
            <label class="field"><span>Meta description</span><textarea name="meta_description" rows="2" maxlength="300" placeholder="Defaults to short description">${p.meta_description || ''}</textarea></label>
          </section>
        </div>
        <aside class="form-side">
          <section class="card"><h2>Status</h2>
            <select name="status" class="full"><option value="active" ${sel(p.status === 'active')}>Active — visible in store</option><option value="draft" ${sel(p.status === 'draft')}>Draft — hidden</option></select>
            <label class="check big"><input type="checkbox" name="is_featured" ${chk(p.is_featured)}> Feature on homepage (Bestsellers)</label>
          </section>
          <section class="card"><h2>Organisation</h2>
            <label class="field"><span>Category</span><select name="category_id"><option value="">— Uncategorised —</option>${options.map((c) => html`<option value="${c.id}" ${sel(String(p.category_id) === String(c.id))}>${c.label}</option>`)}</select></label>
            <a href="#/categories/new" class="small">+ Create a new category</a>
            <label class="field mt"><span>Badge</span><input name="badge" maxlength="30" value="${p.badge || ''}" placeholder="New, Bestseller, Vegan…"></label>
            <label class="field"><span>Tags</span><input name="tags" value="${p.tags || ''}" placeholder="matte, long-lasting, vegan"><small>Comma separated — helps search</small></label>
          </section>
          <div class="sticky-actions">
            <button type="submit" class="btn btn-primary btn-block">Save product</button>
            ${isNew ? html`<button type="submit" name="after" value="new" class="btn btn-block">Save & add another</button>` : ''}
          </div>
        </aside>
      </form>
      ${isNew ? '' : html`<div class="danger-zone"><button type="button" class="btn btn-danger" data-delete data-confirm="Delete “${p.name}” permanently? This cannot be undone.">Delete product</button></div>`}`,
    after: (root) => {
      const images0 = images;
      const imgs = imageManager(root, ctx, images0, 'products');
      const variants = root.querySelector('[data-variants]');
      const wire = (row) => {
        const color = row.querySelector('[data-v=color]');
        const none = row.querySelector('[data-v=no-swatch]');
        none.addEventListener('change', () => { color.disabled = none.checked; });
        row.querySelector('[data-remove-variant]').addEventListener('click', () => row.remove());
      };
      variants.querySelectorAll('.variant-row:not(.variant-head)').forEach(wire);
      root.querySelector('[data-add-variant]').addEventListener('click', () => {
        variants.insertAdjacentHTML('beforeend', String(variantRow()));
        const row = variants.lastElementChild;
        wire(row);
        row.querySelector('[data-v=name]').focus();
      });
      onSubmit(root.querySelector('[data-product]'), ctx, async (f, submitter) => {
        if (imgs.busy()) throw new Error('Please wait for the images to finish uploading.');
        const vs = [...variants.querySelectorAll('.variant-row:not(.variant-head)')].map((row) => {
          const g = (k) => row.querySelector(`[data-v="${k}"]`);
          return { id: g('id').value || null, name: g('name').value.trim(), sku: g('sku').value.trim(), price: toPaise(g('price').value),
            stock: Number(g('stock').value) || 0, color: g('no-swatch').checked ? null : g('color').value };
        }).filter((v) => v.name);
        const price = toPaise(f.price);
        if (!f.name.trim()) throw new Error('Product name is required.');
        if (price === null) throw new Error('Selling price is required.');
        const res = await ctx.backend.rpc('admin_save_product', {
          ...f, id: isNew ? null : p.id, price, compare_at_price: toPaise(f.compare_at_price),
          stock: Number(f.stock) || 0, low_stock_threshold: Number(f.low_stock_threshold) || 0,
          variants: vs, images: images0.filter((i) => i.url).map((i) => ({ url: i.url, alt: i.alt })),
        });
        ctx.backend.removeFiles(res.removed_images);
        ctx.flash('success', isNew ? `“${f.name}” has been added.` : 'Product saved.');
        ctx.navigate(submitter?.value === 'new' ? '#/products/new' : `#/products/${res.id}`);
      });
      root.querySelector('[data-duplicate]')?.addEventListener('click', async () => {
        const r = await ctx.backend.rpc('admin_duplicate_product', { id: p.id });
        ctx.flash('success', 'Product duplicated as a draft. Edit it and set it to Active when ready.');
        ctx.navigate(`#/products/${r.id}`);
      });
      root.querySelector('[data-delete]')?.addEventListener('click', async () => {
        const r = await ctx.backend.rpc('admin_delete_product', { id: p.id });
        ctx.backend.removeFiles(r.removed_images);
        ctx.flash('success', 'Product deleted.');
        ctx.navigate('#/products');
      });
    },
  };
}

/* =========================================================================
   Categories
   ========================================================================= */
async function categories(route, ctx) {
  const list = categoryOptions(await ctx.backend.rpc('admin_categories'));
  return {
    section: 'categories',
    title: 'Categories',
    html: html`
      <div class="page-head"><div><h1>Categories</h1><p class="muted">Group your products so customers can browse easily. Categories can have sub-categories.</p></div>
        <div class="actions"><a href="#/categories/new" class="btn btn-primary">+ New category</a></div></div>
      ${!list.length ? html`<div class="card empty"><h2>No categories yet</h2><p>Create categories like Skincare, Makeup, Lips or Fragrance.</p><a href="#/categories/new" class="btn btn-primary">+ New category</a></div>` : html`
      <div class="card flush"><div class="table-wrap"><table class="table">
        <thead><tr><th></th><th>Name</th><th>Products</th><th>Views (30d)</th><th>Order</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.map((c) => html`<tr>
          ${thumbCell(c.image, c.name)}
          <td style="padding-left: ${12 + c.depth * 22}px">${c.depth ? html`<span class="muted">↳ </span>` : ''}<a href="#/categories/${c.id}"><strong>${c.name}</strong></a><br><small class="muted">#/category/${c.slug}</small></td>
          <td><a href="#/products?category=${c.id}">${c.product_count}</a></td><td>${c.views_30d}</td><td>${c.sort_order}</td>
          <td>${pill(c.is_active ? 'active' : 'draft', c.is_active ? 'Visible' : 'Hidden')}${c.show_on_home && !c.parent_id ? html` <span class="pill">Homepage</span>` : ''}</td>
          <td class="row-actions"><a href="#/products/new?category=${c.id}">+ Product</a><a href="#/categories/${c.id}">Edit</a></td></tr>`)}</tbody>
      </table></div></div>`}`,
  };
}

async function categoryForm(route, ctx) {
  const isNew = route.parts[1] === 'new';
  const all = await ctx.backend.rpc('admin_categories');
  const c = isNew ? { is_active: true, show_on_home: true, sort_order: 0 } : all.find((x) => String(x.id) === route.parts[1]);
  if (!c) return null;
  const parents = categoryOptions(all).filter((x) => x.id !== c.id);
  const images = c.image ? [{ url: c.image }] : [];
  return {
    section: 'categories',
    title: isNew ? 'New category' : c.name,
    html: html`
      <div class="page-head"><div><a href="#/categories" class="back">← Categories</a><h1>${isNew ? 'New category' : c.name}</h1></div></div>
      <form class="form-layout" data-category novalidate>
        <div class="form-main">
          <div class="form-error" data-error hidden></div>
          <section class="card">
            <label class="field"><span>Category name *</span><input name="name" required maxlength="100" value="${c.name || ''}" placeholder="e.g. Skincare"></label>
            <label class="field"><span>Description</span><textarea name="description" rows="3" placeholder="Shown at the top of the category page">${c.description || ''}</textarea></label>
            <label class="field"><span>Parent category</span><select name="parent_id"><option value="">— None (top level) —</option>${parents.map((pc) => html`<option value="${pc.id}" ${sel(String(c.parent_id) === String(pc.id))}>${pc.label}</option>`)}</select><small>Optional — e.g. put “Lipstick” inside “Makeup”.</small></label>
            <label class="field"><span>URL handle</span><div class="prefix-input"><span>#/category/</span><input name="slug" value="${c.slug || ''}" placeholder="auto-generated"></div></label>
          </section>
          <section class="card"><h2>Image</h2>
            <p class="hint">Shown in the round “Shop by category” tiles on the homepage. A square photo works best.</p>
            <div class="image-grid" data-images></div>
            <label class="dropzone"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" data-image-input><span><strong>Click to upload</strong> a category image</span></label>
          </section>
        </div>
        <aside class="form-side">
          <section class="card"><h2>Visibility</h2>
            <label class="check big"><input type="checkbox" name="is_active" ${chk(c.is_active)}> Visible in store</label>
            <label class="check big"><input type="checkbox" name="show_on_home" ${chk(c.show_on_home)}> Show on homepage</label>
            <label class="field mt"><span>Sort order</span><input type="number" name="sort_order" value="${c.sort_order || 0}"><small>Lower numbers appear first in the menu</small></label>
          </section>
          <div class="sticky-actions">
            <button type="submit" class="btn btn-primary btn-block">Save category</button>
            ${isNew ? html`<button type="submit" name="after" value="product" class="btn btn-block">Save & add a product</button>` : ''}
          </div>
        </aside>
      </form>
      ${isNew ? '' : html`<div class="danger-zone"><button type="button" class="btn btn-danger" data-delete data-confirm="Delete the “${c.name}” category? Its products will be kept but become uncategorised.">Delete category</button></div>`}`,
    after: (root) => {
      const imgs = imageManager(root, ctx, images, 'categories', { single: true });
      onSubmit(root.querySelector('[data-category]'), ctx, async (f, submitter) => {
        if (imgs.busy()) throw new Error('Please wait for the image to finish uploading.');
        const r = await ctx.backend.rpc('admin_save_category', { ...f, id: isNew ? null : c.id, image: images[0]?.url || null, sort_order: Number(f.sort_order) || 0 });
        if (r.removed_image) ctx.backend.removeFiles([r.removed_image]);
        ctx.flash('success', isNew ? `Category “${f.name}” created.` : 'Category saved.');
        ctx.navigate(submitter?.value === 'product' ? `#/products/new?category=${r.id}` : '#/categories');
      });
      root.querySelector('[data-delete]')?.addEventListener('click', async () => {
        const r = await ctx.backend.rpc('admin_delete_category', { id: c.id });
        if (r.removed_image) ctx.backend.removeFiles([r.removed_image]);
        ctx.flash('success', `Category “${c.name}” deleted. Its products were kept.`);
        ctx.navigate('#/categories');
      });
    },
  };
}

/* =========================================================================
   Banners & announcement
   ========================================================================= */
function bannerPreview(b, large = false) {
  return html`<div class="banner-preview${large ? ' banner-preview-lg' : ''} text-${b.text_theme || 'dark'} align-${b.align || 'left'}" style="--slide-bg: ${/^#[0-9a-f]{6}$/i.test(b.bg_color || '') ? b.bg_color : '#f3e6e1'}" ${large ? raw('data-banner-preview') : ''}>
    <img src="${b.image || ''}" alt="" data-bp-img ${b.image ? '' : raw('hidden')}>
    <div class="banner-preview-text">
      <small data-bp="eyebrow">${b.eyebrow || ''}</small>
      <strong data-bp="title">${b.title || 'Your headline'}</strong>
      ${large ? html`<span data-bp="subtitle">${b.subtitle || ''}</span>` : ''}
      <span class="mini-cta" data-bp="cta_text" ${b.cta_text ? '' : raw('hidden')}>${b.cta_text || ''}</span>
    </div>
    ${large ? html`<span class="preview-label">Live preview</span>` : ''}
  </div>`;
}

async function banners(route, ctx) {
  const [list, settings] = [await ctx.backend.rpc('admin_banners'), (await ctx.backend.rpc('admin_settings')).settings];
  return {
    section: 'banners',
    title: 'Banners & offers',
    html: html`
      <div class="page-head"><div><h1>Banners & offers</h1><p class="muted">The homepage slider and the announcement bar at the very top of every page.</p></div>
        <div class="actions"><a href="#/banners/new" class="btn btn-primary">+ New slide</a></div></div>
      <section class="card"><h2>Announcement bar</h2>
        <form data-announcement>
          <label class="check big"><input type="checkbox" name="announcement_active" ${chk(settings.announcement_active === '1')}> Show announcement bar</label>
          <label class="field mt"><span>Messages</span><textarea name="announcement_text" rows="3" placeholder="One message per line — they rotate automatically">${settings.announcement_text}</textarea><small>One message per line. Multiple lines rotate every few seconds.</small></label>
          <div class="field-row">
            <label class="field"><span>Link (optional)</span><input name="announcement_link" value="${settings.announcement_link}" placeholder="#/shop?sale=1"></label>
            <label class="field"><span>Slider autoplay (seconds)</span><input type="number" name="banner_autoplay_seconds" min="0" max="30" value="${settings.banner_autoplay_seconds}"><small>0 turns autoplay off</small></label>
          </div>
          <button class="btn btn-primary" type="submit">Save announcement</button>
        </form>
      </section>
      <h2 class="section-h">Homepage slides</h2>
      ${!list.length ? html`<div class="card empty"><h2>No slides yet</h2><p>Create a slide to announce an offer, a new launch or a festive sale — with a button that links anywhere in your store.</p><a href="#/banners/new" class="btn btn-primary">+ New slide</a></div>` : html`
      <div class="banner-list">${list.map((b, i) => html`
        <article class="banner-item card">
          ${bannerPreview(b)}
          <div class="banner-meta">
            <div>${pill(b.state)}
              ${b.starts_at || b.ends_at ? html`<small class="muted">${b.starts_at ? `From ${fmtDate(b.starts_at, true)}` : ''} ${b.ends_at ? `until ${fmtDate(b.ends_at, true)}` : ''}</small>` : ''}
              ${b.cta_link ? html`<small class="muted">→ ${b.cta_link}</small>` : ''}</div>
            <div class="row-actions">
              <button class="btn btn-xs" data-act="up" data-id="${b.id}" ${i === 0 ? raw('disabled') : ''} aria-label="Move up">↑</button>
              <button class="btn btn-xs" data-act="down" data-id="${b.id}" ${i === list.length - 1 ? raw('disabled') : ''} aria-label="Move down">↓</button>
              <button class="btn btn-xs" data-act="toggle" data-id="${b.id}">${b.is_active ? 'Hide' : 'Show'}</button>
              <a href="#/banners/${b.id}" class="btn btn-xs">Edit</a>
              <button class="btn btn-xs btn-danger-text" data-act="delete" data-id="${b.id}" data-confirm="Delete this slide?">Delete</button>
            </div>
          </div>
        </article>`)}</div>`}`,
    after: (root) => {
      onSubmit(root.querySelector('[data-announcement]'), ctx, async (f) => {
        await ctx.backend.rpc('admin_save_settings', { values: { ...f, announcement_active: f.announcement_active ? '1' : '0', banner_autoplay_seconds: String(Math.min(30, Math.max(0, Number(f.banner_autoplay_seconds) || 0))) } });
        ctx.toast('Announcement bar updated.');
      });
      for (const action of ['up', 'down', 'toggle', 'delete']) {
        onAction(root, action, ctx, async (id) => {
          const r = await ctx.backend.rpc('admin_banner_action', { id: Number(id), action });
          if (r?.removed_images) ctx.backend.removeFiles(r.removed_images);
          ctx.rerender();
        });
      }
    },
  };
}

async function bannerForm(route, ctx) {
  const isNew = route.parts[1] === 'new';
  const b = isNew ? { is_active: true, text_theme: 'dark', align: 'left', bg_color: '#f3e6e1' } : (await ctx.backend.rpc('admin_banners')).find((x) => String(x.id) === route.parts[1]);
  if (!b) return null;
  const desktop = b.image ? [{ url: b.image }] : [];
  const mobile = b.mobile_image ? [{ url: b.mobile_image }] : [];
  return {
    section: 'banners',
    title: isNew ? 'New banner slide' : 'Edit banner slide',
    html: html`
      <div class="page-head"><div><a href="#/banners" class="back">← Banners</a><h1>${isNew ? 'New banner slide' : 'Edit banner slide'}</h1></div></div>
      ${bannerPreview(b, true)}
      <form class="form-layout" data-banner novalidate>
        <div class="form-main">
          <div class="form-error" data-error hidden></div>
          <section class="card"><h2>Text</h2>
            <label class="field"><span>Small text above headline</span><input name="eyebrow" maxlength="80" value="${b.eyebrow || ''}" placeholder="e.g. Diwali sale · Limited time"></label>
            <label class="field"><span>Headline *</span><input name="title" required maxlength="140" value="${b.title || ''}" placeholder="e.g. Flat 30% off all lipsticks"></label>
            <label class="field"><span>Supporting text</span><textarea name="subtitle" rows="2" maxlength="300" placeholder="e.g. Use code GLOW30 at checkout. Ends Sunday.">${b.subtitle || ''}</textarea></label>
            <div class="field-row">
              <label class="field"><span>Button text</span><input name="cta_text" maxlength="40" value="${b.cta_text || ''}" placeholder="Shop now"></label>
              <label class="field"><span>Button link</span><input name="cta_link" value="${b.cta_link || ''}" placeholder="#/category/makeup or #/shop?sale=1"><small>A store page (like <code>#/category/lips</code>) or a full https:// link</small></label>
            </div>
          </section>
          <section class="card"><h2>Images</h2>
            <p class="hint">Desktop: a wide image around 1920 × 800 px. Mobile (optional): a tall image around 800 × 1000 px. Without an image, the background colour is used with a soft glow.</p>
            <div class="field-row">
              <div data-desktop><strong class="small">Desktop image</strong><div class="image-grid" data-images></div>
                <label class="dropzone"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" data-image-input><span><strong>Upload</strong> desktop image</span></label></div>
              <div data-mobile><strong class="small">Mobile image (optional)</strong><div class="image-grid" data-images></div>
                <label class="dropzone"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" data-image-input><span><strong>Upload</strong> mobile image</span></label></div>
            </div>
          </section>
        </div>
        <aside class="form-side">
          <section class="card"><h2>Look</h2>
            <label class="field"><span>Background colour</span><input type="color" name="bg_color" value="${b.bg_color || '#f3e6e1'}"></label>
            <label class="field"><span>Text colour</span><select name="text_theme"><option value="dark" ${sel(b.text_theme === 'dark')}>Dark text (for light images)</option><option value="light" ${sel(b.text_theme === 'light')}>White text (for dark images)</option></select></label>
            <label class="field"><span>Text position</span><select name="align">${['left', 'center', 'right'].map((a) => html`<option value="${a}" ${sel(b.align === a)}>${cap(a)}</option>`)}</select></label>
          </section>
          <section class="card"><h2>Schedule</h2>
            <label class="check big"><input type="checkbox" name="is_active" ${chk(b.is_active)}> Active</label>
            <label class="field mt"><span>Start showing (optional)</span><input type="datetime-local" name="starts_at" value="${toLocalInput(b.starts_at)}"></label>
            <label class="field"><span>Stop showing (optional)</span><input type="datetime-local" name="ends_at" value="${toLocalInput(b.ends_at)}"><small>Great for time-limited offers. Times are India time (IST).</small></label>
          </section>
          <div class="sticky-actions"><button type="submit" class="btn btn-primary btn-block">Save slide</button></div>
        </aside>
      </form>`,
    after: (root) => {
      const d = imageManager(root.querySelector('[data-desktop]'), ctx, desktop, 'banners', { single: true });
      const m = imageManager(root.querySelector('[data-mobile]'), ctx, mobile, 'banners', { single: true });
      const form = root.querySelector('[data-banner]');
      const preview = root.querySelector('[data-banner-preview]');
      const update = () => {
        const f = form.elements;
        preview.querySelector('[data-bp=eyebrow]').textContent = f.eyebrow.value;
        preview.querySelector('[data-bp=title]').textContent = f.title.value || 'Your headline';
        preview.querySelector('[data-bp=subtitle]').textContent = f.subtitle.value;
        const cta = preview.querySelector('[data-bp=cta_text]');
        cta.textContent = f.cta_text.value;
        cta.hidden = !f.cta_text.value;
        preview.style.setProperty('--slide-bg', f.bg_color.value);
        preview.className = `banner-preview banner-preview-lg text-${f.text_theme.value} align-${f.align.value}`;
        const img = preview.querySelector('[data-bp-img]');
        img.hidden = !desktop[0]?.url;
        if (desktop[0]?.url) img.src = desktop[0].url;
      };
      form.addEventListener('input', update);
      form.addEventListener('change', () => setTimeout(update, 50));
      new MutationObserver(update).observe(root.querySelector('[data-desktop] [data-images]'), { childList: true, subtree: true });
      onSubmit(form, ctx, async (f) => {
        if (d.busy() || m.busy()) throw new Error('Please wait for the images to finish uploading.');
        const r = await ctx.backend.rpc('admin_save_banner', {
          ...f, id: isNew ? null : b.id, image: desktop[0]?.url || null, mobile_image: mobile[0]?.url || null,
          starts_at: fromLocalInput(f.starts_at), ends_at: fromLocalInput(f.ends_at), cta_link: f.cta_link ? storeHref(f.cta_link) : '',
        });
        ctx.backend.removeFiles(r.removed_images);
        ctx.flash('success', isNew ? 'Banner slide added to the homepage.' : 'Banner saved.');
        ctx.navigate('#/banners');
      });
    },
  };
}

/* =========================================================================
   Coupons
   ========================================================================= */
async function coupons(route, ctx) {
  const list = await ctx.backend.rpc('admin_coupons');
  return {
    section: 'coupons',
    title: 'Coupons',
    html: html`
      <div class="page-head"><div><h1>Coupons</h1><p class="muted">Discount codes customers can enter in their bag or at checkout.</p></div>
        <div class="actions"><a href="#/coupons/new" class="btn btn-primary">+ New coupon</a></div></div>
      ${!list.length ? html`<div class="card empty"><h2>No coupons yet</h2><p>Create codes like WELCOME10 (10% off) or FLAT100 (₹100 off orders above ₹999).</p><a href="#/coupons/new" class="btn btn-primary">+ New coupon</a></div>` : html`
      <div class="card flush"><div class="table-wrap"><table class="table">
        <thead><tr><th>Code</th><th>Discount</th><th>Min. order</th><th>Used</th><th>Valid</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.map((c) => html`<tr>
          <td><strong class="code">${c.code}</strong>${c.description ? html`<br><small class="muted">${c.description}</small>` : ''}</td>
          <td>${c.type === 'percent' ? `${c.value}% off` : `${ctx.money(c.value)} off`}</td>
          <td>${c.min_order ? ctx.money(c.min_order) : '—'}</td>
          <td>${c.used_count}${c.max_uses != null ? ` / ${c.max_uses}` : ''}</td>
          <td><small>${c.starts_at || 'Now'} → ${c.ends_at || 'No end'}</small></td>
          <td>${pill(c.is_active ? 'active' : 'draft', c.is_active ? 'Active' : 'Off')}</td>
          <td class="row-actions"><a href="#/coupons/${c.id}">Edit</a><button class="linklike danger" data-act="delete" data-id="${c.id}" data-confirm="Delete coupon ${c.code}?">Delete</button></td></tr>`)}</tbody>
      </table></div></div>`}`,
    after: (root) => onAction(root, 'delete', ctx, async (id) => { await ctx.backend.rpc('admin_delete_coupon', { id: Number(id) }); ctx.rerender(); }),
  };
}

async function couponForm(route, ctx) {
  const isNew = route.parts[1] === 'new';
  const c = isNew ? { type: 'percent', is_active: true, min_order: 0 } : (await ctx.backend.rpc('admin_coupons')).find((x) => String(x.id) === route.parts[1]);
  if (!c) return null;
  return {
    section: 'coupons',
    title: isNew ? 'New coupon' : c.code,
    html: html`
      <div class="page-head"><div><a href="#/coupons" class="back">← Coupons</a><h1>${isNew ? 'New coupon' : c.code}</h1></div></div>
      <form class="card narrow" data-coupon novalidate>
        <div class="form-error" data-error hidden></div>
        <div class="field-row">
          <label class="field"><span>Code *</span><input name="code" required maxlength="30" value="${c.code || ''}" placeholder="WELCOME10" class="code-input"></label>
          <label class="field"><span>Internal description</span><input name="description" value="${c.description || ''}" placeholder="First order offer"></label>
        </div>
        <div class="field-row three">
          <label class="field"><span>Type</span><select name="type"><option value="percent" ${sel(c.type === 'percent')}>Percentage off</option><option value="fixed" ${sel(c.type === 'fixed')}>Fixed amount off</option></select></label>
          <label class="field"><span>Value *</span><input name="value" inputmode="decimal" required value="${c.value ? (c.type === 'fixed' ? fromPaise(c.value) : c.value) : ''}" placeholder="10"><small>% or ${ctx.settings.currency_symbol} depending on type</small></label>
          <label class="field"><span>Minimum order (${ctx.settings.currency_symbol})</span><input name="min_order" inputmode="decimal" value="${c.min_order ? fromPaise(c.min_order) : ''}" placeholder="0"></label>
        </div>
        <div class="field-row three">
          <label class="field"><span>Usage limit</span><input type="number" name="max_uses" min="0" value="${c.max_uses ?? ''}" placeholder="Unlimited"></label>
          <label class="field"><span>Starts</span><input type="date" name="starts_at" value="${c.starts_at || ''}"></label>
          <label class="field"><span>Ends</span><input type="date" name="ends_at" value="${c.ends_at || ''}"></label>
        </div>
        <label class="check big"><input type="checkbox" name="is_active" ${chk(c.is_active)}> Active</label>
        <button type="submit" class="btn btn-primary mt">Save coupon</button>
      </form>`,
    after: (root) => onSubmit(root.querySelector('[data-coupon]'), ctx, async (f) => {
      const value = f.type === 'fixed' ? toPaise(f.value) : Math.round(Number(f.value) || 0);
      await ctx.backend.rpc('admin_save_coupon', { ...f, id: isNew ? null : c.id, value, min_order: toPaise(f.min_order) || 0 });
      ctx.flash('success', isNew ? 'Coupon created.' : 'Coupon saved.');
      ctx.navigate('#/coupons');
    }),
  };
}

/* =========================================================================
   Customers
   ========================================================================= */
async function customers(route, ctx) {
  const q = route.query;
  const page = Math.max(1, Number(q.page) || 1);
  const d = await ctx.backend.rpc('admin_customers', { ...q, page });
  return {
    section: 'customers',
    title: 'Customers',
    html: html`
      <div class="page-head"><div><h1>Customers</h1><p class="muted">${d.total} registered · ${plural(d.guests, 'guest checkout email')}</p></div></div>
      <form class="filters" data-filters><input type="search" name="q" placeholder="Name, email or phone" value="${q.q || ''}"><button class="btn" type="submit">Search</button></form>
      ${!d.items.length ? html`<div class="card empty"><h2>No customers yet</h2><p>Customers who create an account appear here.</p></div>` : html`
      <div class="card flush"><div class="table-wrap"><table class="table">
        <thead><tr><th>Name</th><th>Contact</th><th>Orders</th><th>Total spent</th><th>Last order</th><th>Joined</th></tr></thead>
        <tbody>${d.items.map((c) => html`<tr>
          <td><a href="#/customers/${c.id}"><strong>${c.name || '(no name)'}</strong></a></td>
          <td>${c.email}<br><small class="muted">${c.phone || ''}</small></td>
          <td>${c.order_count}</td><td>${ctx.money(c.spent)}</td>
          <td>${c.last_order ? fmtDate(c.last_order) : '—'}</td><td>${fmtDate(c.created_at)}</td></tr>`)}</tbody>
      </table></div></div>
      ${pager('/customers', q, page, d.total, 30)}`}`,
    after: (root) => filterForm(root, '/customers', ctx),
  };
}

async function customerDetail(route, ctx) {
  const c = await ctx.backend.rpc('admin_customer', { id: route.parts[1] });
  if (!c) return null;
  return {
    section: 'customers',
    title: c.name || c.email,
    html: html`
      <div class="page-head"><div><a href="#/customers" class="back">← Customers</a><h1>${c.name || c.email}</h1><p class="muted">Customer since ${fmtDate(c.created_at)}</p></div></div>
      <div class="form-layout">
        <div class="form-main"><section class="card"><h2>Orders</h2>
          ${!c.orders.length ? html`<p class="muted">No orders yet.</p>` : html`<div class="table-wrap"><table class="table">
            <thead><tr><th>Order</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>${c.orders.map((o) => html`<tr><td><a href="#/orders/${o.id}">${o.order_number}</a></td><td>${fmtDate(o.created_at)}</td><td>${ctx.money(o.total)}</td><td>${pill(o.status)}</td></tr>`)}</tbody>
          </table></div>`}
        </section></div>
        <aside class="form-side"><section class="card">
          <h2>Contact</h2><p><a href="mailto:${c.email}">${c.email}</a><br>${c.phone || ''}</p>
          ${c.address_line1 ? html`<h2>Address</h2><address>${c.address_line1}<br>${c.address_line2 ? html`${c.address_line2}<br>` : ''}${c.city}, ${c.state} ${c.pincode}</address>` : ''}
          ${c.wishlist.length ? html`<h2>Wishlist</h2><ul class="plain">${c.wishlist.map((w) => html`<li><a href="#/products/${w.id}">${w.name}</a></li>`)}</ul>` : ''}
        </section></aside>
      </div>`,
  };
}

/* =========================================================================
   Reviews, messages, subscribers
   ========================================================================= */
async function reviews(route, ctx) {
  const d = await ctx.backend.rpc('admin_reviews', { status: route.query.status });
  return {
    section: 'reviews',
    title: 'Reviews',
    html: html`
      <div class="page-head"><div><h1>Reviews</h1><p class="muted">New reviews wait here for your approval before appearing in the store.</p></div></div>
      <div class="tabs">${['pending', 'approved', 'rejected'].map((s) => html`<a href="#/reviews?status=${s}" class="${d.status === s ? 'is-active' : ''}">${cap(s)} <em>${d.counts[s] || 0}</em></a>`)}</div>
      ${!d.items.length ? html`<div class="card empty"><p>No ${d.status} reviews.</p></div>` : html`
      <div class="review-admin-list">${d.items.map((r) => html`
        <article class="card review-admin">
          <div>
            <div class="stars-text" aria-label="${r.rating} out of 5">${'★'.repeat(r.rating)}<span>${'★'.repeat(5 - r.rating)}</span></div>
            ${r.title ? html`<strong>${r.title}</strong>` : ''}<p>${r.body}</p>
            <small class="muted">${r.name} · ${fmtDate(r.created_at, true)} · on <a href="${storeLink(`/product/${r.product_slug}`)}" target="_blank" rel="noopener">${r.product_name}</a></small>
          </div>
          <div class="row-actions">
            ${d.status !== 'approved' ? html`<button class="btn btn-xs btn-primary" data-act="approve" data-id="${r.id}">Approve</button>` : ''}
            ${d.status !== 'rejected' ? html`<button class="btn btn-xs" data-act="reject" data-id="${r.id}">Reject</button>` : ''}
            <button class="btn btn-xs btn-danger-text" data-act="delete" data-id="${r.id}" data-confirm="Delete this review permanently?">Delete</button>
          </div>
        </article>`)}</div>`}`,
    after: (root) => ['approve', 'reject', 'delete'].forEach((action) => onAction(root, action, ctx, async (id) => {
      await ctx.backend.rpc('admin_review_action', { id: Number(id), action });
      ctx.rerender();
    })),
  };
}

async function messages(route, ctx) {
  const list = await ctx.backend.rpc('admin_messages');
  const reply = (m) => `mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject || 'Your message'}`)}`;
  return {
    section: 'messages',
    title: 'Messages',
    html: html`
      <div class="page-head"><div><h1>Messages</h1><p class="muted">Sent through the Contact page.</p></div></div>
      ${!list.length ? html`<div class="card empty"><p>No messages yet.</p></div>` : html`
      <div class="review-admin-list">${list.map((m) => html`
        <article class="card review-admin ${m.is_read ? 'is-read' : 'is-unread'}">
          <div><strong>${m.subject || 'Message'}</strong> ${m.is_read ? '' : pill('pending', 'New')}
            <p class="pre">${m.body}</p>
            <small class="muted">${m.name} · <a href="${reply(m)}">${m.email}</a>${m.phone ? ` · ${m.phone}` : ''} · ${fmtDate(m.created_at, true)}</small></div>
          <div class="row-actions">
            <a class="btn btn-xs btn-primary" href="${reply(m)}">Reply</a>
            <button class="btn btn-xs" data-act="toggle_read" data-id="${m.id}">${m.is_read ? 'Mark unread' : 'Mark read'}</button>
            <button class="btn btn-xs btn-danger-text" data-act="delete" data-id="${m.id}" data-confirm="Delete this message?">Delete</button>
          </div>
        </article>`)}</div>`}`,
    after: (root) => ['toggle_read', 'delete'].forEach((action) => onAction(root, action, ctx, async (id) => {
      await ctx.backend.rpc('admin_message_action', { id: Number(id), action });
      ctx.rerender();
    })),
  };
}

async function subscribers(route, ctx) {
  const list = await ctx.backend.rpc('admin_subscribers');
  return {
    section: 'subscribers',
    title: 'Subscribers',
    html: html`
      <div class="page-head"><div><h1>Newsletter subscribers</h1><p class="muted">${plural(list.length, 'subscriber')} from the footer sign-up form.</p></div>
        <div class="actions"><button type="button" class="btn" data-export ${list.length ? '' : raw('disabled')}>Export CSV</button></div></div>
      ${!list.length ? html`<div class="card empty"><p>No subscribers yet.</p></div>` : html`
      <div class="card flush"><div class="table-wrap"><table class="table">
        <thead><tr><th>Email</th><th>Subscribed</th><th></th></tr></thead>
        <tbody>${list.map((s) => html`<tr><td>${s.email}</td><td>${fmtDate(s.created_at)}</td><td class="row-actions"><button class="linklike danger" data-act="delete" data-id="${s.id}" data-confirm="Remove ${s.email}?">Remove</button></td></tr>`)}</tbody>
      </table></div></div>`}`,
    after: (root) => {
      root.querySelector('[data-export]').addEventListener('click', () => downloadCsv('subscribers.csv', [['email', 'subscribed_on'], ...list.map((s) => [s.email, fmtDate(s.created_at)])]));
      onAction(root, 'delete', ctx, async (id) => { await ctx.backend.rpc('admin_delete_subscriber', { id: Number(id) }); ctx.rerender(); });
    },
  };
}

/* =========================================================================
   Pages
   ========================================================================= */
async function pages(route, ctx) {
  const list = await ctx.backend.rpc('admin_pages');
  return {
    section: 'pages',
    title: 'Pages',
    html: html`
      <div class="page-head"><div><h1>Pages</h1><p class="muted">Information pages linked in your store's footer.</p></div>
        <div class="actions"><a href="#/pages/new" class="btn btn-primary">+ New page</a></div></div>
      <div class="card flush"><div class="table-wrap"><table class="table">
        <thead><tr><th>Title</th><th>Address</th><th>Status</th><th>Updated</th><th></th></tr></thead>
        <tbody>${list.map((p) => html`<tr>
          <td><a href="#/pages/${p.id}"><strong>${p.title}</strong></a></td>
          <td><a href="${storeLink(`/pages/${p.slug}`)}" target="_blank" rel="noopener">#/pages/${p.slug}</a></td>
          <td>${pill(p.is_active ? 'active' : 'draft', p.is_active ? 'Published' : 'Hidden')}</td><td>${fmtDate(p.updated_at)}</td>
          <td class="row-actions"><a href="#/pages/${p.id}">Edit</a></td></tr>`)}</tbody>
      </table></div></div>`,
  };
}

async function pageForm(route, ctx) {
  const isNew = route.parts[1] === 'new';
  const p = isNew ? { is_active: true, show_in_footer: true } : (await ctx.backend.rpc('admin_pages')).find((x) => String(x.id) === route.parts[1]);
  if (!p) return null;
  return {
    section: 'pages',
    title: isNew ? 'New page' : p.title,
    html: html`
      <div class="page-head"><div><a href="#/pages" class="back">← Pages</a><h1>${isNew ? 'New page' : p.title}</h1></div></div>
      <form class="card narrow" data-page novalidate>
        <div class="form-error" data-error hidden></div>
        <label class="field"><span>Title *</span><input name="title" required value="${p.title || ''}"></label>
        ${isNew ? html`<label class="field"><span>URL handle</span><div class="prefix-input"><span>#/pages/</span><input name="slug" placeholder="auto-generated"></div></label>` : ''}
        <label class="field"><span>Content</span><textarea name="content" rows="16">${p.content || ''}</textarea>
          <small>Leave a blank line between paragraphs. Start a line with “## ” for a heading, “- ” for a bullet point, and wrap words in **double stars** for bold.</small></label>
        <label class="check big"><input type="checkbox" name="is_active" ${chk(p.is_active)}> Published</label>
        <label class="check big"><input type="checkbox" name="show_in_footer" ${chk(p.show_in_footer)}> Link in footer</label>
        <div class="mt"><button class="btn btn-primary" type="submit">Save page</button></div>
      </form>
      ${isNew ? '' : html`<div class="danger-zone"><button class="btn btn-danger" type="button" data-delete data-confirm="Delete this page?">Delete page</button></div>`}`,
    after: (root) => {
      onSubmit(root.querySelector('[data-page]'), ctx, async (f) => {
        await ctx.backend.rpc('admin_save_page', { ...f, id: isNew ? null : p.id });
        ctx.flash('success', isNew ? 'Page created.' : 'Page saved.');
        ctx.navigate('#/pages');
      });
      root.querySelector('[data-delete]')?.addEventListener('click', async () => {
        await ctx.backend.rpc('admin_delete_page', { id: p.id });
        ctx.flash('success', 'Page deleted.');
        ctx.navigate('#/pages');
      });
    },
  };
}

/* =========================================================================
   Visitors & analytics
   ========================================================================= */
const RANGES = { 1: 'Today', 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days', 365: 'Last 12 months' };
const TYPE_LABELS = { home: 'Home', product: 'Product', category: 'Category', shop: 'Shop', search: 'Search', cart: 'Bag', checkout: 'Checkout', page: 'Page', contact: 'Contact', account: 'Account', order: 'Order', wishlist: 'Wishlist', 'track-order': 'Tracking' };

function hbars(rows, labelKey) {
  if (!rows.length) return html`<p class="muted">No data yet.</p>`;
  const max = Math.max(1, ...rows.map((r) => r.visitors));
  return html`<ul class="hbar-list">${rows.map((r) => html`<li><span class="hbar-label">${r[labelKey]}</span><span class="hbar"><span style="width: ${Math.round((r.visitors / max) * 100)}%"></span></span><span class="hbar-val">${r.visitors}</span></li>`)}</ul>`;
}

async function analytics(route, ctx) {
  const days = RANGES[route.query.days] ? Number(route.query.days) : 30;
  const a = await ctx.backend.rpc('admin_analytics', { days });
  const t = a.totals;
  const maxV = Math.max(1, ...a.pages.map((p) => p.visitors));
  return {
    section: 'analytics',
    title: 'Visitors & analytics',
    html: html`
      <div class="page-head">
        <div><h1>Visitors & analytics</h1><p class="muted">Every storefront page view is counted. Your own visits (on a browser where you've signed in to admin) are not.</p></div>
        <div class="tabs tabs-compact">${Object.entries(RANGES).map(([d, l]) => html`<a href="#/analytics?days=${d}" class="${Number(d) === days ? 'is-active' : ''}">${l}</a>`)}</div>
      </div>
      <div class="stats">
        <div class="stat"><span class="stat-label">Live now</span><strong class="stat-value"><span class="live-dot" aria-hidden="true"></span>${a.live}</strong><span class="stat-sub">last 5 minutes</span></div>
        <div class="stat"><span class="stat-label">Unique visitors</span><strong class="stat-value">${t.visitors}</strong><span class="stat-sub">${t.new_visitors} first-time</span></div>
        <div class="stat"><span class="stat-label">Page views</span><strong class="stat-value">${t.views}</strong><span class="stat-sub">${t.visitors ? (t.views / t.visitors).toFixed(1) : '0'} pages per visitor</span></div>
        <div class="stat"><span class="stat-label">Returning visitors</span><strong class="stat-value">${Math.max(0, t.visitors - t.new_visitors)}</strong><span class="stat-sub">came back again</span></div>
      </div>
      ${days > 1 ? html`<section class="card"><div class="card-head"><h2>Unique visitors per day</h2>
          <details class="table-toggle"><summary>Show as table</summary><div class="table-wrap"><table class="table compact"><thead><tr><th>Day</th><th>Visitors</th><th>Page views</th></tr></thead>
            <tbody>${a.daily.slice().reverse().map((d) => html`<tr><td>${d.day}</td><td>${d.visitors}</td><td>${d.views}</td></tr>`)}</tbody></table></div></details></div>
        <div class="chart-box"><canvas id="chart-traffic" role="img" aria-label="Bar chart of unique visitors per day"></canvas></div></section>` : ''}
      <section class="card flush">
        <div class="card-head padded"><h2>Visitors by page</h2><span class="muted small">${plural(a.pages.length, 'page')} visited</span></div>
        ${!a.pages.length ? html`<p class="muted padded">No visits recorded in this period yet. Share your store link to get your first visitors!</p>` : html`
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Page</th><th>Type</th><th class="num">Unique visitors</th><th class="num">Page views</th><th>Last visit</th></tr></thead>
          <tbody>${a.pages.map((p) => html`<tr>
            <td><a href="${storeLink(p.path)}" target="_blank" rel="noopener"><strong>${p.title || p.path}</strong></a><br><small class="muted">${p.path}</small></td>
            <td><span class="pill">${TYPE_LABELS[p.page_type] || p.page_type}</span></td>
            <td class="num"><span class="bar-cell"><span class="bar" style="width: ${Math.round((p.visitors / maxV) * 100)}%"></span><span>${p.visitors}</span></span></td>
            <td class="num">${p.views}</td><td><small>${fmtDate(p.last_seen, true)}</small></td></tr>`)}</tbody>
        </table></div>`}
      </section>
      <div class="grid-2">
        <section class="card"><h2>Most viewed products</h2>
          ${!a.products.length ? html`<p class="muted">No product views yet.</p>` : html`<ol class="rank-list">${a.products.map((p) => html`<li><a href="#/products/${p.id}">${p.name}</a><span>${plural(p.visitors, 'visitor')} · ${plural(p.views, 'view')}</span></li>`)}</ol>`}</section>
        <section class="card"><h2>Most viewed categories</h2>
          ${!a.categories.length ? html`<p class="muted">No category views yet.</p>` : html`<ol class="rank-list">${a.categories.map((c) => html`<li><a href="${storeLink(`/category/${c.slug}`)}" target="_blank" rel="noopener">${c.name}</a><span>${plural(c.visitors, 'visitor')} · ${plural(c.views, 'view')}</span></li>`)}</ol>`}</section>
      </div>
      <div class="grid-3">
        <section class="card"><h2>Where visitors come from</h2>${hbars(a.referrers, 'source')}</section>
        <section class="card"><h2>Devices</h2>${hbars(a.devices, 'label')}</section>
        <section class="card"><h2>Browsers</h2>${hbars(a.browsers, 'label')}</section>
      </div>
      <section class="card"><h2>Latest activity</h2>
        ${!a.recent.length ? html`<p class="muted">Nothing yet.</p>` : html`<div class="table-wrap"><table class="table compact">
          <thead><tr><th>When</th><th>Page</th><th>Visitor</th><th>Device</th><th>From</th></tr></thead>
          <tbody>${a.recent.map((v) => html`<tr><td><small>${fmtDate(v.created_at, true)}</small></td><td><a href="${storeLink(v.path)}" target="_blank" rel="noopener">${v.title || v.path}</a></td>
            <td><small class="muted">#${v.visitor_id.slice(0, 6)}${v.is_new ? ' · new' : ''}</small></td><td><small>${v.device} · ${v.browser}</small></td><td><small>${v.referrer || '—'}</small></td></tr>`)}</tbody>
        </table></div>`}
      </section>`,
    after: (root) => whenChartReady(() => barChart(root.querySelector('#chart-traffic'), a.daily.map((x) => shortDay(x.day)), a.daily.map((x) => x.visitors), 'Unique visitors')),
  };
}

/* =========================================================================
   Settings & setup guide
   ========================================================================= */
async function settings(route, ctx) {
  const { settings: s, admins } = await ctx.backend.rpc('admin_settings');
  return {
    section: 'settings',
    title: 'Settings',
    html: html`
      <div class="page-head"><div><h1>Settings</h1><p class="muted">Store details, shipping, payments and team access.</p></div></div>
      <form class="form-layout" data-settings>
        <div class="form-main">
          <div class="form-error" data-error hidden></div>
          <section class="card"><h2>Store details</h2>
            <div class="field-row">
              <label class="field"><span>Store name</span><input name="store_name" value="${s.store_name}"></label>
              <label class="field"><span>Tagline</span><input name="tagline" value="${s.tagline}"></label>
            </div>
            <label class="field"><span>Search engine description</span><textarea name="meta_description" rows="2">${s.meta_description}</textarea><small>Shown by Google under your store name.</small></label>
          </section>
          <section class="card"><h2>Contact & social</h2>
            <div class="field-row">
              <label class="field"><span>Contact email</span><input name="contact_email" type="email" value="${s.contact_email}"></label>
              <label class="field"><span>Phone</span><input name="contact_phone" value="${s.contact_phone}"></label>
            </div>
            <div class="field-row">
              <label class="field"><span>WhatsApp number</span><input name="whatsapp" value="${s.whatsapp}" placeholder="91XXXXXXXXXX"></label>
              <label class="field"><span>Address</span><input name="address" value="${s.address}"></label>
            </div>
            <div class="field-row three">
              <label class="field"><span>Instagram URL</span><input name="instagram" value="${s.instagram}" placeholder="https://instagram.com/…"></label>
              <label class="field"><span>Facebook URL</span><input name="facebook" value="${s.facebook}"></label>
              <label class="field"><span>YouTube URL</span><input name="youtube" value="${s.youtube}"></label>
            </div>
          </section>
          <section class="card"><h2>Homepage</h2>
            <div class="field-row">
              <label class="field"><span>Featured section title</span><input name="home_featured_title" value="${s.home_featured_title}"></label>
              <label class="field"><span>New arrivals title</span><input name="home_new_title" value="${s.home_new_title}"></label>
            </div>
            <p class="hint">The four promises shown under the banner:</p>
            <div class="field-row">${[1, 2, 3, 4].map((n) => html`<label class="field"><span>Promise ${n}</span><input name="promise_${n}" value="${s[`promise_${n}`]}"></label>`)}</div>
          </section>
        </div>
        <aside class="form-side">
          <section class="card"><h2>Shipping</h2>
            <label class="field"><span>Shipping fee (${s.currency_symbol})</span><input name="shipping_fee" inputmode="decimal" value="${fromPaise(s.shipping_fee)}"></label>
            <label class="field"><span>Free shipping above (${s.currency_symbol})</span><input name="free_shipping_threshold" inputmode="decimal" value="${fromPaise(s.free_shipping_threshold)}"><small>0 = never free</small></label>
          </section>
          <section class="card"><h2>Payments</h2>
            <label class="field"><span>Your UPI ID</span><input name="upi_id" value="${s.upi_id}" placeholder="yourname@okhdfcbank"><small>Customers pay to this UPI ID. Leave blank to turn UPI off.</small></label>
            <label class="field"><span>Name shown in UPI apps</span><input name="upi_name" value="${s.upi_name}"></label>
            <label class="check big"><input type="checkbox" name="cod_enabled" ${chk(s.cod_enabled === '1')}> Allow Cash on Delivery</label>
            <label class="field mt"><span>COD fee (${s.currency_symbol})</span><input name="cod_fee" inputmode="decimal" value="${fromPaise(s.cod_fee)}"></label>
            <label class="field"><span>Order number prefix</span><input name="order_prefix" value="${s.order_prefix}" maxlength="6"></label>
          </section>
          <div class="sticky-actions"><button class="btn btn-primary btn-block" type="submit">Save settings</button></div>
        </aside>
      </form>
      <div class="grid-2 mt-lg">
        ${ctx.isDemo ? html`<section class="card"><h2>Demo data</h2><p class="muted">Start the demo over with the original sample products. (Only affects this browser.)</p><button class="btn btn-danger" type="button" data-reset-demo data-confirm="Erase all demo changes in this browser?">Reset demo store</button></section>` : html`
        <form class="card" data-password><h2>Change your password</h2>
          <label class="field"><span>New password</span><input type="password" name="password" required minlength="10" autocomplete="new-password"><small>At least 10 characters</small></label>
          <button class="btn" type="submit">Update password</button>
        </form>`}
        <section class="card"><h2>Admin team</h2>
          <ul class="plain team-list">${admins.map((a) => html`<li><span><strong>${a.name}</strong><br><small class="muted">${a.email}</small></span>
            ${a.is_me ? html`<small class="muted">You</small>` : html`<button class="linklike danger" data-act="remove-admin" data-id="${a.user_id}" data-confirm="Remove ${a.name}'s admin access?">Remove</button>`}</li>`)}</ul>
          <form class="mt" data-add-admin>
            <p class="hint">The person must first create an account on your store (Account → Create account), then add their email here.</p>
            <div class="field-row">
              <label class="field"><span>Name</span><input name="name" required></label>
              <label class="field"><span>Email</span><input name="email" type="email" required></label>
            </div>
            <button class="btn" type="submit">+ Add admin</button>
          </form>
        </section>
      </div>`,
    after: (root) => {
      onSubmit(root.querySelector('[data-settings]'), ctx, async (f) => {
        const values = { ...f, cod_enabled: f.cod_enabled ? '1' : '0' };
        for (const k of ['shipping_fee', 'free_shipping_threshold', 'cod_fee']) values[k] = String(toPaise(f[k]) || 0);
        await ctx.backend.rpc('admin_save_settings', { values });
        ctx.settings = (await ctx.backend.rpc('store_bootstrap')).settings;
        ctx.flash('success', 'Settings saved.');
        ctx.rerender();
      });
      onSubmit(root.querySelector('[data-password]'), ctx, async (f) => {
        if (f.password.length < 10) throw new Error('Please use at least 10 characters.');
        await ctx.backend.auth.updatePassword(f.password);
        ctx.toast('Your password has been changed.');
      });
      onSubmit(root.querySelector('[data-add-admin]'), ctx, async (f) => {
        await ctx.backend.rpc('admin_add_admin', f);
        ctx.flash('success', `${f.name} can now sign in to the admin panel.`);
        ctx.rerender();
      });
      onAction(root, 'remove-admin', ctx, async (id) => { await ctx.backend.rpc('admin_remove_admin', { user_id: id }); ctx.rerender(); });
      root.querySelector('[data-reset-demo]')?.addEventListener('click', async () => {
        await ctx.backend.resetDemo();
        location.reload();
      });
    },
  };
}

async function setup(route, ctx) {
  return {
    section: '',
    title: 'Go live',
    html: html`
      <div class="page-head"><div><h1>Take your store live</h1><p class="muted">${ctx.isDemo ? 'Your store is in demo mode. Follow these steps once (about 10 minutes) to save real products and orders.' : 'Your store is connected to Supabase. These steps are here for reference.'}</p></div></div>
      <section class="card narrow">
        <ol class="setup-steps">
          <li><strong>Create a free Supabase project.</strong> Sign up at <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a> → New project. Pick the <em>Mumbai (ap-south-1)</em> region for India.</li>
          <li><strong>Create the database.</strong> In Supabase open <em>SQL Editor</em> → New query, paste the contents of <code>supabase/schema.sql</code> from your GitHub repository and click <em>Run</em>. Optional: run <code>supabase/seed.sql</code> the same way for the sample products.</li>
          <li><strong>Create your admin login.</strong> Go to <em>Authentication → Users → Add user</em>, enter your email and a strong password and tick <em>Auto Confirm User</em>. Then in SQL Editor run:<br><code>select make_admin('you@example.com', 'Your Name');</code></li>
          <li><strong>Set your site address.</strong> In <em>Authentication → URL Configuration</em> set Site URL to <code>https://mayureshsawant21.github.io/komaira/</code> (used in sign-up and password emails).</li>
          <li><strong>Connect the website.</strong> In <em>Project Settings → API</em> copy the Project URL and the <em>anon public</em> key. On GitHub open <code>assets/js/config.js</code>, click the pencil (edit), paste both values and commit. The site redeploys in a minute or two.</li>
          <li><strong>Sign in</strong> at <code>/komaira/admin</code> with the email and password from step 3, then add your categories, products and banners, and set your UPI ID under Settings.</li>
        </ol>
      </section>`,
  };
}

/* ---------- Route table ---------- */
const is = (r, a, n) => r.parts[0] === a && r.parts.length === n;
export const routes = [
  { match: (r) => r.path === '/', render: dashboard },
  { match: (r) => is(r, 'orders', 1), render: orders },
  { match: (r) => is(r, 'orders', 3) && r.parts[2] === 'invoice', render: invoice },
  { match: (r) => is(r, 'orders', 2), render: orderDetail },
  { match: (r) => is(r, 'products', 1), render: products },
  { match: (r) => is(r, 'products', 2), render: productForm },
  { match: (r) => is(r, 'categories', 1), render: categories },
  { match: (r) => is(r, 'categories', 2), render: categoryForm },
  { match: (r) => is(r, 'banners', 1), render: banners },
  { match: (r) => is(r, 'banners', 2), render: bannerForm },
  { match: (r) => is(r, 'coupons', 1), render: coupons },
  { match: (r) => is(r, 'coupons', 2), render: couponForm },
  { match: (r) => is(r, 'customers', 1), render: customers },
  { match: (r) => is(r, 'customers', 2), render: customerDetail },
  { match: (r) => is(r, 'reviews', 1), render: reviews },
  { match: (r) => is(r, 'messages', 1), render: messages },
  { match: (r) => is(r, 'subscribers', 1), render: subscribers },
  { match: (r) => is(r, 'pages', 1), render: pages },
  { match: (r) => is(r, 'pages', 2), render: pageForm },
  { match: (r) => is(r, 'analytics', 1), render: analytics },
  { match: (r) => is(r, 'settings', 1), render: settings },
  { match: (r) => is(r, 'setup', 1), render: setup },
];
