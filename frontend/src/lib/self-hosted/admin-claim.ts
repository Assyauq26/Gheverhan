import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getStoreProfile, parseSelfHostedConfig } from "./config";
import { ALL_PERMISSIONS, ADMIN_ROLES } from "../auth/permissions";
import { hashPassword } from "../auth/password";

type Env = Readonly<Record<string, string | undefined>>;
type Db = Pick<PrismaClient, "$transaction">;
export class LocalSetupError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}
const reject = (code: string, status: number): never => { throw new LocalSetupError(code, status); };
const digest = (claim: string) => createHash("sha256").update(claim).digest("hex");
const LOCK = 72345182;

export function localSetupConfig(env: Env) {
  if (getStoreProfile(env) !== "self-hosted") return reject("NOT_FOUND", 404);
  try { return parseSelfHostedConfig(env); }
  catch { return reject("SETUP_UNAVAILABLE", 503); }
}
async function identity(tx: Prisma.TransactionClient, config: ReturnType<typeof localSetupConfig>) {
  await tx.$executeRaw`SET LOCAL lock_timeout = '2000ms'`;
  await tx.$executeRaw`SET LOCAL statement_timeout = '5000ms'`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK})`;
  const rows = await tx.$queryRaw<{ database: string; role: string }[]>`SELECT current_database() AS database, current_user AS role`;
  if (rows.length !== 1 || rows[0].database !== config.databaseName || rows[0].role !== config.databaseRuntimeUser) reject("SETUP_UNAVAILABLE", 503);
}
async function existingAdministrator(tx: Prisma.TransactionClient) {
  return tx.userRole.findFirst({ where: { role: { name: { in: [...ADMIN_ROLES] } } }, select: { userId: true } });
}

/** Called only by an explicit local operator command, never by a public route.
 * Returned secret must go directly to a private local file, never console/log. */
export async function issueLocalAdminClaim(db: Db, env: Env, now = new Date()) {
  const config = localSetupConfig(env);
  const claim = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + 15 * 60_000);
  await db.$transaction(async tx => {
    await identity(tx, config);
    if (await existingAdministrator(tx)) reject("ADMIN_ALREADY_EXISTS", 409);
    const previous = await tx.localAdminSetup.findUnique({ where: { installationId: config.installationId } });
    if (previous?.consumedAt) reject("CLAIM_ALREADY_USED", 409);
    await tx.localAdminSetup.upsert({
      where: { installationId: config.installationId },
      create: { installationId: config.installationId, claimHash: digest(claim), expiresAt },
      update: { claimHash: digest(claim), expiresAt, attempts: 0 },
    });
    await tx.auditLog.create({ data: { action: "self_hosted.admin_claim.issued", entity: "LocalAdminSetup", entityId: config.installationId } });
  }, { maxWait: 2000, timeout: 5000 });
  return { claim, expiresAt };
}

export async function localSetupStatus(db: Db, env: Env) {
  const config = localSetupConfig(env);
  return db.$transaction(async tx => {
    await identity(tx, config);
    if (await existingAdministrator(tx)) return { status: "unavailable" as const };
    const row = await tx.localAdminSetup.findUnique({ where: { installationId: config.installationId } });
    return { status: row && !row.consumedAt && row.expiresAt.getTime() > Date.now() && row.attempts < 5 ? "setup_required" as const : "unavailable" as const };
  }, { maxWait: 2000, timeout: 3000 });
}

export function validateLocalAdminInput(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return reject("INVALID_REQUEST", 400);
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["claim", "name", "email", "password"].includes(key))) return reject("INVALID_REQUEST", 400);
  if (typeof value.claim !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.claim)) return reject("INVALID_REQUEST", 400);
  if (typeof value.name !== "string" || value.name !== value.name.trim() || value.name.length < 1 || value.name.length > 100 || /[\x00-\x1f\x7f]/.test(value.name)) return reject("INVALID_REQUEST", 400);
  if (typeof value.email !== "string" || value.email !== value.email.trim() || value.email.length > 254 || !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/.test(value.email)) return reject("INVALID_REQUEST", 400);
  if (typeof value.password !== "string" || value.password.length < 12 || Buffer.byteLength(value.password, "utf8") > 72 || /[\x00-\x1f\x7f]/.test(value.password)) return reject("INVALID_REQUEST", 400);
  return { claim: value.claim, name: value.name, email: value.email.toLowerCase(), password: value.password };
}

export async function redeemLocalAdminClaim(db: Db, env: Env, raw: unknown) {
  const config = localSetupConfig(env), input = validateLocalAdminInput(raw);
  const result = await db.$transaction(async tx => {
    await identity(tx, config);
    if (await existingAdministrator(tx)) return { error: "ADMIN_ALREADY_EXISTS", status: 409 };
    const row = await tx.localAdminSetup.findUnique({ where: { installationId: config.installationId } });
    if (!row) return { error: "CLAIM_UNAVAILABLE", status: 403 };
    if (row.consumedAt) return { error: "CLAIM_ALREADY_USED", status: 409 };
    if (row.expiresAt.getTime() <= Date.now()) return { error: "CLAIM_EXPIRED", status: 410 };
    if (row.attempts >= 5) return { error: "CLAIM_LOCKED", status: 429 };
    if (!timingSafeEqual(Buffer.from(row.claimHash), Buffer.from(digest(input.claim)))) {
      await tx.localAdminSetup.update({ where: { installationId: config.installationId }, data: { attempts: { increment: 1 } } });
      return { error: "CLAIM_REJECTED", status: 403 };
    }
    // Never attach a privileged role to an existing customer or overwrite a hash.
    if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) return { error: "ACCOUNT_EXISTS", status: 409 };
    const passwordHash = await hashPassword(input.password);
    const role = await tx.role.upsert({ where: { name: "Admin" }, create: { name: "Admin", label: "Admin / Seller" }, update: { label: "Admin / Seller" } });
    // No pre-existing staff is allowed above. Do not inherit additional old SaaS permissions.
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const key of ALL_PERMISSIONS) {
      const permission = await tx.permission.upsert({ where: { key }, create: { key, label: key }, update: { label: key } });
      await tx.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    }
    await tx.role.upsert({ where: { name: "Customer" }, create: { name: "Customer", label: "Customer" }, update: {} });
    const admin = await tx.user.create({ data: { name: input.name, email: input.email, passwordHash, isActive: true, roles: { create: { roleId: role.id } } } });
    await tx.auditLog.create({ data: { userId: admin.id, action: "self_hosted.admin.created", entity: "LocalAdminSetup", entityId: config.installationId } });
    await tx.localAdminSetup.update({ where: { installationId: config.installationId }, data: { consumedAt: new Date() } });
    return { status: 201 };
  }, { maxWait: 2000, timeout: 8000 });
  if (result.error) reject(result.error, result.status);
  return { status: "ADMIN_CREATED" as const };
}
