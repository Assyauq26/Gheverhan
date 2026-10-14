import { Prisma, ProductStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { PERMISSIONS, type PermissionKey } from "@/lib/auth/permissions";
import { writeAudit } from "@/modules/audit/audit.service";
import { adjustStock } from "@/modules/inventory/inventory.service";
import { categoryInputSchema, productInputSchema, type CatalogActor } from "./product-management.validation";

export function assertCatalogPermission(actor: CatalogActor, permission: PermissionKey) {
  if (!actor.isAdmin || !actor.permissions.includes(permission)) throw new HttpError("Anda tidak memiliki izin untuk operasi ini", 403);
}
const include = { images: { orderBy: { sortOrder: "asc" as const } }, variants: { include: { inventory: true, _count: { select: { orderItems: true, cartItems: true, movements: true } } } } } satisfies Prisma.ProductInclude;
type ManagedProduct = Prisma.ProductGetPayload<{ include: typeof include }>;

async function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(fn, { isolationLevel: "Serializable", timeout: 15_000 }); }
    catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2034" && attempt < 2) continue;
        if (err.code === "P2002") throw new HttpError("Slug atau SKU sudah digunakan. Pilih nilai lain.", 409);
        if (err.code === "P2034") throw new HttpError("Data sedang diubah. Muat ulang dan coba lagi.", 409);
      }
      throw err;
    }
  }
}
async function lockProduct(tx: Prisma.TransactionClient, id: string, expected: string) {
  const p = await tx.product.findUnique({ where: { id }, include });
  if (!p) throw new HttpError("Produk tidak ditemukan", 404);
  if (p.updatedAt.toISOString() !== expected) throw new HttpError("Produk sudah berubah. Muat ulang sebelum menyimpan.", 409);
  const updatedAt = new Date(Math.max(Date.now(), p.updatedAt.getTime() + 1));
  const result = await tx.product.updateMany({ where: { id, updatedAt: p.updatedAt }, data: { updatedAt } });
  if (result.count !== 1) throw new HttpError("Produk sudah berubah. Muat ulang sebelum menyimpan.", 409);
  return { p, updatedAt };
}
function parseProduct(value: unknown) {
  const parsed = productInputSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(parsed.error.issues[0].message, 422);
  return parsed.data;
}
async function validateRelations(tx: Prisma.TransactionClient, categoryId?: string | null, brandId?: string | null) {
  if (categoryId && !await tx.category.findUnique({ where: { id: categoryId }, select: { id: true } })) throw new HttpError("Kategori tidak ditemukan", 422);
  if (brandId && !await tx.brand.findUnique({ where: { id: brandId }, select: { id: true } })) throw new HttpError("Brand tidak ditemukan", 422);
}
function fields(input: ReturnType<typeof parseProduct>) {
  const { variants: _variants, images: _images, ...data } = input;
  return { ...data, salePrice: data.salePrice ?? null, categoryId: data.categoryId || null, brandId: data.brandId || null };
}
function requireStockEdit(actor: CatalogActor) {
  assertCatalogPermission(actor, PERMISSIONS.INVENTORY_READ);
  assertCatalogPermission(actor, PERMISSIONS.INVENTORY_ADJUST);
}

export async function createManagedProduct(actor: CatalogActor, value: unknown) {
  assertCatalogPermission(actor, PERMISSIONS.PRODUCT_CREATE);
  const input = parseProduct(value);
  if (input.images.length || input.variants.some(v => v.id)) throw new HttpError("Produk baru tidak boleh memakai ID varian atau gambar existing", 422);
  if (input.variants.some(v => (v.onHand ?? 0) !== 0)) requireStockEdit(actor);
  return transaction(async tx => {
    await validateRelations(tx, input.categoryId, input.brandId);
    const p = await tx.product.create({ data: { ...fields(input), status: "DRAFT" } });
    for (const v of input.variants) {
      const row = await tx.productVariant.create({ data: { productId: p.id, sku: v.sku, color: v.color || null, size: v.size || null, price: v.price ?? null, salePrice: v.salePrice ?? null, inventory: { create: { onHand: 0 } } } });
      if (v.onHand) await adjustStock(row.id, v.onHand, "Stok awal produk", { tx, expectedOnHand: 0, reference: p.id });
    }
    await writeAudit({ userId: actor.id, action: "product.create", entity: "Product", entityId: p.id }, tx);
    return { id: p.id, updatedAt: p.updatedAt.toISOString(), status: p.status };
  });
}

