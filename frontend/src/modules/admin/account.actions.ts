"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { writeAudit } from "@/modules/audit/audit.service";

const STAFF_ROLES = ["Super Admin", "Admin", "Manager", "CS", "Warehouse", "Marketing", "Finance"] as const;

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireSuperAdmin() {
  const actor = await requireUser();
  if (!actor.roles.includes("Super Admin")) {
    throw new Error("Akses Super Admin diperlukan");
  }
  return actor;
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(190),
  password: z.string().min(12).max(128),
  role: z.enum(STAFF_ROLES),
});

export async function createStaffAccount(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requireSuperAdmin();
    const parsed = createSchema.safeParse({
      name: formData.get("name"),
      email: String(formData.get("email") || "").toLowerCase(),
      password: formData.get("password"),
      role: formData.get("role"),
    });
    if (!parsed.success) return { ok: false, error: "Data akun tidak valid. Password minimal 12 karakter." };

    const email = parsed.data.email.toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (exists) return { ok: false, error: "Email sudah digunakan." };

    const role = await prisma.role.findUnique({ where: { name: parsed.data.role }, select: { id: true } });
    if (!role) return { ok: false, error: "Role tidak ditemukan. Jalankan seed/bootstrap terlebih dahulu." };

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email,
        passwordHash,
        isActive: true,
        roles: { create: { roleId: role.id } },
      },
    });

    await writeAudit({
      userId: actor.id,
      action: "ACCOUNT_CREATED",
      entity: "User",
      entityId: user.id,
      meta: { email, role: parsed.data.role },
    });

    revalidatePath("/admin/accounts");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Gagal membuat akun." };
  }
}

export async function toggleStaffAccount(userId: string, active: boolean): Promise<ActionResult> {
  try {
    const actor = await requireSuperAdmin();
    if (actor.id === userId && !active) return { ok: false, error: "Akun Super Admin yang sedang digunakan tidak dapat dinonaktifkan." };

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!target) return { ok: false, error: "Akun tidak ditemukan." };

    await prisma.user.update({ where: { id: userId }, data: { isActive: active } });
    await writeAudit({
      userId: actor.id,
      action: active ? "ACCOUNT_ACTIVATED" : "ACCOUNT_DEACTIVATED",
      entity: "User",
      entityId: userId,
      meta: { email: target.email },
    });

    revalidatePath("/admin/accounts");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Gagal mengubah status akun." };
  }
}

export async function resetStaffPassword(userId: string, password: string): Promise<ActionResult> {
  try {
    const actor = await requireSuperAdmin();
    if (password.length < 12) return { ok: false, error: "Password minimal 12 karakter." };
    if (actor.id === userId) return { ok: false, error: "Gunakan halaman reset password akun Anda sendiri." };

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!target) return { ok: false, error: "Akun tidak ditemukan." };

    await prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, 10) } });
    await writeAudit({
      userId: actor.id,
      action: "ACCOUNT_PASSWORD_RESET",
      entity: "User",
      entityId: userId,
      meta: { email: target.email },
    });

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Gagal reset password." };
  }
}
