'use strict';

/** Read-only, secret-safe gate for the R21 Prisma production migration. */
const { createHash } = require('node:crypto');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const REF = 'bztprltkevacidcpjaam';
const NAMES = [
  '20260922143925_init',
  '20261015000000_add_refunded_payment_status',
  '20261016112100_coupon_usage_limits',
  '20261016112200_coupon_redemption_concurrent_index',
  '20261016140500_product_scheduled_flash_sale',
  '20261017000000_auth_session_controls',
];

function assert(ok, msg) {
  if (!ok) throw new Error('[release-gate] BLOCKED: ' + msg);
}
function checkUrl(name) {
  const val = process.env[name];
  assert(Boolean(val), name + ' missing');
  let u;
  try { u = new URL(val); }
  catch { throw new Error('[release-gate] BLOCKED: invalid ' + name); }
  assert(['postgres:', 'postgresql:'].includes(u.protocol), name + ' protocol mismatch');
  const direct = u.hostname === 'db.' + REF + '.supabase.co';
  const pooled = u.hostname.endsWith('.pooler.supabase.com')
    && decodeURIComponent(u.username).endsWith('.' + REF);
  assert(direct || pooled, name + ' Supabase project mismatch');
  assert(u.pathname === '/postgres', name + ' database mismatch');
  assert((u.searchParams.get('schema') || 'public') === 'public', name + ' schema mismatch');
  return u;
}

async function main() {
  const phase = process.argv[2];
  assert(phase === 'before' || phase === 'after', 'use before|after');
  assert(process.env.GITHUB_ACTIONS === 'true', 'requires approved GitHub Actions runner');
  assert(process.env.GITHUB_REPOSITORY === 'Assyauq26/Gheverhan', 'repository mismatch');
  assert(process.env.GITHUB_REF === 'refs/heads/main', 'branch mismatch');
  const a = checkUrl('DATABASE_URL'), b = checkUrl('DIRECT_URL');
  assert(a.pathname === b.pathname, 'connection database disagreement');

  const dir = path.resolve('prisma/migrations');
  const names = readdirSync(dir).filter(n => /^\d{14}_/.test(n)).sort();
  assert(names.length === NAMES.length && names.every((n, i) => n === NAMES[i]),
    'unexpected migration file list');
  const hashes = new Map(names.map(n => [n, createHash('sha256')
    .update(readFileSync(path.join(dir, n, 'migration.sql'))).digest('hex')]));

  const db = new PrismaClient();
  try {
    const facts = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5000ms'");
      const ledger = await tx.$queryRawUnsafe(`
        SELECT migration_name, checksum, finished_at IS NOT NULL AS finished,
          rolled_back_at IS NOT NULL AS rolled_back
        FROM public._prisma_migrations ORDER BY migration_name`);
      const shape = await tx.$queryRawUnsafe(`
        SELECT to_regclass('public."SessionRevocation"') IS NOT NULL AS revocation,
          to_regclass('public."AuthRateLimit"') IS NOT NULL AS limiter,
          EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
            AND table_name='User' AND column_name='sessionVersion'
            AND data_type='integer' AND is_nullable='NO'
            AND column_default IN ('0','0::integer')) AS version,
          (SELECT count(*)=5 AND bool_and(i.indisvalid AND i.indisready)
             FROM pg_catalog.pg_index i
             WHERE i.indrelid IN (to_regclass('public."SessionRevocation"'),
               to_regclass('public."AuthRateLimit"'))) AS indexes,
          (SELECT count(*)=1 AND bool_and(confdeltype='c' AND confupdtype='c'
              AND confrelid=to_regclass('public."User"'))
             FROM pg_catalog.pg_constraint
             WHERE conrelid=to_regclass('public."SessionRevocation"') AND contype='f')
             AS foreign_key,
          (SELECT count(*)=2 AND bool_and(c.relrowsecurity)
             FROM pg_catalog.pg_class c WHERE c.oid IN
               (to_regclass('public."SessionRevocation"'),
                to_regclass('public."AuthRateLimit"'))) AS rls,
          (SELECT count(*)=2 AND bool_and(
             has_table_privilege(c.oid,'SELECT') AND has_table_privilege(c.oid,'INSERT')
             AND has_table_privilege(c.oid,'UPDATE') AND has_table_privilege(c.oid,'DELETE'))
             FROM pg_catalog.pg_class c WHERE c.oid IN
               (to_regclass('public."SessionRevocation"'),
                to_regclass('public."AuthRateLimit"'))) AS privileges`);
      return { ledger, shape: shape[0] };
    }, { timeout: 10000 });

    const wanted = phase === 'before' ? NAMES.slice(0, -1) : NAMES;
    assert(facts.ledger.length === wanted.length, 'migration count mismatch');
    assert(facts.ledger.every((x, i) =>
      x.migration_name === wanted[i] && x.finished && !x.rolled_back
      && hashes.get(x.migration_name) === x.checksum),
      'ledger, migration ordering, or checksum mismatch');
    const s = facts.shape;
    if (phase === 'before') {
      assert(!s.revocation && !s.limiter && !s.version,
        'R21 schema appears partly migrated');
    } else {
      assert(s.revocation && s.limiter && s.version && s.indexes &&
        s.foreign_key && s.rls && s.privileges,
        'post-migration schema, constraints, RLS, or privileges failed');
    }
    console.log('[release-gate] PASS ' + phase +
      ': verified Supabase project, schema, and ' + facts.ledger.length + ' Prisma ledger entries');
  } finally { await db.$disconnect(); }
}
main().catch(e => {
  // Avoid driver exception details that might disclose a connection string.
  console.error(e?.message?.startsWith('[release-gate]')
    ? e.message : '[release-gate] BLOCKED: database inspection error');
  process.exitCode = 1;
});
