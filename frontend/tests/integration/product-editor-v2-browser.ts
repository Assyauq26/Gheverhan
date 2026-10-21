import assert from "node:assert/strict";
import path from "node:path";
import { expect, type Page, type ConsoleMessage } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
export async function verifyProductEditorV2({
  page,
  db,
  base,
  artifactDir,
  prefix,
  check,
  png,
}: {
  page: Page;
  db: PrismaClient;
  base: string;
  artifactDir: string;
  prefix: string;
  check: (name: string, run: () => Promise<void>) => Promise<void>;
  png: Buffer;
}) {
  const browserErrors: string[] = [];
  const onError = (error: Error) => browserErrors.push(error.message);
  const onConsole = (message: ConsoleMessage) => { if (message.type() === "error") browserErrors.push(message.text()); };
  page.on("pageerror", onError);
  page.on("console", onConsole);
  const capture = async (label: string) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    return page.screenshot({
      path: path.join(artifactDir, `editor-v2-${label}.png`),
      fullPage: true,
    });
  };
  const save = page.getByTestId("save-product");
  let productId = "";
  await check(
    "editor V2: clean empty create, staged upload before name, reorder/remove and refresh recovery",
    async () => {
      await page.goto(base + "/admin/products/new");
      await expect(save).toBeDisabled();
      for (const width of [360, 390, 430, 768, 1024, 1360]) {
        await page.setViewportSize({ width, height: 900 });
        await capture(`create-empty-${width}`);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
      }
      await page.setViewportSize({ width: 390, height: 844 });
      const before = await db.product.count();
      for (let i = 0; i < 2; i++) {
        await page.locator("#product-image-upload").setInputFiles({
          name: `before-save-${i}.png`,
          mimeType: "image/png",
          buffer: png,
        });
        await expect(page.getByRole("status")).toContainText(
          "Foto sementara siap",
        );
        await expect(page.locator("#product-images img")).toHaveCount(i + 1);
      }
      assert.equal(await db.product.count(), before, "No hidden Product draft");
      const images = await page
        .locator("#product-images img")
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src")));
      await page
        .getByRole("button", { name: "Pindahkan foto 2 ke atas", exact: true })
        .click();
      await expect(page.locator("#product-images img").first()).toHaveAttribute(
        "src",
        images[1]!,
      );
      await page
        .getByRole("button", { name: "Hapus gambar 2", exact: true })
        .click();
      await expect(page.locator("#product-images img")).toHaveCount(1);
      await expect(save).toBeEnabled();
      page.once("dialog", (dialog) => void dialog.accept());
      await page.reload();
      await expect(page.locator("#product-images img")).toHaveCount(1);
      await expect(page.locator("#product-images img")).toHaveAttribute(
        "src",
        images[1]!,
      );
      assert.equal(await db.product.count(), before);
    },
  );
  await check(
    "editor V2: shipping validation, bulk absolute stock and durable persistence",
    async () => {
      await page
        .getByRole("button", { name: "Gunakan varian sederhana", exact: true })
        .click();
      await page.locator("#product-name").fill("Editor V2 " + prefix);
      await page.locator("#product-price").fill("150000");
      await page.getByLabel("SKU", { exact: true }).fill("EDITOR-V2-" + prefix);
      await page.locator("#bulk-price").fill("125000");
      await page.locator("#bulk-onHand").fill("8");
      await page
        .getByRole("button", { name: "Terapkan Massal", exact: true })
        .click();
      await expect(
        page.getByLabel("Stok fisik", { exact: true }).last(),
      ).toHaveValue("8");
      await page.locator("#package-weight").fill("-1");
      await save.click();
      await expect(
        page
          .getByRole("region", { name: "Status perubahan produk" })
          .getByRole("alert"),
      ).toBeVisible();
      await expect(page.locator("#product-name")).toHaveValue(
        "Editor V2 " + prefix,
      );
      await page.locator("#package-weight").fill("500");
      await page.locator("#package-length").fill("30");
      await save.click();
      await expect(
        page
          .getByRole("region", { name: "Status perubahan produk" })
          .getByRole("alert"),
      ).toContainText("Lengkapi");
      await page.locator("#package-width").fill("20");
      await page.locator("#package-height").fill("12,5");
      await capture("create-partial-390");
      await save.click();
      await expect(page).toHaveURL(/\/admin\/products\/(?!new$)[^/]+$/);
      productId = page.url().split("/").pop()!;
      const p = await db.product.findUniqueOrThrow({
        where: { id: productId },
        include: { variants: { include: { inventory: true } } },
      });
      assert.equal(p.weightGrams, 500);
      assert.equal(p.packageLengthMm, 300);
      assert.equal(p.packageHeightMm, 125);
      assert.equal(p.variants[0].price, 125000);
      assert.equal(p.variants[0].inventory?.onHand, 8);
      await expect(save).toBeDisabled();
      await page.reload();
      await expect(page.locator("#package-height")).toHaveValue("12,5");
    },
  );
  await check(
    "editor V2: canonical revert is clean, save is not sticky, guard and six viewports",
    async () => {
      await page
        .locator("#product-name")
        .fill("Editor V2 " + prefix + " changed");
      await expect(save).toBeEnabled();
      await capture("save-dirty-390");
      await page.locator("#product-name").fill("Editor V2 " + prefix);
      await expect(save).toBeDisabled();
      assert.equal(
        await save
          .locator("..")
          .evaluate((node) => getComputedStyle(node).position),
        "static",
      );
      await page.locator("#package-weight").fill("750");
      page.once("dialog", (dialog) => void dialog.dismiss());
      await page
        .getByRole("link", { name: "Kembali ke produk", exact: true })
        .click();
      await expect(page).toHaveURL(base + "/admin/products/" + productId);
      await page.locator("#package-weight").fill("500");
      await expect(save).toBeDisabled();
      for (const width of [360, 390, 430, 768, 1024, 1360]) {
        await page.setViewportSize({ width, height: 900 });
        await capture(`edit-filled-${width}`);
        await page
          .locator("#product-shipping")
          .evaluate((node) => node.scrollIntoView({ block: "start" }));
        await page
          .locator("#product-shipping")
          .screenshot({
            path: path.join(artifactDir, `editor-v2-shipping-${width}.png`),
          });
        await save
          .locator("..")
          .screenshot({
            path: path.join(artifactDir, `editor-v2-save-clean-${width}.png`),
          });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `editor V2 ${width}px overflow`,
        );
      }
    },
  );
  assert.deepEqual(browserErrors, [], "Editor V2 must not emit console, hydration or unhandled browser errors");
  page.off("pageerror", onError);
  page.off("console", onConsole);

}
