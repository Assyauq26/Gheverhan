import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { setDefaultResultOrder } from 'node:dns';
import { availableParallelism, totalmem } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
// This harness never accepts an arbitrary HTTP destination or a shared database.
const input = new URL(process.env.SPRINT1_TEST_DATABASE_URL || 'http://invalid');
assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, '1');
assert.ok(['127.0.0.1', 'localhost'].includes(input.hostname));
assert.equal(input.pathname, '/gheverhan_perf_sprint1_test');
input.searchParams.set('connection_limit', '4');
const target = input.toString();
process.env.DATABASE_URL = target;
process.env.DIRECT_URL = target;
setDefaultResultOrder('ipv4first');
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sourceDirty = Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim());
if (process.env.R21_FINAL_QUALIFICATION === '1')
    assert.equal(sourceDirty, false, 'Freeze a clean source before qualification');
const root = process.cwd();
const base = 'http://localhost:3131';
const artifact = process.env.SPRINT1_ARTIFACT_DIR || '/tmp/gheverhan-r21-performance';
const db = new PrismaClient({ datasources: { db: { url: target } } });
const prefix = 'r21perf-' + randomUUID().slice(0, 8);
const secret = 'r21-local-benchmark-fixture-only-not-production';
process.env.JWT_SECRET = secret;
const storageKey = 'r21-loopback-storage-fixture';
type Sample = {
    ms: number;
    status: number;
    id?: string;
};
const phases: Record<string, unknown>[] = [];
const resources: {
    at: number;
    rssBytes: number;
    cpuTicks: number;
    connections: number;
    lockWaits: number;
}[] = [];
let monitoring = false;
let timer: ReturnType<typeof setInterval> | undefined;
let server: ReturnType<typeof spawn> | undefined;
const storage = createServer(async (req, res) => {
    if (req.method !== 'POST' || !req.url?.startsWith('/storage/v1/object/payment-proofs/') || req.headers.authorization !== `Bearer ${storageKey}`) {
        res.writeHead(403).end();
        return;
    }
    for await (const _chunk of req) { /* synthetic bytes intentionally not retained */ }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
});
async function cookie(user: {
    id: string;
    email: string;
}) {
    const { signSession } = await import('../../src/lib/auth/jwt');
    return 'gh_session=' + await signSession({ sub: user.id, email: user.email, version: 0 });
}
async function request(route: string, token: string, options: RequestInit = {}): Promise<Sample & {
    body: any;
}> {
    const t = performance.now();
    const r = await fetch(base + route, { ...options, redirect: 'manual', headers: { ...options.headers, Cookie: token, Origin: base } });
    const text = await r.text();
    let body;
    try {
        body = JSON.parse(text);
    }
    catch {
        body = null;
    }
    return { ms: performance.now() - t, status: r.status, body, id: body?.data?.id };
}
async function phase(name: string, concurrency: number, count: number, fn: (i: number) => Promise<Sample>, expected: (status: number) => boolean = code => code >= 200 && code < 300, kind = 'request') {
    let next = 0;
    const samples: Sample[] = [];
    const start = performance.now();
    await Promise.all(Array.from({ length: concurrency }, async () => { for (;;) {
        const i = next++;
        if (i >= count)
            break;
        samples.push(await fn(i));
    } }));
    const seconds = (performance.now() - start) / 1000;
    const times = samples.map(s => s.ms).sort((a, b) => a - b);
    const pct = (p: number) => times[Math.min(times.length - 1, Math.ceil(times.length * p) - 1)];
    const unexpected = samples.filter(s => !expected(s.status)).length;
    const result = { name, kind, concurrency, requests: count, seconds, requestsPerSecond: count / seconds, checkoutAttemptsPerSecond: kind === 'checkout' ? count / seconds : null, p50ms: pct(.5), p95ms: pct(.95), p99ms: pct(.99), httpErrorRate: samples.filter(s => s.status >= 400).length / count, unexpectedErrorRate: unexpected / count, statusCounts: Object.fromEntries([...new Set(samples.map(s => s.status))].map(code => [code, samples.filter(s => s.status === code).length])) };
    phases.push(result);
    assert.equal(unexpected, 0, JSON.stringify(result));
    return { result, samples };
}
async function sampleResources() {
    if (monitoring || !server?.pid)
        return;
    monitoring = true;
    try {
        const stat = (await readFile(`/proc/${server.pid}/stat`, 'utf8')).slice((await readFile(`/proc/${server.pid}/stat`, 'utf8')).lastIndexOf(')') + 2).split(' ');
        const status = await readFile(`/proc/${server.pid}/status`, 'utf8');
        const rows = await db.$queryRaw<{
            connections: bigint;
            locks: bigint;
        }[]> `SELECT count(*) AS connections,count(*) FILTER(WHERE wait_event_type='Lock') AS locks FROM pg_stat_activity WHERE datname=current_database()`;
        resources.push({ at: performance.now(), rssBytes: Number(status.match(/VmRSS:\s+(\d+)/)?.[1] || 0) * 1024, cpuTicks: Number(stat[11]) + Number(stat[12]), connections: Number(rows[0].connections), lockWaits: Number(rows[0].locks) });
    }
    finally {
        monitoring = false;
    }
}
async function main() {
    let completed = false;
    try {
        await mkdir(artifact, { recursive: true });
        assert.equal(await db.product.count(), 0, 'Use a fresh disposable benchmark database');
        assert.equal(await db.user.count(), 0);
        const { ALL_PERMISSIONS } = await import('../../src/lib/auth/permissions');
        const adminRole = await db.role.create({ data: { name: 'Admin', label: 'Synthetic benchmark admin' } });
        for (const key of ALL_PERMISSIONS) {
            const p = await db.permission.create({ data: { key, label: key } });
            await db.rolePermission.create({ data: { roleId: adminRole.id, permissionId: p.id } });
        }
        const admin = await db.user.create({ data: { name: 'Synthetic Admin', email: prefix + '-admin@example.test', passwordHash: 'unused', roles: { create: { roleId: adminRole.id } } } });
        const buyer = await db.user.create({ data: { name: 'Synthetic Buyer', email: prefix + '-buyer@example.test', passwordHash: 'unused' } });
        const adminCookie = await cookie(admin), buyerCookie = await cookie(buyer);
        await db.product.createMany({ data: Array.from({ length: 500 }, (_, i) => ({ id: `${prefix}-p${i}`, name: `Synthetic Product ${i}`, slug: `${prefix}-p${i}`, status: 'PUBLISHED' as const, basePrice: 100000 })) });
        await db.productVariant.createMany({ data: Array.from({ length: 500 }, (_, i) => ({ id: `${prefix}-v${i}`, productId: `${prefix}-p${i}`, sku: `${prefix}-${i}` })) });
        await db.inventory.createMany({ data: Array.from({ length: 500 }, (_, i) => ({ variantId: `${prefix}-v${i}`, onHand: i === 1 ? 3 : 1000 })) });
        await db.order.createMany({ data: Array.from({ length: 300 }, (_, i) => ({ orderNumber: `${prefix}-history-${i}`, userId: buyer.id, status: 'CANCELLED' as const, paymentStatus: 'EXPIRED' as const, subtotal: 100000, total: 100000 })) });
        await db.cart.create({ data: { userId: buyer.id, items: { create: [0, 2, 3].map(i => ({ variantId: `${prefix}-v${i}`, quantity: 1 })) } } });
        const bank = await db.bankAccount.create({ data: { displayName: 'Synthetic transfer', bankName: 'Synthetic bank', accountNumber: '000000', accountHolder: 'Dummy', isActive: true } });
        await new Promise<void>((resolve, reject) => { storage.once('error', reject); storage.listen(3132, '127.0.0.1', resolve); });
        // Check the app port before launching; never exercise a pre-existing process.
        const probe = createServer();
        await new Promise<void>((resolve, reject) => { probe.once('error', reject); probe.listen(3131, '127.0.0.1', resolve); });
        await new Promise<void>(resolve => probe.close(() => resolve()));
        server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', '3131'], { cwd: root, env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: target, DIRECT_URL: target, JWT_SECRET: secret, AUTH_COOKIE_NAME: 'gh_session', PAYMENT_PROVIDER: 'manual', SHIPPING_PROVIDER: 'manual', SUPABASE_URL: 'http://127.0.0.1:3132', SUPABASE_SERVICE_ROLE_KEY: storageKey, STORAGE_APP_NAME: 'gheverhan-sprint1-tests' }, stdio: ['ignore', 'ignore', 'ignore'] });
        let ready = false;
        for (let i = 0; i < 100; i++) {
            try {
                ready = (await fetch(base + '/api/v1/health')).ok;
            }
            catch { }
            if (ready)
                break;
            await new Promise(r => setTimeout(r, 100));
        }
        assert.ok(ready, 'Local production build did not start');
        await sampleResources();
        timer = setInterval(() => void sampleResources().catch(() => { }), 200);
        const endpoints: [
            string,
            string,
            string,
            RequestInit?
        ][] = [['homepage', '/', buyerCookie], ['shop', '/shop', buyerCookie], ['product', `/product/${prefix}-p0`, buyerCookie], ['search', '/search?q=Synthetic', buyerCookie], ['cart', '/cart', buyerCookie], ['checkout', '/checkout', buyerCookie], ['orders', '/orders', buyerCookie], ['admin', '/admin', adminCookie], ['inventory', '/admin/inventory', adminCookie], ['marketing', '/admin/marketing', adminCookie], ['checkout-preview', '/api/v1/checkout/preview', buyerCookie, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shipping: { courier: 'JNE', service: 'REG', cost: 20000 } }) }]];
        for (const [name, route, token, options] of endpoints) {
            assert.equal((await request(route, token, options)).status, 200);
            for (const concurrency of [1, 2, 4])
                await phase(name, concurrency, 100, () => request(route, token, options));
        }
        const orders: {
            id: string;
            token: string;
            body: Record<string, unknown>;
        }[] = [];
        async function checkoutFixture(variant: number) {
            const u = await db.user.create({ data: { name: 'Synthetic Load Buyer', email: randomUUID() + '@example.test', passwordHash: 'unused', cart: { create: { items: { create: { variantId: `${prefix}-v${variant}`, quantity: 1 } } } } } });
            const token = await cookie(u);
            const body = { requestId: randomUUID(), address: { recipientName: 'Dummy', phone: '0800000000', line: 'Synthetic address', city: 'Bandung', province: 'Jawa Barat', postalCode: '40100' }, shipping: { courier: 'JNE', service: 'REG', cost: 20000 }, bankAccountId: bank.id, expectedLines: [{ variantId: `${prefix}-v${variant}`, quantity: 1, unitPrice: 100000 }], expectedQuote: { subtotal: 100000, shippingCost: 20000, discount: 0, total: 120000 } };
            return { token, body };
        }
        for (const concurrency of [1, 2, 4]) {
            const fixtures = await Promise.all(Array.from({ length: 100 }, () => checkoutFixture(0)));
            const before = await db.order.count();
            const { result, samples } = await phase('checkout-create', concurrency, 100, i => request('/api/v1/orders', fixtures[i].token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fixtures[i].body) }), s => s === 201, 'checkout');
            const unique = await db.order.count() - before;
            assert.equal(unique, 100);
            Object.assign(result, { successfulOrders: unique, successfulOrdersPerSecond: unique / result.seconds });
            // Resolve each replay through its own server acknowledgement, not sample ordering.
            await phase('checkout-idempotent-replay', concurrency, 100, async (i) => {
                const r = await request('/api/v1/orders', fixtures[i].token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fixtures[i].body) });
                assert.ok(r.id);
                orders.push({ id: r.id!, ...fixtures[i] });
                return r;
            }, s => s === 201, 'replay');
            assert.equal(await db.order.count() - before, 100);
            assert.equal(new Set(samples.map(s => s.id)).size, 100);
            Object.assign(phases.at(-1)!, { successfulOrders: 0, successfulOrdersPerSecond: 0 });
        }
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9kAAAAASUVORK5CYII=', 'base64');
        await phase('payment-confirmation', 2, 100, async (i) => { const o = orders[i]; const f = new FormData(); for (const [k, v] of Object.entries({ orderId: o.id, senderBank: 'Synthetic', senderName: 'Dummy', amount: '120000', transferDate: new Date().toISOString() }))
            f.set(k, v); f.set('proof', new Blob([png], { type: 'image/png' }), 'synthetic.png'); return request('/api/v1/payments/confirm', o.token, { method: 'POST', body: f }); }, s => s === 201);
        const scarce = await Promise.all(Array.from({ length: 8 }, () => checkoutFixture(1)));
        const beforeScarce = await db.order.count();
        const oversell = await phase('scarce-inventory', 4, 8, i => request('/api/v1/orders', scarce[i].token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(scarce[i].body) }), s => s === 201 || s === 409, 'checkout');
        Object.assign(oversell.result, { successfulOrders: 3, successfulOrdersPerSecond: 3 / oversell.result.seconds });
        assert.equal(await db.order.count() - beforeScarce, 3);
        assert.equal(oversell.samples.filter(s => s.status === 201).length, 3);
        assert.deepEqual(await db.inventory.findUnique({ where: { variantId: `${prefix}-v0` }, select: { onHand: true, reserved: true } }), { onHand: 1000, reserved: 300 });
        assert.deepEqual(await db.inventory.findUnique({ where: { variantId: `${prefix}-v1` }, select: { onHand: true, reserved: true } }), { onHand: 3, reserved: 3 });
        assert.equal(await db.order.count({ where: { paymentStatus: 'WAITING_VERIFICATION' } }), 100);
        assert.equal(await db.inventory.count({ where: { OR: [{ onHand: { lt: 0 } }, { reserved: { lt: 0 } }] } }), 0);
        assert.equal(await db.order.count(), 603);
        assert.equal(await db.inventoryMovement.count({ where: { type: 'RESERVATION' } }), 303);
        const inconsistent = await db.$queryRaw<{
            n: bigint;
        }[]> `SELECT count(*) AS n FROM "Inventory" WHERE reserved > "onHand" OR reserved < 0 OR "onHand" < 0`;
        assert.equal(Number(inconsistent[0].n), 0);
        await sampleResources();
        assert.ok(resources.length >= 2, 'Resource sampling did not complete');
        completed = true;
    }
    finally {
        if (timer)
            clearInterval(timer);
        while (monitoring)
            await new Promise(r => setTimeout(r, 10));
        try {
            const ticks = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim());
            const first = resources[0], last = resources.at(-1);
            const result = { status: completed ? 'PASS' : 'FAILED', commitSha: sourceSha, sourceDirty, node: process.version, buildId: await readFile('.next/BUILD_ID', 'utf8').catch(() => null), dataset: { products: 500, variants: 500, historicalOrders: 300, newOrdersExpected: 303 }, phases, resourceSummary: { logicalCpu: availableParallelism(), hostRamBytes: totalmem(), appCpuPercentOfOneCore: first && last ? (last.cpuTicks - first.cpuTicks) / ticks / ((last.at - first.at) / 1000) * 100 : null, peakAppRssBytes: Math.max(0, ...resources.map(s => s.rssBytes)), peakDatabaseConnections: Math.max(0, ...resources.map(s => s.connections)), peakSampledLockWaiters: Math.max(0, ...resources.map(s => s.lockWaits)), sampleIntervalMs: 200 }, invariants: completed ? { duplicateOrders: 0, overselling: 0, stockConsistent: true, paymentReviewPreservesReservations: true } : null, limits: ['Local HTTP response timings; not browser LCP or production capacity', '100 samples per endpoint/concurrency: descriptive burst quantiles, not a production tail SLO', 'Node app CPU/RSS only; database CPU/RAM not attributed', '200ms sampled lock waits can miss brief waits', 'Loopback storage double; no real gateway, email or production writes'] };
            await mkdir(artifact, { recursive: true });
            await writeFile(path.join(artifact, 'performance-results.json'), JSON.stringify(result, null, 2) + '\n');
        }
        finally {
            if (server) {
                server.kill('SIGTERM');
                await new Promise<void>(resolve => { if (server!.exitCode !== null)
                    return resolve(); server!.once('exit', () => resolve()); setTimeout(() => { server!.kill('SIGKILL'); resolve(); }, 5000).unref(); });
            }
            try {
                await new Promise<void>(resolve => storage.close(() => resolve()));
            }
            finally {
                await db.$disconnect();
            }
        }
    }
    console.log('R21 local performance and financial invariants PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
