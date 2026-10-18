# Final review dan gate release PR #70

Tanggal pemeriksaan: 2026-10-18 UTC. Baseline review `2740e7fe3772f7de07f8ead3656926c642b02982`; `main` masih `3897169fbf15830368e39c553c3500134f345e54`. Branch tetap `feat/registration-email-otp-and-storefront-links`. SHA final dan hasil workflow pascaperbaikan dicatat di PR agar laporan tidak mengacu ke hasil source lama.

**Keputusan operasional: NO-GO untuk migrasi/merge/deployment sekarang.** Source dapat direview setelah CI final PASS, tetapi bukti Production belum lengkap. PR tetap Draft. Instruksi terbaru mewajibkan backup/recovery; keputusan lama melewati backup tidak dipakai untuk melewati gate terbaru ini. Tidak membuat staging.

## Temuan dan tindakan

| Severity | Temuan | Tindakan/status |
|---|---|---|
| Critical | Tidak ditemukan temuan baru pada perubahan yang direview | Bukan klaim aplikasi bebas semua kerentanan; CI serta gate operasional tetap wajib. |
| High | Tidak ditemukan bypass OTP atau transaksi parsial pada source yang direview | Form/API/service memakai kontrak sama, HMAC generation-bound, activation setelah provider, row lock dan unique constraints. Ulangi CI pada source final. |
| Medium | Respons kontak existing sebelum OTP membocorkan keberadaan email/phone | Diperbaiki: kontak existing melewati alur OTP yang sama; konflik baru diputuskan setelah inbox proof, dengan pesan umum. Regresi baseline2740e7f gagal pada kasus email existing dan phone conflict; kandidat menolaknya secara aman. |
| High, existing dependency | npm audit melaporkan tujuh node High, 0 Critical/Moderate | Rantai braces/chokidar/micromatch/fast-glob/Tailwind/ESLint, advisory GHSA-vfj7-8cjw-p6xm. Tidak ada perubahan dependency/lockfile. Patch depth limit ber-checksum dan containment network-none tetap diuji. Audit tetap High; penerimaan risiko tooling harus eksplisit sebelum release. |
| Release blocker | Production identity, role efektif, konfigurasi email, backup belum terbukti | Jangan migrasi atau merge; lengkapi bukti operator/koneksi resmi. |
| Low / residual | Nomor HP belum diverifikasi dan konflik data masih diberitahukan setelah inbox proof | Jangan mengklaim kepemilikan WhatsApp/identitas hukum. Tidak mengubah phone akun lama; normalisasi tidak otomatis menggabungkan identitas legacy yang berbeda format. |

Request untuk alamat existing sekarang juga mengirim email OTP; pesan dikirim dengan kuota register/resend yang sama dan tidak memberikan akses ke akun existing. Provider acceptance belum membuktikan inbox delivery. Post-proof conflict tidak mengungkap field penyebab. Pending conflict tetap ber-TTL dan dibersihkan oportunistik; akun existing tidak diubah.

Tambahan regresi: verifikasi dua email ber-phone sama hanya menghasilkan satu User/customer/cart/wishlist/audit. Fault injection pada insert audit membuktikan rollback semua entitas termasuk UserRole dan konsumsi pending; sesudah fault dilepas OTP dapat dicoba kembali. Semua fault/DDL/destructive cleanup hanya pada database lokal unik milik suite.

Konten dan status legal tidak diubah pada final review ini. Dua penyesuaian teks phone/OTP yang sudah ada di kandidat2740e7f tetap dipertahankan, tidak ada penerbitan legal atau editor admin baru. Google/WhatsApp tetap nonaktif. JWT/sessionVersion/revocation/RBAC dan transaksi order/payment/shipping/inventory tidak diubah.

## Fakta Production read-only

