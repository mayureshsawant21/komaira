// One interface for the website to talk to the database:
//  • LIVE: your Supabase project (when config.js is filled in)
//  • DEMO: a Postgres database running inside this browser, preloaded with sample products
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { resizeImage, blobToDataUrl, randomHex } from './util.js';

export const IS_DEMO = !(SUPABASE_URL && SUPABASE_ANON_KEY);
const PGLITE_BASE = window.KOMAIRA_PGLITE_BASE || 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.8/dist/';
const DEMO_ADMIN = '00000000-0000-4000-8000-00000000d3a0';
const DEMO_USER_KEY = 'komaira-demo-user';

function friendly(error) {
  const msg = error?.message || String(error);
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return new Error('Could not reach the store server. Please check your connection and try again.');
  if (/Invalid login credentials/i.test(msg)) return new Error('Incorrect email or password.');
  if (/Email not confirmed/i.test(msg)) return new Error('Please confirm your email first — check your inbox for the link.');
  return new Error(msg);
}

let instance;
/** @param {'store'|'admin'} context */
export function getBackend(context = 'store') {
  instance ||= IS_DEMO ? demoBackend(context) : liveBackend(context);
  return instance;
}

async function liveBackend(context) {
  if (!window.supabase?.createClient) throw new Error('Supabase library failed to load.');
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: context === 'admin' ? 'komaira-admin-auth' : 'komaira-auth' },
  });
  const siteUrl = location.origin + location.pathname;
  const mediaPrefix = `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/media/`;
  return {
    mode: 'live',
    async rpc(fn, p = {}) {
      const { data, error } = await client.rpc(fn, { p });
      if (error) throw friendly(error);
      return data;
    },
    auth: {
      async user() {
        const { data } = await client.auth.getSession();
        return data.session?.user || null;
      },
      async signIn(email, password) {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw friendly(error);
        return data.user;
      },
      async signUp(email, password, meta = {}) {
        const { data, error } = await client.auth.signUp({ email, password, options: { data: meta, emailRedirectTo: siteUrl } });
        if (error) throw friendly(error);
        return { user: data.user, needsConfirmation: !data.session };
      },
      async signOut() { await client.auth.signOut(); },
      async resetPassword(email) {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: siteUrl });
        if (error) throw friendly(error);
      },
      async updatePassword(password) {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw friendly(error);
      },
      onRecovery(cb) {
        client.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') cb(); });
      },
    },
    async upload(file, folder = 'products') {
      const blob = await resizeImage(file);
      const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/gif' ? 'gif' : 'jpg';
      const path = `${folder}/${Date.now()}-${randomHex(6)}.${ext}`;
      const { error } = await client.storage.from('media').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
      if (error) throw friendly(error);
      return client.storage.from('media').getPublicUrl(path).data.publicUrl;
    },
    async removeFiles(urls = []) {
      const paths = urls.filter((u) => typeof u === 'string' && u.startsWith(mediaPrefix)).map((u) => u.slice(mediaPrefix.length));
      if (paths.length) await client.storage.from('media').remove(paths).catch(() => {});
    },
  };
}

async function demoBackend(context) {
  let db;
  try {
    const { PGliteWorker } = await import(`${PGLITE_BASE}worker/index.js`);
    const workerUrl = new URL(`./pglite-worker.js?pglite=${encodeURIComponent(PGLITE_BASE)}`, import.meta.url);
    db = new PGliteWorker(new Worker(workerUrl, { type: 'module' }), { dataDir: 'idb://komaira-demo' });
    await db.waitReady;
  } catch (err) {
    console.error(err);
    throw new Error('Demo mode needs a modern browser with internet access to load the demo database.');
  }

  const demoUser = () => { try { return JSON.parse(localStorage.getItem(DEMO_USER_KEY) || 'null'); } catch { return null; } };
  const uid = () => (context === 'admin' ? DEMO_ADMIN : demoUser()?.id || null);
  let recoveryCb = null;

  const rpc = async (fn, p = {}, asUid = uid()) => {
    if (!/^[a-z_]+$/.test(fn)) throw new Error('Bad request');
    try {
      return await db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [asUid || '']);
        await tx.query(`set local role ${asUid ? 'authenticated' : 'anon'}`);
        const r = await tx.query(`select public.${fn}($1::jsonb) as r`, [JSON.stringify(p)]);
        return r.rows[0]?.r ?? null;
      });
    } catch (err) {
      throw friendly(err);
    }
  };

  return {
    mode: 'demo',
    rpc,
    auth: {
      async user() { return context === 'admin' ? { id: DEMO_ADMIN, email: 'demo-admin@komaira.local' } : demoUser(); },
      async signIn(email, password) {
        const r = await db.query("select id, email, raw_user_meta_data->>'demo_password' as pw from auth.users where lower(email) = lower($1)", [email]);
        const u = r.rows[0];
        if (!u || u.pw !== password) throw new Error('Incorrect email or password.');
        localStorage.setItem(DEMO_USER_KEY, JSON.stringify({ id: u.id, email: u.email }));
        return u;
      },
      async signUp(email, password, meta = {}) {
        const exists = await db.query('select 1 from auth.users where lower(email) = lower($1)', [email]);
        if (exists.rows.length) throw new Error('An account with this email already exists. Please sign in.');
        const r = await db.query('insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id, email',
          [email, JSON.stringify({ ...meta, demo_password: password })]);
        localStorage.setItem(DEMO_USER_KEY, JSON.stringify(r.rows[0]));
        return { user: r.rows[0], needsConfirmation: false };
      },
      async signOut() { localStorage.removeItem(DEMO_USER_KEY); },
      async resetPassword() { throw new Error('Password reset emails are not sent in demo mode.'); },
      async updatePassword(password) {
        const u = demoUser();
        if (u) await db.query("update auth.users set raw_user_meta_data = raw_user_meta_data || jsonb_build_object('demo_password', $2::text) where id = $1", [u.id, password]);
      },
      onRecovery(cb) { recoveryCb = cb; },
    },
    async upload(file) {
      return blobToDataUrl(await resizeImage(file, 1000, 0.8));
    },
    async removeFiles() {},
    async resetDemo() {
      await db.close?.();
      await new Promise((resolve) => { const req = indexedDB.deleteDatabase('/pglite/komaira-demo'); req.onsuccess = req.onerror = req.onblocked = resolve; });
    },
    _recovery: () => recoveryCb,
  };
}
