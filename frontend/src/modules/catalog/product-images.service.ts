import { randomUUID } from "crypto";
import { getObject, putObject, STORAGE_APP } from "@/lib/storage";
import { HttpError } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { attachProductImage, assertCatalogPermission, getManagedProduct } from "./product-management.service";
import type { CatalogActor } from "./product-management.validation";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const formats = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export function validateProductImage(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new HttpError("Gambar harus berukuran 1 byte–5 MB", 422);
  const png = bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP";
  if (!((mime === "image/png" && png) || (mime === "image/jpeg" && jpeg) || (mime === "image/webp" && webp))) throw new HttpError("Gunakan file JPG, PNG, atau WebP yang valid", 422);
  return formats[mime as keyof typeof formats];
}
export async function uploadProductImage(actor: CatalogActor, productId: string, updatedAt: string, bytes: Uint8Array, mime: string, alt = "") {
  assertCatalogPermission(actor, PERMISSIONS.PRODUCT_UPDATE);
  const current = await getManagedProduct(actor, productId);
  if (current.updatedAt !== updatedAt) throw new HttpError("Produk sudah berubah. Muat ulang sebelum mengunggah.", 409);
  if (current.images.length >= 10) throw new HttpError("Maksimal 10 gambar per produk", 422);
  if (alt.length > 200) throw new HttpError("Teks alternatif maksimal 200 karakter", 422);
  const extension = validateProductImage(bytes, mime);
  const id = randomUUID();
  const path = `${STORAGE_APP}/product-images/${productId}/${id}.${extension}`;
  const stored = await putObject(path, bytes, mime);
  if (stored.path !== path) throw new Error("Storage returned an unexpected object path");
  return attachProductImage(actor, productId, updatedAt, { id, url: `/api/v1/product-images/${id}?object=${encodeURIComponent(path)}`, alt: alt.trim() });
}
export async function readManagedProductImage(image: { id: string; productId: string; url: string }) {
  const url = new URL(image.url, "http://localhost");
  const path = url.searchParams.get("object") || "";
  const extension = path.split(".").pop();
  if (url.origin !== "http://localhost" || url.pathname !== `/api/v1/product-images/${image.id}` || !["jpg", "png", "webp"].includes(extension || "") || !path.endsWith(`/product-images/${image.productId}/${image.id}.${extension}`) || !/^[a-zA-Z0-9_/-]+\.(jpg|png|webp)$/.test(path)) throw new HttpError("Gambar tidak ditemukan", 404);
  const object = await getObject(path);
  return { data: object.data, contentType: extension === "jpg" ? "image/jpeg" : `image/${extension}` };
}
