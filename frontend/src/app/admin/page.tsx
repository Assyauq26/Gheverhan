import Link from "next/link";
import { ShoppingBag, CreditCard, Package, Wallet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatIDR } from "@/lib/money";
import { ORDER_STATUS_LABEL, orderBadgeVariant } from "@/lib/order-status";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [orderCount, pendingPayments, productCount, revenue, recent] = await Promise.all([
    prisma.order.count(),
    prisma.payment.count({ where: { status: "WAITING_VERIFICATION" } }),
    prisma.product.count(),
    prisma.order.aggregate({ where: { paymentStatus: "PAID" }, _sum: { total: true } }),
    prisma.order.findMany({
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);

  const stats = [
    { icon: Wallet, label: "Pendapatan", value: formatIDR(revenue._sum.total ?? 0) },
    { icon: ShoppingBag, label: "Total Pesanan", value: orderCount },
    { icon: CreditCard, label: "Perlu Verifikasi", value: pendingPayments, href: "/admin/payments" },
    { icon: Package, label: "Produk", value: productCount },
  ];

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-black text-ink">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s, i) => {
          const card = (
            <div className="rounded-2xl border border-line bg-white p-5" data-testid={`stat-${i}`}>
              <s.icon size={22} className="text-ink" />
              <p className="mt-3 font-display text-2xl font-black text-ink">{s.value}</p>
              <p className="text-sm text-ink-soft">{s.label}</p>
            </div>
          );
          return s.href ? <Link key={i} href={s.href}>{card}</Link> : <div key={i}>{card}</div>;
        })}
      </div>

      <section className="rounded-2xl border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="font-display font-bold text-ink">Pesanan Terbaru</h2>
          <Link href="/admin/orders" className="text-sm font-semibold text-ink-soft hover:text-ink">Lihat Semua</Link>
        </div>
        <div className="divide-y divide-line">
          {recent.map((o) => (
            <Link key={o.id} href={`/admin/orders`} className="flex items-center justify-between p-4 hover:bg-surface">
              <div>
                <p className="text-sm font-semibold text-ink">{o.orderNumber}</p>
                <p className="text-xs text-ink-muted">{o.user.name}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">{formatIDR(o.total)}</span>
                <Badge variant={orderBadgeVariant(o.status)}>{ORDER_STATUS_LABEL[o.status]}</Badge>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
