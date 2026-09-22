"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { runAction } from "@/lib/action";
import { createOrder } from "./checkout.service";

const schema = z.object({
  recipientName: z.string().min(2),
  phone: z.string().min(6),
  line: z.string().min(4),
  city: z.string().min(2),
  province: z.string().min(2),
  postalCode: z.string().min(3),
  courier: z.string().min(1),
  service: z.string().min(1),
  shippingCost: z.coerce.number().int().nonnegative(),
  bankAccountId: z.string().min(1),
  couponCode: z.string().optional(),
  note: z.string().optional(),
});

export async function createOrderAction(_prev: unknown, formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false as const, error: "Lengkapi data pengiriman dengan benar" };
  }
  const d = parsed.data;
  const res = await runAction(async () => {
    const user = await requireUser();
    const order = await createOrder(user.id, {
      address: {
        recipientName: d.recipientName,
        phone: d.phone,
        line: d.line,
        city: d.city,
        province: d.province,
        postalCode: d.postalCode,
      },
      shipping: { courier: d.courier, service: d.service, cost: d.shippingCost },
      bankAccountId: d.bankAccountId,
      couponCode: d.couponCode,
      note: d.note,
    });
    return order.id;
  });
  if (!res.ok) return res;
  revalidatePath("/orders");
  redirect(`/checkout/payment/${res.data}`);
}
