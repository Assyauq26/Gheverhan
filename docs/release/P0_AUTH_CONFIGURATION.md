# P0 — konfigurasi autentikasi untuk handoff operasional

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
