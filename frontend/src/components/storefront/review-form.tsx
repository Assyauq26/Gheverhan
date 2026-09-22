"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { createReviewAction } from "@/modules/reviews/reviews.actions";

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} data-testid="review-submit">
      {pending ? "Mengirim..." : label}
    </Button>
  );
}

export function ReviewForm({ productId, slug }: { productId: string; slug: string }) {
  const [state, action] = useFormState(createReviewAction, { ok: false } as any);
  const [rating, setRating] = useState(5);

  return (
    <form action={action} className="space-y-3 rounded-2xl border border-line p-4" data-testid="review-form">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="rating" value={rating} />
      <div>
        <Label>Rating</Label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              data-testid={`review-star-${n}`}
            >
              <Star size={24} className={n <= rating ? "fill-black text-black" : "text-line"} />
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label>Judul (opsional)</Label>
        <Input name="title" placeholder="Ringkasan singkat" />
      </div>
      <div>
        <Label>Ulasan</Label>
        <Textarea name="body" placeholder="Bagikan pengalamanmu tentang produk ini" required />
      </div>
      {state?.ok === false && state?.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state?.ok && <p className="text-sm text-success">Ulasan berhasil dikirim!</p>}
      <SubmitBtn label="Kirim Ulasan" />
    </form>
  );
}
