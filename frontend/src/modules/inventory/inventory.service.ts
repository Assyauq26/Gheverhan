import { prisma } from "@/lib/prisma";
import { MovementType, Prisma } from "@prisma/client";
import { HttpError } from "@/lib/response";

export function available(onHand: number, reserved: number): number {
  return onHand - reserved;
}

export async function reserveStock(
  tx: Prisma.TransactionClient,
  variantId: string,
  quantity: number,
  reference: string,
) {
  const inv = await tx.inventory.findUnique({ where: { variantId } });
  if (!inv || available(inv.onHand, inv.reserved) < quantity) {
    throw new HttpError("Stok tidak mencukupi", 409);
  }
  await tx.inventory.update({
    where: { variantId },
    data: { reserved: { increment: quantity } },
  });
  await tx.inventoryMovement.create({
    data: { variantId, type: MovementType.RESERVATION, quantity, reference },
  });
}

export async function releaseStock(
  tx: Prisma.TransactionClient,
  variantId: string,
  quantity: number,
  reference: string,
) {
  await tx.inventory.update({
    where: { variantId },
    data: { reserved: { decrement: quantity } },
  });
  await tx.inventoryMovement.create({
    data: { variantId, type: MovementType.RELEASE, quantity, reference },
  });
}

export async function commitSale(
  tx: Prisma.TransactionClient,
  variantId: string,
  quantity: number,
  reference: string,
) {
  await tx.inventory.update({
    where: { variantId },
    data: {
      reserved: { decrement: quantity },
      onHand: { decrement: quantity },
    },
  });
  await tx.inventoryMovement.create({
    data: { variantId, type: MovementType.SALE, quantity, reference },
  });
}

export async function adjustStock(
  variantId: string,
  newOnHand: number,
  note?: string,
) {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.inventory.upsert({
      where: { variantId },
      create: { variantId, onHand: newOnHand, reserved: 0 },
      update: { onHand: newOnHand },
    });
    await tx.inventoryMovement.create({
      data: {
        variantId,
        type: MovementType.ADJUSTMENT,
        quantity: newOnHand,
        note: note ?? "manual adjustment",
      },
    });
    return inv;
  });
}
