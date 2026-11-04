import { expect, it } from "vitest";
import { assertCheckoutReleaseAllowed } from "@/lib/self-hosted/commerce-gate";

it("preserves legacy checkout while new independent stores fail closed", () => {
  expect(() => assertCheckoutReleaseAllowed({})).not.toThrow();
  expect(() => assertCheckoutReleaseAllowed({ JETSELLER_STORE_PROFILE: "self-hosted" })).toThrow("Checkout belum diaktifkan");
  for (const value of ["true", "yes", "1", ""]) {
    expect(() => assertCheckoutReleaseAllowed({ JETSELLER_STORE_PROFILE: "self-hosted", SELF_HOSTED_CHECKOUT_APPROVED: value })).toThrow();
  }
  expect(() => assertCheckoutReleaseAllowed({ JETSELLER_STORE_PROFILE: "self-hosted", SELF_HOSTED_CHECKOUT_APPROVED: "owner-reviewed-v1" })).not.toThrow();
});
