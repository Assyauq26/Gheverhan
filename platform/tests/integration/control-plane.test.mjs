import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../../../',import.meta.url);
const require=createRequire(new URL('frontend/package.json',root));
const {PrismaClient}=require('@prisma/client');
const adminUrl=new URL(process.env.JETSELLER_TEST_ADMIN_URL || 'http://invalid');
const centralUrl=new URL(process.env.PLATFORM_DATABASE_URL || 'http://invalid');
assert.equal(process.env.JETSELLER_ISOLATED_TESTS,'1');
for(const url of [adminUrl,centralUrl])assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
assert.equal(adminUrl.pathname,'/gheverhan_sprint1_test');assert.equal(centralUrl.pathname,'/jetseller_platform_test');
assert.equal(adminUrl.hostname,centralUrl.hostname);assert.equal(adminUrl.port,centralUrl.port);
const admin=new PrismaClient({datasources:{db:{url:adminUrl.toString()}}});
const db=new PrismaClient({datasources:{db:{url:centralUrl.toString()}}});
const id=randomUUID(),seller='seller-'+id,tenant='tenant-'+id;
const migrate=()=>{
 const result=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy','--schema',fileURLToPath(new URL('platform/prisma/schema.prisma',root))],{cwd:fileURLToPath(root),env:{...process.env,PLATFORM_DATABASE_URL:centralUrl.toString()},encoding:'utf8',timeout:60000});
 assert.equal(result.status,0,result.stdout+result.stderr);
};
before(async()=>{
 const exists=await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname='jetseller_platform_test'`;
 if(!exists.length)await admin.$executeRawUnsafe('CREATE DATABASE jetseller_platform_test');
 migrate();migrate();
 await db.$executeRaw`INSERT INTO "PlatformAccount"(id,email,"passwordHash") VALUES(${id},${id+'@example.test'},'SYNTHETIC-NO-LOGIN')`;
 await db.$executeRaw`INSERT INTO "Seller"(id,"accountId") VALUES(${seller},${id})`;
 await db.$executeRaw`INSERT INTO "Tenant"(id,"sellerId",slug,"databaseSecretRef","updatedAt") VALUES(${tenant},${seller},${id},${'vault:'+id},NOW())`;
});
after(async()=>{await db.$disconnect();await admin.$disconnect();});
test('central migration is repeatable and does not add platform tables to the tenant database',async()=>{
 assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)[0].n,1);
 assert.equal((await admin.$queryRaw`SELECT to_regclass('public."PlatformAccount"')::text AS table_name`)[0].table_name,null);
 assert.equal((await db.$queryRaw`SELECT to_regclass('public."Order"')::text AS table_name`)[0].table_name,null);
});
test('accounts and tenants default inactive; one seller cannot create two stores',async()=>{
 const [row]=await db.$queryRaw`SELECT role,active FROM "PlatformAccount" WHERE id=${id}`;
 assert.equal(row.role,'SELLER');assert.equal(row.active,false);
 assert.equal((await db.$queryRaw`SELECT status FROM "Tenant" WHERE id=${tenant}`)[0].status,'PROVISIONING');
 await assert.rejects(db.$executeRaw`INSERT INTO "Tenant"(id,"sellerId",slug,"databaseSecretRef","updatedAt") VALUES(${tenant+'-duplicate'},${seller},${id+'-duplicate'},${'vault:'+id+'-duplicate'},NOW())`);
});
test('domain registry cannot assign the same hostname twice or reference an absent tenant',async()=>{
 const host=id+'.example.test';
 await db.$executeRaw`INSERT INTO "TenantDomain"(hostname,"tenantId","challengeHash","challengeExpiresAt") VALUES(${host},${tenant},${'0'.repeat(64)},NOW()+INTERVAL '1 hour')`;
 const [domain]=await db.$queryRaw`SELECT status,"verifiedAt","tlsReadyAt" FROM "TenantDomain" WHERE hostname=${host}`;
 assert.equal(domain.status,'PENDING');assert.equal(domain.verifiedAt,null);assert.equal(domain.tlsReadyAt,null);
 await assert.rejects(db.$executeRaw`INSERT INTO "TenantDomain"(hostname,"tenantId","challengeHash","challengeExpiresAt") VALUES(${host},${tenant},${'0'.repeat(64)},NOW())`);
 await assert.rejects(db.$executeRaw`INSERT INTO "TenantDomain"(hostname,"tenantId","challengeHash","challengeExpiresAt") VALUES(${id+'.missing.test'},'tenant-not-present',${'0'.repeat(64)},NOW())`);
});
test('concurrent provisioning reservations cannot duplicate an idempotency key',async()=>{
 const reserve=()=>db.$executeRaw`INSERT INTO "ProvisioningJob"(id,"tenantId","idempotencyKey","payloadHash","updatedAt") VALUES(${randomUUID()},${tenant},${'provision:'+id},${'1'.repeat(64)},NOW())`;
 const outcomes=await Promise.allSettled([reserve(),reserve()]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(outcomes.filter(r=>r.status==='rejected').length,1);
 const [job]=await db.$queryRaw`SELECT status,attempts FROM "ProvisioningJob" WHERE "idempotencyKey"=${'provision:'+id}`;
 assert.equal(job.status,'QUEUED');assert.equal(job.attempts,0);
});
