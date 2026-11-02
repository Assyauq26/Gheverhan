# JetSeller SaaS — Master Development Plan

**Status:** PLANNING / docs only. **Tanggal:** 2026-11-02. **Baseline diaudit:** `Assyauq26/Gheverhan` pada `main` commit `fdf8d18ba90450fa1fe3d9c9392f1fc0eeefd96a`. Semua kode dan konfigurasi wajib diaudit ulang pada HEAD saat implementasi.

## Kontrak produk yang sudah diputuskan

1. `jetseller.web.id` adalah landing dan form pendaftaran publik **seller platform**. Hanya tim JetSeller/Super Admin yang boleh mengakses **dashboard platform**, rencana host `dashboard.jetseller.web.id` (host final perlu verifikasi DNS).
2. Seller bukan Super Admin JetSeller. Setelah OTP seller diverifikasi, sistem **otomatis membuat tenant**, identitas owner, **storefront** dan **dashboard seller** dari satu aplikasi/kode terpusat.
3. Dashboard seller mempunyai menu Hosting & Domain: trial hosting 30 hari, upgrade/perpanjangan paket, subdomain platform, sambungkan/beli domain sendiri. Pemilihan paket **setelah** tenant dibuat; tidak menjadi penghalang signup. Pembelian domain pihak ketiga tidak boleh diklaim otomatis sebelum registrar dan pembayaran terintegrasi.
4. Setiap seller memiliki data/pengguna/konfigurasi sendiri dan target **database PostgreSQL tenant terpisah**. Sistem manajemen (control plane) terpisah dari database seller; satu sumber kode Next.js memperbarui seluruh tenant melalui rilis terkoordinasi.
5. Dashboard seller mencakup produk, stok, pesanan, pengaturan pembayaran, Appearance, gudang, promosi dan operasi pengiriman resmi J&T Express, sesuai hak akses.
6. Akses J&T hanya melalui perjanjian dan API resmi. Jangan menggunakan QR Fast Order privat, endpoint tidak didokumentasikan atau bypass CAPTCHA/ticket.

## Urutan baca Codex

1. [01 — PRD, scope, target & acceptance](01_PRODUCT_REQUIREMENTS.md)
2. [02 — Arsitektur multi-tenant dan ADR](02_ARCHITECTURE_TENANCY.md)
3. [03 — Registrasi, OTP, provisioning & state machine](03_REGISTRATION_PROVISIONING.md)
4. [04 — Dashboard, domain routing dan RBAC](04_DASHBOARD_RBAC_UX.md)
5. [05 — Hosting, trial, billing dan domain](05_HOSTING_BILLING_DOMAINS.md)
6. [06 — J&T API resmi, order dan tracking](06_JNT_OFFICIAL_INTEGRATION.md)
7. [07 — Data contract, API, security & QA](07_DATA_API_SECURITY_TESTS.md)
8. [08 — Sprint backlog, gates, rollback dan risiko](08_ROADMAP_RELEASE.md)
9. [CODEX_IMPLEMENTATION_PROMPT — prompt siap salin](CODEX_IMPLEMENTATION_PROMPT.md)

**Prioritas bila ada konflik:** keamanan/izin produksi dan kontrak eksternal > kode aktual pada HEAD > keputusan produk dalam dokumen ini > catatan repo historis. Jangan mengasumsikan rencana = fitur yang sudah ada.

## Baseline nyata yang diperiksa (bukan janji fitur SaaS)

- `frontend/package.json`: Next.js 15.5.28, React 18.3.1, Prisma 5.22.0, PostgreSQL; Node 22; lint/typecheck/build, unit, containment, isolated PostgreSQL + Chromium.
- `frontend/prisma/schema.prisma`: akun `User`, `PendingRegistration`, katalog, order, pembayaran dan `StoreAppearance`; belum terbukti ada control-plane Tenant, Subscription, DomainOwnership atau database-per-tenant yang berfungsi.
- `frontend/src/lib/prisma.ts`: satu PrismaClient dari `DATABASE_URL`/TLS guard, **belum** resolver tenant atau pool dinamis.
- `frontend/src/modules/auth/registration-otp.ts`: normalisasi nomor HP dan OTP untuk registrasi pelanggan **toko demo**. Jangan menyatukan signup customer dengan signup seller.
- `frontend/src/modules/appearance/service.ts`: draft vs published, version guard, audit dan rollback; migrasi harus menjaga perilaku versi.
- `frontend/src/infrastructure/shipping/jnt/jnt-provider.ts`, `frontend/src/modules/shipping/jnt-fulfillment.service.ts`: implementasi tarif/order resmi dengan gate lingkungan; pada baseline, checkout Create Order hanya EZ yang dibuktikan oleh kontrak publik. Dokumen historis `docs/jnt-official/IMPLEMENTATION.md` berisi caveat yang harus dicek ulang.
- `docs/rebranding-jetseller/reports/04-production-handoff.md`: release/Appearance demo terpisah; jangan secara implisit publish tema saat membuat SaaS.
- Domain demo `gheverhan.store` harus tetap berfungsi sepanjang transisi, termasuk customer auth, cart, payment, email, fulfillment dan cache. Landing `jetseller.web.id` tidak boleh diganggu.

## Aturan kerja dan status

- Semua sprint dalam branch/PR kecil, **tanpa merge otomatis**; perubahan repo produksi, database produksi, DNS, host, secret, kontrak API, J&T live call, pembayaran nyata, Appearance publish, repo rename/private perlu izin tertulis terpisah.
- Semua eksperimen menggunakan sandbox/disposable PostgreSQL, data dummy, email sink dan J&T mock/approved sandbox. Jangan membuat kredensial palsu atau mengira status CI success = production live.
- Setiap PR wajib tabel **existing / changed / tested / deferred**, SHA, migration plan, regression evidence, security/tenant isolation, rollback dan unresolved blockers.
- Tujuan dokumen ini: panduan implementasi, **tidak berwenang** menjalankan tugas produksi.
