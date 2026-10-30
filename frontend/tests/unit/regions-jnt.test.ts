import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { normalizeRegionList, fetchRegions } from "@/modules/regions/region-provider";
import { getRegions, validateLocation } from "@/modules/regions/region.service";
import { locationSchema } from "@/modules/regions/region.validation";
import { ManualShippingProvider } from "@/infrastructure/shipping/manual/manual-shipping-provider";
import { JntProvider } from "@/infrastructure/shipping/jnt/jnt-provider";
import { issueShippingQuote, verifyShippingQuote } from "@/modules/checkout/shipping-quote";
const codes = { provinceCode: "31", cityCode: "31.71", districtCode: "31.71.01", villageCode: "31.71.01.1001", postalCode: "10110" };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("Indonesia regions v2 adapter", () => {
  const response = { data: [{ id: "31.71.01.1001", name: "Gambir", postal_code: "10110" }], meta: { level: 4, updated_at: "2026-10-25" } };
  it("normalizes provider envelope and preserves source/version/postcode", () => {
    expect(normalizeRegionList(response, "villages", "31.71.01")).toMatchObject({ data: [{ code: codes.villageCode, name: "Gambir", postalCode: "10110" }], updatedAt: "2026-10-25" });
  });
  it("rejects v1 IDs, invalid parent, level, duplicate ID and invalid JSON", () => {
    expect(() => normalizeRegionList([{ id: "317101" }], "villages", "31.71.01")).toThrow();
    expect(() => normalizeRegionList(response, "villages", "32.71.01")).toThrow();
    expect(() => normalizeRegionList(response, "districts", "31.71")).toThrow();
    expect(() => normalizeRegionList({ ...response, data: [...response.data, ...response.data] }, "villages", "31.71.01")).toThrow();
    expect(locationSchema.safeParse({ ...codes, cityCode: "3171" }).success).toBe(false);
  });
  it("bounds provider failures to one retry with timeout signals", async () => {
    const mock = vi.fn().mockRejectedValue(new Error("timeout")); vi.stubGlobal("fetch", mock);
    await expect(fetchRegions("provinces")).rejects.toThrow("timeout");
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it("uses bundled full snapshot during downtime and validates exact hierarchy/postcode", async () => {
    vi.stubEnv("REGION_DATA_MODE", "snapshot");
    expect((await getRegions("provinces")).data).toHaveLength(38);
    expect(await validateLocation(codes)).toMatchObject({ village: "Gambir", district: "Gambir", ...codes });
    await expect(validateLocation({ ...codes, cityCode: "32.71" })).rejects.toThrow();
    await expect(validateLocation({ ...codes, postalCode: "99999" })).rejects.toThrow();
    await expect(getRegions("districts", "../../secrets")).rejects.toThrow();
  });
});
describe("J&T configured services and quote integrity", () => {
  const inquiry = { destination: { ...codes, province: "DKI Jakarta", city: "Jakarta Pusat", district: "Gambir", village: "Gambir" }, weightGram: 500, packages: [] };
  it("has no dummy default tariff and official integration never invents a mapping", async () => {
    vi.stubEnv("JNT_MANUAL_RATE_CONFIG", ""); vi.stubEnv("JNT_OFFICIAL_AREA_MAPPING", "");
    expect(await new ManualShippingProvider().getRates(inquiry)).toEqual([]);
    await expect(new JntProvider().getRates(inquiry)).rejects.toThrow(/mapping resmi/);
  });
  it("serves only approved unexpired exact village/weight rules; other services are absent", async () => {
    vi.stubEnv("REGION_DATA_MODE", "snapshot");
    vi.stubEnv("JNT_MANUAL_RATE_CONFIG", JSON.stringify({ origin: { ...codes, warehouseId: "test", street: "Dummy warehouse" }, rates: [{ destinationVillageCode: codes.villageCode, minWeightGram: 1, maxWeightGram: 1000, service: "EZ", cost: 12345, approvedBy: "Test only", reference: "TEST-ONLY", validUntil: "2099-01-01T00:00:00.000Z" }] }));
    const provider = new ManualShippingProvider();
    expect(await provider.getRates(inquiry)).toMatchObject([{ courier: "J&T Express", service: "EZ", cost: 12345, mode: "manual" }]);
    expect(await provider.getRates({ ...inquiry, weightGram: 1001 })).toEqual([]);
    expect(await provider.getRates({ ...inquiry, destination: { ...inquiry.destination, villageCode: "31.71.01.1002" } })).toEqual([]);
  });
  it("binds quote to customer/route/cart/weight/config and rejects tampering/expiry/price changes", () => {
    vi.stubEnv("JWT_SECRET", "isolated-test-secret-with-at-least-32-chars");
    const rate = { courier: "J&T Express", service: "EZ", cost: 20000 };
    const quote = issueShippingQuote("fingerprint", rate);
    expect(verifyShippingQuote(quote.quoteToken, "fingerprint", rate).cost).toBe(20000);
    for (const [token, fingerprint, value] of [[quote.quoteToken + "tamper", "fingerprint", rate], [quote.quoteToken, "changed-route", rate], [quote.quoteToken, "fingerprint", { ...rate, cost: 1 }]] as const) expect(() => verifyShippingQuote(token, fingerprint, value)).toThrow();
    vi.useFakeTimers(); vi.setSystemTime(quote.expiresAt + 1);
    expect(() => verifyShippingQuote(quote.quoteToken, "fingerprint", rate)).toThrow(/kedaluwarsa/);
  });
});
