# Opsi terpisah: verifikasi registrasi melalui magic link

Status: **tidak diimplementasikan pada PR perbaikan OTP ini**. Tidak ada perubahan Production. Enam digit OTP tetap menjadi satu-satunya bukti registrasi pada source ini.

Schema saat ini hanya menyediakan hash HMAC kode enam digit pada `PendingRegistration.codeHash`, generation, dan expiry. Menggunakan ulang field tersebut untuk random token akan merusak verifikasi OTP atau menggabungkan dua tipe bukti tanpa aturan consume yang jelas. Token stateless/JWT saja juga tidak cukup untuk single-use/revocation dan binding browser yang aman. Penambahan yang layak memerlukan additive schema/contract dan review terpisah.

Rancangan PR lanjutan:

1. Random token minimal 32 byte kriptografis; simpan hanya digest token, generation binding, expiry, serta digest nonce browser pemulai pada storage server. Rancang additive Prisma migration resmi, dry-run fresh/upgrade/lock/rollback pada disposable PostgreSQL; jangan menjalankan Production migration tanpa persetujuan.
2. OTP dan magic link terikat pending registration yang sama. Resend/replacement menginvalidasi keduanya. Satu transaksi row lock memeriksa expiry, availability identitas, browser binding, dan consume; membuat relasi akun/audit atomik. Bukti kedua tidak dapat dipakai ulang setelah bukti pertama sukses.
3. **GET tidak membuat akun atau sesi dan tidak mengonsumsi token.** GET hanya halaman konfirmasi bebas third-party analytics/prefetch, `no-store`, `Referrer-Policy: no-referrer`. Token dapat ditempatkan pada fragment agar tidak masuk access log; client hanya mengirimnya melalui explicit POST dengan Origin/CSRF guard, lalu membersihkan URL/history. Tidak mencatat token/OTP/password pada telemetry.
4. Email scanner tidak boleh menyelesaikan pendaftaran. Tombol konfirmasi eksplisit dan pemeriksaan konteks browser wajib; scanner atau GET berulang harus inert.
5. Cegah account pre-hijacking: attacker dapat memulai pendaftaran memakai email korban dan password pilihan attacker. Pemilik email yang membuka link pada browser berbeda tidak boleh tanpa sadar mengaktifkan password tersebut. Wajib original-browser nonce HttpOnly/secure/SameSite binding; bila tidak cocok, arahkan melanjutkan melalui OTP pada browser pemulai atau kebijakan password confirmation yang direview. Jangan menganggap kepemilikan email saja cukup untuk mengesahkan password dari challenge asing.
6. Tambahkan kuota, deadline/cooldown server, error generik, fail-closed provider, no session sebelum consume; uji concurrent OTP-vs-link, replay, replacement, scanner, token bocor, cross-browser, DB/provider failure, dan session creation.
7. Pertahankan fallback OTP lintas aplikasi email/perangkat. Dokumentasikan batas native autofill; jangan mengakses inbox atau memanggil WebOTP untuk email.

Persetujuan yang dibutuhkan pada phase berikutnya: keputusan produk tentang browser binding/cross-device, review keamanan, additive schema dan database-first rollout, serta izin spesifik Production migration/deployment. Tidak ada kebutuhan untuk menunda perbaikan duplicate dan UI OTP saat ini.
