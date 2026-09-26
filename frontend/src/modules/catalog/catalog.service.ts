import { cache } from "react";
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

export async function listProducts(params: {
  categorySlug?: string;
  brandSlug?: string;
  search?: string;
  featured?: boolean;
  flashSale?: boolean;
  sort?: "newest" | "price_asc" | "price_desc";
  page?: number;
  pageSize?: number;
  includeTotal?: boolean;
} = {}) {
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

export function listCategories() {
  return prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, slug: true, imageUrl: true, iconKey: true },
  });
}

export function getCategoryBySlug(slug: string) {
  return prisma.category.findUnique({ where: { slug } });
}

export function listBrands() {
  return prisma.brand.findMany({ orderBy: { name: "asc" } });
}

export function getBrandBySlug(slug: string) {
  return prisma.brand.findUnique({ where: { slug } });
}

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
