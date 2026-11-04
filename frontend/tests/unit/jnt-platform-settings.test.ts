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
import { activeJntConfig, isJntPlatformOwner, isJntSettingsAdministrator, readJntPublicStatus, readJntSettings, saveJntSettings } from "@/infrastructure/shipping/jnt/official-config";
import type { AuthUser } from "@/lib/auth/session";

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
const seller = { warehouse: { name: "Fixture", contact: "Fixture", phone: "+6281234567890", address: "Synthetic warehouse",
  originSite: "JAKARTA", originCityCode: "JKT" }, services: [{ code: "EZ" as const, verificationReference: "synthetic-agreement", validUntil: "2030-01-01T00:00:00.000Z" }] };
function localMode() {
  vi.stubEnv("JNT_CONFIG_SCOPE", "local_store");
  vi.stubEnv("JETSELLER_STORE_PROFILE", "self-hosted");
  vi.stubEnv("JETSELLER_INSTALLATION_ID", "550e8400-e29b-41d4-a716-446655440000");
  vi.stubEnv("JNT_INSTALLATION_ID", "550e8400-e29b-41d4-a716-446655440000");
  vi.stubEnv("JNT_INTEGRATION_ENCRYPTION_KEY", Buffer.alloc(32, 6).toString("base64"));
}
describe("JNT-SH-01 local isolation", () => {
  it("denies local J&T operations when a plausible UUID exists but the self-hosted profile is absent or legacy", async () => {
    localMode();
    const user = { id: "local-admin", roles: ["Admin"], permissions: ["shipping.update"] } as AuthUser;
    for (const profile of ["", "legacy", "SELF-HOSTED", " self-hosted "]) {
      vi.stubEnv("JETSELLER_STORE_PROFILE", profile);
      expect(isJntSettingsAdministrator(user)).toBe(false);
      await expect(readJntSettings("sandbox")).rejects.toThrow(/Profil instalasi/);
      await expect(saveJntSettings({ environment: "sandbox", enabled: false,
        endpoints, credentials, seller }, user.id)).rejects.toThrow(/Profil instalasi/);
      expect(state.rows.size).toBe(0);
    }
    vi.stubEnv("JETSELLER_STORE_PROFILE", "self-hosted");
    expect(isJntSettingsAdministrator(user)).toBe(true);
    await saveJntSettings({ environment: "sandbox", enabled: false,
      endpoints, credentials, seller }, user.id);
    expect(state.rows.get("sandbox").encryptedConfig).toMatch(/^v2:/);
    vi.stubEnv("JETSELLER_STORE_PROFILE", "");
    await expect(readJntSettings("sandbox")).rejects.toThrow(/Profil instalasi/);
    expect(isJntSettingsAdministrator(user)).toBe(false);
  });
  it("uses local roles plus permission, ignores central owner allowlist and fails closed on unknown mode", () => {
    localMode();
    const user = { id: "local-admin", roles: ["Admin"], permissions: ["shipping.update"] } as AuthUser;
    expect(isJntSettingsAdministrator(user)).toBe(true);
    expect(isJntSettingsAdministrator({ ...user, permissions: [] })).toBe(false);
    expect(isJntSettingsAdministrator({ ...user, roles: ["Customer"] })).toBe(false);
    expect(isJntSettingsAdministrator(null)).toBe(false);
    vi.stubEnv("JNT_CONFIG_SCOPE", "typo");
    expect(isJntSettingsAdministrator(user)).toBe(false);
    vi.stubEnv("JNT_CONFIG_SCOPE", "local_store");
    vi.stubEnv("JETSELLER_STORE_PROFILE", "legacy");
    expect(isJntSettingsAdministrator(user)).toBe(false);
    vi.stubEnv("JETSELLER_STORE_PROFILE", "");
    expect(isJntSettingsAdministrator(user)).toBe(false);
    vi.stubEnv("JETSELLER_STORE_PROFILE", "self-hosted");
    vi.stubEnv("JNT_INSTALLATION_ID", "c6b147ca-dcaf-4a06-82ce-671cdaedb8ed");
    expect(isJntSettingsAdministrator(user)).toBe(false);
    vi.stubEnv("JNT_INSTALLATION_ID", "550e8400-e29b-41d4-a716-446655440000");
    vi.stubEnv("JETSELLER_INSTALLATION_ID", "");
    expect(isJntSettingsAdministrator(user)).toBe(false);
  });
  it("binds ciphertext to installation/environment, redacts credentials and preserves/rotates without plaintext", async () => {
    localMode();
    await saveJntSettings({ environment: "sandbox", enabled: false, endpoints, credentials, seller }, "local-admin");
    expect(state.rows.get("sandbox").encryptedConfig).toMatch(/^v2:/);
    expect(JSON.stringify(await readJntPublicStatus("sandbox"))).not.toContain(credentials.orderKey);
    expect(await readJntPublicStatus("sandbox")).toMatchObject({ shippingReady: false, scope: "local_store", seller });
    await saveJntSettings({ environment: "sandbox", enabled: true, endpoints, credentials: { orderKey: "ROTATED-SYNTHETIC" }, seller }, "local-admin");
    expect((await readJntSettings("sandbox"))?.config.credentials).toMatchObject({ orderKey: "ROTATED-SYNTHETIC", trackingPassword: credentials.trackingPassword });
    state.rows.set("production", state.rows.get("sandbox"));
    await expect(readJntSettings("production")).rejects.toThrow(/dekripsi/);
    vi.stubEnv("JETSELLER_INSTALLATION_ID", "c6b147ca-dcaf-4a06-82ce-671cdaedb8ed");
    vi.stubEnv("JNT_INSTALLATION_ID", "c6b147ca-dcaf-4a06-82ce-671cdaedb8ed");
    await expect(readJntSettings("sandbox")).rejects.toThrow(/dekripsi/);
  });
  it("cannot open checkout or read legacy ciphertext implicitly", async () => {
    vi.stubEnv("JNT_INTEGRATION_ENCRYPTION_KEY", Buffer.alloc(32, 6).toString("base64"));
    await saveJntSettings({ environment: "sandbox", enabled: true, endpoints, credentials }, "legacy-owner");
    localMode();
    await expect(readJntSettings("sandbox")).rejects.toThrow(/dekripsi/);
    await expect(activeJntConfig()).rejects.toThrow(/JNT-SH-02/);
    state.rows.clear(); vi.stubEnv("JETSELLER_INSTALLATION_ID", "");
    await expect(saveJntSettings({ environment: "sandbox", enabled: true, endpoints, credentials, seller }, "admin")).rejects.toThrow(/Identitas/);
  });
});
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
  it("permits the separately proven production Tracking host and path, never arbitrary URLs", async () => {
    vi.stubEnv("JNT_INTEGRATION_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    const production = {
      order: "https://api.jet.co.id/jts-idn-ecommerce-api/api/order/create",
      cancellation: "https://api.jet.co.id/jts-idn-ecommerce-api/api/order/cancel",
      tariff: "https://partner-track.jet.co.id/jandt_track/inquiry.action",
      tracking: "https://secure-jk.jet.co.id/jandt-order-web/track/trackAction!tracking.action",
    };
    await saveJntSettings({ environment: "production", enabled: false, endpoints: production, credentials }, "owner-fixture");
    expect((await readJntSettings("production"))?.config.endpoints.tracking).toBe(production.tracking);
    for (const tracking of [
      "https://secure-jk.jet.co.id.attacker.example/jandt-order-web/track/trackAction!tracking.action",
      "https://secure-jk.jet.co.id/jandt_track/track/trackAction!tracking.action",
      "https://partner-track.jet.co.id/jandt-order-web/track/trackAction!tracking.action",
      production.tracking + "?return=https://attacker.example",
      "http://secure-jk.jet.co.id/jandt-order-web/track/trackAction!tracking.action",
    ]) {
      await expect(saveJntSettings({ environment: "production", enabled: false,
        endpoints: { ...production, tracking }, credentials: {} }, "owner-fixture")).rejects.toThrow(/allowlist/);
    }
    await expect(saveJntSettings({ environment: "sandbox", enabled: false,
      endpoints: { ...endpoints, tracking: production.tracking }, credentials }, "owner-fixture")).rejects.toThrow(/allowlist/);
    expect((await readJntSettings("production"))?.config.endpoints.tracking).toBe(production.tracking);
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
