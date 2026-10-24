import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { mkdtemp, cp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const target = new URL(process.env.SPRINT1_TEST_DATABASE_URL || 'http://invalid');
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
assert.equal(target.pathname, '/gheverhan_sprint1_test');
assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, '1');
const db = new PrismaClient({ datasources: { db: { url: target.toString() } } });
after(() => db.$disconnect());
const fixtures = { JWT_SECRET: 'r21-synthetic-preflight-fixture-only', SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-unused', CRON_SECRET: 'synthetic-unused', RESEND_API_KEY: 'synthetic-unused', PASSWORD_RESET_FROM: 'dummy@example.test', PASSWORD_RESET_BASE_URL: 'https://example.test' };
function run(url = target.toString(), extra: Record<string, string> = {}) {
    const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/release/preflight.ts'], { env: { ...process.env, ...fixtures, MAINTENANCE_MODE: '0', DATABASE_URL: url, DIRECT_URL: url, ...extra }, encoding: 'utf8', timeout: 20000 });
    assert.equal(child.signal, null);
    return { status: child.status, data: JSON.parse(child.stdout) };
}
test('read-only preflight accepts reviewed local schema and never outputs fixture secrets', () => {
    const r = run();
    assert.equal(r.status, 0);
    assert.equal(r.data.readOnly, true);
    assert.equal(r.data.ledgerMatches, true);
    assert.equal(r.data.schema.trusted, true);
    for (const secret of Object.values(fixtures))
        assert.ok(!JSON.stringify(r.data).includes(secret));
});
test('preflight refuses unverified remote identity before connecting', () => {
    const r = run('postgresql://unused@unverified.invalid/database');
    assert.equal(r.status, 1);
    assert.equal(r.data.databaseIdentity, false);
});
test('presence of schema does not hide missing operational configuration', () => {
    const r = run(target.toString(), { CRON_SECRET: '' });
    assert.equal(r.status, 1);
    assert.equal(r.data.configPresenceReady, false);
    assert.equal(r.data.schema.trusted, true);
});
test('legacy schema and ambiguous migration ledger are rejected without fail-open', async () => {
    const name = 'r21_legacy_' + randomUUID().replaceAll('-', '');
    assert.match(name, /^r21_legacy_[a-f0-9]+$/);
    const directory = await mkdtemp(path.join(tmpdir(), 'r21-legacy-'));
    let created = false;
    try {
        await db.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
        created = true;
        await cp('prisma/schema.prisma', path.join(directory, 'schema.prisma'));
        const migrations = (await readdir('prisma/migrations')).filter(n => /^\d{14}_/.test(n)).sort();
        assert.equal(migrations.length, 13);
        for (const migration of migrations.slice(0, 5))
            await cp(path.join('prisma/migrations', migration), path.join(directory, 'migrations', migration), { recursive: true });
        await cp('prisma/migrations/migration_lock.toml', path.join(directory, 'migrations/migration_lock.toml'));
        const legacy = new URL(target);
        legacy.pathname = '/' + name;
        const migrate = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', path.join(directory, 'schema.prisma')], { env: { ...process.env, DATABASE_URL: legacy.toString(), DIRECT_URL: legacy.toString() }, encoding: 'utf8', timeout: 20000 });
        assert.equal(migrate.status, 0);
        const probe = createServer();
        await new Promise<void>((resolve, reject) => { probe.once('error', reject); probe.listen(3133, '127.0.0.1', resolve); });
        await new Promise<void>(resolve => probe.close(() => resolve()));
        const closed = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3133'], { env: { ...process.env, ...fixtures, MAINTENANCE_MODE: '1', DATABASE_URL: legacy.toString(), DIRECT_URL: legacy.toString() }, stdio: 'ignore' });
        try {
            let ready = false;
            for (let i = 0; i < 100; i++) {
                try {
                    ready = (await fetch('http://127.0.0.1:3133/api/v1/health')).status === 200;
                }
                catch { }
                if (ready)
                    break;
                await new Promise(r => setTimeout(r, 100));
            }
            assert.ok(ready, 'Closed release did not start on legacy schema');
            for (const [route, method] of [['/', 'GET'], ['/shop', 'GET'], ['/login', 'GET'], ['/api/v1/auth/login', 'POST'], ['/api/v1/orders', 'POST'], ['/cart', 'POST'], ['/api/internal/cron/expire-orders', 'GET'], ['/_next/static/synthetic.js', 'POST']]) {
                const response = await fetch('http://127.0.0.1:3133' + route, { method, headers: { 'Next-Action': 'synthetic' }, redirect: 'manual' });
                assert.equal(response.status, 503, route);
                assert.ok(response.headers.get('Cache-Control')?.includes('no-store'));
            }
        }
        finally {
            closed.kill('SIGTERM');
            await new Promise<void>(resolve => { if (closed.exitCode !== null)
                return resolve(); closed.once('exit', () => resolve()); setTimeout(() => { closed.kill('SIGKILL'); resolve(); }, 5000).unref(); });
        }
        const r = run(legacy.toString());
        assert.equal(r.status, 1);
        assert.equal(r.data.ledgerMatches, false);
        assert.equal(r.data.schema.revocation, false);
        assert.equal(r.data.schema.limiter, false);
        assert.equal(r.data.schema.version, false);
        const verify = new PrismaClient({ datasources: { db: { url: legacy.toString() } } });
        try {
            const rows = await verify.$queryRaw<{
                missing: boolean;
            }[]> `SELECT to_regclass('public."SessionRevocation"') IS NULL AS missing`;
            assert.equal(rows[0].missing, true);
            const upgrade = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: legacy.toString(), DIRECT_URL: legacy.toString() }, encoding: 'utf8', timeout: 20000 });
            assert.equal(upgrade.status, 0);
            const valid = run(legacy.toString());
            assert.equal(valid.status, 0);
            await verify.$executeRaw `UPDATE public._prisma_migrations SET migration_name='20260922143925_init',checksum=(SELECT checksum FROM public._prisma_migrations WHERE migration_name='20260922143925_init' LIMIT 1) WHERE migration_name='20261017000000_auth_session_controls'`;
            const ambiguous = run(legacy.toString());
            assert.equal(ambiguous.status, 1);
            assert.equal(ambiguous.data.ledgerMatches, false);
            assert.equal(ambiguous.data.schema.version, true);
        }
        finally {
            await verify.$disconnect();
        }
    }
    finally {
        if (created)
            await db.$executeRawUnsafe(`DROP DATABASE "${name}"`);
        await rm(directory, { recursive: true, force: true });
    }
});
test('trusted role needs every required privilege, not only SELECT', async () => {
    const role = 'r21_select_' + randomUUID().replaceAll('-', '');
    assert.match(role, /^r21_select_[a-f0-9]+$/);
    await db.$executeRawUnsafe(`CREATE ROLE "${role}" NOLOGIN BYPASSRLS`);
    try {
        await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
        await db.$executeRawUnsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${role}"`);
        const limited = new URL(target);
        limited.searchParams.set('options', `-c role=${role}`);
        const r = run(limited.toString());
        assert.equal(r.status, 1);
        assert.equal(r.data.ledgerMatches, true);
        assert.equal(r.data.schema.trusted, false);
        await db.$executeRawUnsafe(`GRANT INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO "${role}"`);
        const noCleanup = run(limited.toString());
        assert.equal(noCleanup.status, 1);
        assert.equal(noCleanup.data.schema.trusted, false);
        await db.$executeRawUnsafe(`GRANT DELETE ON "AuthRateLimit", "SessionRevocation", "PendingRegistration" TO "${role}"`);
        const missingVariations = run(limited.toString());
        assert.equal(missingVariations.status, 1);
        assert.equal(missingVariations.data.schema.customOptions, false);
        await db.$executeRawUnsafe(`GRANT DELETE ON "ProductOptionGroup", "ProductOptionValue", "ProductVariantOptionValue" TO "${role}"`);
        await db.$executeRawUnsafe(`GRANT EXECUTE ON FUNCTION gheverhan_backfill_legacy_options(text) TO "${role}"`);
        const missingDirect = run(limited.toString());
        assert.equal(missingDirect.status, 1);
        assert.equal(missingDirect.data.schema.directCheckout, false);
        await db.$executeRawUnsafe(`GRANT DELETE ON "CheckoutIntent", "Product", "ProductImage", "ProductVariant", "Inventory", "StagedProductMedia", "ProductEditorSave" TO "${role}"`);
        const complete = run(limited.toString());
        assert.equal(complete.status, 0);
        assert.equal(complete.data.schema.trusted, true);
    }
    finally {
        await db.$executeRawUnsafe(`DROP OWNED BY "${role}"`);
        await db.$executeRawUnsafe(`DROP ROLE "${role}"`);
    }
});

