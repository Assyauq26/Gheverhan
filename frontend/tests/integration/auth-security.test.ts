import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { SignJWT } from "jose";

const target = process.env.SPRINT1_TEST_DATABASE_URL;
if (!target) throw new Error("Explicit isolated test database required");
const parsed = new URL(target);
if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) || parsed.pathname !== "/gheverhan_sprint1_test") throw new Error("Auth regression refuses non-local/test databases");
process.env.DATABASE_URL = target; process.env.DIRECT_URL = target;
process.env.JWT_SECRET = "disposable-auth-security-fixture-secret-only";
process.env.RESEND_API_KEY = "disposable-mail-double";
process.env.PASSWORD_RESET_FROM = "test@example.test";
process.env.PASSWORD_RESET_BASE_URL = "https://example.test";
const db = new PrismaClient({ datasources: { db: { url: target } } });
const prefix = randomUUID();
let seq = 0;
let auth: typeof import("../../src/modules/auth/auth.service");
let jwt: typeof import("../../src/lib/auth/jwt");
let state: typeof import("../../src/lib/auth/session-state");
let limits: typeof import("../../src/lib/auth/rate-limit");
let serviceDb: PrismaClient;
const originalFetch = globalThis.fetch;
let deliveredToken = "";
before(async () => {
  auth = await import("../../src/modules/auth/auth.service");
  jwt = await import("../../src/lib/auth/jwt");
  state = await import("../../src/lib/auth/session-state");
  limits = await import("../../src/lib/auth/rate-limit");
  serviceDb = (await import("../../src/lib/prisma")).prisma;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    const body = JSON.parse(String(options?.body));
    deliveredToken = new URL(body.text.match(/https:\/\/example.test\/reset-password\?token=[0-9a-f]+/)[0]).searchParams.get("token")!;
    return new Response("{}", { status: 200 });
  };
});
after(async () => {
  globalThis.fetch = originalFetch;
  await db.auditLog.deleteMany({ where: { user: { email: { endsWith: `@${prefix}.example.test` } } } });
  await db.user.deleteMany({ where: { email: { endsWith: `@${prefix}.example.test` } } });
  await db.authRateLimit.deleteMany({ where: { bucket: { startsWith: prefix } } });
  await serviceDb?.$disconnect();
  await db.$disconnect();
});
async function fixture() {
  return db.user.create({ data: { name: "Synthetic security fixture", email: `${++seq}@${prefix}.example.test`, passwordHash: "synthetic-unused-hash" } });
}
async function accepted(token: string) {
  const claims = await jwt.verifySessionClaims(token);
  return !!claims && !!await db.user.findUnique({ where: state.activeSessionWhere(claims), select: { id: true } });
}
test("logout revokes the captured JWT, preserves another session and is idempotent", async () => {
  const user = await fixture();
  const first = await jwt.signSession({ sub: user.id, email: user.email });
  const second = await jwt.signSession({ sub: user.id, email: user.email });
  assert.equal(await accepted(first), true);
  await state.revokeSession((await jwt.verifySessionClaims(first))!);
  await state.revokeSession((await jwt.verifySessionClaims(first))!);
  assert.equal(await accepted(first), false);
  assert.equal(await accepted(second), true);
  const stored = await db.sessionRevocation.findMany({ where: { userId: user.id } });
  assert.equal(stored.length, 1);
  assert.equal(stored.every(row => /^[0-9a-f]{64}$/.test(row.tokenHash) && row.tokenHash !== first), true);
});
test("password reset stores only a digest, atomically consumes once and revokes all old sessions", async () => {
  const user = await fixture();
  const old = await jwt.signSession({ sub: user.id, email: user.email });
  await auth.requestPasswordReset(user.email);
  const token = deliveredToken;
  const row = await db.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } });
  assert.equal(row.token !== token && row.token === createHash("sha256").update(token).digest("hex"), true);
  const results = await Promise.allSettled([auth.resetPassword(token, "new-synthetic-password"), auth.resetPassword(token, "new-synthetic-password")]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.filter(r => r.status === "rejected" && r.reason.status === 400).length, 1);
  assert.equal(await accepted(old), false);
  const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(updated.sessionVersion, 1);
  assert.equal(await accepted(await jwt.signSession({ sub: user.id, email: user.email, version: updated.sessionVersion })), true);
  assert.equal((await auth.authenticate(user.email, "new-synthetic-password")).id, user.id);
});
test("failed mail leaves no usable token; unknown identities keep the generic response", async () => {
  const user = await fixture();
  const mailDouble = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 503 });
  try {
    await assert.rejects(auth.requestPasswordReset(user.email), { status: 503 });
    assert.equal(await db.passwordResetToken.count({ where: { userId: user.id } }), 0);
    assert.equal(await auth.requestPasswordReset(`unknown@${prefix}.example.test`), undefined);
  } finally { globalThis.fetch = mailDouble; }
});
test("expired reset and deactivated accounts cannot change passwords or authenticate", async () => {
  const user = await fixture();
  const token = "a".repeat(64);
  await db.passwordResetToken.create({ data: { userId: user.id, token: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() - 60_000) } });
  await assert.rejects(auth.resetPassword(token, "new-synthetic-password"), { status: 400 });
  const signed = await jwt.signSession({ sub: user.id, email: user.email });
  await db.user.update({ where: { id: user.id }, data: { isActive: false } });
  assert.equal(await accepted(signed), false);
  await assert.rejects(auth.authenticate(user.email, "anything"), { status: 401 });
});
test("legacy issuer-isolated JWTs are accepted at version zero and can be revoked", async () => {
  const user = await fixture();
  const identity = process.env.VERCEL_ENV === "preview" ? ["gheverhan-preview", "gheverhan-web-preview"] : ["gheverhan", "gheverhan-web"];
  const legacy = await new SignJWT({ email: user.email }).setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setIssuer(identity[0]).setAudience(identity[1]).setExpirationTime("1h").sign(new TextEncoder().encode(process.env.JWT_SECRET));
  assert.equal(await accepted(legacy), true);
  await state.revokeSession((await jwt.verifySessionClaims(legacy))!);
  assert.equal(await accepted(legacy), false);
});
test("atomic limiter acknowledges exactly ten concurrent requests across connections", async () => {
  const bucket = `${prefix}:concurrency`;
  const results = await Promise.allSettled(Array.from({ length: 24 }, () => limits.consumeAuthBucket(bucket, 10, new Date(Date.now() + 60_000))));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 10);
  assert.equal(results.filter(r => r.status === "rejected" && r.reason.status === 429).length, 14);
  assert.equal((await db.authRateLimit.findUniqueOrThrow({ where: { bucket } })).attempts, 10);
});
test("login service enforces a durable limit for an unknown account", async () => {
  const unknown = `limit@${prefix}.example.test`;
  for (let i = 0; i < 10; i++) await assert.rejects(auth.authenticate(unknown, "wrong"), { status: 401 });
  await assert.rejects(auth.authenticate(unknown.toUpperCase(), "wrong"), { status: 429 });
});
test("new security tables deny reads and writes to a role with no RLS policy", async () => {
  const role = `r19_auth_${prefix.replaceAll("-", "")}`;
  // Identifier is generated locally from UUID hex; no external SQL text is interpolated.
  const identifier = Prisma.raw(`"${role}"`);
  await db.$executeRaw(Prisma.sql`CREATE ROLE ${identifier} NOLOGIN`);
  try {
    await db.$executeRaw(Prisma.sql`GRANT USAGE ON SCHEMA public TO ${identifier}`);
    await db.$executeRaw(Prisma.sql`GRANT SELECT, INSERT ON "AuthRateLimit", "SessionRevocation" TO ${identifier}`);
    await db.$transaction(async tx => {
      await tx.$executeRaw(Prisma.sql`SET LOCAL ROLE ${identifier}`);
      await assert.rejects(state.assertSessionRevocationAccess(tx), { status: 503 });
      assert.equal(await tx.authRateLimit.count(), 0);
      assert.equal(await tx.sessionRevocation.count(), 0);
    });
    await assert.rejects(db.$transaction(async tx => {
      await tx.$executeRaw(Prisma.sql`SET LOCAL ROLE ${identifier}`);
      await tx.authRateLimit.create({ data: { bucket: `${prefix}:denied`, attempts: 1, expiresAt: new Date() } });
    }), (err: unknown) => err instanceof Error && /row.level security/i.test(err.message));
  } finally {
    await db.$executeRaw(Prisma.sql`DROP OWNED BY ${identifier}`);
    await db.$executeRaw(Prisma.sql`DROP ROLE ${identifier}`);
  }
});


test("trusted server role can inspect revocations while RLS remains enabled", async () => {
  await state.assertSessionRevocationAccess(db);
});
