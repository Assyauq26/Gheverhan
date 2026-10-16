import { describe, expect, it } from "vitest";
import { voucherInputSchema, flashSaleInputSchema } from "@/modules/promotions/marketing.validation";

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
