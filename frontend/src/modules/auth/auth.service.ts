import { enforceAuthRateLimit } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/prisma";
import { Prisma, type PendingRegistration } from "@prisma/client";
import {
  hashPassword,
  verifyPassword,
  DUMMY_PASSWORD_HASH,
} from "@/lib/auth/password";
import { HttpError } from "@/lib/response";
import { writeAudit } from "@/modules/audit/audit.service";
import { randomBytes, randomUUID, createHash } from "crypto";
import {
  resetMailConfig,
  sendPasswordResetEmail,
} from "./password-reset-email";

import {
  registrationMailConfig,
  sendRegistrationOtpEmail,
} from "./registration-otp-email";
import {
  normalizeRegistrationPhone,
  generateRegistrationOtp,
  hashRegistrationOtp,
  compareRegistrationOtp,
} from "./registration-otp";

import {
  registrationSchema,
  registrationResendSchema,
  registrationVerificationSchema,
} from "./registration-schema";

export const REGISTRATION_OTP_DELIVERY_FAILURE = "OTP tidak dapat dikirim. Coba lagi nanti.";
const REGISTRATION_TTL_MS = 10 * 60_000;
const REGISTRATION_RESEND_MS = 60_000;
const REGISTRATION_MAX_ATTEMPTS = 5;

/** A delivery reservation cannot be used as an OTP digest, even while the provider is in flight. */
async function deliverRegistrationOtp(
  email: string,
  code: string,
  reservation: string,
  challengeId: string,
  config: ReturnType<typeof registrationMailConfig>,
) {
  try {
    await sendRegistrationOtpEmail(email, code, config);
    const activated = await prisma.pendingRegistration.updateMany({
      where: {
        id: challengeId,
        email,
        codeHash: reservation,
        expiresAt: { gt: new Date() },
      },
      data: { codeHash: hashRegistrationOtp(email, code, challengeId) },
    });
    if (activated.count !== 1)
      throw new HttpError("Sesi pendaftaran berubah. Daftar kembali.", 409);
  } catch {
    // A late failed delivery must never delete a newer reservation.
    await prisma.pendingRegistration.deleteMany({
      where: { id: challengeId, email, codeHash: reservation },
    });
    throw new HttpError(REGISTRATION_OTP_DELIVERY_FAILURE, 503);
  }
  return {
    email,
    challengeId,
    resendAvailableAt: Date.now() + REGISTRATION_RESEND_MS,
  };
}

