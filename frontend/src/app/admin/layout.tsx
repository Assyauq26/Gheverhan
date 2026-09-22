import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AdminNav } from "@/components/admin/admin-nav";
import { LogoutButton } from "@/components/storefront/logout-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirectTo=/admin");
  if (!user.isAdmin) redirect("/");

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="sticky top-0 hidden h-screen w-64 flex-col justify-between bg-black md:flex">
        <div>
          <div className="p-5">
            <Link href="/admin" className="font-display text-xl font-extrabold text-white">Gheverhan</Link>
            <p className="text-xs text-white/50">Admin Panel</p>
          </div>
          <AdminNav />
        </div>
        <div className="p-4">
          <p className="mb-2 text-xs text-white/50">{user.name} · {user.roles[0]}</p>
          <Link href="/" className="text-xs font-semibold text-white/70 hover:text-white">← Kembali ke Toko</Link>
        </div>
      </aside>

      <div className="flex-1">
        <header className="sticky top-0 z-20 border-b border-line bg-white md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="font-display text-lg font-extrabold">Admin</span>
            <LogoutButton />
          </div>
          <div className="bg-black"><AdminNav /></div>
        </header>
        <main className="p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
