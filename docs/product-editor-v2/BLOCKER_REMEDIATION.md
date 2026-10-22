# PR #87 — release blocker remediation

Tanggal: 22 Oktober 2026 (Asia/Jakarta). Baseline input `65a7e1ed169528a0bcdebd9c407a548bb2e4cf8a`; main tetap `b2d18192d99db379b6894a51abaaded22cc329e0` saat recovery. PR open/Draft/mergeable, working tree awal clean. Final SHA dan run CI terverifikasi dicantumkan pada PR agar tidak memakai hasil commit lama.

## Yang berubah

- Fixture Storage private kini memeriksa Bearer + apikey dummy dan memblokir public/anonymous reads. PostgreSQL tetap nyata/disposable; bukan Supabase remote.
- Cleanup mengembalikan counter terbatas dan mempertahankan tombstone saat provider delete gagal; regression membuktikan failure/retry/finalized preservation.
- Endpoint cleanup disiapkan default nonaktif, tidak ada jadwal Vercel atau flag Production yang diubah. Bearer, environment dan activation gate diperiksa sebelum query. Partial failure 503, log angka saja. Ini persiapan source, bukan cron yang telah diaktifkan.
- Dua Moderate baru GHSA-qxg6-89mg-rqv8 dan GHSA-xp26-3454-mjgp pada Vitest/@vitest/mocker 4.1.11 diperbaiki lewat **Vitest 4.1.12** pinned; transitive test toolchain patch ikut lockfile. Install --ignore-scripts, tidak ada major Next/React/Prisma/Tailwind upgrade. Audit akhir kembali **0 Critical / 7 High / 0 Moderate**; npm audit tetap nonzero karena High, bukan PASS bersih.
- Tidak ada perubahan editor UI, SKU, checkout, payment, shipping fee, inventory atau migration SQL. SQL V2 tetap SHA-256 `63eefd28491f47b5ed269539d88b52b985f47aac4b620e6600f1607f06414198`.

## Direct infrastructure evidence

### Vercel — akses CLI PASS; integrasi MCP BLOCKED

Update read-only 22 Oktober 2026: Vercel CLI 65.0.0 login sebagai `mrifatsyauqi21-1024`, team `syauqi3` dan project `gheverhan` berhasil diakses. Project ID `prj_J8Fao07yrACLGjiDtY3ftRcLkI2s`, repo `Assyauq26/Gheverhan`, Production branch `main`, root `frontend`, Node `22.x`, framework Next.js. Domain `gheverhan.store` terverifikasi pada deployment READY `dpl_621bV44pjJVzHJ5NuCQNTFU4JEb1`, source `b2d18192d99db379b6894a51abaaded22cc329e0`; bukan source PR #87. Function output yang terlihat memakai `sin1`; region Sandbox `iad1` bukan region runtime function.

Metadata Production mencantumkan DATABASE_URL, DIRECT_URL, JWT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PRODUCT_IMAGES_BUCKET, SUPABASE_PAYMENT_PROOFS_BUCKET, STORAGE_APP_NAME, CRON_SECRET, RESEND_API_KEY, PASSWORD_RESET_FROM dan PASSWORD_RESET_BASE_URL. MAINTENANCE_MODE tercantum 0. PRODUCT_MEDIA_CLEANUP_ENABLED tidak tercantum pada daftar Production yang dibaca. Nilai secret tidak dibaca/pull. Presence pada project saat ini tidak membuktikan nilai, pengiriman email, bucket efektif, atau snapshot environment deployment yang sudah dibangun.

Preview mencantumkan JWT_SECRET dan GHEVERHAN_SHARED_DEV_DATABASE=true. Tidak terlihat DATABASE_URL/DIRECT_URL pada daftar Preview saat ini; ini tidak membuktikan deployment lama kehilangan akses atau seluruh writer terisolasi. Verifikasi snapshot lama dan kontrol writer tetap diperlukan.

MCP Codex memakai global shared endpoint `https://mcp.vercel.com`, streamable HTTP, tetapi Not logged in: callback localhost container remote tidak diterima. Percobaan OAuth berulang dihentikan. Konektor ChatGPT terpisah sebelumnya 403/teams kosong; itu bukan kegagalan akun/operator CLI. MCP integration tetap BLOCKED terpisah dan **bukan syarat wajib akses Vercel** selama jalur CLI berwenang tersedia.

Effective DSN, role/grants aplikasi, selected bucket, deployment protection dan kontrol writer/auto-deployment belum dibuktikan. Tidak ada env pull, linking, perubahan secret atau deployment. Perintah dan target preflight di OPERATOR_READ_ONLY_PREFLIGHT.md.

### Database — read-only PASS sebagian; activation BLOCKED

