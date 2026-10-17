import { enforceAuthRateLimit } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { hashPassword, verifyPassword, DUMMY_PASSWORD_HASH } from "@/lib/auth/password";
import { HttpError } from "@/lib/response";
import { writeAudit } from "@/modules/audit/audit.service";
import { randomBytes, createHash } from "crypto";
import { resetMailConfig, sendPasswordResetEmail } from "./password-reset-email";

export async function registerCustomer(input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
}) {
  const email = input.email.toLowerCase().trim();
  await enforceAuthRateLimit("register", email);
  const phone = input.phone?.trim() || null;

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing) throw new HttpError("Email sudah terdaftar", 409);

      const customerRole = await tx.role.findUnique({ where: { name: "Customer" } });
      const passwordHash = await hashPassword(input.password);
      const user = await tx.user.create({
        data: {
          name: input.name.trim(),
          email,
          phone,
          passwordHash,
          customer: { create: { fullName: input.name.trim(), phone } },
          cart: { create: {} },
          wishlist: { create: {} },
          ...(customerRole ? { roles: { create: { roleId: customerRole.id } } } : {}),
        },
      });

      await writeAudit(
        { userId: user.id, action: "auth.register", entity: "User", entityId: user.id },
        tx,
      );

      return user;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.map(String) : [];
      if (target.includes("phone")) {
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
