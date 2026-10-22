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
