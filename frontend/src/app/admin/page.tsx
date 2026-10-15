import { Suspense } from "react";
import { OperationsSkeleton } from "@/components/admin/operations-skeleton";
import type { AuthUser } from "@/lib/auth/session";
import Link from "@/components/ui/navigation";
import { Package, Plus, ShoppingBag } from "lucide-react";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { getSellerDashboard } from "@/modules/admin/dashboard.service";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatIDR } from "@/lib/money";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
export const dynamic = "force-dynamic";
export default async function AdminDashboard() {
  const user = await requireBackofficeUser();
  return <Suspense fallback={<OperationsSkeleton />}><DashboardContent user={user} /></Suspense>;
}
async function DashboardContent({ user }: { user: AuthUser }) {
  const data = await getSellerDashboard(user);
  const canCreate = user.permissions.includes(PERMISSIONS.PRODUCT_CREATE) && user.permissions.includes(PERMISSIONS.PRODUCT_READ);
  return <div className="space-y-8">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold text-ink">Dashboard toko</h1><p className="mt-1 text-sm text-ink-soft">Ringkasan Gheverhan berdasarkan data aktual · semua waktu.</p></div>{canCreate && <Button asChild><Link href="/admin/products/new"><Plus size={16} /> Tambah produk</Link></Button>}</header>
    <dl className="grid divide-y divide-line rounded-2xl border border-line bg-white sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
      {data.products && <div className="space-y-2 p-5"><dt className="text-sm text-ink-soft">Produk</dt><dd className="text-3xl font-semibold tabular-nums" data-testid="dashboard-products">{data.products.total}</dd><dd className="text-xs text-ink-soft">{data.products.published} terbit · {data.products.drafts} draft · {data.products.archived} arsip</dd></div>}
      {data.inventory && <div className="space-y-2 p-5"><dt className="text-sm text-ink-soft">Stok tersedia</dt><dd className="text-3xl font-semibold tabular-nums" data-testid="dashboard-stock">{data.inventory.available}</dd><dd className="text-xs text-ink-soft">{data.inventory.reserved} direservasi · {data.inventory.variants} varian</dd></div>}
      {data.orders && <div className="space-y-2 p-5"><dt className="text-sm text-ink-soft">Pesanan</dt><dd className="text-3xl font-semibold tabular-nums" data-testid="dashboard-orders">{data.orders.total}</dd><dd className="text-xs text-ink-soft">{data.orders.pending} menunggu pembayaran · {data.orders.processing} diproses</dd></div>}
      {data.sales && <div className="min-w-0 space-y-2 p-5"><dt className="text-sm text-ink-soft">Penjualan dibayar</dt><dd className="break-words text-2xl font-semibold tabular-nums" data-testid="dashboard-sales">{formatIDR(data.sales.amount)}</dd><dd className="text-xs text-ink-soft">{data.sales.count} pesanan dengan pembayaran PAID</dd></div>}
    </dl>
    {!data.products && !data.inventory && !data.orders && !data.sales && <EmptyState title="Akses dashboard terbatas" description="Role Anda belum memiliki izin untuk melihat ringkasan toko." />}
    {data.products?.total === 0 && <EmptyState icon={<Package size={32} />} title="Mulai isi katalog toko" description="Belum ada produk. Buat draft, lengkapi varian dan gambar, lalu terbitkan." action={canCreate ? <Button asChild><Link href="/admin/products/new">Buat produk pertama</Link></Button> : undefined} />}
    {data.recent && <section className="space-y-4"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Pesanan terbaru</h2><Link href="/admin/orders" className="text-sm underline underline-offset-4">Semua pesanan</Link></div>{!data.recent.length ? <EmptyState icon={<ShoppingBag size={32} />} title="Belum ada pesanan" description="Pesanan pembeli akan tampil di sini setelah checkout." /> : <ul className="divide-y divide-line rounded-2xl border border-line bg-white">{data.recent.map(order => <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><Link href={`/admin/orders/${order.id}`} className="text-sm font-semibold hover:underline">{order.orderNumber}</Link><p className="mt-1 text-xs text-ink-soft">{order.user.name} · {ORDER_STATUS_LABEL[order.status]}</p></div><p className="text-sm font-semibold tabular-nums">{formatIDR(order.total)}</p></li>)}</ul>}</section>}
  </div>;
}
