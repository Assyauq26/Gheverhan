/** Uses disposable localhost PostgreSQL exclusively; no real email delivery. */
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";

const target = process.env.SPRINT1_TEST_DATABASE_URL;
if (!target) throw new Error("Local PostgreSQL test DSN required");
const url = new URL(target);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  url.pathname !== "/gheverhan_sprint1_test" ||
  process.env.GHEVERHAN_ISOLATED_TESTS !== "1"
) {
  throw new Error("Refusing to test OTP against a non-disposable database");
}
const suffix = randomUUID().replaceAll("-", "");
const databaseName = "otp_lifecycle_" + suffix;
assert.match(databaseName, /^otp_lifecycle_[a-f0-9]+$/);
const isolated = new URL(target);
isolated.pathname = "/" + databaseName;
const admin = new PrismaClient({ datasources: { db: { url: target } } });
const db = new PrismaClient({
  datasources: { db: { url: isolated.toString() } },
});
let created = false;
process.env.DATABASE_URL = isolated.toString();
process.env.DIRECT_URL = isolated.toString();
process.env.JWT_SECRET = "disposable-registration-otp-secret-only";
process.env.RESEND_API_KEY = "dummy-only-test-mail-key";
process.env.PASSWORD_RESET_FROM = "Gheverhan <test@example.test>";
delete process.env.REGISTRATION_OTP_TEST_SINK;
const domain = suffix + ".example.test";
const codes = new Map<string, string>();
const originalFetch = globalThis.fetch;
let svc: typeof import("../../src/modules/auth/auth.service");
let client: typeof import("../../src/modules/auth/registration-otp");
let shared: PrismaClient;
let phoneSeq = 1000;
const challenges = new Map<string, string>();
async function start(data: unknown) {
  const result = await svc.requestRegistrationOtp(data);
  challenges.set(result.email, result.challengeId);
  return result;
}
const verify = (email: string, code: string) =>
  svc.verifyRegistrationOtp(email, code, challenges.get(email)!);
const resend = (email: string) =>
  svc.resendRegistrationOtp(email, challenges.get(email)!);
const generation = "00000000-0000-4000-8000-000000000001";

