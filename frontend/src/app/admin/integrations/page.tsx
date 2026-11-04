import Link from "@/components/ui/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isJntSettingsAdministrator } from "@/infrastructure/shipping/jnt/official-config";
import { notFound, redirect } from "next/navigation";
import { Truck } from "lucide-react";
export const dynamic = "force-dynamic";
export const metadata = { title: "Integrasi", robots: { index: false } };
export default async function IntegrationsPage() {
  const user = await getCurrentUser(false);
  if (!user) redirect("/login?redirectTo=/admin/integrations");
  if (!isJntSettingsAdministrator(user)) notFound();
  return <div className="max-w-3xl space-y-6">
    <header><h1 className="text-2xl font-bold">Integrasi</h1><p className="mt-2 text-sm text-zinc-600">Hubungkan layanan pengiriman yang digunakan toko Anda.</p></header>
    <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-3"><Truck aria-hidden="true" size={24}/><h2 className="text-lg font-semibold">J&T Express</h2></div>
      <p className="my-4 max-w-xl text-sm leading-6 text-zinc-600">Kelola akun API, gudang pengirim, dan layanan. Uji Check Fee hanya membaca tarif; tidak membuat atau membatalkan resi. Kredensial tersimpan tetap dirahasiakan.</p>
      <Link href="/admin/integrations/jnt" className="inline-flex min-h-11 items-center rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Atur J&T Express</Link>
    </section>
  </div>;
}
