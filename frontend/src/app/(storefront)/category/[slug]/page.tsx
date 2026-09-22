import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProductListing } from "@/components/storefront/product-listing";
import { listProducts, getCategoryBySlug } from "@/modules/catalog/catalog.service";
import { getCurrentUser } from "@/lib/auth/session";
import { wishlistProductIds } from "@/modules/wishlist/wishlist.service";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const cat = await getCategoryBySlug(params.slug);
  return {
    title: cat ? `Kategori ${cat.name}` : "Kategori",
    description: cat ? `Belanja produk kategori ${cat.name} di Gheverhan.` : undefined,
    alternates: { canonical: `/category/${params.slug}` },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { sort?: string };
}) {
  const cat = await getCategoryBySlug(params.slug);
  if (!cat) notFound();
  const user = await getCurrentUser();
  const sort = (searchParams.sort as "newest" | "price_asc" | "price_desc") ?? "newest";
  const [result, wishIds] = await Promise.all([
    listProducts({ categorySlug: params.slug, sort, pageSize: 24 }),
    user ? wishlistProductIds(user.id) : Promise.resolve([]),
  ]);

  return (
    <ProductListing
      title={cat.name}
      items={result.items}
      total={result.total}
      wishlisted={new Set(wishIds)}
      basePath={`/category/${params.slug}`}
      currentSort={sort}
    />
  );
}
