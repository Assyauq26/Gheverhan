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
import { PERMISSIONS } from "@/lib/auth/permissions";

const items = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true, permission: null },
  { href: "/admin/products", label: "Produk", icon: Package, permission: PERMISSIONS.PRODUCT_READ },
  { href: "/admin/categories", label: "Kategori", icon: Package, permission: PERMISSIONS.PRODUCT_READ },
  { href: "/admin/inventory", label: "Inventori", icon: Package, permission: PERMISSIONS.INVENTORY_READ },
  { href: "/admin/orders", label: "Pesanan", icon: ShoppingBag, permission: PERMISSIONS.ORDER_READ },
  { href: "/admin/payments", label: "Pembayaran", icon: CreditCard, permission: PERMISSIONS.PAYMENT_READ },
  { href: "/admin/shipping", label: "Pengiriman", icon: Truck, permission: PERMISSIONS.SHIPPING_READ },
  { href: "/admin/bank-accounts", label: "Rekening Bank", icon: Landmark, permission: PERMISSIONS.BANK_MANAGE },
  { href: "/admin/customers", label: "Pelanggan", icon: Users, permission: PERMISSIONS.CUSTOMER_READ },
  { href: "/admin/audit", label: "Audit Log", icon: ScrollText, permission: PERMISSIONS.AUDIT_READ },
];

export function AdminNav({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();
  return (
    <nav className="no-scrollbar flex gap-1 overflow-x-auto p-3 md:flex-col md:overflow-visible">
      {items.filter(it => !it.permission || permissions.includes(it.permission)).map((it) => {
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