export async function updateManagedProduct(actor: CatalogActor, id: string, expected: string, value: unknown) {
  assertCatalogPermission(actor, PERMISSIONS.PRODUCT_UPDATE);
  const input = parseProduct(value);
  return transaction(async tx => {
    const { p, updatedAt } = await lockProduct(tx, id, expected);
    await validateRelations(tx, input.categoryId, input.brandId);
    for (const v of input.variants) if (v.id && !p.variants.some(row => row.id === v.id)) throw new HttpError("Varian bukan milik produk ini", 422);
    for (const image of input.images) if (!p.images.some(row => row.id === image.id)) throw new HttpError("Gambar bukan milik produk ini", 422);
    if (p.status === "PUBLISHED" && input.images.length === 0) throw new HttpError("Produk terbit harus memiliki gambar. Ubah menjadi draft sebelum menghapus semua gambar.", 422);
    for (const old of p.variants.filter(row => !input.variants.some(v => v.id === row.id))) {
      if (old._count.orderItems || old._count.cartItems || old._count.movements || old.inventory?.reserved || old.inventory?.onHand) throw new HttpError("Varian memiliki stok atau riwayat transaksi; pertahankan varian tersebut", 409);
      await tx.inventory.deleteMany({ where: { variantId: old.id } });
      await tx.productVariant.delete({ where: { id: old.id } });
    }
    for (const v of input.variants) {
      const old = p.variants.find(row => row.id === v.id);
      if (!old) {
        if (v.onHand) requireStockEdit(actor);
        const row = await tx.productVariant.create({ data: { productId: id, sku: v.sku, color: v.color || null, size: v.size || null, price: v.price ?? null, salePrice: v.salePrice ?? null, inventory: { create: { onHand: 0 } } } });
        if (v.onHand) await adjustStock(row.id, v.onHand, "Stok awal varian", { tx, expectedOnHand: 0, reference: id });
      } else {
        await tx.productVariant.update({ where: { id: old.id }, data: { sku: v.sku, color: v.color || null, size: v.size || null, price: v.price ?? null, salePrice: v.salePrice ?? null } });
        if (v.onHand !== undefined && v.onHand !== (old.inventory?.onHand ?? 0)) {
          requireStockEdit(actor);
          if (v.expectedOnHand === undefined) throw new HttpError("Muat ulang data stok sebelum melakukan adjustment", 409);
          await adjustStock(old.id, v.onHand, "Adjustment Product Management", { tx, expectedOnHand: v.expectedOnHand, reference: id });
        }
      }
    }
    for (const old of p.images.filter(image => !input.images.some(i => i.id === image.id))) {
      if (await tx.orderItem.count({ where: { imageUrl: old.url } })) throw new HttpError("Gambar dipakai riwayat pesanan dan tidak boleh dihapus", 409);
      await tx.productImage.delete({ where: { id: old.id } });
    }
    for (const [index, image] of input.images.entries()) await tx.productImage.update({ where: { id: image.id }, data: { alt: image.alt, sortOrder: index } });
    await tx.product.update({ where: { id }, data: { ...fields(input), updatedAt } });
    await writeAudit({ userId: actor.id, action: "product.update", entity: "Product", entityId: id }, tx);
    return { id, updatedAt: updatedAt.toISOString(), status: p.status, previousSlug: p.slug };
  });
}

export async function changeProductStatus(actor: CatalogActor, id: string, expected: string, status: ProductStatus) {
  assertCatalogPermission(actor, status === "ARCHIVED" ? PERMISSIONS.PRODUCT_DELETE : PERMISSIONS.PRODUCT_UPDATE);
  if (!Object.values(ProductStatus).includes(status)) throw new HttpError("Status produk tidak valid", 422);
  return transaction(async tx => {
    const { p, updatedAt } = await lockProduct(tx, id, expected);
    if (status === "PUBLISHED" && (!p.images.length || !p.variants.length)) throw new HttpError("Tambahkan gambar dan varian sebelum menerbitkan produk", 422);
    if (status === "PUBLISHED") parseProduct(serializeProduct(p, actor));
    await tx.product.update({ where: { id }, data: { status, updatedAt } });
    await writeAudit({ userId: actor.id, action: `product.${status.toLowerCase()}`, entity: "Product", entityId: id, meta: { from: p.status, to: status } }, tx);
    return { id, updatedAt: updatedAt.toISOString(), status };
  });
}

