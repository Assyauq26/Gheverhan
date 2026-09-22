"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { runAction } from "@/lib/action";
import { createReview, askQuestion } from "./reviews.service";

const reviewSchema = z.object({
  productId: z.string().min(1),
  slug: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().optional(),
  body: z.string().min(3, "Ulasan minimal 3 karakter"),
});

export async function createReviewAction(_prev: unknown, formData: FormData) {
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false as const, error: parsed.error.errors[0].message };
  const res = await runAction(async () => {
    const user = await requireUser();
    await createReview(user.id, parsed.data.productId, {
      rating: parsed.data.rating,
      title: parsed.data.title,
      body: parsed.data.body,
    });
    return { ok: true };
  });
  revalidatePath(`/product/${parsed.data.slug}`);
  return res;
}

const qnaSchema = z.object({
  productId: z.string().min(1),
  slug: z.string().min(1),
  body: z.string().min(3, "Pertanyaan minimal 3 karakter"),
});

export async function askQuestionAction(_prev: unknown, formData: FormData) {
  const parsed = qnaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false as const, error: parsed.error.errors[0].message };
  const res = await runAction(async () => {
    const user = await requireUser();
    await askQuestion(user.id, parsed.data.productId, parsed.data.body);
    return { ok: true };
  });
  revalidatePath(`/product/${parsed.data.slug}`);
  return res;
}
