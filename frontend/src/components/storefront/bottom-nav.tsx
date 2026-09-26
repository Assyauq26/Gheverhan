"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, ShoppingBag, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/shop", label: "Shop", icon: LayoutGrid },
  { href: "/cart", label: "Keranjang", icon: ShoppingBag, badgeKey: true },
  { href: "/account", label: "Account", icon: User },
];

export function BottomNav({ cartCount = 0 }: { cartCount?: number }) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-3 z-40 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] items-center justify-center gap-1 rounded-full border border-line bg-white/95 p-1.5 shadow-lg backdrop-blur md:hidden"
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
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold transition-all duration-200 ease-out",
              active
                ? "min-w-[84px] gap-2 bg-black px-4 text-white shadow-sm"
                : "w-11 px-0 text-ink-soft hover:bg-surface/70",
            )}
          >
            <span className="relative flex shrink-0 items-center justify-center">
              <Icon size={20} strokeWidth={active ? 2.2 : 2} />
              {item.badgeKey && cartCount > 0 && (
                <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold leading-none text-black ring-1 ring-black/10">
                  {cartCount}
                </span>
              )}
            </span>
            <span
              className={cn(
                "whitespace-nowrap transition-[max-width,opacity,transform] duration-200",
                active
                  ? "max-w-[72px] translate-x-0 opacity-100"
                  : "pointer-events-none max-w-0 -translate-x-1 opacity-0",
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
