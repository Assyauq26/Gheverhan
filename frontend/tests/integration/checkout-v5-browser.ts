import assert from "node:assert/strict";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { chooseTestLocation, testAddress } from "../fixtures/jnt-checkout";
import type { PrismaClient } from "@prisma/client";
import { PRESETS } from "../../src/modules/appearance/presets";

export async function assertFeaturedConsistency(page: Page) {
  const cards = page.locator('[aria-label="Produk pilihan"] .product-card');
  await expect(cards.first().locator('.product-card-prices')).toHaveAttribute('style', /--product-price-scale/);
  await page.evaluate(() => document.fonts.ready);
  const metrics = await cards.evaluateAll(cards => cards.map(card => {
    const rect = card.getBoundingClientRect();
    const image = card.querySelector('.aspect-square')!.getBoundingClientRect();
    const title = card.querySelector('h3')!.getBoundingClientRect();
    const price = card.querySelector('.product-card-price')!.getBoundingClientRect();
    const original = card.querySelector('.product-card-original')?.getBoundingClientRect();
    return { width: rect.width, height: rect.height, image: Math.abs(image.width - image.height), priceInset: price.left - title.left,
      mainFontPx: parseFloat(getComputedStyle(card.querySelector('.product-card-price')!).fontSize),
      originalFontPx: card.querySelector('.product-card-original') ? parseFloat(getComputedStyle(card.querySelector('.product-card-original')!).fontSize) : null,
      purchaseY: price.top + price.height / 2 - rect.top, clipped: original ? original.right > rect.right : price.right > rect.right,
      gap: original ? original.left - price.right : 2 };
  }));
  assert.ok(metrics.length >= 4, 'At least four real featured cards are required');
  assert.ok(metrics.every(m => Math.abs(m.width - metrics[0].width) <= 1 && Math.abs(m.height - metrics[0].height) <= 1 && Math.abs(m.purchaseY - metrics[0].purchaseY) <= 1 && Math.abs(m.priceInset) <= 1 && m.image <= 1 && !m.clipped && m.gap >= 1.9 && m.gap <= 4), JSON.stringify(metrics));
  return metrics;
}

/** Focused local entrypoint; the normal CI path still runs the complete V4 suite. */
export async function verifyV5Cards(page: Page, admin: BrowserContext, db: PrismaClient, base: string, artifacts: string) {
  const suffix = Date.now(), ids: string[] = [], results: unknown[] = [];
  for (const [i, [basePrice, salePrice]] of [[20000, 5000], [299000, 249000], [1999000, 1499000], [8999000, null]].entries()) {
    const p = await db.product.create({ data: { name: i === 2 ? "Nama produk sangat panjang untuk memastikan ukuran kartu tidak berubah" : `V5 produk ${i}`, slug: `v5-card-${suffix}-${i}`, status: "PUBLISHED", weightGrams: 250, basePrice: basePrice!, salePrice, isFeatured: true, images: { create: { url: "/images/dashboard-fashion-rack.webp" } } } });
    ids.push(p.id);
  }
  const read = async () => (await (await admin.request.get(base + "/api/v1/admin/store-appearance")).json()).data;
  const original = await read();
  const command = async (value: Record<string, unknown>) => {
    const state = await read(); const r = await admin.request.post(base + "/api/v1/admin/store-appearance", { headers: { Origin: base }, data: { ...value, draftVersion: state.draftVersion, publishedVersion: state.publishedVersion } });
    assert.equal(r.status(), 200, await r.text());
  };
  try {
    for (const mode of ["default", "published"] as const) {
      if (mode === "published") { await command({ kind: "save", config: PRESETS[0].config }); await command({ kind: "publish" }); }
      for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 }); await page.goto(base);
        results.push({ mode, width, cards: await assertFeaturedConsistency(page) });
        if ([320, 390, 1440].includes(width)) await page.screenshot({ path: path.join(artifacts, `v5-featured-${mode}-${width}.png`) });
      }
    }
  } catch (error) {
    await page.screenshot({ path: path.join(artifacts, "v5-featured-failure.png"), fullPage: true });
    throw error;
  } finally {
    await writeFile(path.join(artifacts, "v5-featured-geometry.json"), JSON.stringify(results, null, 2));
    await command({ kind: "rollback", revision: original.publishedVersion });
    await db.product.updateMany({ where: { id: { in: ids } }, data: { status: "ARCHIVED" } });
  }
}

