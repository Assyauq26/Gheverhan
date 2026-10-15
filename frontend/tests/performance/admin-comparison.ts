import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { signSession } from '../../src/lib/auth/jwt';
import { PERMISSIONS } from '../../src/lib/auth/permissions';

const target = process.env.SPRINT1_TEST_DATABASE_URL;
if (!target) throw new Error('Set SPRINT1_TEST_DATABASE_URL to the isolated local test database');
const url = new URL(target);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/gheverhan_sprint1_test') throw new Error('Profiler refuses non-local/test database');
const root = process.cwd();
const output = process.env.PERF_OUTPUT_DIR;
if (!output) throw new Error('Set PERF_OUTPUT_DIR to a scratch directory outside the repository');
const db = new PrismaClient({ datasources: { db: { url: target } } });
const secret = randomBytes(32).toString('hex');
process.env.JWT_SECRET = secret;
const port = 3115;
const samples = 10;
const warmups = 5;
const rounds = 6;
const manifestPath = process.env.PERF_REVISIONS;
if (!manifestPath) throw new Error('Set PERF_REVISIONS to JSON [{label, root, revision}] for built revisions');
type Sample = { ttfbMs: number; responseMs: number; queryCount: number; sqlDurationMs: number; bytes: number; chunks: number; operations: {model: string; action: string; durationMs: number}[] };
async function main() {
  await mkdir(output!, { recursive: true });
  const role = await db.role.upsert({ where: { name: 'Admin' }, create: { name: 'Admin', label: 'Admin' }, update: {} });
  for (const key of Object.values(PERMISSIONS)) {
    const p = await db.permission.upsert({ where: { key }, create: { key, label: key }, update: {} });
    await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } }, create: { roleId: role.id, permissionId: p.id }, update: {} });
  }
  const user = await db.user.upsert({ where: { email: 'perf2d@example.test' }, create: { id: 'perf2d-staff', name: 'Profiling Fixture', email: 'perf2d@example.test', passwordHash: 'not-a-login-password', roles: { create: { roleId: role.id } } }, update: {} });
  for (let i = 0; i < 45; i++) {
    await db.product.upsert({ where: { id: `perf2d-product-${i}` }, create: { id: `perf2d-product-${i}`, name: `Profiling Product ${i}`, slug: `perf2d-product-${i}`, description: 'Synthetic performance fixture. '.repeat(100), basePrice: 100000 + i, status: 'PUBLISHED', isFeatured: i < 4, images: { create: { url: '/perf-fixture.svg' } }, variants: { create: { id: `perf2d-variant-${i}`, sku: `PERF2D-${i}`, inventory: { create: { onHand: 10, reserved: 1 } } } } }, update: {} });
    await db.order.upsert({ where: { id: `perf2d-order-${i}` }, create: { id: `perf2d-order-${i}`, orderNumber: `PERF2D-${String(i).padStart(4, '0')}`, userId: user.id, subtotal: 100000, total: 100000, note: 'Synthetic fixture. '.repeat(100), items: { create: { variantId: `perf2d-variant-${i}`, productName: `Profiling Product ${i}`, variantLabel: 'Default', unitPrice: 100000, quantity: 1, lineTotal: 100000 } } }, update: {} });
  }
  const databaseTotals = { products: await db.product.count(), variants: await db.productVariant.count(), orders: await db.order.count() };
  assert.deepEqual(databaseTotals, { products: 45, variants: 45, orders: 45 }, 'Use a fresh dedicated profiling database; regression suites retain historical fixtures');
  const token = await signSession({ sub: user.id, email: user.email });
  const revisions: { label: string; root: string; revision: string }[] = JSON.parse(await readFile(manifestPath!, 'utf8'));
  assert.ok([2, 3].includes(revisions.length) && revisions.every(r => r.label && r.root && r.revision));
  const results: unknown[] = [];
  const preload = path.join(root, 'tests/performance/prisma-profile.cjs');
  for (let round = 0; round < rounds; round++) {
    // Balanced AB/BA or ABC/BCA/CAB/CBA/ACB/BAC; no concurrent server workload.
    const indices = revisions.length === 3 ? [[0,1,2],[1,2,0],[2,0,1],[2,1,0],[0,2,1],[1,0,2]][round] : (round % 2 ? [1,0] : [0,1]);
    const order = indices.map(i => revisions[i]);
    for (const revision of order) {
      for (const route of (round % 2 ? ['/admin/inventory', '/admin/products'] : ['/admin/products', '/admin/inventory'])) {
        let log = '';
        const server = spawn(process.execPath, [path.join(revision.root, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)], { cwd: revision.root, env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: target, DIRECT_URL: target, JWT_SECRET: secret, NODE_OPTIONS: `--require=${preload}`, GH_PROFILE_OPERATIONS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
        server.stdout.on('data', chunk => { log += chunk.toString(); });
        server.stderr.on('data', chunk => { log += chunk.toString(); });
        try {
          for (let n = 0; ; n++) {
            if (server.exitCode !== null || n === 100) throw new Error('Server startup failed');
            if (log.includes('Ready in')) break;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          const measure = async (rsc: boolean): Promise<Sample> => {
            const offset = log.length;
            const start = performance.now();
            const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers: { Cookie: `gh_session=${token}`, ...(rsc ? { RSC: '1' } : {}) }, redirect: 'manual' });
            const firstByte = performance.now();
            const chunks: Uint8Array[] = [];
            const reader = response.body!.getReader();
            for (;;) { const chunk = await reader.read(); if (chunk.done) break; chunks.push(chunk.value); }
            const end = performance.now();
            const body = Buffer.concat(chunks).toString('utf8');
            assert.equal(response.status, 200, `${route}: ${response.status}`);
            assert.ok(!body.includes('NEXT_REDIRECT'));
            assert.ok(body.includes('Profiling Product'), 'Expected populated list');
            if (rsc) assert.ok(response.headers.get('content-type')?.includes('text/x-component'));
            await new Promise(resolve => setTimeout(resolve, 30));
            const queryLog = log.slice(offset);
            const queries = [...queryLog.matchAll(/GH_PROFILE_QUERY (\d+)/g)].map(m => Number(m[1]));
            const operations = [...queryLog.matchAll(/GH_PROFILE_OPERATION (.+)/g)].map(m => JSON.parse(m[1]));
            return { ttfbMs: firstByte-start, responseMs: end-start, queryCount: queries.length, sqlDurationMs: queries.reduce((a,b)=>a+b,0), bytes: Buffer.byteLength(body), chunks: chunks.length, operations };
          };
          const firstProcessRequest = await measure(false);
          const warmup: Sample[] = []; const warm: Sample[] = []; const rscWarmup: Sample[] = []; const rsc: Sample[] = [];
          for (let n=0;n<warmups;n++) warmup.push(await measure(false));
          for (let n=0;n<samples;n++) warm.push(await measure(false));
          for (let n=0;n<warmups;n++) rscWarmup.push(await measure(true));
          for (let n=0;n<samples;n++) rsc.push(await measure(true));
          results.push({label: revision.label, revision: revision.revision, round, route, firstProcessRequest, warmup, warm, rscWarmup, rsc});
          console.log(JSON.stringify({label:revision.label,round,route,completed:true}));
        } finally {
          if (server.exitCode === null) { const exited = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await exited; }
          await writeFile(path.join(output!, `${revision.label}-${round}-${route.replaceAll('/', '_')}.log`), log);
        }
      }
    }
    await writeFile(path.join(output!, 'results.json'), JSON.stringify({ node: process.version, postgres: await db.$queryRaw`SELECT version()`, samplesPerBlock:samples, warmupsPerBlock:warmups, rounds, fixture:databaseTotals, revisions:revisions.map(({label,revision})=>({label,revision})), results }, null, 2));
  }
}
main().finally(() => db.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
