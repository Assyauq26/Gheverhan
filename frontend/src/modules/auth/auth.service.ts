import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { HttpError } from "@/lib/response";
import { writeAudit } from "@/modules/audit/audit.service";
import { randomBytes } from "crypto";

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

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) return null; // do not leak existence
  const token = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  console.log(`[password-reset] ${email} -> /reset-password?token=${token}`);
  return token;
}

export async function resetPassword(token: string, newPassword: string) {
  const record = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new HttpError("Token reset tidak valid atau kedaluwarsa", 400);
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(newPassword) },
    }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
}
