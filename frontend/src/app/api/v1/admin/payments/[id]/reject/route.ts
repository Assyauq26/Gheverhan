import { z } from "zod";
import { ok, handle } from "@/lib/response";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { rejectPayment } from "@/modules/payments/payments.service";

export const dynamic = "force-dynamic";

const schema = z.object({ reason: z.string().min(1) });
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    const admin = await requirePermission(PERMISSIONS.PAYMENT_VERIFY);
    const body = schema.parse(await req.json());
    return ok(await rejectPayment(id, admin.id, body.reason));
  });
}
