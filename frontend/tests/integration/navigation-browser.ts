import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { chromium, expect } from '@playwright/test';
import { signSession } from '../../src/lib/auth/jwt';
import { PERMISSIONS } from '../../src/lib/auth/permissions';

const target = process.env.SPRINT1_TEST_DATABASE_URL;
if (!target) throw new Error('Explicit isolated test database is required');
const parsed = new URL(target);
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.pathname !== '/gheverhan_sprint1_test') throw new Error('Browser regression refuses non-local/test database');
const db = new PrismaClient({ datasources: { db: { url: target } } });
const root = process.cwd(); const base = 'http://localhost:3116';
const artifacts = process.env.SPRINT1_ARTIFACT_DIR || `/tmp/gheverhan-navigation-${process.pid}`;
const prefix = `nav2d-${randomUUID().slice(0, 8)}`;
const secret = randomBytes(32).toString('hex'); process.env.JWT_SECRET = secret;
let checks = 0;
async function check(label: string, run: () => Promise<void>) { await run(); checks++; console.log(`PASS ${label}`); }
async function main() {
  await mkdir(artifacts, { recursive: true });
  const role = await db.role.upsert({ where: { name: 'Admin' }, create: { name: 'Admin', label: 'Admin' }, update: {} });
  for (const key of Object.values(PERMISSIONS)) {
    const permission = await db.permission.upsert({ where: { key }, create: { key, label: key }, update: {} });
    await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, create: { roleId: role.id, permissionId: permission.id }, update: {} });
  }
  const user = await db.user.create({ data: { id: prefix, name: 'Navigation Fixture', email: `${prefix}@example.test`, passwordHash: 'isolated-fixture', roles: { create: { roleId: role.id } } } });
  for (let i = 0; i < 25; i++) await db.product.create({ data: { id: `${prefix}-${i}`, name: `${prefix} Product ${i}`, slug: `${prefix}-${i}`, status: 'PUBLISHED', basePrice: 100000, variants: { create: { id: `${prefix}-variant-${i}`, sku: `${prefix}-sku-${i}`, inventory: { create: { onHand: 10 } } } } } });
  const log = createWriteStream(path.join(artifacts, 'server.log'));
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3116'], { cwd: root, env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: target, DIRECT_URL: target, JWT_SECRET: secret }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.pipe(log); server.stderr.pipe(log);
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const errors: string[] = [];
  const timings: Array<{ viewport: number; pendingFeedbackMs: number; imposedResponseDelayMs: number }> = [];
  try {
    for (let n = 0; ; n++) {
      if (server.exitCode !== null || n > 60) throw new Error('Server startup failed; inspect server.log');
      try { if ((await fetch(`${base}/api/v1/health`)).ok) break; } catch { /* startup */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ executablePath: process.env.SPRINT1_CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox'] });
    for (const width of [390, 1360]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.route('**/*', async route => {
        if (new URL(route.request().url()).hostname !== 'localhost') return route.abort();
        if (route.request().headers()['rsc'] === '1' && !route.request().headers()['next-router-prefetch']) await new Promise(resolve => setTimeout(resolve, 600));
        await route.continue();
      });
      await context.addCookies([{ name: 'gh_session', value: await signSession({ sub: user.id, email: user.email }), domain: 'localhost', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${base}/admin`); await page.waitForLoadState('networkidle');
      await page.evaluate(() => { (window as unknown as { shellMarker: string }).shellMarker = 'preserved'; });
      await check(`${width}px: navigation has immediate feedback and preserves document`, async () => {
        const link = page.getByTestId('adminnav-produk').filter({ visible: true });
        const start = performance.now(); await link.click();
        await expect(page.getByTestId('navigation-pending')).toBeVisible();
        timings.push({ viewport: width, pendingFeedbackMs: performance.now()-start, imposedResponseDelayMs: 600 });
        await expect(page.getByRole('heading', { name: 'Produk', exact: true })).toBeVisible();
        await expect(page.getByTestId('navigation-pending')).toHaveCount(0);
        assert.equal(await page.evaluate(() => (window as unknown as { shellMarker: string }).shellMarker), 'preserved');
      });
      await check(`${width}px: filters, pagination and history retain state without document reload`, async () => {
        await page.getByPlaceholder('Cari nama atau slug produk').fill(prefix);
        await page.getByRole('button', { name: 'Cari', exact: true }).click();
        await expect(page.locator('main').getByRole('search')).toHaveAttribute('aria-busy', 'true');
        await expect(page.locator('main').getByRole('search').getByRole('button', { name: 'Cari', exact: true })).toBeDisabled();
        await expect(page.getByText('25 produk · kelola katalog toko Gheverhan.')).toBeVisible();
        await expect(page.getByTestId('navigation-pending')).toHaveCount(0);
        await expect(page.getByRole('link', { name: 'Berikutnya' })).toHaveAttribute('href', new RegExp(`q=${prefix}.*page=2`));
        await page.getByRole('link', { name: 'Berikutnya' }).click();
        // The production Next.js server can take >5s to settle a filtered RSC
        // navigation under the shared CI runner. Keep the real content assertion
        // and require the loading indicator to clear; never use fixed sleeps.
        await expect(page.getByText('Halaman 2 dari 2')).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId('navigation-pending')).toHaveCount(0, { timeout: 15_000 });
        assert.equal(new URL(page.url()).searchParams.get('q'), prefix);
        assert.equal(await page.evaluate(() => (window as unknown as { shellMarker: string }).shellMarker), 'preserved');
        await page.goBack(); await expect(page.getByText('Halaman 1 dari 2')).toBeVisible();
        await expect(page.getByPlaceholder('Cari nama atau slug produk')).toHaveValue(prefix);
      });
      await check(`${width}px: inventory query conflict clamp and active navigation remain usable`, async () => {
        await page.goto(`${base}/admin/inventory?q=${prefix}&page=9999`);
        await expect(page.getByText('Halaman 2 dari 2')).toBeVisible();
        const active = page.getByTestId('adminnav-inventori').filter({ visible: true });
        await expect(active).toHaveAttribute('aria-current', 'page');
        const box = await active.boundingBox(); assert.ok(box && box.x >= 0 && box.x+box.width <= width, 'active menu is in view');
        const input = await page.getByPlaceholder('Cari produk atau SKU').boundingBox();
        assert.ok(input && input.width >= 180, 'mobile search remains readable');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
        await page.screenshot({ path: path.join(artifacts, `${width}-inventory.png`), fullPage: true });
      });
      await check(`${width}px: shop pagination exposes later catalog items`, async () => {
        await page.goto(`${base}/shop?q=${prefix}`);
        await expect(page.getByTestId('product-pagination')).toBeVisible();
        await expect(page.getByRole('link', { name: 'Berikutnya' })).toHaveAttribute('href', /page=2/);
        await page.getByRole('link', { name: 'Berikutnya' }).click();
        await expect(page.getByText('Halaman 2 dari 3')).toBeVisible();
        assert.equal(new URL(page.url()).searchParams.get('q'), prefix);
        await page.goBack();
        await expect(page.getByText('Halaman 1 dari 3')).toBeVisible();
        await page.goto(`${base}/shop?q=${prefix}&page=999`);
        await expect(page.getByText('Halaman 3 dari 3')).toBeVisible();
        await expect(page.getByText(`${prefix} Product 0`)).toBeVisible();
      });
      await check(`${width}px: storefront navigation, search touch target and back/forward work`, async () => {
        await page.goto(`${base}/shop?q=${prefix}`); await page.waitForLoadState('networkidle');
        const search = page.getByTestId('search-bar').filter({ visible: true });
        await expect(search.getByLabel('Cari katalog')).toHaveValue(prefix);
        const button = await search.getByRole('button', { name: 'Cari', exact: true }).boundingBox(); assert.ok(button && button.width >= 44 && button.height >= 44);
        await search.getByLabel('Cari katalog').fill(`${prefix} Product 1`);
        await search.getByRole('button', { name: 'Cari', exact: true }).click();
        await expect(page.getByRole('heading', { name: /Hasil untuk/ })).toBeVisible();
        await page.goBack(); await expect(page.getByRole('heading', { name: 'Semua Produk' })).toBeVisible();
        await expect(page.getByTestId('search-bar').filter({ visible: true }).getByLabel('Cari katalog')).toHaveValue(prefix);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: path.join(artifacts, `${width}-shop.png`), fullPage: true });
      });
      await context.close();
    }
    assert.deepEqual(errors, []);
    await writeFile(path.join(artifacts, 'navigation-results.json'), JSON.stringify({ checks, timings, browserErrors: errors, note: 'Synthetic 600 ms RSC response delay; feedback duration includes Playwright click dispatch. Not a live latency benchmark. External images deliberately blocked.' }, null, 2));
    console.log(`${checks} navigation checks PASS`);
  } finally {
    await browser?.close(); server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)); log.end();
    // Owned fixtures only, on the explicitly guarded disposable local database.
    await db.inventory.deleteMany({ where: { variant: { productId: { startsWith: prefix } } } });
    await db.productVariant.deleteMany({ where: { productId: { startsWith: prefix } } });
    await db.product.deleteMany({ where: { id: { startsWith: prefix } } });
    await db.user.delete({ where: { id: user.id } });
  }
}
main().finally(() => db.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
