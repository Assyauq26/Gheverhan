import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rows: new Map<string, any>() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: async (fn: any) => fn({
    $queryRaw: vi.fn(), auditLog: { create: vi.fn() },
    jntPlatformIntegration: {
      findUnique: async ({ where }: any) => state.rows.get(where.environment) || null,
      upsert: async ({ where, create, update }: any) => {
        const next = { ...(state.rows.get(where.environment) || create), ...(state.rows.has(where.environment) ? update : {}), updatedAt: new Date() };
        state.rows.set(where.environment, next); return next;
      },
    },
  }), jntPlatformIntegration: {
    findUnique: vi.fn(async ({ where }: { where: { environment: string } }) =>
      state.rows.get(where.environment) || null),
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const current = state.rows.get(where.environment);
      const next = { ...(current || create), ...(current ? update : {}), updatedAt: new Date() };
      state.rows.set(where.environment, next);
      return next;
    }),
  } },
}));
import { activeJntConfig, isJntPlatformOwner, readJntPublicStatus, saveJntSettings } from "@/infrastructure/shipping/jnt/official-config";

afterEach(() => { state.rows.clear(); vi.unstubAllEnvs(); });
const endpoints = {
  order: "https://demo-ecommerce.inuat-jntexpress.id/jts-idn-ecommerce-api/api/order/create",
  cancellation: "https://demo-ecommerce.inuat-jntexpress.id/jts-idn-ecommerce-api/api/order/cancel",
  tariff: "https://demo-general.inuat-jntexpress.id/jandt_track/inquiry.action",
  tracking: "https://demo-general.inuat-jntexpress.id/jandt_track/track/trackAction!tracking.action",
};
const credentials = {
  orderUsername: "SANDBOX-OWNER", orderApiKey: "SYNTHETIC-API", orderKey: "SYNTHETIC-KEY",
  tariffCustomer: "SANDBOX-OWNER", tariffKey: "SYNTHETIC-TARIFF-KEY",
  trackingUsername: "SANDBOX-OWNER", trackingPassword: "SYNTHETIC-PASSWORD",
};
describe("J&T global platform secrets", () => {
  it("blocks Production API independently of saved credentials and owner UI enablement", async () => {
    vi.stubEnv("JNT_API_ENV", "production");
    vi.stubEnv("JNT_PRODUCTION_API_APPROVED", "no");
    await expect(activeJntConfig()).rejects.toThrow(/belum disetujui/);
    vi.stubEnv("JNT_PRODUCTION_API_APPROVED", "yes");
    await expect(activeJntConfig()).rejects.toThrow(/belum diaktifkan/);
  });
  it("denies all users without an explicit owner allowlist and a Super Admin role", () => {
    const owner = { id: "owner-1", roles: ["Super Admin"] };
    expect(isJntPlatformOwner(owner)).toBe(false);
    vi.stubEnv("JNT_PLATFORM_OWNER_USER_IDS", "owner-1");
    expect(isJntPlatformOwner(owner)).toBe(true);
    expect(isJntPlatformOwner({ id: "owner-1", roles: ["Admin"] })).toBe(false);
    expect(isJntPlatformOwner({ id: "seller-1", roles: ["Super Admin"] })).toBe(false);
    expect(isJntPlatformOwner(null)).toBe(false);
  });
  it("stores encrypted config, redacts GET, and preserves existing secrets on blank updates", async () => {
    vi.stubEnv("JNT_INTEGRATION_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    await saveJntSettings({ environment: "sandbox", enabled: false, endpoints, credentials }, "owner-1");
    const raw = state.rows.get("sandbox").encryptedConfig as string;
    expect(raw).toMatch(/^v1:/);
    expect(raw).not.toContain("SYNTHETIC-KEY");
    expect(raw).not.toContain("SYNTHETIC-PASSWORD");
    const publicData = await readJntPublicStatus("sandbox");
    expect(publicData).toMatchObject({ configured: true, enabled: false, credentialSet: { orderKey: true } });
    expect(JSON.stringify(publicData)).not.toContain("SYNTHETIC-PASSWORD");
    await saveJntSettings({ environment: "sandbox", enabled: true, endpoints, credentials: {} }, "owner-1");
    expect((await readJntPublicStatus("sandbox")).enabled).toBe(true);
  });
  it("rejects non-J&T hosts, wrong endpoint paths, and cross-environment confusion", async () => {
    vi.stubEnv("JNT_INTEGRATION_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    await expect(saveJntSettings({
      environment: "sandbox", enabled: true,
      endpoints: { ...endpoints, tariff: "https://example.com/jandt_track/inquiry.action" },
      credentials,
    }, "owner-1")).rejects.toThrow(/allowlist/);
    await expect(saveJntSettings({
      environment: "production", enabled: true, endpoints, credentials,
    }, "owner-1")).rejects.toThrow(/allowlist/);
    expect(state.rows.size).toBe(0);
  });
});
