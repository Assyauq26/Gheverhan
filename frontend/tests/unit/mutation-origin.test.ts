import { describe, it, expect } from "vitest";
import { assertMutationOrigin } from "@/lib/mutation-origin";
describe("protected API mutation origin", () => {
  it("accepts same-origin browser and authenticated client requests without Origin", () => {
    expect(() => assertMutationOrigin(new Request("https://gheverhan.example/api", { headers: { origin: "https://gheverhan.example" } }))).not.toThrow();
    expect(() => assertMutationOrigin(new Request("https://gheverhan.example/api"))).not.toThrow();
  });
  it("rejects cross-origin and opaque-origin browser requests", () => {
    for (const origin of ["https://untrusted.example", "null"]) expect(() => assertMutationOrigin(new Request("https://gheverhan.example/api", { headers: { origin } }))).toThrow("Origin tidak diizinkan");
  });
});
