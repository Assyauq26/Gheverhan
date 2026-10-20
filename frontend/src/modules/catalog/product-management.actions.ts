"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { runAction } from "@/lib/action";
import { HttpError } from "@/lib/response";
import { CATALOG_CACHE_TAG } from "./catalog-cache";
import { createManagedProduct, updateManagedProduct, changeProductStatus, getManagedProduct, saveCategory } from "./product-management.service";
import type { ProductStatus } from "@prisma/client";

function refreshCatalog() {
  revalidateTag(CATALOG_CACHE_TAG);
  for (const path of ["/admin", "/admin/products", "/admin/categories", "/", "/shop", "/search"]) revalidatePath(path);
  for (const path of ["/product/[slug]", "/category/[slug]", "/brand/[slug]"]) revalidatePath(path, "page");
}
export async function saveProductAction(form: FormData) {
  return runAction(async () => {
    const id = String(form.get("id") || "");
    const actor = await requirePermission(id ? PERMISSIONS.PRODUCT_UPDATE : PERMISSIONS.PRODUCT_CREATE);
    if (!actor.permissions.includes(PERMISSIONS.PRODUCT_READ)) throw new HttpError("Izin membaca produk diperlukan", 403);
    let value: unknown;
    try { value = JSON.parse(String(form.get("product") || "")); } catch { throw new HttpError("Data produk tidak valid", 422); }
    const result = id ? await updateManagedProduct(actor, id, String(form.get("updatedAt") || ""), value) : await createManagedProduct(actor, value);
    refreshCatalog();
    return getManagedProduct(actor, result.id);
  });
}
export async function setProductStatusAction(id: string, updatedAt: string, status: ProductStatus) {
  return runAction(async () => {
    const actor = await requirePermission(status === "ARCHIVED" ? PERMISSIONS.PRODUCT_DELETE : PERMISSIONS.PRODUCT_UPDATE);
    if (!actor.permissions.includes(PERMISSIONS.PRODUCT_READ)) throw new HttpError("Izin membaca produk diperlukan", 403);
    await changeProductStatus(actor, id, updatedAt, status);
    refreshCatalog();
    return getManagedProduct(actor, id);
  });
}
export async function saveCategoryAction(id: string | null, value: unknown) {
  return runAction(async () => {
    const actor = await requirePermission(id ? PERMISSIONS.PRODUCT_UPDATE : PERMISSIONS.PRODUCT_CREATE);
    const result = await saveCategory(actor, id, value);
    refreshCatalog();
    return result;
  });
}

/** Read-only reconciliation; never advances a client revision without checking the snapshot. */
export async function readProductEditorAction(id: string) {
  return runAction(async () => {
    const actor=await requirePermission(PERMISSIONS.PRODUCT_READ);
    return getManagedProduct(actor,id);
  });
}
