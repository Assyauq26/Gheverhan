import { testAddress, apiShipping, chooseTestLocation } from "../fixtures/jnt-checkout";
import assert from "node:assert/strict";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { expect, type Page, type BrowserContext } from "@playwright/test";
import type { Prisma, PrismaClient } from "@prisma/client";
import { signSession } from "../../src/lib/auth/jwt";
import { formatIDR } from "../../src/lib/money";

async function assertMobileListingGrid(page: Page, width: number) {
  if (width >= 768) return;
  for (const theme of ['published', 'default']) {
    const result = await page.locator('.product-listing-grid').evaluateAll((grids, theme) => grids.map(grid => {
      const root = grid.closest<HTMLElement>('.storefront-root')!;
      const style = root.getAttribute('style'), active = root.getAttribute('data-theme-active');
      if (theme === 'default') { root.removeAttribute('style'); root.removeAttribute('data-theme-active'); }
      const result = {
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        cards: [...grid.children].map(card => {
          const price = card.querySelector<HTMLElement>('.product-card-price')!;
          const original = card.querySelector<HTMLElement>('.product-card-original');
          const button = card.querySelector<HTMLButtonElement>('.product-card-purchase > button')!;
          const priceBox = price.getBoundingClientRect();
          const cartBox = button.getBoundingClientRect();
          return {
            width: card.getBoundingClientRect().width,
            span: getComputedStyle(card).gridColumn,
            clipped: price.scrollWidth > price.clientWidth + 1 ||
              Boolean(original && original.scrollWidth > original.clientWidth + 1),
            priceFont: parseFloat(getComputedStyle(price).fontSize),
            originalFont: original ? parseFloat(getComputedStyle(original).fontSize) : null,
            touchWidth: cartBox.width, touchHeight: cartBox.height,
            aligned: Math.abs(priceBox.y + priceBox.height / 2 - cartBox.y - cartBox.height / 2) <= 1.5,
          };
        }),
      };
      if (style !== null) root.setAttribute('style', style);
      if (active !== null) root.setAttribute('data-theme-active', active);
      return result;
    }), theme);
    assert.ok(result.length > 0, 'real route must render the listing marker');
    for (const grid of result) {
      assert.equal(grid.columns, 2, `${width}px ${theme} computed tracks`);
      assert.ok(grid.cards.every(c =>
        !c.clipped && c.span === 'auto' &&
        Math.abs(c.width - grid.cards[0].width) < 1 &&
        c.priceFont > 0 && c.priceFont <= 16.01 &&
        (c.originalFont === null || (c.originalFont > 0 && c.originalFont <= c.priceFont * 0.8 + 0.1)) &&
        c.touchWidth >= 43.9 && c.touchHeight >= 43.9 && c.aligned
      ), JSON.stringify(grid));
    }
  }
}

