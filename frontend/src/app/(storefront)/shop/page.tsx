import { ProductListing } from "@/components/storefront/product-listing";
import { listProducts } from "@/modules/catalog/catalog.service";
import { getCurrentUser } from "@/lib/auth/session";
import { wishlistProductIds } from "@/modules/wishlist/wishlist.service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop", description: "Jelajahi seluruh koleksi Gheverhan." };

export default async function ShopPage({
  searchParams,
}: {
  searchParams: { q?: string; flash?: string; sort?: string; page?: string };
}) {
  const user = await getCurrentUser();
  const sort = (searchParams.sort as "newest" | "price_asc" | "price_desc") ?? "newest";
  const [result, wishIds] = await Promise.all([
    listProducts({
      search: searchParams.q,
      flashSale: searchParams.flash === "1",
      sort,
      page: Number(searchParams.page) || 1,
      pageSize: 12,
    }),
    user ? wishlistProductIds(user.id) : Promise.resolve([]),
  ]);

  return (
    <ProductListing
      title={searchParams.flash === "1" ? "Flash Sale" : "Semua Produk"}
      items={result.items}
      total={result.total}
      wishlisted={new Set(wishIds)}
      basePath="/shop"
      currentSort={sort}
      query={{ ...(searchParams.q ? { q: searchParams.q } : {}), ...(searchParams.flash ? { flash: "1" } : {}) }}
    />
  );
}
