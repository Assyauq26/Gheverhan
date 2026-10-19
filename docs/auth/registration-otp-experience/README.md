# Perbaikan konflik registrasi dan pengalaman OTP

Baseline: `main@12f7a4589ff50dbf2f3c70f19dd92b98df19fcd9`, setelah PR #70 di-merge. Branch: `fix/registration-conflicts-otp-experience`. Seluruh pengujian memakai data dummy, provider loopback/mock, Node.js 22, dan PostgreSQL 17 disposable. Tidak ada akses atau perubahan Production dalam pekerjaan ini.

## Root cause dan perbaikan

1. `requestRegistrationOtp` sebelumnya sengaja menunda pemeriksaan akun existing sampai verifikasi untuk mengurangi enumeration. Akibatnya email/phone existing tetap menerima OTP dan pending state dapat diganti. Reproduksi menggunakan service asli baseline gagal pada ekspektasi penolakan awal (`Missing expected rejection: email`). Kebijakan baru yang diminta pemilik diterapkan sebelum menyentuh pending state/provider, di jalur Server Actions dan REST yang memakai service bersama.
2. Client sebelumnya menetapkan deadline `Date.now() + 10 menit`, termasuk sebelum hasil resend diketahui, dan memulihkan challenge lokal tanpa validasi server. Deadline/cooldown kini berasal dari row server; reload memvalidasi private challenge melalui status action. Respons resend yang hilang direkonsiliasi, bukan dianggap berhasil dan diberi deadline baru.
3. Pesan verifikasi sebelumnya menyatukan kode salah, expired, dan batas percobaan. Error terstruktur sekarang membedakan ketiganya. Redirect langsung sebelumnya tidak memberikan state sukses yang dapat dipercaya; UI hijau sekarang hanya sesudah transaksi akun dan pembuatan sesi sukses di server.
4. Pencarian identitas pada role yang terfilter RLS dapat memberikan hasil kosong yang keliru. Guard memeriksa `row_security_active` pada statement lookup yang sama dan menolak 503 bila visibilitas identitas tidak lengkap. Kegagalan database tetap fail-closed.

5. Regression tambahan membuktikan SQL POSIX whitespace pada locale PostgreSQL tidak identik dengan JavaScript `trim()/\s`: phone legacy berisi non-breaking space sempat lolos. Lookup sekarang memakai himpunan whitespace ECMAScript eksplisit dengan `translate`/`btrim`, termasuk NBSP/BOM; test legacy Unicode gagal sebelum perbaikan dan lulus sesudahnya.

6. Review Codex menemukan dua P2: ref retry tidak memicu penjadwalan ulang setelah status `sending` gagal dibaca, dan pesan restart selalu mengalahkan hasil submit terbaru. Tiga regression tests mereproduksi kedua temuan sebelum perbaikan; satu test tambahan memastikan metadata `sending` baru tidak mereset budget empat pemeriksaan otomatis. Retry kini berupa state yang bergerak saat pemeriksaan dimulai, baik untuk respons gagal maupun sukses (maksimum empat, lalu fallback manual), dan feedback action terbaru menggantikan pesan/link recovery lama.

7. Review lanjutan menemukan UI melarang resend pada reservation `sending` yang tertinggal setelah worker berhenti, walaupun cooldown sudah berlalu. Tombol resend sekarang mengikuti cooldown server tanpa memblokir status tersebut; verifikasi tetap terkunci hingga aktivasi. Unit test gagal sebelum perbaikan lalu lulus sesudahnya, dan PostgreSQL test membuktikan CAS replacement reservation serta pembuatan tepat satu akun setelah kode baru valid.

8. Review berikutnya membuktikan recovery otomatis dapat bertumpang tindih dengan resend dan menimpa metadata baru memakai respons status lama. Seluruh status read dan mutation UI sekarang berbagi mutex `busy`/`pending`; retry dihitung saat mulai dan dijadwalkan berikutnya sesudah request selesai. Deferred-response regression gagal sebelum fix, lalu membuktikan resend tidak bisa dipaksa saat status masih in-flight, recovery berakhir, resend mengaktifkan kode baru, dan snapshot lama tidak menimpa state aktif.

