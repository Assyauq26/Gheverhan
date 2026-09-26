import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma, ProductStatus } from "@prisma/client";

// Listing cards only need one image and one variant id. Loading every image,
// every variant and every inventory row for a 12/48 item grid made the RSC
// payload and Prisma response much larger than necessary.
const productCardInclude = {
  images: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
  brand: { select: { name: true } },
  variants: { select: { id: true }, take: 1 },
} satisfies Prisma.ProductInclude;

const productDetailInclude = {
  images: { orderBy: { sortOrder: "asc" } },
  brand: { select: { name: true, slug: true } },
  category: { select: { id: true, slug: true, name: true } },
  variants: {
    select: {
      id: true,
      color: true,
      size: true,
      price: true,
      salePrice: true,
      inventory: { select: { onHand: true, reserved: true } },
    },
  },
  reviews: {
    where: { status: "PUBLISHED" },
    select: {
      id: true,
      rating: true,
      title: true,
      body: true,
      createdAt: true,
      user: { select: { name: true } },
      images: { select: { id: true, url: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  },
  questions: {
    select: {
      id: true,
      body: true,
      createdAt: true,
      user: { select: { name: true } },
      answers: {
        select: {
          id: true,
          body: true,
          isOfficial: true,
          user: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  },
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof productDetailInclude;
}>;

export type ProductListParams = {
  categorySlug?: string;
  brandSlug?: string;
  search?: string;
  featured?: boolean;
  flashSale?: boolean;
  sort?: "newest" | "price_asc" | "price_desc";
  page?: number;
  pageSize?: number;
  includeTotal?: boolean;
};

async function listProductsUncached(params: ProductListParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(48, params.pageSize ?? 12);
  const includeTotal = params.includeTotal ?? true;
  const where: Prisma.ProductWhereInput = {
    status: ProductStatus.PUBLISHED,
    ...(params.categorySlug ? { category: { slug: params.categorySlug } } : {}),
    ...(params.brandSlug ? { brand: { slug: params.brandSlug } } : {}),
    ...(params.featured ? { isFeatured: true } : {}),
    ...(params.flashSale ? { isFlashSale: true } : {}),
    ...(params.search
      ? {
          OR: [
            { name: { contains: params.search, mode: "insensitive" } },
            { description: { contains: params.search, mode: "insensitive" } },
            { brand: { name: { contains: params.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    params.sort === "price_asc"
      ? { basePrice: "asc" }
      : params.sort === "price_desc"
        ? { basePrice: "desc" }
        : { createdAt: "desc" };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: productCardInclude,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    includeTotal ? prisma.product.count({ where }) : Promise.resolve(0),
  ]);

  return { items, total, page, pageSize, pages: includeTotal ? Math.ceil(total / pageSize) : 0 };
}

/**
 * Public catalog data is identical for every user, so cache it briefly at the
 * Next.js data layer. Wishlist/auth data remains request/user-specific.
 * Thirty seconds keeps catalog navigation fast without making product changes
 * appear stale for long.
 */
export async function listProducts(params: ProductListParams = {}) {
  const normalized: ProductListParams = {
    categorySlug: params.categorySlug,
    brandSlug: params.brandSlug,
    search: params.search?.trim() || undefined,
    featured: params.featured ?? false,
    flashSale: params.flashSale ?? false,
    sort: params.sort ?? "newest",
    page: Math.max(1, params.page ?? 1),
    pageSize: Math.min(48, params.pageSize ?? 12),
    includeTotal: params.includeTotal ?? true,
  };
  const cacheKey = JSON.stringify(normalized);

  return unstable_cache(
    () => listProductsUncached(normalized),
    ["catalog-products", cacheKey],
    { revalidate: 30 },
  )();
}

/**
 * React request cache prevents generateMetadata() and the page itself from
 * issuing the same expensive product query during one navigation.
 */
export const getProductBySlug = cache(async (slug: string) => {
  return prisma.product.findFirst({
    where: { slug, status: { not: ProductStatus.ARCHIVED } },
    include: productDetailInclude,
  });
});

export async function getRelatedProducts(product: {
  id: string;
  categoryId: string | null;
}) {
  return prisma.product.findMany({
    where: {
      status: ProductStatus.PUBLISHED,
      id: { not: product.id },
      ...(product.categoryId ? { categoryId: product.categoryId } : {}),
    },
    include: productCardInclude,
    take: 8,
    orderBy: { createdAt: "desc" },
  });
}

export const listCategories = unstable_cache(
  () =>
    prisma.category.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, slug: true, imageUrl: true, iconKey: true },
    }),
  ["catalog-categories"],
  { revalidate: 60 },
);

export const getCategoryBySlug = cache(async (slug: string) => {
  return unstable_cache(
    () => prisma.category.findUnique({ where: { slug } }),
    ["catalog-category", slug],
    { revalidate: 60 },
  )();
});

export const listBrands = unstable_cache(
  () => prisma.brand.findMany({ orderBy: { name: "asc" } }),
  ["catalog-brands"],
  { revalidate: 60 },
);

export const getBrandBySlug = cache(async (slug: string) => {
  return unstable_cache(
    () => prisma.brand.findUnique({ where: { slug } }),
    ["catalog-brand", slug],
    { revalidate: 60 },
  )();
});

export async function searchSuggestions(q: string) {
  if (!q.trim()) return { products: [], brands: [], categories: [] };
  const [products, brands, categories] = await Promise.all([
    prisma.product.findMany({
      where: { status: ProductStatus.PUBLISHED, name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true, slug: true },
      take: 6,
    }),
    prisma.brand.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: { name: true, slug: true },
      take: 4,
    }),
    prisma.category.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: { name: true, slug: true },
      take: 4,
    }),
  ]);
  return { products, brands, categories };
}
