import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProductListing } from "@/components/storefront/product-listing";
import { listProducts, getBrandBySlug } from "@/modules/catalog/catalog.service";
import { getCurrentUser } from "@/lib/auth/session";
import { wishlistProductIds } from "@/modules/wishlist/wishlist.service";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const brand = await getBrandBySlug(params.slug);
  return {
    title: brand ? brand.name : "Brand",
    alternates: { canonical: `/brand/${params.slug}` },
  };
}

export default async function BrandPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { sort?: string };
}) {
  const brand = await getBrandBySlug(params.slug);
  if (!brand) notFound();
  const user = await getCurrentUser();
  const sort = (searchParams.sort as "newest" | "price_asc" | "price_desc") ?? "newest";
  const [result, wishIds] = await Promise.all([
    listProducts({ brandSlug: params.slug, sort, pageSize: 24 }),
    user ? wishlistProductIds(user.id) : Promise.resolve([]),
  ]);

  return (
    <ProductListing
      title={brand.name}
      items={result.items}
      total={result.total}
      wishlisted={new Set(wishIds)}
      basePath={`/brand/${params.slug}`}
      currentSort={sort}
    />
  );
}
