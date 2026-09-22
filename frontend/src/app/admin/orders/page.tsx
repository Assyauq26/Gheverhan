import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listOrdersAdmin } from "@/modules/orders/orders.service";
import { ORDER_TRANSITIONS } from "@/modules/orders/domain/state-machine";
import { formatIDR } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABEL, orderBadgeVariant } from "@/lib/order-status";
import { OrderStatusControl } from "@/components/admin/order-status-control";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({ searchParams }: { searchParams: { q?: string } }) {
  await requirePermission(PERMISSIONS.ORDER_READ);
  const orders = await listOrdersAdmin({ search: searchParams.q });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-black text-ink">Pesanan</h1>
      <div className="space-y-3">
        {orders.map((o) => (
          <div key={o.id} className="grid gap-3 rounded-2xl border border-line bg-white p-4 md:grid-cols-[1fr_auto]" data-testid={`admin-order-${o.orderNumber}`}>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-ink">{o.orderNumber}</span>
                <Badge variant={orderBadgeVariant(o.status)}>{ORDER_STATUS_LABEL[o.status]}</Badge>
                <Badge variant={o.paymentStatus === "PAID" ? "success" : "warning"}>Bayar: {o.paymentStatus}</Badge>
              </div>
              <p className="mt-1 text-xs text-ink-muted">{o.user.name} · {o.items.length} item · {formatIDR(o.total)}</p>
            </div>
            <div className="flex items-center">
              <OrderStatusControl orderId={o.id} allowed={ORDER_TRANSITIONS[o.status]} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
