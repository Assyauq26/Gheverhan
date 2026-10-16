import { z } from "zod";
import { ok, handle } from "@/lib/response";
import { requireUser } from "@/lib/auth/session";
import { previewCheckout } from "@/modules/checkout/checkout.service";

export const dynamic = "force-dynamic";

const schema = z.object({
  couponCode: z.string().max(64).optional(),
  shipping: z.object({ courier: z.string().min(1).max(100), service: z.string().min(1).max(100), cost: z.number().int().nonnegative() }).optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = schema.parse(await req.json());
    return ok(await previewCheckout(user.id, body));
  });
}
