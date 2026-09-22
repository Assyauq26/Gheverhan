import { prisma } from "@/lib/prisma";

export async function trackView(userId: string, productId: string) {
  await prisma.recentlyViewed.upsert({
    where: { userId_productId: { userId, productId } },
    create: { userId, productId },
    update: { viewedAt: new Date() },
  });
}

export function getRecentlyViewed(userId: string) {
  return prisma.recentlyViewed.findMany({
    where: { userId },
    include: {
      product: {
        include: { images: { orderBy: { sortOrder: "asc" }, take: 1 }, brand: true, variants: { take: 1 } },
      },
    },
    orderBy: { viewedAt: "desc" },
    take: 8,
  });
}
