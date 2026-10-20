import { z } from "zod";
import { checkoutIntentId } from "@/modules/checkout/checkout-intent";
import { ok, handle } from "@/lib/response";
import { requireUser } from "@/lib/auth/session";
import { checkoutLinesSchema, checkoutQuoteSchema } from "@/modules/checkout/checkout.validation";
import { createOrder } from "@/modules/checkout/checkout.service";
import { listOrdersForUser } from "@/modules/orders/orders.service";

export const dynamic = "force-dynamic";

const schema = z.object({
  intentId: checkoutIntentId.optional(),
  address: z.object({
    recipientName: z.string(), phone: z.string(), line: z.string(),
    city: z.string(), province: z.string(), postalCode: z.string(),
  }),
  shipping: z.object({ courier: z.string(), service: z.string(), cost: z.number().int().nonnegative() }),
  bankAccountId: z.string().min(1),
  couponCode: z.string().optional(),
  note: z.string().optional(),
  expectedLines: checkoutLinesSchema.optional(),
  expectedQuote: checkoutQuoteSchema.optional(),
  requestId: z.string().uuid().optional(),
});

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return ok(await listOrdersForUser(user.id));
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = schema.parse(await req.json());
    const order = await createOrder(user.id, body);
    return ok(order, 201);
  });
}
