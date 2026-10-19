# Registrasi OTP email — review lanjutan PR #70

Baseline PR #70: `ebb1fff74890c0775e41c6772f2bd32004613b95`. Main saat recovery: `3897169` (PR #69), termasuk hasil #65/#68. Branch tetap `feat/registration-email-otp-and-storefront-links`, tanpa rewrite history/merge/deploy. WIP worktree lama tidak disentuh.

## Gap dan perbaikan

| Temuan baseline | Perbaikan dan bukti |
|---|---|
| Dua request bersamaan lolos pemeriksaan cooldown lalu saling menimpa upsert | Reservasi awal memakai unique email/CAS untuk row lama. Regresi terhadap service baseline menghasilkan dua sukses; kandidat harus tepat satu. |
| Hash OTP langsung aktif sebelum respons provider; kode dapat dipakai walau email akhirnya gagal | Reservasi acak `sending:...` tidak dapat diverifikasi. HMAC diaktifkan dengan CAS hanya sesudah delivery sukses. Regresi baseline menunjukkan verifikasi diterima saat delivery masih tertahan; kandidat menolaknya untuk request dan resend. |
| OTP hanya terikat email, sehingga request pengganti dapat memverifikasi password/data berbeda pada layar lama | Challenge UUID acak per pendaftaran, dirotasi ketika data diganti dan ikut dalam HMAC. Verify/resend form/API wajib membawa challenge asal. Reproduksi terhadap5ffac3d berhasil membuat akun ber-password pengganti; regresi kandidat menolak kode terbaru pada challenge lama. |
| Snapshot kredensial dibaca sebelum transaksi verifikasi | `SELECT ... FOR UPDATE`, cek expiry/attempts setelah memperoleh lock, konsumsi pending + User/customer/cart/wishlist/audit dalam satu transaksi pendek. Tidak menahan transaksi ketika hashing/password atau mengirim email. |
| Kontrak validasi API/form terpisah | `registration-schema.ts` dipakai service, Server Actions dan ketiga endpoint registrasi; terms boolean eksplisit, phone/confirmation wajib, email ternormalisasi. Password baru dibatasi 72 byte agar tidak terpotong diam-diam oleh bcrypt; password akun lama tidak diubah. |
| Nomor baru disimpan +62, login sebelumnya mencocokkan format persis | Pertahankan prioritas pencocokan akun lama, lalu fallback nomor ternormalisasi. Semua alias format memakai kuota login yang sama; 10 percobaan salah dengan variasi spasi tetap mengunci format +62. |
| Persetujuan/input dapat hilang ketika Server Action mereset form | State checkbox terkontrol + listener native reset pada form registrasi, dengan cleanup. Listener diperlukan karena delegated reset React dapat diabaikan saat action pending. Regresi browser mempertahankan consent dan nilai setelah error server; tidak mengaktifkan consent otomatis. |
| Resend tanpa penjelasan jeda di UI | Countdown/disabled berdasarkan deadline dari server, pending/feedback aksesibel; server tetap otoritatif. OTP autofocus, input numeric/one-time-code, error live region dan tautan ubah data mereset form secara eksplisit. |
| Aturan underline legal bertumpuk dan beberapa kontrol storefront masih berkelas underline | Hapus aturan lama, state hover/focus/active scoped auth/legal/storefront. Tombol link berlatar gelap tetap putih dengan perubahan background agar kontras terjaga. |
| Preflight hanya menghitung indeks pending | Validasi kolom wajib, nullable emailVerifiedAt, primary/unique/expiry index yang benar, RLS dan CRUD trusted role. Regresi salah target indeks dengan jumlah tetap sama harus BLOCKED. |

## Kontrak dan kontrol

- Request registrasi REST mengembalikan202 + verificationRequired + challengeId, tanpa User atau cookie session. Form berpindah ke langkah OTP. Verifikasi yang sukses membuat User dan `emailVerifiedAt`, baru kemudian membuat session. Replay ditolak di form maupun API.
- OTP 6 angka, TTL 10 menit, maksimum 5 percobaan pada challenge, resend minimal 60 detik. Register+resend berbagi batas 3/identity/jam dan 30 global/menit; konfirmasi 12/identity/jam dan 240 global/menit sesuai kebijakan branch awal. Counter salah tetap commit meskipun respons ditolak. Guard challenge memiliki kuota tersendiri; ID yang tidak dikenal ditolak sebelum menyentuh kuota email, sehingga tidak dapat mengunci challenge pengguna hanya dengan mengetahui email.
- OTP disimpan sebagai HMAC-SHA256 dengan domain register, email, challenge UUID dan JWT_SECRET; password sebagai bcrypt. Tidak mengirim kode/hash/password kembali lewat API/action atau artifact. Marker pengiriman berisi nonce, bukan OTP. Gagal kirim menghapus hanya reservasi yang cocok; marker yang belum diaktifkan tetap tidak bisa diverifikasi bila cleanup/database gagal.
- Endpoint baru memakai assertMutationOrigin. Browser lintas Origin ditolak; klien non-browser tanpa Origin tetap mengikuti helper yang sudah ada.
- Akun lama dengan phone/emailVerifiedAt null tetap dapat login. Tidak ada perubahan JWT/sessionVersion/revocation, logout, reset-password, RBAC, order/payment/stok.
- Email OTP membuktikan akses inbox saat registrasi, bukan identitas hukum atau kepemilikan nomor HP. Nomor HP belum diverifikasi untuk WhatsApp. Google/WhatsApp tetap nonaktif.