9. Tiga deferred-response tests tambahan mereproduksi respons dari halaman OTP yang sudah ditutup menimpa challenge akun baru atau memanggil restart lama. Guard lifecycle sekarang mengabaikan hasil status/verify/resend setelah unmount sebelum menyentuh state, storage, atau callback. Respons jaringan tidak dapat menghidupkan lagi metadata pendaftaran lama ketika pengguna sudah berpindah flow.

10. Review mengonfirmasi respons lambat membuat clock display mulai dari `serverNow` yang sudah tertinggal. Metadata kini menyertakan timestamp awal service; wrapper client mengukur round-trip monotonic, mengurangi durasi pemrosesan server/provider, dan mengestimasi midpoint transit. Anchor dibentuk saat respons diterima sebelum React memprosesnya; elapsed berikutnya memakai `performance.now()`, sehingga perubahan jam perangkat tidak mereset timer. Test mereproduksi reset sebelumnya dan memverifikasi provider work, latensi, React delay, serta clock skew tanpa mengubah deadline database.

11. Serializer REST register memilih field secara eksplisit dan melewatkan `serverReceivedAt`, padahal status/resend meneruskannya. API kini konsisten; browser contract test memeriksa timestamp pada setiap respons register 202. Test terhadap build lama mereproduksi omission sebelum build source perbaikan.
12. Reviewer menemukan scan O(jumlah User) pada ekspresi normalisasi. Benchmark dummy membuktikan kebutuhan migration indeks. Dua expression index non-unique mempertahankan akun legacy dan constraints raw; normalization literals di-inline dari konstanta tepercaya, sementara email/phone tetap bound parameters, agar generic prepared plan cocok dengan indeks. Drill fresh/upgrade/lock/partial-failure/retry dan query plan generic lulus, tanpa perubahan Production.

## Backend dan batas keamanan

- Email trim/lowercase dan phone Indonesia dinormalisasi konsisten. Lookup juga mengenali email legacy dengan kapitalisasi dan phone legacy berformat lokal/spasi/tanda baca tanpa mengubah data lama.
- Konflik mengembalikan 409 dengan pesan gabungan: **Email atau nomor HP sudah terdaftar. Silakan masuk atau reset password.** Tidak membedakan field/akun aktif dan nonaktif; identitas nonaktif tetap dicadangkan oleh unique constraint.
- Tidak ada pending mutation atau provider call pada konflik yang sudah ada. Pemeriksaan diulang sebelum/ sesudah provider, saat resend, dan dalam transaksi final. Unique constraint Prisma tetap menjadi perlindungan akhir; `P2002` menjadi konflik terkontrol.
- Pembuatan User, Customer, Cart, Wishlist, role, AuditLog, dan consume challenge tetap atomik. Tidak ada User/session sebelum kode valid. HMAC terikat email + generation, reservation `sending:` tidak dapat diverifikasi, compare aman, maksimum lima percobaan, TTL 10 menit, cooldown 60 detik.
- Kuota lama dipertahankan: tiga request/resend per email per jam, 30 global per menit; tambahan kuota tiga per phone kanonis per jam menutup rotasi email/format nomor. Verify tetap 12 per email per jam dan kuota private generation; status dibatasi 60 per generation per jam/240 global per menit. Bucket menggunakan digest dan realm server, bukan identitas mentah atau nilai realm dari request.
- Pending yang expired dipertahankan paling lama jendela pemulihan 30 menit setelah expiry untuk resend. **Kode expired tetap tidak valid.** Retensi oportunistik ini dapat mencapai sekitar 40 menit sejak pengiriman; tidak mengirim email otomatis. Setelah jendela berakhir, pengguna mendaftar ulang.
- Status POST memerlukan pasangan email + UUID generation privat, memeriksa Origin pada REST, tidak mengembalikan password/hash/kode/attempts. Server Actions mempertahankan perlindungan Origin bawaan Next.js. Unknown generation tidak menghabiskan kuota verifikasi email milik korban.
- Login/logout/reset/JWT/revocation dan aturan transaksi bisnis tidak diubah. File cart browser hanya disesuaikan agar tidak menekan submit dua kali setelah autosubmit OTP.

