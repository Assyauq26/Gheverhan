import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { getJntAreaMappings, getManualJntConfig } from "@/infrastructure/shipping/jnt/jnt-config";
export const dynamic = "force-dynamic";
export default async function ShippingCoveragePage() {
  await requireBackofficeUser(PERMISSIONS.SHIPPING_READ);
  const mappings = getJntAreaMappings(), config = getManualJntConfig();
  const recent = await prisma.orderAddress.findMany({ where: { villageCode: { not: null } }, orderBy: { order: { createdAt: "desc" } }, select: { villageCode: true, village: true, district: true }, distinct: ["villageCode"], take: 100 });
  const missing = recent.filter(r => !mappings.some(m => m.indonesiaCode === r.villageCode));
  return <div className="space-y-6">
    <h1 className="font-display text-2xl font-bold">Kesiapan pengiriman J&T Express</h1>
    <p>Tarif manual: {config ? `${config.rates.filter(r => Date.parse(r.validUntil) > Date.now()).length} aturan aktif yang dikonfigurasi` : "Belum dikonfigurasi; checkout menolak pesanan tanpa tarif valid."}</p>
    <p>Mapping resmi: {mappings.length} wilayah. Adapter resmi menunggu spesifikasi akun dan UAT yang disetujui.</p>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Wilayah pesanan terbaru yang belum ter-mapping</h2>
      <p className="text-sm text-ink-soft">Maksimal 100 wilayah unik. Alamat legacy tanpa kode tetap disimpan dan tidak diberi kode perkiraan. Tarif manual yang disetujui tidak memerlukan kode area API resmi.</p>
      {missing.length ? <ul className="space-y-2">{missing.map(r => <li key={r.villageCode}>{r.villageCode} — {r.village}, {r.district}</li>)}</ul> : <p>Tidak ada wilayah berkode yang belum ter-mapping pada sampel ini.</p>}
    </section>
    <p className="text-sm">Perubahan tarif dan mapping dilakukan oleh operator melalui konfigurasi server yang ditinjau dan dicatat. Gunakan hanya referensi serta konfirmasi resmi J&T untuk mapping.</p>
  </div>;
}
