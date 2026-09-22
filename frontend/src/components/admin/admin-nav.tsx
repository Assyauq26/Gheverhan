"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  CreditCard,
  Truck,
  Landmark,
  Users,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/products", label: "Produk", icon: Package },
  { href: "/admin/orders", label: "Pesanan", icon: ShoppingBag },
  { href: "/admin/payments", label: "Pembayaran", icon: CreditCard },
  { href: "/admin/shipping", label: "Pengiriman", icon: Truck },
  { href: "/admin/bank-accounts", label: "Rekening Bank", icon: Landmark },
  { href: "/admin/customers", label: "Pelanggan", icon: Users },
  { href: "/admin/audit", label: "Audit Log", icon: ScrollText },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="no-scrollbar flex gap-1 overflow-x-auto p-3 md:flex-col md:overflow-visible">
      {items.map((it) => {
        const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            data-testid={`adminnav-${it.label.toLowerCase()}`}
            className={cn(
              "flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
              active ? "bg-white text-black" : "text-white/60 hover:bg-white/10 hover:text-white",
            )}
          >
            <it.icon size={18} /> {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
