import { testAddress, apiShipping, chooseTestLocation } from "../fixtures/jnt-checkout";
import { assertFeaturedConsistency } from "./checkout-v5-browser";
import assert from "node:assert/strict";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { expect, type Browser, type BrowserContext } from "@playwright/test";
import type { Prisma, PrismaClient } from "@prisma/client";
import { signSession } from "../../src/lib/auth/jwt";
import { defaultSizeChart } from "../../src/modules/catalog/product-size-chart";
import { rgb } from "../../src/modules/appearance/contrast";
import { PRESETS } from "../../src/modules/appearance/presets";
import { formatIDR } from "../../src/lib/money";
export async function verifyStorefrontV4({
  browser,
  admin,
  anonymous,
  db,
  base,
  prefix,
  artifactDir,
  check,
}: {
  browser: Browser;
  admin: BrowserContext;
  anonymous: BrowserContext;
  db: PrismaClient;
  base: string;
  prefix: string;
  artifactDir: string;
  check: (name: string, run: () => Promise<void>) => Promise<void>;
}) {
  const products: Prisma.ProductGetPayload<{ include: { variants: true } }>[] =
    [];
  for (const [index, price] of [99000, 299000, 499000, 1499000].entries())
    products.push(
      await db.product.create({
        data: {
          name: `V4 fixture ${prefix} ${index}`,
          slug: `v4-${prefix}-${index}`,
          basePrice: price,
          salePrice: index === 2 ? 299000 : index === 3 ? 1299000 : null,
          isFeatured: true,
          status: "PUBLISHED", weightGrams: 250,
          ratingAvg: 4.9,
          reviewCount: 999,
          description: "Informasi panjang produk.\n".repeat(100),
          material: "Katun",
          careInstruction: "Cuci lembut",
          shippingReturn: "Pengiriman dan retur fixture",
          sizeChart: defaultSizeChart(),
          images: {
            create: {
              url: "/images/dashboard-fashion-rack.webp",
              alt: "V4 fixture cover",
            },
          },
          variants: {
            create: {
              sku: `V4-${prefix}-${index}`,
              inventory: { create: { onHand: 100 } },
            },
          },
        },
        include: { variants: true },
      }),
    );
  const user = await db.user.create({
    data: {
      name: "V4 Buyer Private Surname",
      email: `v4-${prefix}@example.test`,
      passwordHash: "isolated",
      customer: { create: { fullName: "V4 buyer" } },
    },
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await context.addCookies([
    {
      name: "gh_session",
      value: await signSession({ sub: user.id, email: user.email }),
      domain: "localhost",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage(),
    visitor = await anonymous.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const bank = await db.bankAccount.create({
    data: {
      bankName: "V4 bank",
      accountNumber: `V4-${prefix}`,
      accountHolder: "Fixture",
      displayName: `V4 ${prefix}`,
    },
  });
  const coupon = await db.coupon.create({
    data: {
      code: `V4-${prefix}`.toUpperCase(),
      discountType: "FIXED",
      discountValue: 10000,
    },
  });
  const order = async (
    status: "DELIVERED" | "SHIPPED" = "DELIVERED",
    owner = user.id,
  ) =>
    db.order.create({
      data: {
        orderNumber: `V4-${randomUUID()}`,
        userId: owner,
        status,
        paymentStatus: "PAID",
        subtotal: 99000,
        total: 99000,
        payment: { create: { status: "PAID", amount: 99000 } },
        items: {
          create: {
            variantId: products[0].variants[0].id,
            productName: products[0].name,
            variantLabel: "Default",
            imageUrl: "/images/dashboard-fashion-rack.webp",
            unitPrice: 99000,
            quantity: 1,
            lineTotal: 99000,
          },
        },
      },
      include: { items: true },
    });
  const screenshot = (name: string) =>
    page.screenshot({ path: path.join(artifactDir, name) });
  const v5Geometry: unknown[] = [];
  const readTheme = async () => {
    const response = await admin.request.get(
      `${base}/api/v1/admin/store-appearance`,
    );
    assert.equal(response.status(), 200);
    return (await response.json()).data;
  };
  const originalTheme = await readTheme();
  let directUrl = "";
  const themeCommand = async (data: Record<string, unknown>) => {
    const state = await readTheme();
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
  const publishTheme = async (config: (typeof PRESETS)[number]["config"]) => {
    await themeCommand({ kind: "save", config });
    await themeCommand({ kind: "publish" });
  };
  try {
    await check(
      "V4: responsive intact prices and featured cards without purchasing shortcuts",
      async () => {
        for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(base);
          v5Geometry.push({ theme: "default", width, cards: await assertFeaturedConsistency(page) });
          if ([320, 390, 1440].includes(width)) await screenshot(`v5-featured-default-${width}.png`);
        }
        await publishTheme(PRESETS[0].config);
        for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(base);
          v5Geometry.push({ theme: "published", width, cards: await assertFeaturedConsistency(page) });
          if ([320, 390, 1440].includes(width)) await screenshot(`v5-featured-published-${width}.png`);
          const section = page.locator("section").filter({
            has: page.getByRole("heading", {
              name: "Produk Pilihan",
              exact: true,
            }),
          });
          await expect(
            section.locator("[data-featured]").first(),
          ).toBeVisible();
          for (const product of products) {
            const card = section.getByTestId(`product-card-${product.slug}`);
            await expect(card).toHaveCount(1);
            await card.scrollIntoViewIfNeeded();
            const price = card.locator('[data-theme-role="price"]');
            await expect(price).toHaveText(
              formatIDR(product.salePrice ?? product.basePrice),
            );
            const bounds = await price.evaluate((e) => {
              const s = getComputedStyle(e),
                r = e.getBoundingClientRect(),
                c = e.closest("article")!.getBoundingClientRect();
              const card = e.closest("article")!, row = e.parentElement!;
              const original = card.querySelector('.product-card-original')?.getBoundingClientRect();
              const scale = parseFloat(row.style.getPropertyValue('--product-price-scale'));
              row.style.setProperty('--product-price-scale', String(scale + .1 / 16));
              const larger = [...row.children].reduce((n,child)=>n+child.getBoundingClientRect().width,0) + (row.children.length-1)*2;
              row.style.setProperty('--product-price-scale', String(scale));
              return {
                nowrap: s.whiteSpace,
                font: parseFloat(s.fontSize),
                left: r.left - c.left,
                right: r.right - c.left,
                card: c.width,
                scroll: e.scrollWidth,
                width: e.clientWidth,
                largest: scale >= .9999 || larger > row.getBoundingClientRect().width,
                sameRow: !original || Math.abs(original.y + original.height / 2 - r.y - r.height / 2) <= 1.5,
                beside: !original || original.left >= r.right + 1,
              };
            });
            assert.equal(bounds.nowrap, "nowrap");
            // The approved inline layout supersedes the old 12px floor when
            // two nominal strings exceed the fixed featured-card width.
            assert.ok(bounds.font > 0 && bounds.largest, JSON.stringify(bounds));
            assert.ok(bounds.sameRow && bounds.beside && bounds.scroll <= bounds.width + 1, JSON.stringify(bounds));
            assert.ok(
              bounds.left >= 0 && bounds.right <= bounds.card + 1,
              "Entire price remains inside its card",
            );
            assert.equal(
              await card
                .getByRole("button", {
                  name: "Tambah ke keranjang",
                  exact: true,
                })
                .count(),
              0,
            );
          }
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          );
          if ([320, 390, 1440].includes(width)) {
            await section.scrollIntoViewIfNeeded();
            await screenshot(`v4-prices-${width}.png`);
          }
        }
      },
    );
    await check(
      "V4: bounded PDP stops38px below header and scrolls its last content with keyboard",
      async () => {
        for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 844 });
          await page.goto(`${base}/product/${products[0].slug}`);
          await expect(page.getByTestId("product-gallery")).toHaveAttribute(
            "aria-busy",
            "false",
          );
          const sheet = page.getByTestId("product-information-sheet");
          const summaries = page.locator(
            ".pdp-info > div.mt-6 > details > summary",
          );
          await expect(summaries).toHaveText([
            "Deskripsi",
            "Panduan Ukuran",
            "Material & Perawatan",
            "Pengiriman & Retur",
          ]);
          assert.equal(await page.getByTestId("review-form").count(), 0);
          if (width < 768) {
            await expect(sheet).toHaveAttribute("data-expanded", "false");
            if (width === 390) await screenshot("v4-pdp-initial-390.png");
            await sheet.hover({ position: { x: 100, y: 40 } });
            await page.mouse.wheel(0, 1200);
            await expect(sheet).toHaveAttribute("data-expanded", "true");
            const geometry = async () =>
              page.evaluate(() => {
                const sheet =
                    document.querySelector<HTMLElement>(".pdp-sheet")!,
                  header = document.querySelector<HTMLElement>(".pdp-topbar")!,
                  bar = document.querySelector<HTMLElement>(
                    ".pdp-purchase-actions",
                  )!;
                const s = sheet.getBoundingClientRect(),
                  h = header.getBoundingClientRect(),
                  b = bar.getBoundingClientRect();
                return {
                  gap: s.top - h.bottom,
                  bottom: s.bottom,
                  bar: b.top,
                  top: s.top,
                  scroll: sheet.scrollTop,
                };
              });
            let g = await geometry();
            assert.ok(g.gap >= 36 && g.gap <= 40);
            assert.ok(Math.abs(g.bottom - g.bar) <= 2);
            await sheet.hover({ position: { x: 100, y: 80 } });
            await page.mouse.wheel(0, 1200);
            await expect
              .poll(() => sheet.evaluate((e) => e.scrollTop))
              .toBeGreaterThan(0);
            g = await geometry();
            assert.ok(
              g.gap >= 36 && g.gap <= 40,
              "Inner scrolling does not move the shell past its stop",
            );
            await sheet.focus();
            await page.keyboard.press("End");
            await page
              .getByRole("heading", { name: "Kamu Mungkin Suka", exact: true })
              .scrollIntoViewIfNeeded();
            await expect(
              page.getByRole("heading", {
                name: "Kamu Mungkin Suka",
                exact: true,
              }),
            ).toBeVisible();
            if (width === 390) await screenshot("v4-pdp-expanded-390.png");
            await sheet.evaluate((e) => {
              e.scrollTop = 0;
            });
            await page.evaluate(() => scrollTo(0, 0));
            await expect(sheet).toHaveAttribute("data-expanded", "false");
          } else
            assert.equal(
              await sheet.evaluate((e) => getComputedStyle(e).display),
              "contents",
            );
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          );
        }
      },
    );
    await check(
      "V4: verified review requires eligible owned item and cannot forge or duplicate publication",
      async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        const received = await order(),
          pending = await order("SHIPPED");
        const foreignUser = await db.user.create({
          data: {
            name: "V4 other",
            email: `v4-other-${prefix}@example.test`,
            passwordHash: "fixture",
          },
        });
        const foreign = await order("DELIVERED", foreignUser.id);
        const legacy = await db.review.create({
          data: {
            productId: products[0].id,
            userId: user.id,
            rating: 5,
            body: "Unverified legacy review",
          },
        });
        await page.goto(`${base}/product/${products[0].slug}`);
        await expect(page.getByTestId(`review-${legacy.id}`)).toHaveCount(0);
        await expect(
          page.getByRole("heading", { name: "Ulasan (0)", exact: true }),
        ).toHaveCount(1);
        await page.goto(`${base}/orders/${pending.id}`);
        await expect(
          page.getByTestId(`review-item-${pending.items[0].id}`),
        ).toHaveCount(0);
        const denied = await admin.request.get(
          `${base}/orders/${received.id}/review/${received.items[0].id}`,
        );
        // Next streamed notFound may retain HTTP200 after layout headers flush.
        assert.ok([200, 404].includes(denied.status()));
        const deniedHtml = await denied.text();
        assert.match(deniedHtml, /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
        assert.ok(!deniedHtml.includes('data-testid="review-form"'));
        assert.ok(!deniedHtml.includes(products[0].name));
        await visitor.goto(
          `${base}/orders/${received.id}/review/${received.items[0].id}`,
        );
        await expect(visitor).toHaveURL(/\/login\?redirectTo=/);
        await page.goto(`${base}/orders/${received.id}`);
        await page.getByTestId(`review-item-${received.items[0].id}`).click();
        await expect(page.getByTestId("review-form")).toBeVisible();
        await page
          .locator('textarea[name="body"]')
          .fill("Percobaan akses item akun lain");
        await page
          .locator('input[name="orderItemId"]')
          .evaluate(
            (e, id) => ((e as HTMLInputElement).value = id),
            foreign.items[0].id,
          );
        await page.getByTestId("review-submit").click();
        await expect(
          page.getByTestId("review-form").getByRole("alert"),
        ).toContainText("Item pesanan tidak ditemukan");
        assert.equal(
          await db.review.count({
            where: { orderItemId: foreign.items[0].id },
          }),
          0,
        );
        await page.reload();
        await page
          .locator('input[name="title"]')
          .fill("Nyaman setelah diterima");
        await page
          .locator('textarea[name="body"]')
          .fill(
            'Bagus <img src=x onerror="window.v4Injected=1"> tetap nyaman.',
          );
        await screenshot("v4-order-review-form-390.png");
        await page.getByTestId("review-submit").evaluate((e) => {
          (e as HTMLButtonElement).click();
          (e as HTMLButtonElement).click();
        });
        await expect(
          page
            .getByTestId("review-success")
            .or(page.getByText("Sudah Diulas", { exact: true })),
        ).toBeVisible();
        assert.equal(
          await db.review.count({
            where: { orderItemId: received.items[0].id },
          }),
          1,
        );
        await page.goto(`${base}/orders/${received.id}`);
        await expect(
          page.getByText("Sudah Diulas", { exact: true }),
        ).toBeVisible();
        await page.goto(`${base}/product/${products[0].slug}`);
        const written = await db.review.findUniqueOrThrow({
          where: { orderItemId: received.items[0].id },
        });
        const card = page.getByTestId(`review-${written.id}`);
        await page.evaluate(() =>
          scrollTo(0, document.documentElement.scrollHeight),
        );
        await expect(
          page.getByTestId("product-information-sheet"),
        ).toHaveAttribute("data-expanded", "true");
        await card.scrollIntoViewIfNeeded();
        await expect(card.locator('[data-badge-variant="muted"]')).toHaveText(
          "Pembelian Terverifikasi",
        );
        const reviewBounds = await card.boundingBox(),
          purchaseBounds = await page
            .locator(".pdp-purchase-actions")
            .boundingBox();
        assert.ok(
          reviewBounds &&
            purchaseBounds &&
            reviewBounds.y + reviewBounds.height <= purchaseBounds.y + 1,
          "Verified review stays fully above the purchase navbar",
        );
        await expect(card).toContainText("Pembelian Terverifikasi");
        await expect(card).toContainText("<img src=x");
        assert.equal(await card.locator("img").count(), 0);
        assert.equal(await page.evaluate(() => "v4Injected" in window), false);
        await expect(card).not.toContainText("Private Surname");
        await expect(
          page.getByRole("heading", { name: "Ulasan (1)", exact: true }),
        ).toHaveCount(1);
        await screenshot("v4-verified-review-390.png");
        await page.goto(base);
        const ratingCard = page.getByTestId(`product-card-${products[0].slug}`);
        await expect(
          ratingCard.locator('[data-theme-role="rating"]'),
        ).toContainText("5.0");
        await expect(
          ratingCard.locator('[data-theme-role="rating"]'),
        ).toContainText("(1)");
        const moderator = await db.user.findUniqueOrThrow({
          where: { email: `staff-${prefix}@browser.example.test` },
        });
        const { setReviewStatus } = await import(
          "../../src/modules/reviews/reviews.service"
        );
        await setReviewStatus(moderator.id, written.id, "PENDING");
        await page.goto(`${base}/product/${products[0].slug}`);
        await expect(page.getByTestId(`review-${written.id}`)).toHaveCount(0);
        await expect(
          page.getByRole("heading", { name: "Ulasan (0)", exact: true }),
        ).toHaveCount(1);
        await page.goto(base);
        await expect(
          page
            .getByTestId(`product-card-${products[0].slug}`)
            .locator('[data-theme-role="rating"]'),
        ).toContainText("(0)");
        await setReviewStatus(moderator.id, written.id, "PUBLISHED");
        await db.review.deleteMany({ where: { userId: foreignUser.id } });
        await db.order.deleteMany({ where: { userId: foreignUser.id } });
        await db.user.delete({ where: { id: foreignUser.id } });
      },
    );
    await check(
      "V4: checkout has one fixed mobile submit and synchronizes ready/loading/error/stale totals",
      async () => {
        await db.cart.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            items: {
              create: { variantId: products[0].variants[0].id, quantity: 1 },
            },
          },
          update: {
            items: {
              deleteMany: {},
              create: { variantId: products[0].variants[0].id, quantity: 1 },
            },
          },
        });
        for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 844 });
          await page.goto(`${base}/checkout`);
          await chooseTestLocation(page);
          await expect(page.getByTestId("place-order-btn")).toBeEnabled();
          await expect(page.getByTestId("place-order-btn")).toHaveCount(1);
          if (width < 768) {
            const bar = page.getByTestId("checkout-purchase-bar"),
              bounds = await bar.boundingBox();
            assert.ok(
              bounds &&
                Math.abs(bounds.width - width) < 2 &&
                Math.abs(bounds.y + bounds.height - 844) < 2,
            );
            assert.equal(
              await page.getByTestId("checkout-sticky-total").textContent(),
              await page.getByTestId("checkout-total").textContent(),
            );
            await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
            const again = await bar.boundingBox();
            assert.ok(again && Math.abs(again.y + again.height - 844) < 2);
            await page.locator("#checkout-coupon").scrollIntoViewIfNeeded();
            const input = await page.locator("#checkout-coupon").boundingBox();
            assert.ok(input && input.y + input.height <= again.y + 1);
          }
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          );
          if ([320, 390, 1440].includes(width))
            await screenshot(`v4-checkout-${width}.png`);
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(`${base}/checkout`);
          await chooseTestLocation(page);
        await expect(page.getByTestId("place-order-btn")).toBeEnabled();
        await page.getByTestId("ship-option-1").click();
        await expect(page.getByTestId("checkout-total")).toHaveText(
          "Rp 121.000",
        );
        await expect(page.getByTestId("checkout-sticky-total")).toHaveText(
          "Rp 121.000",
        );
        await page.getByTestId("input-coupon").fill(coupon.code);
        await expect(page.getByTestId("place-order-btn")).toBeDisabled();
        await expect(page.getByTestId("checkout-total")).toHaveText(
          "Rp 111.000",
        );
        await expect(page.getByTestId("checkout-sticky-total")).toHaveText(
          "Rp 111.000",
        );
        await page.route("**/api/v1/checkout/preview", (route) =>
          route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({
              success: false,
              error: "Quote fixture failure",
            }),
          }),
        );
        await page.getByTestId("input-coupon").fill("ERROR");
        await expect(page.getByTestId("checkout-quote-error")).toBeVisible();
        await expect(page.getByTestId("place-order-btn")).toBeDisabled();
        await expect(page.getByTestId("checkout-sticky-total")).toHaveText("—");
        await page.unroute("**/api/v1/checkout/preview");
        await page
          .getByRole("button", { name: "Coba lagi", exact: true })
          .click();
        await page.getByTestId("ship-option-1").click();
        await expect(page.getByTestId("place-order-btn")).toBeEnabled();
        await db.product.update({
          where: { id: products[0].id },
          data: { basePrice: 100000 },
        });
        await page.getByTestId("input-coupon").fill("");
        // A held shipping token is bound to the catalog snapshot. The server now
        // rejects the stale quote before returning any buyer-visible new total.
        await expect(page.getByTestId("checkout-quote-error")).toContainText(/berubah|kedaluwarsa/);
        await expect(page.getByTestId("place-order-btn")).toBeDisabled();
        await db.product.update({
          where: { id: products[0].id },
          data: { basePrice: 99000 },
        });
      },
    );
    await check(
      "V4: regular and direct checkout preserve validation, failure and one successful order",
      async () => {
        const fill = async () => {
          for (const [name, value] of Object.entries({
            recipientName: "V4 Buyer",
            phone: "0800000000",
            line: "Alamat fixture lokal",
          }))
            await page.locator(`[name="${name}"]`).fill(value);
          await page.getByTestId(`bank-option-${bank.id}`).click();
        };
        await page.goto(`${base}/checkout`);
          await chooseTestLocation(page, false);
        await expect(page.getByTestId("place-order-btn")).toBeDisabled();
        const before = await db.order.count({ where: { userId: user.id } });
        assert.equal(
          await page
            .locator('input[name="recipientName"]')
            .evaluate((e) => (e as HTMLInputElement).validity.valid),
          false,
        );
        assert.equal(
          await db.order.count({ where: { userId: user.id } }),
          before,
        );
        await fill();
        await db.inventory.update({
          where: { variantId: products[0].variants[0].id },
          data: { onHand: 0 },
        });
        await page.getByTestId("place-order-btn").click();
        await expect(page.getByTestId("checkout-error")).toBeVisible();
        assert.equal(
          await db.order.count({ where: { userId: user.id } }),
          before,
        );
        await db.inventory.update({
          where: { variantId: products[0].variants[0].id },
          data: { onHand: 100 },
        });
        await page.reload();
        await chooseTestLocation(page);
        await expect(page.getByTestId("place-order-btn")).toBeEnabled();
        await fill();
        await page.getByTestId("place-order-btn").evaluate((e) => {
          (e as HTMLButtonElement).click();
          (e as HTMLButtonElement).click();
        });
        await expect(page).toHaveURL(/\/checkout\/payment\//);
        assert.equal(
          await db.order.count({ where: { userId: user.id } }),
          before + 1,
        );
        await page.goto(`${base}/product/${products[1].slug}`);
        await expect(page.getByTestId("buy-now-btn")).toBeEnabled();
        await page.getByTestId("buy-now-btn").click();
        await expect(page).toHaveURL(/\/checkout\?intent=/);
        await chooseTestLocation(page);
        await expect(page.getByTestId("place-order-btn")).toBeEnabled();
        await expect(page.getByTestId("place-order-btn")).toHaveCount(1);
        await expect(page.getByTestId("checkout-sticky-total")).toHaveText(
          await page.getByTestId("checkout-total").innerText(),
        );
        directUrl = page.url();
      },
    );
    await check(
      "V4: price and sticky checkout states inherit dark, sage and gradient published themes",
      async () => {
        for (const index of [1, 2, 0]) {
          const config = structuredClone(PRESETS[index].config);
          if (index === 0) config.gradients.buttons.enabled = true;
          await publishTheme(config);
          await page.setViewportSize({ width: 390, height: 844 });
          await page.route("**/api/v1/checkout/preview", (route) =>
            route.fulfill({
              status: 500,
              contentType: "application/json",
              body: JSON.stringify({ error: "Themed quote fixture failure" }),
            }),
          );
          await page.goto(directUrl);
          await chooseTestLocation(page, true, false);
          await expect(page.getByTestId("checkout-quote-error")).toBeVisible();
          const submit = page.getByTestId("place-order-btn");
          await expect(submit).toBeDisabled();
          const background = await submit.evaluate((e) => {
            const c = document.createElement("canvas").getContext("2d")!;
            c.fillStyle = getComputedStyle(e).backgroundColor;
            c.fillRect(0, 0, 1, 1);
            return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3);
          });
          const primary = rgb(config.colors.primary),
            disabledAnchor = rgb("#111418");
          background.forEach((channel, i) =>
            assert.ok(
              Math.abs(channel - primary[i] * 0.65 - disabledAnchor[i] * 0.35) <= 2,
            ),
          );
          assert.equal(
            await page
              .getByTestId("checkout-purchase-bar")
              .evaluate((e) => getComputedStyle(e).backgroundColor),
            `rgb(${rgb(config.colors.nav).join(", ")})`,
          );
          await page.unroute("**/api/v1/checkout/preview");
          await page
            .getByRole("button", { name: "Coba lagi", exact: true })
            .click();
          await page.getByTestId("ship-option-0").click();
          await expect(submit).toBeEnabled();
          if (index === 0)
            assert.ok(
              (
                await submit.evaluate(
                  (e) => getComputedStyle(e).backgroundImage,
                )
              ).includes("linear-gradient"),
            );
          await screenshot(`v4-checkout-theme-${index}-390.png`);
          await page.getByTestId("select-location").click();
          await expect(page.getByTestId("region-dialog")).toBeVisible();
          await screenshot(`v5-region-theme-${index}-390.png`);
          await page.getByRole("button", { name: "Tutup pilihan lokasi", exact: true }).click();
          await page.goto(`${base}/product/${products[0].slug}`);
          await page.evaluate(() =>
            scrollTo(0, document.documentElement.scrollHeight),
          );
          await expect(
            page.getByTestId("product-information-sheet"),
          ).toHaveAttribute("data-expanded", "true");
          await screenshot(`v4-pdp-theme-${index}-390.png`);
          await page.goto(base);
          v5Geometry.push({ theme: `preset-${index}`, width: 390, cards: await assertFeaturedConsistency(page) });
        }
      },
    );
    await check(
      "V4: no runtime exceptions or unsolicited review publication",
      async () => {
        assert.deepEqual(errors, []);
        assert.equal(
          await db.review.count({
            where: { productId: products[0].id, orderItemId: { not: null } },
          }),
          1,
        );
      },
    );
  } catch (error) {
    await page
      .screenshot({
        path: path.join(artifactDir, "v4-failure.png"),
        fullPage: true,
      })
      .catch(() => {});
    throw error;
  } finally {
    await writeFile(path.join(artifactDir, "v5-featured-geometry.json"), JSON.stringify(v5Geometry, null, 2));
    await themeCommand({
      kind: "rollback",
      revision: originalTheme.publishedVersion,
    });
    await themeCommand({ kind: "save", config: originalTheme.config });
    await page.close();
    await visitor.close();
    await context.close();
    await db.review.deleteMany({
      where: { productId: { in: products.map((p) => p.id) } },
    });
    await db.auditLog.deleteMany({ where: { userId: user.id } });
    await db.order.deleteMany({ where: { userId: user.id } });
    await db.checkoutIntent.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
    await db.bankAccount.delete({ where: { id: bank.id } });
    await db.coupon.delete({ where: { id: coupon.id } });
    await db.product.updateMany({
      where: { id: { in: products.map((p) => p.id) } },
      data: { status: "ARCHIVED" },
    });
  }
}
