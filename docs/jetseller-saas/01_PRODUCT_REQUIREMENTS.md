# 01 — PRD JetSeller SaaS

> **Prioritas 2026-11-02:** First vertical slice adalah pendaftaran seller OTP yang secara otomatis menghasilkan storefront + dashboard seller pada tenant/database terisolasi. Lihat [09](09_MVP_SELLER_SIGNUP_AUTO_STORE.md). J&T resmi dikelola **per seller**, bukan kredensial Super Admin global. Billing/custom domain/J&T diposisikan setelah alur signup→toko terbukti.

## 1. Visi, masalah dan definisi pengguna

JetSeller adalah platform SaaS pembuat toko online untuk seller independen/UMKM: membuat toko secara otomatis, tanpa harus memahami deployment web, lalu mengelola website dan bisnis dari dashboard seller. Produk platform berbeda dari toko demo yang saat ini ada di `gheverhan.store`.

| Persona | Akses | Tujuan |
| --- | --- | --- |
| Visitor | Landing `jetseller.web.id` | Pelajari produk, daftar seller |
| Seller owner | Dashboard tenantnya sendiri | Kelola toko, paket hosting & domain, gudang, katalog, pesanan, pembayaran, pengiriman |
| Seller staff | Dashboard tenant terbatas | Hanya izin yang diberikan owner, **tidak** mengelola billing/domain rahasia secara default |
| Customer | Storefront tenant | Browse, cart, akun customer, checkout dan status pesanan |
| JetSeller Super Admin | Control plane internal | Mengelola tenant, provisioning, plan catalog, billing, domains, integrasi platform dan health metadata J&T non-rahasia (tanpa mengelola kredensial seller), observability, abuse |
| Operator/support | Control plane izin terbatas | Diagnostik tanpa bebas melihat PII/secret milik seller |

**Hard requirement:** pendaftaran seller lewat form publik JetSeller; **login dashboard JetSeller hanya Super Admin**. Seller otomatis mendapat tenant dan dashboard seller, bukan akses ke dashboard JetSeller.

## 2. MVP dan non-goals

**MVP terdekat (wajib selesai lebih dulu):** signup seller+OTP, provisioning database tenant terisolasi, owner role, subdomain terverifikasi, storefront awal (empty/catalog safe), dashboard seller nyata, onboarding toko minimal dan trial 30 hari tercatat sekali, keamanan dan regresi 2 tenant. **Fase lanjutan:** produk/varian/media, checkout, hosting plan berbayar, custom domain, serta J&T seller-managed. Spesifikasi acceptance detail: [09](09_MVP_SELLER_SIGNUP_AUTO_STORE.md).

Bukan MVP: marketplace agregator multi-seller dalam satu checkout; aplikasi native; satu deployment Next.js baru per seller; reselling domain tanpa kontrak registrar; payment gateway live tanpa perjanjian; live J&T untuk setiap seller tanpa kontrak; custom fulfillment carrier selain yang disetujui; auto-provision semua seller ke VPS terdedikasi; repo rename atau menjadikan GitHub Private.

## 3. Success metrics dan target mutu

- Seller signup hingga `TENANT_READY`: 95%+ sukses pada uji stress terkontrol; SLA produk final disetujui setelah mengukur infra, **bukan angka yang diklaim sudah tercapai**.
- 100% request tenant data ditautkan tenant yang valid; 0 kebocoran silang tenant pada negative test.
- OTP kedaluwarsa, rate-limit, replay rejection, single owner provisioning dan zero duplicated tenant pada concurrent signup.
- Pengguna dapat membuat produk dan preview storefront segera setelah provisioning, walaupun shipping/payment masih belum aktif.
- Billing dan trial tidak menghentikan login/pengambilan data tanpa prosedur grace/read-only/export yang terdokumentasi.
- Zero external J&T production calls dan zero production data mutation dalam CI.
- Accessibility WCAG 2.2 AA sejauh praktis: keyboard, input label, state, feedback, kontras; responsive 360–1440 px.
- Error budget dan SLO dinilai dalam staging; jangan menuliskan angka produksi tanpa pengukuran.

## 4. Business journey