/** No user/session or plaintext password/OTP is persisted before successful verification. */
export async function requestRegistrationOtp(input: unknown) {
  const data = registrationSchema.parse(input);
  const { email } = data;
  const phone = normalizeRegistrationPhone(data.phone);
  const config = registrationMailConfig();
  await enforceAuthRateLimit("register", email);
  // Do not expose existing email/phone before inbox verification. The unique
  // constraints arbitrate conflicts atomically only after a valid OTP.
  const current = await prisma.pendingRegistration.findUnique({
    where: { email },
  });
  let code = generateRegistrationOtp();
  while (
    current &&
    compareRegistrationOtp(email, code, current.codeHash, current.id)
  )
    code = generateRegistrationOtp();
  const challengeId = randomUUID();
  // Validate signing configuration before persisting anything; never store an unkeyed 6-digit hash.
  hashRegistrationOtp(email, code, challengeId);
  const passwordHash = await hashPassword(data.password);
  const now = new Date(),
    cutoff = new Date(now.getTime() - REGISTRATION_RESEND_MS);
  const reservation = "sending:" + randomUUID();
  const values = {
    id: challengeId,
    name: data.name,
    phone,
    passwordHash,
    codeHash: reservation,
    attempts: 0,
    expiresAt: new Date(now.getTime() + REGISTRATION_TTL_MS),
    sentAt: now,
  };
  if (current) {
    const saved = await prisma.pendingRegistration.updateMany({
      where: {
        id: current.id,
        codeHash: current.codeHash,
        sentAt: { lte: cutoff },
      },
      data: values,
    });
    if (saved.count !== 1)
      throw new HttpError("Tunggu 60 detik sebelum meminta OTP baru.", 429);
  } else {
    try {
      await prisma.pendingRegistration.create({ data: { email, ...values } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new HttpError("Tunggu 60 detik sebelum meminta OTP baru.", 429);
      }
      throw err;
    }
  }
  return deliverRegistrationOtp(email, code, reservation, challengeId, config);
}

/** Unknown generations cannot consume the victim's per-email quotas. */
async function registrationChallenge(email: string, challengeId: string) {
  await enforceAuthRateLimit(
    "registerConfirm",
    "challenge:" + email + ":" + challengeId,
  );
  const current = await prisma.pendingRegistration.findUnique({
    where: { id: challengeId },
  });
  if (!current || current.email !== email)
    throw new HttpError(
      "Sesi pendaftaran tidak valid atau kedaluwarsa. Daftar kembali.",
      400,
    );
  return current;
}

export async function resendRegistrationOtp(
  emailInput: string,
  challengeInput: string,
) {
  const { email, challengeId } = registrationResendSchema.parse({
    email: emailInput,
    challengeId: challengeInput,
  });
  const config = registrationMailConfig();
  const current = await registrationChallenge(email, challengeId);
  await enforceAuthRateLimit("register", email);
  const now = new Date();
  if (!current || current.expiresAt <= now) {
    throw new HttpError(
      "Sesi pendaftaran berakhir. Silakan daftar kembali.",
      400,
    );
  }
  let code = generateRegistrationOtp();
  // The previous code must not survive a resend, including a random collision.
  while (compareRegistrationOtp(email, code, current.codeHash, current.id))
    code = generateRegistrationOtp();
  hashRegistrationOtp(email, code, challengeId);
  const reservation = "sending:" + randomUUID();
  const saved = await prisma.pendingRegistration.updateMany({
    where: {
      id: current.id,
      codeHash: current.codeHash,
      sentAt: { lte: new Date(now.getTime() - REGISTRATION_RESEND_MS) },
      expiresAt: { gt: now },
    },
    data: {
      codeHash: reservation,
      attempts: 0,
      expiresAt: new Date(now.getTime() + REGISTRATION_TTL_MS),
      sentAt: now,
    },
  });
  if (saved.count !== 1)
    throw new HttpError("Tunggu 60 detik sebelum meminta OTP baru.", 429);
  return deliverRegistrationOtp(email, code, reservation, challengeId, config);
}

export async function verifyRegistrationOtp(
  emailInput: string,
  otp: string,
  challengeInput: string,
) {
  const { email, challengeId } = registrationVerificationSchema.parse({
    email: emailInput,
    otp,
    challengeId: challengeInput,
  });
  await registrationChallenge(email, challengeId);
  await enforceAuthRateLimit("registerConfirm", email);
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Lock before reading credential snapshots. Attempts, resend and account creation serialize.
      // Email delivery and password hashing always happen outside this short transaction.
      const rows = await tx.$queryRaw<PendingRegistration[]>`
        SELECT * FROM "PendingRegistration" WHERE "email" = ${email} AND "id" = ${challengeId} FOR UPDATE`;
      const pending = rows[0];
      if (
        !pending ||
        pending.expiresAt <= new Date() ||
        pending.attempts >= REGISTRATION_MAX_ATTEMPTS ||
        pending.codeHash.startsWith("sending:")
      ) {
        return {
          error: "Kode OTP tidak valid atau kedaluwarsa. Daftar kembali.",
        } as const;
      }
      if (!compareRegistrationOtp(email, otp, pending.codeHash, pending.id)) {
        await tx.pendingRegistration.update({
          where: { id: pending.id },
          data: { attempts: { increment: 1 } },
        });
        // Return rather than throw inside the transaction: persist the rejected attempt.
        return { error: "Kode OTP salah atau kedaluwarsa." } as const;
      }
      await tx.pendingRegistration.delete({ where: { id: pending.id } });
      const role = await tx.role.findUnique({ where: { name: "Customer" } });
      const user = await tx.user.create({
        data: {
          name: pending.name,
          email,
          phone: pending.phone,
          passwordHash: pending.passwordHash,
          emailVerifiedAt: new Date(),
          customer: {
            create: { fullName: pending.name, phone: pending.phone },
          },
          cart: { create: {} },
          wishlist: { create: {} },
          ...(role ? { roles: { create: { roleId: role.id } } } : {}),
        },
      });
      await writeAudit(
        {
          userId: user.id,
          action: "auth.register.verified",
          entity: "User",
          entityId: user.id,
        },
        tx,
      );
      return { user } as const;
    });
    if (result.error !== undefined) throw new HttpError(result.error, 400);
    return result.user;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new HttpError(
        "Pendaftaran tidak dapat diselesaikan. Gunakan data lain atau masuk/reset password jika sudah memiliki akun.",
        409,
      );
    }
    throw err;
  }
}

