import { prisma } from "@/lib/prisma";
import { Prisma, ProductStatus } from "@prisma/client";

const productInclude = {
  images: { orderBy: { sortOrder: "asc" } },
  brand: true,
  category: true,
  variants: { include: { inventory: true } },
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof productInclude;
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
} = {}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(48, params.pageSize ?? 12);
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
      include: productInclude,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

export async function getProductBySlug(slug: string) {
  return prisma.product.findFirst({
    where: { slug, status: { not: ProductStatus.ARCHIVED } },
    include: {
      ...productInclude,
      reviews: {
        where: { status: "PUBLISHED" },
        include: { user: { select: { name: true } }, images: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      questions: {
        include: {
          user: { select: { name: true } },
          answers: { include: { user: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
}

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
    include: productInclude,
    take: 8,
    orderBy: { createdAt: "desc" },
  });
}

export function listCategories() {
  return prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
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
