import { Megaphone } from "lucide-react";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listMarketing } from "@/modules/promotions/marketing.service";
import { MarketingManager } from "@/components/admin/marketing-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marketing | Gheverhan", robots: { index: false } };

export default async function MarketingPage() {
  const actor = await requireBackofficeUser();
  if (![PERMISSIONS.PROMOTION_CREATE, PERMISSIONS.PROMOTION_UPDATE].some(p => actor.permissions.includes(p))) {
    // Same safe not-found boundary used by other backoffice pages.
    const { notFound } = await import("next/navigation");
    notFound();
  }
  const { vouchers, products, activeVouchers, activeFlashSales } = await listMarketing(actor);
  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="space-y-2">
      <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-black text-white"><Megaphone size={19}/></span>
        <div><h1 className="text-2xl font-bold text-ink">Marketing</h1>
          <p className="text-sm text-ink-soft">Kelola voucher checkout dan flash sale produk Gheverhan.</p></div>
      </div>
    </header>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-line bg-white p-4"><p className="text-sm text-ink-soft">Voucher aktif</p><p className="mt-1 text-2xl font-bold tabular-nums">{activeVouchers}</p></div>
      <div className="rounded-2xl border border-line bg-white p-4"><p className="text-sm text-ink-soft">Flash sale aktif</p><p className="mt-1 text-2xl font-bold tabular-nums">{activeFlashSales}</p></div>
      <div className="rounded-2xl border border-line bg-white p-4"><p className="text-sm text-ink-soft">Model promosi</p><p className="mt-1 text-sm font-semibold">Manual + terjadwal</p></div>
    </div>
    <MarketingManager
      vouchers={vouchers.map(v => ({ ...v, expiresAt: v.expiresAt?.toISOString() || null, startsAt: v.startsAt?.toISOString() || null, createdAt: v.createdAt.toISOString() }))}
      products={products.map(p => ({ ...p, updatedAt: p.updatedAt.toISOString(),
        flashSaleStartsAt: p.flashSaleStartsAt?.toISOString() || null, flashSaleEndsAt: p.flashSaleEndsAt?.toISOString() || null,
        eligible: p.variants.length > 0 && p.salePrice == null && !p.isFlashSale && p.variants.every(v => v.price == null && v.salePrice == null),
        variants: undefined }))}
      canCreate={actor.permissions.includes(PERMISSIONS.PROMOTION_CREATE)}
      canUpdate={actor.permissions.includes(PERMISSIONS.PROMOTION_UPDATE)}
      canReadProducts={actor.permissions.includes(PERMISSIONS.PRODUCT_READ)}
    />
  </div>;
}
