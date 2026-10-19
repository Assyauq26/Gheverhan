# Kesiapan migration indeks identitas registrasi

Status source: untuk review. **Production migration belum dijalankan dan deployment belum diizinkan.** Migration OTP ketujuh tidak diubah dan tidak boleh dijalankan ulang.

## Kebutuhan dan rancangan

`20261019054922_registration_identity_lookup_indexes`, SHA-256 `369372134dd10fca58dc04e5afb4b4bcec347c948524f239918f1663e8fa3d0b`.

Migration dibuat menggunakan Prisma CLI resmi `npm run prisma:migrate -- --create-only --name registration_identity_lookup_indexes`, kemudian SQL draft direview dan diterapkan hanya pada PostgreSQL disposable melalui `npm run prisma:deploy`. Tidak menggunakan `db push`.

Lookup perlu mengenali email legacy case/whitespace dan phone Indonesia dengan variasi format. Indeks raw unique yang sudah ada tidak mencakup ekspresi tersebut. Benchmark terisolasi pada 100.000 identitas dummy menunjukkan sequential scan 100.000 row, 692,193 ms; dengan indeks ekspresi menjadi dua bitmap index scans, 0,085 ms. [Plan sebelum](benchmark/identity-lookup-before.json) dan [sesudah](benchmark/identity-lookup-after.json) bersifat sintetis; bukan klaim kapasitas Production. Test lain menjalankan **query aplikasi sebenarnya** dengan generic prepared plan dan 10.000 User dummy, tanpa mematikan sequential scan, dan mewajibkan kedua indeks dipakai.

Dua indeks:

- `User_registration_email_normalized_idx`: lower/trim email dengan whitespace ECMAScript.
- `User_registration_phone_normalized_idx`: translate separator lalu canonical prefix 0/62/+.

Keduanya **non-unique**: tidak mengubah constraint atau menolak legacy rows yang kebetulan ekuivalen. Raw unique email/phone tetap menjadi perlindungan akhir registrasi baru yang selalu dinormalisasi. DDL mengikuti schema target Prisma melalui nama tabel tanpa hardcode `public`; test entrypoint membuktikan schema fixture tidak menyentuh indeks public. Tidak ada update/delete User, perubahan kolom, FK, role, grant, RLS, session atau password. Prisma 5 tidak memodelkan expression indexes; SQL migration historis mengelolanya. Pemeriksaan `prisma migrate diff` dari disposable schema ke datamodel menghasilkan exit 0.

Query meng-inline hanya karakter normalisasi statis sebagai SQL Unicode literals; input email/phone tetap parameter. Parameterisasi normalisasi itu sendiri akan menghalangi index match pada generic plans. Test query plan melindungi perubahan berikutnya agar tidak diam-diam kembali melakukan scan.

## Lock, failure, dan bukti lokal

SQL memakai `BEGIN`/`COMMIT`, `lock_timeout=5s`, `statement_timeout=30s`. Ordinary `CREATE INDEX` mengambil SHARE lock yang menghambat writer selama build; pembacaan tetap berjalan. Pilihan transactional ini memastikan kedua DDL rollback bersama bila gagal, tanpa invalid concurrent index yang tertinggal. Wajib review jumlah row/ukuran dan window writer sebelum eksekusi Production. Bila volume tidak cocok dengan batas ini, STOP dan rancang migration concurrent terpisah, jangan menaikkan timeout atau mengubah SQL yang sudah diterapkan secara sembarang.

Drill PostgreSQL disposable lulus:

1. Fresh delapan migrasi, ledger/checksum lengkap, dua expression index valid/ready/non-unique, deploy ulang no-op.
2. Upgrade tujuh→delapan mempertahankan seluruh field akun legacy, termasuk pasangan identitas raw yang berbeda namun ekuivalen secara normalisasi.
3. ROW EXCLUSIVE lock menahan DDL; CLI gagal dalam batas lock timeout; tidak ada indeks parsial atau perubahan User. Setelah pemeriksaan rollback, `prisma migrate resolve --rolled-back` dan `prisma migrate deploy` resmi berhasil.
4. Fixture konflik nama pada DDL kedua membuat DDL pertama rollback. Setelah perbaikan fixture terisolasi dan official resolve/deploy, kedua indeks tersedia. Ini simulasi lokal; tidak menginstruksikan penghapusan indeks Production.
5. Generic query plan memakai kedua expression index pada 10.000 User dummy; tidak ada sequential scan User.
6. Release preflight read-only memerlukan ledger delapan checksum yang cocok dan kedua named expression indexes valid/ready pada User. Indeks hilang membuat BLOCKED.

## Urutan operator setelah review dan persetujuan spesifik

Belum boleh dieksekusi dari prompt feature ini. Paket persetujuan berikut harus menyebut target Supabase `bztprltkevacidcpjaam`, SHA source yang disetujui, checksum di atas, window write-drain, kebijakan backup/recovery untuk perubahan ini, dan penanggung jawab. Persetujuan/waiver migration OTP sebelumnya bukan izin otomatis untuk migration indeks baru.

1. Verifikasi metadata database/role dan hubungan ke Vercel Production melalui kanal aman tanpa mencetak connection string/secret. Verifikasi direct connection, SSL, ledger tujuh migrasi sukses dan checksum historis, terutama OTP ketujuh. Periksa tidak ada failed migration atau indeks bernama sama yang tidak sesuai.
2. Verifikasi **tepat satu** migration pending, hanya `20261019054922_registration_identity_lookup_indexes`. Jika ada checksum drift, migration lain pending, atau indeks berkonflik, STOP. Jangan overwrite checksum/ledger atau mengulang OTP.
3. Kendalikan writer dan ukur lock/row count sesuai window yang disetujui. Jangan mengaktifkan maintenance atau mengubah layanan live tanpa izin terpisah. Keputusan backup untuk langkah baru harus eksplisit; pekerjaan feature ini tidak membuat backup/data dump Production.
4. Setelah persetujuan, jalankan `npm run prisma:deploy` menggunakan direct target terverifikasi dan env aman. Jangan `db push`, manual DDL, reset/drop/seed, atau mengubah `_prisma_migrations` langsung.
5. Verifikasi ledger delapan checksum selesai, kedua indeks valid/ready/non-unique/expression target User, query plan indexed, RLS/grants tidak berubah, dan User row count tetap. Jalankan `npm run release:preflight` read-only dengan konfigurasi operator yang benar; presence bukan bukti deliverability.
6. Baru ajukan persetujuan merge/deployment source yang CI-nya hijau. Tidak perlu invalidasi sesi, rotasi secret, atau perubahan schema OTP. Resend dan native autofill perangkat nyata hanya diuji terbatas setelah release yang disetujui, bukan melalui spam/customer account.

## Recovery

Jika lock/DDL gagal, tahan aktivasi sampai transaction rollback dan catalog diverifikasi. Gunakan prosedur Prisma resmi untuk resolve/retry hanya setelah persetujuan dan bukti kegagalan lengkap; jangan mengedit ledger atau melewati error. Failed migration kedua tidak boleh disamarkan menggunakan `IF NOT EXISTS`.

Setelah sukses, utamakan roll-forward. Indeks bersifat additive dan dapat dipertahankan saat rollback aplikasi; jangan hapus migration historis atau drop indeks sebagai langkah cepat. Rollback-compatible source harus tetap menyertakan migration kedelapan dan preflight yang memahaminya, serta mempertahankan OTP/session revocation. Jangan kembali ke versi sebelum kontrol tersebut. Tidak ada klaim bahwa rollback deployment saja memulihkan data; migration ini tidak memutasi row pelanggan.
