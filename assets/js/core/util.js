// Shared helpers for the storefront and the admin panel.

export class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s ?? ''));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function renderValue(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  return esc(v);
}

/** Tagged template that HTML-escapes every interpolated value unless it is raw()/html``. */
export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += renderValue(values[i]);
  });
  return new Raw(out);
}

/** 129900 → "₹1,299" (decimals only when needed). */
export function money(paise, symbol = '₹') {
  const amount = (Number(paise) || 0) / 100;
  const hasDecimals = Math.round(amount * 100) % 100 !== 0;
  return symbol + amount.toLocaleString('en-IN', { minimumFractionDigits: hasDecimals ? 2 : 0, maximumFractionDigits: 2 });
}

/** "1,299.50" → 129950; blank → null. */
export function toPaise(input) {
  const cleaned = String(input ?? '').replace(/[^0-9.]/g, '');
  if (cleaned === '') return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function fromPaise(paise) {
  if (paise === null || paise === undefined || paise === '') return '';
  const n = Number(paise) / 100;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function discountPercent(price, compareAt) {
  if (!compareAt || compareAt <= price) return 0;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

const IST = 'Asia/Kolkata';
export function fmtDate(value, withTime = false) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const opts = { day: 'numeric', month: 'short', year: 'numeric', timeZone: IST };
  if (withTime) Object.assign(opts, { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleString('en-IN', opts);
}

/** ISO timestamp → value for <input type="datetime-local"> in India time. */
export function toLocalInput(value) {
  if (!value) return '';
  const d = new Date(new Date(value).getTime() + 5.5 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}
/** <input type="datetime-local"> value (India time) → ISO timestamp. */
export function fromLocalInput(value) {
  return value ? new Date(`${value}:00+05:30`).toISOString() : null;
}

export function truncate(str, n = 160) {
  const s = String(str || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

export function slugify(str) {
  return String(str || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function inline(escaped) {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_(.+?)_(?=[\s).,!?]|$)/g, '$1<em>$2</em>');
}

/**
 * Safe formatter for admin-written text: paragraphs, line breaks, "## headings",
 * "- bullet lists" and **bold**. Everything is escaped first.
 */
export function formatText(text) {
  if (!text) return raw('');
  const blocks = String(text).replace(/\r\n/g, '\n').split(/\n{2,}/);
  return raw(blocks.map((block) => {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    if (!lines.length) return '';
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
      return `<ul>${lines.map((l) => `<li>${inline(esc(l.replace(/^\s*[-*•]\s+/, '')))}</li>`).join('')}</ul>`;
    }
    const out = [];
    let para = [];
    const flush = () => { if (para.length) out.push(`<p>${para.join('<br>')}</p>`); para = []; };
    for (const line of lines) {
      const h = line.match(/^(#{2,3})\s+(.*)$/);
      if (h) {
        flush();
        const tag = h[1].length === 2 ? 'h2' : 'h3';
        out.push(`<${tag}>${inline(esc(h[2]))}</${tag}>`);
      } else {
        para.push(inline(esc(line)));
      }
    }
    flush();
    return out.join('');
  }).join('\n'));
}

/** Store links: "#/…" stays, "/…" becomes "#/…", http(s) stays, anything else is neutralised. */
export function storeHref(link) {
  const l = String(link || '').trim();
  if (!l) return '';
  if (/^https?:\/\//i.test(l) || l.startsWith('#/')) return l;
  if (l.startsWith('/') && !l.startsWith('//')) return `#${l}`;
  return `#/${l.replace(/^[#/]+/, '')}`;
}

export function parseHash(hash = location.hash) {
  const h = hash.replace(/^#/, '');
  if (!h.startsWith('/')) return { path: '/', parts: [], query: {} };
  const [path, qs = ''] = h.split('?');
  return { path: path || '/', parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: Object.fromEntries(new URLSearchParams(qs)) };
}

/** Builds "#/path?x=1" dropping blank values. */
export function hashWith(path, query = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '' && v !== false) params.set(k, v);
  const s = params.toString();
  return `#${path}${s ? `?${s}` : ''}`;
}

export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''));
export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else if (el.type !== 'file' && el.type !== 'submit' && el.type !== 'button') out[el.name] = el.value;
  }
  return out;
}

export function randomHex(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Shrinks a photo in the browser before upload (max side `max` px). Returns a Blob. */
export async function resizeImage(file, max = 1600, quality = 0.85) {
  if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type)) throw new Error(`${file.name}: please use a JPG, PNG or WebP image.`);
  if (file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const type = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b || file), type, quality));
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
