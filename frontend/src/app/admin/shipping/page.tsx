import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { formatIDR } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Truck } from "lucide-react";
import { ShipmentForm } from "@/components/admin/shipment-form";

export const dynamic = "force-dynamic";

export default async function AdminShippingPage() {
  await requirePermission(PERMISSIONS.SHIPPING_READ);
  // Orders that are paid or beyond and need shipping management.
  const orders = await prisma.order.findMany({
    where: { status: { in: ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"] } },
    include: { shipment: true, user: { select: { name: true } }, address: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-black text-ink">Pengiriman Manual</h1>
      {orders.length === 0 ? (
        <EmptyState icon={<Truck size={40} />} title="Belum ada pesanan untuk dikirim" />
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <details key={o.id} className="rounded-2xl border border-line bg-white p-4" data-testid={`shipping-order-${o.orderNumber}`}>
              <summary className="flex cursor-pointer items-center justify-between">
                <div>
                  <span className="font-semibold text-ink">{o.orderNumber}</span>
                  <span className="ml-2 text-xs text-ink-muted">{o.user.name} · {o.address?.city}</span>
                </div>
                <div className="flex items-center gap-2">
                  {o.shipment ? <Badge variant="info">{o.shipment.status}{o.shipment.trackingNumber ? ` · ${o.shipment.trackingNumber}` : ""}</Badge> : <Badge variant="warning">Belum ada resi</Badge>}
                  <span className="text-sm font-semibold">{formatIDR(o.total)}</span>
                </div>
              </summary>
              <div className="mt-4 border-t border-line pt-4">
                <ShipmentForm orderId={o.id} initial={o.shipment} />
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