export async function authenticate(identifier: string, password: string) {
  const value = identifier.toLowerCase().trim();
  let normalized: string | undefined;
  try {
    normalized = normalizeRegistrationPhone(identifier);
  } catch (error) {
    if (!(error instanceof HttpError && error.status === 400)) throw error;
  }
  // Formatting aliases must share a quota; otherwise spaces could evade brute-force limits.
  await enforceAuthRateLimit("login", normalized ?? value);
  let user = await prisma.user.findFirst({
    where: { OR: [{ email: value }, { phone: identifier.trim() }] },
  });
  // Preserve exact legacy identities; add local-format login for newly normalized numbers.
  if (!user && normalized && normalized !== identifier.trim()) {
    user = await prisma.user.findUnique({ where: { phone: normalized } });
  }
  const valid = await verifyPassword(
    password,
    user?.isActive ? user.passwordHash : DUMMY_PASSWORD_HASH,
  );
  if (!user || !user.isActive || !valid)
    throw new HttpError("Email/No HP atau password salah", 401);
  return user;
}

const tokenDigest = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function requestPasswordReset(email: string) {
  // Check configuration BEFORE account lookup, so an unconfigured provider
  // cannot silently claim that mail has been sent to existing accounts.
  await enforceAuthRateLimit("reset", email);
  const config = resetMailConfig();
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });
  if (!user || !user.isActive) return; // keep the form response identical for unknown emails
  const token = randomBytes(32).toString("hex");
  const record = await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      token: tokenDigest(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  try {
    await sendPasswordResetEmail(user.email, token, config);
  } catch {
    // A failed email must not leave a usable reset token behind.
    await prisma.passwordResetToken.deleteMany({ where: { id: record.id } });
    throw new HttpError(
      "Email reset password gagal dikirim. Coba lagi nanti.",
      503,
    );
  }
}

export async function resetPassword(token: string, newPassword: string) {
  if (!/^[0-9a-f]{64}$/i.test(token))
    throw new HttpError("Token reset tidak valid atau kedaluwarsa", 400);
  await enforceAuthRateLimit("resetConfirm", tokenDigest(token));
  const record = await prisma.passwordResetToken.findUnique({
    where: { token: tokenDigest(token) },
  });
  if (!record)
    throw new HttpError("Token reset tidak valid atau kedaluwarsa", 400);
  const hash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    // Atomic consume prevents two parallel submissions of the same reset link.
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1)
      throw new HttpError("Token reset tidak valid atau kedaluwarsa", 400);
    await tx.user.update({
      where: { id: record.userId, isActive: true },
      data: { passwordHash: hash, sessionVersion: { increment: 1 } },
    });
    await tx.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await writeAudit(
      {
        userId: record.userId,
        action: "auth.password.reset",
        entity: "User",
        entityId: record.userId,
      },
      tx,
    );
  });
}
