const crypto = require('crypto');

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Formats paise as a price string, e.g. 129900 -> "₹1,299" (decimals only when needed). */
function formatMoney(paise, symbol = '₹') {
  const amount = (Number(paise) || 0) / 100;
  const hasDecimals = Math.round(amount * 100) % 100 !== 0;
  return symbol + amount.toLocaleString('en-IN', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

/** Parses a rupee amount typed by a person ("1,299.50") into paise. Returns null for blank input. */
function toPaise(input) {
  if (input === undefined || input === null) return null;
  const cleaned = String(input).replace(/[^0-9.]/g, '');
  if (cleaned === '') return null;
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Paise -> plain number string for form inputs ("1299.5" -> "1299.50"). */
function fromPaise(paise) {
  if (paise === null || paise === undefined || paise === '') return '';
  const n = Number(paise) / 100;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function slugify(str) {
  return String(str || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

/** Returns a slug unique within `table`, ignoring the row with id `exceptId`. */
function uniqueSlug(db, table, base, exceptId = 0) {
  const root = slugify(base);
  let slug = root;
  let i = 2;
  const stmt = db.prepare(`SELECT 1 FROM ${table} WHERE slug = ? AND id != ?`);
  while (stmt.get(slug, exceptId)) slug = `${root}-${i++}`;
  return slug;
}

function randomToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

function inlineFormat(escaped) {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_(.+?)_(?=[\s).,!?]|$)/g, '$1<em>$2</em>');
}

/**
 * Tiny, safe text formatter for admin-written content.
 * Supports paragraphs, line breaks, "## headings", "- bullet lists" and **bold**.
 * Everything is HTML-escaped first, so admins can't inject markup by accident.
 */
function formatText(text) {
  if (!text) return '';
  const blocks = String(text).replace(/\r\n/g, '\n').split(/\n{2,}/);
  return blocks.map((block) => {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    if (!lines.length) return '';
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
      return '<ul>' + lines.map((l) => `<li>${inlineFormat(escapeHtml(l.replace(/^\s*[-*•]\s+/, '')))}</li>`).join('') + '</ul>';
    }
    const out = [];
    let para = [];
    const flush = () => {
      if (para.length) out.push(`<p>${para.join('<br>')}</p>`);
      para = [];
    };
    for (const line of lines) {
      const h = line.match(/^(#{2,3})\s+(.*)$/);
      if (h) {
        flush();
        const tag = h[1].length === 2 ? 'h2' : 'h3';
        out.push(`<${tag}>${inlineFormat(escapeHtml(h[2]))}</${tag}>`);
      } else {
        para.push(inlineFormat(escapeHtml(line)));
      }
    }
    flush();
    return out.join('');
  }).join('\n');
}

function truncate(str, n = 160) {
  const s = String(str || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

/** Parses SQLite UTC datetime ("YYYY-MM-DD HH:MM:SS") into a Date. */
function parseDbDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  return new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z'));
}

function formatDate(value, withTime = false) {
  const d = parseDbDate(value);
  if (!d || Number.isNaN(d.getTime())) return '';
  const opts = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' };
  if (withTime) Object.assign(opts, { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleString('en-IN', opts);
}

function discountPercent(price, compareAt) {
  if (!compareAt || compareAt <= price) return 0;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

function toInt(value, fallback = 0) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function checkbox(value) {
  return value === 'on' || value === '1' || value === 'true' || value === true || value === 1 ? 1 : 0;
}

function paginate(total, page, perPage) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, page), pages);
  return { total, pages, page: current, perPage, offset: (current - 1) * perPage };
}

/** Builds a query string from the current query plus overrides; blank values are dropped. */
function queryWith(query, overrides = {}) {
  const params = new URLSearchParams();
  const merged = { ...query, ...overrides };
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, v);
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

/** Only allow site-relative links or http(s) URLs in admin-entered links. */
function safeLink(link) {
  const l = String(link || '').trim();
  if (!l) return '';
  if (l.startsWith('/') && !l.startsWith('//')) return l;
  if (/^https?:\/\//i.test(l)) return l;
  return '/' + l.replace(/^\/+/, '');
}

/** Safe redirect target for "?next=" parameters (same-site paths only). */
function safeNext(next, fallback = '/') {
  const n = String(next || '');
  return n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : fallback;
}

module.exports = {
  escapeHtml,
  formatMoney,
  toPaise,
  fromPaise,
  slugify,
  uniqueSlug,
  randomToken,
  formatText,
  truncate,
  parseDbDate,
  formatDate,
  discountPercent,
  toInt,
  checkbox,
  paginate,
  queryWith,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  isValidEmail,
  safeLink,
  safeNext,
};
