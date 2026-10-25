import { PRESETS } from "../../src/modules/appearance/presets";
import { rgb } from "../../src/modules/appearance/contrast";
import sharp from "sharp";
import { parseAppearance } from "../../src/modules/appearance/schema";
import assert from "node:assert/strict";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { expect, type Browser, type BrowserContext, type Page, type FrameLocator } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

// Read real elements, never infer borderlessness from a missing selector.
async function shellStyles(scope: Page | FrameLocator) {
  const root = scope.locator(".storefront-root");
  await expect(root.locator(":scope > header")).toHaveCount(1);
  await expect(root.locator(":scope > footer")).toHaveCount(1);
  await expect(scope.getByTestId("bottom-nav")).toHaveCount(1);
  return root.evaluate((e) => ({
    header: getComputedStyle(e.querySelector(":scope > header")!).borderBottomWidth,
    footer: getComputedStyle(e.querySelector(":scope > footer")!).borderTopWidth,
    footerFirst: getComputedStyle(e.querySelector(":scope > footer")!.firstElementChild!).borderTopWidth,
    footerLast: getComputedStyle(e.querySelector(":scope > footer")!.lastElementChild!).borderTopWidth,
    nav: [
      getComputedStyle(e.querySelector('[data-testid="bottom-nav"]')!).borderTopWidth,
      getComputedStyle(e.querySelector('[data-testid="bottom-nav"]')!).borderRightWidth,
      getComputedStyle(e.querySelector('[data-testid="bottom-nav"]')!).borderBottomWidth,
      getComputedStyle(e.querySelector('[data-testid="bottom-nav"]')!).borderLeftWidth,
    ],
    shadow: getComputedStyle(e.querySelector('[data-testid="bottom-nav"]')!).boxShadow,
    radius: getComputedStyle(e.querySelector('[data-testid="bottom-nav"]')!).borderRadius,
    position: getComputedStyle(e.querySelector('[data-testid="bottom-nav"]')!).position,
    surface: getComputedStyle(e.querySelector('[data-testid="bottom-nav"]')!).backgroundColor,
  }));
}

async function assertBorderless(scope: Page | FrameLocator, label: string) {
  const visual = await shellStyles(scope);
  assert.equal(visual.header, "0px", `${label}: header bottom`);
  assert.equal(visual.footer, "0px", `${label}: footer top`);
  assert.equal(visual.footerFirst, "0px", `${label}: trust section top`);
  assert.equal(visual.footerLast, "0px", `${label}: legal section top`);
  assert.deepEqual(visual.nav, ["0px", "0px", "0px", "0px"], `${label}: navigation shell`);
  assert.equal(visual.position, "fixed", label);
  assert.notEqual(visual.surface, "rgba(0, 0, 0, 0)", label);
  const nav = scope.getByTestId("bottom-nav");
  if (await nav.getAttribute("data-style") === "pill") {
    assert.equal(visual.radius, "9999px", label);
    if (!label.includes("shadow none")) {
      assert.notEqual(visual.shadow, "none", "Floating pill needs elevation against a matching background");
    }
    const motion = await nav.locator("a").first().evaluate((e) => ({
      property: getComputedStyle(e).transitionProperty,
      duration: getComputedStyle(e).transitionDuration,
    }));
    assert.ok(motion.property.includes("width") || motion.property.includes("all"), "Active tab width should animate");
    assert.ok(parseFloat(motion.duration) >= 0.25, "Native-like transition should last at least 250ms");
  }
  await expect(nav.locator("a")).toHaveCount(4);
  const hrefs = [];
  for (const link of await nav.locator("a").all()) hrefs.push(await link.getAttribute("href"));
  assert.deepEqual(hrefs.sort(), ["/", "/account", "/cart", "/shop"]);
  await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
  return visual;
}

