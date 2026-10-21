# PR #87 — release blocker remediation

Tanggal: 22 Oktober 2026 (Asia/Jakarta). Baseline input `65a7e1ed169528a0bcdebd9c407a548bb2e4cf8a`; main tetap `b2d18192d99db379b6894a51abaaded22cc329e0` saat recovery. PR open/Draft/mergeable, working tree awal clean. Final SHA dan run CI terverifikasi dicantumkan pada PR agar tidak memakai hasil commit lama.

## Yang berubah

- Fixture Storage private kini memeriksa Bearer + apikey dummy dan memblokir public/anonymous reads. PostgreSQL tetap nyata/disposable; bukan Supabase remote.
- Cleanup mengembalikan counter terbatas dan mempertahankan tombstone saat provider delete gagal; regression membuktikan failure/retry/finalized preservation.
- Endpoint cleanup disiapkan default nonaktif, tidak ada jadwal Vercel atau flag Production yang diubah. Bearer, environment dan activation gate diperiksa sebelum query. Partial failure 503, log angka saja. Ini persiapan source, bukan cron yang telah diaktifkan.
- Dua Moderate baru GHSA-qxg6-89mg-rqv8 dan GHSA-xp26-3454-mjgp pada Vitest/@vitest/mocker 4.1.11 diperbaiki lewat **Vitest 4.1.12** pinned; transitive test toolchain patch ikut lockfile. Install --ignore-scripts, tidak ada major Next/React/Prisma/Tailwind upgrade. Audit akhir kembali **0 Critical / 7 High / 0 Moderate**; npm audit tetap nonzero karena High, bukan PASS bersih.
- Tidak ada perubahan editor UI, SKU, checkout, payment, shipping fee, inventory atau migration SQL. SQL V2 tetap SHA-256 `63eefd28491f47b5ed269539d88b52b985f47aac4b620e6600f1607f06414198`.

## Direct infrastructure evidence

### Vercel — BLOCKED

GET project dengan **explicit teamId `team_TzXXNjuky0A7TUqf1vxHDE77`** masih 403, scope syauqi3. Official get_auth_user berhasil dan mengenali akun `mrifatsyauqi21-1024`; list_teams mengembalikan daftar kosong. Jadi koneksi terautentikasi, tetapi tidak membuktikan otorisasi project/team. SAML/ssoEnforced false pada error; tidak menyimpulkan token expired. Tidak dapat membedakan membership yang kurang vs OAuth team grants yang terfilter tanpa operator. Tidak mencoba account/scope lain atau bypass.

Operator perlu memverifikasi koneksi resmi menggunakan akun yang berhak pada Gheverhan di team tersebut dan memberikan akses team/project yang diperlukan. Tool authorize_team_access/authorize_team_sso tidak tersedia pada sesi ini. Tidak meminta token di chat; jika perlu CLI/operator Prisma, gunakan environment secrets resmi.

Project ID terkini, repo binding, Production/Preview env, deployment protection, branch/auto-deployment, active deployment/domain, selected bucket override dan env presence **belum dapat dibaca**, bukan PASS. `get_auth_user` bukan verifikasi deployment. Environment cloud resmi juga tidak memiliki secret/runtime bindings; release:preflight tidak bisa membuktikan DSN efektif. Account username/IDs bukan secret; email/token tidak dicetak.

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
| Production target/role/grants/env/preflight | BLOCKED | Vercel 403 dan operator secrets absent; MCP postgres bukan application identity |
| High risk assessment | PASS untuk dokumentasi/mitigation evidence; acceptance BLOCKED | Tujuh High tetap dilaporkan, matriks per node di HIGH_RISK_REVIEW.md |
| Visual reference acceptance | BLOCKED | Membutuhkan screenshot asli editor |
| CI final | Status aktual pada PR | Seluruh workflow diulang pada HEAD final; tidak mengklaim PASS dari SHA input |
| Owner/reviewer approval dan live change authorization | BLOCKED | Tidak memberikan approval atas nama pemilik |

**Keputusan NO-GO Production.** Tidak ada merge, deployment, migration, perubahan bucket/policy/secrets/cron atau penghapusan data Production.

## Tindakan operator berurutan

1. Pulihkan official Vercel team/project authorization; verifikasi project/repo/domain/deployment, Production/Preview/writers dan env presence melalui kanal aman. Konfigurasikan credential operator Prisma di environment resmi tanpa chat secret.
2. Review prosedur private bucket dan berikan approval spesifik hanya setelah compatibility/default/override terbukti; jangan membuka public RLS policy.
3. Review/accept residual High risk secara eksplisit atau minta migration toolchain terpisah. Source mitigation bukan keputusan pemilik.
4. Lampirkan original editor screenshots untuk visual acceptance.
5. Tetapkan cleanup owner, capacity/cadence/monitoring dan approval aktivasi terpisah. Jadwal yang kapasitasnya tidak cukup bukan PASS.
6. Setelah semua gate dan CI HEAD final PASS, minta approval migration/database-first controlled release/merge/deployment sesuai MIGRATION.md. Task ini tidak mengeksekusi tindakan tersebut.
