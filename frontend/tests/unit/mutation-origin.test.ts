import { afterEach, describe, it, expect, vi } from "vitest";
import { assertMutationOrigin, assertSameOrigin } from "@/lib/mutation-origin";

afterEach(() => vi.unstubAllEnvs());
describe("protected API mutation origin", () => {
  it("accepts same-origin browser requests and optional-Origin clients", () => {
    vi.stubEnv("APP_ORIGIN", "");
    const req = new Request("https://gheverhan.example/api", { headers: { origin: "https://gheverhan.example" } });
    expect(() => assertMutationOrigin(req)).not.toThrow();
    expect(() => assertSameOrigin(req)).not.toThrow();
    expect(() => assertMutationOrigin(new Request(req.url))).not.toThrow();
    expect(() => assertSameOrigin(new Request(req.url))).toThrow("Origin tidak diizinkan");
  });
  it("accepts the configured external HTTPS origin behind an internal reverse proxy", () => {
    vi.stubEnv("APP_ORIGIN", "https://gheverhan.store");
    const req = new Request("http://0.0.0.0:3000/api", { headers: { origin: "https://gheverhan.store" } });
    expect(() => assertMutationOrigin(req)).not.toThrow();
    expect(() => assertSameOrigin(req)).not.toThrow();
  });
  it("rejects cross-origin, internal, opaque and missing upload origins despite forwarded headers", () => {
    vi.stubEnv("APP_ORIGIN", "https://gheverhan.store");
    for (const origin of ["https://untrusted.example", "http://0.0.0.0:3000", "null", "https://www.gheverhan.store"]) {
      const req = new Request("http://0.0.0.0:3000/api", { headers: { origin, "x-forwarded-host": "untrusted.example", "x-forwarded-proto": "https" } });
      expect(() => assertSameOrigin(req)).toThrow("Origin tidak diizinkan");
      expect(() => assertMutationOrigin(req)).toThrow("Origin tidak diizinkan");
    }
    expect(() => assertSameOrigin(new Request("http://0.0.0.0:3000/api"))).toThrow("Origin tidak diizinkan");
  });
  it("fails closed for invalid configured origins", () => {
    for (const origin of ["not a URL", "http://gheverhan.store", "https://user:secret@gheverhan.store", "https://gheverhan.store/path", "https://gheverhan.store?x=1", "https://gheverhan.store#x"]) {
      vi.stubEnv("APP_ORIGIN", origin);
      expect(() => assertSameOrigin(new Request("https://gheverhan.store/api", { headers: { origin: "https://gheverhan.store" } }))).toThrow("Origin aplikasi belum dikonfigurasi dengan benar");
    }
  });
});
