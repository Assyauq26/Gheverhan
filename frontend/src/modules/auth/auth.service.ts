import { enforceAuthRateLimit } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { hashPassword, verifyPassword, DUMMY_PASSWORD_HASH } from "@/lib/auth/password";
import { HttpError } from "@/lib/response";
import { writeAudit } from "@/modules/audit/audit.service";
import { randomBytes, createHash } from "crypto";
import { resetMailConfig, sendPasswordResetEmail } from "./password-reset-email";
i
const REGISTRATION_TTL_MS = 10 * 60_000;
const REGISTRATION_RESEND_MS = 60_000;
const REGISTRATION_MAX_ATTEMPTS = 5;

/** No plaintext password or OTP is persisted before email ownership is verified. */
export async function requestRegistrationOtp(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
}) {
  const email = input.email.toLowerCase().trim();
  const phone = normalizeRegistrationPhone(input.phone);
  // Provider configuration and rate limits are checked before any pending state is created.
  const config = registrationMailConfig();
  await enforceAuthRateLimit("register", email);
  const duplicate = await prisma.user.findFirst({ where: { OR: [{ email }, { phone }] }, select: { email: true, phone: true } });
  if (duplicate) throw new HttpError(duplicate.email === email ? "Email sudah terdaftar" : "No. HP sudah terdaftar", 409);
  const current = await prisma.pendingRegistration.findUnique({ where: { email } });
  if (current && current.sentAt.getTime() > Date.now() - REGISTRATION_RESEND_MS) {
    throw new HttpError("Tunggu 60 detik sebelum meminta OTP baru.", 429);
  }
  const code = generateRegistrationOtp();
  const passwordHash = await hashPassword(input.password);
  const codeHash = hashRegistrationOtp(email, code);
  const record = await prisma.pendingRegistration.upsert({
    where: { email },
    create: { email, name: input.name.trim(), phone, passwordHash, codeHash,
      attempts: 0, expiresAt: new Date(Date.now() + REGISTRATION_TTL_MS), sentAt: new Date() },
    update: { name: input.name.trim(), phone, passwordHash, codeHash,
      attempts: 0, expiresAt: new Date(Date.now() + REGISTRATION_TTL_MS), sentAt: new Date() },
  });
  try {
    await sendRegistrationOtpEmail(email, code, config);
  } catch {
    await prisma.pendingRegistration.deleteMany({ where: { id: record.id, codeHash } });
    throw new HttpError("OTP tidak dapat dikirim. Coba lagi nanti.", 503);
  }
  return { email };
}

export async function resendRegistrationOtp(emailInput: string) {
  const email = emailInput.toLowerCase().trim();
  const config = registrationMailConfig();
  await enforceAuthRateLimit("register", email);
  const current = await prisma.pendingRegistration.findUnique({ where: { email } });
  if (!current || current.expiresAt <= new Date()) {
    throw new HttpError("Sesi pendaftaran berakhir. Silakan daftar kembali.", 400);
  }
  if (current.sentAt.getTime() > Date.now() - REGISTRATION_RESEND_MS) {
    throw new HttpError("Tunggu 60 detik sebelum meminta OTP baru.", 429);
  }
  const code = generateRegistrationOtp(), codeHash = hashRegistrationOtp(email, code);
  const saved = await prisma.pendingRegistration.updateMany({
    where: { id: current.id, codeHash: current.codeHash, expiresAt: { gt: new Date() } },
    data: { codeHash, attempts: 0, expiresAt: new Date(Date.now() + REGISTRATION_TTL_MS), sentAt: new Date() },
  });
  if (saved.count !== 1) throw new HttpError("Sesi pendaftaran berubah. Coba lagi.", 409);
  try { await sendRegistrationOtpEmail(email, code, config); }
  catch {
    await prisma.pendingRegistration.deleteMany({ where: { id: current.id, codeHash } });
    throw new HttpError("OTP tidak dapat dikirim. Coba lagi nanti.", 503);
  }
  return { email };
}