export async function verifyV5Checkout(browser: Browser, buyer: BrowserContext, db: PrismaClient, base: string, artifacts: string) {
  const bank = await db.bankAccount.create({ data: { bankName: "Synthetic", accountHolder: "Disposable V5", accountNumber: "TEST-ONLY", displayName: "V5 disposable bank" } });
  const context = await browser.newContext({ storageState: await buyer.storageState(), isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36" });
  const page = await context.newPage(), errors: string[] = [], metrics: unknown[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(base + "/checkout");
    await expect(page.getByTestId("place-order-btn")).toBeDisabled();
    await page.screenshot({ path: path.join(artifacts, "v5-checkout-unselected-390.png"), fullPage: true });
    let failed = false;
    await page.route("**/api/v1/regions?level=provinces*", route => {
      if (!failed) { failed = true; return route.fulfill({ status: 503, json: { success: false } }); }
      return route.continue();
    });
    await page.getByTestId("select-location").click();
    const dialog = page.getByTestId("region-dialog");
    await expect(dialog).toHaveAttribute("role", "dialog");
    await expect(dialog.getByText("Gagal memuat wilayah. Coba lagi.")).toBeVisible();
    await dialog.getByRole("button", { name: "Coba lagi", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Aceh", exact: true })).toBeVisible();
    assert.equal(await dialog.locator("nav button:disabled").count(), 3);
    await dialog.getByLabel("Cari Provinsi").fill("tidak-ada-wilayah-ini");
    await expect(dialog.getByText("Wilayah tidak ditemukan. Coba kata lain.")).toBeVisible();
    for (const [search, name] of [["Jakarta", "Daerah Khusus Ibukota Jakarta"], ["Jakarta Pusat", "Kota Administrasi Jakarta Pusat"], ["Gambir", "Gambir"], ["Gambir", "Gambir"]]) {
      await dialog.locator("#region-search").fill(search);
      await dialog.getByRole("button", { name, exact: true }).click();
    }
    await expect(dialog.getByLabel("Kode pos", { exact: true })).toHaveValue("10110");
    await dialog.getByRole("button", { name: "Gunakan lokasi ini", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("select-location")).toContainText("Gambir");
    await page.getByTestId("input-line").fill("Detail jalan tetap tersimpan RT 01 RW 02");
    await page.getByTestId("select-location").click();
    await dialog.getByRole("button", { name: /Provinsi/ }).click();
    await dialog.locator("#region-search").fill("Jawa Barat");
    await dialog.getByRole("button", { name: "Jawa Barat", exact: true }).click();
    assert.equal(await dialog.locator("nav button:disabled").count(), 2);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("select-location")).toContainText("Gambir");
    await expect(page.getByTestId("input-line")).toHaveValue("Detail jalan tetap tersimpan RT 01 RW 02");
    await expect(page.getByTestId("select-location")).toBeFocused();
    for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByTestId("select-location").click();
      await expect(dialog.getByTestId("region-confirm-summary")).toContainText("Gambir");
      for (let i = 0; i < 9; i++) {
        await page.keyboard.press("Tab");
        assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)), "Focus must stay inside location dialog");
      }
      const box = await dialog.boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 901);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      metrics.push({ width, dialog: box, focusTrapped: true });
      await page.screenshot({ path: path.join(artifacts, `v5-region-modal-${width}.png`) });
      await dialog.getByRole("button", { name: "Gunakan lokasi ini", exact: true }).click();
    }
    await page.getByTestId("input-recipient").fill(testAddress.recipientName);
    await page.getByTestId("input-phone").fill(testAddress.phone);
    await page.getByTestId("ship-option-0").click();
    await expect(page.getByTestId("place-order-btn")).toBeEnabled();
    await expect(page.getByText("JNE", { exact: true })).toHaveCount(0);
    await expect(page.getByText("SiCepat", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: path.join(artifacts, "v5-checkout-ready-1440.png"), fullPage: true });
    // Replacing the destination invalidates the old quote immediately, with no order submission.
    await page.getByTestId("select-location").click();
    await dialog.getByRole("button", { name: /Desa\/Kelurahan/ }).click();
    await dialog.getByRole("button", { name: "Cideng", exact: true }).click();
    await dialog.getByRole("button", { name: "Gunakan lokasi ini", exact: true }).click();
    await expect(page.getByTestId("place-order-btn")).toBeDisabled();
    await expect(page.getByText(/Layanan J&T belum tersedia untuk alamat ini/)).toBeVisible();
    assert.equal(await page.locator('input[name="quoteToken"]').inputValue(), "");
    const invalid = await context.request.get(base + "/api/v1/regions?level=districts&parent=3171");
    assert.equal(invalid.status(), 422);
    assert.deepEqual(errors, []);
  } finally {
    await writeFile(path.join(artifacts, "v5-browser-results.json"), JSON.stringify({ metrics, errors }, null, 2));
    await context.close();
    await db.bankAccount.delete({ where: { id: bank.id } });
  }
}
