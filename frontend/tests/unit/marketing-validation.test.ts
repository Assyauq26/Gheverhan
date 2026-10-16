import { describe, expect, it } from "vitest";
import { voucherInputSchema, flashSaleInputSchema, scheduledFlashSaleSchema } from "@/modules/promotions/marketing.validation";
import { activeScheduledFlashPrice, effectiveProductPrice } from "@/modules/promotions/scheduled-flash-sale";

const voucher = () => ({
  code: "GHEVER10", discountType: "PERCENT" as const,
  discountValue: 10, minSpend: 150000, maxDiscount: 25000,
  expiresAt: null, isActive: true,
});

describe("Marketing voucher input", () => {
  it("normalizes coupon codes and validates percentage and Rupiah", () => {
    expect(voucherInputSchema.parse({ ...voucher(), code: " ghever10 " }).code).toBe("GHEVER10");
    for (const discountValue of [0, -1, 1.2, 101, 2147483648, Infinity])
      expect(voucherInputSchema.safeParse({ ...voucher(), discountValue }).success).toBe(false);
    for (const code of ["A", "Hello world", "abc<script>", "../promo", "x".repeat(33)])
      expect(voucherInputSchema.safeParse({ ...voucher(), code }).success).toBe(false);
  });
  it("accepts valid fixed vouchers but rejects negative spend and empty caps", () => {
    expect(voucherInputSchema.safeParse({ ...voucher(), discountType: "FIXED", discountValue: 35000 }).success).toBe(true);
    expect(voucherInputSchema.safeParse({ ...voucher(), minSpend: -1 }).success).toBe(false);
    expect(voucherInputSchema.safeParse({ ...voucher(), maxDiscount: 0 }).success).toBe(false);
  });
  it("validates startsAt and usage limits", () => {
    expect(voucherInputSchema.safeParse({ ...voucher(), usageLimit: 1, perUserLimit: 1 }).success).toBe(true);
    for (const limit of [0, -1, 1.2, 1_000_001, Infinity]) {
      expect(voucherInputSchema.safeParse({ ...voucher(), usageLimit: limit }).success).toBe(false);
      expect(voucherInputSchema.safeParse({ ...voucher(), perUserLimit: limit }).success).toBe(false);
    }
    expect(voucherInputSchema.safeParse({
      ...voucher(), startsAt: "2030-01-02T00:00:00.000Z", expiresAt: "2030-01-01T00:00:00.000Z",
    }).success).toBe(false);
    expect(voucherInputSchema.safeParse({
      ...voucher(), startsAt: "2030-01-01T00:00:00.000Z", expiresAt: "2030-01-02T00:00:00.000Z",
    }).success).toBe(true);
  });
  it("prevents creating an already-expired active coupon", () => {
    expect(voucherInputSchema.safeParse({ ...voucher(), expiresAt: "2020-01-01T00:00:00.000Z" }).success).toBe(false);
    expect(voucherInputSchema.safeParse({ ...voucher(), expiresAt: "2020-01-01T00:00:00.000Z", isActive: false }).success).toBe(true);
  });
});
describe("Flash sale input", () => {
  const input = { productId: "p1", expectedUpdatedAt: new Date().toISOString(), enabled: true, salePrice: 90000 };
  it("requires an actual discounted integer price to enable", () => {
    expect(flashSaleInputSchema.safeParse(input).success).toBe(true);
    expect(flashSaleInputSchema.safeParse({ ...input, salePrice: null }).success).toBe(false);
    expect(flashSaleInputSchema.safeParse({ ...input, salePrice: 0 }).success).toBe(false);
    expect(flashSaleInputSchema.safeParse({ ...input, salePrice: 1.5 }).success).toBe(false);
    expect(flashSaleInputSchema.safeParse({ ...input, expectedUpdatedAt: "invalid" }).success).toBe(false);
  });
  it("accepts disabling the flash sale without a sale price", () => {
    expect(flashSaleInputSchema.safeParse({ ...input, enabled: false, salePrice: null }).success).toBe(true);
  });
});

describe("Scheduled flash sales", () => {
  const startsAt = new Date(Date.now() - 60_000).toISOString();
  const endsAt = new Date(Date.now() + 60_000).toISOString();
  const request = { productId: "p1", expectedUpdatedAt: new Date().toISOString(), enabled: true,
    price: 70000, startsAt, endsAt };
  it("validates time windows and required sale price", () => {
    expect(scheduledFlashSaleSchema.safeParse(request).success).toBe(true);
    expect(scheduledFlashSaleSchema.safeParse({ ...request, startsAt: endsAt, endsAt: startsAt }).success).toBe(false);
    expect(scheduledFlashSaleSchema.safeParse({ ...request, price: 0 }).success).toBe(false);
    expect(scheduledFlashSaleSchema.safeParse({ ...request, price: null }).success).toBe(false);
    expect(scheduledFlashSaleSchema.safeParse({ ...request, endsAt: "2020-01-01T00:00:00.000Z" }).success).toBe(false);
    expect(scheduledFlashSaleSchema.safeParse({ ...request, enabled: false, price: null, startsAt: null, endsAt: null }).success).toBe(true);
  });
  it("shows scheduled price only in inclusive/exclusive UTC window", () => {
    const fields = { basePrice: 150000, salePrice: null,
      flashSalePrice: 90000, flashSaleStartsAt: new Date("2030-01-01T12:00:00Z"),
      flashSaleEndsAt: new Date("2030-01-01T13:00:00Z") };
    expect(effectiveProductPrice(fields, new Date("2030-01-01T11:59:59Z"))).toBe(150000);
    expect(effectiveProductPrice(fields, new Date("2030-01-01T12:00:00Z"))).toBe(90000);
    expect(effectiveProductPrice(fields, new Date("2030-01-01T12:59:59Z"))).toBe(90000);
    expect(effectiveProductPrice(fields, new Date("2030-01-01T13:00:00Z"))).toBe(150000);
    expect(activeScheduledFlashPrice({ ...fields, flashSalePrice: 155000 }, new Date("2030-01-01T12:30:00Z"))).toBeNull();
  });
});