export async function verifyRegistrationOtp(emailInput: string, otp: string) {
  const email = emailInput.toLowerCase().trim();
  await enforceAuthRateLimit("registerConfirm", email);
  if (!/^\d{6}$/.test(otp)) throw new HttpError("Kode OTP harus berisi 6 angka.", 400);
  const pending = await prisma.pendingRegistration.findUnique({ where: { email } });
  if (!pending || pending.expiresAt <= new Date() || pending.attempts >= REGISTRATION_MAX_ATTEMPTS) {
    throw new HttpError("Kode OTP tidak valid atau kedaluwarsa. Daftar kembali.", 400);
  }
  if (!compareRegistrationOtp(email, otp, pending.codeHash)) {
    await prisma.pendingRegistration.updateMany({
      where: { id: pending.id, codeHash: pending.codeHash, attempts: { lt: REGISTRATION_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    throw new HttpError("Kode OTP salah atau kedaluwarsa.", 400);
  }
  try {
    return await prisma.$transaction(async (tx) => {
      // Exactly one contender consumes the pending row and creates the account.
      const consumed = await tx.pendingRegistration.deleteMany({
        where: { id: pending.id, codeHash: pending.codeHash, attempts: { lt: REGISTRATION_MAX_ATTEMPTS },
          expiresAt: { gt: new Date() } },
      });
      if (consumed.count !== 1) throw new HttpError("Kode OTP sudah digunakan atau kedaluwarsa.", 400);
      const role = await tx.role.findUnique({ where: { name: "Customer" } });
      const user = await tx.user.create({ data: {
        name: pending.name,
        email, phone: pending.phone, passwordHash: pending.passwordHash,
        emailVerifiedAt: new Date(),
        customer: { create: { fullName: pending.name, phone: pending.phone } },
        cart: { create: {} }, wishlist: { create: {} },
        ...(role ? { roles: { create: { roleId: role.id } } } : {}),
      } });
      await writeAudit({ userId: user.id, action: "auth.register.verified",
        entity: "User", entityId: user.id }, tx);
      return user;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.map(String) : [];
      throw new HttpError(target.includes("phone") ? "No. HP sudah terdaftar" : "Email sudah terdaftar", 409);
    }
    throw err;
  }
}

arget.includes("phone")) {
        throw new HttpError("No. HP sudah terdaftar", 409);
      }
      if (target.includes("email")) {
        throw new HttpError("Email sudah terdaftar", 409);
      }
    }
    throw err;
  }
}

export async function authenticate(identifier: string, password: string) {
  const value = identifier.toLowerCase().trim();
  await enforceAuthRateLimit("login", value);
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: value }, { phone: identifier.trim() }] },
  });
  const valid = await verifyPassword(password, user?.isActive ? user.passwordHash : DUMMY_PASSWORD_HASH);
  if (!user || !user.isActive || !valid) throw new HttpError("Email/No HP atau password salah", 401);
  return user;
}

const tokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");

export async function requestPasswordReset(email: string) {
  // Check configuration BEFORE account lookup, so an unconfigured provider
  // cannot silently claim that mail has been sent to existing accounts.
  await enforceAuthRateLimit("reset", email);
  const config = resetMailConfig();
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !user.isActive) return; // keep the form response identical for unknown emails
  const token = randomBytes(32).toString("hex");
  const record = await prisma.passwordResetToken.create({
    data: { userId: user.id, token: tokenDigest(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  try {
    await sendPasswordResetEmail(user.email, token, config);
  } catch {
    // A failed email must not leave a usable reset token behind.
    await prisma.passwordResetToken.deleteMany({ where: { id: record.id } });
    throw new HttpError("Email reset password gagal dikirim. Coba lagi nanti.", 503);
  }
}

export async function resetPassword(token: string, newPassword: string) {
  if (!/^[0-9a-f]{64}$/i.test(token)) throw new HttpError("Token reset tidak valid atau kedaluwarsa", 400);
  await enforceAuthRateLimit("resetConfirm", tokenDigest(token));
  const record = await prisma.passwordResetToken.findUnique({ where: { token: tokenDigest(token) } });
  if (!record) throw new HttpError("Token reset tidak valid atau kedaluwarsa", 400);
  const hash = await hashPassword(newPassword);
  await prisma.$transaction(async tx => {
    // Atomic consume prevents two parallel submissions of the same reset link.
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) throw new HttpError("Token reset tidak valid atau kedaluwarsa", 400);
    await tx.user.update({ where: { id: record.userId, isActive: true }, data: { passwordHash: hash, sessionVersion: { increment: 1 } } });
    await tx.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await writeAudit({ userId: record.userId, action: "auth.password.reset", entity: "User", entityId: record.userId }, tx);
  });
}
