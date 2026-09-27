import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PERMISSIONS = [
  "product.read", "product.create", "product.update", "product.delete",
  "inventory.read", "inventory.adjust",
  "order.read", "order.update", "order.cancel",
  "payment.read", "payment.verify",
  "shipping.read", "shipping.create", "shipping.update",
  "customer.read",
  "promotion.create", "promotion.update",
  "bank.manage", "audit.read",
] as const;

const ADMIN_ROLE = "Admin";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password || password.length < 12) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD (minimum 12 characters) are required for admin bootstrap");
  }

  const permissionIds: string[] = [];
  for (const key of PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { key },
      update: { label: key },
      create: { key, label: key },
    });
    permissionIds.push(permission.id);
  }

  const role = await prisma.role.upsert({
    where: { name: ADMIN_ROLE },
    update: { label: "Admin / Seller" },
    create: { name: ADMIN_ROLE, label: "Admin / Seller" },
  });

  for (const permissionId of permissionIds) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId,
        },
      },
      update: {},
      create: { roleId: role.id, permissionId },
    });
  }

  await prisma.role.upsert({
    where: { name: "Customer" },
    update: { label: "Customer" },
    create: { name: "Customer", label: "Customer" },
  });

  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await prisma.user.create({
      data: {
        name: "Admin Gheverhan",
        email,
        passwordHash,
        isActive: true,
        roles: { create: { roleId: role.id } },
      },
    });
    console.log(`Admin bootstrap created: ${admin.email}`);
  } else {
    const alreadyAdmin = await prisma.userRole.findUnique({
      where: {
        userId_roleId: {
          userId: existing.id,
          roleId: role.id,
        },
      },
    });

    if (!alreadyAdmin) {
      await prisma.userRole.create({ data: { userId: existing.id, roleId: role.id } });
    }

    if (!existing.isActive) {
      await prisma.user.update({ where: { id: existing.id }, data: { isActive: true } });
    }

    console.log(`Admin bootstrap verified: ${existing.email}`);
  }
}

main()
  .catch((error) => {
    console.error("Admin bootstrap failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