- Supabase tool mengonfirmasi project `bztprltkevacidcpjaam`, `ACTIVE_HEALTHY`, region `ap-southeast-1`, PostgreSQL17.6. Organisasi melaporkan paket Free.
- Ledger Prisma berisi enam migration selesai, tanpa rolled-back entry; seluruh checksum cocok dengan enam file historis pada source. Migration `20261018150000_registration_email_otp` belum tercatat. `PendingRegistration` dan `User.emailVerifiedAt` belum ada.
- `User.phone` masih nullable; `sessionVersion` integer non-null. Unique index email dan phone ada. User/SessionRevocation/AuthRateLimit memiliki RLS; tidak ada policies pada tiga tabel tersebut.
- Role koneksi inspeksi MCP adalah `postgres` dengan BYPASSRLS, bukan bukti role aplikasi Vercel. Role aplikasi dan hak CRUD tabel baru belum dapat diverifikasi. Tidak mengubah grants/RLS.
- Snapshot katalog menunjukkan 7 koneksi, max_connections60, lock_timeout0 dan statement_timeout2min pada koneksi inspeksi. Ini bukan pengukuran pool aplikasi/kapasitas Production.
- Vercel GET project `syauqi3/gheverhan` ditolak403 pada kedua koneksi resmi yang tersedia. CLI tidak terpasang dan tidak ada autentikasi CLI lokal. Tidak mengekspor secret atau mencoba bypass.
- Karena itu DATABASE_URL/DIRECT_URL efektif, SSL, transaction/direct pooler, Preview isolation, domain→deployment→SHA, build/ignore settings, overrides, queued/running deployments, hooks, dan runtime logs belum terbukti pada pemeriksaan ini. Pernyataan dashboard lama bukan bukti konfigurasi sekarang.
- Tidak ada koneksi Resend yang callable saat pemeriksaan. Presence RESEND_API_KEY/JWT_SECRET, sender PASSWORD_RESET_FROM, PASSWORD_RESET_BASE_URL dan verified sending domain belum dapat dibuktikan. Jangan meminta nilai rahasia di chat.
- GET `/` dan `/register` pada `https://gheverhan.store` menghasilkan200. Ini hanya bukti HTTP reachability, bukan identitas source/deployment atau flow OTP Production. Tidak ada POST, login, email atau transaksi live dijalankan.

## Migration review

File: `frontend/prisma/migrations/20261018150000_registration_email_otp/migration.sql`.

SHA-256 langsung dari file: `eec85ff983628830923da3c7b0760bfc20378bdcf9cb7376dd6b1cca539eb84e` — cocok dengan expected. Tidak mengubah SQL/checksum migration dalam final review.

BEGIN/COMMIT; SET LOCAL lock_timeout5s/statement_timeout30s. Nullable timestamp tanpa backfill, tabel pending terpisah, PK TEXT, unique email, expiry index, RLS tanpa public policies. Tidak ada FK pending→User karena User belum ada. UUID dibuat aplikasi. ALTER User memerlukan ACCESS EXCLUSIVE singkat; gagal memperoleh lock harus menggulung balik seluruh DDL.

Fresh7, upgrade6→7 mempertahankan legacy null, lock contention/failure/full rollback, operator resolve sesudah bukti rollback, retry deploy dan no-op deploy diuji pada disposable PostgreSQL. `migrate deploy` idempotent lewat ledger; SQL bukan skrip idempotent yang boleh dijalankan berulang tanpa review. Jangan memakai `db push` atau mengubah ledger manual. Prisma resolve Production memerlukan review dan izin terpisah bila ada kegagalan.

**Kode baru tidak kompatibel dengan skema enam migration:** cleanup rate-limit mengakses PendingRegistration pada semua flow auth. Build/health hijau tidak membuktikan schema siap. Database-first wajib sebelum automatic deployment. Schema tambahan tetap kompatibel dengan app lama secara struktur, tetapi app lama masih dapat membuat akun tanpa OTP; semua writer registrasi lama/Preview perlu dikendalikan saat aktivasi kebijakan OTP.

## Backup dan recovery

Paket Free tidak membuktikan automatic backups/PITR tersedia. Tool yang tersedia tidak memberikan daftar backup; belum ada bukti backup Production terkini, lokasi terenkripsi, custodian kunci, coverage Storage atau restore drill dari backup Production. Status **BLOCKED**, bukan dianggap ada dari paket/README.

Drill tambahan lokal: pg_dump custom langsung dialirkan ke CMS AES-256-GCM/RSA3072 dengan key dummy sementara, decrypt, uji ciphertext tampered ditolak, pg_restore ke database lokal unik lain. Ledger7, RLS pending, nullable emailVerifiedAt serta jumlah baris seluruh tabel bisnis/auth yang diperiksa cocok. Database restore dan file/key dummy dibersihkan. Ini membuktikan mekanisme dummy saja; tidak membuktikan RPO/RTO atau backup aktual Production.

Operator perlu menyediakan lokasi off-provider terenkripsi, custodian/otorisasi kunci, checksum manifest, umur backup dan target RPO/RTO yang disetujui, serta backup file Storage termasuk payment-proofs. Backup database hanya mencakup metadata Storage, bukan objek file. Pengambilan backup pelanggan memerlukan izin khusus; tidak dilakukan sekarang dan tidak diunggah ke CI/chat. Lihat runbook R21 untuk rekonsiliasi auth/keuangan setelah recovery; jangan menganggap data live masih dummy tanpa konfirmasi terbaru.

## Urutan cutover yang disiapkan — belum dieksekusi

