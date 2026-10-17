# R20 — Kesiapan migrasi PostgreSQL

Status: **READY FOR SOURCE REVIEW** untuk prosedur; **NOT READY** untuk eksekusi production.
PostgreSQL disposable17.11 baru pada loopback55434 dan cluster drill55435; tidak memakai Supabase.
Tidak ada `prisma db push`, penghapusan migrasi historis, atau pembacaan data pelanggan.

## Urutan dan dependency

1. `20260922143925_init` — schema dasar, FK, constraint dan indeks historis.
2. `20261015000000_add_refunded_payment_status` — enum status pembayaran refund.
3. `20261016112100_coupon_usage_limits` — lifecycle/quota voucher.
4. `20261016112200_coupon_redemption_concurrent_index` — satu CREATE INDEX CONCURRENTLY, wajib tanpa transaction wrapper menyeluruh.
5. `20261016140500_product_scheduled_flash_sale` — jadwal flash sale.
6. `20261017000000_auth_session_controls` — User.sessionVersion default0, SessionRevocation, AuthRateLimit, FK cascade,5 indeks termasuk PK, RLS tanpa public policy.

Aplikasi #61/R20 memerlukan migrasi keenam SEBELUM melayani traffic autentikasi.
Legacy JWT diterima pada version0; migrasi tidak melogout semua user secara paksa.
Password reset menaikkan version, logout menambah digest revocation; data tersebut
harus dipertahankan pada recovery. R20 tidak mengubah format JWT/database session.

## Hasil drill lokal

- Lima migrasi historis diterapkan bersih, dibuat satu legacy user dummy, backup custom-format dengan mode0600.
- Lock User ditahan dan migrasi auth dicoba dengan lock_timeout750ms: gagal terukur, transaction rollback, tidak ada tabel parsial.
- Backup lama direstore pada database drill sendiri, row legacy tetap ada.
- `prisma migrate deploy` ke source keenam berhasil; ulangi deploy tidak membuat perubahan baru.
- Default sessionVersion0, RLS kedua tabel, FK ON DELETE/UPDATE CASCADE, validitas5 indeks diverifikasi melalui katalog.
- Backup/restore schema/data security mempertahankan version2 dan satu revocation sintetis.
- `options=-c lock_timeout=750ms` pada koneksi Prisma diverifikasi melalui current_setting; nilai/DSN tidak dicetak.

Bukti sintetis: `evidence/r20/migration-readiness-results.json`. Dump hanya data dummy,
tersimpan lokal dengan izin terbatas dan tidak di-commit/upload. Bukti ini bukan pengujian
restore/PITR managed Supabase; langkah managed tetap memerlukan akses dan persetujuan pemilik.

## Lock, role, RLS, pooling dan performance

ALTER User memerlukan AccessExclusiveLock; default0 nonvolatile pada PG17 tidak memerlukan
rewrite penuh, tetapi antrean lock tetap dapat mengganggu traffic. CREATE TABLE/INDEX baru
kecil, FK juga mengambil lock pada User. Gunakan koneksi DIRECT_URL dedicated untuk migrasi,
lock_timeout/statement_timeout yang disetujui dan maintenance window. Jangan bungkus semua
migration files dalam satu BEGIN karena indeks historis memakai CONCURRENTLY. Kegagalan
migrasi dapat meninggalkan ledger failed; inspeksi objek/ledger dahulu sebelum approved
`prisma migrate resolve --rolled-back` dan retry, jangan menandai applied tanpa bukti.

Trusted server role harus dapat melihat SELURUH revocation, memiliki SELECT/INSERT/UPDATE
sesuai kebutuhan dan RLS perimeter tetap aktif. Role publik tidak mendapat kebijakan baca.
R20-AUTH-01 menolak role dengan RLS aktif terhadap dirinya, karena `NOT EXISTS` atas baris
tersembunyi akan fail-open. Jangan menambahkan public policy atau BYPASSRLS untuk mengatasi
error tanpa review role pemilik. Verifikasi role efektif dengan capability query, bukan
asumsi berdasarkan nama credential atau hasil superuser lokal.

PK tokenHash/bucket dan indeks expiresAt/userId mencakup point lookup, counter atomic dan
cleanup. Real PostgreSQL concurrency dan role tests tetap wajib. Connection pool aplikasi
memerlukan budget connection_limit terhadap kapasitas Supabase dan jumlah instance;
DIRECT_URL migrasi terpisah dari transaction pool. Prepared-statement/pgbouncer settings
harus sesuai versi Prisma5.22 dan pooler aktual. Tidak mengklaim load capacity production
berdasarkan fixture kecil atau mengganti setting pooling live.

## Backup, rollback, roll-forward dan recovery

Sebelum perubahan live (hanya setelah disetujui): verifikasi target project/database/role,
riwayat/checksum migrasi aktual, kapasitas/lock, backup snapshot/PITR dan retention; buktikan
restore di lingkungan lain yang terisolasi. Backup konsisten mencakup User, token digest,
revocation, limiter dan seluruh transaksi finansial; jangan salin customer data ke runner ini.

Utamakan roll-forward. Tidak drop kolom/tabel auth untuk rollback aplikasi. Versi rollback
harus tetap memahami sessionVersion/revocation; rollback ke main lama tanpa kontrol ini
membuat JWT yang dicabut berlaku kembali walaupun schema masih kompatibel dibaca.
Restore ke titik sebelum logout/reset juga dapat menghidupkan sesi lama: perlu prosedur
invalidasi global yang disetujui (bump sessionVersion atau rotasi signing key) sebelum
traffic dibuka kembali. Tidak menjalankan tindakan tersebut pada database bersama.
Untuk indeks CONCURRENTLY gagal, periksa indisvalid dan bentuk objek; recovery/removal
indeks invalid hanya di bawah rencana owner, bukan retry buta.

## Verifikasi sesudah migrasi yang direncanakan

Cocokkan enam ledger/checksum tanpa pending/failed; periksa default/constraint/index/RLS dan
trusted role; jalankan dummy login/logout/replay, reset/session revocation, limiter dan DB
failure; uji checkout/proof/review/expiry stock+voucher di staging. Catat latency, auth503,
rate429, DB pool saturation, lock wait, cron backlog dan invariant finansial. Production
hanya boleh dibuka setelah staging terisolasi, CI final dan seluruh blocker disetujui.
