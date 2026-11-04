import { afterEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/v1/ready/route";
import { GET as liveness } from "@/app/api/v1/health/route";
afterEach(() => vi.unstubAllEnvs());
it("does not enable readiness on the legacy deployment", async () => {
  vi.stubEnv("JETSELLER_STORE_PROFILE", "");
  const response = await GET();
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual({ success: false, data: { status: "not_enabled" } });
});
it("reports invalid startup configuration generically and never claims ready to sell", async () => {
  vi.stubEnv("JETSELLER_STORE_PROFILE", "self-hosted");
  vi.stubEnv("JETSELLER_INSTALLATION_ID", "secret-sentinel-invalid");
  const response = await GET();
  expect(response.status).toBe(503);
  expect(response.headers.get("retry-after")).toBe("3");
  expect(await response.json()).toEqual({ success: false, data: { status: "not_ready" } });
});
it("preserves existing liveness independently from incomplete self-hosted config", async () => {
  vi.stubEnv("JETSELLER_STORE_PROFILE", "self-hosted");
  vi.stubEnv("DATABASE_URL", "unreachable-secret-sentinel");
  expect(await (await liveness()).json()).toEqual({ success: true, data: { status: "ok", app: "gheverhan" } });
});
