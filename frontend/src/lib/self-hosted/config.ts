/**
 * JetSeller M1-01: explicit, opt-in configuration for an independent store.
 *
 * No provider calls, network requests, schema mutations, or secret logging.
 * Legacy Gheverhan is unchanged unless JETSELLER_STORE_PROFILE=self-hosted.
 */
type Env = Readonly<Record<string, string | undefined>>;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NAME = /^[a-z][a-z0-9_-]{2,63}$/;
const HOST = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const BAD_ROOT = ["/etc", "/root", "/proc", "/sys", "/dev", "/run", "/boot", "/usr", "/bin", "/sbin"];

export type StoreProfile = "legacy" | "self-hosted";

export interface SelfHostedStoreConfig {
  profile: "self-hosted";
  installationId: string;
  installationMode: "new";
  appOrigin: string;
  domain: string;
  storageProvider: "local";
  storageApp: string;
  storageRoot: string;
  databaseHost: "db" | "postgres";
  databaseName: string;
  databaseRuntimeUser: string;
  databaseMigrationUser: string;
  cookieName: string;
  sessionIssuer: string;
  sessionAudience: string;
  emailSender: string;
}

/** The only way to opt into this new profile. Never infer from a domain. */
export function getStoreProfile(env: Env): StoreProfile {
  const profile = env.JETSELLER_STORE_PROFILE;
  if (!profile) return "legacy";
  if (profile === "self-hosted") return "self-hosted";
  throw new Error("Invalid JETSELLER_STORE_PROFILE");
}

function required(env: Env, field: string): string {
  const value = env[field];
  if (!value || value !== value.trim() || /[\x00-\x1f\x7f]/.test(value)) {
    throw new Error(`Invalid or missing ${field}`);
  }
  return value;
}

