import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { writeAudit } from "@/modules/audit/audit.service";
import { couponReservationWhere, NON_CONSUMING_COUPON_ORDER_STATUSES } from "./coupon.service";
import { flashSaleInputSchema, scheduledFlashSaleSchema, voucherInputSchema } from "./marketing.validation";

type Actor = { id: string; isAdmin: boolean; permissions: string[] };
function permit(actor: Actor, permission: string) {
  if (!actor.isAdmin || !actor.permissions.includes(permission))
    throw new HttpError("Anda tidak memiliki izin mengelola promosi", 403);
}
export function voucherStatus(v: { isActive: boolean; startsAt?: Date | null; expiresAt: Date | null }, now = new Date()) {
  return !v.isActive ? "NONAKTIF" : v.expiresAt && v.expiresAt <= now ? "KEDALUWARSA" : v.startsAt && v.startsAt > now ? "TERJADWAL" : "AKTIF";
}

/** Reads marketing campaigns with usage totals; requires Sprint 2K Coupon migration. */
export async function listMarketing(actor: Actor) {
  if (!actor.isAdmin || ![PERMISSIONS.PROMOTION_CREATE, PERMISSIONS.PROMOTION_UPDATE].some(p => actor.permissions.includes(p)))
    throw new HttpError("Anda tidak memiliki izin melihat Marketing", 403);
  const now = new Date();
  const [vouchers, products, activeVouchers, activeFlashSales] = await Promise.all([
    prisma.coupon.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 }),
    actor.permissions.includes(PERMISSIONS.PRODUCT_READ)
      ? prisma.product.findMany({
          where: { status: "PUBLISHED" },
          orderBy: [{ flashSaleStartsAt: { sort: "desc", nulls: "last" } }, { isFlashSale: "desc" }, { createdAt: "desc" }, { id: "desc" }],
          take: 60,
          select: { id: true, name: true, slug: true, basePrice: true, salePrice: true, isFlashSale: true, flashSalePrice: true, flashSaleStartsAt: true, flashSaleEndsAt: true, updatedAt: true, variants: { select: { price: true, salePrice: true }, take: 50 } },
        })
      : Promise.resolve([]),
    prisma.coupon.count({ where: { isActive: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] } }),
    actor.permissions.includes(PERMISSIONS.PRODUCT_READ) ? prisma.product.count({ where: { status: "PUBLISHED", OR: [{ isFlashSale: true }, { flashSalePrice: { not: null }, flashSaleStartsAt: { lte: now }, flashSaleEndsAt: { gt: now } }] } }) : Promise.resolve(0),
  ]);
  const codes = vouchers.map(v => v.code);
  const usage = codes.length ? await prisma.order.groupBy({
    by: ["couponCode"], where: { couponCode: { in: codes }, status: { notIn: NON_CONSUMING_COUPON_ORDER_STATUSES } }, _count: { _all: true },
  }) : [];
  const usedMap = new Map(usage.map(row => [row.couponCode, row._count._all]));
  return { vouchers: vouchers.map(row => ({ ...row, usedCount: usedMap.get(row.code) ?? 0 })), products, activeVouchers, activeFlashSales };
}

export async function saveVoucher(actor: Actor, id: string | null, value: unknown) {
  permit(actor, id ? PERMISSIONS.PROMOTION_UPDATE : PERMISSIONS.PROMOTION_CREATE);
  const parsed = voucherInputSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(parsed.error.issues[0].message, 422);
  const input = parsed.data;
  const payload = {
    code: input.code,
    discountType: input.discountType,
    discountValue: input.discountValue,
    minSpend: input.minSpend,
    maxDiscount: input.maxDiscount,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    usageLimit: input.usageLimit,
    perUserLimit: input.perUserLimit,
    isActive: input.isActive,
  };
  try {
    return await prisma.$transaction(async tx => {
      if (id) {
        // Locks serialize edits with checkout's exclusive Coupon row lock.
        const rows = await tx.$queryRaw<Array<{ id: string; code: string }>>(Prisma.sql`SELECT "id", "code" FROM "Coupon" WHERE "id" = ${id} FOR UPDATE`);
        if (!rows.length) throw new HttpError("Voucher tidak ditemukan", 404);
        if (rows[0].code !== input.code) throw new HttpError("Kode voucher tidak boleh diubah. Buat voucher baru.", 422);
        if (input.usageLimit != null) {
          const used = await tx.order.count({ where: couponReservationWhere(input.code) });
          if (input.usageLimit < used) throw new HttpError("Kuota total tidak boleh lebih kecil dari jumlah pemakaian yang sudah terjadi.", 422);
        }
      }
      const row = id
        ? await tx.coupon.update({ where: { id }, data: payload })
        : await tx.coupon.create({ data: payload });
      await writeAudit({ userId: actor.id, entity: "Coupon", entityId: row.id, action: id ? "coupon.update" : "coupon.create", meta: { code: row.code, isActive: row.isActive, discountType: row.discountType, discountValue: row.discountValue } }, tx);
      return { id: row.id };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new HttpError("Kode voucher sudah digunakan", 409);
    throw error;
  }
}

export async function setVoucherActive(actor: Actor, id: string, isActive: boolean) {
  permit(actor, PERMISSIONS.PROMOTION_UPDATE);
  if (!id || id.length > 64) throw new HttpError("ID voucher tidak valid", 422);
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Coupon" WHERE "id" = ${id} FOR UPDATE`);
    if (!rows.length) throw new HttpError("Voucher tidak ditemukan", 404);
    const row = await tx.coupon.findUniqueOrThrow({ where: { id } });
    if (isActive && row.expiresAt && row.expiresAt <= new Date())
      throw new HttpError("Voucher sudah kedaluwarsa. Ubah tanggal berakhir terlebih dahulu.", 409);
    if (row.isActive === isActive) return { id };
    await tx.coupon.update({ where: { id }, data: { isActive } });
    await writeAudit({ userId: actor.id, entity: "Coupon", entityId: id, action: isActive ? "coupon.activate" : "coupon.deactivate" }, tx);
    return { id };
  });
}

