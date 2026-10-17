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
        assert.equal(migrations.length, 6);
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
