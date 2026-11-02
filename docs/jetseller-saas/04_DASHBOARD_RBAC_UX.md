# 04 — UI/UX, Routing, Roles and Dashboards

## 1. Empat permukaan berbeda

| Surface | Host (usulan/eksisting) | Role |
| --- | --- | --- |
| JetSeller marketing + seller signup | `jetseller.web.id` | Public / seller onboarding |
| JetSeller Super Admin | `dashboard.jetseller.web.id` (proposed) | Platform Super Admin only |
| Seller storefront | `<slug>.<platform-domain>`, custom domain | Public customer |
| Seller dashboard | `<slug>.<platform-domain>/admin`, custom domain `/admin` jika aman | Tenant seller owner/staff |
| Legacy demo | `gheverhan.store`, `gheverhan.store/admin` | Existing customer/admin as compatibility tenant |

Control-plane dashboard tidak memakai tenant admin route atau claim admin umum. Context akun harus selalu menampilkan nama toko/tenant untuk mencegah kesalahan saat operator melakukan tindakan.

## 2. Seller dashboard information architecture

- **Beranda:** ringkasan order/GMV yang benar, checklist setup (alamat gudang, produk, payment, J&T), alert stok, status domain, trial.
- **Produk:** catalog, variasi, SKU, harga, sale, stok, images, size chart, CSV bulk di fase terpisah.
- **Pesanan:** create/manage shipment, refund sesuai policy, status payment, print packing/label hanya jika diizinkan.
- **Pengiriman:** gudang, pemetaan rute, konfigurasi akun J&T jika model BYOK disetujui, tarif resmi, pickup/dropoff, create/cancel AWB, status/tracking, discrepancy.
- **Marketing:** voucher, flash sale dari modul existing (per-tenant), anti cross-store promos.
- **Dekorasi:** Appearance tokens, hero, asset, preview, save draft/publish, version guards/rollback per tenant.
- **Pelanggan:** per-store customers, masks for PII, controlled exports.
- **Analitik:** sales/order/cancel/refund per tenant; no cross-tenant totals.
- **Hosting & Domain:** trial countdown, paket/limit/usage, invoices, payment subscription, upgrade/renewal, connect/buy domain, TLS/DNS status, usage warnings.
- **Pengaturan:** profil toko, owner/staff/roles, notification, payment methods, legal, audit.
- **Bantuan:** status platform, tiket, dokumentasi, consent.

Mobile-first (360/390/428 px), desktop (1024/1440), clean white/red JetSeller accents, no heavy borders, rounded cards, sticky action only where necessary. Navigation seller desktop sidebar; mobile bottom navigation for top 4–5 sections + overflow 'Lainnya'. Contrast, keyboard, screen reader, loading, empty, error, success states mandatory. Hindari memalsukan metrik transaksi, jumlah pengguna atau ongkir.

## 3. Super Admin platform dashboard

Menu: overview SaaS (tenants activated, provisioning failures, plan metrics), seller directory/status, provisioning queue, plans/quotas/trial, subscriptions/invoices/refunds, DNS/domains/SSL health, tenant DB versions/backups/storage, external J&T credential contract config (strict operator-only), delivery incidents, security/audit, customer support, platform settings/feature flags/release health.

**Tidak** boleh secara default membaca isi pesanan, password, OTP, alamat pelanggan dan secret milik toko. Impersonation/support harus opt-in/approved, time-bound, fully audited, dengan banner, scoped read-only dan alasan akses. Tidak boleh memungkinkan perubahan tenant via query id tanpa policy check.

## 4. Role matrix minimum

| Aksi | Super Admin | Seller Owner | Seller Staff | Customer |
| --- | --- | --- | --- | --- |
| Platform plans & tenant provisioning | Yes | No | No | No |
| Platform J&T master secrets | Yes (step-up) | No | No | No |
| Seller Hosting & Domain, invoices | Platform audit | Yes | No by default | No |
| Store products, order fulfillment | Scoped breakglass only | Yes | By permission | No |
| Seller users & role management | Scoped breakglass only | Yes | No by default | No |
| Store Appearance publish | Scoped breakglass only | Yes | By explicit permission | No |
| Customer cart/checkout | No | No | No | Own store only |

All user/admin endpoints must enforce server RBAC/tenant DB context. Front-end hiding is not authorization. Audit `frontend/src/lib/auth/permissions.ts` and `frontend/src/app/admin/**`; legacy Super Admin behavior must not grant global SaaS superadmin by name collision.

## 5. Screens and QA scenarios

1. JetSeller landing CTA→signup, OTP six-box/resend/expiry, seller cannot route to platform dashboard.
2. Provisioning progress and graceful error/retry view.
3. Seller first login wizard + active trial status + preview storefront.
4. Hosting menu plan comparison, upgrade path, invoice, unpaid/pending/grace, domain attach flow.
5. Storefront header/footer/hero, product card, PDP, variations, cart checkout, mobile sticky CTA.
6. Seller product/editor/Appearance, orders/J&T actions/packing.
7. Super Admin seller list, provisioning audit and tenant details (no secret exposed).
8. Auth negatives: staff→billing denied, seller→platform denied, customer→admin denied; same user on two tenant hostnames not automatically authorized.

## 6. Observability & accessibility

Tenant-scoped trace id and route, error codes (no PII), state transition audit, latency budgets and screenshot evidence. Use skeletons and clear empty states; zero misleading 'live' badges without real readiness. Verify Indonesian copy, Rp locale, WIB time display where applicable, and error labels that do not reveal account existence.
