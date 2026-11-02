# 05 — Hosting, Domain, Trial, Billing SaaS

## 1. Prinsip produk

Setiap seller yang selesai auto-provision memperoleh **storefront + dashboard + trial hosting 30 hari**, tanpa wajib memilih paket sebelum mendaftar. Dashboard seller memiliki menu khusus **Hosting & Domain** untuk memilih paket, membayar/perpanjang, upgrade, dan mengelola alamat website.

Istilah “hosting plan” pada MVP berarti alokasi kuota dan hak fitur dalam **shared JetSeller infrastructure**, bukan sebuah instance VPS/database server terpisah secara fisik untuk setiap seller. Isolasi logis dan database-per-tenant tetap wajib. Penawaran kapasitas/dedicated infra harus sesuai implementasi sebenarnya.

## 2. Model paket dan entitlement

`Plan(id, code, name, monthlyPriceIdr, yearlyPriceIdr, active, version)`, `PlanLimit(key, value, unit)`, `Subscription(id, tenantId, planId, state, startedAt, currentPeriodEnd, cancelAt)`, `Entitlement(tenantId, feature, quota, used, effectiveAt, source)`.

Daftar fitur berbasis konfigurasi Super Admin: jumlah produk aktif, storage media, jumlah staff, order quotas jika sesuai bisnis, domain custom, reporting, backup/restore tier, support level, API capabilities, bandwidth fair-use. **Harga/angka limit dan jenis paket belum ditetapkan owner**: jangan hardcode harga hipotetis di production.

Plan change harus versioned dan tercatat; upgrade prorata atau perpanjangan dihitung deterministic dan diverifikasi PSP. Downgrade tidak menghapus produk/media; ketika melewati quota, hentikan pembuatan item baru sampai usage turun atau paket naik. Usage metering dihitung server-side, secara transaksional atau melalui reserved quota; seller tidak dapat menaikkan plan dari front-end.

## 3. Lifecycle trial/subscription

```text
TENANT_READY -> TRIAL_ACTIVE (30 hari sekali)
TRIAL_ACTIVE -> ACTIVE_PAID (verified invoice payment)
TRIAL_ACTIVE -> TRIAL_EXPIRED (no payment)
ACTIVE_PAID -> PAST_DUE -> GRACE -> SUSPENDED_READ_ONLY
ACTIVE_PAID -> CANCEL_AT_PERIOD_END -> EXPIRED
SUSPENDED_READ_ONLY -> ACTIVE_PAID (verified renewal)
```

Definisi policy saat trial habis perlu persetujuan bisnis, usulan aman: owner masih login ke billing, melihat data serta mengekspor data sesuai policy; storefront dapat dibatasi menjadi katalog/read-only tanpa checkout. Pemberitahuan dikirim sebelum akhir trial dan sebelum suspension. Jangan hapus database/media otomatis saat jatuh tempo. Pencadangan/retensi/erasure diatur eksplisit melalui ToS, kebijakan privasi dan prosedur hukum.

`trialStartedAt` ditetapkan tepat sekali setelah `TENANT_READY`; `trialEndsAt` UTC + 30 hari (24h basis) dan tidak reset saat job retry / change plan / domain. Clock and grace tests gunakan injected frozen time dan boundary UTC/WIB.

## 4. Platform billing, berbeda dari order pelanggan

- Platform membuat invoice beridentitas global, amount/period/tax versioned, dueAt, currency IDR, immutable line items, payment session token/intent dari PSP berizin.
- Billing webhook hanya accepted melalui verifikasi signature, timestamp/event id, replay/idempotency, monetary reconciliation, dan strict invoice/tenant mapping.
- Jangan menandai subscription ACTIVE hanya karena redirect pembayaran atau callback yang belum tervalidasi.
- Upgrade plan dalam transaksi bersama invoice + entitlement state via durable outbox; retry tidak menggandakan invoice/masa langganan.
- Support refunds/chargeback/cancellation dengan audit; ledger dana billing SaaS **terpisah** dari uang customer ecommerce toko dan J&T shipping reconciliation.
- Pilihan PSP (Midtrans/Tripay/manual approved transfer) masih keputusan implementasi; integrasi live memerlukan kontrak, credentials, onboarding, webhooks sandbox, legal/pajak dan owner approval.
- Jangan memproses data kartu pembayaran langsung di server JetSeller.

## 5. Domain routing dan provisioning

**Default:** subdomain otomatis seperti `<slug>.gheverhan.store` hanya bila wildcard DNS/TLS dan izin domain memang tersedia; domain platform final untuk SaaS perlu ADR. `gheverhan.store` tetap demo dan tidak otomatis berubah. `jetseller.web.id` tetap landing marketing.

**Custom domain — connect existing:**
1. Seller mengisi domain dan menerima token verifikasi terikat tenant + expiry.
2. Platform meminta DNS TXT verification; setelah terbukti, minta target CNAME/A (sesuai provider/tiering) untuk routing.
3. Backend memvalidasi canonical domain, DNS rebinding/ownership, uniqueness, apex/wildcard, public suffix, disallow JetSeller-reserved/unsafe names.
4. TLS/ACME dikelola proxy/platform; sebelum sertifikat ready domain tetap `PENDING_VERIFICATION`/`PENDING_TLS`.
5. Hanya host ACTIVE dipetakan ke tenant; migrasi canonical host dibuat atomic dan diaudit; remove domain menuntut cek ownership dan pembatalan routing.
6. Renewal/revalidation dan change of DNS owner harus ditangani agar domain takeover tidak terjadi.

**Buy domain from dashboard:** fitur saat registrar/reseller API resmi, pricing, legal, WHOIS/privacy, availability, domain registry ownership, DNS management, transfer/renew/refund telah disetujui. Fase awal boleh menawarkan `connect domain` saja; jangan menampilkan tombol “beli otomatis” yang tidak bekerja.

## 6. Storage, resource dan operasional

Quota per tenant di enforced server untuk uploaded assets, products, media, DB growth dan request limits. High-cardinality metrics dibatasi, telemetry tanpa PII. Dokumen deployment VPS: kapasitas disk/RAM, database backups, per-tenant pool sizing, TLS cert throughput, DNS provider limits, object storage dan biaya per tenant. Dashboard usage memakai tanggal meter, tidak hanya jumlah client-side.

## 7. Acceptance tests billing/domain

- Seller trial aktif tanpa payment method; trial tidak reset oleh concurrent provisioning/job retry.
- Seller B tak dapat melihat invoice, usage, credential atau domain Seller A.
- Webhook duplicate/out-of-order/invalid signature tidak memberikan entitlement palsu.
- Invoice payment FAILED tidak mengubah plan; refund merekonsiliasi entitlement sesuai policy.
- Expiry/grace memblokir checkout bila disepakati tetapi tetap memberi akses owner sesuai policy.
- Satu domain tidak bisa dimiliki dua tenant; Host spoof dan DNS challenge replay ditolak.
- DNS/TLS pending memperlihatkan status sebenarnya; domain takeover dan SSL mismatch tidak diarahkan ke tenant lain.
- Downgrade kuota tidak menghapus produk/media atau history; perhitungan usage aman di bawah concurrency.
