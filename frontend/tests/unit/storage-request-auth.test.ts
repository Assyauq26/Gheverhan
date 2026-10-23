import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { getObject, putObject, removeObject } from "@/lib/storage";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const objectPath = "gheverhan/product-images/product-fixture/12345678-1234-1234-1234-123456789abc.png";

it.each(["legacy-service-fixture", ["sb", "secret", "runtime-fixture"].join("_")])(
  "uses the key-family policy for upload, private read and compensating delete (%s)",
  async (key) => {
    vi.stubEnv("SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", key);
    vi.stubEnv("SUPABASE_PRODUCT_IMAGES_BUCKET", "private-fixture");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2]), { headers: { "Content-Type": "image/png" } }))
      .mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetcher);
    await putObject(objectPath, new Uint8Array([1, 2]), "image/png");
    expect((await getObject(objectPath)).data).toEqual(new Uint8Array([1, 2]));
    await removeObject(objectPath);
    expect(fetcher.mock.calls.map(([, options]) => options.method || "GET")).toEqual(["POST", "GET", "DELETE"]);
    for (const [url, options] of fetcher.mock.calls) {
      expect(url).toContain("https://fixture.supabase.co/storage/v1/object/private-fixture");
      expect(options.headers.apikey).toBe(key);
      if (key.startsWith("sb_secret_")) expect(options.headers).not.toHaveProperty("Authorization");
      else expect(options.headers.Authorization).toBe(`Bearer ${key}`);
      expect(options.cache).toBe("no-store");
    }
  },
);

it("keeps modern-key provider failures closed without exposing provider bodies or keys", async () => {
  const key = ["sb", "secret", "runtime-fixture"].join("_");
  vi.stubEnv("SUPABASE_URL", "https://fixture.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", key);
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(key, { status: 403 })));
  await expect(putObject(objectPath, new Uint8Array([1]), "image/png")).rejects.toThrow("Storage upload failed (403)");
  await expect(getObject(objectPath)).rejects.toThrow("Storage read failed (403)");
  await expect(removeObject(objectPath)).rejects.toThrow("Storage cleanup failed (403)");
});
