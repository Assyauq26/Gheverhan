import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, createWriteStream } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { chromium, expect } from "@playwright/test";
import { signSession } from "../../src/lib/auth/jwt";
import { PERMISSIONS } from "../../src/lib/auth/permissions";

const target = process.env.SPRINT1_TEST_DATABASE_URL;
if (!target) throw new Error("SPRINT1_TEST_DATABASE_URL is required; use a disposable local database");
const dbUrl = new URL(target);
if (!["127.0.0.1", "localhost", "[::1]"].includes(dbUrl.hostname) || dbUrl.pathname !== "/gheverhan_sprint1_test") throw new Error("Browser tests refuse production/non-local databases");
const root = path.resolve(__dirname, "../..");
if (!existsSync(path.join(root, ".next/BUILD_ID"))) throw new Error("Run npm run build before this production-server browser test");
const artifactDir = process.env.SPRINT1_ARTIFACT_DIR || `/tmp/gheverhan-product-browser-${process.pid}`;
const base = "http://localhost:3101";
const secret = randomBytes(32).toString("hex");
process.env.JWT_SECRET = secret;
const storageToken = randomUUID();
const storageCredential = `isolated-contract-${randomUUID()}`;
const objects = new Map<string, { bytes: Buffer; mime: string }>();
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=", "base64");
const db = new PrismaClient({ datasources: { db: { url: target } } });
const prefix = randomUUID().slice(0, 8);
let checks = 0;
async function check(name: string, fn: () => Promise<void>) { await fn(); checks++; console.log(`PASS ${name}`); }
async function fixtureRole(name: string, permissions: string[]) {
  const role = await db.role.upsert({ where: { name }, create: { name, label: name }, update: {} });
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
  await mkdir(artifactDir, { recursive: true });
  // Refuse to exercise another process accidentally if the app port is already occupied.
  const portProbe = createServer();
  await new Promise<void>((resolve, reject) => { portProbe.once("error", reject); portProbe.listen(3101, "127.0.0.1", resolve); });
  await new Promise<void>(resolve => portProbe.close(() => resolve()));
  // Test double for the existing putObject/getObject HTTP contract, not production storage.
  const storage = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      if (url.pathname === "/objstore/api/v1/storage/init" && req.method === "POST") {
        if (JSON.parse(bytes.toString()).emergent_key !== storageCredential) { res.writeHead(403).end(); return; }
        res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ storage_key: storageToken })); return;
      }
      if (req.headers["x-storage-key"] !== storageToken) { res.writeHead(403).end(); return; }
      const objectPath = decodeURIComponent(url.pathname.replace("/objstore/api/v1/storage/objects/", ""));
      if (req.method === "PUT") { objects.set(objectPath, { bytes, mime: String(req.headers["content-type"]) }); res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ path: objectPath, size: bytes.length })); return; }
      const object = objects.get(objectPath);
      if (!object) { res.writeHead(404).end(); return; }
      res.setHeader("Content-Type", object.mime); res.end(object.bytes);
    } catch { res.writeHead(400).end(); }
  });
  await new Promise<void>((resolve, reject) => { storage.once("error", reject); storage.listen(3102, "127.0.0.1", resolve); });
  const log = createWriteStream(path.join(artifactDir, "server.log"));
  const server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", "3101"], { cwd: root, env: { ...process.env, NODE_ENV: "production", DATABASE_URL: target, DIRECT_URL: target, JWT_SECRET: secret, AUTH_COOKIE_NAME: "gh_session", PAYMENT_PROVIDER: "manual", SHIPPING_PROVIDER: "manual", EMERGENT_LLM_KEY: storageCredential, INTEGRATION_PROXY_URL: "http://127.0.0.1:3102", STORAGE_APP_NAME: "gheverhan-sprint1-tests" }, stdio: ["ignore", "pipe", "pipe"] });
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
    process.env.DATABASE_URL = target; process.env.DIRECT_URL = target;
    const { createOrder } = await import("../../src/modules/checkout/checkout.service");
    const { submitConfirmation } = await import("../../src/modules/payments/payments.service");
    const { getCartView } = await import("../../src/modules/cart/cart.service");
    const adminRole = await fixtureRole("Admin", Object.values(PERMISSIONS));
    const financeRole = await fixtureRole("Finance", [PERMISSIONS.ORDER_READ, PERMISSIONS.PAYMENT_READ, PERMISSIONS.PAYMENT_VERIFY]);
    const warehouseRole = await fixtureRole("Warehouse", [PERMISSIONS.ORDER_READ, PERMISSIONS.INVENTORY_READ, PERMISSIONS.INVENTORY_ADJUST, PERMISSIONS.SHIPPING_READ, PERMISSIONS.SHIPPING_UPDATE]);
    const viewerRole = await fixtureRole("CS", [PERMISSIONS.ORDER_READ, PERMISSIONS.INVENTORY_READ, PERMISSIONS.PAYMENT_READ, PERMISSIONS.SHIPPING_READ]);
    const customerRole = await fixtureRole("Customer", []);
    const user = (kind: string, roleId: string) => db.user.create({ data: { name: `Ops ${kind}`, email: `${kind}-${prefix}@browser.example.test`, passwordHash: "isolated-fixture", roles: { create: { roleId } } } });
    const [staff, finance, warehouse, viewer] = await Promise.all([user("admin", adminRole.id), user("finance", financeRole.id), user("warehouse", warehouseRole.id), user("viewer", viewerRole.id)]);
    const product = await db.product.create({ data: { name: `Kaos Operasional ${prefix}`, slug: `ops-${prefix}`, basePrice: 100000, status: "PUBLISHED", images: { create: { url: "https://example.test/fixture.png", alt: "Synthetic fixture" } }, variants: { create: { sku: `OPS-${prefix}`, inventory: { create: { onHand: 6 } } } } }, include: { variants: true } });
    const variant = product.variants[0];
    const bank = await db.bankAccount.create({ data: { displayName: `Ops Bank ${prefix}`, bankName: "Fixture", accountNumber: "1234567890", accountHolder: "Fixture" } });
    let sequence = 0;
    async function pending(proof = true) {
      const buyer = await user(`buyer${++sequence}`, customerRole.id); await db.cart.create({ data: { userId: buyer.id, items: { create: { variantId: variant.id, quantity: 1 } } } });
      const order = await createOrder(buyer.id, { requestId: randomUUID(), expectedLines: (await getCartView(buyer.id)).lines.map(({ variantId, quantity, unitPrice }) => ({ variantId, quantity, unitPrice })), address: { recipientName: "Pelanggan Fixture", phone: "0800000000", line: "Alamat sintetis pengujian", city: "Bandung", province: "Jawa Barat", postalCode: "40100" }, shipping: { courier: "JNE", service: "REG", cost: 20000 }, bankAccountId: bank.id });
      if (proof) { const proofPath = `ops-${prefix}/proof-${sequence}.png`; objects.set(proofPath, { bytes: png, mime: "image/png" }); await submitConfirmation(buyer.id, order.id, { senderBank: "Fixture", senderName: "Pelanggan Fixture", amount: order.total, transferDate: new Date(), proofPath, proofMime: "image/png" }); }
      return { order, payment: await db.payment.findUniqueOrThrow({ where: { orderId: order.id } }) };
    }
    const sale = await pending(); const cancel = await pending(false); const reject = await pending();
    browser = await chromium.launch({ headless: true, executablePath: process.env.SPRINT1_CHROMIUM_PATH || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined), args: ["--no-sandbox"] });
    const context = async (u: { id: string; email: string }) => { const ctx = await browser!.newContext({ viewport: { width: 1360, height: 900 } }); await ctx.addCookies([await cookie(u)]); return ctx; };
    const admin = await context(staff); const fin = await context(finance); const wh = await context(warehouse); const readOnly = await context(viewer); const anonymous = await browser.newContext();
    const page = await admin.newPage(); const fp = await fin.newPage(); const wp = await wh.newPage(); const vp = await readOnly.newPage();
    const errors: string[] = []; for (const p of [page, fp, wp, vp]) p.on("pageerror", e => errors.push(e.message));
    const orderUrl = `${base}/admin/orders/${sale.order.id}`;
    async function submit(p: typeof page, label: string, url: string) {
      const f = p.getByRole("form", { name: label, exact: true }); await f.getByRole("button", { name: label, exact: true }).click();
      const navigation = p.waitForNavigation({ waitUntil: "networkidle" });
      const response = p.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === url);
      await f.getByRole("button", { name: `Konfirmasi ${label.toLowerCase()}`, exact: true }).click();
      const r = await response; if (!r.ok()) assert.fail(`${label}: HTTP ${r.status()} ${await r.text()}`); await navigation;
    }
    await check("authentication and permission-filtered operational forms", async () => {
      assert.match((await anonymous.request.get(`${base}/admin/inventory`)).url(), /\/login/);
      await vp.goto(`${base}/admin/inventory/${variant.id}`); await expect(vp.getByRole("form", { name: "Simpan adjustment" })).toHaveCount(0);
      await vp.goto(orderUrl); await expect(vp.getByRole("form")).toHaveCount(0);
      await wp.goto(orderUrl); await expect(wp.getByRole("heading", { name: "Pembayaran", exact: true })).toHaveCount(0);
    });
    await check("real HTTP authorization for inventory, status, payment, refund, settlement, return and shipment", async () => {
      const denied = [
        [`/inventory/${variant.id}`, { expectedOnHand: 6, newOnHand: 7, reason: "Forbidden" }],
        [`/orders/${sale.order.id}/status`, { status: "PAID" }],
        [`/payments/${sale.payment.id}/approve`, {}], [`/payments/${sale.payment.id}/reject`, { reason: "Forbidden" }],
        [`/orders/${sale.order.id}/refunds`, { requestId: randomUUID(), amount: sale.order.total, reason: "Forbidden" }],
        ["/refunds/not-found/confirm", {}], ["/refunds/not-found/decline", { reason: "Forbidden" }], ["/refunds/not-found/returns", {}],
        ["/shipments", { orderId: sale.order.id }],
      ] as const;
      for (const [url, data] of denied) { assert.equal((await readOnly.request.post(`${base}/api/v1/admin${url}`, { data })).status(), 403, url); assert.equal((await anonymous.request.post(`${base}/api/v1/admin${url}`, { data })).status(), 401, url); }
      assert.equal((await admin.request.post(`${base}/api/v1/admin/inventory/${variant.id}`, { headers: { Origin: "https://untrusted.example" }, data: {} })).status(), 403);
    });
    await check("inventory search, actual stock counters and adjustment audit", async () => {
      await page.goto(`${base}/admin/inventory`); await page.getByLabel("Cari produk atau SKU").fill(variant.sku); await page.getByRole("button", { name: "Cari", exact: true }).click(); await page.getByRole("link", { name: `Kelola stok ${variant.sku}` }).click();
      await expect(page.getByRole("heading", { name: product.name })).toBeVisible();
      await page.getByLabel("Stok fisik baru *").fill("8"); await page.getByLabel("Alasan adjustment *").fill("Hasil hitung gudang");
      await submit(page, "Simpan adjustment", `/api/v1/admin/inventory/${variant.id}`);
      assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: variant.id } })).onHand, 8);
      assert.equal(await db.auditLog.count({ where: { action: "inventory.adjust", userId: staff.id } }), 1); await expect(page.getByText("Hasil hitung gudang", { exact: true })).toBeVisible();
    });
    await check("stale expected-stock conflict preserves user input without lost update", async () => {
      await page.reload(); await db.inventory.update({ where: { variantId: variant.id }, data: { onHand: 9 } });
      await page.getByLabel("Stok fisik baru *").fill("12"); await page.getByLabel("Alasan adjustment *").fill("Stale adjustment");
      const f = page.getByRole("form", { name: "Simpan adjustment" }); await f.getByRole("button", { name: "Simpan adjustment", exact: true }).click(); await f.getByRole("button", { name: "Konfirmasi simpan adjustment" }).click();
      await expect(f.getByRole("alert")).toContainText("Stok sudah berubah"); await expect(page.getByLabel("Stok fisik baru *")).toHaveValue("12"); assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: variant.id } })).onHand, 9);
      await f.getByRole("button", { name: "Muat ulang data" }).click();
    });
    await check("order search, snapshot detail, address and manual proof", async () => {
      await page.goto(`${base}/admin/orders`); await page.getByLabel("Cari nomor pesanan").fill(sale.order.orderNumber); await page.getByRole("button", { name: "Cari", exact: true }).click(); await page.getByRole("link", { name: sale.order.orderNumber, exact: true }).click();
      await expect(page.getByText("Alamat sintetis pengujian")).toBeVisible(); await expect(page.getByText("Default · 1 × Rp 100.000")).toBeVisible(); await expect(page.getByRole("link", { name: "Lihat bukti transfer (tab baru)" })).toBeVisible();
    });
    await check("manual payment approval confirms once and commits one inventory sale", async () => {
      await fp.goto(orderUrl); await submit(fp, "Setujui pembayaran", `/api/v1/admin/payments/${sale.payment.id}/approve`);
      assert.equal((await db.order.findUniqueOrThrow({ where: { id: sale.order.id } })).status, "PAID"); assert.equal(await db.inventoryMovement.count({ where: { variantId: variant.id, type: "SALE" } }), 1);
    });
    await check("authorized order processing and packing use lifecycle service", async () => {
      await page.goto(orderUrl); await submit(page, "Ubah status order", `/api/v1/admin/orders/${sale.order.id}/status`); await page.reload(); await submit(page, "Ubah status order", `/api/v1/admin/orders/${sale.order.id}/status`);
      assert.equal((await db.order.findUniqueOrThrow({ where: { id: sale.order.id } })).status, "PACKED");
    });
    await check("manual shipment dispatch is atomically reflected in order and history", async () => {
      await wp.goto(orderUrl); const f = wp.getByRole("form", { name: "Simpan pengiriman" }); await f.getByLabel("Kurir *").fill("JNE"); await f.getByLabel("Layanan *").fill("REG"); await f.getByLabel("Nomor resi").fill(`RESI-${prefix}`); await f.getByLabel("Status pengiriman *").selectOption("SHIPPED"); await submit(wp, "Simpan pengiriman", "/api/v1/admin/shipments");
      assert.equal((await db.order.findUniqueOrThrow({ where: { id: sale.order.id } })).status, "SHIPPED"); assert.equal(await db.shipmentEvent.count({ where: { shipment: { orderId: sale.order.id }, status: "SHIPPED" } }), 1);
    });
    let refundId = "";
    await check("refund request freezes fulfillment and requester cannot verify settlement", async () => {
      await page.goto(orderUrl); await page.getByLabel("Alasan refund *").fill("Permintaan pelanggan terverifikasi"); await submit(page, "Ajukan refund", `/api/v1/admin/orders/${sale.order.id}/refunds`);
      refundId = (await db.paymentEvent.findFirstOrThrow({ where: { paymentId: sale.payment.id, type: "REFUND_REQUESTED" } })).id;
      await expect(page.getByText("Anda pembuat request.", { exact: false })).toBeVisible(); await expect(page.getByRole("form", { name: "Verifikasi settlement refund", exact: true })).toHaveCount(0);
      assert.equal((await db.payment.findUniqueOrThrow({ where: { id: sale.payment.id } })).status, "PAID");
    });
    await check("independent finance verifies a settled refund without automatic stock return", async () => {
      const before = await db.inventory.findUniqueOrThrow({ where: { variantId: variant.id } }); await fp.goto(orderUrl);
      const f = fp.getByRole("form", { name: "Verifikasi settlement refund", exact: true }); await f.getByLabel("Nominal settlement penuh (Rp) *").fill(String(sale.order.total)); await f.getByLabel("Rekening sumber refund *").selectOption(bank.id); await f.getByLabel("Referensi transaksi bank *").fill(`BANK-${prefix}-SETTLED`); const local = new Date(); local.setMinutes(local.getMinutes() - local.getTimezoneOffset()); await f.getByLabel("Waktu settlement *").fill(local.toISOString().slice(0, 16)); await f.getByRole("checkbox").check();
      // Use seconds so a newly created test payment cannot appear newer than its minute-rounded settlement.
      await f.getByLabel("Waktu settlement *").fill(local.toISOString().slice(0, 19));
      await submit(fp, "Verifikasi settlement refund", `/api/v1/admin/refunds/${refundId}/confirm`);
      assert.equal((await db.order.findUniqueOrThrow({ where: { id: sale.order.id } })).status, "REFUNDED"); assert.equal((await db.payment.findUniqueOrThrow({ where: { id: sale.payment.id } })).status, "REFUNDED"); assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: variant.id } })).onHand, before.onHand);
    });
    await check("warehouse receives physical return once without financial evidence exposure", async () => {
      const before = await db.inventory.findUniqueOrThrow({ where: { variantId: variant.id } }); await wp.goto(orderUrl); await expect(wp.getByText(`BANK-${prefix}-SETTLED`, { exact: false })).toHaveCount(0);
      const f = wp.getByRole("form", { name: "Catat penerimaan retur", exact: true }); await f.getByRole("spinbutton").fill("1"); await f.getByLabel("Referensi penerimaan gudang *").fill(`RECEIPT-${prefix}`); const local = new Date(); local.setMinutes(local.getMinutes() - local.getTimezoneOffset()); await f.getByLabel("Waktu barang diterima *").fill(local.toISOString().slice(0, 19)); await f.getByLabel("Catatan kondisi / alasan retur *").fill("Barang diterima dan layak jual"); await f.getByRole("checkbox").check(); await submit(wp, "Catat penerimaan retur", `/api/v1/admin/refunds/${refundId}/returns`);
      assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: variant.id } })).onHand, before.onHand + 1); assert.equal(await db.inventoryMovement.count({ where: { variantId: variant.id, type: "RETURN" } }), 1); await expect(wp.getByRole("form", { name: "Catat penerimaan retur", exact: true })).toHaveCount(0);
    });
    await check("post-refund shipment tracking preserves financial terminal state", async () => {
      await wp.reload(); const f = wp.getByRole("form", { name: "Simpan pengiriman" }); await f.getByLabel("Status pengiriman *").selectOption("DELIVERED"); await submit(wp, "Simpan pengiriman", "/api/v1/admin/shipments"); assert.equal((await db.order.findUniqueOrThrow({ where: { id: sale.order.id } })).status, "REFUNDED"); assert.equal((await db.shipment.findUniqueOrThrow({ where: { orderId: sale.order.id } })).status, "DELIVERED");
    });
    await check("unpaid cancellation releases one reservation through the UI", async () => {
      const before = await db.inventory.findUniqueOrThrow({ where: { variantId: variant.id } }); await page.goto(`${base}/admin/orders/${cancel.order.id}`); const f = page.getByRole("form", { name: "Ubah status order" }); await f.getByLabel("Status baru *").selectOption("CANCELLED"); await submit(page, "Ubah status order", `/api/v1/admin/orders/${cancel.order.id}/status`); const after = await db.inventory.findUniqueOrThrow({ where: { variantId: variant.id } }); assert.equal(after.reserved, before.reserved - 1); assert.ok(after.reserved >= 0 && after.reserved <= after.onHand);
    });
    await check("manual proof rejection records required reason", async () => {
      await fp.goto(`${base}/admin/orders/${reject.order.id}`); await fp.getByText("Tolak bukti transfer", { exact: true }).click(); await fp.getByLabel("Alasan penolakan *").fill("Bukti tidak cocok dengan transaksi bank"); await submit(fp, "Tolak pembayaran", `/api/v1/admin/payments/${reject.payment.id}/reject`); assert.equal((await db.payment.findUniqueOrThrow({ where: { id: reject.payment.id } })).status, "REJECTED");
    });
    await check("order and inventory pagination retain search and filter", async () => {
      const buyer = await user("pagination", customerRole.id);
      await db.order.createMany({ data: Array.from({ length: 21 }, (_, i) => ({ orderNumber: `UI-PAGE-${prefix}-${i}`, userId: buyer.id, status: "CANCELLED" as const, subtotal: 0, total: 0 })) });
      await page.goto(`${base}/admin/orders?q=UI-PAGE-${prefix}&status=CANCELLED`); await expect(page.getByText("Halaman 1 dari 2")).toBeVisible(); await page.getByRole("link", { name: "Berikutnya", exact: true }).click(); await expect(page).toHaveURL(/status=CANCELLED.*page=2/); await expect(page.getByText("Halaman 2 dari 2")).toBeVisible();
      await db.productVariant.createMany({ data: Array.from({ length: 21 }, (_, i) => ({ productId: product.id, sku: `UI-PAGE-${prefix}-${i}` })) });
      await page.goto(`${base}/admin/inventory?q=UI-PAGE-${prefix}&stock=empty`); await expect(page.getByText("Halaman 1 dari 2")).toBeVisible(); await page.getByRole("link", { name: "Berikutnya", exact: true }).click(); await expect(page).toHaveURL(/stock=empty.*page=2/); await expect(page.getByText("Halaman 2 dari 2")).toBeVisible();
    });
    await check("empty states and movement filter", async () => {
      await page.goto(`${base}/admin/orders?q=NONEXISTENT-${prefix}`); await expect(page.getByText("Tidak ada pesanan yang sesuai")).toBeVisible(); await page.goto(`${base}/admin/inventory?q=NONEXISTENT-${prefix}`); await expect(page.getByText("Tidak ada varian yang sesuai")).toBeVisible(); await page.goto(`${base}/admin/inventory/${variant.id}?type=RETURN`); await expect(page.getByText("Barang diterima dan layak jual")).toBeVisible();
    });
    await check("desktop/mobile operational pages have no overflow or browser exceptions", async () => {
      for (const viewport of [{ width: 1360, height: 900 }, { width: 390, height: 844 }, { width: 768, height: 1024 }]) { await page.setViewportSize(viewport); for (const route of ["/admin/inventory", `/admin/inventory/${variant.id}`, "/admin/orders", `/admin/orders/${sale.order.id}`]) { await page.goto(`${base}${route}`); await page.waitForLoadState("networkidle"); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route} overflow at ${viewport.width}`); } }
      assert.deepEqual(errors, []);
    });
    const captures = [{ width: 1360, height: 900, route: "/admin/inventory", file: "desktop-inventory.png" }, { width: 390, height: 844, route: `/admin/inventory/${variant.id}`, file: "mobile-inventory.png" }, { width: 1360, height: 900, route: `/admin/orders/${sale.order.id}`, file: "desktop-order.png" }, { width: 390, height: 844, route: `/admin/orders/${sale.order.id}`, file: "mobile-order.png" }];
    for (const c of captures) { await page.setViewportSize(c); await page.goto(`${base}${c.route}`); await page.waitForLoadState("networkidle"); await page.screenshot({ path: path.join(artifactDir, c.file), fullPage: true }); }
    await writeFile(path.join(artifactDir, "result.json"), JSON.stringify({ checks, orderId: sale.order.id, variantId: variant.id, database: "isolated local PostgreSQL", storage: "local proof contract double", synthetic: true }, null, 2));
    console.log(`PASS ${checks} operational browser/API/data-flow checks`);
  } finally {
    await browser?.close(); server.kill("SIGTERM");
    await new Promise<void>(resolve => { if (server.exitCode !== null) resolve(); else { server.once("exit", () => resolve()); setTimeout(() => { server.kill("SIGKILL"); resolve(); }, 5000).unref(); } });
    log.end(); await new Promise<void>(resolve => storage.close(() => resolve())); await db.$disconnect();
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
