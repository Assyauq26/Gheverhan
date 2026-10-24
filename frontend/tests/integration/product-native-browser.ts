import assert from "node:assert/strict";
import path from "node:path";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
export async function verifyNativeProductEditor({ browser, admin, anonymous, db, base, artifactDir, prefix, png, check }: {
  browser: Browser; admin: BrowserContext; anonymous: BrowserContext; db: PrismaClient; base: string; artifactDir: string; prefix: string; png: Buffer;
  check: (label: string, run: () => Promise<void>) => Promise<void>;
}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addCookies(await admin.cookies());
  const page = await context.newPage();
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  let id = "";
  const overflow = async (target: Page) => assert.ok(await target.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "No document overflow");
  try {
    await check("native editor: bounded multi-upload, individual retry, mouse/touch/keyboard cover ordering", async () => {
      await page.goto(base + "/admin/products/new");
      await expect(page.locator(".admin-global-header")).toBeHidden();
      await expect(page.locator(".admin-bottom-nav")).toBeHidden();
      await expect(page.getByRole("heading", { name: "Atribut", exact: true })).toHaveCount(0);
      await expect(page.getByLabel("Petunjuk perawatan", { exact: true })).toHaveCount(0);
      await expect(page.getByTestId("save-product")).toHaveText("Simpan sebagai Draft");
      let failed = false;
      await page.route(base + "/api/v1/admin/product-media", async route => {
        if (!failed && route.request().postDataBuffer()?.includes(Buffer.from('filename="native-2.png"'))) {
          failed = true; await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, error: { message: "Simulated retry" } }) });
        } else await route.continue();
      });
      await page.locator("#product-image-upload").setInputFiles([1, 2, 3].map(n => ({ name: `native-${n}.png`, mimeType: "image/png", buffer: png })));
      await expect(page.locator(".seller-gallery-photo")).toHaveCount(2);
      await page.getByRole("button", { name: "Coba lagi native-2.png", exact: true }).click();
      await expect(page.locator(".seller-gallery-photo")).toHaveCount(3);
      await expect(page.locator(".seller-gallery-task")).toHaveCount(0);
      const before = await page.locator(".seller-gallery-photo").evaluateAll(nodes => nodes.map(n => (n as HTMLElement).dataset.sortId!));
      await page.getByRole("button", { name: "Urutkan foto 3", exact: true }).scrollIntoViewIfNeeded();
      const source = await page.getByRole("button", { name: "Urutkan foto 3", exact: true }).boundingBox();
      const target = await page.locator(".seller-gallery-photo").first().boundingBox();
      assert.ok(source && target);
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2); await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 }); await page.mouse.up();
      await expect(page.locator(".seller-gallery-photo").first()).toHaveAttribute("data-sort-id", before[2]);
      const handle = page.getByRole("button", { name: "Urutkan foto 1", exact: true }); await handle.scrollIntoViewIfNeeded();
      const touchSource = await handle.boundingBox(), touchTarget = await page.locator(".seller-gallery-photo").nth(1).boundingBox();
      assert.ok(touchSource && touchTarget);
      const cdp = await context.newCDPSession(page);
      const start = { x: touchSource.x + touchSource.width / 2, y: touchSource.y + touchSource.height / 2 };
      const end = { x: touchTarget.x + touchTarget.width / 2, y: touchTarget.y + touchTarget.height / 2 };
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
      for (let step = 1; step <= 8; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start.x + (end.x-start.x)*step/8, y: start.y + (end.y-start.y)*step/8 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await cdp.detach();
      await expect(page.locator(".seller-gallery-photo").nth(1)).toHaveAttribute("data-sort-id", before[2]);
      const keyboard = page.getByRole("button", { name: "Urutkan foto 2", exact: true });
      await keyboard.focus(); await keyboard.press("Space"); await keyboard.press("Home"); await page.keyboard.press("Enter");
      await expect(page.locator(".seller-gallery-photo").first()).toHaveAttribute("data-sort-id", before[2]);
      await expect(page.locator(".seller-cover-badge")).toHaveCount(1);
    });
    await check("native editor: table builder, draft persistence, explicit publish and published edit", async () => {
      await page.getByRole("button", { name: "Gunakan varian sederhana", exact: true }).click();
      await page.locator("#product-name").fill("Native " + prefix);
      await page.locator("#product-price").fill("120000"); await page.getByLabel("SKU", { exact: true }).fill("NATIVE-" + prefix);
      await page.locator("#package-weight").fill("500");
      await page.getByRole("button", { name: "Buat tabel custom", exact: true }).click();
      await page.getByLabel("Judul kolom 2", { exact: true }).fill("Kapasitas");
      await page.getByRole("button", { name: "Tambah kolom", exact: true }).click();
      for (let row = 1; row <= 3; row++) await page.getByLabel(`Ukuran baris ${row} kolom 4`, { exact: true }).fill(`Nilai ${row}`);
      const handle = page.getByRole("button", { name: "Urutkan kolom 4", exact: true });
      await handle.focus(); await handle.press("Space"); await handle.press("ArrowLeft"); await page.keyboard.press("Enter");
      await page.getByLabel("Satuan tabel ukuran").selectOption("inch");
      for (const width of [320,360,375,390,430,768,1024,1280,1360,1440,1920]) {
        await page.setViewportSize({ width, height: 900 }); await page.evaluate(() => scrollTo(0,0)); await overflow(page);
        await page.screenshot({ path: path.join(artifactDir, `native-product-${width}.png`), fullPage: true });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() => document.documentElement.clientWidth === 390);
      await page.getByTestId("save-product").click();
      await expect(page).toHaveURL(/\/admin\/products\/(?!new$)[^/]+$/);
      id = page.url().split("/").pop()!;
      await expect(page.getByTestId("product-status")).toHaveText("Draft");
      const saved = await db.product.findUniqueOrThrow({ where: { id }, include: { images: { orderBy: { sortOrder: "asc" } } } });
      assert.equal(saved.images.length, 3); assert.equal((saved.sizeChart as { mode: string }).mode, "table");
      await page.reload(); await expect(page.getByLabel("Judul kolom 2", { exact: true })).toHaveValue("Kapasitas");
      await expect(page.getByLabel("Satuan tabel ukuran")).toHaveValue("inch");
      await page.getByTestId("publish-product").click(); await expect(page.getByTestId("product-status")).toHaveText("Terbit");
      const customer = await anonymous.newPage(); await customer.goto(base + "/product/" + saved.slug);
      await customer.getByText("Panduan Ukuran", { exact: true }).click();
      await expect(customer.getByTestId("product-size-chart")).toContainText("Kapasitas"); await expect(customer.getByTestId("product-size-chart")).toContainText("inci");
      await customer.close();
      await page.locator("#product-name").fill("Native " + prefix + " edited");
      await expect(page.getByTestId("save-product")).toContainText("Simpan Perubahan");
      await page.getByTestId("save-product").click(); await expect(page.getByTestId("product-status")).toHaveText("Terbit");
    });
    await check("native editor: chart image ownership, public published image and hidden empty chart", async () => {
      page.once("dialog", dialog => void dialog.accept());
      await page.getByRole("button", { name: "Upload gambar", exact: true }).click();
      await page.locator("#size-chart-upload").setInputFiles({ name: "chart.png", mimeType: "image/png", buffer: png });
      await expect(page.getByAltText("Pratinjau tabel ukuran", { exact: true })).toBeVisible();
      await page.getByTestId("save-product").click(); await expect(page.getByRole("region", { name: "Status perubahan produk" }).getByRole("status")).toContainText("Produk berhasil disimpan");
      const p = await db.product.findUniqueOrThrow({ where: { id }, include: { images: true } });
      const chart = p.sizeChart as { imageId: string };
      const image = p.images.find(image => image.id === chart.imageId)!; assert.ok(image.isVariation);
      assert.equal((await anonymous.request.get(base + image.url)).status(), 200);
      const customer = await anonymous.newPage(); await customer.goto(base + "/product/" + p.slug);
      await customer.getByText("Panduan Ukuran", { exact: true }).click();
      await expect(customer.getByTestId("product-size-chart").locator("img")).toHaveAttribute("src", image.url);
      await page.getByRole("button", { name: "Hapus tabel ukuran", exact: true }).click();
      await page.getByTestId("save-product").click(); await expect(page.getByRole("region", { name: "Status perubahan produk" }).getByRole("status")).toContainText("Produk berhasil disimpan");
      await customer.reload(); await expect(customer.getByTestId("product-size-chart")).toHaveCount(0);
      await page.getByTestId("draft-product").click(); await expect(page.getByTestId("product-status")).toHaveText("Draft");
      assert.equal((await anonymous.request.get(base + image.url)).status(), 404); await customer.close();
      const oldGallery = await page.locator(".seller-gallery-photo").evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.sortId!));
      await page.locator("#product-image-upload").setInputFiles({ name: "undo-new.png", mimeType: "image/png", buffer: png });
      await expect(page.locator(".seller-gallery-photo")).toHaveCount(4);
      const newPhoto = await page.locator(".seller-gallery-photo").last().getAttribute("data-sort-id");
      await page.getByRole("button", { name: "Hapus gambar 1", exact: true }).click();
      await expect(page.locator(".seller-gallery-photo")).toHaveCount(3);
      await page.getByRole("button", { name: "Pulihkan foto yang dihapus", exact: true }).click();
      await expect(page.locator(".seller-gallery-photo")).toHaveCount(4);
      assert.deepEqual(await page.locator(".seller-gallery-photo").evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.sortId!)), [...oldGallery, newPhoto]);
      await page.getByTestId("save-product").click();
      await expect(page.getByRole("region", { name: "Status perubahan produk" }).getByRole("status")).toContainText("Produk berhasil disimpan");
      await page.goto(base + "/admin/products"); await page.goto(base + "/admin/products/" + id);
      await page.locator("#product-name").fill("Unsaved browser back");
      const cancelBack = page.waitForEvent("dialog"); await page.evaluate(() => history.back()); await (await cancelBack).dismiss();
      await expect(page).toHaveURL(base + "/admin/products/" + id);
      await expect(page.locator("#product-name")).toHaveValue("Unsaved browser back");
      const allowBack = page.waitForEvent("dialog"); await page.evaluate(() => history.back()); await (await allowBack).accept();
      await expect(page).toHaveURL(base + "/admin/products");
      // Forward traversal must return to the editor when the seller cancels,
      // not advance to another history entry or leave a stale restore flag.
      await page.goto(base + "/admin/products/" + id);
      await page.evaluate(() => {
        history.pushState({ ...history.state, nativeForwardCheck: true }, "", location.pathname + "?native-forward-check=1");
        history.back();
      });
      await expect(page).toHaveURL(base + "/admin/products/" + id);
      await page.locator("#product-name").fill("Unsaved browser forward");
      const cancelForward = page.waitForEvent("dialog");
      await page.evaluate(() => history.forward());
      await (await cancelForward).dismiss();
      await expect(page).toHaveURL(base + "/admin/products/" + id);
      await expect(page.locator("#product-name")).toHaveValue("Unsaved browser forward");
      // The correction popstate must clear its guard so the next attempt
      // requests confirmation again and can proceed when accepted.
      const allowForward = page.waitForEvent("dialog");
      await page.evaluate(() => history.forward());
      await (await allowForward).accept();
      await expect(page).toHaveURL(base + "/admin/products/" + id + "?native-forward-check=1");
      assert.deepEqual(errors, []);
    });
  } catch (error) {  await page.screenshot({ path: path.join(artifactDir, "native-failure.png"), fullPage: false }); throw error; } finally { await context.close(); if (id) await db.product.update({ where: { id }, data: { status: "ARCHIVED" } }); }
}