function origin(env: Env): { appOrigin: string; domain: string } {
  const value = required(env, "APP_ORIGIN");
  try {
    const url = new URL(value);
    const domain = url.hostname;
    const labels = domain.split(".");
    if (
      url.protocol !== "https:" || url.username || url.password ||
      url.port || url.pathname !== "/" || url.search || url.hash ||
      !HOST.test(domain) || domain.length > 253 ||
      labels.some(label => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-")) ||
      ![url.origin, url.origin + "/"].includes(value)
    ) throw new Error("invalid");
    if (required(env, "JETSELLER_STORE_DOMAIN") !== domain) {
      throw new Error("mismatch");
    }
    return { appOrigin: url.origin, domain };
  } catch {
    throw new Error("Invalid APP_ORIGIN or JETSELLER_STORE_DOMAIN");
  }
}

function safeStorageRoot(env: Env): string {
  const root = required(env, "STORAGE_LOCAL_ROOT");
  if (
    !root.startsWith("/") || root === "/" || root.endsWith("/") ||
    root.includes("\\") || root.includes("//") ||
    root.split("/").some(part => part === "." || part === "..") ||
    BAD_ROOT.some(prefix => root === prefix || root.startsWith(prefix + "/"))
  ) throw new Error("Invalid STORAGE_LOCAL_ROOT");
  return root;
}

interface DatabaseIdentity {
  host: "db" | "postgres";
  name: string;
  role: string;
  password: string;
}

function databaseIdentity(env: Env, field: "DATABASE_URL" | "DIRECT_URL", expectedName: string): DatabaseIdentity {
  const raw = required(env, field);
  try {
    const uri = new URL(raw);
    const host = uri.hostname;
    const name = decodeURIComponent(uri.pathname.slice(1));
    const role = decodeURIComponent(uri.username);
    const allowed = new Set(["schema"]);
    const keys = [...uri.searchParams.keys()];
    if (
      !["postgresql:", "postgres:"].includes(uri.protocol) ||
      (host !== "db" && host !== "postgres") ||
      (uri.port && uri.port !== "5432") ||
      name !== expectedName || !NAME.test(role) ||
      !uri.password || !uri.pathname.startsWith("/") ||
      uri.hash || uri.searchParams.get("schema") !== null && uri.searchParams.get("schema") !== "public" ||
      keys.length !== new Set(keys).size ||
      keys.some(key => !allowed.has(key))
    ) throw new Error("invalid");
    return { host, name, role, password: uri.password };
  } catch {
    // Never include the URL, role, hostname or password in errors.
    throw new Error(`Invalid ${field}`);
  }
}

/** Validate complete install profile without leaking secrets into return values. */
export function parseSelfHostedConfig(env: Env): SelfHostedStoreConfig {
  if (getStoreProfile(env) !== "self-hosted") {
    throw new Error("JETSELLER_STORE_PROFILE must be self-hosted");
  }
  if (env.VERCEL_ENV || env.SUPABASE_DB_CA_CERT || env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Invalid self-hosted environment boundary");
  }
  const installationId = required(env, "JETSELLER_INSTALLATION_ID");
  if (!UUID_V4.test(installationId)) throw new Error("Invalid JETSELLER_INSTALLATION_ID");
  if (required(env, "JETSELLER_INSTALLATION_MODE") !== "new") {
    throw new Error("Unsupported JETSELLER_INSTALLATION_MODE");
  }
  const { appOrigin, domain } = origin(env);
  if (required(env, "STORAGE_PROVIDER") !== "local") {
    throw new Error("Invalid STORAGE_PROVIDER");
  }
  const storageApp = required(env, "STORAGE_APP_NAME");
  if (!NAME.test(storageApp) || storageApp === "gheverhan") {
    throw new Error("Invalid STORAGE_APP_NAME");
  }
  const storageRoot = safeStorageRoot(env);
  const databaseName = "js_" + installationId.replace(/-/g, "");
  const runtime = databaseIdentity(env, "DATABASE_URL", databaseName);
  const migration = databaseIdentity(env, "DIRECT_URL", databaseName);
  if (
    runtime.host !== migration.host ||
    runtime.name !== migration.name ||
    runtime.role === migration.role ||
    runtime.password === migration.password
  ) throw new Error("Invalid database role separation");
  const secret = required(env, "JWT_SECRET");
  if (!/^[0-9a-f]{64}$/.test(secret)) throw new Error("Invalid JWT_SECRET");
  const cookieName = required(env, "AUTH_COOKIE_NAME");
  const expectedCookie = "js_" + installationId.slice(0, 8) + "_session";
  if (cookieName !== expectedCookie) throw new Error("Invalid AUTH_COOKIE_NAME");
  const sender = required(env, "PASSWORD_RESET_FROM");
  if (sender.length > 180 || !/^[^<>\r\n]+<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>$/.test(sender)) {
    throw new Error("Invalid PASSWORD_RESET_FROM");
  }
  if (required(env, "PASSWORD_RESET_BASE_URL") !== appOrigin) {
    throw new Error("Invalid PASSWORD_RESET_BASE_URL");
  }
  // The old centrally provisioned J&T integration is not enabled on newly installed stores.
  if (
    ["JNT_ENABLE_ORDER_CREATE", "JNT_PRODUCTION_ORDER_APPROVED", "JNT_PRODUCTION_API_APPROVED"]
      .some(key => env[key] === "yes" || env[key] === "true")
  ) throw new Error("J&T production integration is not enabled in the self-hosted bootstrap profile");

  return {
    profile: "self-hosted",
    installationId,
    installationMode: "new",
    appOrigin,
    domain,
    storageProvider: "local",
    storageApp,
    storageRoot,
    databaseHost: runtime.host,
    databaseName,
    databaseRuntimeUser: runtime.role,
    databaseMigrationUser: migration.role,
    cookieName,
    sessionIssuer: "jetseller-store:" + installationId,
    sessionAudience: "jetseller-storefront:" + installationId,
    emailSender: sender,
  };
}
