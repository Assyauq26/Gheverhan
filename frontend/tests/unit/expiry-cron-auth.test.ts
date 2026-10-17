import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const expiry = vi.hoisted(() => vi.fn());
vi.mock("@/modules/orders/orders.service", () => ({ expireStaleOrders: expiry }));
import { GET } from "@/app/api/internal/cron/expire-orders/route";
beforeEach(() => { vi.clearAllMocks(); expiry.mockResolvedValue(2); });
afterEach(() => vi.unstubAllEnvs());
describe("expiry cron authentication", () => {
  it("fails closed before querying orders when the secret is absent", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(new Request("https://example.test/api/internal/cron/expire-orders"))).status).toBe(503);
    expect(expiry).not.toHaveBeenCalled();
  });
  it.each(["", "Bearer wrong", `Bearer ${"x".repeat(32)}`])("denies an invalid bearer %# before mutations", async authorization => {
    vi.stubEnv("CRON_SECRET", "disposable-cron-secret-fixture-32");
    expect((await GET(new Request("https://example.test/api/internal/cron/expire-orders", { headers: { authorization } }))).status).toBe(401);
    expect(expiry).not.toHaveBeenCalled();
  });
  it("uses system eligibility and returns the bounded batch result", async () => {
    vi.stubEnv("CRON_SECRET", "disposable-cron-secret-fixture-32");
    const result = await GET(new Request("https://example.test/api/internal/cron/expire-orders", { headers: { authorization: "Bearer disposable-cron-secret-fixture-32" } }));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ success: true, data: { expired: 2, maxBatch: 50 } });
    expect(expiry).toHaveBeenCalledWith("system");
  });
});
