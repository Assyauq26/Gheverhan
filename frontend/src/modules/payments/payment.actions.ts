"use server";

import { z } from "zod";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { runAction } from "@/lib/action";
import { putObject, STORAGE_APP } from "@/lib/storage";
import { submitConfirmation } from "./payments.service";

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const MAX_BYTES = 5 * 1024 * 1024;

const fields = z.object({
  orderId: z.string().min(1),
  senderBank: z.string().min(1, "Bank pengirim wajib diisi"),
  senderName: z.string().min(2, "Nama pengirim wajib diisi"),
  amount: z.coerce.number().int().positive("Nominal tidak valid"),
  transferDate: z.string().min(1, "Tanggal transfer wajib diisi"),
  note: z.string().optional(),
});

export async function submitProofAction(_prev: unknown, formData: FormData) {
  const parsed = fields.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false as const, error: parsed.error.errors[0].message };

  const file = formData.get("proof");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "Bukti transfer wajib diunggah" };
  }
  if (!ALLOWED[file.type]) {
    return { ok: false as const, error: "Format harus JPG, PNG, WebP, atau PDF" };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false as const, error: "Ukuran file maksimal 5MB" };
  }

  return runAction(async () => {
    const user = await requireUser();
    const ext = ALLOWED[file.type];
    const path = `${STORAGE_APP}/payment-proofs/${user.id}/${randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const stored = await putObject(path, bytes, file.type);

    await submitConfirmation(user.id, parsed.data.orderId, {
      senderBank: parsed.data.senderBank,
      senderName: parsed.data.senderName,
      amount: parsed.data.amount,
      transferDate: new Date(parsed.data.transferDate),
      proofPath: stored.path,
      proofMime: file.type,
      note: parsed.data.note,
    });
    revalidatePath(`/orders/${parsed.data.orderId}`);
    revalidatePath(`/checkout/payment/${parsed.data.orderId}`);
    return { submitted: true };
  });
}
