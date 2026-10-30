import assert from "node:assert/strict";
import type { APIRequestContext, Page } from "@playwright/test";
export const testAddress = {
  recipientName: "Synthetic Buyer", phone: "0800000000", line: "Disposable test address",
  provinceCode: "31", province: "Daerah Khusus Ibukota Jakarta", cityCode: "31.71", city: "Kota Administrasi Jakarta Pusat",
  districtCode: "31.71.01", district: "Gambir", villageCode: "31.71.01.1001", village: "Gambir", postalCode: "10110",
};
/** Sample rates are confined to guarded, disposable tests; no production default exists. */
export function configureTestJnt() {
  assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
  const db = new URL(process.env.SPRINT1_TEST_DATABASE_URL!);
  assert.ok(["127.0.0.1", "localhost"].includes(db.hostname));
  assert.equal(db.pathname, "/gheverhan_sprint1_test");
  process.env.REGION_DATA_MODE = "snapshot";
  process.env.SHIPPING_PROVIDER = "manual";
  process.env.JWT_SECRET ||= "isolated-test-quote-secret-not-for-production";
  process.env.JNT_MANUAL_RATE_CONFIG = JSON.stringify({
    origin: { ...Object.fromEntries(Object.entries(testAddress).filter(([key]) => key.endsWith("Code"))), warehouseId: "dummy-only", street: "Disposable test warehouse" },
    rates: [ ["EZ", 20000], ["JND", 22000] ].map(([service, cost]) => ({ service, cost, destinationVillageCode: testAddress.villageCode, minWeightGram: 1, maxWeightGram: 1000000, reference: "SYNTHETIC-TEST-ONLY", approvedBy: "Disposable test fixture", validUntil: "2099-01-01T00:00:00.000Z" })),
  });
}
export async function shippingConfirmation(userId: string, intentId?: string) {
  const { previewCheckout } = await import("../../src/modules/checkout/checkout.service");
  const available = await previewCheckout(userId, { intentId, address: testAddress });
  const shipping = available.shippingRates[0]; assert.ok(shipping, "Fixture must produce a valid server quote");
  const quote = await previewCheckout(userId, { intentId, address: testAddress, shipping });
  return { address: testAddress, shipping, expectedQuote: { subtotal: quote.subtotal, shippingCost: quote.shippingCost, discount: quote.discount, total: quote.total } };
}
export async function apiShipping(request: APIRequestContext, base: string, extra: { intentId?: string; couponCode?: string } = {}) {
  const initial = await request.post(`${base}/api/v1/checkout/preview`, { data: { ...extra, address: testAddress } });
  assert.equal(initial.status(), 200);
  const shipping = (await initial.json()).data.shippingRates[0]; assert.ok(shipping);
  const result = await request.post(`${base}/api/v1/checkout/preview`, { data: { ...extra, address: testAddress, shipping: { ...shipping, cost: 0 } } });
  assert.equal(result.status(), 200);
  return { shipping, quote: (await result.json()).data, address: testAddress };
}
export async function chooseTestLocation(page: Page, fillRecipient = true, selectService = true) {
  await page.getByTestId("select-location").click();
  const dialog = page.getByTestId("region-dialog");
  // Reopening an existing valid selection offers confirmation immediately.
  if (!(await dialog.getByRole("button", { name: "Gunakan lokasi ini", exact: true }).count())) {
    for (const name of ["Daerah Khusus Ibukota Jakarta", "Kota Administrasi Jakarta Pusat", "Gambir", "Gambir"]) {
      await dialog.getByRole("button", { name, exact: true }).click();
    }
  }
  await dialog.getByRole("button", { name: "Gunakan lokasi ini", exact: true }).click();
  if (selectService) await page.getByTestId("ship-option-0").click();
  if (fillRecipient) {
    await page.getByTestId("input-recipient").fill(testAddress.recipientName);
    await page.getByTestId("input-phone").fill(testAddress.phone);
    await page.getByTestId("input-line").fill(testAddress.line);
  }
}
