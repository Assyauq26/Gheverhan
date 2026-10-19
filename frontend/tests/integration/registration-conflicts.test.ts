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
const databaseName = "registration_conflicts_" + suffix;
assert.match(databaseName, /^registration_conflicts_[a-f0-9]+$/);
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
    const otp = String(body.text).match(/pendaftaran Gheverhan: (\d{6})/)?.[1];
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

const conflictMessage =
  "Email atau nomor HP sudah terdaftar. Silakan masuk atau reset password.";
async function fixture(
  n: number,
  patch: { email?: string; phone?: string; isActive?: boolean } = {},
) {
  const data = input(n);
  const { hashPassword } = await import("../../src/lib/auth/password");
  const user = await db.user.create({
    data: {
      name: data.name,
      email: patch.email ?? data.email,
      phone: patch.phone ?? client.normalizeRegistrationPhone(data.phone),
      isActive: patch.isActive ?? true,
      passwordHash: await hashPassword(data.password),
    },
  });
  return { data, user };
}

test("existing identities reject before provider or pending mutations, including case and legacy phone aliases", async () => {
  const scenarios = [
    "email",
    "phone",
    "both",
    "email-case",
    "phone-local",
    "phone-international",
    "phone-formatted",
    "legacy-format",
    "legacy-unicode-format",
    "legacy-unicode-email",
    "inactive",
  ];
  let calls = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    calls++;
    return previous(...args);
  };
  try {
    for (let n = 0; n < scenarios.length; n++) {
      const kind = scenarios[n];
      const data = input(100 + n);
      const storedEmail =
        kind === "email-case"
          ? data.email.toUpperCase()
          : kind === "legacy-unicode-email"
            ? "\u00a0" + data.email.toUpperCase() + "\ufeff"
            : data.email;
      const storedPhone =
        kind === "legacy-format"
          ? data.phone.slice(0, 4) + " " + data.phone.slice(4)
          : kind === "legacy-unicode-format"
            ? data.phone.slice(0, 4) + "\u00a0" + data.phone.slice(4) + "\ufeff"
            : client.normalizeRegistrationPhone(data.phone);
      const { hashPassword } = await import("../../src/lib/auth/password");
      await db.user.create({
        data: {
          name: data.name,
          email: storedEmail,
          phone: storedPhone,
          isActive: kind !== "inactive",
          passwordHash: await hashPassword(data.password),
        },
      });
      const proposed = { ...data };
      if (
        [
          "phone",
          "phone-local",
          "phone-international",
          "phone-formatted",
          "legacy-format",
          "legacy-unicode-format",
        ].includes(kind)
      )
        proposed.email = "new-" + data.email;
      if (
        ["email", "email-case", "legacy-unicode-email", "inactive"].includes(
          kind,
        )
      )
        proposed.phone = input(300 + n).phone;
      if (kind === "email-case")
        proposed.email = " " + data.email.toUpperCase() + " ";
      if (kind === "phone-international")
        proposed.phone = "62" + data.phone.slice(1);
      if (kind === "phone-formatted")
        proposed.phone =
          "(" + data.phone.slice(0, 4) + ") " + data.phone.slice(4);
      // Existing pending data must remain untouched, rather than overwritten on rejection.
      if (n === 0)
        await db.pendingRegistration.create({
          data: {
            id: randomUUID(),
            email: proposed.email,
            name: "Pending dummy",
            phone: client.normalizeRegistrationPhone(proposed.phone),
            passwordHash: "dummy-hash",
            codeHash: "a".repeat(64),
            expiresAt: new Date(Date.now() + 60_000),
            sentAt: new Date(Date.now() - 70_000),
          },
        });
      const before = await db.pendingRegistration.findMany({
        orderBy: { id: "asc" },
      });
      await assert.rejects(
        start(proposed),
        {
          status: 409,
          code: "REGISTRATION_CONFLICT",
          message: conflictMessage,
        },
        kind,
      );
      assert.equal(
        calls,
        0,
        "Provider must not receive requests for existing identities",
      );
      assert.deepEqual(
        await db.pendingRegistration.findMany({ orderBy: { id: "asc" } }),
        before,
        kind,
      );
    }
  } finally {
    globalThis.fetch = previous;
  }
});