## UI dan pemulihan

- Tombol **Daftar**, pesan konflik dengan link **Masuk** dan **Lupa password**, input form tidak hilang saat gagal.
- Enam slot visual pada satu native input: numeric, `autocomplete="one-time-code"`, selection, keyboard, backspace/delete, paste, native autofill, serta autosubmit sekali per kode lengkap. Tombol verifikasi tetap tersedia; paste lebih dari enam digit ditolak agar tidak menghabiskan attempt dari potongan kode.
- Border merah dan shake 360 ms hanya pada penolakan OTP server; hijau dan feedback keberhasilan hanya setelah server mengonfirmasi akun/sesi. Pending terkunci untuk mencegah double-submit. Network error tidak memalsukan state hijau atau mereset deadline.
- Countdown `MM:SS` menggunakan metadata waktu server, estimasi transit, dan elapsed monotonic. Reload memulihkan `{email, challengeId}` saja; password, kode, hash, dan deadline tidak disimpan dalam `sessionStorage`/`localStorage`.
- Challenge hilang/berganti atau konflik mengembalikan form yang valid. SMTP gagal menghapus reservation yang sesuai. Lost resend response meminta status server; status `sending` dipoll terbatas, lalu tersedia pemeriksaan manual.
- Autofill email bergantung browser/OS; tidak dijanjikan pada semua perangkat. Tidak ada pembacaan Gmail/notifikasi atau penyalahgunaan WebOTP SMS.
- Tampilan satu kolom, slot 56px, tap target 44px, focus/selection jelas, reduced motion, live feedback, dan tanpa overflow pada 320–1920px. Link Back Home, login, dan reset tetap berfungsi. Konten/status legal tidak diubah.

## Pengujian dan bukti

Verifikasi lokal yang benar-benar dijalankan sebelum commit:

| Gate | Hasil |
| --- | --- |
| Node.js 22, locked install, Prisma generate dan fresh deploy delapan migrasi pada disposable PostgreSQL | PASS |
| TypeScript, ESLint, production build | PASS |
| Unit | 263 PASS |
| Critical containment / security mitigation | 25 / 9 PASS |
| Registration OTP lifecycle PostgreSQL | 15 PASS |
| Konflik identitas, canonical phone quota, metadata, expiry recovery, provider race, RLS, stranded sending | 8 PASS |
| Auth/session/reset PostgreSQL | 12 PASS |
| Migration index fresh/upgrade/lock/partial failure/generic plan | 5 PASS (termasuk parent) |
| Migration OTP 6→7 dan release preflight dengan gate indeks | 1 + 8 PASS |
| Chromium auth/legal | 15 kelompok PASS, sembilan viewport 320/360/375/390/430/768/1024/1440/1920 |

Browser membuktikan penolakan REST email/phone/both sebelum email/pending, form validation, private challenge/Origin, keyboard/paste/native autofill, satu autosubmit, merah setelah penolakan, hijau setelah sukses, reduced motion, expiry, locked attempts, reload, resubmission, SMTP failure, respons resend sengaja diputus setelah backend memproses, pemulihan challenge terhapus, login/logout/reset/session revocation, legal dan link affordance. Error transport dari fault injection dicatat terpisah; unexpected console/page errors tetap membuat test gagal.

Workflow `test-containment.yml` dan `sprint-2e-isolated-regression.yml` wajib dijalankan pada HEAD PR final. Workflow kedua mempertahankan database entrypoint/preflight, migration lock/recovery, cart concurrency, product, checkout, payment/refund/shipping, browser product/operations, hydration replay, dan navigation **10×44**; menambahkan delapan kelompok konflik, drill indeks, dan gate preflight baru tanpa melewati gate lama. Hasil final yang terikat SHA, link Actions, dan status review dicantumkan di PR. Hasil source baseline tidak dipakai sebagai bukti source final.