function input(n: number) {
  return {
    name: "Pengguna Tes",
    email: "otp-" + n + "@" + domain,
    phone: "0812345" + String(++phoneSeq).padStart(5, "0"),
    password: "dummy-test-password",
    confirmPassword: "dummy-test-password",
    terms: true,
  };
}
before(async () => {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  created = true;
  const migration = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: process.env, encoding: "utf8", timeout: 25000 },
  );
  assert.equal(
    migration.status,
    0,
    "Disposable OTP schema must migrate before service tests",
  );
  svc = await import("../../src/modules/auth/auth.service");
  client = await import("../../src/modules/auth/registration-otp");
  shared = (await import("../../src/lib/prisma")).prisma;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.resend.com/emails");
    const body = JSON.parse(String(init?.body));
    const otp = String(body.text).match(/pendaftaran JetSeller Demo Store: (\d{6})/)?.[1];
    assert.ok(otp);
    codes.set(body.to[0], otp);
    return new Response("{}", { status: 200 });
  };
});
after(async () => {
  globalThis.fetch = originalFetch;
  await shared?.$disconnect();
  await db.$disconnect();
  try {
    if (created)
      await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`);
  } finally {
    await admin.$disconnect();
  }
});
test("phone normalization and unguessable keyed OTP digest", () => {
  for (const whitespace of client.REGISTRATION_WHITESPACE) {
    assert.equal(
      client.normalizeRegistrationPhone("0812" + whitespace + "34567890"),
      "+6281234567890",
    );
  }
  assert.equal(
    client.normalizeRegistrationPhone("0812 3456 7890"),
    "+6281234567890",
  );
  assert.equal(
    client.normalizeRegistrationPhone("+6281234567890"),
    "+6281234567890",
  );
  assert.throws(() => client.normalizeRegistrationPhone("abc"), {
    status: 400,
  });
  const code = client.generateRegistrationOtp();
  assert.match(code, /^\d{6}$/);
  const hash = client.hashRegistrationOtp(
    "test@example.test",
    code,
    generation,
  );
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(
    client.compareRegistrationOtp("test@example.test", code, hash, generation),
    true,
  );
  assert.equal(
    client.compareRegistrationOtp("other@example.test", code, hash, generation),
    false,
  );
});
test("email verification is required before account exists; bad OTP cannot create account", async () => {
  const data = input(1);
  await start(data);
  assert.equal(await db.user.count({ where: { email: data.email } }), 0);
  const pending = await db.pendingRegistration.findUniqueOrThrow({
    where: { email: data.email },
  });
  assert.notEqual(pending.passwordHash, data.password);
  assert.match(pending.codeHash, /^[0-9a-f]{64}$/);
  const otp = codes.get(data.email)!;
  assert.ok(otp);
  await assert.rejects(
    verify(data.email, otp === "000000" ? "111111" : "000000"),
    { status: 400 },
  );
  assert.equal(
    (
      await db.pendingRegistration.findUniqueOrThrow({
        where: { email: data.email },
      })
    ).attempts,
    1,
  );
  const user = await verify(data.email, otp);
  assert.equal(user.email, data.email);
  assert.ok(user.emailVerifiedAt);
  assert.equal(user.phone, client.normalizeRegistrationPhone(data.phone));
  assert.equal((await svc.authenticate(data.phone, data.password)).id, user.id);
  assert.equal(
    (await svc.authenticate(user.phone!, data.password)).id,
    user.id,
  );
  assert.equal(
    await db.pendingRegistration.count({ where: { email: data.email } }),
    0,
  );
  await assert.rejects(verify(data.email, otp), {
    status: 400,
  });
  await assert.rejects(start(data), {
    status: 409,
    message:
      "Email atau nomor HP sudah terdaftar. Silakan masuk atau reset password.",
  });
  assert.equal(await db.user.count({ where: { email: data.email } }), 1);
});
test("cooldown, expiry and five invalid attempts fail closed", async () => {
  const data = input(2);
  await start(data);
  await assert.rejects(resend(data.email), { status: 429 });
  await db.pendingRegistration.update({
    where: { email: data.email },
    data: { sentAt: new Date(Date.now() - 70_000) },
  });
  await resend(data.email);
  assert.equal(
    (
      await db.pendingRegistration.findUniqueOrThrow({
        where: { email: data.email },
      })
    ).attempts,
    0,
  );
  const code = codes.get(data.email)!;
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) {
    await assert.rejects(verify(data.email, wrong), {
      status: 400,
    });
  }
  await assert.rejects(verify(data.email, code), {
    status: 400,
  });
  assert.equal(await db.user.count({ where: { email: data.email } }), 0);
  const next = input(3);
  await start(next);
  await db.pendingRegistration.update({
    where: { email: next.email },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await assert.rejects(verify(next.email, codes.get(next.email)!), {
    status: 400,
  });
  assert.equal(await db.user.count({ where: { email: next.email } }), 0);
});
test("failed email delivery leaves no usable pending challenge", async () => {
  const data = input(4);
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  try {
    await assert.rejects(start(data), { status: 503 });
    assert.equal(
      await db.pendingRegistration.count({ where: { email: data.email } }),
      0,
    );
    assert.equal(await db.user.count({ where: { email: data.email } }), 0);
  } finally {
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), "https://api.resend.com/emails");
      const body = JSON.parse(String(init?.body));
      const otp = String(body.text).match(
        /pendaftaran JetSeller Demo Store: (\d{6})/,
      )?.[1];
      assert.ok(otp);
      codes.set(body.to[0], otp);
      return new Response("{}", { status: 200 });
    };
  }
});

test("all registration callers require phone, confirmation and explicit consent", async () => {
  const data = input(10);
  for (const patch of [
    { phone: "" },
    { confirmPassword: "" },
    { confirmPassword: "different" },
    { terms: false },
    { password: "é".repeat(40), confirmPassword: "é".repeat(40) },
  ]) {
    await assert.rejects(start({ ...data, ...patch }));
  }
  assert.equal(
    await db.pendingRegistration.count({ where: { email: data.email } }),
    0,
  );
  assert.equal(await db.user.count({ where: { email: data.email } }), 0);
});

test("parallel initial requests reserve once and cannot overwrite the winner", async () => {
  const data = input(11);
  const results = await Promise.allSettled([start(data), start(data)]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  const failure = results.find((x) => x.status === "rejected");
  assert.equal(failure?.status === "rejected" && failure.reason.status, 429);
  const user = await verify(data.email, codes.get(data.email)!);
  assert.ok(user.emailVerifiedAt);
});

test("parallel resend rotates once, invalidates old code, and only one verifier wins", async () => {
  const data = input(12);
  await start(data);
  const oldCode = codes.get(data.email)!;
  await db.pendingRegistration.update({
    where: { email: data.email },
    data: { sentAt: new Date(Date.now() - 70_000) },
  });
  const sent = await Promise.allSettled([
    resend(data.email),
    resend(data.email),
  ]);
  assert.equal(sent.filter((x) => x.status === "fulfilled").length, 1);
  const code = codes.get(data.email)!;
  assert.notEqual(code, oldCode);
  await assert.rejects(verify(data.email, oldCode), {
    status: 400,
  });
  const verified = await Promise.allSettled([
    verify(data.email, code),
    verify(data.email, code),
  ]);
  assert.equal(verified.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(await db.user.count({ where: { email: data.email } }), 1);
});

test("parallel wrong attempts persist exactly five failures and lock out the right OTP", async () => {
  const data = input(13);
  await start(data);
  const code = codes.get(data.email)!;
  const wrong = code === "000000" ? "111111" : "000000";
  const results = await Promise.allSettled(
    Array.from({ length: 7 }, () => verify(data.email, wrong)),
  );
  assert.ok(results.every((x) => x.status === "rejected"));
  assert.equal(
    (
      await db.pendingRegistration.findUniqueOrThrow({
        where: { email: data.email },
      })
    ).attempts,
    5,
  );
  await assert.rejects(verify(data.email, code), {
    status: 400,
  });
  assert.equal(await db.user.count({ where: { email: data.email } }), 0);
});

test("OTP cannot be verified while failed delivery is in flight, including resend", async () => {
  const savedFetch = globalThis.fetch;
  try {
    for (const isResend of [false, true]) {
      const data = input(isResend ? 15 : 14);
      if (isResend) {
        await start(data);
        await db.pendingRegistration.update({
          where: { email: data.email },
          data: { sentAt: new Date(Date.now() - 70_000) },
        });
      }
      let release!: () => void, received!: () => void;
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      const arrived = new Promise<void>((resolve) => {
        received = resolve;
      });
      let code = "";
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        code = body.text.match(/pendaftaran JetSeller Demo Store: (\d{6})/)[1];
        received();
        await blocked;
        return new Response("{}", { status: 503 });
      };
      const operation = isResend ? resend(data.email) : start(data);
      const rejected = assert.rejects(operation, { status: 503 });
      try {
        await arrived;
        const pending = await db.pendingRegistration.findUniqueOrThrow({
          where: { email: data.email },
        });
        challenges.set(data.email, pending.id);
        await assert.rejects(verify(data.email, code), {
          status: 400,
        });
        assert.equal(await db.user.count({ where: { email: data.email } }), 0);
      } finally {
        release();
      }
      await rejected;
      assert.equal(
        await db.pendingRegistration.count({ where: { email: data.email } }),
        0,
      );
      globalThis.fetch = savedFetch;
    }
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test("legacy exact phone and unverified timestamp remain compatible with login", async () => {
  const data = input(16);
  const { hashPassword } = await import("../../src/lib/auth/password");
  const legacy = await db.user.create({
    data: {
      email: data.email,
      name: data.name,
      phone: data.phone,
      passwordHash: await hashPassword(data.password),
    },
  });
  assert.equal(legacy.emailVerifiedAt, null);
  assert.equal(
    (await svc.authenticate(data.phone, data.password)).id,
    legacy.id,
  );
});

test("phone formatting aliases cannot evade the shared login brute-force limit", async () => {
  const data = input(17);
  const { hashPassword } = await import("../../src/lib/auth/password");
  const phone = client.normalizeRegistrationPhone(data.phone);
  await db.user.create({
    data: {
      email: data.email,
      name: data.name,
      phone,
      passwordHash: await hashPassword(data.password),
    },
  });
  for (let n = 0; n < 10; n++) {
    const alias = data.phone.slice(0, 4) + " ".repeat(n) + data.phone.slice(4);
    await assert.rejects(svc.authenticate(alias, "wrong-password"), {
      status: 401,
    });
  }
  await assert.rejects(svc.authenticate(phone, data.password), { status: 429 });
});

test("a newer registration cannot verify different credentials in an older email OTP screen", async () => {
  const data = input(18);
  const first = await start(data);
  await db.pendingRegistration.update({
    where: { email: data.email },
    data: { sentAt: new Date(Date.now() - 70_000) },
  });
  const changed = {
    ...data,
    name: "Different applicant",
    password: "different-test-password",
    confirmPassword: "different-test-password",
  };
  const second = await start(changed);
  assert.notEqual(first.challengeId, second.challengeId);
  const code = codes.get(data.email)!;
  await assert.rejects(
    svc.verifyRegistrationOtp(data.email, code, first.challengeId),
    { status: 400 },
  );
  await assert.rejects(
    svc.resendRegistrationOtp(data.email, first.challengeId),
    { status: 400 },
  );
  assert.equal(await db.user.count({ where: { email: data.email } }), 0);
  const pending = await db.pendingRegistration.findUniqueOrThrow({
    where: { email: data.email },
  });
  assert.equal(pending.id, second.challengeId);
  assert.equal(pending.attempts, 0);
  const user = await svc.verifyRegistrationOtp(
    data.email,
    code,
    second.challengeId,
  );
  assert.equal(user.name, changed.name);
  const { verifyPassword } = await import("../../src/lib/auth/password");
  assert.equal(await verifyPassword(changed.password, user.passwordHash), true);
});

test("missing or foreign challenge cannot verify, resend, or lock the current challenge", async () => {
  const data = input(19);
  const current = await start(data);
  const code = codes.get(data.email)!;
  await assert.rejects(svc.verifyRegistrationOtp(data.email, code, ""));
  await assert.rejects(svc.resendRegistrationOtp(data.email, ""));
  for (let n = 0; n < 13; n++) {
    await assert.rejects(
      svc.verifyRegistrationOtp(data.email, code, randomUUID()),
      { status: 400 },
    );
  }
  await assert.rejects(svc.resendRegistrationOtp(data.email, randomUUID()), {
    status: 400,
  });
  assert.equal(await db.user.count({ where: { email: data.email } }), 0);
  assert.equal(
    (
      await db.pendingRegistration.findUniqueOrThrow({
        where: { email: data.email },
      })
    ).attempts,
    0,
  );
  const user = await svc.verifyRegistrationOtp(
    data.email,
    code,
    current.challengeId,
  );
  assert.ok(user.emailVerifiedAt);
});

test("concurrent verification for a shared phone commits only one account and rejects later requests", async () => {
  const first = input(30);
  const second = { ...input(31), phone: first.phone };
  await start(first);
  await start(second);
  const result = await Promise.allSettled([
    verify(first.email, codes.get(first.email)!),
    verify(second.email, codes.get(second.email)!),
  ]);
  assert.equal(result.filter((x) => x.status === "fulfilled").length, 1);
  const failure = result.find((x) => x.status === "rejected");
  assert.equal(failure?.status === "rejected" && failure.reason.status, 409);
  assert.equal(
    failure?.status === "rejected" && failure.reason.message,
    "Email atau nomor HP sudah terdaftar. Silakan masuk atau reset password.",
  );
  const accounts = await db.user.findMany({
    where: { email: { in: [first.email, second.email] } },
  });
  assert.equal(accounts.length, 1);
  const winner = accounts[0];
  assert.equal(await db.customer.count({ where: { userId: winner.id } }), 1);
  assert.equal(await db.cart.count({ where: { userId: winner.id } }), 1);
  assert.equal(await db.wishlist.count({ where: { userId: winner.id } }), 1);
  assert.equal(
    await db.auditLog.count({
      where: { userId: winner.id, action: "auth.register.verified" },
    }),
    1,
  );
  // A phone conflict is not exposed by initiating registration either.
  const third = { ...input(32), phone: first.phone };
  await assert.rejects(start(third), { status: 409 });
  assert.equal(await db.user.count({ where: { email: third.email } }), 0);
});

test("audit failure rolls back User, Customer, Cart, Wishlist, role and pending consumption", async () => {
  const data = input(33);
  await db.role.upsert({
    where: { name: "Customer" },
    create: { name: "Customer", label: "Customer" },
    update: {},
  });
  await start(data);
  const snapshot = async () =>
    Promise.all([
      db.user.count(),
      db.customer.count(),
      db.cart.count(),
      db.wishlist.count(),
      db.userRole.count(),
      db.auditLog.count(),
    ]);
  const before = await snapshot();
  // This client can only target the unique local disposable database created above.
  await db.$executeRawUnsafe(
    `CREATE FUNCTION otp_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'dummy audit failure'; END $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER otp_reject_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION otp_reject_audit()`,
  );
  try {
    await assert.rejects(verify(data.email, codes.get(data.email)!));
    assert.deepEqual(await snapshot(), before);
    assert.equal(
      await db.pendingRegistration.count({ where: { email: data.email } }),
      1,
    );
    assert.equal(await db.user.count({ where: { email: data.email } }), 0);
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER otp_reject_audit ON "AuditLog"`);
    await db.$executeRawUnsafe(`DROP FUNCTION otp_reject_audit()`);
  }
  const user = await verify(data.email, codes.get(data.email)!);
  assert.ok(user.emailVerifiedAt);
  assert.equal(await db.userRole.count({ where: { userId: user.id } }), 1);
});