1. Visitor membuka landing, klik Daftar Seller.
2. Isi nama owner, email, HP, password dan nama brand/slug sementara → menerima OTP melalui provider yang diizinkan.
3. Setelah OTP benar: buat akun platform seller, onboarding record + provisioning job atomik dan idempotent.
4. Sistem memprovision database tenant, menjalankan migrasi dan seed template aman, membuat owner role, domain sementara serta status `TENANT_READY`. Kegagalan → retry aman, status transparan, tanpa akun ganda.
5. Seller masuk dashboard tenant; toko awal tampil dalam mode belum menerima order jika alamat/pembayaran/pengiriman belum lengkap. Wizard mengatur brand, logo/tema, alamat gudang, produk, pembayaran, opsi pengiriman.
6. Seller mengakses menu **Hosting & Domain**, melihat trial 30 hari, memilih upgrade atau menghubungkan custom domain. Trial dimulai pada `activatedAt` yang pertama kali tenant siap, bukan saat mulai ketik form.
7. Storefront aktif untuk customer hanya setelah gate pengoperasian pembayaran/pengiriman terpenuhi. Customer memiliki akun per toko, bukan otomatis akun global JetSeller.
8. Customer checkout → payment authoritative → seller packing → AWB J&T jika diotorisasi dan valid → tracking → completed.

## 5. Business rules eksplisit

- Satu seller owner memiliki satu toko untuk MVP; dukungan multi-store owner **di luar scope**. Email global seller unik di control plane; customer email hanya unik dalam DB tenant masing-masing.
- Slug casefold, Unicode canonicalization, banned names, reserved platform words, collision/reuse protection; jangan percaya Host header mentah.
- Data dan user tenant isolated; JWT session dipisahkan scope platform vs tenant dan customer (cookie, issuer/audience, security boundaries). Pertahankan kompatibilitas cookie/sesi demo di fase awal.
- Domain seller bisa berasal dari subdomain platform atau custom domain yang telah dibuktikan kepemilikannya.
- Harga paket, kuota dan masa grace: diatur Super Admin sebagai katalog, perlu persetujuan bisnis. Tidak mengarang harga maupun kapasitas.
- “Hosting” adalah entitlement/resource tier di infrastruktur bersama kecuali ada paket dedicated yang memang dibangun; jangan klaim setiap paket = VPS baru.
- Transaksi commerce toko, billing platform, dan tagihan kurir dibedakan ledger, invoice, dan rekonsiliasinya.
- Untuk integrasi J&T, **setiap seller/tenant memasukkan dan mengelola akun API resmi J&T miliknya sendiri melalui dashboard seller** setelah toko dibuat. Tidak ada model kredensial operasional J&T global JetSeller untuk semua tenant. Output tarif bukan bukti dukungan Create Order; pada kontrak publik versi baseline, hanya EZ yang dapat disimpulkan dari implementasi yang ada.

## 6. Acceptance criteria tingkat produk

AC-P01: Seller signup tidak menghasilkan customer User pada demo.
AC-P02: OTP valid menghasilkan satu seller platform; OTP invalid/expired tidak membuat tenant.
AC-P03: Pada duplicate submit/queue replay, tepat satu tenant dan satu owner di tenant.
AC-P04: Setiap tenant memiliki dashboard dan storefront subdomain sendiri, data dummy awal tidak terkontaminasi demo atau tenant lain.
AC-P05: Seller dapat mengakses Hosting & Domain di dashboard tanpa memerlukan kartu pembayaran saat trial awal.
AC-P06: Staff, customer dan tenant lain mendapat 403/404 pada Super Admin dan entitlement seller owner.
AC-P07: Domain custom tidak aktif sampai challenge kepemilikan + TLS lulus, dan rollback tetap mungkin.
AC-P08: J&T order tidak bisa dikirim jika belum ada persetujuan kontrak, route mapping, berat, tarif dan payment state valid.
AC-P09: Trial/expired dan billing reconciliation bekerja tanpa penghapusan mendadak data.
AC-P10: Demo `gheverhan.store` dan landing `jetseller.web.id` lolos regresi setelah setiap tahap.

## 7. Dependensi/persetujuan belum final

- Host final control-plane/dashboard seller dan domain root subdomain platform (saat ini usulan `<slug>.gheverhan.store`; evaluasi migrasi ke domain JetSeller).
- Registrar/domain reseller, jenis pembayaran billing SaaS, harga plan, pajak, dispute/refund, persyaratan akun/API resmi J&T **per seller**, jenis database-per-tenant dan backup/storage budget. **Model credential tenant-managed/BYOK sudah diputuskan; tidak perlu ADR memilih shared platform credential.**
- Super Admin harus menyetujui desain kontrol, UX dan harga sebelum go-live. Detail tersebut **OPEN DECISION**, bukan scope yang diam-diam dianggap selesai.
