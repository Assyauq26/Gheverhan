import { ok, handle } from "@/lib/response";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { approvePayment } from "@/modules/payments/payments.service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    const admin = await requirePermission(PERMISSIONS.PAYMENT_VERIFY);
    return ok(await approvePayment(id, admin.id));
  });
}
