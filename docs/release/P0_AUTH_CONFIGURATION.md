# P0 — email OTP untuk handoff autentikasi operasional

**Keputusan terbaru:** alur utama memakai email OTP melalui Resend. OIDC bukan syarat MVP, tidak aktif secara default, dan hanya dipertahankan untuk kompatibilitas konfigurasi lama yang memilih `authMode: "oidc"` secara eksplisit. Bagian OIDC historis di bawah tidak mengubah keputusan ini.

Tidak ada credential/email production, DNS, VPS atau data toko yang diakses oleh implementasi ini. Provider production belum diverifikasi workstream coding. Nilai secret tidak boleh ditulis di chat, PR, repository atau URL.

## Konfigurasi mode email (default)

Config runtime privat memiliki `authMode: "email_otp"` (atau tidak diisi), `controlOrigin`, `databaseUrlFile`, `signingKeyFile`, dan `emailAuth` dengan hanya:

| Field emailAuth | Kebutuhan |
|---|---|
| resendApiKeyFile | Path berkas lokal privat berisi Resend API key untuk sender yang sudah diverifikasi operator |
| otpPepperFile | Path berkas lokal privat berisi 32 byte random dalam hex 64 karakter; berbeda dari key agent/session dan tidak dibagikan ke toko |
| from | Sender terverifikasi, contoh display-name Buat Toko Online Sendiri, tanpa mengubah DNS pengiriman otomatis |
| sessionSigningKeyFile | Path private key Ed25519 khusus sesi platform, berbeda dari agent signing key |

Semua berkas config/secret harus regular file privat 0600, bukan symlink, owned service user/root. Pembacaan descriptor dibatasi 64 KiB. JSON tidak menerima API key/pepper inline atau URL sink/provider alternatif. Adapter production selalu POST ke `https://api.resend.com/emails`, HTTPS normal, redirect ditolak, timeout 10 detik. Bila konfigurasi tidak tersedia, auth status false dan tidak ada fallback dummy/OIDC otomatis.

`POST /auth/email/start` menerima `{mode:"register",name,email,store_name}` untuk daftar; returning login `{mode:"login",email}`. Kedua mode menghasilkan response generik `{status:"OTP_SENT",challenge_id,expires_in:600,resend_after:60}` bila provider menerima pengiriman, tanpa membocorkan apakah akun sudah ada. Nama toko disimpan sebagai profil, bukan membuat instalasi/DB toko secara otomatis. Semua POST mensyaratkan Origin exact.

`POST /auth/email/verify` menerima `{challenge_id,code}` dan cookie preauth `__Host-js_email_flow`. Kode enam digit berasal dari crypto RNG, disimpan sebagai HMAC SHA256 dengan pepper privat dan bound ke UUID challenge. Batas 10 menit, 5 percobaan, resend minimal 60 detik, dan rate-limit IP/email di PostgreSQL. Konsumsi atomik/challenge row lock mencegah replay/concurrent account creation. Verifikasi sukses langsung menghasilkan sesi `__Host-js_portal_session` Secure/HttpOnly/SameSite=Lax dan `{status:"AUTHENTICATED"}`; frontend mengambil CSRF/session lalu masuk wizard, tanpa login kedua.

Returning email yang sudah terverifikasi memperoleh seller UUID dan instalasi yang sama. Login pada email yang belum memiliki profil tetap menerima email generik; sesudah pemilik membuktikan email, server mengembalikan `PROFILE_REQUIRED` agar pendaftaran dilengkapi. Tidak ada enumerasi akun sebelum email dibuktikan. Akun OIDC tidak digabung otomatis berdasarkan email.

`GET /api/installer/v1/session` menampilkan profile `{name,store_name}` hanya kepada sesi pemilik yang sah. Logout tetap POST dengan CSRF/Origin, mencabut sesi di DB dan menghapus cookie. Unpair device membutuhkan `authenticated_at` dari DB dalam 5 menit terakhir; OTP baru memberi sesi fresh. Endpoint email-change/transfer tidak diaktifkan. Migrasi tidak menjadikan sesi lama seolah baru diautentikasi.

`GET /auth/status` mode email menampilkan `method:"email_otp"`, configured boolean, `registration_url:"/daftar"`/`login_url:"/masuk"` hanya bila konfigurasi siap. Read-only CORS hanya untuk origin landing resmi, tanpa credentials. UI tidak boleh mengklaim email production berfungsi hanya dari keberadaan config.

## Pengujian dan batas bukti

Migrasi additive `003_email_auth.sql` hanya untuk control PostgreSQL yang terpisah. Unit menguji fail-closed, config, Origin, dan penolakan delivery double di luar fixture. Integrasi memanggil adapter HTTP Resend dengan server HTTPS loopback dan CA yang dipercaya eksplisit; OTP ditangkap hanya dalam memory, lalu dipakai untuk uji PostgreSQL/JOSE/session, brute-force, expiry, replay, concurrency, returning identity, CSRF/logout, unpair reauth dan provider outage. Override transport hanya dapat dipakai bila database exact loopback `/js_control_fixture` dan `JETSELLER_CONTROL_TEST_CONFIRM=isolated-control-fixture`; runtime production tidak menerima sink URL atau transport custom.

Pengujian ini tidak mengirim email Resend nyata dan bukan bukti deliverability production. Operator/ChatGPT harus memverifikasi sender/key, pengiriman mailbox nyata, callback halaman portal, serta approval deployment secara terpisah. Hapus challenge kedaluwarsa sesuai retention operasional yang disetujui; jangan menghapus audit/DB merchant.

## Referensi OIDC kompatibilitas (bukan kebutuhan P0)