export async function verifyFlashCampaign({
  page,
  admin,
  anonymous,
  readOnly,
  db,
  base,
  artifactDir,
  imageUrl,
  check,
}: {
  page: Page;
  admin: BrowserContext;
  anonymous: BrowserContext;
  readOnly: BrowserContext;
  db: PrismaClient;
  base: string;
  artifactDir: string;
  imageUrl: string;
  check: (label: string, run: () => Promise<void>) => Promise<void>;
}) {
  const prefix = "flash-ui-" + randomUUID().slice(0, 8);
  const name = "Flash Sale QA Akhir Bulan " + prefix;
  const category = await db.category.create({
    data: { name: "Kategori Flash QA", slug: prefix },
  });
  const brand = await db.brand.create({
    data: { name: "Brand Flash QA", slug: prefix },
  });
  const products: Prisma.ProductGetPayload<{ include: { variants: true } }>[] =
    [];
  const prices = [
    20000, 299000, 499000, 1999000, 99000, 17000, 125000, 9999000,
  ];
  const discounts = [
    17000, 249000, 299000, 1499000, 79000, 15000, 95000, 8999000,
  ];
  for (const [i, price] of prices.entries())
    products.push(
      await db.product.create({
        data: {
          name:
            i === 3
              ? "Nama produk panjang untuk memeriksa alignment harga dan keranjang"
              : "Produk QA " + i,
          description: prefix,
          slug: prefix + "-" + i,
          basePrice: price,
          salePrice: i === 2 ? 399000 : null,
          status: "PUBLISHED",
          isFeatured: i < 4,
          weightGrams: 500,
          categoryId: category.id,
          brandId: brand.id,
          images: { create: { url: imageUrl, alt: "Synthetic QA product" } },
          variants: {
            create:
              i === 1
                ? [
                    {
                      sku: prefix + "-1-red",
                      price: 279000,
                      color: "Merah",
                      size: "M",
                      inventory: { create: { onHand: 30 } },
                    },
                    {
                      sku: prefix + "-1-black",
                      price: 289000,
                      salePrice: 269000,
                      color: "Hitam",
                      size: "M",
                      inventory: { create: { onHand: 30 } },
                    },
                  ]
                : [
                    {
                      sku: prefix + "-" + i,
                      inventory: { create: { onHand: 30 } },
                    },
                  ],
          },
        },
        include: { variants: true },
      }),
    );
  const visitor = await anonymous.newPage();
  const errors: string[] = [];
  visitor.on("pageerror", (e) => errors.push(e.message));
  const user = await db.user.create({
    data: {
      name: "Flash QA Buyer",
      email: prefix + "@example.test",
      emailVerifiedAt: new Date(),
      passwordHash: "not-for-login",
    },
  });
  const customer = await admin.browser()!.newContext();
  await customer.addCookies([
    {
      name: "gh_session",
      value: await signSession({ sub: user.id, email: user.email }),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
  const buyer = await customer.newPage();
  buyer.on("pageerror", (e) => errors.push(e.message));
  for (const tab of [visitor, buyer])
    tab.on("console", (message) => {
      if (
        message.type() === "error" &&
        /hydration|hydrating|did not match|Minified React error #(418|423|425)/i.test(
          message.text(),
        )
      )
        errors.push(message.text());
    });
  let campaignId: string | undefined;
  let captured:
    | { action: string; contentType: string; body: string }
    | undefined;
  const capture = (request: import("@playwright/test").Request) => {
    const action = request.headers()["next-action"];
    const body = request.postData();
    if (action && body?.includes(name))
      captured = {
        action,
        contentType: request.headers()["content-type"],
        body,
      };
  };
  page.on("request", capture);
  const wib = (timestamp: number) =>
    new Date(timestamp + 7 * 3600000).toISOString().slice(0, 16);
  const geometry: unknown[] = [];
  try {
    await check(
      "Flash campaign: Marketing drafts/schedules eight participants with one WIB interval and unchanged master prices",
      async () => {
        await page.goto(base + "/admin/marketing");
        await expect(page.getByTestId("flash-campaign-manager")).toBeVisible();
        await page.locator("#campaign-name").fill(name);
        await page.locator("#campaign-start").fill(wib(Date.now() - 60000));
        await page.locator("#campaign-end").fill(wib(Date.now() + 7200000));
        await page.locator("#campaign-category").selectOption(category.id);
        await page.getByRole("button", { name: "Cari", exact: true }).click();
        await expect(
          page.getByTestId("flash-campaign-manager").getByRole("checkbox"),
        ).toHaveCount(8);
        await page
          .getByRole("button", {
            name: "Pilih produk eligible di halaman ini",
            exact: true,
          })
          .click();
        for (const [i, p] of products.entries())
          await page
            .locator(`#campaign-price-${p.id}`)
            .fill(String(discounts[i]));
        assert.equal(
          await page
            .getByTestId("flash-campaign-manager")
            .locator('input[type="datetime-local"]')
            .count(),
          2,
        );
        await page
          .getByRole("button", { name: "Simpan Draft", exact: true })
          .click();
        await expect(
          page.getByRole("status").filter({ hasText: "Kampanye tersimpan" }),
        ).toBeVisible();
        const draft = await db.flashSaleCampaign.findFirstOrThrow({
          where: { name },
          include: { items: true },
        });
        campaignId = draft.id;
        assert.equal(draft.status, "DRAFT");
        assert.equal(draft.items.length, 8);
        assert.equal(
          (
            await (
              await anonymous.request.get(
                base + `/api/v1/products/${products[0].slug}`,
              )
            ).json()
          ).data.flashSalePrice,
          null,
        );
        await page
          .getByRole("article")
          .filter({ hasText: name })
          .getByRole("button", { name: "Edit", exact: true })
          .click();
        page.once("dialog", (d) => d.accept());
        await page
          .getByRole("button", { name: "Jadwalkan", exact: true })
          .click();
        await expect(
          page.getByRole("status").filter({ hasText: "Kampanye tersimpan" }),
        ).toBeVisible();
        const active = await db.flashSaleCampaign.findUniqueOrThrow({
          where: { id: campaignId },
          include: { items: true },
        });
        assert.equal(active.status, "SCHEDULED");
        assert.equal(active.version, 1);
        for (const [i, p] of products.entries()) {
          const raw = await db.product.findUniqueOrThrow({
            where: { id: p.id },
          });
          assert.equal(raw.basePrice, prices[i]);
          assert.equal(raw.salePrice, i === 2 ? 399000 : null);
          assert.equal(raw.isFlashSale, false);
          assert.equal(raw.flashSalePrice, null);
          const response = await anonymous.request.get(
            base + `/api/v1/products/${p.slug}`,
          );
          const data = (await response.json()).data;
          assert.equal(data.flashSalePrice, discounts[i]);
          assert.equal(data.flashCampaign.endsAt, active.endsAt.toISOString());
        }
      },
    );
    await check(
      "Flash campaign: direct anonymous/read-only Server Action replay cannot mutate a campaign",
      async () => {
        assert.ok(captured, "real Marketing action frame must be captured");
        const before = await db.flashSaleCampaign.count();
        for (const context of [anonymous, readOnly]) {
          const response = await context.request.post(
            base + "/admin/marketing",
            {
              headers: {
                "next-action": captured.action,
                "content-type": captured.contentType,
                origin: base,
              },
              data: captured.body,
            },
          );
          const body = await response.text();
          assert.ok(
            /login/.test(response.url()) ||
              [401, 403, 404].includes(response.status()) ||
              body.includes('"ok":false'),
            "forged action must deny authorization",
          );
        }
        assert.equal(await db.flashSaleCampaign.count(), before);
      },
    );
    await check(
      "Flash campaign: all eight viewports align the44px cart target with the primary amount and preserve readable prices",
      async () => {
        for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
          await visitor.setViewportSize({ width, height: 900 });
          await visitor.goto(base + "/shop?q=" + prefix);
          await expect(
            visitor.getByTestId("product-card-" + products[0].slug),
          ).toBeVisible();
          assert.equal(
            await visitor.locator('[data-testid^="product-card-"]').count(),
            8,
          );
          await assertMobileListingGrid(visitor, width);
          for (const p of products) {
            const card = visitor.getByTestId("product-card-" + p.slug);
            await expect.poll(() => card.locator('.product-card-prices').getAttribute('style')).toContain('--product-price-scale');
            const result = await card.evaluate((el) => {
              const price = el.querySelector<HTMLElement>(
                  ".product-card-price",
                )!,
                button = el.querySelector<HTMLButtonElement>(
                  ".product-card-purchase > button",
                )!;
              const a = price.getBoundingClientRect(),
                b = button.getBoundingClientRect();
              const original = el.querySelector<HTMLElement>(
                ".product-card-original",
              )!;
              const o = original.getBoundingClientRect();
              const row = price.parentElement!;
              const scale = parseFloat(row.style.getPropertyValue('--product-price-scale'));
              row.style.setProperty('--product-price-scale', String(scale + .1 / 16));
              const larger = price.getBoundingClientRect().width + original.getBoundingClientRect().width + 2;
              row.style.setProperty('--product-price-scale', String(scale));
              return {
                largest: scale >= .9999 || larger > row.getBoundingClientRect().width,
                availablePriceWidth: row.getBoundingClientRect().width,
                mainTextWidth: a.width, originalTextWidth: o.width,
                priceGap: o.left - a.right, cartGap: b.left - o.right,
                price: price.textContent,
                priceFont: parseFloat(getComputedStyle(price).fontSize),
                originalFont: parseFloat(getComputedStyle(original).fontSize),
                layout: (el as HTMLElement).dataset.priceLayout,
                originalCenterDelta: Math.abs(
                  o.y + o.height / 2 - a.y - a.height / 2,
                ),
                originalAbove: o.bottom <= a.top + 1,
                originalBeside: o.left >= a.right + 1,
                originalClearOfCart: o.right <= b.left - 1,
                originalClient: original.clientWidth,
                originalScroll: original.scrollWidth,
                width: innerWidth,
                centerDelta: Math.abs(a.y + a.height / 2 - b.y - b.height / 2),
                touchWidth: b.width,
                cssWidth: parseFloat(getComputedStyle(button).width),
                cssHeight: parseFloat(getComputedStyle(button).height),
                touchHeight: b.height,
                client: price.clientWidth,
                scroll: price.scrollWidth,
                buttonBackground: getComputedStyle(button).backgroundColor,
                border: getComputedStyle(button).borderTopWidth,
              };
            });
            geometry.push(result);
            assert.ok(result.largest && result.priceGap >= 1.9 && result.priceGap <= 4 && result.cartGap >= 1.9, JSON.stringify(result));
            assert.ok(
              result.originalClearOfCart,
              "original overlaps cart " + JSON.stringify(result),
            );
            assert.ok(result.centerDelta <= 1.5, JSON.stringify(result));
            assert.equal(
              result.layout,
              "inline",
            );
            assert.ok(
                result.originalBeside && result.originalCenterDelta <= 1.5,
                JSON.stringify(result),
              );
            assert.ok(
              result.originalScroll <= result.originalClient + 1,
              "struck amount clips " + JSON.stringify(result),
            );
            assert.ok(
              result.cssWidth >= 44 &&
                result.cssHeight >= 44 &&
                result.touchWidth >= 43.9 &&
                result.touchHeight >= 43.9,
              JSON.stringify(result),
            );
            assert.ok(
              result.scroll <= result.client + 1,
              "amount clips " + JSON.stringify(result),
            );
            assert.equal(result.buttonBackground, "rgba(0, 0, 0, 0)");
            assert.equal(result.border, "0px");
          }
          assert.equal(
            await visitor.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
            `shop overflow ${width}`,
          );
          if ([390, 1440].includes(width))
            await visitor.screenshot({
              path: path.join(artifactDir, `flash-shop-${width}.png`),
              fullPage: true,
            });
          if (width < 768) {
            await visitor.locator('.product-listing-grid').evaluate(el => [...el.children].slice(1).forEach(c => c.remove()));
            await assertMobileListingGrid(visitor, width);
          }
          if (width === 1440) {
            // A filtered single result must retain a catalog-sized track rather
            // than stretching into a full-width product hero.
            const single = await visitor
              .locator(".grid:has(> .product-card)")
              .evaluate((grid) => {
                [...grid.children]
                  .slice(1)
                  .forEach((c) => ((c as HTMLElement).style.display = "none"));
                return {
                  card: grid.firstElementChild!.getBoundingClientRect().width,
                  grid: grid.getBoundingClientRect().width,
                };
              });
            assert.ok(
              single.card <= single.grid / 3 + 1,
              "single result stretches " + JSON.stringify(single),
            );
          }
        }
        // The same card also appears in four-column Home/PDP/preview grids.
        // Check actual cell boundaries, not only each span's intrinsic width.
        for (const width of [768, 1024, 1360]) {
          await visitor.setViewportSize({ width, height: 900 });
          await visitor.goto(base + "/shop?q=" + prefix);
          await expect(visitor.locator(".product-card").first()).toBeVisible();
          const grid = visitor.locator(".grid:has(> .product-card)");
          await grid.evaluate((el, narrow) => {
            el.classList.remove("md:grid-cols-3");
            el.classList.add("md:grid-cols-4");
            if (narrow) (el as HTMLElement).style.width = "600px";
          }, width === 1360);
          const bounds = await grid
            .locator(".product-card")
            .evaluateAll((cards) =>
              cards.map((c) => {
                const original = c
                  .querySelector<HTMLElement>(".product-card-original")!
                  .getBoundingClientRect();
                const button = c
                  .querySelector<HTMLElement>(
                    ".product-card-purchase > button",
                  )!
                  .getBoundingClientRect();
                return {
                  originalRight: original.right,
                  buttonLeft: button.left,
                };
              }),
            );
          assert.ok(
            bounds.every((b) => b.originalRight <= b.buttonLeft - 1),
            "four-column/narrow grid overlap " +
              JSON.stringify({ width, bounds }),
          );
        }
        // CI uses different installed font metrics. A wider fallback must keep
        // the original clipping assertion valid, including seven-digit amounts.
        await visitor.setViewportSize({ width: 360, height: 900 });
        await visitor.goto(base + "/shop?q=" + prefix);
        await visitor.addStyleTag({
          content: ".product-card-price { font-family: Georgia, serif; }",
        });
        for (const p of products) {
          const price = visitor
            .getByTestId("product-card-" + p.slug)
            .locator(".product-card-price");
          await expect(price).toBeVisible();
          const metrics = await price.evaluate((el) => ({
            scroll: el.scrollWidth,
            client: el.clientWidth,
          }));
          assert.ok(
            metrics.scroll <= metrics.client + 1,
            "wider font amount clips " + JSON.stringify(metrics),
          );
        }
      },
    );
    await check(
      "Flash campaign: Home/listing/cards share one deadline, watermark stays behind content, clock skew/reload never reset it",
      async () => {
        await visitor.setViewportSize({ width: 390, height: 900 });
        await visitor.goto(base + "/");
        const banner = visitor.getByTestId("flash-sale");
        await expect(banner).toBeVisible();
        const campaign = await db.flashSaleCampaign.findUniqueOrThrow({
          where: { id: campaignId! },
        });
        const timers = visitor.locator(
          `[data-testid="flash-timer"][data-campaign-id="${campaignId}"]`,
        );
        assert.ok((await timers.count()) >= 5);
        await expect
          .poll(() =>
            timers
              .locator("time")
              .evaluateAll(
                (nodes) => new Set(nodes.map((n) => n.textContent)).size,
              ),
          )
          .toBe(1);
        assert.ok(
          (
            await timers.evaluateAll((nodes) =>
              nodes.map((n) => n.getAttribute("data-deadline")),
            )
          ).every((s) => s === campaign.endsAt.toISOString()),
        );
        const watermark = await banner
          .locator("svg[aria-hidden=true]")
          .first()
          .evaluate((el) => ({
            opacity: Number(getComputedStyle(el).opacity),
            pointer: getComputedStyle(el).pointerEvents,
            z: getComputedStyle(el).zIndex,
          }));
        assert.ok(watermark.opacity <= 0.06);
        assert.equal(watermark.pointer, "none");
        assert.equal(watermark.z, "0");
        const before = await timers.first().locator("time").textContent();
        await visitor.evaluate(() => {
          Date.now = () => 1;
        });
        await expect
          .poll(() => timers.first().locator("time").textContent())
          .not.toBe(before);
        await visitor.reload();
        await expect(visitor.getByTestId("flash-sale")).toBeVisible();
        assert.equal(
          await visitor
            .getByTestId("flash-sale")
            .getByTestId("flash-timer")
            .getAttribute("data-deadline"),
          campaign.endsAt.toISOString(),
        );
        for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
          await visitor.setViewportSize({ width, height: 900 });
          await expect(visitor.getByTestId("flash-sale")).toBeVisible();
          await assertMobileListingGrid(visitor, width);
          const featuredGeometry = await visitor.locator('[aria-label="Produk pilihan"] .product-card').evaluateAll(cards => cards.map(card => {
            const title = (card.querySelector('[data-testid="flash-timer"]') ?? card.querySelector('h3'))!.getBoundingClientRect();
            const purchase = card.querySelector('.product-card-purchase')!.getBoundingClientRect();
            const price = card.querySelector('.product-card-price')!.getBoundingClientRect();
            const original = card.querySelector('.product-card-original')?.getBoundingClientRect();
            return { gap: purchase.top + parseFloat(getComputedStyle(card.querySelector(".product-card-purchase")!).paddingTop) - title.bottom, beside: !original || original.left >= price.right + 1,
              sameRow: !original || Math.abs(original.y + original.height / 2 - price.y - price.height / 2) <= 1.5 };
          }));
          assert.ok(featuredGeometry.length > 0);
          assert.ok(featuredGeometry.every(g => g.gap >= 7.9 && g.gap <= 36.1 && g.beside && g.sameRow), JSON.stringify({ width, featuredGeometry }));
          await visitor.evaluate(() => document.fonts.ready);
          await visitor.screenshot({
            path: path.join(artifactDir, `flash-home-${width}.png`),
            fullPage: true,
          });
          await visitor.goto(base + "/shop?flash=1");
          await expect(
            visitor.getByRole("region", { name: "Jadwal Flash Sale" }),
          ).toBeVisible();
          assert.equal(
            await visitor.locator('[data-testid^="product-card-"]').count(),
            8,
          );
          await assertMobileListingGrid(visitor, width);
          assert.equal(
            await visitor.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
          );
          await expect
            .poll(() =>
              visitor
                .getByTestId("flash-timer")
                .locator("time")
                .evaluateAll(
                  (nodes) => new Set(nodes.map((n) => n.textContent)).size,
                ),
            )
            .toBe(1);
          await visitor.screenshot({
            path: path.join(artifactDir, `flash-listing-${width}.png`),
            fullPage: true,
          });
          await visitor.goto(base + "/");
        }
      },
    );
    await check(
      "Flash campaign: search/category/brand keep the same active overlay and card controls",
      async () => {
        for (const route of [
          "/search?q=" + prefix,
          "/category/" + prefix,
          "/brand/" + prefix,
        ])
          for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
            await visitor.setViewportSize({ width, height: 900 });
            await visitor.goto(base + route);
            await expect(
              visitor.getByTestId("product-card-" + products[0].slug),
            ).toBeVisible();
            await assertMobileListingGrid(visitor, width);
            await expect(
              visitor
                .getByTestId("product-card-" + products[0].slug)
                .locator(".product-card-price"),
            ).toHaveText(formatIDR(17000));
            assert.equal(
              await visitor.evaluate(
                () => document.documentElement.scrollWidth > innerWidth,
              ),
              false,
              route,
            );
          }
      },
    );
    await check(
      "Flash campaign: Product Editor has no Flash Sale controls and normal saves retain membership",
      async () => {
        await page.goto(base + `/admin/products/${products[0].id}`);
        await expect(page.getByText("Flash sale", { exact: true })).toHaveCount(
          0,
        );
        await expect(
          page.getByRole("checkbox", { name: /Flash sale/i }),
        ).toHaveCount(0);
        await page
          .getByLabel("Nama produk", { exact: true })
          .fill("Produk QA 0 diperbarui");
        await page.getByTestId("save-product").click();
        await expect(
          page
            .getByRole("region", { name: "Status perubahan produk" })
            .getByRole("status"),
        ).toContainText("Produk berhasil disimpan");
        assert.equal(
          await db.flashSaleCampaignItem.count({
            where: { campaignId: campaignId!, productId: products[0].id },
          }),
          1,
        );
        assert.equal(
          (
            await (
              await anonymous.request.get(
                base + `/api/v1/products/${products[0].slug}`,
              )
            ).json()
          ).data.flashSalePrice,
          17000,
        );
        await page.goto(base + "/admin/marketing");
        await page
          .getByRole("article")
          .filter({ hasText: name })
          .getByRole("button", { name: "Edit", exact: true })
          .click();
        await page.locator("#campaign-category").selectOption(category.id);
        await page.getByRole("button", { name: "Cari", exact: true }).click();
        await expect(
          page.getByTestId("flash-campaign-manager").getByRole("checkbox"),
        ).toHaveCount(8);
        for (const width of [390, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
          );
          await page.screenshot({
            path: path.join(artifactDir, `flash-marketing-${width}.png`),
            fullPage: true,
          });
        }
        page.once("dialog", (d) => d.accept());
        await page
          .getByRole("button", { name: "Batalkan edit", exact: true })
          .click();
      },
    );
    await check(
      "Flash campaign: PDP selected explicit SKU prices match the active campaign",
      async () => {
        await buyer.goto(base + "/product/" + products[1].slug);
        const panel = buyer.getByTestId("purchase-panel");
        for (const color of ["Merah", "Hitam"]) {
          await panel.getByRole("button", { name: color, exact: true }).click();
          await panel.getByRole("button", { name: "M", exact: true }).click();
          await expect(
            buyer.getByTestId("selected-product-price").locator("span").first(),
          ).toHaveText(formatIDR(249000));
        }
        const metadata = (
          await (
            await customer.request.get(
              base + "/api/v1/products/" + products[1].slug + "/purchase",
            )
          ).json()
        ).data;
        assert.ok(
          metadata.variants.every((v: { price: number }) => v.price === 249000),
        );
      },
    );
    await check(
      "Flash campaign: quick add uses the selected campaign SKU and cart retains server pricing",
      async () => {
        await buyer.setViewportSize({ width: 390, height: 900 });
        await buyer.goto(base + "/shop?q=" + prefix);
        await buyer
          .getByTestId("product-card-" + products[0].slug)
          .getByRole("button", { name: "Tambah ke keranjang", exact: true })
          .click();
        await expect
          .poll(
            async () =>
              await db.cartItem.count({ where: { cart: { userId: user.id } } }),
          )
          .toBe(1);
        const cartResponse = await customer.request.post(
          base + "/api/v1/checkout/preview",
          { data: {} },
        );
        assert.equal((await cartResponse.json()).data.subtotal, 17000);
        const dialog = buyer.getByTestId("purchase-dialog");
        await expect(buyer.getByTestId("cart-success-sheet")).toBeVisible();
        await dialog
          .getByRole("button", { name: "Lanjut Belanja", exact: true })
          .click();
        await buyer
          .getByTestId("product-card-" + products[1].slug)
          .getByRole("button", { name: "Tambah ke keranjang", exact: true })
          .click();
        await expect(dialog).toBeVisible();
        await dialog
          .getByRole("button", { name: "Merah", exact: true })
          .click();
        await dialog.getByRole("button", { name: "M", exact: true }).click();
        await dialog
          .getByRole("button", { name: "Masukkan ke Keranjang", exact: true })
          .click();
        await expect
          .poll(
            async () =>
              await db.cartItem.count({ where: { cart: { userId: user.id } } }),
          )
          .toBe(2);
        const priced = (
          await (
            await customer.request.post(base + "/api/v1/checkout/preview", {
              data: {},
            })
          ).json()
        ).data;
        assert.equal(priced.subtotal, 266000);
        await buyer.goto(base + "/checkout");
        await chooseTestLocation(buyer);
        await expect(buyer.getByTestId("place-order-btn")).toBeEnabled();
        const expected = JSON.parse(
          await buyer.locator('input[name="expectedLines"]').inputValue(),
        );
        assert.ok(
          expected.some((l: { unitPrice: number }) => l.unitPrice === 17000),
        );
        assert.ok(
          expected.some((l: { unitPrice: number }) => l.unitPrice === 249000),
        );
      },
    );
    await check(
      "Flash campaign: ending restores regular prices/listing/checkout without touching orders or the manual catalog price",
      async () => {
        const held = await customer.newPage();
        await held.goto(base + "/shop?q=" + prefix);
        await held
          .getByTestId("product-card-" + products[1].slug)
          .getByRole("button", { name: "Tambah ke keranjang", exact: true })
          .click();
        const sheet = held.getByTestId("quick-add-variant-sheet");
        await sheet.getByRole("button", { name: "Merah", exact: true }).click();
        await sheet.getByRole("button", { name: "M", exact: true }).click();
        await expect(sheet.getByTestId("quick-add-price")).toHaveText(
          formatIDR(249000),
        );
        await page.goto(base + "/admin/marketing");
        page.once("dialog", (d) => d.accept());
        await page
          .getByRole("article")
          .filter({ hasText: name })
          .getByRole("button", { name: "Akhiri", exact: true })
          .click();
        await expect(
          page.getByRole("status").filter({ hasText: "Kampanye diakhiri" }),
        ).toBeVisible();
        await held.bringToFront();
        await held.evaluate(() => window.dispatchEvent(new Event("focus")));
        await expect(sheet.getByTestId("quick-add-price")).toHaveText(
          formatIDR(279000),
        );
        await expect(
          sheet.getByRole("button", { name: "Merah", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        await held.close();
        await buyer.bringToFront();
        await buyer.evaluate(() => window.dispatchEvent(new Event("focus")));
        await expect
          .poll(async () => {
            const rows = JSON.parse(
              await buyer.locator('input[name="expectedLines"]').inputValue(),
            ) as { unitPrice: number }[];
            return rows.reduce((n, l) => n + l.unitPrice, 0);
          })
          .toBe(299000);
        await buyer.goto(base + "/product/" + products[1].slug);
        for (const [color, regularPrice] of [
          ["Merah", 279000],
          ["Hitam", 269000],
        ] as const) {
          await buyer
            .getByTestId("purchase-panel")
            .getByRole("button", { name: color, exact: true })
            .click();
          await buyer
            .getByTestId("purchase-panel")
            .getByRole("button", { name: "M", exact: true })
            .click();
          await expect(
            buyer.getByTestId("selected-product-price").locator("span").first(),
          ).toHaveText(formatIDR(regularPrice));
        }
        await visitor.goto(base + "/shop?flash=1");
        await expect(
          visitor
            .getByRole("region", { name: "Jadwal Flash Sale" })
            .getByText("Flash Sale Telah Berakhir", { exact: true }),
        ).toBeVisible();
        await expect(
          visitor.locator('[data-testid^="product-card-"]'),
        ).toHaveCount(0);
        await visitor.goto(base + "/");
        await expect(visitor.getByTestId("flash-sale")).toHaveCount(0);
        for (const width of [320, 360, 375, 390, 430]) {
          await visitor.setViewportSize({ width, height: 900 });
          await visitor.goto(base + '/shop?q=' + prefix);
          await expect(visitor.getByTestId('product-card-' + products[0].slug)).toBeVisible();
          await assertMobileListingGrid(visitor, width);
        }
        assert.equal(
          (
            await db.product.findUniqueOrThrow({
              where: { id: products[2].id },
            })
          ).salePrice,
          399000,
        );
        assert.equal(await db.order.count({ where: { userId: user.id } }), 0);
      },
    );
    await check(
      "Flash campaign: natural start/end boundaries refresh an already-open Home and restore prices",
      async () => {
        const clock = Date.now();
        const boundary = await db.flashSaleCampaign.create({
          data: {
            id: randomUUID(),
            name: prefix + " boundary",
            status: "SCHEDULED",
            startsAt: new Date(clock + 8000),
            endsAt: new Date(clock + 18000),
            items: {
              create: {
                id: randomUUID(),
                productId: products[0].id,
                flashSalePrice: 17000,
              },
            },
          },
        });
        try {
          await visitor.goto(base + "/");
          const banner = visitor.getByTestId("flash-sale");
          const amount = visitor
            .getByTestId("product-card-" + products[0].slug)
            .first()
            .locator(".product-card-price");
          await expect(
            banner.getByText("Flash Sale Dimulai Dalam", { exact: true }),
          ).toBeVisible();
          await expect(amount).toHaveText(formatIDR(20000));
          await expect(
            banner.getByText("Berakhir Dalam", { exact: true }),
          ).toBeVisible({ timeout: 15000 });
          await expect(amount).toHaveText(formatIDR(17000));
          await expect(banner).toHaveCount(0, { timeout: 15000 });
          await expect(amount).toHaveText(formatIDR(20000));
        } finally {
          await db.flashSaleCampaign.update({
            where: { id: boundary.id },
            data: { status: "ENDED" },
          });
        }
      },
    );
    assert.deepEqual(errors, []);
    await writeFile(
      path.join(artifactDir, "flash-campaign-results.json"),
      JSON.stringify(
        {
          status: "PASS",
          synthetic: true,
          campaignId,
          deadline: (
            await db.flashSaleCampaign.findUniqueOrThrow({
              where: { id: campaignId! },
            })
          ).endsAt.toISOString(),
          viewports: [320, 360, 375, 390, 430, 768, 1024, 1440],
          geometry,
        },
        null,
        2,
      ),
    );
  } finally {
    page.off("request", capture);
    if (campaignId)
      await db.flashSaleCampaign.updateMany({
        where: { id: campaignId },
        data: { status: "ENDED" },
      });
    await visitor.close();
    await buyer.close();
    await customer.close();
  }
}