test("rotating email or phone formatting cannot bypass the shared phone probe limit", async () => {
  const { data } = await fixture(400);
  for (let n = 0; n < 3; n++)
    await assert.rejects(
      start({
        ...data,
        email: "probe-" + n + "@" + domain,
        phone: data.phone.slice(0, 4) + " ".repeat(n) + data.phone.slice(4),
      }),
      { status: 409 },
    );
  await assert.rejects(
    start({
      ...data,
      email: "probe-4@" + domain,
      phone: client.normalizeRegistrationPhone(data.phone),
    }),
    { status: 429 },
  );
  assert.equal(
    await db.pendingRegistration.count({
      where: { phone: client.normalizeRegistrationPhone(data.phone) },
    }),
    0,
  );
});

test("new challenge metadata and reload status use database deadlines, not another client ten minutes", async () => {
  const data = input(500),
    result = await start(data);
  const row = await db.pendingRegistration.findUniqueOrThrow({
    where: { id: result.challengeId },
  });
  assert.equal(result.expiresAt, row.expiresAt.getTime());
  assert.equal(result.resendAvailableAt, row.sentAt.getTime() + 60_000);
  assert.ok(result.serverNow <= Date.now());
  assert.equal(result.status, "active");
  const expiresAt = new Date(Date.now() + 25_000);
  await db.pendingRegistration.update({
    where: { id: row.id },
    data: { expiresAt },
  });
  const recovered = await svc.getRegistrationChallenge(data.email, row.id);
  assert.equal(recovered.expiresAt, expiresAt.getTime());
  assert.deepEqual(
    Object.keys(recovered).sort(),
    [
      "email",
      "challengeId",
      "expiresAt",
      "resendAvailableAt",
      "serverNow",
      "status",
    ].sort(),
  );
  assert.equal(
    (await db.pendingRegistration.findUniqueOrThrow({ where: { id: row.id } }))
      .attempts,
    0,
  );
  await assert.rejects(svc.getRegistrationChallenge(data.email, randomUUID()), {
    code: "CHALLENGE_MISSING",
  });
});

test("expired codes stay invalid while resend renews an existing challenge within bounded recovery", async () => {
  const data = input(501),
    first = await start(data),
    old = codes.get(data.email)!;
  await db.pendingRegistration.update({
    where: { id: first.challengeId },
    data: {
      expiresAt: new Date(Date.now() - 1000),
      sentAt: new Date(Date.now() - 70_000),
    },
  });
  assert.equal(
    (await svc.getRegistrationChallenge(data.email, first.challengeId)).status,
    "expired",
  );
  await assert.rejects(verify(data.email, old), {
    code: "OTP_EXPIRED",
    status: 400,
  });
  const renewed = await resend(data.email);
  const row = await db.pendingRegistration.findUniqueOrThrow({
    where: { id: first.challengeId },
  });
  assert.equal(renewed.challengeId, first.challengeId);
  assert.equal(renewed.expiresAt, row.expiresAt.getTime());
  assert.notEqual(codes.get(data.email), old);
  await assert.rejects(verify(data.email, old), { code: "OTP_INVALID" });
  await verify(data.email, codes.get(data.email)!);
});

test("resend never calls provider or mutates pending when an identity became occupied", async () => {
  const data = input(502),
    first = await start(data);
  await db.pendingRegistration.update({
    where: { id: first.challengeId },
    data: { sentAt: new Date(Date.now() - 70_000) },
  });
  await db.user.create({
    data: {
      name: data.name,
      email: "occupied-" + data.email,
      phone: client.normalizeRegistrationPhone(data.phone),
      passwordHash: "dummy",
    },
  });
  const snapshot = await db.pendingRegistration.findUniqueOrThrow({
    where: { id: first.challengeId },
  });
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (...args) => {
    calls++;
    return previous(...args);
  };
  try {
    await assert.rejects(resend(data.email), {
      code: "REGISTRATION_CONFLICT",
      status: 409,
    });
    assert.equal(calls, 0);
    assert.deepEqual(
      await db.pendingRegistration.findUniqueOrThrow({
        where: { id: first.challengeId },
      }),
      snapshot,
    );
    await assert.rejects(verify(data.email, codes.get(data.email)!), {
      code: "REGISTRATION_CONFLICT",
      status: 409,
    });
    assert.equal(await db.user.count({ where: { email: data.email } }), 0);
  } finally {
    globalThis.fetch = previous;
  }
});

