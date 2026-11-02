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
function stubSellerStore() {
  const installationId = "550e8400-e29b-41d4-a716-446655440000";
  const database = "js_" + installationId.replace(/-/g, "");
  const fixture: Record<string, string> = {
    JETSELLER_STORE_PROFILE: "self-hosted",
    JETSELLER_INSTALLATION_ID: installationId,
    JETSELLER_INSTALLATION_MODE: "new",
    JETSELLER_STORE_DOMAIN: "boutique.example",
    APP_ORIGIN: "https://boutique.example",
    STORAGE_PROVIDER: "local",
    STORAGE_APP_NAME: "js_550e8400",
    STORAGE_LOCAL_ROOT: "/data/jetseller/media",
    DATABASE_URL: `postgresql://store_runtime:runtime-fixture@db:5432/${database}?schema=public`,
    DIRECT_URL: `postgresql://store_migrator:migration-fixture@db:5432/${database}?schema=public`,
    JWT_SECRET: "b".repeat(64),
    AUTH_COOKIE_NAME: "js_550e8400_session",
    PASSWORD_RESET_FROM: "Boutique <noreply@boutique.example>",
    PASSWORD_RESET_BASE_URL: "https://boutique.example",
    JNT_ENABLE_ORDER_CREATE: "no",
    JNT_PRODUCTION_API_APPROVED: "no",
  };
  for (const [key, value] of Object.entries(fixture)) vi.stubEnv(key, value);
}

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
  it("permits only a local Super Admin on a verified independent seller store", () => {
    const sellerOwner = { id: "seller-owner-1", roles: ["Super Admin"] };
    stubSellerStore();
    // Central allowlists must not govern a genuinely self-hosted local store.
    vi.stubEnv("JNT_PLATFORM_OWNER_USER_IDS", "central-operator");
    expect(isJntPlatformOwner(sellerOwner)).toBe(true);
    expect(isJntPlatformOwner({ id: "store-manager", roles: ["Admin"] })).toBe(false);
    expect(isJntPlatformOwner({ id: "", roles: ["Super Admin"] })).toBe(false);
    expect(isJntPlatformOwner(null)).toBe(false);
    vi.stubEnv("APP_ORIGIN", "http://boutique.example");
    expect(isJntPlatformOwner(sellerOwner)).toBe(false);
    vi.stubEnv("APP_ORIGIN", "https://boutique.example");
    vi.stubEnv("DATABASE_URL", "postgresql://insecure:credential@remote.example/postgres");
    expect(isJntPlatformOwner(sellerOwner)).toBe(false);
  });

  it("fails closed on invalid selector instead of silently falling back to the legacy allowlist", () => {
    vi.stubEnv("JETSELLER_STORE_PROFILE", "unknown");
    vi.stubEnv("JNT_PLATFORM_OWNER_USER_IDS", "operator");
    expect(isJntPlatformOwner({ id: "operator", roles: ["Super Admin"] })).toBe(false);
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
