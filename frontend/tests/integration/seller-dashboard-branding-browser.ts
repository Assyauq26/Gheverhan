import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { chromium, expect } from "@playwright/test";
import { createLocalStoreBrowserFixture } from "./jnt-self-hosted-https-fixture";
import { signSession } from "../../src/lib/auth/jwt";
import { PERMISSIONS } from "../../src/lib/auth/permissions";

async function main() {
  const watchdog = setTimeout(() => { console.error("Independent seller branding fixture exceeded six minutes"); process.exit(1); }, 360000);
  watchdog.unref();
  const target = new URL(process.env.SPRINT1_TEST_DATABASE_URL || "http://invalid");
  assert.equal(target.hostname, "127.0.0.1"); assert.equal(target.pathname, "/gheverhan_sprint1_test");
  assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
  const artifact = path.resolve(process.env.SPRINT1_ARTIFACT_DIR || ".sprint1-artifacts", "seller-dashboard");
  await mkdir(artifact, { recursive: true });
  const admin = new PrismaClient({ datasources: { db: { url: target.toString() } } });
  const original = { ...process.env };
  const stores: any[] = [], results: string[] = [], errors: string[] = [];
  const browser = await chromium.launch({ executablePath: process.env.SPRINT1_CHROMIUM_PATH || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined) });
  try {
    for (const [index, name] of ["Toko Mawar", "Fashion Kita"].entries()) {
      const fixture = await createLocalStoreBrowserFixture(process.cwd(), admin, target, {
        id: `${index ? "990" : "880"}e8400-e29b-41d4-a716-446655440000`, domain: index ? "fashion-kita.example" : "toko-mawar.example",
        tlsPort: index ? 3122 : 3112, internalPort: index ? 3123 : 3113, proxyPort: index ? 3124 : 3114,
      });
      const db = new PrismaClient({ datasources: { db: { url: fixture.database } } });
      const store: any = { fixture, db, name }; stores.push(store);
      const role = await db.role.upsert({ where: { name: "Admin" }, create: { name: "Admin", label: "Admin" }, update: {} });
      for (const key of Object.values(PERMISSIONS)) {
        const permission = await db.permission.upsert({ where: { key }, create: { key, label: key }, update: {} });
        await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, create: { roleId: role.id, permissionId: permission.id }, update: {} });
      }
      const user = await db.user.create({ data: { name: "Synthetic owner", email: `${randomUUID()}@example.test`, passwordHash: "synthetic", roles: { create: { roleId: role.id } } } });
      const customer = await db.user.create({ data: { name: "Synthetic customer", email: `${randomUUID()}@example.test`, passwordHash: "synthetic" } });
      const env = { ...original, ...fixture.env, DIRECT_URL: undefined, JETSELLER_STORE_DISPLAY_NAME: name,
        JWT_SECRET: randomBytes(48).toString("hex"), REGION_DATA_MODE: "snapshot", MAINTENANCE_MODE: "0", REGISTRATION_OTP_CLEANUP_DISABLED: "1",
        JNT_INTEGRATION_ENCRYPTION_KEY: randomBytes(32).toString("base64"), JNT_PRODUCTION_API_APPROVED: "no" };
      await mkdir(fixture.env.STORAGE_LOCAL_ROOT, { recursive: true, mode: 0o700 });
      const log = createWriteStream(path.join(artifact, `store-${index}.log`));
      const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(fixture.internalPort)], { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      child.stdout!.pipe(log); child.stderr!.pipe(log);
      Object.assign(store, { child, log });
      const contextOptions = { proxy: { server: fixture.proxy }, ignoreHTTPSErrors: true };
      const context = await browser.newContext(contextOptions);
      // Trust relaxation is restricted to this synthetic loopback TLS fixture, never runtime code.
      Object.assign(process.env, env); delete process.env.DIRECT_URL;
      const token = await signSession({ sub: user.id, email: user.email });
      await context.addCookies([{ name: fixture.cookieName, value: token, domain: fixture.domain, path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
      const customerContext = await browser.newContext(contextOptions);
      await customerContext.addCookies([{ name: fixture.cookieName, value: await signSession({ sub: customer.id, email: customer.email }), domain: fixture.domain, path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
      const guest = await browser.newContext(contextOptions);
      Object.assign(store, { context, customerContext, guest, child, log, token });
      await expect.poll(async () => { try { return (await context.request.get(fixture.origin + "/api/v1/health", { timeout: 2500 })).status(); } catch { return 0; } }, { timeout: 30000 }).toBe(200);
      assert.equal((await guest.request.get(fixture.origin + "/api/v1/admin/store-identity")).status(), 401);
      assert.equal((await customerContext.request.get(fixture.origin + "/api/v1/admin/store-identity")).status(), 403);
      assert.equal((await customerContext.request.get(fixture.origin + "/api/v1/admin/integrations/jnt")).status(), 403);
      assert.equal((await context.request.get(fixture.origin + "/api/v1/admin/store-identity?installationId=foreign")).status(), 422);
    }
    const [a, b] = stores;
    const page = await a.context.newPage(); page.on("pageerror", (e: Error) => errors.push(e.message));
    const otherTab = await a.context.newPage(); await otherTab.goto(a.fixture.origin + "/admin");
    const pageB = await b.context.newPage(); await pageB.goto(b.fixture.origin + "/admin");
    await expect(pageB.getByTestId("dashboard-wordmark").first()).toContainText("Fashion Kita");
    await page.goto(a.fixture.origin + "/admin/customize");
    // Use the real seller's editor and server action, not a mocked save response.
    await page.getByLabel("Nama toko", { exact: true }).fill("Mawar Baru");
    await page.getByRole("button", { name: "Simpan Draft", exact: true }).click();
    await expect(page.getByTestId("dashboard-wordmark").first()).toContainText("Mawar Baru");
    await otherTab.bringToFront();
    await expect(otherTab.getByTestId("dashboard-wordmark").first()).toContainText("Mawar Baru", { timeout: 15000 });
    await expect(page).toHaveTitle(/Mawar Baru/);
    const guestPage = await a.guest.newPage(); await guestPage.goto(a.fixture.origin + "/login?redirectTo=/admin");
    await expect(guestPage.locator(".auth-wordmark")).toContainText("Toko Mawar");
    await expect(guestPage).not.toHaveTitle(/Mawar Baru/);
    const publicPage = await a.guest.newPage(); await publicPage.goto(a.fixture.origin + "/");
    await expect(publicPage.getByTestId("logo")).toHaveAttribute("aria-label", "Toko Mawar");
    results.push("real Save Draft immediately updates admin, title and second tab; anonymous login remains published");
    async function command(kind: string, extra: object = {}) {
      const snapshot = (await (await a.context.request.get(a.fixture.origin + "/api/v1/admin/store-appearance")).json()).data;
      const response = await a.context.request.post(a.fixture.origin + "/api/v1/admin/store-appearance", { headers: { Origin: a.fixture.origin }, data: { kind, draftVersion: snapshot.draftVersion, publishedVersion: snapshot.publishedVersion, ...extra } });
      assert.equal(response.status(), 200, await response.text());
      return (await response.json()).data;
    }
    page.on("dialog", (d: any) => d.accept());
    await page.bringToFront();
    await page.getByRole("button", { name: "Terbitkan", exact: true }).click();
    await expect.poll(async () => (await (await a.guest.request.get(a.fixture.origin + "/api/v1/store-appearance/version")).json()).version).toBe(1);
    await guestPage.reload(); await expect(guestPage.locator(".auth-wordmark")).toContainText("Mawar Baru");
    await publicPage.reload(); await expect(publicPage.getByTestId("logo")).toHaveAttribute("aria-label", "Mawar Baru");
    await expect(guestPage).toHaveTitle(/Mawar Baru/);
    results.push("Publish updates published identity and login metadata without deployment");
    const logo = await sharp({ create: { width: 160, height: 64, channels: 4, background: "#111111" } }).png().toBuffer();
    const upload = await a.context.request.post(a.fixture.origin + "/api/v1/admin/store-branding", { headers: { Origin: a.fixture.origin }, multipart: { image: { name: "synthetic.png", mimeType: "image/png", buffer: logo }, requestId: randomUUID() } });
    assert.equal(upload.status(), 200, await upload.text()); const logoId = (await upload.json()).data.id;
    const snapshot = (await (await a.context.request.get(a.fixture.origin + "/api/v1/admin/store-appearance")).json()).data;
    await command("save", { config: { ...snapshot.config, identity: { ...snapshot.config.identity, mode: "both", logoAssetId: logoId } } });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByTestId("dashboard-wordmark").first().locator("img")).toBeVisible();
    assert.equal((await a.context.request.get(a.fixture.origin + "/api/v1/admin/store-identity/logo?id=" + logoId)).status(), 200);
    assert.equal((await a.guest.request.get(a.fixture.origin + "/api/v1/store-branding/" + logoId)).status(), 404);
    assert.equal((await b.context.request.get(b.fixture.origin + "/api/v1/admin/store-identity/logo?id=" + logoId)).status(), 404);
    await command("publish");
    assert.equal((await a.guest.request.get(a.fixture.origin + "/api/v1/store-branding/" + logoId)).status(), 200);
    results.push("saved draft logo is private, published logo becomes public, foreign installation cannot read it");
    await command("rollback", { revision: 0 });
    await guestPage.reload(); await expect(guestPage.locator(".auth-wordmark")).toContainText("Toko Mawar");
    await publicPage.reload(); await expect(publicPage.getByTestId("logo")).toHaveAttribute("aria-label", "Toko Mawar");
    // Rollback intentionally preserves draft; Discard then adopts the rolled-back published identity.
    await command("discard"); await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByTestId("dashboard-wordmark").first()).toContainText("Toko Mawar");
    await command("reset"); await page.reload(); await expect(page.getByTestId("dashboard-wordmark").first()).toContainText("Toko Mawar");
    await pageB.reload(); await expect(pageB.getByTestId("dashboard-wordmark").first()).toContainText("Fashion Kita");
    await expect(pageB.locator("body")).not.toContainText("Mawar Baru");
    const forged = await browser.newContext({ proxy: { server: b.fixture.proxy }, ignoreHTTPSErrors: true });
    await forged.addCookies([{ name: b.fixture.cookieName, value: a.token, domain: b.fixture.domain, path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
    assert.equal((await forged.request.get(b.fixture.origin + "/api/v1/admin/store-identity")).status(), 401); await forged.close();
    results.push("rollback/discard/reset preserve correct identities; separate DB/key/domain sessions reject cross-store access");
    for (const width of [320, 360, 390, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await page.goto(a.fixture.origin + "/admin");
      await expect(page.locator('[data-testid="dashboard-wordmark"]:visible')).toContainText("Toko Mawar");
      if (width < 768) {
        const nav = page.getByRole("navigation", { name: "Navigasi bawah admin" });
        assert.equal(await nav.locator(":scope > div > a, :scope > div > details").count(), 5);
        await nav.getByText("Lainnya", { exact: true }).click();
        await nav.getByRole("link", { name: "Integrasi", exact: true }).click();
      } else await page.getByRole("navigation", { name: "Navigasi admin" }).getByRole("link", { name: "Integrasi", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Integrasi", exact: true })).toBeVisible();
      await page.getByRole("link", { name: "Atur J&T Express", exact: true }).click();
      await expect(page.getByRole("heading", { name: "J&T Express", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Sandbox", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Uji Check Fee", exact: true })).toBeDisabled();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.evaluate(() => scrollTo(0, 0));
      if ([390, 1440].includes(width)) await page.screenshot({ path: path.join(artifact, `seller-${width}.png`), fullPage: true });
      results.push(`Integrasi hierarchy, five mobile controls and no overflow at ${width}px`);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${results.length} independent-store dashboard branding checks`);
  } finally {
    await writeFile(path.join(artifact, "results.json"), JSON.stringify({ results, errors }, null, 2));
    await browser.close();
    for (const store of stores) { store.child?.kill(); await store.db.$disconnect(); await store.fixture.close(); store.log?.end(); }
    await admin.$disconnect();
    clearTimeout(watchdog);
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