Koneksi Supabase resmi ke `bztprltkevacidcpjaam`, database postgres, server17.6, inspection role postgres: sepuluh migration completed dan checksum historis cocok; tepat satu pending dibanding source, migration V2. Tidak ada failed ledger atau long transaction/waiting lock pada snapshot. Tabel staged/save receipt belum ada; metadata shipping V2 belum diterapkan. Tidak ada DDL atau ledger write.

Product/ProductImage/ProductOptionValue owner postgres, RLS enabled. Inspection role mempunyai CRUD; ini **bukan** bukti effective application role/grants, yang masih BLOCKED sampai DSN Vercel diverifikasi. RLS/grants dua tabel V2 dibuktikan di disposable dan oleh source preflight, bukan diasumsikan tersedia di Production. Private bucket target default masih public; metadata/routing lengkap di STORAGE_PRIVACY_AND_CLEANUP_RUNBOOK.md.

Preview guard di source masih memiliki opt-in `GHEVERHAN_SHARED_DEV_DATABASE=true` untuk project dummy yang sebelumnya disetujui; tidak menganggap Preview terisolasi berdasarkan source. Effective env dan writer lama perlu dibaca/dikendalikan operator. Cleanup cron baru menolak VERCEL_ENV=preview meskipun flag aktif.

## Visual acceptance — BLOCKED

Original screenshot editor pengguna belum ada pada workspace/lampiran aktif. Yang diperlukan: screenshot **Tambah/Edit Produk dan Variasi terbaru** yang menampilkan variasi/foto opsi, bulk, SKU, pengiriman dan Save, desktop/mobile bila keduanya menjadi referensi. Screenshot auth lama bukan referensi editor. Jangan mengganti dengan before/after atau skor 90%.

Source UI tidak diubah pada remediation ini. Browser CI final mengulang enam viewport 360/390/430/768/1024/1360 dan menghasilkan screenshot aktual; existing visual QA tetap bukti responsive/interaction, bukan sign-off desain asli.

## Gate akhir

| Gate | Status | Bukti/tindakan |
| --- | --- | --- |
| Source storage routing dan session/ownership | PASS pada isolated regression | Server-only credentials, private-auth fixture, cross-actor/session dan proxy history tests |
| Private Storage remote dan compatibility cutover | BLOCKED | Default bucket public; override/effective Vercel config belum dibaca; real flip/probes perlu approval |
| Cleanup TTL/cancel/tombstone/late PUT/retry/finalized safety | PASS pada disposable | Private fixture + bounded counters + preserved metadata on failure |
| Cleanup schedule/monitoring/plan quota/live execution | BLOCKED | Dormant endpoint dan runbook disiapkan, tidak ada jadwal/env/invocation Production |
| Migration SQL dan historical checksum | PASS review/disposable | Additive/nullable, checksum tidak berubah; official Prisma drills |
| Production target/role/grants/env/preflight | BLOCKED | CLI PASS; effective target DSN/role dan operator secrets belum tersedia; inspection postgres bukan application identity |
| High risk assessment | PASS untuk dokumentasi/mitigation evidence; acceptance BLOCKED | Tujuh High tetap dilaporkan, matriks per node di HIGH_RISK_REVIEW.md |
| Visual reference acceptance | BLOCKED | Membutuhkan screenshot asli editor |
| CI final | Status aktual pada PR | Seluruh workflow diulang pada HEAD final; tidak mengklaim PASS dari SHA input |
| Owner/reviewer approval dan live change authorization | BLOCKED | Tidak memberikan approval atas nama pemilik |

**Keputusan NO-GO Production.** Tidak ada merge, deployment, migration, perubahan bucket/policy/secrets/cron atau penghapusan data Production.

## Tindakan operator berurutan

1. Gunakan official Vercel CLI yang sudah terverifikasi; lanjutkan verifikasi effective Production/Preview/writers dan target environment melalui kanal aman. Konfigurasikan credential operator Prisma di environment resmi tanpa chat secret.
2. Review prosedur private bucket dan berikan approval spesifik hanya setelah compatibility/default/override terbukti; jangan membuka public RLS policy.
3. Review/accept residual High risk secara eksplisit atau minta migration toolchain terpisah. Source mitigation bukan keputusan pemilik.
4. Lampirkan original editor screenshots untuk visual acceptance.
5. Tetapkan cleanup owner, capacity/cadence/monitoring dan approval aktivasi terpisah. Jadwal yang kapasitasnya tidak cukup bukan PASS.
6. Setelah semua gate dan CI HEAD final PASS, minta approval migration/database-first controlled release/merge/deployment sesuai MIGRATION.md. Task ini tidak mengeksekusi tindakan tersebut.
