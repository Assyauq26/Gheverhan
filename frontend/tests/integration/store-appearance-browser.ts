import { PRESETS } from "../../src/modules/appearance/presets";
import { rgb } from "../../src/modules/appearance/contrast";
import sharp from "sharp";
import { parseAppearance } from "../../src/modules/appearance/schema";
import assert from "node:assert/strict";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { expect, type Browser, type BrowserContext } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
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
            .evaluate((card) => {
              const root = card.closest(".storefront-root")!;
              const media = card.querySelector(".rounded-xl")!;
              const search = root.querySelector('[data-testid="search-input"]')!;
              const cardStyle = getComputedStyle(card);
              const searchStyle = getComputedStyle(search);
              const channels = (value: string) =>
                (value.match(/\\d+/g) || []).slice(0, 3).map(Number);
              const largestDifference = (left: string, right: string) =>
                Math.max(
                  ...channels(left).map(
                    (channel, index) =>
                      Math.abs(channel - channels(right)[index]),
                  ),
                );
              return {
                radius: cardStyle.borderRadius,
                mediaRadius: getComputedStyle(media).borderRadius,
                cardBorderDifference: largestDifference(
                  cardStyle.borderColor,
                  cardStyle.backgroundColor,
                ),
                searchBorderDifference: largestDifference(
                  searchStyle.borderColor,
                  searchStyle.backgroundColor,
                ),
              };
            });
          assert.equal(visual.radius, "16px", preset.name);
          assert.equal(visual.mediaRadius, "12px", preset.name);
          assert.ok(visual.cardBorderDifference < 48, preset.name);
          assert.ok(visual.searchBorderDifference < 48, preset.name);
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
        let logoReads = 0;
        const track = (request: { url(): string; method(): string }) => {
          if (
            request.method() === "GET" &&
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
        await page
          .getByRole("group", { name: "header", exact: true })
          .getByLabel("Aktifkan", { exact: true })
          .uncheck();
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
          320, 360, 375, 390, 430, 768, 1024, 1280, 1360, 1440, 1920,
        ]) {
          await visitor.setViewportSize({ width, height: 900 });
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
