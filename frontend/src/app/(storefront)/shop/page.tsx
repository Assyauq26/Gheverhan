import { ProductListing } from "@/components/storefront/product-listing";
import { listProducts } from "@/modules/catalog/catalog.service";
import { getCurrentUser } from "@/lib/auth/session";
import { wishlistProductIds } from "@/modules/wishlist/wishlist.service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop", description: "Jelajahi seluruh koleksi Gheverhan." };

type ShopPageProps = {
  searchParams: Promise<{ q?: string; flash?: string; sort?: string; page?: string }>;
};

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const sort = (params.sort as "newest" | "price_asc" | "price_desc") ?? "newest";
  const [result, wishIds] = await Promise.all([
    listProducts({
      search: params.q,
      flashSale: params.flash === "1",
      sort,
      page: Number(params.page) || 1,
      pageSize: 12,
    }),
    user ? wishlistProductIds(user.id) : Promise.resolve([]),
  ]);

  return (
    <ProductListing
      title={params.flash === "1" ? "Flash Sale" : "Semua Produk"}
      items={result.items}
      total={result.total}
      wishlisted={new Set(wishIds)}
      basePath="/shop"
      currentSort={sort}
      query={{ ...(params.q ? { q: params.q } : {}), ...(params.flash ? { flash: "1" } : {}) }}
    />
  );
}
