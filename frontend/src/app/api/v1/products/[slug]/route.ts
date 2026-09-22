import { ok, fail, handle } from "@/lib/response";
import { getProductBySlug } from "@/modules/catalog/catalog.service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  return handle(async () => {
    const product = await getProductBySlug(params.slug);
    if (!product) return fail("Produk tidak ditemukan", 404);
    return ok(product);
  });
}
