import { afterEach, expect, it, vi } from "vitest";
import { verifyPrivateProductBucket } from "../../scripts/release/storage-preflight";
const env = {
  R21_EXPECTED_SUPABASE_REF: "abcdefghijklmnopqrst",
  SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "dummy-never-output",
};
afterEach(() => vi.unstubAllGlobals());
it("accepts only an explicitly private matching bucket using a bounded read-only metadata request", async () => {
  const probe = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "product-images", public: false })));
  vi.stubGlobal("fetch", probe);
  expect(await verifyPrivateProductBucket(env)).toEqual({ status: "PASS", reason: "PRIVATE_BUCKET_VERIFIED" });
  const [url, options] = probe.mock.calls[0];
  expect(url).toBe(`${env.SUPABASE_URL}/storage/v1/bucket/product-images`);
  expect(options.method).toBeUndefined();
  expect(options.redirect).toBe("error");
  expect(options.signal).toBeInstanceOf(AbortSignal);
});
it("rejects public, missing privacy flags and mismatched buckets without disclosing provider bodies", async () => {
  for (const body of [{ id: "product-images", public: true }, { id: "product-images" }, { id: "other", public: false }]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    const result = await verifyPrivateProductBucket(env);
    expect(result.status).toBe("BLOCKED");
    expect(JSON.stringify(result)).not.toContain(env.SUPABASE_SERVICE_ROLE_KEY);
  }
});
it("fails closed on unavailable metadata, transport failures and malformed responses", async () => {
  for (const response of [new Response("private provider error", { status: 403 }), new Response("not json")]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    expect((await verifyPrivateProductBucket(env)).status).toBe("BLOCKED");
  }
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(env.SUPABASE_SERVICE_ROLE_KEY)));
  expect(await verifyPrivateProductBucket(env)).toEqual({ status: "BLOCKED", reason: "BUCKET_METADATA_UNAVAILABLE" });
});
it("never sends a credential to an unverified origin or invalid bucket", async () => {
  const probe = vi.fn();
  vi.stubGlobal("fetch", probe);
  for (const patch of [{ SUPABASE_URL: "https://other.invalid" }, { SUPABASE_PRODUCT_IMAGES_BUCKET: "../other" }, { SUPABASE_SERVICE_ROLE_KEY: "" }]) {
    expect((await verifyPrivateProductBucket({ ...env, ...patch })).status).toBe("BLOCKED");
  }
  expect(probe).not.toHaveBeenCalled();
});
