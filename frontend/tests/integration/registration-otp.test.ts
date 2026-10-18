/** Uses disposable localhost PostgreSQL exclusively; no real email delivery. */
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const target = process.env.SPRINT1_TEST_DATABASE_URL;
if (!target) throw new Error("Local PostgreSQL test DSN required");
const url = new URL(target);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/gheverhan_sprint1_test" ||
    process.env.GHEVERHAN_ISOLATED_TESTS !== "1") {
  throw new Error("Refusing to test OTP against a non-disposable database");
}
process.env.DATABASE_URL = target;
process.env.DIRECT_URL = target;
process.env.JWT_SECRET = "disposable-registration-otp-secret-only";
process.env.RESEND_API_KEY = "dummy-only-test-mail-key";
process.env.PASSWORD_RESET_FROM = "Gheverhan <test@example.test>";
const db = new PrismaClient({ datasources: { db: { url: target } } });
const suffix = randomUUID().replaceAll("-", "");
const domain = suffix + ".example.test";
const codes = new Map<string, string>();
const originalFetch = globalThis.fetch;
let svc: typeof import("../../src/modules/auth/auth.service");
let client: typeof import("../../src/modules/auth/registration-otp");
let shared: PrismaClient;
let phoneSeq = 1000;
function input(n: number) {
  return { name: "Pengguna Tes", email: "otp-" + n + "@" + domain,
    phone: "0812345" + String(++phoneSeq).padStart(5, "0"), password: "dummy-test-password" };
}
before(async () => {
  svc = await import("../../src/modules/auth/auth.service");
  client = await import("../../src/modules/auth/registration-otp");
  shared = (await import("../../src/lib/prisma")).prisma;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.resend.com/emails");
    const body = JSON.parse(String(init?.body));
    const otp = String(body.text).match(/pendaftaran Gheverhan: (\d{6})/)?.[1];
    assert.ok(otp);
    codes.set(body.to[0], otp);
    return new Response("{}", { status: 200 });
  };
});
after(async () => {
  globalThis.fetch = originalFetch;
  await db.pendingRegistration.deleteMany({ where: { email: { endsWith: "@" + domain } } });
  await db.auditLog.deleteMany({ where: { user: { email: { endsWith: "@" + domain } } } });
  await db.user.deleteMany({ where: { email: { endsWith: "@" + domain } } });
  await shared?.$disconnect();
  await db.$disconnect();
});
test("phone normalization and unguessable keyed OTP digest", () => {
  assert.equal(client.normalizeRegistrationPhone("0812 3456 7890"), "+6281234567890");
  assert.equal(client.normalizeRegistrationPhone("+6281234567890"), "+6281234567890");
  assert.throws(() => client.normalizeRegistrationPhone("abc"), { status: 400 });
  const code = client.generateRegistrationOtp();
  assert.match(code, /^\d{6}$/);
  const hash = client.hashRegistrationOtp("test@example.test", code);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(client.compareRegistrationOtp("test@example.test", code, hash), true);
  assert.equal(client.compareRegistrationOtp("other@example.test", code, hash), false);
});
test("email verification is required before account exists; bad OTP cannot create account", async () => {
  const data = input(1);
  await svc.requestRegistrationOtp(data);
  assert.equal(await db.user.count({ where: { email: data.email } }), 0);
  const pending = await db.pendingRegistration.findUniqueOrThrow({ where: { email: data.email } });
  assert.notEqual(pending.passwordHash, data.password);
  assert.match(pending.codeHash, /^[0-9a-f]{64}$/);
  const otp = codes.get(data.email)!;
  assert.ok(otp);
  await assert.rejects(svc.verifyRegistrationOtp(data.email, otp === "000000" ? "111111" : "000000"), { status: 400 });
  assert.equal((await db.pendingRegistration.findUniqueOrThrow({ where: { email: data.email } })).attempts, 1);
  const user = await svc.verifyRegistrationOtp(data.email, otp);
  assert.equal(user.email, data.email);
  assert.ok(user.emailVerifiedAt);
  assert.equal(user.phone, client.normalizeRegistrationPhone(data.phone));
  assert.equal(await db.pendingRegistration.count({ where: { email: data.email } }), 0);
  await assert.rejects(svc.verifyRegistrationOtp(data.email, otp), { status: 400 });
  await assert.rejects(svc.requestRegistrationOtp(data), { status: 409 });
});
test("cooldown, expiry and five invalid attempts fail closed", async () => {
  const data = input(2);
  await svc.requestRegistrationOtp(data);
  await assert.rejects(svc.resendRegistrationOtp(data.email), { status: 429 });
  await db.pendingRegistration.update({ where: { email: data.email },
    data: { sentAt: new Date(Date.now() - 70_000) } });
  await svc.resendRegistrationOtp(data.email);
  assert.equal((await db.pendingRegistration.findUniqueOrThrow({ where: { email: data.email } })).attempts, 0);
  const code = codes.get(data.email)!;
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) {
    await assert.rejects(svc.verifyRegistrationOtp(data.email, wrong), { status: 400 });
  }
  await assert.rejects(svc.verifyRegistrationOtp(data.email, code), { status: 400 });
  assert.equal(await db.user.count({ where: { email: data.email } }), 0);
  const next = input(3);
  await svc.requestRegistrationOtp(next);
  await db.pendingRegistration.update({ where: { email: next.email },
    data: { expiresAt: new Date(Date.now() - 1000) } });
  await assert.rejects(svc.verifyRegistrationOtp(next.email, codes.get(next.email)!), { status: 400 });
  assert.equal(await db.user.count({ where: { email: next.email } }), 0);
});
test("failed email delivery leaves no usable pending challenge", async () => {
  const data = input(4);
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  try {
    await assert.rejects(svc.requestRegistrationOtp(data), { status: 503 });
    assert.equal(await db.pendingRegistration.count({ where: { email: data.email } }), 0);
    assert.equal(await db.user.count({ where: { email: data.email } }), 0);
  } finally {
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), "https://api.resend.com/emails");
      const body = JSON.parse(String(init?.body));
      const otp = String(body.text).match(/pendaftaran Gheverhan: (\d{6})/)?.[1];
      assert.ok(otp);
      codes.set(body.to[0], otp);
      return new Response("{}", { status: 200 });
    };
  }
});