1. Pulihkan akses resmi Vercel. Cocokkan team/project/domain/deployment aktif/branch main dan target database dari metadata operator aman. Operator memproses connection strings dalam memori di kanal terpercaya, mengeluarkan hanya boolean target-ref/database/schema/SSL/pooler match dan effective role; jangan menaruh URL lengkap di laporan. Verifikasi DATABASE_URL dan DIRECT_URL menuju project yang sama; migrasi memakai direct/session connection yang disetujui, bukan transaction pooler.
2. Verifikasi environment Production terpisah dari Preview, secret presence/validity secara aman, sender/domain Resend verified, base URL `https://gheverhan.store`. Siapkan satu inbox uji yang disetujui untuk delivery proof tanpa mencetak kode/key.
3. Review tujuh High existing dan keputusan penerimaan residual risk tooling. Pastikan CI final SUCCESS pada HEAD baru dan required checks/review threads terpenuhi.
4. Tetapkan maintenance window, operator, recovery owner, stop criteria dan daftar writer (production lama, immutable URLs, Preview, webhook, cron, hooks/CLI). Minta izin spesifik sebelum mengubah traffic/maintenance/hosting. Profil maintenance harus menutup API dan Server Actions juga; drain transaksi, tanpa reset/seed/truncate.
5. Dengan izin backup terpisah, ambil backup terenkripsi PostgreSQL+Storage setelah writer terkendali, verifikasi integrity/restore readiness melalui kanal operator. Tidak menyalin data pelanggan ke runner disposable/CI. Jika backup belum tersedia atau writer tak terkendali, STOP.
6. Ajukan izin khusus **hanya migration ketujuh** dengan project ref, checksum di atas, maintenance window, target role/direct connection, backup dan rencana roll-forward. Instruksi prompt ini belum memberi izin migration. Jangan mengajukan seolah seluruh prasyarat sudah PASS.
7. Sesudah izin: periksa ulang target/ledger/checksum; enam migration historis harus cocok dan ketujuh benar-benar pending. Jalankan reviewed `prisma migrate deploy` melalui credential operator aman hanya bila diff pending tepat satu. Tidak otomatis `resolve` kegagalan. Hentikan jika checksum berbeda/ada DDL parsial.
8. Jalankan `release:preflight` pada environment terpercaya dengan `R21_EXPECTED_SUPABASE_REF=bztprltkevacidcpjaam`, `R21_ALLOW_PRODUCTION_READ_ONLY=1`, menggunakan role aplikasi sebenarnya. Wajib ledger7/checksum, metadata/indeks, nullable timestamp, RLS/no policy publik, CRUD dan trusted role PASS. Verifikasi SSL/pooling/provider terpisah; script presence bukan deliverability proof.
9. Setelah semua gate dan izin relevan lengkap: Ready for Review, periksa ulang HEAD/main/CI/reviews, squash merge PR70 saja; catat M dan bandingkan tree hasil merge dengan kandidat. Source/CI baru wajib diverifikasi bila base atau HEAD berubah.
10. Pantau automatic deployment pada M hingga READY dan alias gheverhan.store menunjuk deployment tersebut. Jika Ignore Build Step/override masih menghentikan build, jangan menganggap merge sebagai deployment; perubahan setting/promotion memerlukan approval dalam paket release. Jangan membuka app sebelum schema/provider siap.
11. Smoke dengan akun/inbox uji disetujui: wrong/right/expired/resend, timestamp/phone, login email/phone, legacy login/logout/reset; kode/password/cookie tidak masuk artifact. Jangan menjalankan smoke order/payment finansial di luar scope tanpa rencana rekonsiliasi finance. Monitor5xx/503/429, provider failure, RLS/locks/pool, hydration dan transaksi.
12. Jika gagal: traffic stop sesuai otorisasi, preserve evidence, roll-forward schema-compatible dan OTP tetap wajib. Jangan rollback ke register tanpa OTP atau kode tanpa session revocation. Jangan drop data/tabel/kolom, invalidasi sesi/rotasi key atau restore Production tanpa izin incident spesifik. Backup restore dapat menghidupkan sesi lama dan kehilangan transaksi; rekonsiliasi sebelum reopen.

## Gate saat penulisan

| Gate | Status |
|---|---|
| Source OTP/security/UI | Perbaikan Medium selesai; menunggu CI HEAD baru |
| Review migration dan checksum | PASS pada file kandidat |
| Database project inspeksi/ledger enam | VERIFIED; bukan bukti linkage Vercel |
| Vercel Production identity / effective DB role / SSL/pooling | BLOCKED403 |
| Backup Production+Storage dan recovery operator | BLOCKED, bukti belum tersedia |
| Email configuration/domain/delivery | BLOCKED, akses/bukti belum tersedia |
| Seluruh writer terkendali / safe auto-deploy sequence | BLOCKED sampai konfigurasi live terbukti |
| Migration Production | BELUM DIJALANKAN / BELUM DISETUJUI |
| Merge / deployment / smoke OTP Production | BELUM DILAKUKAN |

Tidak meminta secret melalui chat. Langkah aman yang masih bisa diselesaikan ialah source/tests/CI, dokumentasi, dan review PR. Persetujuan migration baru diminta setelah bukti prasyarat tersedia; saat ini bukan sekadar menunggu izin migration.
