import { assertMutationOrigin } from "@/lib/mutation-origin";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { handle, ok } from "@/lib/response";
import { declineRefund } from "@/modules/payments/refund.service";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => { assertMutationOrigin(req); const actor = await requirePermission(PERMISSIONS.PAYMENT_VERIFY); const input = z.object({ reason: z.string().min(3).max(2000) }).parse(await req.json()); return ok(await declineRefund((await params).id, actor.id, input.reason)); });
}