Ini adalah kontrak kode, bukan konfigurasi yang telah dipasang. Provider production belum diverifikasi oleh workstream coding ini. Tidak ada akun, endpoint production, DNS, credential atau VPS yang diubah.

Gunakan komponen existing `platform/installer/src/runtime.mjs` dan `oidc.mjs`. Lokasi berkas runtime diberikan melalui identifier kompatibilitas `JETSELLER_CONTROL_CONFIG_FILE`. Berkas config dan seluruh berkas secret lokal harus berupa regular file privat 0600, bukan symlink. Control PostgreSQL harus terpisah dari database toko; identitas database masih memakai allowlist kompatibilitas `jetseller_control...` atau `js_control_...`.

## Kontrak OIDC

| Field dalam `oidc` | Kebutuhan |
|---|---|
| issuer | HTTPS issuer exact yang diverifikasi pemilik proyek |
| clientId | ID client yang didaftarkan untuk portal ini, maksimal 200 karakter |
| authorizationEndpoint | HTTPS endpoint authorization provider, origin sama dengan issuer; tanpa query/fragment/credential |
| registrationEndpoint | Opsional; endpoint registrasi provider yang benar-benar mendukung Authorization Code + PKCE. Origin sama dengan issuer dan tanpa query/fragment/credential. Jika tidak disediakan, `/auth/register` tetap 503 dan status publik tidak menampilkan tautan signup |
| tokenEndpoint | HTTPS endpoint pertukaran code, origin sama dengan issuer; redirect HTTP ditolak |
| tokenEndpointAuthMethod | `none`/tidak diisi untuk public PKCE client; atau `client_secret_basic` untuk confidential client yang sudah disetujui |
| clientSecretFile | Hanya untuk `client_secret_basic`; path lokal berkas privat. Jangan mengisi nilai secret dalam JSON, chat, PR, URL atau log |
| redirectUri | Exact `https://dashboard.buattokosendiri.web.id/auth/callback` saat production diaktifkan |
| jwksFile | Path lokal JWKS public provider yang diverifikasi dan dipin; tidak boleh berisi private/symmetric key |
| sessionSigningKeyFile | Private key Ed25519 lokal khusus sesi portal, wajib berbeda dari agent signing key |

Config runtime tingkat atas tetap membutuhkan `controlOrigin`, `databaseUrlFile`, `signingKeyFile`, dan opsional `port` (default 3100). Jangan mengaktifkan `sessionIssuer` alternatif bersamaan dengan `oidc`. Tidak ada discovery/JWKS refresh otomatis: rotasi public key provider memerlukan penggantian berkas yang diverifikasi melalui jalur operasional, kemudian validasi/restart yang disetujui.

ID token wajib mempunyai issuer, audience/client ID, subject, iat, exp dan nonce sah, tanda tangan asymmetric valid, **email string serta email_verified boolean true**. Akun control-plane dikunci oleh hash issuer+subject, bukan oleh email; signup dan login subject yang sama tidak membuat akun kedua dan perubahan email tidak memindahkan kepemilikan toko. Email tidak disalin ke token sesi portal atau database seller pusat oleh adapter ini.

Registrasi dan verifikasi email berlangsung pada provider. Portal tidak membuat password/email-OTP lokal kedua dan tidak menyediakan fallback akun dummy. State, nonce, cookie login dan PKCE verifier unik per percobaan, disimpan dalam PostgreSQL; callback dikonsumsi atomik sebelum pertukaran token. Kegagalan harus memulai login baru.

## Endpoint aplikasi

- `GET /auth/status`: status publik tanpa secret, dengan `configured`, `login_url`, `registration_url`, `logout_url`, dan `logout_scope`. Read-only CORS hanya mengizinkan origin landing `https://buattokosendiri.web.id`; tidak ada `Access-Control-Allow-Credentials`. Endpoint auth/API lain tidak diberi CORS.
- `GET /auth/login`: mulai Authorization Code + PKCE; tidak menerima query `redirect` dari caller.
- `GET /auth/register`: mulai alur yang sama menuju registrationEndpoint yang dikonfigurasi; tetap tidak tersedia bila provider belum siap.
- `POST /api/installer/v1/session/logout`: wajib cookie sesi sah, Origin exact dan CSRF header. Mencabut sesi server dan menghapus cookie `__Host-js_portal_session` (Secure/HttpOnly/SameSite=Lax). Cookie lama yang diputar ulang ditolak setelah logout.

Logout ini **hanya sesi portal lokal**. Tidak mengklaim menutup SSO di identity provider; RP-initiated/provider logout belum diaktifkan. Sebelum mengaktifkan provider production, operator harus menentukan kebutuhan logout SSO dan kebijakan usia sesi/step-up. Link logout provider tidak boleh menerima arbitrary return URL atau menampilkan ID token di log.

## Bukti dan gate

Unit test menguji registration capability, parameter PKCE/state/nonce, konfigurasi endpoint/credential yang ditolak, dan CORS yang terbatas. Test integrasi existing PostgreSQL ditambah signup/login identity consistency, klaim email yang hilang/tidak terverifikasi, session revocation/cookie clearing, serta confidential PKCE exchange dengan Basic authentication. Provider dalam automated test tetap sintetis dan tidak membuktikan pendaftaran/email/SSO production telah bekerja. Exact final HEAD dan hasil CI digabungkan oleh workstream utama dalam `P0_CHATGPT_HANDOFF.md`.

Referensi implementasi: [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html), [PKCE RFC 7636](https://www.rfc-editor.org/rfc/rfc7636). Parameter registrationEndpoint adalah kapabilitas provider yang dikonfigurasi, bukan klaim bahwa OIDC menyediakan endpoint registrasi pengguna universal.