test('database and direct URLs must identify the same database and public schema', () => {
    for (const change of ['database', 'schema']) {
        const direct = new URL(target);
        if (change === 'database') direct.pathname = '/different_disposable_database';
        else direct.searchParams.set('schema', 'different_schema');
        const r = run(target.toString(), { DIRECT_URL: direct.toString() });
        assert.equal(r.status, 1);
        assert.equal(r.data.databaseIdentity, false);
    }
});


test('preflight rejects missing OTP fields and wrong index targets despite matching counts', async () => {
    await db.$executeRaw`ALTER TABLE "PendingRegistration" RENAME COLUMN "codeHash" TO "codeHash_missing"`;
    try {
        const missing = run();
        assert.equal(missing.status, 1);
        assert.equal(missing.data.schema.pendingColumns, false);
    } finally { await db.$executeRaw`ALTER TABLE "PendingRegistration" RENAME COLUMN "codeHash_missing" TO "codeHash"`; }
    await db.$executeRaw`DROP INDEX "PendingRegistration_expiresAt_idx"`;
    await db.$executeRaw`CREATE INDEX "otp_wrong_target_test" ON "PendingRegistration"("name")`;
    try {
        const wrong = run();
        assert.equal(wrong.status, 1);
        assert.equal(wrong.data.schema.pendingIndexes, false);
    } finally {
        await db.$executeRaw`DROP INDEX "otp_wrong_target_test"`;
        await db.$executeRaw`CREATE INDEX "PendingRegistration_expiresAt_idx" ON "PendingRegistration"("expiresAt")`;
    }
    assert.equal(run().status, 0);
});

