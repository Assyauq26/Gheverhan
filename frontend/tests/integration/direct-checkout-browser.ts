/** Runs against the product-browser loopback server and dummy provider adapters only. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import path from "node:path";
import { expect, type Browser } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

export async function verifyDirectCheckout(browser: Browser, db: PrismaClient, base: string, artifactDir: string, errors: string[]) {
  assert.equal(new URL(base).hostname, "localhost");
  const suffix = randomUUID(), password = `Dummy-only-${randomUUID()}`;
  const buyer = await db.user.create({ data: { name: "Direct checkout dummy", email: `buy-now-${suffix}@example.test`, passwordHash: await bcrypt.hash(password, 12), customer: { create: { fullName: "Dummy" } } } });
  const create = (kind: string, price: number) => db.product.create({ data: { name: `Dummy ${kind} ${suffix}`, slug: `direct-${kind}-${suffix}`, status: "PUBLISHED", basePrice: price, variants: { create: { sku: `DIRECT-${kind}-${suffix}`, inventory: { create: { onHand: 10 } } } } }, include: { variants: true } });
  const old = await create("cart", 71000), selected = await create("legacy", 130000);
  const custom = await create("custom", 90000);
  const groupId = `g${randomUUID().replaceAll("-", "")}`, valueId = `v${randomUUID().replaceAll("-", "")}`;
  await db.$transaction(async tx => {
    await tx.productOptionGroup.create({ data: { id: groupId, productId: custom.id, name: "Motif", normalizedName: "motif", sortOrder: 0 } });
    await tx.productOptionValue.create({ data: { id: valueId, productId: custom.id, groupId, value: "Polos", normalizedValue: "polos", sortOrder: 0 } });
    await tx.productVariant.update({ where: { id: custom.variants[0].id }, data: { combinationKey: valueId, price: 99000 } });
    await tx.productVariantOptionValue.create({ data: { variantId: custom.variants[0].id, productId: custom.id, groupId, valueId } });
    await tx.product.update({ where: { id: custom.id }, data: { optionsEnabled: true } });
  });
  await db.cart.create({ data: { userId: buyer.id, items: { create: { variantId: old.variants[0].id, quantity: 3 } } } });
  await db.bankAccount.create({ data: { bankName: "Dummy", accountNumber: "00000", accountHolder: "Dummy", displayName: "Direct checkout dummy" } });
  const before = await db.cartItem.findMany({ where: { cart: { userId: buyer.id } } });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.addInitScript(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
    await page.goto(`${base}/product/${selected.slug}`);
    await page.getByTestId("share-btn").click();
    await expect(page.getByTestId("share-btn")).toHaveAttribute("aria-label", "Tautan produk tersalin");
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${base}/product/${selected.slug}`);
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new DOMException("Dummy denied", "NotAllowedError"); } }, configurable: true }));
    await page.getByTestId("share-btn").click();
    await expect(page.getByRole("status").filter({ hasText: "Gunakan menu Bagikan" })).toBeVisible();
    await expect(page.getByTestId("share-btn")).toHaveAttribute("aria-label", "Bagikan produk");
    await page.reload();
    await page.getByTestId("qty-plus").click();
    await page.getByTestId("buy-now-btn").click();
    await expect(page).toHaveURL(/\/login\?redirectTo=/);
    const continuation = new URL(page.url()).searchParams.get("redirectTo")!;
    assert.match(continuation, /^\/checkout\?intent=[a-f0-9-]{36}$/);
    const intentId = new URL(continuation, base).searchParams.get("intent")!;
    const guest = await db.checkoutIntent.findUniqueOrThrow({ where: { id: intentId } });
    assert.equal(guest.userId, null); assert.equal(guest.quantity, 2);
    assert.ok((await context.cookies()).find(cookie => cookie.name === "gh_buy_now")?.httpOnly);
    assert.equal(await db.order.count({ where: { userId: buyer.id } }), 0);
    await page.getByTestId("login-identifier").fill(buyer.email);
    await page.getByTestId("login-password").fill(password);
    await page.getByTestId("login-form").getByRole("button", { name: "Masuk", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/checkout\\?intent=${intentId}$`));
    await expect(page.getByTestId("direct-checkout-summary")).toContainText(selected.name);
    await expect(page.getByTestId("checkout-total")).toHaveText("Rp 280.000");
    assert.equal((await db.checkoutIntent.findUniqueOrThrow({ where: { id: intentId } })).userId, buyer.id);
    await page.reload();
    await expect(page.getByTestId("checkout-total")).toHaveText("Rp 280.000");
    assert.equal(await page.getByTestId("direct-checkout-summary").textContent().then(text => text?.includes(old.name)), false);
    await page.screenshot({ path: path.join(artifactDir, "product-direct-checkout-390.png"), fullPage: true });
    const confirm = async () => {
      for (const [name, value] of Object.entries({ recipientName: "Dummy Buyer", phone: "0800000000", line: "Dummy address", city: "Test", province: "Test", postalCode: "00000" })) await page.locator(`input[name="${name}"]`).fill(value);
      await expect(page.getByTestId("place-order-btn")).toBeEnabled();
      await page.getByTestId("place-order-btn").click();
      await expect(page).toHaveURL(/\/checkout\/payment\//);
      return page.url().split("/").pop()!;
    };
    const legacyOrder = await confirm();
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId: legacyOrder } });
    assert.equal(item.variantId, selected.variants[0].id); assert.equal(item.quantity, 2);
    assert.deepEqual(await db.cartItem.findMany({ where: { cart: { userId: buyer.id } } }), before);
    await page.goto(`${base}/product/${custom.slug}`);
    await expect(page.getByTestId("selected-sku")).toContainText(custom.variants[0].sku);
    await page.getByTestId("buy-now-btn").click();
    await expect(page).toHaveURL(/\/checkout\?intent=/);
    await expect(page.getByTestId("direct-checkout-summary")).toContainText("Motif: Polos × 1");
    await expect(page.getByTestId("checkout-total")).toHaveText("Rp 119.000");
    const customOrder = await confirm();
    const customItem = await db.orderItem.findFirstOrThrow({ where: { orderId: customOrder } });
    assert.equal(customItem.variantId, custom.variants[0].id); assert.equal(customItem.variantLabel, "Motif: Polos");
    assert.equal(customItem.quantity, 1); assert.equal(customItem.unitPrice, 99000);
    assert.deepEqual(await db.cartItem.findMany({ where: { cart: { userId: buyer.id } } }), before);
    await page.goto(`${base}/checkout?intent=${randomUUID()}`);
    await expect(page.getByRole("alert").filter({ hasText: "Checkout tidak tersedia" })).toBeVisible();
    await page.goto(`${base}/checkout`);
    await expect(page.getByTestId("direct-checkout-summary")).toHaveCount(0);
    await expect(page.getByTestId("checkout-total")).toHaveText("Rp 233.000");
  } finally {
    await context.close();
    await db.product.updateMany({ where: { id: { in: [old.id, selected.id, custom.id] } }, data: { status: "ARCHIVED" } });
  }
}
