/** Compare identical synthetic fixtures across a detached main server and feature server.
 * Run only after seeding a dedicated disposable database; do not run commerce suites concurrently.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { signSession } from "../../src/lib/auth/jwt";
const target = new URL(
  process.env.SPRINT1_TEST_DATABASE_URL || "http://invalid",
);
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
assert.equal(target.pathname, "/gheverhan_sprint1_test");
assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
const bases = [
  process.env.APPEARANCE_BASELINE_URL || "http://localhost:3110",
  process.env.APPEARANCE_FEATURE_URL || "http://localhost:3111",
];
for (const base of bases) {
  const u = new URL(base);
  assert.ok(["localhost", "127.0.0.1"].includes(u.hostname));
  assert.equal(u.protocol, "http:");
  assert.equal(u.username, "");
  assert.equal(u.password, "");
}
const db = new PrismaClient({
  datasources: { db: { url: target.toString() } },
});
async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    assert.equal(
      await db.storeAppearance.count(),
      0,
      "Baseline must have no appearance record",
    );
    const product = await db.product.findFirstOrThrow({
        where: { status: "PUBLISHED" },
        orderBy: { slug: "asc" },
      }),
      customer = await db.user.findUniqueOrThrow({
        where: { email: "budi@example.com" },
      });
    const variant = await db.productVariant.findFirstOrThrow({
      where: { productId: product.id },
    });
    const cart = await db.cart.upsert({
      where: { userId: customer.id },
      create: { userId: customer.id },
      update: {},
    });
    await db.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
      create: { cartId: cart.id, variantId: variant.id, quantity: 1 },
      update: { quantity: 1 },
    });
    const token = await signSession({
      sub: customer.id,
      email: customer.email,
      version: customer.sessionVersion,
    });
    const image = await sharp({
      create: { width: 900, height: 900, channels: 3, background: "#d8d4cf" },
    })
      .png()
      .toBuffer();
    const folder = path.resolve(
      process.env.SPRINT1_ARTIFACT_DIR ||
        "../docs/storefront-customize/evidence",
    );
    await mkdir(folder, { recursive: true });
    const results = [];
    for (const width of [390, 1360]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      });
      for (const base of bases)
        await context.addCookies([
          {
            name: "gh_session",
            value: token,
            url: base,
            httpOnly: true,
            sameSite: "Lax",
          },
        ]);
      await context.route("**/_next/image?**", (r) =>
        r.fulfill({ status: 200, contentType: "image/png", body: image }),
      );
      for (const [label, route] of [
        ["home", "/"],
        ["shop", "/shop"],
        ["pdp", "/product/" + product.slug],
        ["cart", "/cart"],
        ["account", "/account"],
        ["checkout", "/checkout"],
      ]) {
        for (const [index, kind] of ["before", "after"].entries()) {
          const page = await context.newPage();
          await page.goto(bases[index] + route, {
            waitUntil: "networkidle",
            timeout: 90000,
          });
          assert.ok(
            !new URL(page.url()).pathname.startsWith("/login"),
            "Authenticated fixture required",
          );
          await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.race([
              new Promise((r) => setTimeout(r, 2000)),
              Promise.all(
                Array.from(document.images)
                  .filter((i) => {
                    const b = i.getBoundingClientRect();
                    return (
                      b.top < innerHeight && b.left < innerWidth && b.right > 0
                    );
                  })
                  .map((i) => i.decode().catch(() => {})),
              ),
            ]);
          });
          await page.addStyleTag({
            content: "nextjs-portal{display:none!important}",
          });
          await page.screenshot({
            path: path.join(folder, `${kind}-${label}-${width}.png`),
            animations: "disabled",
          });
          await page.close();
        }
        const a = await sharp(path.join(folder, `before-${label}-${width}.png`))
            .raw()
            .toBuffer(),
          b = await sharp(path.join(folder, `after-${label}-${width}.png`))
            .raw()
            .toBuffer();
        assert.equal(a.length, b.length);
        let changedChannels = 0,
          maxChannelDelta = 0,
          channelsWithDeltaAbove2 = 0;
        for (let i = 0; i < a.length; i++) {
          const delta = Math.abs(a[i] - b[i]);
          if (delta) changedChannels++;
          maxChannelDelta = Math.max(maxChannelDelta, delta);
          if (delta > 2) channelsWithDeltaAbove2++;
        }
        results.push({
          page: label,
          width,
          changedChannels,
          totalChannels: a.length,
          ratio: changedChannels / a.length,
          maxChannelDelta,
          channelsWithDeltaAbove2,
        });
      }
      await context.close();
    }
    await writeFile(
      path.join(folder, "baseline-comparison.json"),
      JSON.stringify(results, null, 2) + "\n",
    );
    console.log(
      JSON.stringify({
        captures: results.length,
        exact: results.filter((r) => !r.changedChannels).length,
        maxChannelDelta: Math.max(...results.map((r) => r.maxChannelDelta)),
        synthetic: true,
      }),
    );
  } finally {
    await browser.close();
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : "Baseline capture failed; inspect isolated fixture and local servers",
  );
  process.exitCode = 1;
});