test('preflight blocks missing custom-variation partial index despite a matching migration ledger', async () => {
    await db.$executeRaw`ALTER INDEX "ProductOptionGroup_one_image_group" RENAME TO custom_fixture_missing_index`;
    try {
        const result=run();assert.equal(result.status,1);assert.equal(result.data.ledgerMatches,true);assert.equal(result.data.schema.customOptions,false);
    } finally { await db.$executeRaw`ALTER INDEX custom_fixture_missing_index RENAME TO "ProductOptionGroup_one_image_group"`; }
});

test('preflight rejects a missing normalized identity index without changing customer rows', async () => {
    await db.$executeRaw`ALTER INDEX "User_registration_email_normalized_idx" RENAME TO "registration_index_hidden_test"`;
    try {
        const missing = run();
        assert.equal(missing.status, 1);
        assert.equal(missing.data.schema.normalizedIdentityIndexes, false);
    } finally { await db.$executeRaw`ALTER INDEX "registration_index_hidden_test" RENAME TO "User_registration_email_normalized_idx"`; }
    assert.equal(run().status, 0);
});


test('preflight rejects missing direct-checkout index with an otherwise matching ledger', async () => {
    await db.$executeRaw`ALTER INDEX "CheckoutIntent_orderId_key" RENAME TO fixture_hidden_checkout_index`;
    try {
        const result=run(); assert.equal(result.status,1); assert.equal(result.data.ledgerMatches,true); assert.equal(result.data.schema.directCheckout,false);
    } finally { await db.$executeRaw`ALTER INDEX fixture_hidden_checkout_index RENAME TO "CheckoutIntent_orderId_key"`; }
});

test('preflight rejects missing staged-media expiry index on the reviewed ledger', async () => {
 await db.$executeRaw`ALTER INDEX "StagedProductMedia_expiresAt_idx" RENAME TO fixture_hidden_media_index`;
 try {const result=run();assert.equal(result.status,1);assert.equal(result.data.ledgerMatches,true);assert.equal(result.data.schema.productEditorV2,false);}
 finally {await db.$executeRaw`ALTER INDEX fixture_hidden_media_index RENAME TO "StagedProductMedia_expiresAt_idx"`;}
 assert.equal(run().status,0);
});


