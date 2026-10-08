const nodemailer = require('nodemailer');
const config = require('../config');
const settings = require('./settings');
const { formatMoney, escapeHtml } = require('./helpers');

let transport = null;
if (config.smtp.host) {
  transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

async function send({ to, subject, html, text }) {
  if (!to) return;
  if (!transport) {
    if (config.env !== 'test') console.log(`[email] (SMTP not configured) To: ${to} | ${subject}`);
    return;
  }
  try {
    await transport.sendMail({ from: config.smtp.from, to, subject, html, text });
  } catch (err) {
    console.error('[email] failed to send', err.message);
  }
}

function orderHtml(order) {
  const sym = settings.get('currency_symbol', '₹');
  const m = (v) => formatMoney(v, sym);
  const rows = order.items.map((i) => `<tr><td style="padding:6px 0">${escapeHtml(i.name)}${i.variant_name ? ` — ${escapeHtml(i.variant_name)}` : ''} × ${i.quantity}</td><td style="text-align:right">${m(i.total)}</td></tr>`).join('');
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#2b2024">
    <h2 style="font-weight:normal">${escapeHtml(settings.get('store_name'))}</h2>
    <p>Hi ${escapeHtml(order.name)},</p>
    <p>Thank you for your order <strong>${escapeHtml(order.order_number)}</strong>.</p>
    <table style="width:100%;border-collapse:collapse">${rows}
      <tr><td style="padding-top:10px">Subtotal</td><td style="text-align:right">${m(order.subtotal)}</td></tr>
      ${order.discount ? `<tr><td>Discount</td><td style="text-align:right">−${m(order.discount)}</td></tr>` : ''}
      <tr><td>Shipping</td><td style="text-align:right">${order.shipping ? m(order.shipping) : 'Free'}</td></tr>
      <tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${m(order.total)}</strong></td></tr>
    </table>
    <p>Payment: ${order.payment_method === 'cod' ? 'Cash on Delivery' : 'Online'} (${escapeHtml(order.payment_status)})</p>
    <p>Track your order: <a href="${config.baseUrl}/order/${encodeURIComponent(order.order_number)}?t=${order.access_token}">${config.baseUrl}/order/${escapeHtml(order.order_number)}</a></p>
  </div>`;
}

function orderPlaced(order) {
  send({ to: order.email, subject: `Order ${order.order_number} confirmed`, html: orderHtml(order) });
  const notify = settings.get('order_notify_email') || settings.get('contact_email');
  send({ to: notify, subject: `New order ${order.order_number} — ${formatMoney(order.total, settings.get('currency_symbol', '₹'))}`, html: orderHtml(order) });
}

function orderStatusChanged(order) {
  const tracking = order.tracking_number ? `<p>Courier: ${escapeHtml(order.courier || '')} — Tracking number: <strong>${escapeHtml(order.tracking_number)}</strong></p>` : '';
  send({
    to: order.email,
    subject: `Your order ${order.order_number} is ${order.status}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><p>Hi ${escapeHtml(order.name)},</p>
      <p>Your order <strong>${escapeHtml(order.order_number)}</strong> is now <strong>${escapeHtml(order.status)}</strong>.</p>${tracking}
      <p><a href="${config.baseUrl}/order/${encodeURIComponent(order.order_number)}?t=${order.access_token}">View your order</a></p></div>`,
  });
}

module.exports = { send, orderPlaced, orderStatusChanged };