test("a delivered email cannot activate a generation if an identity was claimed during provider I/O", async () => {
  const data = input(503),
    previous = globalThis.fetch;
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  const started = new Promise<void>((r) => {
    entered = r;
  });
  globalThis.fetch = async (...args) => {
    entered();
    await held;
    return previous(...args);
  };
  const operation = start(data);
  const rejected = assert.rejects(operation, {
    code: "REGISTRATION_CONFLICT",
    status: 409,
  });
  try {
    await started;
    await db.user.create({
      data: {
        name: data.name,
        email: data.email,
        phone: client.normalizeRegistrationPhone(data.phone),
        passwordHash: "existing-dummy",
      },
    });
    release();
    await rejected;
    assert.equal(await db.user.count({ where: { email: data.email } }), 1);
    assert.equal(
      await db.pendingRegistration.count({ where: { email: data.email } }),
      0,
    );
  } finally {
    release();
    globalThis.fetch = previous;
  }
});

test("RLS-filtered identity lookup fails closed instead of treating hidden accounts as available", async () => {
  const data = input(504);
  const role = "registration_hidden_" + suffix;
  assert.match(role, /^registration_hidden_[a-f0-9]+$/);
  const beforeRls = await db.$queryRaw<
    { enabled: boolean }[]
  >`SELECT relrowsecurity AS enabled FROM pg_class WHERE oid='public."User"'::regclass`;
  await db.$executeRawUnsafe('ALTER TABLE "User" ENABLE ROW LEVEL SECURITY');
  await db.$executeRawUnsafe(`CREATE ROLE "${role}" NOLOGIN`);
  try {
    await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    await db.$executeRawUnsafe(`GRANT SELECT ON "User" TO "${role}"`);
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
      await assert.rejects(
        svc.assertRegistrationIdentityAvailable(
          tx,
          data.email,
          client.normalizeRegistrationPhone(data.phone),
        ),
        { status: 503 },
      );
    });
  } finally {
    await db.$executeRawUnsafe(`DROP OWNED BY "${role}"`);
    await db.$executeRawUnsafe(`DROP ROLE "${role}"`);
    if (!beforeRls[0].enabled)
      await db.$executeRawUnsafe(
        'ALTER TABLE "User" DISABLE ROW LEVEL SECURITY',
      );
  }
});

test("a stranded sending reservation is unverifiable but can be atomically replaced after cooldown", async () => {
  const data = input(800);
  const first = await start(data);
  const originalCode = codes.get(data.email)!;
  await db.pendingRegistration.update({
    where: { id: first.challengeId },
    data: {
      codeHash: "sending:" + randomUUID(),
      sentAt: new Date(Date.now() - 70_000),
    },
  });
  const status = await svc.getRegistrationChallenge(
    data.email,
    first.challengeId,
  );
  assert.equal(status.status, "sending");
  await assert.rejects(verify(data.email, originalCode), {
    code: "OTP_SENDING",
  });
  assert.equal(await db.user.count({ where: { email: data.email } }), 0);
  const recovered = await resend(data.email);
  assert.equal(recovered.status, "active");
  assert.equal(recovered.challengeId, first.challengeId);
  assert.ok(recovered.resendAvailableAt > Date.now());
  assert.ok(recovered.expiresAt > Date.now() + 590_000);
  const user = await verify(data.email, codes.get(data.email)!);
  assert.ok(user.emailVerifiedAt);
  assert.equal(await db.user.count({ where: { email: data.email } }), 1);
});
