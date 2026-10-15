import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
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
const samples = 7;
type Sample = { ttfbMs: number; responseMs: number; queryCount: number; sqlDurationMs: number; bytes: number };
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
  const token = await signSession({ sub: user.id, email: user.email });
  const routes = ['/', '/shop', '/product/perf2d-product-0', '/admin', '/admin/products', '/admin/inventory', '/admin/orders'];
  const results: Record<string, { firstProcessRequest: Sample; warm: Sample[] }> = {};
  // Cache state starts empty for both runs; public data may warm across routes.
  await rm(path.join(root, '.next/cache/fetch-cache'), { recursive: true, force: true });
  for (const route of routes) {
    let log = '';
    const server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)], { cwd: root, env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: target, DIRECT_URL: target, JWT_SECRET: secret, NODE_OPTIONS: `--require=${path.join(root, 'tests/performance/prisma-profile.cjs')}` }, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', chunk => { log += chunk.toString(); });
    server.stderr.on('data', chunk => { log += chunk.toString(); });
    try {
      for (let n = 0; ; n++) {
        if (server.exitCode !== null || n === 100) throw new Error(`Server startup failed: ${log}`);
        if (log.includes('Ready in')) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const measure = async (): Promise<Sample> => {
        const offset = log.length;
        const start = performance.now();
        // Anonymous storefront; authenticated admin. No browser prefetch noise.
        const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers: route.startsWith('/admin') ? { Cookie: `gh_session=${token}` } : {}, redirect: 'manual' });
        const firstByte = performance.now(); const body = await response.text(); const end = performance.now();
        assert.equal(response.status, 200, `${route}: ${response.status}`);
        assert.ok(!body.includes('NEXT_REDIRECT'), route);
        await new Promise(resolve => setTimeout(resolve, 30));
        const queries = [...log.slice(offset).matchAll(/GH_PROFILE_QUERY (\d+)/g)].map(m => Number(m[1]));
        return { ttfbMs: firstByte-start, responseMs: end-start, queryCount: queries.length, sqlDurationMs: queries.reduce((a, b) => a+b, 0), bytes: Buffer.byteLength(body) };
      };
      const firstProcessRequest = await measure(); const warm: Sample[] = [];
      for (let n = 0; n < samples; n++) warm.push(await measure());
      results[route] = { firstProcessRequest, warm };
      console.log(route, JSON.stringify(results[route]));
    } finally {
      server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve));
      await writeFile(path.join(output!, `${route.replaceAll('/', '_') || 'home'}.log`), log);
    }
  }
  const manifest = JSON.parse(await readFile('.next/server/app-paths-manifest.json', 'utf8'));
  await writeFile(path.join(output!, 'results.json'), JSON.stringify({ node: process.version, samples, fixture: { products: 45, variants: 45, orders: 45 }, method: 'Sequential HTTP GET; new Next production process per route, first process request + 7 warm requests; anonymous storefront/authenticated Admin; full streamed response consumed. Query durations from test-only Prisma preload, integer ms; summed SQL time is not wall-time or isolated render CPU. Local process startup is not a Vercel cold start.', results, appRoutes: Object.keys(manifest) }, null, 2));
}
main().finally(() => db.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