Screenshot berasal dari browser lokal build production; data dummy dan digit OTP sengaja disamarkan. Screenshot menggambarkan validasi visual awal; hardening recovery/timing berikutnya mempertahankan geometri dan desainnya. Bukti browser yang terikat HEAD final tersedia pada artifact CI, dan screenshot ilustrasi ini tidak menggantikannya.

| Mobile register | OTP 320px |
| --- | --- |
| ![Register](screenshots/register-mobile.png) | ![OTP](screenshots/otp-mobile.png) |

![Penolakan OTP](screenshots/otp-error-mobile.png)

![Sukses setelah konfirmasi backend](screenshots/otp-success-desktop.png)

## Risiko residual dan deployment

- Penolakan awal yang diminta pemilik menciptakan oracle keberadaan identitas. Pesan gabungan, kuota email/phone/global, dan tidak adanya endpoint per-keystroke membatasi, tetapi **tidak menghapus** risiko enumeration. Jangan mengklaim respons ini sepenuhnya anonim. Monitor 409/429 secara agregat tanpa identitas/kode; edge anti-abuse dapat dievaluasi terpisah bila diperlukan.
- Estimasi waktu memakai midpoint jaringan; asimetri latency masih dapat menghasilkan selisih display. Expiry, cooldown, dan percobaan tetap diputuskan backend; deadline row database tidak berubah.
- Lookup legacy semula melakukan sequential scan. Benchmark dummy 100.000 identitas menunjukkan 692,193 ms sebelum dan 0,085 ms setelah expression index (hasil lokal, bukan kapasitas Production). Dua indeks non-unique kini disediakan migration tambahan yang hanya diuji pada disposable PostgreSQL; query plan generic wajib memakai keduanya. Lihat [readiness migrasi](MIGRATION_READINESS.md).
- Identitas yang baru diklaim ketika email provider sedang menerima request dapat tetap memperoleh email yang sudah terkirim. Email tidak bisa ditarik kembali; pemeriksaan setelah provider mencegah aktivasi challenge/akun duplikat. Test menahan provider dan membuktikan reservation dibersihkan.
- Migration indeks tambahan `20261019054922_registration_identity_lookup_indexes` diperlukan berdasarkan query plan/benchmark. Tidak ada perubahan dependency/lockfile. Migration OTP existing `20261018150000_registration_email_otp` tetap checksum SHA-256 `eec85ff983628830923da3c7b0760bfc20378bdcf9cb7376dd6b1cca539eb84e`. Jangan menjalankannya ulang di Production.
- `frontend/vercel.json` menonaktifkan Git deployment **branch fitur ini** untuk mencegah Preview PR menyentuh resource bersama. Tidak mengubah project settings/secret/alias Production. Operator tetap perlu memastikan deployment hooks/manual promotion tidak dijalankan tanpa izin.
- Utamakan roll-forward. Rollback-compatible source wajib tetap menyertakan migration kedelapan dan preflight yang memahaminya; jangan menghapus history/ledger. Baseline OTP-compatible `12f7a45` hanya referensi perilaku aplikasi lama, dengan konsekuensi bug duplicate/timer kembali, dan perlu branch rollback yang mempertahankan migration baru. Jangan kembali ke versi sebelum session revocation/OTP atau drop/reset schema/data.
- Migration indeks Production, merge, dan deployment menunggu persetujuan pemilik; urutan wajib database-first setelah review readiness indeks. Pengiriman Resend dan native autofill pada perangkat nyata belum diuji di Production; automated test menggunakan mock/loopback tanpa email nyata. Tidak ada migrasi, backup, invalidasi sesi, atau smoke test finansial Production dalam scope ini.

Alternatif magic link dievaluasi dan sengaja dipisahkan: lihat [rencana keamanan](MAGIC_LINK_PLAN.md).
