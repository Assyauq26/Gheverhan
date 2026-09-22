import Image from "next/image";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { formatIDR, effectivePrice } from "@/lib/money";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  await requirePermission(PERMISSIONS.PRODUCT_READ);
  const products = await prisma.product.findMany({
    include: {
      brand: true,
      category: true,
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
      variants: { include: { inventory: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-black text-ink">Produk</h1>
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-surface text-left text-xs uppercase text-ink-muted">
            <tr>
              <th className="p-3">Produk</th>
              <th className="p-3">Kategori</th>
              <th className="p-3">Harga</th>
              <th className="p-3">Stok</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {products.map((p) => {
              const stock = p.variants.reduce((s, v) => s + (v.inventory ? v.inventory.onHand - v.inventory.reserved : 0), 0);
              return (
                <tr key={p.id} data-testid={`admin-product-${p.slug}`}>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="relative h-10 w-10 overflow-hidden rounded-lg bg-surface">
                        {p.images[0] && <Image src={p.images[0].url} alt={p.name} fill className="object-cover" sizes="40px" />}
                      </div>
                      <div>
                        <p className="font-semibold text-ink">{p.name}</p>
                        <p className="text-xs text-ink-muted">{p.brand?.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-ink-soft">{p.category?.name ?? "-"}</td>
                  <td className="p-3 font-semibold">{formatIDR(effectivePrice(p.basePrice, p.salePrice))}</td>
                  <td className="p-3">{stock}</td>
                  <td className="p-3"><Badge variant={p.status === "PUBLISHED" ? "success" : "muted"}>{p.status}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
