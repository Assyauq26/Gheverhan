import { z } from "zod";
import { ok, handle } from "@/lib/response";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { rejectPayment } from "@/modules/payments/payments.service";

export const dynamic = "force-dynamic";

const schema = z.object({ reason: z.string().min(1) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const admin = await requirePermission(PERMISSIONS.PAYMENT_VERIFY);
    const body = schema.parse(await req.json());
    return ok(await rejectPayment(params.id, admin.id, body.reason));
  });
}
