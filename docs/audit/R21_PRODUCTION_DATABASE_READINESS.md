# R21 — Production database readiness

Status prosedur/source: **READY FOR SOURCE REVIEW**. Eksekusi database production: **NOT READY / BELUM DIOTORISASI**. Tidak menggunakan staging; semua mutation dan restore drill memakai PostgreSQL disposable loopback. Tidak ada `db push`, shared reset/seed, perubahan role/policy live, atau pembacaan snapshot PostgreSQL tracked.

## Identitas dan ledger aktual

Connector Supabase memeriksa `bztprltkevacidcpjaam`, region ap-southeast-1, PostgreSQL17.6, Free. Metadata Vercel membuktikan domain production/project/deployment/main/sin1, tetapi tidak menghubungkan nilai secret DATABASE_URL ke ref tersebut. Kehadiran variabel bukan bukti identitas target. Konfirmasi non-rahasia pemilik diminta; tanpa itu jangan menerapkan SQL di project bernama sama.

Lima ledger finished/tidak rolled-back dan checksum historis cocok source:

1. `20260922143925_init`.
2. `20261015000000_add_refunded_payment_status`.
3. `20261016112100_coupon_usage_limits`.
4. `20261016112200_coupon_redemption_concurrent_index`.
5. `20261016140500_product_scheduled_flash_sale`.

Belum diterapkan: `20261017000000_auth_session_controls`; SessionRevocation/AuthRateLimit/User.sessionVersion juga belum tersedia pada project yang diperiksa. Jangan membuka auth R21 terhadap schema tersebut. Urutan wajib lima historis → auth6 → verifikasi → traffic auth. Profil maintenance menutup business request sebelum auth; GET/HEAD health hanya liveness.

Auth6 menambahkan integer NOT NULL DEFAULT0, dua tabel, lima indeks/PK, FK revocation→User ON DELETE/UPDATE CASCADE, dan RLS tanpa public policy. Tidak mengganti format JWT; sesi legacy version0 tetap kompatibel. Password reset menaikkan version; logout menyimpan digest revocation. Legacy main tidak memahami kontrol baru dan bukan rollback normal yang aman. Logout historis main hanya menghapus cookie; token lama yang telah ditangkap tidak dapat dicabut retroaktif dari tabel kosong. Rekomendasi cutover: setelah schema6, dalam maintenance sebelum ada issuance auth R21, pemilik menyetujui invalidasi legacy version0→1 yang idempotent. Ini memaksa seluruh sesi lama login ulang dan merupakan perubahan data terpisah yang belum diotorisasi. Tidak memakai increment+1 ini untuk recovery snapshot yang sudah pernah melayani versi1.

## Pengujian disposable

PG17.11 lokal: cluster55436 untuk fresh/application,55437 untuk upgrade lima→enam,55438 untuk restore ke database/cluster lain. Tidak ada database/customer production di runner.

- Fresh enam migrasi PASS; lima historis diterapkan terpisah sebelum upgrade.
- Lock User ditahan; lock_timeout750ms menggagalkan percobaan auth dan rollback tanpa tabel parsial. Kegagalan nyata Prisma deploy/failed ledger juga diuji; setelah inspeksi objek kosong, resolve rolled-back dan retry berhasil dengan enam migration finished serta satu catatan rollback historis.
- Backup sebelum auth direstore; legacy row tetap ada. Deploy auth dan retry idempotent PASS.
- Default version0, RLS kedua tabel, lima indeks valid dan FK cascade diverifikasi.
- Backup security mempertahankan version2 dan revocation. Drill tambahan streaming custom pg_dump ke CMS AES-256-GCM/RSA3072 dummy, tamper rejection, decrypt dan restore ke cluster lain PASS.
- Setelah restore:11 auth +27 transaksi PASS, termasuk replay JWT yang dicabut tetap ditolak sebelum/sesudah backup. File private/key/dump dummy dihapus; tidak diunggah ke repo/CI.
- `release:preflight` read-only diuji terhadap schema6, schema5, ledger ambigu/duplikat, konfigurasi kurang, remote identity tak terverifikasi dan role SELECT-only. Tidak membuat objek saat pemeriksaan. Ledger memeriksa checksum/nama unik/finished/recovery history; schema memeriksa default/tipe, RLS, indeks/FK dan privilege SELECT+INSERT+UPDATE satu per satu.

Bukti sintetis disimpan pada `evidence/r21` dan hasil per-SHA final di CI/Draft serta `/workspace/scratch/r21/FINAL_RESULTS.md`. Hasil prequalification bukan pengganti final SHA.

## Lock, pooling, role dan performance

ALTER User mengambil AccessExclusiveLock; default konstan tidak memerlukan rewrite penuh pada PG17, tetapi lock wait tetap dapat mengganggu traffic. Migration historis4 memakai CREATE INDEX CONCURRENTLY; jangan bungkus semua migration files dalam satu transaksi. Auth6 diuji dalam transaksi lokal, tetapi Prisma deploy bukan jaminan semua statement otomatis atomic; inspeksi ledger/objek setelah kegagalan sebelum recovery. Jangan menandai applied tanpa membuktikan seluruh objek/checksum. Hindari statement_timeout pendek tanpa memeriksa index invalid/ledger failed.

Gunakan koneksi direct khusus operator dengan lock/statement budget yang disetujui. Preflight read-only memakai transaksi READ ONLY/statement_timeout5s, bukan migration timeout. Migration window perlu nilai eksplisit yang disepakati (contoh awal lock5s/statement60s untuk auth6 kecil, wajib disesuaikan); jangan menunggu lock tanpa batas.

