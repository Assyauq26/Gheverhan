import { z } from "zod";
import { ok, handle } from "@/lib/response";
import { requireUser } from "@/lib/auth/session";
import { updateItem, removeItem } from "@/modules/cart/cart.service";

export const dynamic = "force-dynamic";

const schema = z.object({ quantity: z.number().int() });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const body = schema.parse(await req.json());
    return ok(await updateItem(user.id, params.id, body.quantity));
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    return ok(await removeItem(user.id, params.id));
  });
}
