import { ok, handle } from "@/lib/response";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { approvePayment } from "@/modules/payments/payments.service";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const admin = await requirePermission(PERMISSIONS.PAYMENT_VERIFY);
    return ok(await approvePayment(params.id, admin.id));
  });
}