/**
 * Explicit manual flash sale: this is not a scheduler. Only products whose
 * variants inherit the product price can be repriced safely through this UI.
 * A disabled flash sale returns to the product's base price (salePrice=null).
 */
export async function setFlashSale(actor: Actor, value: unknown) {
  permit(actor, PERMISSIONS.PROMOTION_UPDATE);
  if (!actor.permissions.includes(PERMISSIONS.PRODUCT_READ))
    throw new HttpError("Izin melihat produk diperlukan", 403);
  const parsed = flashSaleInputSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(parsed.error.issues[0].message, 422);
  const input = parsed.data;
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${input.productId} FOR UPDATE`);
    if (!rows.length) throw new HttpError("Produk tidak ditemukan", 404);
    const product = await tx.product.findUniqueOrThrow({
      where: { id: input.productId },
      select: { status: true, basePrice: true, salePrice: true, isFlashSale: true, flashSalePrice: true, flashSaleStartsAt: true, flashSaleEndsAt: true, updatedAt: true, variants: { select: { price: true, salePrice: true } } },
    });
    if (product.updatedAt.toISOString() !== input.expectedUpdatedAt)
      throw new HttpError("Data produk telah berubah. Muat ulang sebelum mengubah flash sale.", 409);
    if (input.enabled) {
      if (product.flashSalePrice != null) throw new HttpError("Produk memiliki flash sale terjadwal. Hapus jadwalnya terlebih dahulu.", 409);
      if (product.status !== "PUBLISHED" || product.variants.length === 0)
        throw new HttpError("Hanya produk terbit dengan varian yang bisa flash sale", 422);
      if (!product.isFlashSale && product.salePrice != null)
        throw new HttpError("Produk memiliki diskon reguler. Hapus diskon reguler di editor produk sebelum mengaktifkan flash sale.", 422);
      if (product.variants.some(v => v.price != null || v.salePrice != null))
        throw new HttpError("Produk memiliki harga per varian. Kelola harga varian dari editor produk.", 422);
      if (input.salePrice! >= product.basePrice)
        throw new HttpError("Harga flash sale harus lebih murah dari harga normal", 422);
    } else if (!product.isFlashSale) {
      throw new HttpError("Produk ini bukan flash sale aktif", 409);
    }
    const result = await tx.product.update({
      where: { id: input.productId },
      data: { isFlashSale: input.enabled, salePrice: input.enabled ? input.salePrice : null },
    });
    await writeAudit({ userId: actor.id, entity: "Product", entityId: result.id, action: input.enabled ? "flash-sale.activate" : "flash-sale.deactivate", meta: { previousPrice: product.basePrice, salePrice: result.salePrice } }, tx);
    return { id: result.id };
  }, { isolationLevel: "Serializable" });
}

/** Scheduled campaigns store an overlay price; they never overwrite salePrice. */
export async function setScheduledFlashSale(actor: Actor, value: unknown) {
  permit(actor, PERMISSIONS.PROMOTION_UPDATE);
  if (!actor.permissions.includes(PERMISSIONS.PRODUCT_READ))
    throw new HttpError("Izin melihat produk diperlukan", 403);
  const parsed = scheduledFlashSaleSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(parsed.error.issues[0].message, 422);
  const input = parsed.data;
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${input.productId} FOR UPDATE`);
    if (!rows.length) throw new HttpError("Produk tidak ditemukan", 404);
    const p = await tx.product.findUniqueOrThrow({
      where: { id: input.productId },
      select: { status: true, basePrice: true, salePrice: true, isFlashSale: true, flashSalePrice: true,
        updatedAt: true, variants: { select: { price: true, salePrice: true } } },
    });
    if (p.updatedAt.toISOString() !== input.expectedUpdatedAt)
      throw new HttpError("Data produk berubah. Muat ulang sebelum menyimpan jadwal.", 409);
    if (input.enabled) {
      if (p.status !== "PUBLISHED" || !p.variants.length)
        throw new HttpError("Produk harus diterbitkan dan memiliki varian.", 422);
      if (p.salePrice != null || p.isFlashSale)
        throw new HttpError("Akhiri flash sale manual atau diskon reguler sebelum menjadwalkan flash sale.", 422);
      if (p.variants.some(v => v.price != null || v.salePrice != null))
        throw new HttpError("Harga per varian tidak mendukung flash sale terjadwal.", 422);
      if (input.price! >= p.basePrice)
        throw new HttpError("Harga flash sale harus lebih murah dari harga normal.", 422);
    } else if (p.flashSalePrice == null) {
      throw new HttpError("Tidak ada jadwal flash sale untuk dihapus.", 409);
    }
    const row = await tx.product.update({
      where: { id: input.productId },
      data: {
        flashSalePrice: input.enabled ? input.price : null,
        flashSaleStartsAt: input.enabled ? new Date(input.startsAt!) : null,
        flashSaleEndsAt: input.enabled ? new Date(input.endsAt!) : null,
      },
    });
    await writeAudit({
      userId: actor.id, action: input.enabled ? "flash-sale.schedule" : "flash-sale.schedule.remove",
      entity: "Product", entityId: row.id,
      meta: { price: row.flashSalePrice, startsAt: row.flashSaleStartsAt?.toISOString() || null, endsAt: row.flashSaleEndsAt?.toISOString() || null },
    }, tx);
    return { id: row.id };
  }, { isolationLevel: "Serializable" });
}
