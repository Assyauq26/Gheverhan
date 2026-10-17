import { spawn, execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, createWriteStream, readFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { chromium, expect, type Request } from '@playwright/test';
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
let checkpoint = 'fixture-setup';
const checkpoints: Array<{ label: string; status: 'PASS' | 'FAILED' }> = [];
async function check(label: string, run: () => Promise<void>) {
  checkpoint = label;
  try { await run(); checks++; checkpoints.push({ label, status: 'PASS' }); console.log(`PASS ${label}`); }
  catch (error) { checkpoints.push({ label, status: 'FAILED' }); throw error; }
}
async function main() {
  await mkdir(artifacts, { recursive: true });
  const role = await db.role.upsert({ where: { name: 'Admin' }, create: { name: 'Admin', label: 'Admin' }, update: {} });
  for (const key of Object.values(PERMISSIONS)) {
    const permission = await db.permission.upsert({ where: { key }, create: { key, label: key }, update: {} });
    await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, create: { roleId: role.id, permissionId: permission.id }, update: {} });
  }
  const user = await db.user.create({ data: { id: prefix, name: 'Navigation Fixture', email: `${prefix}@example.test`, passwordHash: 'isolated-fixture', roles: { create: { roleId: role.id } } } });
  for (let i = 0; i < 25; i++) await db.product.create({ data: { id: `${prefix}-${i}`, name: `${prefix} Product ${i}`, slug: `${prefix}-${i}`, status: 'PUBLISHED', basePrice: 100000 + i * 1000, variants: { create: { id: `${prefix}-variant-${i}`, sku: `${prefix}-sku-${i}`, inventory: { create: { onHand: 10 } } } } } });
  const log = createWriteStream(path.join(artifacts, 'server.log'));
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3116'], { cwd: root, env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: target, DIRECT_URL: target, JWT_SECRET: secret }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.pipe(log); server.stderr.pipe(log);
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const errors: string[] = [];
  const probeFlushes: Array<() => Promise<void>> = [];
  const browserErrors: Array<{ viewport: number; checkpoint: string; path: string; message: string; stack?: string }> = [];
  const transport: Array<{ viewport: number; events: string[] }> = [];
  let browserVersion: string | undefined;
  let completed = false;
  const timings: Array<{ viewport: number; pendingFeedbackMs: number; imposedResponseDelayMs: number }> = [];
  try {
    for (let n = 0; ; n++) {
      if (server.exitCode !== null || n > 60) throw new Error('Server startup failed; inspect server.log');
      try { if ((await fetch(`${base}/api/v1/health`)).ok) break; } catch { /* startup */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ executablePath: process.env.SPRINT1_CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox'] });
    browserVersion = browser.version();
    for (const width of [390, 768, 1024, 1360]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.route('**/*', async route => {
        if (new URL(route.request().url()).hostname !== 'localhost') return route.abort();
        if (route.request().headers()['rsc'] === '1' && !route.request().headers()['next-router-prefetch']) await new Promise(resolve => setTimeout(resolve, 600));
        await route.continue();
      });
      if (process.env.R19_PASSIVE_HYDRATION_PROBE === '1') {
        const { installPassiveHydrationProbe } = await import('./passive-hydration-probe');
        probeFlushes.push(await installPassiveHydrationProbe(context, artifacts, width));
      }
      await context.addCookies([{ name: 'gh_session', value: await signSession({ sub: user.id, email: user.email }), domain: 'localhost', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
      const page = await context.newPage();
      page.on('pageerror', e => {
        const message = e.message;
        const route = new URL(page.url()).pathname;
        // Keep strict failure, but retain route context for intermittent #418.
        const safe = `viewport=${width}px path=${route} error=${message.slice(0, 300)}`;
        errors.push(safe);
        // This suite uses synthetic local fixtures only. Preserve the complete
        // React diagnostic and stack in local artifacts; the short console
        // summary above may truncate the useful part of a hydration failure.
        browserErrors.push({ viewport: width, checkpoint, path: route, message, stack: e.stack });
        console.error('[browser-error] ' + safe);
      });
      // Read-only diagnostic: log RSC state without cookies, headers or query values.
      // Prefetch and navigation may share a URL. Key by request identity so an
      // aborted prefetch cannot remove a different in-flight navigation.
      const rsc = new Map<Request, { path: string; started: number }>();
      const rscEvents: string[] = [];
      transport.push({ viewport: width, events: rscEvents });
      page.on('request', request => {
        if (request.headers()['rsc'] !== '1') return;
        const path = new URL(request.url()).pathname;
        rsc.set(request, { path, started: Date.now() });
        rscEvents.push('start ' + path);
      });
      page.on('response', response => {
        const start = rsc.get(response.request());
        if (start) rscEvents.push('response ' + start.path + ' ' + response.status() + ' ' + (Date.now() - start.started) + 'ms');
      });
      page.on('requestfinished', request => {
        const start = rsc.get(request);
        if (start) { rscEvents.push('finished ' + start.path); rsc.delete(request); }
      });
      page.on('requestfailed', request => {
        const start = rsc.get(request);
        if (start) { rscEvents.push('failed ' + start.path + ' ' + (request.failure()?.errorText ?? 'unknown')); rsc.delete(request); }
      });
      await page.goto(`${base}/admin`); await page.waitForLoadState('networkidle');
      await check(`${width}px: dashboard visual structure, responsive KPI grid and navigation`, async () => {
        await expect(page.getByRole('region', { name: 'Sambutan dashboard' })).toBeVisible();
        await expect(page.getByText('Selamat datang kembali,')).toBeVisible();
        await expect(page.getByRole('region', { name: 'Ringkasan penjualan' })).toBeVisible();
        await expect(page.getByRole('banner').locator('nav')).toHaveCount(0);
        // Persist screenshot before geometry assertions so failures remain visually diagnosable.
        await page.screenshot({ path: path.join(artifacts, `${width}-dashboard.png`), fullPage: true });
        const rects = [];
        for (const id of ['dashboard-products', 'dashboard-stock', 'dashboard-orders', 'dashboard-sales']) {
          const metric = page.getByTestId(id);
          await expect(metric).toBeVisible();
          const rect = await metric.boundingBox();
          assert.ok(rect && rect.width > 30 && rect.height > 15, `Visible KPI geometry required: ${id}`);
          rects.push(rect);
        }
        const revenue = await page.getByTestId('dashboard-sales').evaluate(node => {
          const style = getComputedStyle(node);
          return { height: node.getBoundingClientRect().height, lineHeight: parseFloat(style.lineHeight) };
        });
        assert.ok(revenue.height <= revenue.lineHeight * 1.15, `Paid sales figure must not wrap across lines at ${width}px (height=${revenue.height}, lineHeight=${revenue.lineHeight})`);
        if (width < 1280) {
          assert.ok(Math.abs(rects[0].y - rects[1].y) <= 4, 'First mobile KPI row must align');
          assert.ok(Math.abs(rects[2].y - rects[3].y) <= 4, `Second mobile KPI row must align (orders y=${rects[2].y}, sales y=${rects[3].y})`);
          assert.ok(rects[2].y > rects[0].y + 40, 'Mobile KPI cards must form two rows');
          if (width === 390) {
            await expect(page.getByRole('heading', { name: 'Ringkasan Toko' })).toBeVisible();
            await expect(page.locator('nav[aria-label="Navigasi bawah admin"]')).toBeVisible();
            await expect(page.locator('aside[aria-label="Sidebar admin"]')).toBeHidden();
          } else {
            await expect(page.locator('aside[aria-label="Sidebar admin"]')).toBeVisible();
            await expect(page.locator('nav[aria-label="Navigasi bawah admin"]')).toBeHidden();
          }
        } else {
          assert.ok(Math.max(...rects.map(rect => rect.y)) - Math.min(...rects.map(rect => rect.y)) <= 4, 'Four desktop KPI cards must align in one row');
          await expect(page.locator('aside[aria-label="Sidebar admin"]')).toBeVisible();
          await expect(page.locator('nav[aria-label="Navigasi bawah admin"]')).toBeHidden();
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Dashboard must not overflow viewport horizontally');
        if (width === 390) {
          await page.setViewportSize({ width: 768, height: 900 });
          await expect(page.locator('aside[aria-label="Sidebar admin"]')).toBeVisible();
          await expect(page.locator('nav[aria-label="Navigasi bawah admin"]')).toBeHidden();
          await expect(page.getByRole('banner').locator('nav')).toHaveCount(0);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Tablet dashboard must not overflow');
          await page.screenshot({ path: path.join(artifacts, '768-dashboard.png'), fullPage: true });
          await page.setViewportSize({ width, height: 900 });
        }
      });
      await page.evaluate(() => { (window as unknown as { shellMarker: string }).shellMarker = 'preserved'; });
      await check(`${width}px: navigation has immediate feedback and preserves document`, async () => {
        const link = page.getByTestId('adminnav-produk').filter({ visible: true });
        const start = performance.now(); await link.click();
        await expect(page.getByTestId('navigation-pending')).toBeVisible();
        timings.push({ viewport: width, pendingFeedbackMs: performance.now()-start, imposedResponseDelayMs: 600 });
        await expect(page.getByRole('heading', { name: 'Produk', exact: true })).toBeVisible();
        await expect(page.getByRole('banner').locator('nav')).toHaveCount(0);
        const bottomNav = page.locator('nav[aria-label="Navigasi bawah admin"]');
        const sidebar = page.locator('aside[aria-label="Sidebar admin"]');
        if (width === 390) {
          await expect(bottomNav).toBeVisible();
          await expect(sidebar).toBeHidden();
          await page.setViewportSize({ width: 768, height: 900 });
          await expect(page.getByRole('banner').locator('nav')).toHaveCount(0);
          await expect(sidebar).toBeVisible();
          await expect(bottomNav).toBeHidden();
          await page.setViewportSize({ width, height: 900 });
        } else {
          await expect(sidebar).toBeVisible();
          await expect(bottomNav).toBeHidden();
        }
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
        // Admin products pagination must use the same shared transition feedback
        // as inventory pagination and search; do not silently fall back to an
        // unobserved separate NextLink transition.
        await expect(page.getByTestId('navigation-pending')).toBeVisible();
        // The production Next.js server can take >5s to settle a filtered RSC
        // navigation under the shared CI runner. Keep the real content assertion
        // and require the loading indicator to clear; never use fixed sleeps.
        try {
          await expect(page.getByText('Halaman 2 dari 2')).toBeVisible({ timeout: 15_000 });
        } catch (error) {
          // Diagnose whether the browser received a completed RSC response or
          // whether the server itself fails even on direct (read-only) GET.
          const direct = await page.request.get(`${base}/admin/products?q=${prefix}&page=2`, { timeout: 8_000 }).catch(() => null);
          console.error('[pagination-diagnostic] ' + JSON.stringify({
            viewport: width, pathname: new URL(page.url()).pathname,
            currentPage: new URL(page.url()).searchParams.get('page') || '1',
            directStatus: direct?.status() ?? 'timeout',
            directHasSecondPage: direct ? (await direct.text()).replace(/<!--[\s\S]*?-->/g, '').includes('Halaman 2 dari 2') : false,
            inFlightRsc: [...rsc.values()].map(req => ({ path: req.path, ageMs: Date.now() - req.started })),
            recentRscEvents: rscEvents.slice(-20),
          }));
          throw error;
        }
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
        await expect(page.getByRole('banner').locator('nav')).toHaveCount(0);
        const box = await active.boundingBox(); assert.ok(box && box.x >= 0 && box.x+box.width <= width, 'active menu is in view');
        const input = await page.getByPlaceholder('Cari produk atau SKU').boundingBox();
        assert.ok(input && input.width >= 180, 'mobile search remains readable');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
        await page.screenshot({ path: path.join(artifacts, `${width}-inventory.png`), fullPage: true });
        await page.getByRole('link', { name: 'Sebelumnya', exact: true }).click();
        await expect(page.getByText('Halaman 1 dari 2')).toBeVisible();
        await page.getByRole('link', { name: 'Berikutnya', exact: true }).click();
        await expect(page.getByText('Halaman 2 dari 2')).toBeVisible();
        await expect(page.getByTestId('navigation-pending')).toHaveCount(0);
      });
      await check(`${width}px: other admin sections have no duplicate scrolling header menu`, async () => {
        for (const adminRoute of ['/admin/orders', '/admin/marketing', '/admin/categories']) {
          await page.goto(`${base}${adminRoute}`);
          await expect(page.getByRole('banner')).toBeVisible();
          await expect(page.getByRole('banner').locator('nav')).toHaveCount(0);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${adminRoute} overflows at ${width}px`);
        }
      });
      await check(`${width}px: shop pagination exposes later catalog items`, async () => {
        await page.goto(`${base}/shop?q=${prefix}`);
        await expect(page.getByTestId('product-pagination')).toBeVisible();
        await expect(page.getByRole('link', { name: 'Berikutnya' })).toHaveAttribute('href', /page=2/);
        await page.getByRole('link', { name: 'Berikutnya' }).click();
        try {
          // Keep the original strict assertion; diagnose the transport on
          // failure rather than hiding an intermittent navigation regression.
          await expect(page.getByText('Halaman 2 dari 3')).toBeVisible();
        } catch (error) {
          const direct = await page.request.get(`${base}/shop?q=${prefix}&page=2`, { timeout: 8_000 }).catch(() => null);
          console.error('[storefront-pagination-diagnostic] ' + JSON.stringify({
            viewport: width,
            pathname: new URL(page.url()).pathname,
            currentPage: new URL(page.url()).searchParams.get('page') || '1',
            directStatus: direct?.status() ?? 'timeout',
            directHasSecondPage: direct ? (await direct.text()).replace(/<!--[\s\S]*?-->/g, '').includes('Halaman 2 dari 3') : false,
            inFlightRsc: [...rsc.values()].map(req => ({ path: req.path, ageMs: Date.now() - req.started })),
            recentRscEvents: rscEvents.slice(-20),
          }));
          throw error;
        }
        assert.equal(new URL(page.url()).searchParams.get('q'), prefix);
        await page.goBack();
        await expect(page.getByText('Halaman 1 dari 3')).toBeVisible();
        await page.goForward(); await expect(page.getByText('Halaman 2 dari 3')).toBeVisible();
        await page.goBack(); await expect(page.getByText('Halaman 1 dari 3')).toBeVisible();
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
      await check(`${width}px: sorting, detail, wishlist and add-to-cart retain real server state`, async () => {
        const fixtureIndex = [390, 768, 1024, 1360].indexOf(width);
        const productId = `${prefix}-${fixtureIndex}`;
        const variantId = `${prefix}-variant-${fixtureIndex}`;
        await page.goto(`${base}/shop?q=${prefix}`);
        await page.getByRole('link', { name: 'Harga Terendah', exact: true }).click();
        await expect(page.getByTestId(/^product-card-/).first()).toHaveAttribute('data-testid', `product-card-${prefix}-0`);
        assert.equal(new URL(page.url()).searchParams.get('sort'), 'price_asc');
        assert.equal(new URL(page.url()).searchParams.get('q'), prefix);
        await page.getByRole('link', { name: 'Harga Tertinggi', exact: true }).click();
        await expect(page.getByTestId(/^product-card-/).first()).toHaveAttribute('data-testid', `product-card-${prefix}-24`);
        await page.getByRole('link', { name: 'Harga Terendah', exact: true }).click();
        const card = page.getByTestId(`product-card-${productId}`);
        await card.getByRole('link', { name: `${prefix} Product ${fixtureIndex}`, exact: true }).click();
        await expect(page.getByRole('heading', { name: `${prefix} Product ${fixtureIndex}`, exact: true, level: 1 })).toBeVisible();
        assert.equal(new URL(page.url()).pathname, `/product/${productId}`);
        await page.goBack(); await expect(card).toBeVisible();
        await card.getByTestId(`wishlist-toggle-${productId}`).click();
        await expect.poll(() => db.wishlistItem.count({ where: { productId, wishlist: { userId: user.id } } })).toBe(1);
        await page.getByTestId('header-wishlist').click();
        await expect(page.getByTestId(`product-card-${productId}`)).toBeVisible();
        await page.goto(`${base}/shop?q=${prefix}&sort=price_asc`);
        await page.getByTestId(`quick-add-${variantId}`).click();
        await expect.poll(() => db.cartItem.findFirst({ where: { variantId, cart: { userId: user.id } }, select: { quantity: true } }).then(item => item?.quantity)).toBe(1);
        await page.getByTestId('header-cart').click();
        await expect(page.getByRole('heading', { name: 'Keranjang', exact: true })).toBeVisible();
        await expect(page.getByText(`${prefix} Product ${fixtureIndex}`, { exact: true })).toBeVisible();
        await expect(page.getByTestId('navigation-pending')).toHaveCount(0);
      });
      await check(`${width}px: keyboard and rapid navigation settle on the final destination`, async () => {
        await page.goto(`${base}/admin`);
        const products = page.getByTestId('adminnav-produk').filter({ visible: true });
        const inventory = page.getByTestId('adminnav-inventori').filter({ visible: true });
        await products.focus(); await products.press('Enter');
        await expect(page.getByTestId('navigation-pending')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Produk', exact: true })).toBeVisible();
        await expect(page.getByTestId('navigation-pending')).toHaveCount(0);
        await inventory.click(); await products.click(); await inventory.click();
        await expect(page.getByRole('heading', { name: 'Inventori', exact: true })).toBeVisible();
        await expect(page.getByTestId('navigation-pending')).toHaveCount(0);
        assert.equal(new URL(page.url()).pathname, '/admin/inventory');
      });
      await check(`${width}px: a failed RSC transport recovers and later links remain usable`, async () => {
        await page.goto(`${base}/shop?q=${prefix}`);
        let failedRsc = false;
        const failOnce: Parameters<typeof context.route>[1] = async route => {
          const request = route.request();
          if (!failedRsc && request.headers()['rsc'] === '1' && !request.headers()['next-router-prefetch']) {
            failedRsc = true; await route.abort('failed');
          } else await route.fallback();
        };
        await context.route('**/shop?**', failOnce);
        try {
          await page.getByRole('link', { name: 'Harga Tertinggi', exact: true }).click();
          await expect(page).toHaveURL(/[?&]sort=price_desc(?:&|$)/);
          await expect(page.getByTestId(/^product-card-/).first()).toHaveAttribute('data-testid', `product-card-${prefix}-24`);
          assert.equal(failedRsc, true, 'a real navigation RSC request was deliberately failed');
          assert.equal(new URL(page.url()).searchParams.get('sort'), 'price_desc');
          await expect(page.getByTestId('navigation-pending')).toHaveCount(0);
        } finally { await context.unroute('**/shop?**', failOnce); }
        await page.getByRole('link', { name: 'Harga Terendah', exact: true }).click();
        await expect(page.getByTestId(/^product-card-/).first()).toHaveAttribute('data-testid', `product-card-${prefix}-0`);
        await expect(page.getByTestId('navigation-pending')).toHaveCount(0);
      });
      await check(`${width}px: an anonymous admin request redirects to login`, async () => {
        const anonymous = await browser!.newContext({ viewport: { width, height: 900 } });
        try {
          const login = await anonymous.newPage();
          login.on('pageerror', error => { errors.push(`anonymous viewport=${width}px error=${error.message}`); browserErrors.push({ viewport: width, checkpoint, path: new URL(login.url()).pathname, message: error.message, stack: error.stack }); });
          await login.goto(`${base}/admin`);
          await expect(login).toHaveURL(/\/login\?redirectTo=/);
          assert.equal(new URL(login.url()).searchParams.get('redirectTo'), '/admin');
          await expect(login.getByRole('button', { name: 'Masuk', exact: true })).toBeVisible();
        } finally { await anonymous.close(); }
      });
      await context.close();
    }
    assert.deepEqual(errors, []);
    completed = true;
    console.log(`${checks} navigation checks PASS`);
  } finally {
    // Failed runs are the most valuable evidence. Save before closing contexts
    // and cleaning fixtures, without changing assertions, routing or timeouts.
    try {
      for (const flush of probeFlushes) await flush();
      await writeFile(path.join(artifacts, 'navigation-results.json'), JSON.stringify({
        status: completed ? 'PASS' : 'FAILED', checks, checkpoints, timings, browserVersion,
        commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        viewports: [390, 768, 1024, 1360],
        nodeVersion: process.version, buildId: readFileSync(path.join(root, '.next/BUILD_ID'), 'utf8').trim(),
        passiveHydrationProbe: process.env.R19_PASSIVE_HYDRATION_PROBE === '1',
        browserErrors, transport,
        note: 'Synthetic 600 ms RSC response delay; feedback duration includes Playwright click dispatch. Not a live latency benchmark. External images deliberately blocked. Only paths and synthetic fixture diagnostics are retained; no request headers/cookies.',
      }, null, 2));
    } finally {
      await browser?.close();
      const exited = server.exitCode === null && server.signalCode === null ? new Promise(resolve => server.once('exit', resolve)) : Promise.resolve();
      server.kill('SIGTERM'); await exited; log.end();
      // Owned fixtures only, on the explicitly guarded disposable local database.
      await db.cart.deleteMany({ where: { userId: user.id } });
      await db.wishlist.deleteMany({ where: { userId: user.id } });
      await db.inventory.deleteMany({ where: { variant: { productId: { startsWith: prefix } } } });
      await db.productVariant.deleteMany({ where: { productId: { startsWith: prefix } } });
      await db.product.deleteMany({ where: { id: { startsWith: prefix } } });
      await db.user.delete({ where: { id: user.id } });
    }
  }
}
main().finally(() => db.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
