/** Native purchase flow uses only the established disposable browser fixtures. */
import assert from "node:assert/strict";
import { PRESETS } from "../../src/modules/appearance/presets";
import { rgb } from "../../src/modules/appearance/contrast";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { expect, type BrowserContext } from "@playwright/test";
import type { Prisma, PrismaClient } from "@prisma/client";
export async function verifyNativePurchase({
  buyer,
  admin,
  anonymous,
  db,
  base,
  prefix,
  artifactDir,
  check,
}: {
  buyer: BrowserContext;
  admin: BrowserContext;
  anonymous: BrowserContext;
  db: PrismaClient;
  base: string;
  prefix: string;
  artifactDir: string;
  check: (name: string, run: () => Promise<void>) => Promise<void>;
}) {
  const page = await buyer.newPage(),
    guest = await anonymous.newPage(),
    errors: string[] = [],
    ids: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const multi = await db.product.create({
    data: {
      name: `Studio Shirt — dummy V3 ${prefix}-native`,
      slug: `${prefix}-native-options`,
      status: "PUBLISHED",
      optionsEnabled: false,
      basePrice: 180000,
      description: "Synthetic product detail.\n".repeat(60),
    },
  });
  ids.push(multi.id);
  const photo = await db.productImage.create({
    data: {
      productId: multi.id,
      url: "/images/dashboard-fashion-rack.webp",
      alt: "Synthetic cover",
    },
  });
  const groups: Prisma.ProductOptionGroupGetPayload<{
    include: { values: true };
  }>[] = [];
  for (const [index, [name, values]] of (
    [
      ["Warna", ["Merah", "Biru " + "L".repeat(45)]],
      ["Ukuran", ["M", "XL"]],
      ["Potongan", ["Regular", "Slim"]],
    ] as [string, string[]][]
  ).entries())
    groups.push(
      await db.productOptionGroup.create({
        data: {
          id: randomUUID(),
          productId: multi.id,
          name,
          normalizedName: name.toLowerCase(),
          sortOrder: index,
          allowsImage: index === 0,
          values: {
            create: values.map((value, i) => ({
              id: randomUUID(),
              value,
              normalizedValue: value.toLowerCase(),
              sortOrder: i,
              ...(index === 0 ? { imageId: photo.id } : {}),
            })),
          },
        },
        include: { values: { orderBy: { sortOrder: "asc" } } },
      }),
    );
  async function sku(
    label: string,
    indices: number[],
    stock: number,
    price: number,
    salePrice: number | null = null,
  ) {
    const values = groups.map((g, i) => g.values[indices[i]]);
    const v = await db.productVariant.create({
      data: {
        productId: multi.id,
        sku: `V3-${prefix}-${label}`,
        combinationKey: values
          .map((v) => v.id)
          .sort()
          .join("|"),
        price,
        salePrice,
        inventory: { create: { onHand: stock } },
      },
    });
    await db.productVariantOptionValue.createMany({
      data: values.map((value) => ({
        variantId: v.id,
        productId: multi.id,
        groupId: value.groupId,
        valueId: value.id,
      })),
    });
    return v;
  }
  const red = await sku("red", [0, 0, 0], 5, 120000),
    blue = await sku("blue", [1, 1, 1], 2, 180000, 150000);
  await sku("empty", [0, 1, 0], 0, 130000);
  await db.product.update({
    where: { id: multi.id },
    data: { optionsEnabled: true },
  });
  const simple = await db.product.create({
    data: {
      name: `Everyday Tote — dummy V3 ${prefix}-native`,
      slug: `${prefix}-native-simple`,
      status: "PUBLISHED",
      basePrice: 95000,
      images: { create: { url: photo.url, alt: "Dummy tote" } },
      variants: {
        create: {
          sku: `V3-${prefix}-simple`,
          inventory: { create: { onHand: 10 } },
        },
      },
    },
  });
  ids.push(simple.id);
  const draft = await db.product.create({
    data: {
      name: "Private draft",
      status: "DRAFT",
      slug: `${prefix}-native-draft`,
      basePrice: 1,
    },
  });
  ids.push(draft.id);
  const out = await db.product.create({
    data: {
      name: `Sold out ${prefix}-native`,
      slug: `${prefix}-native-out`,
      status: "PUBLISHED",
      basePrice: 95000,
      variants: {
        create: {
          sku: `V3-${prefix}-out`,
          inventory: { create: { onHand: 0 } },
        },
      },
    },
  });
  ids.push(out.id);
  const lines = () =>
    db.cartItem.findMany({ where: { variant: { productId: { in: ids } } } });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await check(
      "V3: bounded published metadata excludes drafts/private inventory",
      async () => {
        const response = await anonymous.request.get(
          `${base}/api/v1/products/${multi.slug}/purchase`,
        );
        assert.equal(response.status(), 200);
        assert.match(response.headers()["cache-control"], /no-store/);
        const text = await response.text(),
          data = JSON.parse(text).data;
        assert.ok(Buffer.byteLength(text) < 32768);
        assert.equal(data.groups.length, 3);
        assert.equal(data.variants.length, 3);
        assert.ok(!text.includes('"inventory"'));
        assert.ok(!text.includes('"reserved"'));
        assert.equal(
          (
            await anonymous.request.get(
              `${base}/api/v1/products/${draft.slug}/purchase`,
            )
          ).status(),
          404,
        );
        assert.equal(
          (
            await anonymous.request.get(
              `${base}/api/v1/products/missing-${prefix}/purchase`,
            )
          ).status(),
          404,
        );
      },
    );
    await check(
      "V3: on-demand retry, cancel and explicit sparse selections",
      async () => {
        let reads = 0;
        page.on("request", (r) => {
          if (r.url().includes("/purchase")) reads++;
        });
        await page.goto(`${base}/shop?q=${prefix}-native`);
        assert.equal(reads, 0);
        const trigger = page
            .getByTestId(`product-card-${multi.slug}`)
            .getByRole("button", { name: "Tambah ke keranjang", exact: true }),
          route = `**/api/v1/products/${multi.slug}/purchase`;
        await page.route(route, (r) => r.abort());
        await trigger.click();
        await expect(page.getByRole("alert")).toBeVisible();
        assert.equal((await lines()).length, 0);
        await page.unroute(route);
        await page
          .getByRole("button", { name: "Coba Lagi", exact: true })
          .click();
        await expect(page.getByTestId("quick-add-variant-sheet")).toBeVisible();
        await expect(
          page.getByRole("button", {
            name: "Masukkan ke Keranjang",
            exact: true,
          }),
        ).toBeDisabled();
        await expect(
          page
            .getByTestId("quick-add-variant-sheet")
            .locator('[aria-pressed="true"]'),
        ).toHaveCount(0);
        await page.screenshot({
          path: path.join(artifactDir, "product-v3-options-unselected-390.png"),
        });
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("purchase-dialog")).toHaveCount(0);
        await expect(trigger).toBeFocused();
        assert.equal((await lines()).length, 0);
        await trigger.click();
        await page.getByTestId(`option-${groups[0].values[1].id}`).click();
        await expect(
          page.getByTestId(`option-${groups[1].values[0].id}`),
        ).toBeDisabled();
        await page.getByTestId(`option-${groups[1].values[1].id}`).click();
        await page.getByTestId(`option-${groups[2].values[1].id}`).click();
        await expect(page.getByTestId("quick-add-sku")).toContainText(blue.sku);
        await expect(page.getByTestId("quick-add-price")).toHaveText(
          "Rp 150.000",
        );
        await page.getByTestId("qty-plus").click();
        await expect(page.getByTestId("qty-plus")).toBeDisabled();
        await page.setViewportSize({ width: 320, height: 900 });
        assert.ok(
          await page
            .getByRole("dialog")
            .evaluate((e) => e.scrollWidth <= e.clientWidth),
          "Long option values do not overflow320px sheets",
        );
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
          path: path.join(artifactDir, "product-v3-options-selected-390.png"),
        });
      },
    );
    await check(
      "V3: exact SKU, double-tap guard and persistent confirmed success",
      async () => {
        await page
          .getByRole("button", { name: "Masukkan ke Keranjang", exact: true })
          .evaluate((e) => {
            (e as HTMLButtonElement).click();
            (e as HTMLButtonElement).click();
          });
        const success = page.getByTestId("cart-success-sheet");
        await expect(success).toBeVisible();
        await expect(page.getByRole("dialog")).toHaveCount(1);
        await expect(page.getByTestId("quick-add-variant-sheet")).toHaveCount(
          0,
        );
        for (const text of [
          "Biru",
          "XL",
          "Slim",
          "2 × Rp 150.000",
          "Rp 300.000",
        ])
          await expect(success).toContainText(text);
        const current = await lines();
        assert.equal(current.length, 1);
        assert.equal(current[0].variantId, blue.id);
        assert.equal(current[0].quantity, 2);
        await expect(page.getByTestId("header-cart-count")).toHaveText("2");
        await expect(page.getByTestId("bottom-cart-count")).toHaveText("2");
        await page.screenshot({
          path: path.join(artifactDir, "product-v3-success-390.png"),
        });
        await page.setViewportSize({ width: 844, height: 390 });
        const action = await page
          .getByRole("button", { name: "Lihat Keranjang", exact: true })
          .boundingBox();
        assert.ok(
          action && action.y >= 0 && action.y + action.height <= 390,
          "Success actions remain reachable in landscape with long labels",
        );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(2100);
        await expect(success).toBeVisible();
        await page
          .getByRole("button", { name: "Lanjut Belanja", exact: true })
          .click();
        await expect(page).toHaveURL(new RegExp(`/shop\\?q=${prefix}-native`));
        await page
          .getByTestId(`product-card-${simple.slug}`)
          .getByRole("button", { name: "Tambah ke keranjang", exact: true })
          .click();
        await expect(success).toBeVisible();
        await expect(success).toContainText(simple.name);
        assert.equal(
          (await lines()).reduce((n, l) => n + l.quantity, 0),
          3,
        );
        await page
          .getByRole("button", { name: "Lihat Keranjang", exact: true })
          .click();
        await expect(page).toHaveURL(`${base}/cart`);
        await expect(page.getByTestId("cart-total")).toHaveText("Rp 395.000");
        await page.screenshot({
          path: path.join(artifactDir, "product-v3-cart-top-390.png"),
        });
        await page
          .getByTestId("cart-summary")
          .evaluate((e) =>
            scrollTo(0, e.getBoundingClientRect().top + scrollY - 150),
          );
        const total = await page.getByTestId("cart-total").boundingBox(),
          cta = await page.getByTestId("checkout-btn").boundingBox(),
          nav = await page.getByTestId("bottom-nav").boundingBox();
        assert.ok(
          total &&
            cta &&
            nav &&
            total.y + total.height <= cta.y &&
            cta.y + cta.height < nav.y,
          "Total, checkout CTA and nav have separate reserved regions",
        );
        await page.screenshot({
          path: path.join(artifactDir, "product-v3-cart-390.png"),
        });
      },
    );
    await check(
      "V3: stock race preserves choices and rejects phantom success",
      async () => {
        await page.goto(`${base}/shop?q=${prefix}-native`);
        await page
          .getByTestId(`product-card-${multi.slug}`)
          .getByRole("button", { name: "Tambah ke keranjang", exact: true })
          .click();
        for (const g of groups)
          await page.getByTestId(`option-${g.values[0].id}`).click();
        await db.inventory.update({
          where: { variantId: red.id },
          data: { onHand: 0 },
        });
        await page
          .getByRole("button", { name: "Masukkan ke Keranjang", exact: true })
          .click();
        await expect(page.getByRole("alert")).toContainText(
          "Stok tidak mencukupi",
        );
        await expect(page.getByTestId("cart-success-sheet")).toHaveCount(0);
        await expect(
          page.getByTestId(`option-${groups[0].values[0].id}`),
        ).toHaveAttribute("aria-pressed", "true");
        assert.equal((await lines()).length, 2);
        await page.getByRole("button", { name: "Tutup", exact: true }).click();
        await page
          .getByTestId(`product-card-${out.slug}`)
          .getByRole("button", { name: "Tambah ke keranjang", exact: true })
          .click();
        await expect(
          page.getByRole("button", {
            name: "Masukkan ke Keranjang",
            exact: true,
          }),
        ).toBeDisabled();
        await page.keyboard.press("Escape");
      },
    );
    await check(
      "V3: native PDP gallery window, fixed topbar and full scroll reachability",
      async () => {
        for (let i = 1; i < 12; i++)
          await db.productImage.create({
            data: {
              productId: multi.id,
              url: `${photo.url}?gallery=${i}`,
              alt: `Dummy gallery ${i}`,
              sortOrder: i,
            },
          });
        await page.goto(`${base}/product/${multi.slug}`);
        await expect(page.getByTestId("selected-sku")).toHaveCount(0);
        await expect(page.getByTestId("buy-now-btn")).toHaveCount(1);
        await expect(page.getByTestId("buy-now-btn")).toBeDisabled();
        await expect(page.locator(".pdp-gallery-dots button")).toHaveCount(5);
        await expect(page.locator(".pdp-gallery-counter")).toHaveText("1/12");
        await expect(page.getByTestId("product-gallery")).toHaveAttribute(
          "aria-busy",
          "false",
        );
        await page.locator(".pdp-gallery-dots button").first().press("End");
        await expect(page.locator(".pdp-gallery-counter")).toHaveText("12/12");
        await expect(
          page.locator('.pdp-gallery-dots button[aria-current="true"]'),
        ).toBeFocused();
        await page.keyboard.press("Home");
        await expect(page.locator(".pdp-gallery-counter")).toHaveText("1/12");
        await expect(
          page.locator('.pdp-gallery-dots button[aria-current="true"]'),
        ).toBeFocused();
        await expect
          .poll(() =>
            page
              .getByTestId("product-gallery")
              .locator("img")
              .first()
              .evaluate((e) => (e as HTMLImageElement).naturalWidth),
          )
          .toBeGreaterThan(0);
        await page
          .getByTestId("product-gallery")
          .locator("img")
          .first()
          .evaluate((e) => (e as HTMLImageElement).decode());
        await page.screenshot({
          path: path.join(artifactDir, "product-v3-pdp-start-390.png"),
        });
        for (const width of [320, 360, 375, 390, 414, 430, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `Overflow ${width}`,
          );
          await page.evaluate(() => scrollTo(0, 380));
          if (width < 768) {
            assert.equal(
              await page
                .locator(".pdp-topbar")
                .evaluate((e) => getComputedStyle(e).position),
              "fixed",
            );
            const box = await page.locator(".pdp-topbar").boundingBox();
            assert.ok(box && box.y >= 0 && box.y < 2);
            assert.equal(
              await page
                .locator(".pdp-hero")
                .evaluate((e) => getComputedStyle(e).position),
              "sticky",
            );
            await expect(page.getByTestId("bottom-nav")).toBeHidden();
          } else
            assert.equal(
              await page
                .locator(".pdp-main")
                .evaluate((e) => getComputedStyle(e).display),
              "grid",
            );
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => scrollTo(0, 500));
        const sheet = await page.locator(".pdp-sheet").boundingBox();
        assert.ok(
          sheet && sheet.y <= 844 * 0.15 && sheet.y + sheet.height >= 844,
          "Detail panel covers at least85% of the effective viewport while remaining document-scrollable",
        );
        await page.screenshot({
          path: path.join(artifactDir, "product-v3-pdp-expanded-390.png"),
        });
        await page.locator("#reviews").scrollIntoViewIfNeeded();
        await page
          .getByRole("heading", { name: "Tanya Jawab Produk", exact: true })
          .scrollIntoViewIfNeeded();
        await expect(
          page.getByRole("heading", {
            name: "Tanya Jawab Produk",
            exact: true,
          }),
        ).toBeVisible();
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({
          path: path.join(artifactDir, "product-v3-pdp-1440.png"),
        });
        // Browser zoom changes the CSS viewport/breakpoints, unlike CSS zoom.
        //1440x900 physical pixels at200% correspond to720x450 CSS pixels, DPR2.
        const zoom = await buyer.browser()!.newContext({
          viewport: { width: 720, height: 450 },
          deviceScaleFactor: 2,
          reducedMotion: "reduce",
        });
        try {
          await zoom.addCookies(await buyer.cookies());
          const zoomPage = await zoom.newPage();
          await zoomPage.goto(`${base}/product/${multi.slug}`);
          await expect(zoomPage.getByTestId("product-gallery")).toHaveAttribute(
            "aria-busy",
            "false",
          );
          assert.equal(await zoomPage.evaluate(() => devicePixelRatio), 2);
          assert.ok(
            await zoomPage.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            "200%-equivalent reflow has no horizontal overflow",
          );
          await zoomPage
            .getByRole("heading", { name: "Tanya Jawab Produk", exact: true })
            .evaluate((e) =>
              scrollTo(0, e.getBoundingClientRect().top + scrollY - 100),
            );
          await expect(
            zoomPage.getByRole("heading", {
              name: "Tanya Jawab Produk",
              exact: true,
            }),
          ).toBeVisible();
        } finally {
          await zoom.close();
        }
      },
    );
    await check(
      "V3: published dark, colored and gradient purchase controls retain theme and chrome",
      async () => {
        const read = async () => {
          const response = await admin.request.get(
            `${base}/api/v1/admin/store-appearance`,
          );
          assert.equal(response.status(), 200);
          return (await response.json()).data;
        };
        const original = await read();
        const command = async (data: Record<string, unknown>) => {
          const state = await read();
          const response = await admin.request.post(
            `${base}/api/v1/admin/store-appearance`,
            {
              headers: { Origin: base },
              data: {
                ...data,
                draftVersion: state.draftVersion,
                publishedVersion: state.publishedVersion,
              },
            },
          );
          assert.equal(response.status(), 200, await response.text());
        };
        const before = await lines();
        try {
          for (const [index, shape, shadow] of [
            [1, "square", "none"],
            [2, "soft", "raised"],
            [0, "pill", "soft"],
          ] as const) {
            const config = structuredClone(PRESETS[index].config);
            config.styling.button = shape;
            config.styling.shadow = shadow;
            if (index === 0) config.gradients.buttons.enabled = true;
            await command({ kind: "save", config });
            await command({ kind: "publish" });
            await page.setViewportSize({
              width: index === 2 ? 1440 : 390,
              height: 900,
            });
            await page.goto(`${base}/shop?q=${prefix}-native`);
            await page
              .getByTestId(`product-card-${multi.slug}`)
              .getByRole("button", { name: "Tambah ke keranjang", exact: true })
              .click();
            const dialog = page.getByRole("dialog");
            await expect(
              page.getByTestId("quick-add-variant-sheet"),
            ).toBeVisible();
            assert.equal(
              await dialog.evaluate((e) => getComputedStyle(e).backgroundColor),
              `rgb(${rgb(config.colors.modal).join(", ")})`,
            );
            const radius = { square: "0px", soft: "10px", pill: "9999px" }[
              shape
            ];
            assert.equal(
              await dialog
                .locator(".quantity-stepper")
                .evaluate((e) => getComputedStyle(e).borderRadius),
              radius,
            );
            assert.equal(
              await dialog
                .locator(".purchase-swatch")
                .first()
                .evaluate((e) => getComputedStyle(e).borderRadius),
              radius,
            );
            if (shadow === "none")
              assert.equal(
                await dialog.evaluate((e) => getComputedStyle(e).boxShadow),
                "none",
              );
            await page
              .getByRole("button", { name: "Tutup", exact: true })
              .focus();
            await page.keyboard.press("Tab");
            assert.equal(
              await dialog
                .locator(":focus-visible")
                .evaluate((e) => getComputedStyle(e).outlineColor),
              `rgb(${rgb(config.colors.focus).join(", ")})`,
            );
            await page.screenshot({
              path: path.join(
                artifactDir,
                `product-v3-published-${index}-options.png`,
              ),
            });
            await page.keyboard.press("Escape");
            assert.equal(
              await page
                .locator(".storefront-root > header")
                .evaluate((e) => getComputedStyle(e).borderBottomWidth),
              "0px",
            );
            assert.equal(
              await page
                .locator(".storefront-root > footer")
                .evaluate((e) => getComputedStyle(e).borderTopWidth),
              "0px",
            );
            await page.goto(`${base}/cart`);
            await expect(page.getByTestId("cart-total")).toHaveText(
              "Rp 395.000",
            );
            if (index === 0) {
              await page.mouse.move(0, 0);
              await expect.poll(() => page.getByTestId("checkout-btn").evaluate(e => getComputedStyle(e).backgroundImage)).toContain("linear-gradient");
              await page.getByTestId("checkout-btn").hover();
              await expect.poll(() => page.getByTestId("checkout-btn").evaluate(e => getComputedStyle(e).backgroundImage)).toBe("none");
              await page.mouse.move(0, 0);
            }
            await page.screenshot({
              path: path.join(
                artifactDir,
                `product-v3-published-${index}-cart.png`,
              ),
            });
          }
          assert.deepEqual(
            await lines(),
            before,
            "Theme/preview checks cannot mutate cart",
          );
        } finally {
          await command({
            kind: "rollback",
            revision: original.publishedVersion,
          });
          await command({ kind: "save", config: original.config });
        }
      },
    );
    await check(
      "V3: touch dismissal, guest continuation and no unhandled runtime errors",
      async () => {
        const touch = await buyer
          .browser()!
          .newContext({
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true,
            reducedMotion: "reduce",
          });
        try {
          await touch.addCookies(await buyer.cookies());
          const mobile = await touch.newPage();
          const before = await lines();
          await mobile.goto(`${base}/shop?q=${prefix}-native`);
          await mobile
            .getByTestId(`product-card-${multi.slug}`)
            .getByRole("button", { name: "Tambah ke keranjang", exact: true })
            .tap();
          await expect(
            mobile.getByTestId("quick-add-variant-sheet"),
          ).toBeVisible();
          await mobile.getByTestId(`option-${groups[0].values[1].id}`).tap();
          await expect(
            mobile.getByTestId(`option-${groups[0].values[1].id}`),
          ).toHaveAttribute("aria-pressed", "true");
          await mobile
            .locator(".purchase-backdrop")
            .tap({ position: { x: 5, y: 5 } });
          await expect(mobile.getByTestId("purchase-dialog")).toHaveCount(0);
          assert.deepEqual(
            await lines(),
            before,
            "Touch open/selection/backdrop dismissal does not mutate cart",
          );
        } finally {
          await touch.close();
        }
        await guest.goto(`${base}/shop?q=${prefix}-native`);
        await guest
          .getByTestId(`product-card-${simple.slug}`)
          .getByRole("button", { name: "Tambah ke keranjang", exact: true })
          .click();
        await expect(guest).toHaveURL(/\/login\?redirectTo=\/cart/);
        assert.deepEqual(errors, []);
      },
    );
  } catch (error) {
    await writeFile(
      path.join(artifactDir, "product-v3-dom.json"),
      JSON.stringify(
        await page
          .locator('[data-testid="buy-now-btn"]')
          .evaluateAll((elements) =>
            elements.map((e) => ({
              parent: e.parentElement?.outerHTML,
              grandparent: e.parentElement?.parentElement?.outerHTML.slice(
                0,
                1600,
              ),
            })),
          ),
        null,
        2,
      ),
    ).catch(() => {});
    await page
      .screenshot({
        path: path.join(artifactDir, "product-v3-failure.png"),
        fullPage: true,
      })
      .catch(() => {});
    throw error;
  } finally {
    await page.close();
    await guest.close();
    await db.cartItem.deleteMany({
      where: { variant: { productId: { in: ids } } },
    });
    await db.product.updateMany({
      where: { id: { in: ids } },
      data: { status: "ARCHIVED" },
    });
  }
}
