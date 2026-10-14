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
  options: { tx?: Prisma.TransactionClient; expectedOnHand?: number; reference?: string } = {},
) {
  if (!Number.isSafeInteger(newOnHand) || newOnHand < 0 || newOnHand > 2_147_483_647) {
    throw new HttpError("Jumlah stok tidak valid", 400);
  }
  const adjust = async (tx: Prisma.TransactionClient) => {
    const previous = await tx.inventory.findUnique({ where: { variantId } });
    const oldOnHand = previous?.onHand ?? 0;
    if (options.expectedOnHand !== undefined && options.expectedOnHand !== oldOnHand) {
      throw new HttpError("Stok sudah berubah. Muat ulang sebelum melakukan adjustment.", 409);
    }
    if (newOnHand < (previous?.reserved ?? 0)) {
      throw new HttpError("Stok tidak boleh lebih kecil dari stok yang direservasi", 409);
    }
    if (previous) {
      const updated = await tx.inventory.updateMany({ where: { variantId, onHand: oldOnHand, reserved: { lte: newOnHand } }, data: { onHand: newOnHand } });
      if (updated.count !== 1) throw new HttpError("Stok sudah berubah. Muat ulang dan coba lagi.", 409);
    } else {
      await tx.inventory.create({ data: { variantId, onHand: newOnHand } });
    }
    await tx.inventoryMovement.create({
      data: {
        variantId,
        type: MovementType.ADJUSTMENT,
        quantity: newOnHand - oldOnHand,
        reference: options.reference,
        note: note ?? "manual adjustment",
      },
    });
    return tx.inventory.findUniqueOrThrow({ where: { variantId } });
  };
  return options.tx ? adjust(options.tx) : prisma.$transaction(adjust);
}