## Migration dan readiness

Migration: `20261018150000_registration_email_otp` (ketujuh). Menambah nullable `User.emailVerifiedAt` serta `PendingRegistration` (unique email, expiry index, primary key dan RLS tanpa policy publik). PendingRegistration.id memakai UUID dari aplikasi/Prisma (kolom SQL tetap TEXT, tidak perlu migration kedelapan). Tidak backfill verified timestamp atau mewajibkan phone bagi akun lama; pending tidak memiliki FK ke User karena akun belum ada.

Migration baru di PR ini diberi BEGIN/COMMIT, lock_timeout 5s dan statement_timeout 30s. Penambahan nullable column bersifat metadata, tetapi ALTER TABLE tetap memerlukan lock eksklusif singkat. Seluruh SQL harus diterapkan oleh operator terpercaya sebelum source OTP aktif. Preflight memeriksa ledger/checksum, kolom/index dan hak CRUD/RLS; tidak menjalankan migrasi otomatis saat startup.

Checksum baseline: `9f975e05b31506f76e7e669d82b68111b1f7a118964ce271c446f7c32ef7ca62`.
Checksum kandidat: `eec85ff983628830923da3c7b0760bfc20378bdcf9cb7376dd6b1cca539eb84e`.

**Perubahan checksum hanya untuk migration baru dalam Draft PR ini.** Sebelum release, pastikan versi awal belum diaplikasikan pada database target/shared. Jika sudah, hentikan cutover dan review rekonsiliasi migration; jangan menimpa ledger atau checksum history. Tidak memeriksa/mengubah database production dalam pekerjaan ini.

Drill PostgreSQL17 disposable: fresh 7 migrations; upgrade6→7 mempertahankan akun legacy (phone/timestamp null); tahan lock User sehingga migration gagal pada batas 5s; seluruh DDL rollback; tandai kegagalan lokal sebagai rolled-back sesudah membuktikan rollback; deploy ulang dan retry no-op menghasilkan 7 migration aktif. Prisma 5 dapat menutupi pesan lock timeout dengan pesan transaksi aborted saat mencoba menulis kegagalan; periksa kondisi skema/ledger dan log PostgreSQL, bukan hanya pesan CLI. Pending dari prototype tanpa challenge binding harus memulai ulang pendaftaran; tidak mengubah atau mencabut sesi akun lama. Resolve pada production memerlukan keputusan operator dan izin khusus, bukan langkah otomatis.

Rollback aplikasi ke alur registrasi lama akan membuka registrasi tanpa OTP; jangan melakukannya sebagai fallback diam-diam. Utamakan maintenance tertutup dan roll-forward yang tetap menghormati revocation serta kebijakan OTP. Tidak drop tabel/kolom atau mengubah data live.

## Konfigurasi

Gunakan JWT_SECRET yang valid, RESEND_API_KEY dan sender PASSWORD_RESET_FROM yang sudah diverifikasi. OTP memakai sender existing; tidak menambah credential atau provider palsu. Tidak ada email nyata pada pengujian. REGISTRATION_OTP_TEST_SINK hanya diizinkan pada GHEVERHAN_ISOLATED_TESTS=1, database loopback bernama gheverhan_sprint1_test dan bukan Vercel; unit menolak hosted/remote override. Branch ini ditandai deploymentEnabled=false di source Vercel. Tidak mengubah environment/provider live.

Kesiapan sender production, identitas database, role efektif dan penerapan migration wajib ditinjau sebelum merge/cutover. Keberhasilan mock/sink tidak membuktikan deliverability inbox production.

## Validasi

Node.js 22.22.0, PostgreSQL 17.11 disposable sendiri, Chromium 153.0.8010.12; tidak menggunakan data/credential production. Unit memakai container network-none/read-only/uid1000/cap-drop dan batas resource. Suite lifecycle OTP membuat database lokal unik sendiri agar counter global nyata tidak tercampur dengan suite browser; tidak menghapus atau menaikkan batas rate limit aplikasi.