Observed max_connections60, statement_timeout2min, lock_timeout0; sampel7–10 koneksi. Connector role postgres BYPASSRLS, bukan superuser; ini tidak membuktikan role efektif aplikasi. Seluruh41 tabel public RLS enabled/no-policy; anon/authenticated memiliki SELECT User tetapi tetap default-deny oleh RLS. Jangan menambahkan public policy untuk mengatasi error auth. Role server harus membaca seluruh revocation dan mempunyai semua hak write yang diperlukan. Role/transaction pool/SSL/DIRECT_URL aktual tetap perlu verifikasi aman pemilik.

Performance advisor:16 FK tanpa covering index dan8 unused index, semuanya INFO. Jangan menghapus indeks kupon/session karena sampel pemakaian kecil. Tidak membuat16 indeks baru tanpa query/EXPLAIN dan kebutuhan terukur. Fixture performance memakai connection_limit4 per client secara lokal; itu bukan konfigurasi production. Pool budget harus mencakup jumlah instance Vercel, operator, background, headroom dan batas60; transaction pooler tidak boleh diasumsikan cocok tanpa verifikasi Prisma5.22/prepared statements.

## Backup production pada paket Free

Organisasi terkonfirmasi Free. [Dokumentasi backup Supabase](https://supabase.com/docs/guides/platform/backups) menyatakan daily backup untuk Pro/Team/Enterprise dan merekomendasikan ekspor off-site untuk Free; PITR adalah add-on berbayar. Tidak mengasumsikan backup/PITR tersedia, membeli paket, atau mengklaim inventaris backup manual sudah diverifikasi. Mekanisme backup production yang dapat dipulihkan masih BLOCKED.

Rancangan yang menunggu persetujuan:

- Operator pemilik/DBA yang ditunjuk, dari perangkat/kanal tepercaya; tidak dari CI PR atau chat ini. Identitas project, database, role, fingerprint public recipient dan tujuan backup harus diverifikasi dua pihak.
- Stream logical backup konsisten ke enkripsi authenticated AES-256-GCM/CMS atau format setara yang disetujui. Private decryption key disimpan terpisah/hardware/secret manager pemilik; dummy drill menggunakan key sekali pakai, bukan rekomendasi private key tanpa proteksi production.
- Simpan ciphertext/checksum/manifest terenkripsi pada lokasi off-site milik pemilik dengan ACL terbatas, versioning/retention yang disetujui; jangan membuat layanan berbayar atau mengirim dump/customer rows ke runner/artifact CI.
- Cakup semua business/auth/audit/migration tables, schema/constraint/index/RLS/grants/role definitions yang relevan; password role/credential di luar dump dipulihkan lewat kanal aman. Backup database tidak mencakup bytes object Storage: backup proof/product objects dan metadata secara terenkripsi dengan manifest konsisten. Tentukan sumber rekonsiliasi transaksi eksternal.
- Usulan RPO operasi ≤24jam melalui backup terjadwal +sebelum/sesudah release; belum disetujui dan bisa tidak memadai bagi transaksi finansial. Usulan RTO ≤120menit juga belum dibuktikan untuk ukuran/layanan production. Pemilik harus menerima atau memperketat target sebelum release; angka lokal <1detik bukan RTO production.
- Target RPO cutover0 hanya jika traffic/write/background benar-benar dihentikan dan in-flight transaction didrain sebelum backup, lalu tidak ada business/auth write sampai recovery/cutover disetujui. Jika ada writer yang tidak terkontrol, klaim RPO0 tidak berlaku.

## Recovery dan sesi aktif

Utamakan roll-forward dan pertahankan tabel auth. Jangan drop schema/ledger historis untuk rollback aplikasi. Fallback melayani user harus tetap menghormati revocation/sessionVersion; profil maintenance tertutup kandidat R21 dapat menjadi traffic-stop, bukan membuka auth lama.

Restore snapshot sebelum logout/reset dapat menghidupkan JWT, reset link, account/role state atau password lama. Increment sessionVersion +1 tidak otomatis aman: dapat bertabrakan dengan versi JWT yang diterbitkan sesudah backup. Jika ada auth write setelah snapshot atau batas versi tidak terbukti, tahan traffic dan minta persetujuan incident recovery untuk invalidasi signing key global atau epoch version yang terbukti tidak pernah diterbitkan. Invalidate reset tokens yang dipulihkan dan rekonsiliasi password/account/role changes yang mungkin hilang. Tidak menjalankan rotasi/invalidation di live sekarang.

Restore setelah transaksi finansial berlangsung juga memerlukan rekonsiliasi bank/proof/fulfillment/inventory/voucher/refund; jangan replay approval atau release stok secara buta. Ketidakpastian menghentikan fulfillment/traffic, bukan diatasi dengan menghapus catatan. Bila backup diambil setelah freeze/drain dan tidak ada business/auth write selanjutnya, recovery maintenance window jauh lebih terbatas; operator harus membuktikan kondisi itu.

Setelah migrasi/recovery: ledger/checksum, objek/role/RLS/index/FK/default, session revocation/reset, pool/locks, idempotency dan stock/payment invariants diverifikasi sebelum membuka traffic. Backup nyata, storage coverage, role/identity, maintenance window dan eksekusi production membutuhkan persetujuan eksplisit.
