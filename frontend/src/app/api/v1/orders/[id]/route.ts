import { ok, handle } from "@/lib/response";
import { requireUser } from "@/lib/auth/session";
import { getOrderForUser } from "@/modules/orders/orders.service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    return ok(await getOrderForUser(user.id, params.id));
  });
}