- 243 unit, 25 containment, 9 mitigation PASS.
- 12 auth/security PostgreSQL, 13 OTP/phone security, 7 preflight dan 1 migration recovery PASS.
- 11 kelompok browser PASS: REST tidak bypass OTP, required phone/confirmation/terms client+server, state form saat error, OTP salah/expired/replay dan penolakan challenge lama/asing/hilang, resend API sukses/cooldown form, email gagal, session hanya sesudah OTP, duplicate email, login email/nomor lokal, logout, reset/revocation, legal/footer, link hover/focus/active serta CTA contrast.
- 8 viewport 360×800,375×812,390×844,430×932,768×1024,1024×768,1440×900,1920×1080 untuk login/register dan OTP; tidak ada horizontal overflow atau console/page error. Kembali ke Beranda visible dan target 44px. Link legal tetap membuka tab terpisah tanpa implicit consent.
- TypeScript, ESLint dan production build PASS sebelum freeze; verifikasi diulang pada HEAD final/CI. Hasil final per SHA dan tautan kedua workflow dicatat di PR agar tidak mengklaim hasil SHA lama sebagai bukti source baru. SHA5ffac3d bukan final: source dibekukan ulang setelah perbaikan challenge binding.
- CI mempertahankan seluruh gate product/cart, operations/payment, PostgreSQL, hydration dan navigasi 10×44; menambah lifecycle OTP dan migration recovery. Test gagal tidak dihapus/dilewati.

RCA pengujian: validasi form menemukan reset consent native yang harus dibatalkan lewat listener native (synthetic handler saja tidak cukup pada runtime saat ini). Pemeriksaan hover semula membaca warna awal transisi; kini menunggu warna target, tanpa mengubah ekspektasi. Drift fixture telepon antarrun dihindari dengan nomor dummy acak, bukan menghapus data shared. Pemeriksaan lock tidak bergantung pada pesan Prisma yang menutupi error awal, tetapi juga deadline, rollback dan retry.

## Bukti UI

| Halaman | Mobile 390 | Desktop 1440 |
|---|---|---|
| Register | [Screenshot](register-390.png) | [Screenshot](register-1440.png) |
| OTP | [Screenshot](registration-otp-390.png) | [Screenshot](registration-otp-1440.png) |
| Storefront/footer | [Screenshot](storefront-links-390.png) | [Screenshot](storefront-links-1440.png) |

Referensi foto pemilik digunakan untuk posisi Kembali ke Beranda dan konsistensi layout. Phone wajib, confirmation serta tahap OTP sengaja menambah elemen dari foto lama. Tidak mengklaim persentase pixel fidelity tanpa baseline sebanding. Screenshot berisi data dummy; kode OTP/cookie/token tidak disimpan sebagai artifact.

## File utama

- Service/actions/schema/helper: frontend/src/modules/auth/.
- API: frontend/src/app/api/v1/auth/register/ dan verify/resend.
- UI: frontend/src/components/auth/auth-forms.tsx, auth.css, frontend/src/app/(auth)/layout.tsx.
- Link: globals.css scoped storefront, components/storefront/checkout-client.tsx dan purchase-panel.tsx, components/legal/legal.css.
- Schema/migration: frontend/prisma/schema.prisma dan migration ketujuh di atas; scripts/release/preflight.ts.
- Test: registration-otp.test.ts (unit+integration), registration-migration.test.ts, auth-ui-browser.ts, auth-ui.test.ts, release-preflight.test.ts; workflow sprint-2e-isolated-regression.yml.

Status: siap ditinjau sebagai source setelah kedua CI final PASS; **tetap Draft, belum diizinkan merge/deploy**. Review migrasi/checksum, trusted role dan sender email production merupakan prasyarat operasional. Editor admin legal dan OAuth tetap di luar scope ini.


## Final review lanjutan

Review terhadap kandidat2740e7f menemukan respons konflik email/phone yang dapat dipakai untuk account enumeration sebelum inbox diverifikasi (Medium). Pemeriksaan tersebut kini ditunda sampai OTP valid; request untuk kontak baru maupun existing mengikuti reservasi, pengiriman, cooldown dan respons challenge yang sama. Konflik unique index dikembalikan sebagai pesan umum sesudah proof, tanpa mengidentifikasi field. Tidak pernah menimpa akun existing. Pemilik inbox masih bisa mengetahui bahwa data registrasinya berbenturan setelah proof; ini feedback penyelesaian, bukan klaim nomor HP sudah diverifikasi. Kuota email/global tetap berlaku terhadap pengiriman untuk alamat existing.

Regresi tambahan membuktikan dua email yang memakai phone sama hanya menghasilkan satu akun/customer/cart/wishlist/audit ketika verifikasi paralel; kegagalan insert audit menggulung balik User, Customer, Cart, Wishlist, UserRole serta konsumsi pending. Sesudah penyebab gagal dilepas pada database dummy, OTP yang sama dapat menyelesaikan transaksi sekali. Suite OTP menjadi15 kasus, total integration120; hasil pada SHA final dicatat di PR sesudah CI selesai.

Lihat [gate Production dan urutan cutover](FINAL_REVIEW_AND_RELEASE_GATE.md). PR tetap Draft selama identity/role aplikasi, backup/recovery, email dan approval migration belum terbukti.
