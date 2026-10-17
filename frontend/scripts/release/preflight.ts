import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
// Read-only release check. Secret values and customer rows never enter output.
async function main() {
    const env = process.env;
    const keys = ['DATABASE_URL', 'DIRECT_URL', 'JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
        'CRON_SECRET', 'RESEND_API_KEY', 'PASSWORD_RESET_FROM', 'PASSWORD_RESET_BASE_URL'];
    const presence = Object.fromEntries(keys.map(key => [key, Boolean(env[key]?.trim())]));
    const database = new URL(env.DATABASE_URL || 'http://invalid');
    const direct = new URL(env.DIRECT_URL || 'http://invalid');
    const local = [database, direct].every(url => ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
    const expected = env.R21_EXPECTED_SUPABASE_REF;
    const matches = (url: URL) => Boolean(expected && /^[a-z0-9]{20}$/.test(expected) &&
        (url.hostname === `db.${expected}.supabase.co` ||
            url.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(url.username).endsWith(`.${expected}`)));
    const sameDatabase = database.pathname === direct.pathname && [database, direct].every(url => ['postgres:', 'postgresql:'].includes(url.protocol) && (url.searchParams.get('schema') || 'public') === 'public');
    const identity = sameDatabase && (local ? env.GHEVERHAN_ISOLATED_TESTS === '1' : matches(database) && matches(direct));
    if (!identity || (!local && env.R21_ALLOW_PRODUCTION_READ_ONLY !== '1')) {
        console.log(JSON.stringify({ status: 'BLOCKED', databaseIdentity: false, presence }));
        process.exitCode = 1;
        return;
    }
    const directory = path.join(process.cwd(), 'prisma/migrations');
    const expectedLedger = new Map<string, string>();
    for (const name of await readdir(directory)) {
        if (!/^\d{14}_/.test(name))
            continue;
        expectedLedger.set(name, createHash('sha256').update(await readFile(path.join(directory, name, 'migration.sql'))).digest('hex'));
    }
    const db = new PrismaClient();
    try {
        const facts = await db.$transaction(async (tx) => {
            await tx.$executeRaw `SET TRANSACTION READ ONLY`;
            await tx.$executeRaw `SET LOCAL statement_timeout = '5s'`;
            const ledger = await tx.$queryRaw<{
                migration_name: string;
                checksum: string;
                finished: boolean;
                rolled_back: boolean;
            }[]> `
        SELECT migration_name,checksum,finished_at IS NOT NULL AS finished,rolled_back_at IS NOT NULL AS rolled_back
        FROM public._prisma_migrations ORDER BY migration_name`;
            const schema = await tx.$queryRaw<{
                revocation: boolean;
                limiter: boolean;
                version: boolean;
                indexes: boolean;
                foreignKey: boolean;
                trusted: boolean;
            }[]> `
        SELECT to_regclass('public."SessionRevocation"') IS NOT NULL AS revocation,
        to_regclass('public."AuthRateLimit"') IS NOT NULL AS limiter,
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='sessionVersion' AND data_type='integer' AND is_nullable='NO' AND column_default IN ('0','0::integer')) AS version,
        (SELECT count(*)=5 AND bool_and(i.indisvalid AND i.indisready) FROM pg_catalog.pg_index i WHERE i.indrelid IN (to_regclass('public."SessionRevocation"'),to_regclass('public."AuthRateLimit"'))) AS indexes,
        (SELECT count(*)=1 AND bool_and(confdeltype='c' AND confupdtype='c' AND confrelid=to_regclass('public."User"')) FROM pg_catalog.pg_constraint WHERE conrelid=to_regclass('public."SessionRevocation"') AND contype='f') AS "foreignKey",
        (SELECT count(*)=2 AND bool_and(c.relrowsecurity AND NOT pg_catalog.row_security_active(c.oid)
          AND has_table_privilege(c.oid,'SELECT') AND has_table_privilege(c.oid,'INSERT') AND has_table_privilege(c.oid,'UPDATE') AND has_table_privilege(c.oid,'DELETE'))
          FROM pg_catalog.pg_class c WHERE c.oid IN (to_regclass('public."SessionRevocation"'),to_regclass('public."AuthRateLimit"'))) AS trusted`;
            const settings = await tx.$queryRaw<{
                role: string;
                version: string;
                max_connections: string;
                lock_timeout: string;
            }[]> `
        SELECT current_user AS role,current_setting('server_version') AS version,current_setting('max_connections') AS max_connections,current_setting('lock_timeout') AS lock_timeout`;
            return { ledger, schema: schema[0], settings: settings[0] };
        }, { timeout: 10000 });
        const active = facts.ledger.filter(row => !row.rolled_back);
        const ledgerMatches = active.length === expectedLedger.size && new Set(active.map(row => row.migration_name)).size === expectedLedger.size && active.every(row => row.finished) &&
            facts.ledger.every(row => expectedLedger.get(row.migration_name) === row.checksum);
        const schemaReady = facts.schema.revocation && facts.schema.limiter && facts.schema.version && facts.schema.indexes && facts.schema.foreignKey && facts.schema.trusted;
        const maintenanceMode = ['0', '1'].includes(env.MAINTENANCE_MODE || '') ? env.MAINTENANCE_MODE : 'UNCONFIGURED';
        const configReady = maintenanceMode !== 'UNCONFIGURED' && Object.values(presence).every(Boolean) && (env.JWT_SECRET?.length || 0) >= 16;
        console.log(JSON.stringify({ status: ledgerMatches && schemaReady && configReady ? 'PASS' : 'BLOCKED',
            readOnly: true, databaseIdentity: true, local, maintenanceMode, presence, ledgerMatches, schema: facts.schema,
            databaseSettings: facts.settings, configPresenceReady: configReady,
            limitations: ['Presence is not provider delivery/key-entropy verification', 'Does not prove backup, storage policies, pool budget or owner approval'] }, null, 2));
        if (!ledgerMatches || !schemaReady || !configReady)
            process.exitCode = 1;
    }
    finally {
        await db.$disconnect();
    }
}
main().catch(() => {
    console.error('Release preflight BLOCKED: database/configuration check failed; no write was attempted');
    process.exitCode = 1;
});
