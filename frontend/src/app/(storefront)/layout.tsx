import { StorefrontHeader } from "@/components/storefront/header";
import { BottomNav } from "@/components/storefront/bottom-nav";
import { Truck, ShieldCheck, Headphones, Star } from "lucide-react";
import Link from "next/link";
import { getStorefrontUserContext } from "@/lib/auth/session";

export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The shared layout needs identity + cart badge only. Resolve both from
  // one request-scoped database lookup instead of user query + cart query.
  const user = await getStorefrontUserContext();
  const count = user?.cartCount ?? 0;

  return (
    <div className="min-h-screen bg-white pb-24 md:pb-0">
      <StorefrontHeader user={user} cartCount={count} />
      <main className="container py-6">{children}</main>

      <footer className="mt-10 border-t border-line bg-white">
        <div className="container grid grid-cols-2 gap-6 py-8 md:grid-cols-4">
          {[
            { icon: Truck, t: "Pengiriman Cepat", s: "ke seluruh Indonesia" },
            { icon: ShieldCheck, t: "Belanja Aman", s: "100% transaksi aman" },
            { icon: Headphones, t: "CS Responsif", s: "Siap membantu kamu" },
            { icon: Star, t: "100K+ Pelanggan", s: "Sudah percaya Gheverhan" },
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-3">
              <f.icon size={24} className="text-ink" />
              <div>
                <p className="text-sm font-semibold text-ink">{f.t}</p>
                <p className="text-xs text-ink-muted">{f.s}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-line">
          <div className="container flex flex-col items-center justify-between gap-2 py-6 text-xs text-ink-muted md:flex-row">
            <span className="font-display text-lg font-extrabold text-ink">Gheverhan</span>
            <span>© {new Date().getFullYear()} Gheverhan. Better Outfits, Brighter Days.</span>
            <Link href="/admin" className="hover:text-ink">Admin</Link>
          </div>
        </div>
      </footer>

      <BottomNav cartCount={count} />
    </div>
  );
}
