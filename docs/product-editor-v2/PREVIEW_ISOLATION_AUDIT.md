# Preview isolation audit

Review source 9e3d87f, 22 Oktober 2026. **BLOCKED untuk bukti isolasi Production.**

Preview metadata sekarang mencantumkan GHEVERHAN_SHARED_DEV_DATABASE=true dan JWT_SECRET; DATABASE_URL/DIRECT_URL tidak tercantum. Ini bukan bukti semua deployment Preview lama kehilangan credential. Konfigurasi saat ini tidak mengubah snapshot deployment lama.

src/lib/prisma.ts memanggil assertPreviewDatabaseIsolation sebelum membuat client. preview-db-guard.ts menolak DSN missing/malformed/unapproved dan membutuhkan opt-in literal true serta dua DSN project dummy yang disetujui. Namun guard secara sengaja mengizinkan project bztprltkevacidcpjaam saat opt-in dan DSN cocok; **bukan database terpisah**. Komentar prisma lama tentang distinct preview project tidak mencerminkan kontrak guard aktual. Unit preview-db-guard.test.ts membuktikan allow shared dummy, deny invalid target/missing flag/DSN, bukan zero-writer isolation.

scripts/assert-safe-db-operation.mjs menolak migration/seed/bootstrap via npm scripts pada Preview. Itu tidak memblokir runtime mutation atau arbitrary Prisma CLI. Cron cleanup khusus menolak VERCEL_ENV preview sebelum DB query; cron expire-orders dan writer lain tetap perlu verifikasi deployment/session/secret/network masing-masing. Realm auth/JWT Preview terpisah tidak sama dengan database isolation.

## Tindakan operator, belum dijalankan

1. Inventaris seluruh deployment Preview/legacy, protection, writer, snapshot effective env dan webhook/cron, bukan hanya halaman pertama deployment list.
2. Review penonaktifan shared DB opt-in pada Preview dan seluruh secret/binding DB bersama melalui approval konfigurasi tersendiri. Jangan menyalin JWT/key Production ke Preview.
3. Pastikan deployment lama yang masih mempunyai credential/writer tidak bisa dipanggil, sesuai mekanisme resmi provider dan approval. Menghapus env project saat ini saja tidak mencabut akses deployment lama.
4. Buktikan request mutation Preview yang berizin dummy ditolak sebelum DB target; gunakan lingkungan disposable dahulu. Tidak menguji mutation Production pada task ini.

Tidak membuat staging/project baru. Tidak mengubah perilaku dummy shared yang pernah disetujui secara diam-diam. Bila owner memilih larangan shared mutlak, perubahan guard perlu review/regression dan kontrol deployment lama; perubahan source baru saja tidak mencabut credential lama.


## Audit inventory dan kemampuan writer — snapshot runtime preflight

Pembacaan API resmi CLI dengan explicit project ID/scope, filter Preview dan pagination selesai menginventaris 207 deployment; 142 READY dan 65 status lain. Target metadata null/non-Production; current Production dpl_621bV44pjJVzHJ5NuCQNTFU4JEb1 tidak termasuk hasil. Ini **inventaris historis**, bukan 142 writer Production yang terbukti.

| Kategori | Bukti |
| --- | --- |
| Historical READY | 142 metadata entries |
| URL yang benar-benar menerima traffic sekarang | Belum diuji per URL; READY bukan HTTP reachability/protection proof |
| Authorized application traffic | Belum terbukti; platform protection/auth harus diperiksa terpisah |
| Effective deployed env snapshot | Belum tersedia; current project env list tidak cukup |
| DB connection capability | Belum terbukti sebagai role Preview |
| DB write capability | Belum terbukti; gunakan individual privileges + RLS metadata, bukan mutation probe |

Jangan menyimpulkan tidak ada writer dari absent current DATABASE_URL, atau menyimpulkan semua 142 dapat menulis dari flag shared. Operator perlu menghubungkan setiap deployment yang masih bisa dilayani dengan snapshot/binding dan role resminya. Tidak mengakses customer rows, tidak bypass protection, tidak menggunakan credential Production untuk meniru role Preview. Paket approval isolasi: hapus shared opt-in **Preview only**, review DB/storage/JWT bindings, kendalikan semua legacy writers lewat fitur resmi provider, buktikan fail-closed tanpa write probe. Source guard baru saja tidak mencabut deployment lama. Tidak menghapus deployment/credential atau mengubah env pada task ini.

## Preview source fail-closed hardening — 23 Oktober 2026, PR #87

New candidate source refuses shared Production/Preview database access even if legacy GHEVERHAN_SHARED_DEV_DATABASE=true is configured. This changes only PR #87; Production and local execution remain unchanged.

For any new Vercel Preview to connect, operator must provide a genuine separate Supabase project and explicitly set GHEVERHAN_PREVIEW_SUPABASE_REF (20 lowercase alphanumeric characters, not Production project ref), with both DATABASE_URL and DIRECT_URL targeted to that new project. Strict sslmode=require, sslaccept=strict, and pgbouncer=true on transaction pooler port 6543 are required, without host override or duplicate flags. No project is provisioned by this patch and no new secrets are written.

Absent a separate Preview project, new Preview Prisma initialization fails closed by design; Preview editor pages may not function. The real Prisma import regression and invalid DSN tests enforce the behavior.

LIMITATION: This does not change immutable historical Preview deployments, existing credential bindings, Vercel Authentication/protection, direct DB clients, cron/webhooks or URLs. The 207 historical deployments remain UNKNOWN until Vercel-side authorized operator controls are evidenced. Do not call Preview isolation PASS solely from source tests. Review application route coverage and old writer capability separately.

No merge, production deployment, database mutation, Storage bucket change, deployment deletion or new paid resources performed.