test('V2 tables require ALL CRUD independently and reject active RLS', async () => {
 const role='v2_grants_'+randomUUID().replaceAll('-','');
 await db.$executeRawUnsafe(`CREATE ROLE "${role}" NOLOGIN BYPASSRLS`);
 const limited=new URL(target); limited.searchParams.set('options',`-c role=${role}`);
 try {
  await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
  await db.$executeRawUnsafe(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`);
  await db.$executeRawUnsafe(`GRANT EXECUTE ON FUNCTION gheverhan_backfill_legacy_options(text) TO "${role}"`);
  for (const table of ['StagedProductMedia','ProductEditorSave']) {
   await db.$executeRawUnsafe(`REVOKE ALL ON "${table}" FROM "${role}"`);
   for (const privilege of ['SELECT','INSERT','UPDATE']) {
    await db.$executeRawUnsafe(`GRANT ${privilege} ON "${table}" TO "${role}"`);
    const partial=run(limited.toString());
    assert.equal(partial.status,1,table+': '+privilege);
    assert.equal(partial.data.ledgerMatches,true);
    assert.equal(partial.data.schema.catalogPrivileges,true);
    assert.equal(partial.data.schema.trusted,true);
    assert.equal(partial.data.schema.productEditorV2,false);
   }
   await db.$executeRawUnsafe(`GRANT DELETE ON "${table}" TO "${role}"`);
   assert.equal(run(limited.toString()).status,0);
  }
  await db.$executeRawUnsafe(`ALTER ROLE "${role}" NOBYPASSRLS`);
  const filtered=run(limited.toString()); assert.equal(filtered.status,1);
  assert.equal(filtered.data.schema.productEditorV2,false);
  await db.$executeRawUnsafe(`ALTER ROLE "${role}" BYPASSRLS`);
  assert.equal(run(limited.toString()).status,0);
 } finally {await db.$executeRawUnsafe(`DROP OWNED BY "${role}"`);await db.$executeRawUnsafe(`DROP ROLE "${role}"`);}
});

test('catalog tables cannot hide missing DELETE behind another privilege',async()=>{
 const role='catalog_grants_'+randomUUID().replaceAll('-','');
 await db.$executeRawUnsafe(`CREATE ROLE "${role}" NOLOGIN BYPASSRLS`);
 const limited=new URL(target);limited.searchParams.set('options',`-c role=${role}`);
 try {
  await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
  await db.$executeRawUnsafe(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`);
  await db.$executeRawUnsafe(`GRANT EXECUTE ON FUNCTION gheverhan_backfill_legacy_options(text) TO "${role}"`);
  for(const table of ['Product','ProductImage','ProductVariant','Inventory']) {
   await db.$executeRawUnsafe(`REVOKE DELETE ON "${table}" FROM "${role}"`);
   const partial=run(limited.toString());assert.equal(partial.status,1);assert.equal(partial.data.schema.catalogPrivileges,false);assert.equal(partial.data.schema.productEditorV2,true);
   await db.$executeRawUnsafe(`GRANT DELETE ON "${table}" TO "${role}"`);
  }
  assert.equal(run(limited.toString()).status,0);
 }finally{await db.$executeRawUnsafe(`DROP OWNED BY "${role}"`);await db.$executeRawUnsafe(`DROP ROLE "${role}"`);}
});

test('missing schema USAGE is blocked without exposing a connection string',async()=>{
 const role='schema_grants_'+randomUUID().replaceAll('-','');
 const prior=await db.$queryRaw<{allowed:boolean}[]>`SELECT has_schema_privilege('public','public','USAGE') AS allowed`;
 await db.$executeRawUnsafe(`CREATE ROLE "${role}" NOLOGIN BYPASSRLS`);
 const limited=new URL(target);limited.searchParams.set('options',`-c role=${role}`);
 try {
  await db.$executeRawUnsafe(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`);
  await db.$executeRawUnsafe(`GRANT EXECUTE ON FUNCTION gheverhan_backfill_legacy_options(text) TO "${role}"`);
  await db.$executeRawUnsafe(`REVOKE USAGE ON SCHEMA public FROM PUBLIC`);
  const child=spawnSync(process.execPath,['--import','tsx','scripts/release/preflight.ts'],{env:{...process.env,...fixtures,MAINTENANCE_MODE:'0',DATABASE_URL:limited.toString(),DIRECT_URL:limited.toString()},encoding:'utf8',timeout:20000});
  assert.equal(child.status,1);assert.ok((child.stdout+child.stderr).includes('BLOCKED'));assert.ok(!(child.stdout+child.stderr).includes(limited.toString()));
  await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
  assert.equal(run(limited.toString()).status,0);
 }finally{if(prior[0].allowed)await db.$executeRaw`GRANT USAGE ON SCHEMA public TO PUBLIC`;await db.$executeRawUnsafe(`DROP OWNED BY "${role}"`);await db.$executeRawUnsafe(`DROP ROLE "${role}"`);}
});

test('missing V2 table blocks even if other tables and ledger match',async()=>{
 await db.$executeRaw`ALTER TABLE "ProductEditorSave" RENAME TO fixture_hidden_editor_save`;
 try {const r=run();assert.equal(r.status,1);assert.equal(r.data.ledgerMatches,true);assert.equal(r.data.schema.productEditorV2,false);}
 finally{await db.$executeRaw`ALTER TABLE fixture_hidden_editor_save RENAME TO "ProductEditorSave"`;}
 assert.equal(run().status,0);
});
