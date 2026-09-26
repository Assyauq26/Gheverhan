import Link from "next/link";
import { Heart, ShoppingCart, User } from "lucide-react";
import type { AuthUserBasic } from "@/lib/auth/session";
import { SearchBar } from "./search-bar";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
  { href: "/shop", label: "Kategori" },
  { href: "/shop", label: "Brand" },
  { href: "/shop?flash=1", label: "Promo" },
];

export function StorefrontHeader({
  user,
  cartCount: count = 0,
}: {
  user: AuthUserBasic | null;
  cartCount?: number;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <div className="container flex items-center gap-4 py-3">
        <Link href="/" className="font-display text-2xl font-extrabold tracking-tight" data-testid="logo">
          Gheverhan
        </Link>

        <nav className="ml-4 hidden items-center gap-6 lg:flex">
          {navLinks.map((l, i) => (
            <Link
              key={i}
              href={l.href}
              className="text-sm font-semibold text-ink-soft transition-colors hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden flex-1 md:block">
          <SearchBar />
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Link href="/wishlist" aria-label="Wishlist" data-testid="header-wishlist" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface">
            <Heart size={20} />
          </Link>
          <Link href="/cart" aria-label="Keranjang" data-testid="header-cart" className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface">
            <ShoppingCart size={20} />
            {count > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-black px-1 text-[10px] font-bold text-white ring-2 ring-white">
                {count}
              </span>
            )}
          </Link>
          <Link href={user ? "/account" : "/login"} data-testid="header-account" className="flex items-center gap-2 rounded-full px-2 py-1.5 hover:bg-surface">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface">
              <User size={18} />
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-sm font-semibold text-ink">
                {user ? user.name.split(" ")[0] : "Masuk"}
              </span>
              <span className="block text-[11px] text-ink-muted">Akun Saya</span>
            </span>
          </Link>
        </div>
      </div>

      <div className="container pb-3 md:hidden">
        <SearchBar />
      </div>
    </header>
  );
}
