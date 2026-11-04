import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
const s = vi.hoisted(() => ({ user: null as any, read: vi.fn(), logo: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => s.user }));
vi.mock("@/lib/prisma", () => ({ prisma: { storeAppearance: { findUnique: s.read } } }));
vi.mock("@/modules/appearance/media", () => ({ readLogo: s.logo }));
vi.mock("@/modules/appearance/session", () => ({ appearanceSessionHash: async () => "local-session" }));
import { getDashboardIdentity } from "@/modules/appearance/dashboard";
import { makeDefault } from "@/modules/appearance/schema";
import { GET } from "@/app/api/v1/admin/store-identity/route";
import { GET as logoGET } from "@/app/api/v1/admin/store-identity/logo/route";
beforeEach(() => { vi.clearAllMocks(); s.user = { id: "admin-a", isAdmin: true }; });
afterEach(() => { vi.unstubAllEnvs(); });
it("reads saved draft identity only, without exposing the full private draft", async () => {
  const config = makeDefault(); config.identity.name = "Toko Mawar";
  s.read.mockResolvedValue({ draft: config, draftVersion: 2, publishedVersion: 1 });
  const value = await getDashboardIdentity();
  expect(value).toEqual({ identity: config.identity, draftVersion: 2, publishedVersion: 1 });
  expect(s.read).toHaveBeenCalledWith({ where: { key: "primary" }, select: { draft: true, draftVersion: true, publishedVersion: true } });
  expect(value).not.toHaveProperty("config");
});
it("denies anonymous and non-admin before any private DB query", async () => {
  s.user = null; await expect(getDashboardIdentity()).rejects.toMatchObject({ status: 401 });
  s.user = { id: "customer", isAdmin: false, permissions: ["store.customize.read"] };
  await expect(getDashboardIdentity()).rejects.toMatchObject({ status: 403 });
  expect(s.read).not.toHaveBeenCalled();
});
it("does not retain an installation's fallback identity across calls and keeps legacy branding", async () => {
  s.read.mockResolvedValue(null); vi.stubEnv("JETSELLER_STORE_PROFILE", "self-hosted");
  vi.stubEnv("JETSELLER_STORE_DISPLAY_NAME", "Toko Mawar"); expect((await getDashboardIdentity()).identity.name).toBe("Toko Mawar");
  vi.stubEnv("JETSELLER_STORE_DISPLAY_NAME", "Fashion Kita"); expect((await getDashboardIdentity()).identity.name).toBe("Fashion Kita");
  vi.stubEnv("JETSELLER_STORE_PROFILE", ""); expect((await getDashboardIdentity()).identity.name).toBe("Gheverhan");
});
it("uses private no-store identity responses and rejects client-selected store identifiers", async () => {
  s.read.mockResolvedValue(null);
  const response = await GET(new Request("https://shop.example/api/v1/admin/store-identity"));
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Vary")).toBe("Cookie");
  expect((await GET(new Request("https://shop.example/api/v1/admin/store-identity?installationId=other"))).status).toBe(422);
});
it("serves only the saved current logo to staff, never another draft/staging identifier", async () => {
  const config = makeDefault(); config.identity.logoAssetId = "550e8400-e29b-41d4-a716-446655440000";
  s.read.mockResolvedValue({ draft: config, draftVersion: 1, publishedVersion: 0 });
  expect((await logoGET(new Request("https://shop.example/api/v1/admin/store-identity/logo?id=foreign"))).status).toBe(404);
  expect(s.logo).not.toHaveBeenCalled();
  s.logo.mockResolvedValue({ data: Buffer.from("synthetic") });
  const response = await logoGET(new Request(`https://shop.example/api/v1/admin/store-identity/logo?id=${config.identity.logoAssetId}`));
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(s.logo).toHaveBeenCalledWith(config.identity.logoAssetId, { id: "admin-a", sessionHash: "local-session" });
});
