import type { ShipmentStatus } from "@prisma/client";
import { OperationForm } from "./operation-form";
export function ShipmentForm({ orderId, allowed, initial }: { orderId: string; allowed: ShipmentStatus[]; initial?: { courier: string | null; service: string | null; cost: number; trackingNumber: string | null; status: ShipmentStatus; notes: string | null; shippedDate: Date | null; estimatedDelivery: Date | null } | null }) {
  if (!allowed.length) return <p className="text-sm text-ink-soft">Tidak ada tindakan pengiriman yang tersedia pada status ini.</p>;
  return <OperationForm url="/api/v1/admin/shipments" label="Simpan pengiriman" confirmation="Nomor resi BARU berarti paket sudah diserahkan ke kurir. Sistem otomatis mencatat SHIPPED dan tanggal kirim, walaupun pilihan status masih PROCESSING. Ini tidak memanggil API kurir. Lanjutkan?" requestId fields={[
    { name: "orderId", label: "Order", type: "hidden", value: orderId },
    { name: "courier", label: "Kurir", required: true, value: initial?.courier || "", maxLength: 100 },
    { name: "service", label: "Layanan", required: true, value: initial?.service || "", maxLength: 100 },
    { name: "cost", label: "Ongkir tercatat (Rp)", type: "number", required: true, value: initial?.cost || 0, min: 0, max: 2147483647, hint: "Tidak mengubah tagihan atau total order." },
    { name: "trackingNumber", label: "Nomor resi", value: initial?.trackingNumber || "", maxLength: 160, hint: "Isi setelah paket PACKED benar-benar diserahkan kepada kurir. Resi baru otomatis mengubah status ke SHIPPED. Resi lama tidak memicu perubahan otomatis." },
    { name: "status", label: "Status pengiriman", type: "select", value: allowed.includes(initial?.status as ShipmentStatus) ? initial!.status : allowed[0], required: true, options: allowed.map(s => ({ value: s, label: s })), hint: "Status efektif menjadi SHIPPED jika nomor resi baru diinput pada pesanan PACKED. Pilih status manual untuk progres berikutnya." },
    { name: "shippedDate", label: "Tanggal kirim", type: "date", value: initial?.shippedDate?.toISOString().slice(0, 10), hint: "Kosongkan untuk mempertahankan tanggal tersimpan." },
    { name: "estimatedDelivery", label: "Estimasi tiba", type: "date", value: initial?.estimatedDelivery?.toISOString().slice(0, 10) },
    { name: "notes", label: "Catatan pengiriman", type: "textarea", value: initial?.notes || "" },
  ]} />;
}