export async function getManagedProduct(actor: CatalogActor, id: string) {
  assertCatalogPermission(actor, PERMISSIONS.PRODUCT_READ);
  const p = await prisma.product.findUnique({ where: { id }, include });
  if (!p) throw new HttpError("Produk tidak ditemukan", 404);
  return serializeProduct(p, actor);
}
function serializeProduct(p: ManagedProduct, actor: CatalogActor) {
  const stock = actor.permissions.includes(PERMISSIONS.INVENTORY_READ);
  return { id: p.id, name: p.name, slug: p.slug, description: p.description, material: p.material, careInstruction: p.careInstruction, shippingReturn: p.shippingReturn, basePrice: p.basePrice, salePrice: p.salePrice, categoryId: p.categoryId, brandId: p.brandId, isFeatured: p.isFeatured, isFlashSale: p.isFlashSale, status: p.status, updatedAt: p.updatedAt.toISOString(), images: p.images.map(({ id, url, alt }) => ({ id, url, alt })), variants: p.variants.map(v => ({ id: v.id, sku: v.sku, color: v.color ?? "", size: v.size ?? "", price: v.price, salePrice: v.salePrice, ...(stock ? { onHand: v.inventory?.onHand ?? 0, expectedOnHand: v.inventory?.onHand ?? 0, reserved: v.inventory?.reserved ?? 0 } : {}) })) };
}
export type ProductEditorData = Awaited<ReturnType<typeof getManagedProduct>>;

export async function getProductEditorOptions(actor: CatalogActor) {
  assertCatalogPermission(actor, PERMISSIONS.PRODUCT_READ);
  const [categories, brands] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
    prisma.brand.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { categories, brands };
}

export async function listManagedProducts(actor: CatalogActor, q = "", status?: ProductStatus, page = 1) {
  assertCatalogPermission(actor, PERMISSIONS.PRODUCT_READ);
  const where: Prisma.ProductWhereInput = { ...(q.trim() ? { OR: [{ name: { contains: q.trim().slice(0, 100), mode: "insensitive" } }, { slug: { contains: q.trim().slice(0, 100), mode: "insensitive" } }] } : {}), ...(status ? { status } : {}) };
  page = Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100_000) : 1;
  const [items, total] = await Promise.all([prisma.product.findMany({ where, include: { category: true, images: { orderBy: { sortOrder: "asc" }, take: 1 }, _count: { select: { variants: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * 20, take: 20 }), prisma.product.count({ where })]);
  return { items, total, page, pages: Math.ceil(total / 20) };
}

export async function saveCategory(actor: CatalogActor, id: string | null, value: unknown) {
  assertCatalogPermission(actor, id ? PERMISSIONS.PRODUCT_UPDATE : PERMISSIONS.PRODUCT_CREATE);
  const parsed = categoryInputSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(parsed.error.issues[0].message, 422);
  const data = { ...parsed.data, parentId: parsed.data.parentId || null };
  return transaction(async tx => {
    const categories = await tx.category.findMany({ select: { id: true, parentId: true } });
    if (id && !categories.some(c => c.id === id)) throw new HttpError("Kategori tidak ditemukan", 404);
    const visited = new Set<string>(id ? [id] : []);
    let parent = data.parentId;
    while (parent) {
      if (visited.has(parent)) throw new HttpError("Hierarki kategori tidak boleh membentuk siklus", 422);
      visited.add(parent);
      const c = categories.find(row => row.id === parent);
      if (!c) throw new HttpError("Kategori induk tidak ditemukan", 422);
      parent = c.parentId;
    }
    const row = id ? await tx.category.update({ where: { id }, data }) : await tx.category.create({ data });
    await writeAudit({ userId: actor.id, action: id ? "category.update" : "category.create", entity: "Category", entityId: row.id }, tx);
    return { id: row.id };
  });
}

export async function attachProductImage(actor: CatalogActor, productId: string, expected: string, image: { id: string; url: string; alt: string }) {
  assertCatalogPermission(actor, PERMISSIONS.PRODUCT_UPDATE);
  return transaction(async tx => {
    const { p, updatedAt } = await lockProduct(tx, productId, expected);
    if (p.images.length >= 10) throw new HttpError("Maksimal 10 gambar per produk", 422);
    const row = await tx.productImage.create({ data: { ...image, productId, sortOrder: p.images.length } });
    await writeAudit({ userId: actor.id, action: "product.image.upload", entity: "Product", entityId: productId }, tx);
    return { image: { id: row.id, url: row.url, alt: row.alt }, updatedAt: updatedAt.toISOString() };
  });
}
