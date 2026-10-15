import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { handle, ok, HttpError } from "@/lib/response";
import { MAX_IMAGE_BYTES, uploadProductImage } from "@/modules/catalog/product-images.service";
import { revalidateTag } from "next/cache";
import { CATALOG_CACHE_TAG } from "@/modules/catalog/catalog-cache";

export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (req.headers.get("origin") !== new URL(req.url).origin) throw new HttpError("Origin tidak diizinkan", 403);
    const actor = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
    const limit = MAX_IMAGE_BYTES + 128 * 1024;
    if (Number(req.headers.get("content-length") || 0) > limit) throw new HttpError("Ukuran upload terlalu besar", 413);
    const reader = req.body?.getReader();
    if (!reader) throw new HttpError("File diperlukan", 422);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new HttpError("Ukuran upload terlalu besar", 413); }
      chunks.push(value);
    }
    let form: FormData;
    try { form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": req.headers.get("content-type") || "" } }).formData(); }
    catch { throw new HttpError("Data upload tidak valid", 422); }
    const file = form.get("image");
    if (!(file instanceof File)) throw new HttpError("File gambar diperlukan", 422);
    const result = await uploadProductImage(actor, (await params).id, String(form.get("updatedAt") || ""), new Uint8Array(await file.arrayBuffer()), file.type, String(form.get("alt") || ""));
    revalidateTag(CATALOG_CACHE_TAG);
    return ok(result, 201);
  });
}
