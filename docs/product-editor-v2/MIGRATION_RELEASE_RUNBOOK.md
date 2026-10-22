# Migration dan coordinated release runbook

Runbook SQL dan recovery kanonik: MIGRATION.md dan RECOVERY_DRILL.md. Target intended bztprltkevacidcpjaam/postgres; binding efektif aplikasi masih BLOCKED. Snapshot: 10 completed, 0 failed/rolled-back; source memiliki 11 migration. V2 SHA-256 63eefd28491f47b5ed269539d88b52b985f47aac4b620e6600f1607f06414198. DDL additive: 4 nullable integer, 2 tabel + CHECK/index/RLS, BEGIN/COMMIT lock 5s/statement 60s, tanpa data rewrite/drop/public policy. Rehearsal official Prisma fresh/upgrade/retry/lock rollback/recovery berada pada suite product-editor-v2-migration.test.ts dan CI HEAD yang dicatat di CI_EVIDENCE.md.

## Urutan setelah semua gate dan persetujuan spesifik

1. Recheck exact SHA/checks/review, DB identity/schema/role/TLS/direct versus pooler dan seluruh checksum ledger; tepat satu pending. STOP unexpected ledger/checksum/DDL.
2. Approved maintenance window dan kontrol Git auto-deploy/branch/protection/legacy Preview/writer cron/webhook. Buktikan tidak ada queued/running atau transaksi konflik. Merge bukan langkah pertama.
3. Recovery compatible reader disiapkan; owner tidak mewajibkan backup tambahan untuk dummy, bukan izin delete/reset. Catat tidak ada jaminan restore point sebelum migrasi.
4. Private bucket transition hanya setelah old/current reader compatibility terbukti dan dummy probe disetujui; bila perlu deploy maintenance/compatibility reader terpisah dengan approval. Jangan aktifkan V2 terhadap schema lama.
5. Operator resmi Node 22/pinned dependencies, verified DIRECT_URL; prisma migrate status lalu npm run prisma:deploy hanya setelah satu pending dan approval spesifik. Jangan db push/SQL Editor/ledger write/manual DDL. Lock timeout: STOP, diagnosis; jangan terminate sesi atau retry tanpa batas.
6. Post-migration 11 completed/checksum/schema 4 columns/2 tables/index/CHECK/FK/RLS/grants role aplikasi; release:preflight read-only PASS wajib. Jika failed simpan bukti dan ikuti official Prisma recovery drill; resolve tidak boleh menandai DDL yang belum diterapkan.
7. Ready PR/squash merge hanya review requirements terpenuhi dan deployment control terbukti. Catat M, compare Git tree dengan kandidat; jalankan checks M. Deploy/promote hanya approved exact source setelah DB kompatibel.
8. Alias gheverhan.store dan main SHA terverifikasi, smoke approved dummy/media/editor/auth/cart/direct checkout tanpa transaksi finansial tak disetujui. Observability dan traffic restore hanya setelah integritas PASS.
9. Cleanup activation/schedule memiliki approval khusus, owner/capacity/monitoring; bukan efek samping merge.

Emergency traffic-stop/maintenance juga operasi berizin; preserve files/metadata/receipts/historical SKU. Setelah finalized staged media, jangan rollback baseline b2d1819 yang menolak staged prefix. Roll-forward source compatible; jangan reset/drop atau kompensasi stok/pembayaran massal. Tidak ada langkah operasional di atas dieksekusi pada persiapan release.
