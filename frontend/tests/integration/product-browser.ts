import { configureTestJnt, testAddress, apiShipping, chooseTestLocation } from "../fixtures/jnt-checkout";
import sharp from "sharp";
import { verifyFlashCampaign } from "./flash-campaign-browser";
import { verifyStorefrontV4 } from "./storefront-v4-browser";
import { verifyNativePurchase } from "./native-purchase-browser";
import { verifyStoreAppearance } from "./store-appearance-browser";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync, createWriteStream, readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { chromium, expect } from "@playwright/test";
import { signSession } from "../../src/lib/auth/jwt";
import { verifyNativeProductEditor } from "./product-native-browser";
import { verifyProductEditorV2 } from "./product-editor-v2-browser";
import { verifyCustomVariations } from "./custom-variations-browser";
import { verifyDirectCheckout } from "./direct-checkout-browser";
import { verifyCartSynchronization } from "./cart-sync-browser";
import { PERMISSIONS } from "../../src/lib/auth/permissions";
import { verifyV5Checkout } from "./checkout-v5-browser";

configureTestJnt();
const target = process.env.SPRINT1_TEST_DATABASE_URL;
if (!target) throw new Error("SPRINT1_TEST_DATABASE_URL is required; use a disposable local database");
const dbUrl = new URL(target);
if (!["127.0.0.1", "localhost", "[::1]"].includes(dbUrl.hostname) || dbUrl.pathname !== "/gheverhan_sprint1_test") throw new Error("Browser tests refuse production/non-local databases");
// Direct service checks and spawned app must share the same guarded disposable database.
process.env.DATABASE_URL = target;
process.env.DIRECT_URL = target;
const root = path.resolve(__dirname, "../..");
if (!existsSync(path.join(root, ".next/BUILD_ID"))) throw new Error("Run npm run build before this production-server browser test");
const artifactDir = process.env.SPRINT1_ARTIFACT_DIR || `/tmp/gheverhan-product-browser-${process.pid}`;
const base = "http://localhost:3101";
const secret = randomBytes(32).toString("hex");
process.env.JWT_SECRET = secret;
const storageToken = randomUUID();
const objects = new Map<string, { bytes: Buffer; mime: string }>();
const brandingObjects = new Map<string, { bytes: Buffer; mime: string }>();
const emailCodes = new Map<string, string>();
let png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=", "base64");
const db = new PrismaClient({ datasources: { db: { url: target } } });
const prefix = randomUUID().slice(0, 8);
const couponCode = `LIVE-${prefix}`.toUpperCase();
let checks = 0;
let completed = false;
const checkpoints: { label: string; status: string }[] = [];
async function check(name: string, fn: () => Promise<void>) { try { await fn(); checks++; checkpoints.push({label:name,status:"PASS"}); console.log(`PASS ${name}`); } catch(error) { checkpoints.push({label:name,status:"FAILED"}); throw error; } }
async function fixtureRole(name: string, permissions: string[]) {
  const role = await db.role.upsert({ where: { name }, create: { name, label: name }, update: {} });
  // These guarded local fixtures may be reused after the operations suite.
  // Do not accidentally inherit extra permissions from a previous fixture run.
  await db.rolePermission.deleteMany({ where: { roleId: role.id, permission: { key: { notIn: permissions } } } });
  for (const key of permissions) {
    const permission = await db.permission.upsert({ where: { key }, create: { key, label: key }, update: {} });
    await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, create: { roleId: role.id, permissionId: permission.id }, update: {} });
  }
  return role;
}
async function cookie(user: { id: string; email: string }) {
  const token = await signSession({ sub: user.id, email: user.email });
  return { name: "gh_session", value: token, domain: "localhost", path: "/", httpOnly: true, secure: true, sameSite: "Lax" as const };
}
async function main() {
  // Visible synthetic garment fixture: screenshots must not disguise a valid
  // one-pixel white test image as a blank/failed product gallery.
  png = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#e8e5df"/><path d="M205 185 140 225 75 345 165 395 190 345 190 650 410 650 410 345 435 395 525 345 460 225 395 185 350 215 250 215Z" fill="#514d48"/><path d="M250 215Q300 280 350 215" fill="none" stroke="#e8e5df" stroke-width="8"/></svg>')).png().toBuffer();
  await mkdir(artifactDir, { recursive: true });
  // Refuse to exercise another process accidentally if the app port is already occupied.
  const portProbe = createServer();
  await new Promise<void>((resolve, reject) => { portProbe.once("error", reject); portProbe.listen(3101, "127.0.0.1", resolve); });
  await new Promise<void>(resolve => portProbe.close(() => resolve()));
  // A repeated isolated run must not inherit published cache entries from a prior fixture.
  // Keep the singleton/revisions intact while this server is alive, so version probes
  // and warmed-cache commerce assertions exercise a consistent database snapshot.
  await db.storeAppearanceRevision.deleteMany();
  await db.storeAppearance.deleteMany();
  await db.storeBrandAsset.deleteMany();
  await db.storeCustomizeRateLimit.deleteMany();
  await rm(path.join(root, ".next/cache/fetch-cache"), {recursive:true,force:true});
  // Loopback-only Supabase Storage REST contract double. Never connects to production.
  const storage = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      if (url.pathname === "/emails" && req.method === "POST") {
        const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { to: string[]; text: string };
        const otp = body.text.match(/pendaftaran Gheverhan: (\d{6})/)?.[1];
        assert.ok(otp);
        emailCodes.set(body.to[0], otp);
        res.writeHead(200, { "Content-Type": "application/json" }).end("{}"); return;
      }
      if (req.headers.authorization !== `Bearer ${storageToken}` || req.headers.apikey !== storageToken) {
        res.writeHead(403).end(); return;
      }
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      if (["/storage/v1/object/product-images", "/storage/v1/object/payment-proofs", "/storage/v1/object/store-branding"].includes(url.pathname) && req.method === "DELETE") {
        const prefixes = JSON.parse(bytes.toString()).prefixes as string[];
        for (const key of prefixes) (url.pathname.endsWith("/store-branding") ? brandingObjects : objects).delete(key);
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify([])); return;
      }
      const parts = url.pathname.split("/");
      if (parts[1] !== "storage" || parts[2] !== "v1" || parts[3] !== "object" || !["product-images", "payment-proofs", "store-branding"].includes(parts[4] || "")) {
        res.writeHead(404).end(); return;
      }
      const objectPath = decodeURIComponent(parts.slice(5).join("/"));
      const bucketObjects = parts[4] === "store-branding" ? brandingObjects : objects;
      if (req.method === "POST") {
        if (bucketObjects.has(objectPath)) { res.writeHead(409).end(); return; }
        bucketObjects.set(objectPath, { bytes, mime: String(req.headers["content-type"]) });
        res.writeHead(201, { "Content-Type": "application/json" }).end(JSON.stringify({ Key: objectPath })); return;
      }
      const object = bucketObjects.get(objectPath);
      if (!object) { res.writeHead(404).end(); return; }
      res.setHeader("Content-Type", object.mime); res.end(object.bytes);
    } catch { res.writeHead(400).end(); }
  });
  await new Promise<void>((resolve, reject) => { storage.once("error", reject); storage.listen(3102, "127.0.0.1", resolve); });
  const log = createWriteStream(path.join(artifactDir, "server.log"));
  const server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", "3101"], { cwd: root, env: { ...process.env, NODE_ENV: "production", DATABASE_URL: target, DIRECT_URL: target, JWT_SECRET: secret, AUTH_COOKIE_NAME: "gh_session", RESEND_API_KEY: "isolated-test-key", PASSWORD_RESET_FROM: "Gheverhan <test@example.test>", REGISTRATION_OTP_TEST_SINK: "http://127.0.0.1:3102/emails", PAYMENT_PROVIDER: "manual", SHIPPING_PROVIDER: "manual", SUPABASE_URL: "http://127.0.0.1:3102", SUPABASE_SERVICE_ROLE_KEY: storageToken, STORAGE_APP_NAME: "gheverhan-sprint1-tests" }, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout?.pipe(log); server.stderr?.pipe(log);
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    let ready = false;
    for (let n = 0; n < 30; n++) {
      if (server.exitCode !== null) throw new Error(`Local app exited ${server.exitCode}; see server.log`);
      try { ready = (await fetch(`${base}/api/v1/health`)).ok; } catch { /* wait for startup */ }
      if (ready) break; await new Promise(r => setTimeout(r, 1000));
    }
    if (!ready) throw new Error("Local production server did not become healthy");
    const adminRole = await fixtureRole("Admin", Object.values(PERMISSIONS));
    const marketingRole = await fixtureRole("Marketing", [PERMISSIONS.PRODUCT_READ]);
    const customerRole = await fixtureRole("Customer", []);
    const editRole = await fixtureRole("Manager", [PERMISSIONS.PRODUCT_READ, PERMISSIONS.PRODUCT_UPDATE]);
    const user = (kind: string, roleId: string) => db.user.create({ data: { name: `Browser ${kind}`, email: `${kind}-${prefix}@browser.example.test`, passwordHash: "not-for-login-fixture", roles: { create: { roleId } } } });
    const [staff, marketing, customer, editor] = await Promise.all([user("staff", adminRole.id), user("marketing", marketingRole.id), user("customer", customerRole.id), user("editor", editRole.id)]);
    browser = await chromium.launch({ headless: true, executablePath: process.env.SPRINT1_CHROMIUM_PATH || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined), args: ["--no-sandbox"] });
    const admin = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const buyer = await browser.newContext();
    const readOnly = await browser.newContext();
    const anonymous = await browser.newContext();
    await admin.addCookies([await cookie(staff)]); await buyer.addCookies([await cookie(customer)]); await readOnly.addCookies([await cookie(marketing)]);
    const page = await admin.newPage();
    const pageErrors: string[] = []; page.on("pageerror", err => pageErrors.push(err.message));
    if (process.env.STOREFRONT_V5_ONLY === "1") {
      await verifyStorefrontV4({browser:browser!,admin,anonymous,db,base,prefix,artifactDir,check});
      const fixture = await db.product.create({ data: { name: "V5 checkout fixture", slug: `v5-checkout-${prefix}`, status: "PUBLISHED", basePrice: 100000, weightGrams: 250, variants: { create: { sku: `V5-CHECKOUT-${prefix}`, inventory: { create: { onHand: 20 } } } } }, include: { variants: true } });
      await db.cart.upsert({ where: { userId: customer.id }, create: { userId: customer.id, items: { create: { variantId: fixture.variants[0].id, quantity: 2 } } }, update: { items: { deleteMany: {}, create: { variantId: fixture.variants[0].id, quantity: 2 } } } });
      await verifyV5Checkout(browser!,buyer,base,artifactDir);
      completed=true;return;
    }
    if (process.env.STOREFRONT_V4_ONLY === "1") {
      await verifyStorefrontV4({browser:browser!,admin,anonymous,db,base,prefix,artifactDir,check});
      completed=true;return;
    }
    if (process.env.NATIVE_PURCHASE_ONLY === "1") {
      await verifyNativePurchase({buyer,admin,anonymous,db,base,prefix,artifactDir,check});
      completed=true;return;
    }
    if (process.env.PRODUCT_EDITOR_ONLY === "1") {
      await verifyNativeProductEditor({browser:browser!,admin,anonymous,db,base,artifactDir,prefix,png,check});
      completed = true; return;
    }
    if (process.env.PRODUCT_VARIATIONS_ONLY === "1") {
      await db.category.create({ data: { name: "Variant fixture", slug: `browser-${prefix}` } });
      await verifyCustomVariations({page,browser:browser!,admin,anonymous,readOnly,db,base,artifactDir,prefix,check});
      await verifyProductEditorV2({page,db,base,artifactDir,prefix,check,png});
      completed = true; return;
    }
    await verifyStoreAppearance({browser:browser!,admin,anonymous,readOnly,db,base,artifactDir,check});
    await verifyNativePurchase({buyer,admin,anonymous,db,base,prefix,artifactDir,check});
    await verifyStorefrontV4({browser:browser!,admin,anonymous,db,base,prefix,artifactDir,check});
    await check("protected pages and permission-filtered dashboard", async () => {
      const unauth = await anonymous.request.get(`${base}/admin/products/new`); assert.match(unauth.url(), /\/login/);
      const denied = await readOnly.request.get(`${base}/admin/products/new`); assert.equal(denied.status(), 404);
      const mp = await readOnly.newPage(); await mp.goto(`${base}/admin`); await expect(mp.getByTestId("dashboard-products")).toBeVisible(); await expect(mp.getByTestId("dashboard-sales")).toHaveCount(0); await expect(mp.getByTestId("dashboard-orders")).toHaveCount(0); await expect(mp.getByTestId("dashboard-stock")).toHaveCount(0); await mp.close();
      await page.goto(`${base}/admin`); await expect(page.getByRole("heading", { name: "Dashboard toko", exact: true })).toBeVisible();
      await expect(page.getByTestId("dashboard-products")).toHaveText(String(await db.product.count()));
    });
    const categorySlug = `browser-${prefix}`;
    await check("create category through its authorized UI", async () => {
      await page.goto(`${base}/admin/categories`); await page.getByLabel("Nama kategori", { exact: true }).fill(`Kategori ${prefix}`); await page.getByLabel("Slug", { exact: true }).fill(categorySlug); await page.getByRole("button", { name: "Simpan kategori", exact: true }).click(); await expect(page.getByRole("status")).toHaveText("Kategori berhasil disimpan.");
    });
    const category = await db.category.findUniqueOrThrow({ where: { slug: categorySlug } });
    await check("edit-only category feedback persists and restores keyboard focus", async () => {
      const ctx = await browser!.newContext(); await ctx.addCookies([await cookie(editor)]); const cp = await ctx.newPage();
      await cp.goto(`${base}/admin/categories`); await cp.locator(`#category-edit-${category.id}`).click(); await cp.getByLabel("Nama kategori", { exact: true }).fill(`${category.name} Edited`); await cp.getByRole("button", { name: "Simpan kategori", exact: true }).click();
      await expect(cp.getByRole("status")).toHaveText("Kategori berhasil disimpan."); await expect(cp.getByLabel("Nama kategori", { exact: true })).toHaveCount(0); await expect(cp.locator(`#category-edit-${category.id}`)).toBeFocused(); await ctx.close();
    });
    const slug = `kaos-sprint-${prefix}`;
    await check("create draft with price, category, SKU and inventory", async () => {
      await page.goto(`${base}/admin/products/new`); await page.getByRole("button", { name: "Gunakan varian sederhana", exact: true }).click(); await page.getByLabel("Nama produk", { exact: true }).fill(`Kaos Sprint ${prefix}`); await page.locator("#product-price").fill("175000"); await page.getByLabel("Kategori", { exact: true }).selectOption(category.id); await page.getByLabel("SKU", { exact: true }).fill(`BROWSER-${prefix}`); await page.locator("#variant-0-stock").fill("6"); await page.locator("#package-weight").fill("500");
      for (const width of [360, 390, 768, 1360]) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
        await page.screenshot({ path: path.join(artifactDir, `product-create-${width}.png`), fullPage: true });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `product create ${width}px has no horizontal overflow`);
      }
      await page.setViewportSize({ width: 1360, height: 900 });
      await page.getByTestId("save-product").click(); await expect(page).toHaveURL(/\/admin\/products\/(?!new)[^/?]+$/); await expect(page.getByTestId("product-status")).toHaveText("Draft");
    });
    let product = await db.product.findUniqueOrThrow({ where: { slug }, include: { images: true, variants: { include: { inventory: true } } } });
    assert.equal(product.status, "DRAFT"); assert.equal(product.variants[0].inventory?.onHand, 6);
    await check("server validation preserves input and focuses visible mobile feedback", async () => {
      await page.setViewportSize({ width: 390, height: 844 }); await page.getByLabel("Harga diskon (opsional)", { exact: true }).fill("200000"); await page.getByTestId("save-product").click(); const feedback = page.getByRole("region", { name: "Status perubahan produk" }); await expect(feedback.getByRole("alert")).toContainText("Harga diskon harus lebih kecil");
       await expect(feedback).toBeFocused(); const box = await feedback.boundingBox(); assert.ok(box && box.y >= 0 && box.y + box.height <= 844);
      await expect(page.getByLabel("Harga diskon (opsional)", { exact: true })).toHaveValue("200000"); assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).salePrice, null);
      await page.getByLabel("Harga diskon (opsional)", { exact: true }).fill(""); await expect(page.getByTestId("save-product")).toBeDisabled(); await page.setViewportSize({ width: 1360, height: 900 });
    });
    await check("draft is absent from public detail and a warmed catalog cache", async () => {
      assert.equal((await anonymous.request.get(`${base}/api/v1/products/${slug}`)).status(), 404);
      const listing = await anonymous.request.get(`${base}/api/v1/products?q=${prefix}`); assert.equal((await listing.json()).data.total, 0);
    });
    await check("edit and add/remove a fresh unreferenced variant", async () => {
      await page.getByLabel("Nama produk", { exact: true }).fill(`Kaos Sprint ${prefix} Edited`); await page.locator("#product-price").fill("190000"); await page.getByLabel("SKU", { exact: true }).fill(`BROWSER-${prefix}-EDIT`);
      await page.getByRole("button", { name: "Tambah varian", exact: true }).click(); await page.locator("#variant-1-sku").locator("xpath=ancestor::details").locator("summary").click(); await page.getByLabel("SKU", { exact: true }).nth(1).fill(`BROWSER-${prefix}-S`); await page.getByLabel("Ukuran", { exact: true }).nth(1).fill("S");
      await page.getByTestId("save-product").click(); await expect(page.getByRole("status")).toHaveText("Produk berhasil disimpan."); assert.equal(await db.productVariant.count({ where: { productId: product.id } }), 2);
      await page.locator("#variant-1-sku").locator("xpath=ancestor::details").locator("summary").click();
      await page.getByRole("button", { name: "Hapus varian 2", exact: true }).click(); await page.getByTestId("save-product").click(); await expect(page.getByRole("status")).toHaveText("Produk berhasil disimpan."); assert.equal(await db.productVariant.count({ where: { productId: product.id } }), 1);
    });
    await check("seller variant builder renders responsively and persists unique color/size combinations", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: "Buat kombinasi", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Atur variasi produk" });
      await expect(dialog).toBeVisible();
      for (const color of ["Merah", "Hijau"]) {
        await dialog.getByLabel("Tambah opsi Warna").fill(color);
        await dialog.getByLabel("Tambah opsi Warna").press("Enter");
      }
      for (const size of ["M", "L"]) {
        await dialog.getByLabel("Tambah opsi Ukuran").fill(size);
        await dialog.getByLabel("Tambah opsi Ukuran").press("Enter");
      }
      await expect(dialog.getByText("4 varian", { exact: true })).toBeVisible();
      await dialog.screenshot({ path: path.join(artifactDir, "product-variant-sheet-390.png") });
      await page.screenshot({ path: path.join(artifactDir, "product-variant-mobile-390.png"), fullPage: false });
      const bounds = await dialog.boundingBox();
      assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= 392 && bounds.y >= -1 && bounds.y + bounds.height <= 845, "mobile bottom sheet must fit the viewport");
      await dialog.getByRole("button", { name: "Tambahkan 4 kombinasi", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      assert.equal(await page.getByLabel("SKU", { exact: true }).count(), 5);
      const generatedSkus = await page.getByLabel("SKU", { exact: true }).evaluateAll(nodes => nodes.slice(1).map(node => (node as HTMLInputElement).value));
      assert.ok(generatedSkus.every(sku => sku === sku.toUpperCase() && sku.startsWith("KS")), "New legacy combinations use the same initials-based uppercase SKU generator");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "mobile editor has no horizontal overflow");
      await page.getByTestId("save-product").click();
      await expect(page.getByRole("status")).toHaveText("Produk berhasil disimpan.");
      assert.equal(await db.productVariant.count({ where: { productId: product.id } }), 5);
      await page.setViewportSize({ width: 1360, height: 900 });
      await expect(page.getByRole("navigation", { name: "Bagian editor produk" })).toBeVisible();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "desktop editor has no horizontal overflow");
      for (let index = 5; index >= 2; index--) {
        const card = page.locator(`#variant-${index - 1}-sku`).locator("xpath=ancestor::details");
        if ((await card.getAttribute("open")) === null) await card.locator("summary").click();
        await page.getByRole("button", { name: `Hapus varian ${index}`, exact: true }).click();
      }
      await page.getByTestId("save-product").click();
      await expect(page.getByRole("status")).toHaveText("Produk berhasil disimpan.");
      assert.equal(await db.productVariant.count({ where: { productId: product.id } }), 1);
    });
    await check("upload and serve draft image through the existing storage contract", async () => {
      await page.getByLabel("Unggah JPG, PNG, atau WebP", { exact: true }).setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: png }); await expect(page.getByRole("region", {name:"Status perubahan produk"}).getByRole("status")).toContainText("Foto sementara siap"); await page.getByTestId("save-product").click(); await expect(page.getByRole("status")).toHaveText("Produk berhasil disimpan.");
      for (const width of [390, 768, 1360]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        await page.screenshot({ path: path.join(artifactDir, `product-edit-${width}.png`), fullPage: true });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `product edit ${width}px has no horizontal overflow`);
      }
      await page.setViewportSize({ width: 1360, height: 900 });
      product = await db.product.findUniqueOrThrow({ where: { id: product.id }, include: { images: true, variants: { include: { inventory: true } } } });
      assert.equal(product.images.length, 1); assert.equal(objects.size, 1); assert.equal((await admin.request.get(`${base}${product.images[0].url}`)).status(), 200); assert.equal((await anonymous.request.get(`${base}${product.images[0].url}`)).status(), 404);
      const form = { image: { name: "x.png", mimeType: "image/png", buffer: png }, updatedAt: product.updatedAt.toISOString() };
      const denied = await readOnly.request.post(`${base}/api/v1/admin/products/${product.id}/images`, { headers: { origin: base }, multipart: form }); assert.equal(denied.status(), 403);
      const badOrigin = await admin.request.post(`${base}/api/v1/admin/products/${product.id}/images`, { headers: { origin: "https://untrusted.example.test" }, multipart: form }); assert.equal(badOrigin.status(), 403);
    });
    await check("publish invalidates cache and renders the buyer storefront", async () => {
      await page.getByTestId("publish-product").click(); await expect(page.getByTestId("product-status")).toHaveText("Terbit");
      const detail = await anonymous.request.get(`${base}/api/v1/products/${slug}`); assert.equal(detail.status(), 200); assert.equal((await detail.json()).data.name, `Kaos Sprint ${prefix} Edited`);
      const listing = await anonymous.request.get(`${base}/api/v1/products?q=${prefix}`); assert.equal((await listing.json()).data.total, 1);
      const store = await anonymous.newPage(); await store.goto(`${base}/product/${slug}`); await expect(store.getByTestId("purchase-panel")).toBeVisible(); await expect(store.getByRole("heading", { name: `Kaos Sprint ${prefix} Edited`, exact: true })).toBeVisible();
      await expect.poll(() => store.getByTestId("product-gallery").locator("img").first().evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0); await store.close();
    });
    await check("admin Marketing UI creates voucher and schedules/ends a campaign without rewriting product prices", async () => {
      const voucherCode = `WEB-${prefix}`.toUpperCase();
      try {
        await page.goto(`${base}/admin/marketing`);
        await expect(page.getByRole("heading", { name: "Marketing", exact: true })).toBeVisible();
        await expect(page.getByTestId("adminnav-marketing").filter({ visible: true })).toHaveAttribute("aria-current", "page");
        await page.getByLabel("Kode voucher").fill(voucherCode);
        await page.getByLabel("Nilai diskon (%)").fill("15");
        await page.getByLabel("Mulai berlaku (opsional)").fill("2030-01-01T12:00");
        await page.getByLabel("Kuota total (opsional)").fill("5");
        await page.getByLabel("Batas per pelanggan").fill("1");
        await page.getByRole("button", { name: "Buat voucher", exact: true }).click();
        await expect(page.getByTestId("marketing-feedback")).toHaveText("Voucher berhasil disimpan.");
        await expect.poll(() => db.coupon.count({ where: { code: voucherCode } })).toBe(1);
        const scheduledVoucher = await db.coupon.findUniqueOrThrow({ where: { code: voucherCode } });
        assert.equal(scheduledVoucher.usageLimit, 5);
        assert.equal(scheduledVoucher.perUserLimit, 1);
        assert.ok(scheduledVoucher.startsAt && scheduledVoucher.startsAt.getTime() > Date.now());
        await expect(page.getByText("Terjadwal", { exact: true })).toBeVisible();
        await page.getByRole("button", { name: `Nonaktifkan ${voucherCode}` }).click();
        await expect(page.getByTestId("marketing-feedback")).toContainText("Status voucher diperbarui.");
        assert.equal((await db.coupon.findUniqueOrThrow({ where: { code: voucherCode } })).isActive, false);

        await page.locator('#campaign-name').fill(`Browser campaign ${prefix}`);
        const wib=(date:Date)=>new Date(date.getTime()+7*3600000).toISOString().slice(0,16);
        await page.locator('#campaign-start').fill(wib(new Date(Date.now()-60000)));
        await page.locator('#campaign-end').fill(wib(new Date(Date.now()+3600000)));
        await page.locator('#campaign-search').fill(`Kaos Sprint ${prefix} Edited`);
        await page.getByRole('button',{name:'Cari',exact:true}).click();
        await expect(page.getByTestId('flash-campaign-manager').getByRole('checkbox')).toHaveCount(1);
        await page.getByTestId('flash-campaign-manager').getByRole('checkbox').check();
        await page.locator(`#campaign-price-${product.id}`).fill('159000');
        page.once('dialog',dialog=>dialog.accept());
        await page.getByRole('button',{name:'Jadwalkan',exact:true}).click();
        await expect(page.getByRole('status').filter({hasText:'Kampanye tersimpan'})).toBeVisible();
        const campaign=await db.flashSaleCampaign.findFirstOrThrow({where:{name:`Browser campaign ${prefix}`},include:{items:true}});
        assert.equal(campaign.items[0].productId,product.id);assert.equal(campaign.items[0].flashSalePrice,159000);
        const active=await anonymous.request.get(`${base}/api/v1/products/${slug}`);
        assert.equal((await active.json()).data.flashSalePrice,159000);
        const master=await db.product.findUniqueOrThrow({where:{id:product.id}});
        assert.equal(master.salePrice,null);assert.equal(master.isFlashSale,false);assert.equal(master.flashSalePrice,null);
        page.once('dialog',dialog=>dialog.accept());
        await page.getByRole('button',{name:'Akhiri',exact:true}).click();
        await expect(page.getByRole('status').filter({hasText:'Kampanye diakhiri'})).toBeVisible();
        assert.equal((await db.flashSaleCampaign.findUniqueOrThrow({where:{id:campaign.id}})).status,'ENDED');
        assert.equal((await db.product.findUniqueOrThrow({where:{id:product.id}})).salePrice,null);
        // Restore the admin product editor for the subsequent pre-existing checkout regression.
        await page.goto(`${base}/admin/products/${product.id}`);
        await expect(page.locator("#product-price")).toBeVisible();
      } finally {
        await db.coupon.deleteMany({ where: { code: voucherCode } });
      }
    });
    await verifyFlashCampaign({page,admin,anonymous,readOnly,db,base,artifactDir,imageUrl:product.images[0].url,check});
    await page.goto(`${base}/admin/products/${product.id}`);
    await check("buyer cart works for the published variant", async () => {
      const result = await buyer.request.post(`${base}/api/v1/cart/items`, { data: { variantId: product.variants[0].id, quantity: 1 } }); assert.equal(result.status(), 201); assert.equal((await result.json()).success, true);
    });
    await check("V5 structured location modal, failure/retry, cascading, cancel, keyboard and eight viewports", async () => {
      await verifyV5Checkout(browser!, buyer, base, artifactDir);
    });
    await check("Buy Now guest login continuation and exact legacy/custom checkout preserve the old cart", async () => {
      await verifyDirectCheckout(browser!, db, base, artifactDir, pageErrors);
    });
    await check("R20 authenticated cart synchronization and rollback at four viewports", async () => {
      await verifyCartSynchronization(browser!, db, base, prefix, pageErrors, artifactDir, emailCodes, async () => {
        await page.goto(`${base}/admin/products/${product.id}`);
        const description = page.locator("#product-description");
        await description.fill((await description.inputValue()) + "\nSynthetic cache fixture " + randomUUID());
        await page.getByTestId("save-product").click();
        await expect(page.getByRole("region", {name:"Status perubahan produk"}).getByRole("status")).toContainText("Produk berhasil disimpan");
      });
    });
    await check("live checkout coupon is priced by server, shows errors, and updates shipping without creating orders", async () => {
      await db.coupon.create({ data: { code: couponCode, discountType: "PERCENT", discountValue: 10, minSpend: 0 } });
      const before = await db.order.count({ where: { userId: customer.id } });
      const unauthorized = await anonymous.request.post(`${base}/api/v1/checkout/preview`, {
        data: { couponCode, shipping: { courier: "JNE", service: "REG", cost: 0 } },
      });
      assert.equal(unauthorized.status(), 401);
      const { quote: data } = await apiShipping(buyer.request, base, { couponCode });
      assert.equal(data.subtotal, 190000);
      assert.equal(data.shippingCost, 20000, "client shipping cost must be ignored");
      assert.equal(data.discount, 19000);
      assert.equal(data.total, 191000);
      const page = await buyer.newPage();
      try {
        await page.goto(`${base}/checkout`);
        await chooseTestLocation(page);
        await expect(page.getByTestId("checkout-total")).toHaveText("Rp 210.000");
        await page.getByTestId("input-coupon").fill(couponCode.toLowerCase());
        await expect(page.getByTestId("coupon-feedback")).toContainText("berhasil diterapkan");
        await expect(page.getByTestId("checkout-discount")).toContainText("Rp 19.000");
        await expect(page.getByTestId("checkout-total")).toHaveText("Rp 191.000");
        await expect(page.getByTestId("place-order-btn")).toBeEnabled();
        await page.getByTestId("ship-option-1").click();
        await expect(page.getByTestId("checkout-total")).toHaveText("Rp 193.000");
        // Coupon becomes invalid AFTER the customer has seen the discounted total.
        // The createOrder transaction must fail instead of charging a higher amount.
        await db.coupon.update({ where: { code: couponCode }, data: { isActive: false } });

        await page.getByTestId("place-order-btn").click();
        await expect(page.getByTestId("checkout-error")).toContainText("konfirmasi ulang");
        assert.equal(await db.order.count({ where: { userId: customer.id } }), before);
        await db.coupon.update({ where: { code: couponCode }, data: { isActive: true } });
        await page.getByTestId("input-coupon").fill(`INVALID-${prefix}`);
        await expect(page.getByTestId("coupon-feedback")).toContainText("Kupon tidak valid");
        await expect(page.getByTestId("checkout-discount")).toHaveCount(0);
        await expect(page.getByTestId("checkout-total")).toHaveText("Rp 212.000");
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "checkout quote mobile overflow");
      } finally { await page.close(); }
      assert.equal(await db.order.count({ where: { userId: customer.id } }), before);
    });
    await check("customer confirms quoted prices and receives a price conflict without an order", async () => {
      const customerPage = await buyer.newPage(); await customerPage.goto(`${base}/checkout`);
      // Establish the original server-priced quote before simulating a price change.
      await chooseTestLocation(customerPage);
      await expect(customerPage.getByTestId("place-order-btn")).toBeEnabled();
      const quote = JSON.parse(await customerPage.locator('input[name="expectedLines"]').inputValue());
      assert.equal(quote[0].unitPrice, 190000); assert.match(await customerPage.locator('input[name="requestId"]').inputValue(), /^[0-9a-f-]{36}$/);
      await page.locator("#product-price").fill("195000"); await page.getByTestId("save-product").click(); await expect(page.getByRole("status")).toHaveText("Produk berhasil disimpan.");
      const before = await db.order.count({ where: { userId: customer.id } });
      await customerPage.getByTestId("place-order-btn").click(); await expect(customerPage.getByTestId("checkout-error")).toContainText("konfirmasi ulang");
      assert.equal(await db.order.count({ where: { userId: customer.id } }), before); assert.equal(await db.cartItem.count({ where: { cart: { userId: customer.id } } }), 1);
      await page.locator("#product-price").fill("190000"); await page.getByTestId("save-product").click(); await expect(page.getByRole("status")).toHaveText("Produk berhasil disimpan."); await customerPage.close();
    });
    const order = await db.order.create({ data: { orderNumber: `BROWSER-${prefix}`, userId: customer.id, subtotal: 190000, total: 190000, shippingCost: 0, discount: 0, items: { create: { variantId: product.variants[0].id, productName: product.name, variantLabel: "Default", imageUrl: product.images[0].url, unitPrice: 190000, quantity: 1, lineTotal: 190000 } } } });
    await check("archive hides cached catalog/detail and blocks new purchases", async () => {
      await page.getByTestId("archive-product").click(); await expect(page.getByTestId("product-status")).toHaveText("Arsip");
      assert.equal((await anonymous.request.get(`${base}/api/v1/products/${slug}`)).status(), 404);
      const listing = await anonymous.request.get(`${base}/api/v1/products?q=${prefix}`); assert.equal((await listing.json()).data.total, 0);
      const add = await buyer.request.post(`${base}/api/v1/cart/items`, { data: { variantId: product.variants[0].id, quantity: 1 } }); assert.equal(add.status(), 404);
      const orderCount = await db.order.count({ where: { userId: customer.id } });
      const blocked = await buyer.request.post(`${base}/api/v1/orders`, { data: { address: testAddress, shipping: { courier: "J&T Express", service: "EZ", cost: 20000, quoteToken: "intentionally-stale" }, bankAccountId: "not-used-after-cart-rejection" } });
      assert.equal(blocked.status(), 409); assert.equal(await db.order.count({ where: { userId: customer.id } }), orderCount);
    });
    await check("archival preserves buyer order and authorized historical media", async () => {
      assert.equal(await db.orderItem.count({ where: { orderId: order.id } }), 1);
      const media = await buyer.request.get(`${base}${product.images[0].url}`); assert.equal(media.status(), 200); assert.equal(media.headers()["content-type"], "image/png");
      assert.equal((await anonymous.request.get(`${base}${product.images[0].url}`)).status(), 404);
      assert.equal((await buyer.request.get(`${base}/orders/${order.id}`)).status(), 200);
    });
    await check("desktop/mobile pages have no horizontal overflow or browser exceptions", async () => {
      for (const viewport of [{ width: 1360, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        for (const route of ["/admin", `/admin/products/${product.id}`, "/admin/categories"]) {
          await page.goto(`${base}${route}`); await page.waitForLoadState("networkidle");
          const overflow = await page.evaluate(() => ({
            overflowing: document.documentElement.scrollWidth > innerWidth,
            viewport: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            scrollCandidates: [...document.querySelectorAll("body *")].map(node => {
              const el = node as HTMLElement;
              return { tag: el.tagName, classes: String(el.className || "").slice(0, 90),
                delta: el.scrollWidth - el.clientWidth, overflowX: getComputedStyle(el).overflowX };
            }).filter(el => el.delta > 2 && el.overflowX === "visible").slice(0, 18),
            elements: [...document.querySelectorAll("body *")].map(node => {
              const rect = node.getBoundingClientRect();
              return { tag: node.tagName, classes: String((node as HTMLElement).className || "").slice(0, 110), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
            }).filter(e => e.right > innerWidth + 1 || e.left < -1).slice(0, 16),
          }));
          if (overflow.overflowing) console.error("[admin-viewport-overflow] " + JSON.stringify({ route, ...overflow }));
          assert.equal(overflow.overflowing, false, `${route} overflow at ${viewport.width}`);
        }
      }
      assert.deepEqual(pageErrors, []);
    });
    if (process.env.SPRINT1_CAPTURE_UI === "1") {
      const captures = [{ width: 1360, height: 900, route: "/admin", file: "desktop.png" }, { width: 390, height: 844, route: `/admin/products/${product.id}`, file: "mobile.png" }, { width: 1360, height: 900, route: `/admin/products/${product.id}`, file: "desktop-product.png" }, { width: 390, height: 844, route: "/admin", file: "mobile-dashboard.png" }];
      for (const c of captures) { await page.setViewportSize(c); await page.goto(`${base}${c.route}`); await page.waitForLoadState("networkidle"); await page.screenshot({ path: path.join(artifactDir, c.file), fullPage: true }); }
    }
    await verifyNativeProductEditor({browser:browser!,admin,anonymous,db,base,artifactDir,prefix,png,check});
    await verifyCustomVariations({page,browser:browser!,admin,anonymous,readOnly,db,base,artifactDir,prefix,check});
    await verifyProductEditorV2({page,db,base,artifactDir,prefix,check,png});
    assert.deepEqual(pageErrors, [], "Final product/editor browser flows have no unhandled errors");
    completed = true;
    await writeFile(path.join(artifactDir, "result.json"), JSON.stringify({ checks, database: "disposable localhost gheverhan_sprint1_test", storage: "local test double for existing adapter", productId: product.id, slug, schemaChanged: true }, null, 2));
    console.log(`PASS ${checks} browser/data-flow checks; no production data or external storage used`);
  } finally {
    try {
    await writeFile(path.join(artifactDir, "validation-results.json"), JSON.stringify({
      status: completed ? "PASS" : "FAILED", checks, checkpoints,
      commitSha: execFileSync("git", ["rev-parse", "HEAD"], {cwd:root,encoding:"utf8"}).trim(),
      nodeVersion: process.version, browserVersion: browser?.version(),
      buildId: readFileSync(path.join(root,".next/BUILD_ID"),"utf8").trim(),
      synthetic: true,
    },null,2));
    } finally {
    await browser?.close(); server.kill("SIGTERM");
    await new Promise<void>(resolve => { if (server.exitCode !== null) resolve(); else { server.once("exit", () => resolve()); setTimeout(() => { server.kill("SIGKILL"); resolve(); }, 5000).unref(); } });
    log.end(); await new Promise<void>(resolve => storage.close(() => resolve()));
    // Teardown only after the app has stopped: deleting a published row under a
    // running tagged cache would create an artificial version mismatch.
    await db.storeAppearanceRevision.deleteMany();
    await db.storeAppearance.deleteMany();
    await db.storeBrandAsset.deleteMany();
    await db.storeCustomizeRateLimit.deleteMany();
    await rm(path.join(root, ".next/cache/fetch-cache"), {recursive:true,force:true});
    await db.coupon.deleteMany({ where: { code: couponCode } });
    await db.$disconnect();
    }
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
