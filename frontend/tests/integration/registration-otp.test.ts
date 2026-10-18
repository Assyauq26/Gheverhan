/** Uses disposable localhost PostgreSQL exclusively; no real email delivery. */
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

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
  await db.pendingRegistration.deleteMany({
    where: { email: { endsWith: "@" + domain } },
  });
  await db.auditLog.deleteMany({
    where: { user: { email: { endsWith: "@" + domain } } },
  });
  await db.user.deleteMany({ where: { email: { endsWith: "@" + domain } } });
  await shared?.$disconnect();
  await db.$disconnect();
});
test("phone normalization and unguessable keyed OTP digest", () => {
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
  const hash = client.hashRegistrationOtp("test@example.test", code);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(
    client.compareRegistrationOtp("test@example.test", code, hash),
    true,
  );
  assert.equal(
    client.compareRegistrationOtp("other@example.test", code, hash),
    false,
  );
});
test("email verification is required before account exists; bad OTP cannot create account", async () => {
  const data = input(1);
  await svc.requestRegistrationOtp(data);
  assert.equal(await db.user.count({ where: { email: data.email } }), 0);
  const pending = await db.pendingRegistration.findUniqueOrThrow({
    where: { email: data.email },
  });
  assert.notEqual(pending.passwordHash, data.password);
  assert.match(pending.codeHash, /^[0-9a-f]{64}$/);
  const otp = codes.get(data.email)!;
  assert.ok(otp);
  await assert.rejects(
    svc.verifyRegistrationOtp(
      data.email,
      otp === "000000" ? "111111" : "000000",
    ),
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
  const user = await svc.verifyRegistrationOtp(data.email, otp);
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
  await assert.rejects(svc.verifyRegistrationOtp(data.email, otp), {
    status: 400,
  });
  await assert.rejects(svc.requestRegistrationOtp(data), { status: 409 });
});
test("cooldown, expiry and five invalid attempts fail closed", async () => {
  const data = input(2);
  await svc.requestRegistrationOtp(data);
  await assert.rejects(svc.resendRegistrationOtp(data.email), { status: 429 });
  await db.pendingRegistration.update({
    where: { email: data.email },
    data: { sentAt: new Date(Date.now() - 70_000) },
  });
  await svc.resendRegistrationOtp(data.email);
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
    await assert.rejects(svc.verifyRegistrationOtp(data.email, wrong), {
      status: 400,
    });
  }
  await assert.rejects(svc.verifyRegistrationOtp(data.email, code), {
    status: 400,
  });
  assert.equal(await db.user.count({ where: { email: data.email } }), 0);
  const next = input(3);
  await svc.requestRegistrationOtp(next);
  await db.pendingRegistration.update({
    where: { email: next.email },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await assert.rejects(
    svc.verifyRegistrationOtp(next.email, codes.get(next.email)!),
    { status: 400 },
  );
  assert.equal(await db.user.count({ where: { email: next.email } }), 0);
});
test("failed email delivery leaves no usable pending challenge", async () => {
  const data = input(4);
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  try {
    await assert.rejects(svc.requestRegistrationOtp(data), { status: 503 });
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
        /pendaftaran Gheverhan: (\d{6})/,
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
    await assert.rejects(svc.requestRegistrationOtp({ ...data, ...patch }));
  }
  assert.equal(
    await db.pendingRegistration.count({ where: { email: data.email } }),
    0,
  );
  assert.equal(await db.user.count({ where: { email: data.email } }), 0);
});

test("parallel initial requests reserve once and cannot overwrite the winner", async () => {
  const data = input(11);
  const results = await Promise.allSettled([
    svc.requestRegistrationOtp(data),
    svc.requestRegistrationOtp(data),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  const failure = results.find((x) => x.status === "rejected");
  assert.equal(failure?.status === "rejected" && failure.reason.status, 429);
  const user = await svc.verifyRegistrationOtp(
    data.email,
    codes.get(data.email)!,
  );
  assert.ok(user.emailVerifiedAt);
});

test("parallel resend rotates once, invalidates old code, and only one verifier wins", async () => {
  const data = input(12);
  await svc.requestRegistrationOtp(data);
  const oldCode = codes.get(data.email)!;
  await db.pendingRegistration.update({
    where: { email: data.email },
    data: { sentAt: new Date(Date.now() - 70_000) },
  });
  const sent = await Promise.allSettled([
    svc.resendRegistrationOtp(data.email),
    svc.resendRegistrationOtp(data.email),
  ]);
  assert.equal(sent.filter((x) => x.status === "fulfilled").length, 1);
  const code = codes.get(data.email)!;
  assert.notEqual(code, oldCode);
  await assert.rejects(svc.verifyRegistrationOtp(data.email, oldCode), {
    status: 400,
  });
  const verified = await Promise.allSettled([
    svc.verifyRegistrationOtp(data.email, code),
    svc.verifyRegistrationOtp(data.email, code),
  ]);
  assert.equal(verified.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(await db.user.count({ where: { email: data.email } }), 1);
});

test("parallel wrong attempts persist exactly five failures and lock out the right OTP", async () => {
  const data = input(13);
  await svc.requestRegistrationOtp(data);
  const code = codes.get(data.email)!;
  const wrong = code === "000000" ? "111111" : "000000";
  const results = await Promise.allSettled(
    Array.from({ length: 7 }, () =>
      svc.verifyRegistrationOtp(data.email, wrong),
    ),
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
  await assert.rejects(svc.verifyRegistrationOtp(data.email, code), {
    status: 400,
  });
  assert.equal(await db.user.count({ where: { email: data.email } }), 0);
});

test("OTP cannot be verified while failed delivery is in flight, including resend", async () => {
  const savedFetch = globalThis.fetch;
  try {
    for (const resend of [false, true]) {
      const data = input(resend ? 15 : 14);
      if (resend) {
        await svc.requestRegistrationOtp(data);
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
        code = body.text.match(/pendaftaran Gheverhan: (\d{6})/)[1];
        received();
        await blocked;
        return new Response("{}", { status: 503 });
      };
      const operation = resend
        ? svc.resendRegistrationOtp(data.email)
        : svc.requestRegistrationOtp(data);
      const rejected = assert.rejects(operation, { status: 503 });
      try {
        await arrived;
        await assert.rejects(svc.verifyRegistrationOtp(data.email, code), {
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
