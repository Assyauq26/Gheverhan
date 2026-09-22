import Link from "next/link";
import { ChevronLeft, Lock } from "lucide-react";

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="container flex items-center justify-between py-4">
          <Link href="/cart" className="flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink">
            <ChevronLeft size={18} /> Kembali
          </Link>
          <span className="font-display text-xl font-extrabold">Gheverhan</span>
          <span className="flex items-center gap-1 text-xs text-ink-muted"><Lock size={14} /> Aman</span>
        </div>
      </header>
      <main className="container py-6">{children}</main>
    </div>
  );
}
