import { testAddress, apiShipping, chooseTestLocation } from "../fixtures/jnt-checkout";
/** Real product editor/actions/storage adapter/storefront/cart, local fixtures only. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import path from "node:path";
import {
  expect,
  type Page,
  type Browser,
  type BrowserContext,
} from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
import { signSession } from "../../src/lib/auth/jwt";

type Context = {
  page: Page;
  browser: Browser;
  admin: BrowserContext;
  anonymous: BrowserContext;
  readOnly: BrowserContext;
  db: PrismaClient;
  base: string;
  artifactDir: string;
  prefix: string;
  check: (label: string, run: () => Promise<void>) => Promise<void>;
};
function png(red: number, green: number, blue: number) {
  const crc = (bytes: Buffer) => {
    let value = 0xffffffff;
    for (const byte of bytes) {
      value ^= byte;
      for (let i = 0; i < 8; i++)
        value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const name = Buffer.from(type),
      size = Buffer.alloc(4),
      sum = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    sum.writeUInt32BE(crc(Buffer.concat([name, data])));
    return Buffer.concat([size, name, data, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(16, 0);
  header.writeUInt32BE(16, 4);
  header[8] = 8;
  header[9] = 2;
  const scan = Buffer.concat(
    Array.from({ length: 16 }, () =>
      Buffer.concat([
        Buffer.from([0]),
        Buffer.from(
          Array.from({ length: 16 }, () => [red, green, blue]).flat(),
        ),
      ]),
    ),
  );
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scan)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
export async function verifyCustomVariations(c: Context) {
  const { page, db, base, check, artifactDir } = c,
    root = page.getByTestId("custom-variation-editor");
  const closeEditor = async () => {
    const save = page.locator(".seller-editor-actions button");
    if (await save.count()) await save.click();
  };
  const openGroups = async () => {
    if (await page.getByRole("dialog", { name: "Varian", exact: true }).count()) return;
    await closeEditor();
    await page.locator(".seller-sales-links button").first().click();
  };
  const openStock = async () => {
    if (await page.getByRole("dialog", { name: "Harga/Stok", exact: true }).count()) return;
    await closeEditor();
    await page.locator(".seller-sales-links button").nth(1).click();
  };
  const category = await db.category.findUniqueOrThrow({
    where: { slug: `browser-${c.prefix}` },
  });
  const name = "Variasi Custom " + c.prefix,
    slug = "variasi-custom-" + c.prefix;
  const red = png(160, 28, 38),
    green = png(28, 110, 66);
  const capture = async (label: string) => {
    await page.screenshot({
      path: path.join(artifactDir, `product-custom-${label}.png`),
      fullPage: false,
    });
  };
  const fixtureProductIds: string[] = [];
  let productId = "",
    beforeIds: string[] = [],
    orderId = "",
    orderLabel = "",
    orderImage: string | null = null;
  const customer = await db.user.create({
    data: {
      name: "Dummy variation buyer",
      email: randomUUID() + "@example.test",
      passwordHash: "dummy-only",
      roles: { create: { role: { connect: { name: "Customer" } } } },
    },
  });
  const buyer = await c.browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await buyer.addCookies([
    {
      name: "gh_session",
      value: await signSession({ sub: customer.id, email: customer.email }),
      domain: "localhost",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const store = await buyer.newPage();
  const errors: string[] = [];
  store.on("pageerror", (error) => errors.push(error.message));
  store.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  try {
    await check(
      "custom mobile editor: arbitrary groups, staged images before save, six stable SKU combinations",
      async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(`${base}/admin/products/new`);
        await page.getByLabel("Nama produk", { exact: true }).fill(name);
        await page
          .getByLabel("Kategori", { exact: true })
          .selectOption(category.id);
        await openGroups();
        await root
          .getByRole("button", { name: "Tambah variasi pertama", exact: true })
          .scrollIntoViewIfNeeded();
        await capture("empty-390");
        await root
          .getByRole("button", { name: "Tambah variasi pertama", exact: true })
          .click();
        await root.getByLabel("Nama variasi 1", { exact: true }).fill("Warna");
        await root.getByLabel("Opsi Warna 1", { exact: true }).fill("Merah");
        await root
          .locator(".variation-card")
          .first()
          .getByRole("button", { name: "Tambahkan opsi", exact: true })
          .click();
        await root.getByLabel("Opsi Warna 2", { exact: true }).fill("Hijau");
        await capture("image-disabled-390");
        await root
          .getByRole("switch", { name: "Tambahkan gambar Warna", exact: true })
          .check();
        assert.equal(
          await db.product.count({ where: { slug } }),
          0,
          "No hidden product before save",
        );
        // Pause locally to inspect a real pending upload, then resume the actual API call.
        let release!: () => void, entered!: () => void;
        const hold = new Promise<void>((r) => (release = r)),
          started = new Promise<void>((r) => (entered = r));
        const uploadUrl = `${base}/api/v1/admin/product-media`;
        await page.route(
          uploadUrl,
          async (route) => {
            entered();
            await hold;
            await route.continue();
          },
          { times: 1 },
        );
        await root
          .getByLabel("File foto Merah", { exact: true })
          .setInputFiles({
            name: "red.png",
            mimeType: "image/png",
            buffer: red,
          });
        await started;
        await expect(root.getByText(/Mengunggah/)).toBeVisible();
        await expect(
          root
            .getByRole("button", { name: "Unggah foto Merah", exact: true })
            .locator("img"),
        ).toHaveAttribute("src", /^blob:/);

        await capture("uploading-390");
        release();
        await expect(
          root
            .getByRole("button", { name: "Ganti foto Merah", exact: true })
            .locator("img"),
        ).toBeVisible();
        // Drop a successful staged response, then retry the same upload identity.
        await page.route(
          uploadUrl,
          async (route) => {
            const committed = await route.fetch();
            assert.equal(
              committed.status(),
              201,
              "fault injection must discard a successful committed upload",
            );
            await route.abort("failed");
          },
          { times: 1 },
        );
        const responseLost = page.waitForEvent("requestfailed", {
          predicate: (request) =>
            request.url() === uploadUrl && request.method() === "POST",
          timeout: 30000,
        });
        await root
          .getByLabel("File foto Hijau", { exact: true })
          .setInputFiles({
            name: "green.png",
            mimeType: "image/png",
            buffer: green,
          });
        // Assert recovery after the real upload has committed and its response is lost,
        // rather than counting provider processing time against the UI's 5s deadline.
        await responseLost;
        await root
          .getByRole("button", { name: "Coba unggah lagi", exact: true })
          .click();
        await expect(
          root
            .getByRole("button", { name: "Ganti foto Hijau", exact: true })
            .locator("img"),
        ).toBeVisible();
        await expect(root.getByRole("status")).toContainText(
          "Foto sementara siap",
        );
        await capture("image-preview-390");
        const privateUrl = await root
          .getByRole("button", { name: "Ganti foto Merah", exact: true })
          .locator("img")
          .getAttribute("src");
        assert.ok(privateUrl);
        assert.equal(
          (await c.anonymous.request.get(base + privateUrl)).status(),
          401,
        );
        assert.equal(await db.product.count({ where: { slug } }), 0);
        // Codex review regression: deleting a previously staged option image
        // inside the panel must not cancel the remote object if the seller
        // discards the panel edits and restores its opening snapshot.
        await closeEditor();
        await openGroups();
        await root.getByRole("button", { name: "Lepaskan foto Merah", exact: true }).click();
        const stagedLibrary = root.locator(".variation-media-library");
        await stagedLibrary.locator("summary").click();
        await stagedLibrary.getByRole("button", { name: "Hapus permanen foto tersimpan 1", exact: true }).click();
        await page.getByRole("dialog").last().getByRole("button", { name: "Hapus foto", exact: true }).click();
        page.once("dialog", dialog => void dialog.accept());
        await page.getByRole("button", { name: "Kembali ke produk", exact: true }).click();
        await openGroups();
        await expect(root.getByRole("button", { name: "Ganti foto Merah", exact: true })).toBeVisible();
        assert.equal((await page.request.get(base + privateUrl)).status(), 200, "Discard must restore a usable staged object");
        await root.getByRole("button", { name: /^Tambah variasi / }).click();
        await root.getByLabel("Nama variasi 2", { exact: true }).fill("Ukuran");
        await root.getByLabel("Opsi Ukuran 1", { exact: true }).fill("M");
        for (const [index, value] of [
          [2, "L"],
          [3, "XL"],
        ] as const) {
          await root
            .locator(".variation-card")
            .nth(1)
            .getByRole("button", { name: "Tambahkan opsi", exact: true })
            .click();
          await root
            .getByLabel(`Opsi Ukuran ${index}`, { exact: true })
            .fill(value);
        }
        await root
          .getByRole("switch", { name: "Tambahkan gambar Ukuran", exact: true })
          .click();
        const dialog = page.getByRole("dialog").last();
        await expect(dialog).toContainText(
          "Foto variasi hanya dapat digunakan pada satu jenis variasi.",
        );
        await capture("image-conflict-390");
        await expect(
          dialog.getByRole("button", { name: "Batal", exact: true }),
        ).toBeFocused();
        await page.setViewportSize({ width: 1360, height: 900 });
        await capture("image-conflict-1360");
        await page.setViewportSize({ width: 390, height: 844 });
        await dialog
          .getByRole("button", { name: "Batal", exact: true })
          .click();
        await expect(
          root.getByRole("switch", {
            name: "Tambahkan gambar Warna",
            exact: true,
          }),
        ).toBeChecked();
        await expect(
          root.getByRole("switch", {
            name: "Tambahkan gambar Ukuran",
            exact: true,
          }),
        ).not.toBeChecked();
        // Gallery selector is available only on image-enabled groups, and
        // option values remain within their mobile cards.
        // Seller screen uses the visible thumbnail, not the legacy desktop-only selector.
        const thumbnail = root.getByRole("button", { name: /^(Ganti|Unggah) foto Merah$/ });
        await expect(thumbnail).toBeEnabled();
        await thumbnail.click();
        const picker = page.getByRole("dialog", { name: "Pilih gambar variasi" });
        await expect(picker).toBeVisible();
        await expect(picker.getByRole("button", { name: "Unggah baru" })).toBeVisible();
        await picker.getByRole("button", { name: "Batal" }).click();
        await expect(root.getByRole("button", { name: "Pilih gambar variasi untuk M" })).toHaveCount(0);
        const rowWidths = await root.locator(".variation-value-row").evaluateAll((rows) =>
          rows.map((row) => ({ scroll: row.scrollWidth, client: row.clientWidth })),
        );
        assert.ok(rowWidths.every((size) => size.scroll <= size.client + 1), "Option rows must fit 390px");
        await openStock();
        await root.getByRole("button", { name: "Buat 6 kombinasi", exact: true }).click();
        const visibleSections = await root.evaluate((editor) => {
          const children = Array.from(editor.children);
          return [".variation-bulk", ".variation-review", ".variation-skus"].map(
            (selector) => children.findIndex((child) => child.matches(selector)),
          );
        });
        assert.ok(visibleSections.every((index, i) => index >= 0 && (i === 0 || index > visibleSections[i - 1])), "Bulk, review and SKU appear in order");
        const bulk = root.locator(".variation-bulk");
        const columns = await bulk
          .locator(":scope > div.mt-4")
          .evaluate((fields) =>
            getComputedStyle(fields).gridTemplateColumns.split(" ").length,
          );
        assert.equal(columns, 3, "Bulk input fields stay three columns on mobile");
        await bulk.locator("#bulk-price").fill("175000");
        await bulk.locator("#bulk-onHand").fill("5");
        await bulk
          .getByRole("button", { name: "Terapkan Massal", exact: true })
          .click();
        for (let i = 0; i < 6; i++)
          await expect(root.locator(`#sku-stock-${i}`)).toHaveValue("5");
        await bulk
          .getByRole("radio", { name: "Hanya SKU dipilih", exact: true })
          .check();
        await root
          .getByRole("checkbox", { name: "Pilih SKU 1", exact: true })
          .check();
        await bulk.locator("#bulk-onHand").fill("7");
        await bulk
          .getByRole("button", { name: "Terapkan Massal", exact: true })
          .click();
        await expect(root.locator("#sku-stock-0")).toHaveValue("7");
        await expect(root.locator("#sku-stock-1")).toHaveValue("5");
        await capture("bulk-selected-390");
        await bulk
          .getByRole("radio", { name: "Terapkan ke semua SKU", exact: true })
          .check();
        await root
          .getByLabel("SKU kombinasi 1", { exact: true })
          .fill("CUSTOM-" + c.prefix + "-RED-M");
        await root.locator("#sku-price-0").fill("123000");
        await root.locator("#sku-sale-0").fill("110000");
        await root.locator(".variation-sku").first().scrollIntoViewIfNeeded();
        await capture("sku-editor-390");
        // Finalize the staged gallery and option photos in the product save transaction.
        await closeEditor();
        await page.locator("#product-image-upload").setInputFiles({
          name: "gallery.png",
          mimeType: "image/png",
          buffer: red,
        });
        await expect(
          page
            .getByRole("region", { name: "Status perubahan produk" })
            .getByRole("status"),
        ).toContainText("Foto sementara siap");
        await page.locator("#package-weight").fill("500");
        await page.getByTestId("save-product").click();
        await expect(page).toHaveURL(/\/admin\/products\/(?!new$)[^/]+$/);
        productId = (await db.product.findUniqueOrThrow({ where: { slug } }))
          .id;
        fixtureProductIds.push(productId);
        await expect(page).toHaveURL(`${base}/admin/products/${productId}`);
        const product = await db.product.findUniqueOrThrow({
          where: { id: productId },
          include: {
            optionGroups: { include: { values: true } },
            variants: { include: { optionValues: true, inventory: true } },
          },
        });
        assert.equal(product.optionsEnabled, true);
        assert.equal(product.optionGroups.length, 2);
        assert.equal(product.variants.length, 6);
        assert.equal(
          product.optionGroups.filter((g) => g.allowsImage).length,
          1,
        );
        assert.equal(
          product.optionGroups.flatMap((g) => g.values.filter((v) => v.imageId))
            .length,
          2,
        );
        assert.ok(product.variants.every((v) => v.optionValues.length === 2));
        beforeIds = product.variants.map((v) => v.id).sort();
        await page.reload();
        await openGroups();
        await expect(root.getByLabel("Nama variasi 1")).toHaveValue("Warna");
        await root.getByRole("button", { name: "Ganti foto Merah" }).click();
        const galleryDialog = page.getByRole("dialog", { name: "Pilih gambar variasi" });
        await expect(galleryDialog.getByRole("button", { name: "Pilih foto 1" })).toBeVisible();
        await expect(galleryDialog.getByRole("button", { name: "Unggah baru" })).toBeVisible();
        await galleryDialog.getByRole("button", { name: "Batal" }).click();
        await capture("saved-390");
        for (const width of [360, 390, 430, 768, 1024, 1360, 1920]) {
          await page.setViewportSize({ width, height: 900 });
          await root.locator(".variation-groups").scrollIntoViewIfNeeded();
          await page.evaluate(() => window.scrollBy(0, -120));
          const inputBox = await root
            .getByLabel("Opsi Warna 1", { exact: true })
            .boundingBox();
          assert.ok(
            inputBox && inputBox.width >= 100,
            `usable image option field at ${width}`,
          );
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
          );
          await capture(`photos-overview-${width}`);
          await openStock();
          await root.locator(".variation-sku").first().scrollIntoViewIfNeeded();
          await capture(`photos-skus-${width}`);
          await openGroups();
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await closeEditor();
      },
    );
    await check(
      "custom image upload retains RBAC, Origin and signature/size checks",
      async () => {
        const current = await db.product.findUniqueOrThrow({
          where: { id: productId },
        });
        const url = `${base}/api/v1/admin/products/${productId}/images`,
          form = {
            image: { name: "photo.png", mimeType: "image/png", buffer: red },
            purpose: "option",
            updatedAt: current.updatedAt.toISOString(),
          };
        assert.equal(
          (
            await c.readOnly.request.post(url, {
              headers: { origin: base },
              multipart: form,
            })
          ).status(),
          403,
        );
        assert.equal(
          (
            await c.anonymous.request.post(url, {
              headers: { origin: base },
              multipart: form,
            })
          ).status(),
          401,
        );
        assert.equal(
          (
            await c.admin.request.post(url, {
              headers: { origin: "https://untrusted.example.test" },
              multipart: form,
            })
          ).status(),
          403,
        );
        assert.equal(
          (
            await c.admin.request.post(url, {
              headers: { origin: base },
              multipart: {
                ...form,
                image: { ...form.image, buffer: Buffer.from("not-a-png") },
              },
            })
          ).status(),
          422,
        );
        const oversized = await c.admin.request.post(url, {
          headers: { origin: base },
          multipart: {
            ...form,
            image: { ...form.image, buffer: Buffer.alloc(4 * 1024 * 1024 + 1) },
          },
        });
        assert.ok([413, 422].includes(oversized.status()));
      },
    );
    await check(
      "custom storefront changes option gallery and adds the exact all-dimensions SKU",
      async () => {
        await page.getByTestId("publish-product").click();
        await expect(page.getByTestId("product-status")).toHaveText("Terbit");
        const groups = await db.productOptionGroup.findMany({
          where: { productId },
          include: { values: { include: { image: true } } },
        });
        const colors = groups.find((g) => g.name === "Warna")!,
          sizes = groups.find((g) => g.name === "Ukuran")!;
        const r = colors.values.find((v) => v.value === "Merah")!,
          g = colors.values.find((v) => v.value === "Hijau")!,
          xl = sizes.values.find((v) => v.value === "XL")!;
        await store.goto(`${base}/product/${slug}`);
        await store.getByTestId(`option-${r.id}`).click();
        const gallerySource = async () => {
          const source = await store.getByTestId("product-gallery").locator(".pdp-gallery-image").getAttribute("src");
          const url = new URL(source || "", base);
          return new URL(url.pathname === "/_next/image" ? url.searchParams.get("url") || "" : source || "", base).href;
        };
        await expect.poll(gallerySource).toBe(new URL(r.image!.url, base).href);
        await store.getByTestId("product-gallery").scrollIntoViewIfNeeded();
        await expect
          .poll(() =>
            store
              .getByTestId("product-gallery")
              .locator("img")
              .first()
              .evaluate((img) => (img as HTMLImageElement).naturalWidth),
          )
          .toBeGreaterThan(0);
        await store.screenshot({
          path: path.join(artifactDir, "product-custom-store-red-390.png"),
        });
        await store.getByTestId(`option-${g.id}`).click();
        await store.getByTestId(`option-${xl.id}`).click();
        await expect.poll(gallerySource).toBe(new URL(g.image!.url, base).href);
        const variant = await db.productVariant.findFirstOrThrow({
          where: {
            productId,
            AND: [
              { optionValues: { some: { valueId: g.id } } },
              { optionValues: { some: { valueId: xl.id } } },
            ],
          },
        });
        await expect(store.getByTestId("selected-sku")).toContainText(
          variant.sku,
        );
        await store.getByTestId("product-gallery").scrollIntoViewIfNeeded();
        await expect
          .poll(() =>
            store
              .getByTestId("product-gallery")
              .locator("img")
              .first()
              .evaluate((img) => (img as HTMLImageElement).naturalWidth),
          )
          .toBeGreaterThan(0);
        await store.screenshot({
          path: path.join(artifactDir, "product-custom-store-green-390.png"),
        });
        await store.getByTestId("add-to-cart-btn").click();
        await expect(store.getByTestId("cart-success-sheet")).toBeVisible();
        await store.getByRole("button", {name:"Lanjut Belanja",exact:true}).click();
        const cart = await db.cartItem.findMany({
          where: { cart: { userId: customer.id } },
        });
        assert.equal(cart.length, 1);
        assert.equal(cart[0].variantId, variant.id);
        const bank = await db.bankAccount.create({
          data: {
            bankName: "Dummy Bank",
            accountNumber: "0000000000",
            accountHolder: "Dummy",
            displayName: "Disposable only",
          },
        });
        const { quote, shipping: selectedShipping } = await apiShipping(buyer.request, base);
        const order = await buyer.request.post(`${base}/api/v1/orders`, {
          data: {
            requestId: randomUUID(),
            address: testAddress,
            shipping: selectedShipping,
            bankAccountId: bank.id,
            expectedLines: quote.lines.map(
              (l: {
                variantId: string;
                quantity: number;
                unitPrice: number;
              }) => ({
                variantId: l.variantId,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
              }),
            ),
            expectedQuote: {
              subtotal: quote.subtotal,
              shippingCost: quote.shippingCost,
              discount: quote.discount,
              total: quote.total,
            },
          },
        });
        assert.equal(order.status(), 201);
        orderId = (await order.json()).data.id;
        const snapshot = await db.orderItem.findFirstOrThrow({
          where: { orderId },
        });
        assert.equal(snapshot.variantId, variant.id);
        assert.equal(snapshot.imageUrl, g.image!.url);
        assert.match(snapshot.variantLabel, /Warna: Hijau/);
        assert.match(snapshot.variantLabel, /Ukuran: XL/);
        orderLabel = snapshot.variantLabel;
        orderImage = snapshot.imageUrl;
        assert.equal(
          (
            await db.inventory.findUniqueOrThrow({
              where: { variantId: variant.id },
            })
          ).reserved,
          1,
        );
      },
    );
    await check(
      "custom rename/reorder and dirty guards preserve SKU identity and order snapshots",
      async () => {
        await page.reload();
        await openGroups();
        await root.getByLabel("Nama variasi 1").fill("Motif");
        page.once("dialog", (dialog) => dialog.dismiss());
        await closeEditor();
        await page
          .getByRole("link", { name: "Kembali ke produk", exact: true })
          .click();
        await expect(page).toHaveURL(`${base}/admin/products/${productId}`);
        await openGroups();
        await expect(root.getByLabel("Nama variasi 1")).toHaveValue("Motif");
        await page.getByRole("button", { name: "Urutkan", exact: true }).click();
        const handle = root.getByRole("button", { name: "Urutkan opsi Hijau", exact: true });
        await handle.focus(); await handle.press("Space"); await handle.press("ArrowUp"); await page.keyboard.press("Enter");
        await page.getByRole("button", { name: "Selesai", exact: true }).click();
        await closeEditor();
        await page.getByTestId("save-product").click();
        await expect(
          page
            .getByRole("region", { name: "Status perubahan produk" })
            .getByRole("status"),
        ).toHaveText("Produk berhasil disimpan.");
        assert.deepEqual(
          (await db.productVariant.findMany({ where: { productId } }))
            .map((v) => v.id)
            .sort(),
          beforeIds,
        );
        const item = await db.orderItem.findFirstOrThrow({
          where: { orderId },
        });
        assert.equal(item.variantLabel, orderLabel);
        assert.equal(item.imageUrl, orderImage);
        await openGroups();
        await root
          .getByRole("button", { name: "Hapus opsi Hijau", exact: true })
          .click();
        await expect(root.getByRole("alert")).toContainText(
          "stok atau riwayat",
        );
        await capture("protected-error-390");
      },
    );
    await check(
      "image-mode transfer retains objects and historical photo deletion fails closed",
      async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        const existing = await db.productImage.findMany({
          where: { productId, isVariation: true },
        });
        await root
          .getByRole("switch", { name: "Tambahkan gambar Ukuran", exact: true })
          .click();
        await page
          .getByRole("dialog").last()
          .getByRole("button", { name: "Pindahkan", exact: true })
          .click();
        await expect(
          root.getByRole("switch", {
            name: "Tambahkan gambar Motif",
            exact: true,
          }),
        ).not.toBeChecked();
        await closeEditor();
        await page.getByTestId("save-product").click();
        await expect(
          page
            .getByRole("region", { name: "Status perubahan produk" })
            .getByRole("status"),
        ).toHaveText("Produk berhasil disimpan.");
        assert.equal(
          await db.productImage.count({
            where: { productId, isVariation: true },
          }),
          existing.length,
        );
        assert.equal(
          await db.productOptionValue.count({
            where: { productId, imageId: { not: null } },
          }),
          0,
        );
        await openGroups();
        const library = root.locator(".variation-media-library");
        await library.locator("summary").click();
        const ordered = await db.productImage.findMany({
          where: { productId, isVariation: true },
          orderBy: { sortOrder: "asc" },
        });
        const historic = ordered.findIndex((image) => image.url === orderImage);
        assert.ok(historic >= 0);
        await library
          .getByRole("button", {
            name: `Hapus permanen foto tersimpan ${historic + 1}`,
            exact: true,
          })
          .click();
        await page
          .getByRole("dialog").last()
          .getByRole("button", { name: "Hapus foto", exact: true })
          .click();
        await closeEditor();
        await page.getByTestId("save-product").click();
        await expect(
          page
            .getByRole("region", { name: "Status perubahan produk" })
            .getByRole("alert"),
        ).toContainText("riwayat pesanan");
        assert.ok(
          await db.productImage.findUnique({
            where: { id: ordered[historic].id },
          }),
        );
        await openGroups();
        const recoveredLibrary = root.locator(".variation-media-library");
        await recoveredLibrary.locator("summary").click();
        await recoveredLibrary
          .getByRole("button", {
            name: "Pulihkan penghapusan foto yang belum disimpan",
            exact: true,
          })
          .click();
        await closeEditor();
        await expect(page.getByTestId("save-product")).toBeDisabled();
        assert.deepEqual(
          (await db.productVariant.findMany({ where: { productId } }))
            .map((v) => v.id)
            .sort(),
          beforeIds,
        );
        const item = await db.orderItem.findFirstOrThrow({
          where: { orderId },
        });
        assert.equal(item.imageUrl, orderImage);
        assert.equal(item.variantLabel, orderLabel);
        await capture("image-transfer-390");
      },
    );
    await check(
      "custom sparse combinations never fall back to another sellable SKU",
      async () => {
        const {
          createManagedProduct,
          updateManagedProduct,
          getManagedProduct,
          changeProductStatus,
        } = await import(
          "../../src/modules/catalog/product-management.service"
        );
        const { ALL_PERMISSIONS } = await import(
          "../../src/lib/auth/permissions"
        );
        const actor = {
          id: customer.id,
          isAdmin: true,
          permissions: [...ALL_PERMISSIONS],
        };
        const groups = [
          {
            id: randomUUID(),
            name: "Model",
            allowsImage: false,
            values: [
              { id: randomUUID(), value: "Single" },
              { id: randomUUID(), value: "Bundle" },
            ],
          },
          {
            id: randomUUID(),
            name: "Kapasitas",
            allowsImage: false,
            values: [
              { id: randomUUID(), value: "64GB" },
              { id: randomUUID(), value: "128GB" },
            ],
          },
        ];
        const ids = [
          // Intentionally omit the first×first combination. The storefront
          // must initialize on a real available SKU, not disabled by default.
          [groups[0].values[0].id, groups[1].values[1].id],
          [groups[0].values[1].id, groups[1].values[0].id],
          [groups[0].values[1].id, groups[1].values[1].id],
        ];
        const sparseSlug = "sparse-" + c.prefix;
        const result = await createManagedProduct(actor, {
          name: "Dummy sparse options",
          weightGrams: 500,
          categoryId: category.id,
          slug: sparseSlug,
          basePrice: 1000,
          images: [],
          optionsEnabled: true,
          optionGroups: groups,
          variants: ids.map((optionValueIds) => ({
            sku: "SPARSE-" + randomUUID(),
            optionValueIds,
            onHand: 1,
          })),
        });
        fixtureProductIds.push(result.id);
        const gallery = await db.productImage.create({
          data: {
            productId: result.id,
            url: "/images/dashboard-fashion-rack.webp",
            alt: "Dummy gallery",
          },
        });
        const draft = await getManagedProduct(actor, result.id);
        draft.images = [{ id: gallery.id, url: gallery.url, alt: gallery.alt }];
        await updateManagedProduct(actor, result.id, draft.updatedAt, draft);
        const current = await getManagedProduct(actor, result.id);
        await changeProductStatus(
          actor,
          result.id,
          current.updatedAt,
          "PUBLISHED",
        );
        const countBefore = await db.cartItem.count({
          where: { cart: { userId: customer.id } },
        });
        await store.goto(`${base}/product/${sparseSlug}`);
        // Multi-choice sparse products require explicit selection; impossible
        // combinations are disabled rather than selecting a fallback SKU.
        await expect(store.getByTestId("selected-sku")).toHaveCount(0);
        await expect(store.getByTestId("buy-now-btn")).toBeDisabled();
        await store.getByTestId(`option-${groups[0].values[0].id}`).click();
        await expect(store.getByTestId(`option-${groups[1].values[0].id}`)).toBeDisabled();
        await expect(store.getByTestId("buy-now-btn")).toBeDisabled();
        await expect(store.getByTestId("selected-sku")).toHaveCount(0);
        await expect(store.getByTestId("add-to-cart-btn")).toBeDisabled();
        assert.equal(
          await db.cartItem.count({ where: { cart: { userId: customer.id } } }),
          countBefore,
        );
        await store.screenshot({
          path: path.join(artifactDir, "product-custom-unavailable-390.png"),
        });
        await store.goto(`${base}/product/${slug}`);
      },
    );
    await check(
      "custom variations render all five viewports, keyboard focus and enlarged text without overflow",
      async () => {
        for (const width of [360, 390, 768, 1024, 1360]) {
          await page.setViewportSize({ width, height: 900 });
          await openGroups();
          await root.locator(".variation-groups").scrollIntoViewIfNeeded();
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
            `custom editor overflow ${width}`,
          );
          await capture(`groups-${width}`);
          await openStock();
          await root.locator(".variation-sku").first().scrollIntoViewIfNeeded();
          await capture(`skus-${width}`);
          await closeEditor();
          await store.setViewportSize({ width, height: 900 });
          await store.reload();
          assert.equal(
            await store.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
            `storefront overflow ${width}`,
          );
          await expect(store.getByTestId("buy-now-btn")).toBeVisible();
          await expect(
            store.getByTestId("selected-product-price"),
          ).toBeVisible();
          if (width < 768) {
            await expect(store.locator(".pdp-topbar")).toBeVisible();
            await expect(
              store.locator(".storefront-root > header"),
            ).toBeHidden();
            await expect(store.getByTestId("bottom-nav")).toBeHidden();
            await expect(store.locator(".pdp-purchase-actions")).toHaveCSS(
              "position",
              "fixed",
            );
            const button = await store.getByTestId("buy-now-btn").boundingBox();
            assert.ok(
              button && button.x >= 0 && button.x + button.width <= width + 1,
              "floating buy pill must fit the phone",
            );
          } else {
            await expect(store.locator(".pdp-topbar")).toBeHidden();
            await expect(
              store.locator(".storefront-root > header"),
            ).toBeVisible();
            await expect(store.locator(".pdp-purchase-actions")).toHaveCSS(
              "position",
              "static",
            );
          }
          await store.screenshot({
            path: path.join(artifactDir, `product-custom-store-${width}.png`),
          });
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await openGroups();
        await page.evaluate(
          () => (document.documentElement.style.fontSize = "20px"),
        );
        await capture("large-text-390");
        const largeText = await page.evaluate(() => ({
          width: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          overflowing: Array.from(document.querySelectorAll<HTMLElement>("body *")).filter(node => node.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 15).map(node => ({ tag: node.tagName, className: String(node.className), width: node.getBoundingClientRect().width })),
        }));
        assert.ok(largeText.scrollWidth <= largeText.width, JSON.stringify(largeText));
        await page.evaluate(
          () => (document.documentElement.style.fontSize = ""),
        );
        await root.getByLabel("Nama variasi 1").focus();
        await expect(root.getByLabel("Nama variasi 1")).toBeFocused();
        // Reduced viewport represents keyboard occlusion, not a physical Android/iOS IME.
        await page.setViewportSize({ width: 390, height: 480 });
        const field = root.getByLabel("Nama variasi 1");
        await field.evaluate((el) => el.scrollIntoView({ block: "center" }));
        await field.focus();
        const fieldBox = await field.boundingBox(),
          headerBox = await page.locator(".seller-editor-toolbar").boundingBox(),
          saveBox = await page.locator(".seller-editor-actions").boundingBox();
        assert.ok(
          fieldBox &&
            headerBox &&
            saveBox &&
            fieldBox.y >= headerBox.y + headerBox.height &&
            fieldBox.y + fieldBox.height <= saveBox.y,
          "focused input is clear of header/sticky actions",
        );
        await capture("keyboard-viewport-390");
        await page.setViewportSize({ width: 390, height: 844 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        assert.equal(
          await root
            .getByRole("switch")
            .first()
            .evaluate(
              (el) => getComputedStyle(el, "::before").transitionDuration,
            ),
          "0s",
        );
        await page.emulateMedia({ reducedMotion: "no-preference" });
        assert.deepEqual(errors, []);
      },
    );
    await check("custom group sort persists IDs and disclosure/discard guards remain explicit", async () => {
      await closeEditor();
      const groups = await db.productOptionGroup.findMany({ where: { productId }, orderBy: { sortOrder: "asc" } });
      const skus = await db.productVariant.findMany({ where: { productId }, orderBy: { id: "asc" } });
      await openGroups();
      await page.getByRole("button", { name: "Urutkan", exact: true }).click();
      const handle = root.getByRole("button", { name: "Urutkan variasi 1", exact: true });
      await handle.focus(); await handle.press("Space"); await handle.press("End"); await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Selesai", exact: true }).click();
      await expect(root.locator(".variation-card").first()).toHaveAttribute("data-sort-id", groups[1].id);
      await closeEditor(); await page.getByTestId("save-product").click();
      await expect(page.getByRole("region", { name: "Status perubahan produk" }).getByRole("status")).toHaveText("Produk berhasil disimpan.");
      assert.deepEqual((await db.productOptionGroup.findMany({ where: { productId }, orderBy: { sortOrder: "asc" } })).map(g => g.id), [groups[1].id, groups[0].id]);
      assert.deepEqual(await db.productVariant.findMany({ where: { productId }, orderBy: { id: "asc" } }), skus);
      await openGroups();
      const summary = root.locator(".variation-group-summary").first();
      await summary.click(); await expect(summary).toHaveAttribute("aria-expanded", "false");
      await summary.click(); await expect(summary).toHaveAttribute("aria-expanded", "true");
      const field = root.getByLabel("Nama variasi 1", { exact: true });
      const original = await field.inputValue(); await field.fill("Discard this rename");
      page.once("dialog", dialog => void dialog.accept());
      await page.getByRole("button", { name: "Kembali ke produk", exact: true }).click();
      await openGroups(); await expect(root.getByLabel("Nama variasi 1", { exact: true })).toHaveValue(original);
      await closeEditor();
    });
  } finally {
    // Only this loopback run's fixtures: preserve history, hide media after its mock stops.
    if (fixtureProductIds.length)
      await db.product.updateMany({
        where: { id: { in: fixtureProductIds } },
        data: { status: "ARCHIVED" },
      });
    await buyer.close();
  }
}
