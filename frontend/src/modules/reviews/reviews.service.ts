import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";

/** Recompute a product's rating aggregate from published reviews. */
async function recomputeRating(productId: string) {
  const agg = await prisma.review.aggregate({
    where: { productId, status: "PUBLISHED" },
    _avg: { rating: true },
    _count: true,
  });
  await prisma.product.update({
    where: { id: productId },
    data: { ratingAvg: agg._avg.rating ?? 0, reviewCount: agg._count },
  });
}

export async function createReview(
  userId: string,
  productId: string,
  input: { rating: number; title?: string; body: string; images?: string[] },
) {
  if (input.rating < 1 || input.rating > 5) throw new HttpError("Rating tidak valid", 400);
  const review = await prisma.review.create({
    data: {
      productId,
      userId,
      rating: input.rating,
      title: input.title,
      body: input.body,
      status: "PUBLISHED",
      images: input.images?.length
        ? { create: input.images.map((url) => ({ url })) }
        : undefined,
    },
  });
  await recomputeRating(productId);
  return review;
}

export function listReviews(productId: string) {
  return prisma.review.findMany({
    where: { productId, status: "PUBLISHED" },
    include: { user: { select: { name: true } }, images: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function askQuestion(userId: string, productId: string, body: string) {
  if (!body.trim()) throw new HttpError("Pertanyaan tidak boleh kosong", 400);
  return prisma.productQuestion.create({ data: { userId, productId, body } });
}

export async function answerQuestion(
  userId: string,
  questionId: string,
  body: string,
  isOfficial = false,
) {
  if (!body.trim()) throw new HttpError("Jawaban tidak boleh kosong", 400);
  return prisma.productAnswer.create({ data: { userId, questionId, body, isOfficial } });
}
