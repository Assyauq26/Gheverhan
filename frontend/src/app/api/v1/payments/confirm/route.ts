import { z } from "zod";
import { randomUUID } from "crypto";
import { ok, fail, handle } from "@/lib/response";
import { requireUser } from "@/lib/auth/session";
import { putObject, STORAGE_APP } from "@/lib/storage";
import { submitConfirmation } from "@/modules/payments/payments.service";

export const dynamic = "force-dynamic";

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
};

const fields = z.object({
  orderId: z.string().min(1),
  senderBank: z.string().min(1),
  senderName: z.string().min(1),
  amount: z.coerce.number().int().positive(),
  transferDate: z.string().min(1),
  note: z.string().optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const form = await req.formData();
    const parsed = fields.parse(Object.fromEntries(form));
    const file = form.get("proof");
    if (!(file instanceof File) || file.size === 0) return fail("Bukti transfer wajib", 400);
    if (!ALLOWED[file.type]) return fail("Format tidak didukung", 415);
    if (file.size > 5 * 1024 * 1024) return fail("Ukuran maksimal 5MB", 413);

    const ext = ALLOWED[file.type];
    const path = `${STORAGE_APP}/payment-proofs/${user.id}/${randomUUID()}.${ext}`;
    const stored = await putObject(path, new Uint8Array(await file.arrayBuffer()), file.type);
    const order = await submitConfirmation(user.id, parsed.orderId, {
      senderBank: parsed.senderBank, senderName: parsed.senderName, amount: parsed.amount,
      transferDate: new Date(parsed.transferDate), proofPath: stored.path, proofMime: file.type, note: parsed.note,
    });
    return ok(order, 201);
  });
}
