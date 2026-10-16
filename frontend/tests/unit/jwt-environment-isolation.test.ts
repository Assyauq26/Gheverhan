import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeJwt, SignJWT } from "jose";
import { signSession, verifySession } from "@/lib/auth/jwt";

const secret = "jwt-test-secret-only-do-not-use-live-32-bytes";

afterEach(() => vi.unstubAllEnvs());

describe("environment-bound session JWTs", () => {
  it("preserves production claims and accepts existing production-format tokens", async () => {
    vi.stubEnv("JWT_SECRET", secret);
    vi.stubEnv("VERCEL_ENV", "production");
    const token = await signSession({ sub: "customer-a", email: "a@example.test" });
    expect(decodeJwt(token)).toMatchObject({
      iss: "gheverhan",
      aud: "gheverhan-web",
      sub: "customer-a",
    });

    // Existing production session cookies use these claims. Keep them valid.
    const oldFormat = await new SignJWT({ email: "a@example.test" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("customer-a")
      .setIssuedAt()
      .setIssuer("gheverhan")
      .setAudience("gheverhan-web")
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode(secret));
    expect(await verifySession(oldFormat)).toEqual({
      sub: "customer-a",
      email: "a@example.test",
    });
  });

  it("rejects preview sessions in production and production sessions in preview", async () => {
    // Deliberately use the SAME key to regression-test claim separation.
    // Distinct signing keys remain mandatory for actual security isolation.
    vi.stubEnv("JWT_SECRET", secret);
    vi.stubEnv("VERCEL_ENV", "preview");
    const previewToken = await signSession({ sub: "customer-b", email: "b@example.test" });
    expect(decodeJwt(previewToken)).toMatchObject({
      iss: "gheverhan-preview",
      aud: "gheverhan-web-preview",
    });
    expect(await verifySession(previewToken)).toEqual({
      sub: "customer-b",
      email: "b@example.test",
    });

    vi.stubEnv("VERCEL_ENV", "production");
    expect(await verifySession(previewToken)).toBeNull();
    const productionToken = await signSession({ sub: "customer-b", email: "b@example.test" });
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(await verifySession(productionToken)).toBeNull();
  });

  it("fails closed when JWT_SECRET is not configured", async () => {
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    await expect(signSession({ sub: "a", email: "a@example.test" })).rejects.toThrow(
      "JWT_SECRET is not configured",
    );
    expect(await verifySession("not-a-jwt")).toBeNull();
  });
});
