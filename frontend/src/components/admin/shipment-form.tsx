import type { ShipmentStatus } from "@prisma/client";
import { OperationForm } from "./operation-form";
export function ShipmentForm({ orderId, allowed, initial }: { orderId: string; allowed: ShipmentStatus[]; initial?: { courier: string | null; service: string | null; cost: number; trackingNumber: string | null; status: ShipmentStatus; notes: string | null; shippedDate: Date | null; estimatedDelivery: Date | null } | null }) {
  if (!allowed.length) return <p className="text-sm text-ink-soft">Tidak ada tindakan pengiriman yang tersedia pada status ini.</p>;
  return <OperationForm url="/api/v1/admin/shipments" label="Simpan pengiriman" confirmation="Dengan menyimpan nomor resi, seller menyatakan paket sudah diserahkan ke kurir. Pesanan PACKED akan otomatis menjadi SHIPPED (Dikirim) dan tanggal kirim dicatat; ini tidak memanggil API kurir. Lanjutkan?" requestId fields={[
    { name: "orderId", label: "Order", type: "hidden", value: orderId },
    { name: "courier", label: "Kurir", required: true, value: initial?.courier || "", maxLength: 100 },
    { name: "service", label: "Layanan", required: true, value: initial?.service || "", maxLength: 100 },
    { name: "cost", label: "Ongkir tercatat (Rp)", type: "number", required: true, value: initial?.cost || 0, min: 0, max: 2147483647, hint: "Tidak mengubah tagihan atau total order." },
    { name: "trackingNumber", label: "Nomor resi", value: initial?.trackingNumber || "", maxLength: 160, hint: "Isi hanya setelah paket PACKED benar-benar diserahkan ke kurir. Menyimpan resi otomatis menetapkan status SHIPPED. Kosongkan jika belum handover." },
    { name: "status", label: "Status pengiriman", type: "select", value: allowed.includes(initial?.status as ShipmentStatus) ? initial!.status : allowed[0], required: true, options: allowed.map(s => ({ value: s, label: s })), hint: "Jika nomor resi terisi, status PENDING/PROCESSING otomatis berubah menjadi SHIPPED saat disimpan." },
    { name: "shippedDate", label: "Tanggal kirim", type: "date", value: initial?.shippedDate?.toISOString().slice(0, 10), hint: "Kosongkan untuk mempertahankan tanggal tersimpan." },
    { name: "estimatedDelivery", label: "Estimasi tiba", type: "date", value: initial?.estimatedDelivery?.toISOString().slice(0, 10) },
    { name: "notes", label: "Catatan pengiriman", type: "textarea", value: initial?.notes || "" },
  ]} />;
}
