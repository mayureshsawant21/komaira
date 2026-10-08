// Demo mode only: runs the shop database (PGlite = Postgres in the browser) in a worker
// shared by all open tabs, saved in this browser's IndexedDB.
const pgliteBase = new URL(self.location.href).searchParams.get('pglite');
const siteRoot = new URL('../../../', self.location.href);
const { PGlite } = await import(`${pgliteBase}index.js`);
const { worker } = await import(`${pgliteBase}worker/index.js`);

export const DEMO_ADMIN = '00000000-0000-4000-8000-00000000d3a0';

async function sqlFile(name) {
  const res = await fetch(new URL(`supabase/${name}`, siteRoot));
  if (!res.ok) throw new Error(`Could not load ${name}`);
  return res.text();
}

function checksum(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return `${text.length}:${h}`;
}

worker({
  async init(options) {
    const db = new PGlite(options.dataDir);
    await db.waitReady;
    const schema = await sqlFile('schema.sql');
    const fresh = !(await db.query("select to_regclass('shop.products') as t")).rows[0].t;
    if (fresh) await db.exec(await sqlFile('local-stub.sql'));
    await db.exec('create table if not exists auth.demo_meta (k text primary key, v text)');
    const version = (await db.query("select v from auth.demo_meta where k = 'schema'")).rows[0]?.v;
    if (version !== checksum(schema)) {
      await db.exec(schema);
      await db.query("insert into auth.demo_meta values ('schema', $1) on conflict (k) do update set v = excluded.v", [checksum(schema)]);
    }
    if (fresh) {
      await db.exec(await sqlFile('seed.sql'));
      await db.query("insert into auth.users (id, email) values ($1, 'demo-admin@komaira.local') on conflict do nothing", [DEMO_ADMIN]);
      await db.query("select public.make_admin('demo-admin@komaira.local', 'Demo Admin')");
    }
    return db;
  },
});
