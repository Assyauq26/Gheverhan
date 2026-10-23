import { describe, expect, it } from "vitest";
import { storageAuthHeaders } from "@/lib/storage-auth-headers";

describe("Supabase Storage API key family compatibility", () => {
  const legacy = "legacy-test-value";
  const modern = ["sb", "secret", "synthetic"].join("_");

  it("retains both headers for legacy service_role", () => {
    expect(storageAuthHeaders(legacy)).toEqual({
      apikey: legacy,
      Authorization: `Bearer ${legacy}`,
    });
  });
  it("never sends an opaque secret as a bearer token", () => {
    const result = storageAuthHeaders(modern);
    expect(result).toEqual({ apikey: modern });
    expect(result).not.toHaveProperty("Authorization");
  });
  it("rejects publishable keys and absent privileged credentials", () => {
    const publishable = ["sb", "publishable", "synthetic"].join("_");
    expect(() => storageAuthHeaders(publishable)).toThrow(/not configured/);
    expect(() => storageAuthHeaders("")).toThrow(/not configured/);
  });
  it("does not disclose supplied credential material in errors", () => {
    const key = ["sb", "publishable", "sensitive-test-fixture"].join("_");
    try { storageAuthHeaders(key); }
    catch (error) {
      expect(String(error)).not.toContain(key);
      expect(String(error)).toMatch(/not configured/);
    }
  });
});
