"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, ShoppingCart, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/shop", label: "Shop", icon: LayoutGrid },
  { href: "/cart", label: "Keranjang", icon: ShoppingCart, badgeKey: true },
  { href: "/account", label: "Account", icon: User },
];

export function BottomNav({ cartCount = 0 }: { cartCount?: number }) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-3 z-40 mx-auto flex w-[92%] max-w-md items-center justify-between rounded-full border border-line bg-white/95 px-2 py-2 shadow-lg backdrop-blur md:hidden"
      data-testid="bottom-nav"
    >
      {items.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            data-testid={`bottomnav-${item.label.toLowerCase()}`}
            className={cn(
              "relative flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition-colors",
              active ? "bg-black text-white" : "text-ink-soft",
            )}
          >
            <span className="relative">
              <Icon size={20} />
              {item.badgeKey && cartCount > 0 && (
                <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-black px-1 text-[10px] font-bold text-white ring-2 ring-white">
                  {cartCount}
                </span>
              )}
            </span>
            {active && <span>{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
