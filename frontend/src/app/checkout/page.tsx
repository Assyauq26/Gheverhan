import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCartView } from "@/modules/cart/cart.service";
import { listActiveBankAccounts } from "@/modules/payments/payments.service";
import { getShippingProvider } from "@/infrastructure/shipping";
import { prisma } from "@/lib/prisma";
import { CheckoutClient } from "@/components/storefront/checkout-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirectTo=/checkout");

  const [cart, banks, customer] = await Promise.all([
    getCartView(user.id),
    listActiveBankAccounts(),
    prisma.customer.findUnique({
      where: { userId: user.id },
      include: { addresses: { where: { isDefault: true }, take: 1 } },
    }),
  ]);
  if (cart.lines.length === 0) redirect("/cart");

  const rates = (await getShippingProvider().getRates?.({ destinationCity: "", weightGram: 1000 })) ?? [];
  const addr = customer?.addresses[0] ?? null;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-black text-ink md:text-3xl">Checkout</h1>
      <CheckoutClient
        subtotal={cart.subtotal}
        rates={rates}
        banks={banks}
        address={addr ? {
          recipientName: addr.recipientName,
          phone: addr.phone,
          line: addr.line,
          city: addr.city,
          province: addr.province,
          postalCode: addr.postalCode,
        } : null}
      />
    </div>
  );
}