async function assertSearchFocus(scope: Page | FrameLocator) {
  const input = scope.locator('[data-testid="search-input"]:visible');
  // Both responsive search forms exist. Check the one visible at this viewport.
  const surfaceBefore = await input.evaluate((e) => getComputedStyle(e).backgroundColor);
  await input.focus();
  const focus = await input.evaluate((e) => ({
    border: getComputedStyle(e).borderTopWidth,
    borderColor: getComputedStyle(e).borderTopColor,
    surface: getComputedStyle(e).backgroundColor,
    outline: getComputedStyle(e).outlineStyle,
    shadow: getComputedStyle(e).boxShadow,
  }));
  assert.equal(focus.surface, surfaceBefore, "Focus should only darken the border, never flash the field background");
  assert.equal(focus.border, "1px", "Search keeps its original single border");
  assert.notEqual(focus.borderColor, "transparent", "Focused border remains visible");
  assert.equal(focus.outline, "none", "Search must not draw a second outline");
  assert.equal(focus.shadow, "none", "Search must not add a focus ring");
}

async function captureShell(page: Page, scope: Page | FrameLocator, dir: string, label: string) {
  await scope.locator("body").evaluate((e) => e.ownerDocument.defaultView!.scrollTo(0, 0));
  await page.screenshot({ path: path.join(dir, `customize-chrome-${label}-top.png`), animations: "disabled" });
  await scope.locator("body").evaluate((e) => e.ownerDocument.defaultView!.scrollTo(0, e.ownerDocument.documentElement.scrollHeight));
  await page.screenshot({ path: path.join(dir, `customize-chrome-${label}-footer.png`), animations: "disabled" });
  await scope.locator("body").evaluate((e) => e.ownerDocument.defaultView!.scrollTo(0, 0));
}
export async function verifyStoreAppearance({
  browser,
  admin,
  anonymous,
  readOnly,
  db,
  base,
  artifactDir,
  check,
}: {
  browser: Browser;
  admin: BrowserContext;
  anonymous: BrowserContext;
  readOnly: BrowserContext;
  db: PrismaClient;
  base: string;
  artifactDir: string;
  check: (name: string, fn: () => Promise<void>) => Promise<void>;
}) {
  const page = await admin.newPage(),
    visitor = await anonymous.newPage();
  page.on("dialog", (d) => d.accept());
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await check("customize: legacy storefront chrome evidence", async () => {
      await visitor.goto(base + "/");
      for (const width of [390, 1360]) {
        await visitor.setViewportSize({width, height: 900});
        await captureShell(visitor, visitor, artifactDir, `legacy-${width}`);
        await assertBorderless(visitor, `legacy ${width}`);
        await assertSearchFocus(visitor);
      }
    });
    await check("customize: server RBAC and private preview", async () => {
      assert.equal(
        (
          await anonymous.request.get(base + "/api/v1/admin/store-appearance")
        ).status(),
        401,
      );
      assert.equal(
        (
          await readOnly.request.get(base + "/api/v1/admin/store-appearance")
        ).status(),
        403,
      );
      assert.equal(
        (
          await readOnly.request.post(base + "/api/v1/admin/store-appearance", {
            headers: { Origin: base },
            data: { kind: "reset", draftVersion: 0, publishedVersion: 0 },
          })
        ).status(),
        403,
      );
      const denied = await readOnly.request.get(base + "/admin/customize");
      assert.equal(denied.status(), 404);
      const preview = await anonymous.request.get(
        base + "/store-customize-preview",
      );
      assert.match(preview.url(), /\/login/);
      const upload = await readOnly.request.post(
        base + "/api/v1/admin/store-branding",
        {
          headers: { Origin: base },
          multipart: {
            image: {
              name: "x.svg",
              mimeType: "image/svg+xml",
              buffer: Buffer.from("<svg/>"),
            },
            requestId: crypto.randomUUID(),
          },
        },
      );
      assert.equal(upload.status(), 403);
    });
    await check("customize: draft and isolated live preview", async () => {
      await page.goto(base + "/admin/customize");
      await expect(
        page.getByRole("heading", {
          name: "Customize / Dekorasi Toko",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Preset/Template Warna", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Midnight Ink", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Identitas Toko", exact: true })
        .click();
      await page
        .getByLabel("Nama toko", { exact: true })
        .fill("Theme Studio Test");
      await page
        .getByRole("button", { name: "Simpan Draft", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText("Draft tersimpan");
      await visitor.goto(base + "/");
      await expect(visitor.getByTestId("logo")).toHaveText("Gheverhan");
      const frame = page.frameLocator('iframe[title="Preview draft toko"]');
      await expect(frame.getByTestId("logo")).toHaveText("Theme Studio Test");
      await expect(frame.getByTestId("logo")).toBeVisible();
      await expect(frame.getByTestId("logo")).toBeVisible();
      const before = await db.order.count();
      await frame
        .getByRole("button", { name: "Beli sekarang", exact: true })
        .click();
      assert.equal(await db.order.count(), before);
    });
    await check(
      "customize: all ten presets render from the same draft schema",
      async () => {
        await page
          .getByRole("button", { name: "Preset/Template Warna", exact: true })
          .click();
        for (const preset of PRESETS) {
          await page
            .getByRole("button", { name: preset.name, exact: true })
            .click();
          await expect
            .poll(() =>
              page
                .frameLocator('iframe[title="Preview draft toko"]')
                .locator(".storefront-root")
                .evaluate((e) => getComputedStyle(e).backgroundColor),
            )
            .toBe(`rgb(${rgb(preset.config.colors.pageBg).join(", ")})`);
          const visual = await page
            .frameLocator('iframe[title="Preview draft toko"]')
            .locator('article[data-theme-target="highlightCard"]')
            .first()
            .evaluate((card) => ({
              radius: getComputedStyle(card).borderRadius,
              mediaRadius: getComputedStyle(card.querySelector(".rounded-xl")!)
                .borderRadius,
              cardBorder: getComputedStyle(card).borderColor,
              cardBackground: getComputedStyle(card).backgroundColor,
              searchBorder: getComputedStyle(
                card.closest(".storefront-root")!
                  .querySelector('[data-testid="search-input"]')!,
              ).borderColor,
              searchBackground: getComputedStyle(
                card.closest(".storefront-root")!
                  .querySelector('[data-testid="search-input"]')!,
              ).backgroundColor,
            }));
          // Do color parsing outside evaluate: browser-side nested arrow
          // helpers are not portable through the tsx/Playwright serializer.
          const channels = (value: string) =>
            (value.match(/\d+/g) || []).slice(0, 3).map(Number);
          const largestDifference = (left: string, right: string) =>
            Math.max(
              ...channels(left).map(
                (channel, index) => Math.abs(channel - channels(right)[index]),
              ),
            );
          assert.equal(visual.radius, "16px", preset.name);
          assert.equal(visual.mediaRadius, "12px", preset.name);
          assert.ok(
            largestDifference(visual.cardBorder, visual.cardBackground) < 48,
            preset.name,
          );
          assert.ok(
            largestDifference(visual.searchBorder, visual.searchBackground) < 48,
            preset.name,
          );
          const frame = page.frameLocator('iframe[title="Preview draft toko"]');
          await assertBorderless(frame, preset.name);
          await assertSearchFocus(frame);
          await expect(frame.getByTestId("bottom-cart-count")).toHaveText("2");
          if (["Gheverhan Monochrome", "Midnight Ink"].includes(preset.name)) {
            await captureShell(page, frame, artifactDir, `preview-${preset.name.toLowerCase().replaceAll(" ", "-")}-390`);
          }
        }
        await page
          .getByRole("button", { name: "Midnight Ink", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Identitas Toko", exact: true })
          .click();
      },
    );
    await check(
      "customize: private logo upload, published reference and mode",
      async () => {
        const png = await sharp({
          create: {
            width: 64,
            height: 32,
            channels: 4,
            background: { r: 240, g: 180, b: 90, alpha: 1 },
          },
        })
          .png()
          .toBuffer();
        await page
          .getByLabel("Upload logo PNG/JPEG/WebP (maks. 2 MiB)")
          .setInputFiles({
            name: "brand.png",
            mimeType: "image/png",
            buffer: png,
          });
        await expect(page.getByRole("status")).toContainText(
          "Logo diunggah privat",
        );
        await page
          .getByLabel("Mode logo", { exact: true })
          .selectOption("both");
        await page
          .getByRole("button", { name: "Simpan Draft", exact: true })
          .click();
        await expect(page.getByRole("status")).toContainText("Draft tersimpan");
        const config = parseAppearance(
          (
            await db.storeAppearance.findUniqueOrThrow({
              where: { key: "primary" },
            })
          ).draft,
        );
        assert.ok(config.identity.logoAssetId);
        const html = await (await anonymous.request.get(base + "/")).text();
        assert.ok(!html.includes("Theme Studio Test"));
        assert.ok(!html.includes(config.identity.logoAssetId));
        assert.equal(
          (
            await anonymous.request.get(
              base + "/api/v1/store-branding/" + config.identity.logoAssetId,
            )
          ).status(),
          404,
        );
        assert.equal(
          (
            await readOnly.request.get(
              base +
                "/api/v1/admin/store-branding/" +
                config.identity.logoAssetId,
            )
          ).status(),
          403,
        );
      },
    );
    await check(
      "customize: branding modes and gradient controls stay in preview",
      async () => {
        const logo = page
          .frameLocator('iframe[title="Preview draft toko"]')
          .getByTestId("logo");
        await page
          .getByLabel("Mode logo", { exact: true })
          .selectOption("text");
        await expect(logo.locator("img")).toHaveCount(0);
        await page
          .getByLabel("Mode logo", { exact: true })
          .selectOption("image");
        await expect(logo.locator("img")).toBeVisible();
        await page
          .getByLabel("Mode logo", { exact: true })
          .selectOption("both");
        await expect(logo).toHaveText("Theme Studio Test");
        await page
          .getByRole("button", { name: "Gradasi", exact: true })
          .click();
        await page
          .getByRole("group", { name: "buttons", exact: true })
          .getByLabel("Aktifkan", { exact: true })
          .check();
        const frame = page.frameLocator('iframe[title="Preview draft toko"]');
        await frame
          .getByText("PREVIEW • Interaksi belanja dinonaktifkan", {
            exact: true,
          })
          .hover();
        const buy = frame.getByRole("button", {
          name: "Beli sekarang",
          exact: true,
        });
        await expect
          .poll(() => buy.evaluate((e) => getComputedStyle(e).backgroundImage))
          .toContain("linear-gradient");
        await buy.hover();
        await expect
          .poll(() => buy.evaluate((e) => getComputedStyle(e).backgroundImage))
          .toBe("none");
        await expect
          .poll(() => buy.evaluate((e) => getComputedStyle(e).color))
          .toBe(
            `rgb(${rgb(PRESETS.find((p) => p.name === "Midnight Ink")!.config.colors.primaryText).join(", ")})`,
          );
        await frame
          .getByText("PREVIEW • Interaksi belanja dinonaktifkan", {
            exact: true,
          })
          .hover();
        await page
          .getByRole("button", { name: "Simpan Draft", exact: true })
          .click();
        await expect(page.getByRole("status")).toContainText("Draft tersimpan");
        await page
          .getByRole("button", { name: "Identitas Toko", exact: true })
          .click();
      },
    );
    await check(
      "customize: header visibility and bottom-bar layout affect the shared preview",
      async () => {
        const frame = page.frameLocator('iframe[title="Preview draft toko"]');
        // The preceding save/logo-preview scenario may still have a GET in
        // flight when its status message appears. Finish prior page/iframe
        // requests BEFORE measuring reads caused by palette/layout changes.
        // Requests started after this point must still be zero.
        await page.waitForLoadState("networkidle", { timeout: 15000 });
        let logoReads = 0;
        const track = (request: {
          url(): string;
          method(): string;
          resourceType(): string;
        }) => {
          // The Identity tab also contains a lazy-loaded <Image> thumbnail.
          // Only the editor's fetch/XHR requests supply preview logo bytes;
          // do not count normal image loads when scrolling past the thumbnail.
          if (
            request.method() === "GET" &&
            ["fetch", "xhr"].includes(request.resourceType()) &&
            request.url().includes("/api/v1/admin/store-branding/")
          )
            logoReads++;
        };
        page.on("request", track);
        await page
          .getByRole("button", { name: "Preset/Template Warna", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Gheverhan Monochrome", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Gradasi", exact: true })
          .click();
        await page
          .getByRole("group", { name: "header", exact: true })
          .getByLabel("Aktifkan", { exact: true })
          .check();
        await frame.getByTestId("header-wishlist").hover();
        await expect
          .poll(() =>
            frame
              .getByTestId("header-wishlist")
              .evaluate((e) => getComputedStyle(e).color),
          )
          .toBe("rgb(255, 255, 255)");
        await assertBorderless(frame, "header gradient");
        assert.match(await frame.locator("header").evaluate((e) => getComputedStyle(e).backgroundImage), /linear-gradient/);
        await page
          .getByRole("group", { name: "header", exact: true })
          .getByLabel("Aktifkan", { exact: true })
          .uncheck();
        await page.getByRole("group", {name:"footer", exact:true}).getByLabel("Aktifkan", {exact:true}).check();
        await expect.poll(() => frame.locator("footer").evaluate((e) => getComputedStyle(e).backgroundImage)).toContain("linear-gradient");
        await assertBorderless(frame, "footer gradient");
        await page.getByRole("group", {name:"footer", exact:true}).getByLabel("Aktifkan", {exact:true}).uncheck();
        await page
          .getByRole("button", { name: "Preset/Template Warna", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Midnight Ink", exact: true })
          .click();
        await page.getByRole("button", { name: "Header", exact: true }).click();
        await page.getByLabel("Wishlist", { exact: true }).uncheck();
        await expect(frame.getByTestId("header-wishlist")).toBeHidden();
        await page.getByLabel("Wishlist", { exact: true }).check();
        await page.getByLabel("Pencarian", { exact: true }).uncheck();
        await expect(frame.getByTestId("search-bar")).toHaveCount(0);
        await page.getByLabel("Pencarian", { exact: true }).check();
        await page
          .getByLabel("Layout header", { exact: true })
          .selectOption("compact");
        await expect(frame.locator("header")).toHaveAttribute(
          "data-layout",
          "compact",
        );
        await page
          .getByLabel("Layout header", { exact: true })
          .selectOption("classic");
        await page.getByLabel("Sticky header", {exact:true}).uncheck();
        await expect.poll(() => frame.locator("header").evaluate((e) => getComputedStyle(e).position)).toBe("relative");
        await page.getByLabel("Sticky header", {exact:true}).check();
        await expect.poll(() => frame.locator("header").evaluate((e) => getComputedStyle(e).position)).toBe("sticky");
        await page
          .getByRole("button", { name: "Navigasi", exact: true })
          .click();
        await page
          .getByLabel("Navigasi mobile", { exact: true })
          .selectOption("bar");
        await expect(frame.getByTestId("bottom-nav")).toHaveAttribute(
          "data-style",
          "bar",
        );
        await expect
          .poll(() =>
            frame
              .getByTestId("bottom-nav")
              .locator("a > span:last-child")
              .first()
              .evaluate((e) => getComputedStyle(e).opacity),
          )
          .toBe("1");
        const bar = await assertBorderless(frame, "bar layout");
        assert.equal(bar.radius, "0px");
        await page
          .getByLabel("Navigasi mobile", { exact: true })
          .selectOption("pill");
        page.off("request", track);
        assert.equal(
          logoReads,
          0,
          "Palette and layout edits reuse in-memory logo bytes",
        );
        await page
          .getByRole("button", { name: "Identitas Toko", exact: true })
          .click();
      },
    );
    await check(
      "customize: publish invalidates SSR and runtime colors",
      async () => {
        await page
          .getByRole("button", { name: "Terbitkan", exact: true })
          .click();
        await expect(page.getByRole("status")).toContainText(
          "published diperbarui",
        );
        const html = await (await anonymous.request.get(base + "/")).text();
        assert.ok(html.includes("--store-pageBg:#101827"));
        assert.ok(!html.includes("/api/v1/admin/store-branding/"));
        await visitor.reload();
        await assertBorderless(visitor, "published Midnight Ink");
        await expect(visitor.getByTestId("logo")).toHaveText(
          "Theme Studio Test",
        );
        assert.equal(
          await visitor
            .locator(".storefront-root")
            .evaluate((e) => getComputedStyle(e).backgroundColor),
          "rgb(16, 24, 39)",
        );
        const logo = visitor.getByTestId("logo").locator("img");
        await expect(logo).toBeVisible();
        const src = await logo.getAttribute("src");
        assert.ok(src);
        const logoUrl = new URL(src, base);
        assert.equal(logoUrl.origin, new URL(base).origin);
        assert.ok(
          logoUrl.pathname.startsWith("/api/v1/store-branding/"),
          `Public logo uses published asset endpoint: ${src}`,
        );
        assert.equal((await anonymous.request.get(logoUrl.href)).status(), 200);
        await visitor.route(logoUrl.href, (r) => r.abort());
        await visitor.reload();
        await expect(visitor.getByTestId("logo").locator("img")).toHaveCount(0);
        await expect(visitor.getByTestId("logo")).toHaveText(
          "Theme Studio Test",
        );
        await visitor.unroute(logoUrl.href);
        await visitor.reload();
        for (const width of [390, 1360]) {
          await visitor.setViewportSize({width, height: 900});
          await captureShell(visitor, visitor, artifactDir, `midnight-${width}`);
        }
        assert.equal(
          await page
            .locator(".admin-shell")
            .evaluate((e) =>
              getComputedStyle(e).getPropertyValue("--store-pageBg"),
            ),
          "",
        );
      },
    );
    await check(
      "customize: all required widths and desktop/mobile evidence",
      async () => {
        const preview = page.frameLocator('iframe[title="Preview draft toko"]');
        for (const width of [390, 768, 1360]) {
          await page
            .getByRole("button", { name: `${width}px`, exact: true })
            .click();
          await expect
            .poll(() =>
              preview
                .locator("body")
                .evaluate((e) => e.ownerDocument.defaultView!.innerWidth),
            )
            .toBe(width);
          assert.ok(
            await preview
              .locator("body")
              .evaluate(
                (e) =>
                  e.ownerDocument.documentElement.scrollWidth <=
                  e.ownerDocument.defaultView!.innerWidth,
              ),
          );
        }
        await page.screenshot({
          path: path.join(artifactDir, "customize-preview-1360.png"),
          fullPage: true,
        });
        await page.getByRole("button", { name: "390px", exact: true }).click();
        for (const width of [
          320, 360, 375, 390, 412, 430, 768, 1024, 1280, 1360, 1440, 1920,
        ]) {
          await visitor.setViewportSize({ width, height: 900 });
          await assertBorderless(visitor, `Midnight ${width}`);
          if (width < 768) {
            await expect(visitor.getByTestId("bottom-nav")).toBeVisible();
            await visitor.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
            const footer = await visitor.locator(".storefront-root > footer").boundingBox();
            const nav = await visitor.getByTestId("bottom-nav").boundingBox();
            assert.ok(footer && nav && footer.y + footer.height <= nav.y, `Footer clears floating nav ${width}`);
            for (const link of await visitor.getByTestId("bottom-nav").locator("a").all()) {
              const box = await link.boundingBox();
              assert.ok(box && box.width >= 44 && box.height >= 44, `Touch target ${width}`);
            }
            await visitor.evaluate(() => scrollTo(0, 0));
          } else await expect(visitor.getByTestId("bottom-nav")).toBeHidden();
          assert.ok(
            await visitor.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `Storefront overflow ${width}`,
          );
          await page.setViewportSize({ width, height: 900 });
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `Editor overflow ${width}`,
          );
          if (width === 390 || width === 1360) {
            await page
              .frameLocator('iframe[title="Preview draft toko"]')
              .locator("body")
              .evaluate((e) => e.ownerDocument.defaultView?.scrollTo(0, 0));
            await page.screenshot({
              path: path.join(artifactDir, `customize-editor-${width}.png`),
              fullPage: true,
            });
            await visitor.screenshot({
              path: path.join(artifactDir, `customize-storefront-${width}.png`),
              fullPage: true,
            });
          }
        }
        await page.setViewportSize({ width: 1360, height: 900 });
      },
    );
    await check(
      "customize: mobile touch switches preview and preserves four destinations",
      async () => {
        const mobile = await browser.newContext({
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
          reducedMotion: "reduce",
        });
        await mobile.addCookies(await admin.cookies());
        const touch = await mobile.newPage();
        try {
          await touch.goto(base + "/admin/customize");
          await touch.screenshot({
            path: path.join(artifactDir, "customize-editor-390.png"),
            fullPage: true,
          });
          await touch
            .getByRole("button", { name: "Lihat Preview", exact: true })
            .tap();
          const frame = touch.frameLocator(
            'iframe[title="Preview draft toko"]',
          );
          await expect(frame.getByTestId("logo")).toBeVisible();
          await expect(frame.getByTestId("logo")).toHaveText(
            "Theme Studio Test",
          );
          await expect
            .poll(() =>
              frame
                .getByTestId("logo")
                .evaluate((e) => getComputedStyle(e).color),
            )
            .toBe("rgb(255, 255, 255)");
          await expect(frame.getByTestId("bottom-nav")).toBeVisible();
          await expect(
            frame.getByTestId("bottom-nav").locator("a"),
          ).toHaveCount(4);
          assert.ok(
            await frame
              .locator("body")
              .evaluate(
                (e) =>
                  e.ownerDocument.documentElement.scrollWidth <=
                  e.ownerDocument.defaultView!.innerWidth,
              ),
          );
          await touch.screenshot({
            path: path.join(artifactDir, "customize-preview-390.png"),
            fullPage: true,
          });
        } finally {
          await mobile.close();
        }
      },
    );
    await check(
      "customize: two tab version conflict cannot overwrite",
      async () => {
        const other = await admin.newPage();
        try {
          await other.goto(base + "/admin/customize");
          await other
            .getByLabel("Nama toko", { exact: true })
            .fill("Other tab");
          await page.getByLabel("Nama toko", { exact: true }).fill("First tab");
          await page
            .getByRole("button", { name: "Simpan Draft", exact: true })
            .click();
          await expect(page.getByRole("status")).toContainText(
            "Draft tersimpan",
          );
          await other
            .getByRole("button", { name: "Simpan Draft", exact: true })
            .click();
          await expect(
            other
              .getByRole("alert")
              .filter({ hasText: "Draft atau published berubah" }),
          ).toContainText("tab/admin lain");
          assert.equal(
            parseAppearance(
              (
                await db.storeAppearance.findUniqueOrThrow({
                  where: { key: "primary" },
                })
              ).draft,
            ).identity.name,
            "First tab",
          );
          const state = await db.storeAppearance.findUniqueOrThrow({
            where: { key: "primary" },
          });
          const stale = await admin.request.post(
            base + "/api/v1/admin/store-appearance",
            {
              headers: { Origin: base },
              data: {
                kind: "save",
                draftVersion: state.draftVersion - 1,
                publishedVersion: state.publishedVersion,
                config: state.draft,
              },
            },
          );
          assert.equal(
            stale.status(),
            409,
            "HTTP clients receive the same optimistic conflict",
          );
        } finally {
          await other.close();
        }
      },
    );
    await check(
      "customize: rollback is append-only and leaves draft private",
      async () => {
        await page
          .getByRole("button", { name: "Riwayat", exact: true })
          .click();
        const baseline = page
          .locator("div.rounded-xl.border.p-3")
          .filter({ hasText: "Revisi 0" });
        await baseline
          .getByRole("button", { name: "Rollback", exact: true })
          .click();
        await expect(page.getByRole("status")).toContainText(
          "published diperbarui",
        );
        await visitor.reload();
        await expect(visitor.getByTestId("logo")).toHaveText("Gheverhan");
        assert.equal(
          await visitor
            .locator(".storefront-root")
            .getAttribute("data-theme-active"),
          "false",
        );
        assert.equal(await db.storeAppearanceRevision.count(), 3);
      },
    );
    await check("customize: no editor runtime exceptions", async () => {
      assert.deepEqual(errors, []);
    });
    await check("customize: shell shadow preferences and published Monochrome", async () => {
      await page.getByRole("button", {name: "Preset/Template Warna", exact: true}).click();
      await page.getByRole("button", {name: "Gheverhan Monochrome", exact: true}).click();
      const frame = page.frameLocator('iframe[title="Preview draft toko"]');
      await page.getByRole("button", {name: "Tombol/Kartu", exact: true}).click();
      for (const shadow of ["none", "soft", "raised"]) {
        await page.getByLabel("Bayangan", {exact:true}).selectOption(shadow);
        if (shadow === "none") {
          await expect.poll(() => frame.getByTestId("bottom-nav").evaluate((e) => getComputedStyle(e).boxShadow)).toBe("none");
        } else {
          await expect.poll(() => frame.getByTestId("bottom-nav").evaluate((e) => getComputedStyle(e).boxShadow)).toContain(shadow === "soft" ? "34px" : "40px");
        }
        await assertBorderless(frame, `shadow ${shadow}`);
      }
      await page.getByLabel("Bayangan", {exact:true}).selectOption("soft");
      await page.getByRole("button", {name: "Simpan Draft", exact: true}).click();
      await expect(page.getByRole("status")).toContainText("Draft tersimpan");
      await page.getByRole("button", {name: "Terbitkan", exact: true}).click();
      await expect(page.getByRole("status")).toContainText("published diperbarui");
      await visitor.reload();
      await expect(visitor.locator(".storefront-root")).toHaveAttribute("data-theme-active", "true");
      for (const width of [390, 1360]) {
        await visitor.setViewportSize({width, height: 900});
        await captureShell(visitor, visitor, artifactDir, `monochrome-${width}`);
        await assertBorderless(visitor, `published Monochrome ${width}`);
      }
    });
  } catch (error) {
    const diagnostics = await page
      .frameLocator('iframe[title="Preview draft toko"]')
      .locator("body")
      .evaluate((body) => ({
        rootStyle: body
          .querySelector(".storefront-root")
          ?.getAttribute("style"),
        buttons: Array.from(body.querySelectorAll("button")).map((button) => ({
          text: button.textContent,
          html: button.outerHTML,
          hover: button.matches(":hover"),
          disabled: button.disabled,
          background: getComputedStyle(button).background,
          backgroundImage: getComputedStyle(button).backgroundImage,
          color: getComputedStyle(button).color,
        })),
      }))
      .catch(() => ({ unavailable: true }));
    await writeFile(
      path.join(artifactDir, "customize-failure.json"),
      JSON.stringify(diagnostics, null, 2),
    );
    await page
      .screenshot({
        path: path.join(artifactDir, "customize-failure.png"),
        fullPage: true,
      })
      .catch(() => {});
    throw error;
  } finally {
    await page.close();
    await visitor.close();
  }
}
