import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
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
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: value }, { phone: identifier.trim() }] },
  });
  if (!user || !user.isActive) throw new HttpError("Email/No HP atau password salah", 401);
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw new HttpError("Email/No HP atau password salah", 401);
  return user;
}

const tokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");

export async function requestPasswordReset(email: string) {
  // Check configuration BEFORE account lookup, so an unconfigured provider
  // cannot silently claim that mail has been sent to existing accounts.
  const config = resetMailConfig();
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !user.isActive) return; // keep the form response identical for unknown emails
  const createdSince = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.passwordResetToken.count({
    where: { userId: user.id, createdAt: { gte: createdSince } },
  });
  if (recent >= 3) return; // per-account throttle; add global/IP rate limiting before wider rollout
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
    await tx.user.update({ where: { id: record.userId, isActive: true }, data: { passwordHash: hash } });
    await tx.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  });
}
