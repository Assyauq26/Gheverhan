import { ProductListing } from "@/components/storefront/product-listing";
import { listProducts } from "@/modules/catalog/catalog.service";
import { getCurrentUser } from "@/lib/auth/session";
import { wishlistProductIds } from "@/modules/wishlist/wishlist.service";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string; sort?: string };
}) {
  const q = searchParams.q ?? "";
  const user = await getCurrentUser();
  const sort = (searchParams.sort as "newest" | "price_asc" | "price_desc") ?? "newest";
  const [result, wishIds] = await Promise.all([
    listProducts({ search: q, sort, pageSize: 24 }),
    user ? wishlistProductIds(user.id) : Promise.resolve([]),
  ]);

  return (
    <ProductListing
      title={q ? `Hasil untuk "${q}"` : "Pencarian"}
      subtitle={`${result.total} produk ditemukan`}
      items={result.items}
      total={result.total}
      wishlisted={new Set(wishIds)}
      basePath="/search"
      currentSort={sort}
      query={q ? { q } : {}}
    />
  );
}
