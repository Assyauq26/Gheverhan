# R19 — Keamanan dan blocker tersisa

Status keseluruhan **NOT READY untuk production**. Perbaikan source aman diintegrasikan
di [PR #61](https://github.com/Assyauq26/Gheverhan/pull/61); tidak ada migrasi Supabase,
merge main, deployment production, perubahan provider security, rotasi key atau rewrite history.

## Dependency — R19-SEC-01, Critical

Lockfile sebelum perubahan: **2 Critical / 9 High / 7 Moderate, 18 package entries**.
Sesudah Next/eslint-config-next 15.5.28, PostCSS 8.5.23, tsx 4.23.15, Vitest 2.1.9:
**2 Critical / 8 High / 5 Moderate, 15 entries**. Audit production-only berubah dari
0 Critical / 6 High / 3 Moderate menjadi **0 Critical / 5 High / 2 Moderate**.
PostCSS di semua rantai memakai override same-major `$postcss`; runtime React bundled
15.5.28 identik dengan 15.5.26 sehingga checksum kedua backport tetap terverifikasi.

Per-advisory package/version/patched/direct-transitive/source/reachability/impact/fix/validation:
[evidence/r19/DEPENDENCY_ADVISORIES.md](evidence/r19/DEPENDENCY_ADVISORIES.md) dan
[JSON rinci](evidence/r19/dependency-findings.json). Cutoff patch dibandingkan metadata
resmi GitHub Advisory, termasuk advisory tanpa patched release (braces).
Vitest 2.1.9 menutup advisory tertentu, **tidak menutup seluruh Critical**.
Major Vitest/Tinypool/Tailwind/ESLint dan rantai Vite membutuhkan review kompatibilitas.
API/UI/debugger tooling dimatikan; 199 unit +25 containment benar-benar offline,
read-only, tanpa network/credential host. Containment tidak menghapus advisory.
Build/CSS/lint browser tidak menemukan endpoint input glob/CSS pengguna; exposure
build tooling tetap dicatat dan dependency tidak dipindah kategori untuk mengubah angka.

## Temuan auth, cron, dan runtime database

| ID / severity | Source / reproduksi aman | Expected vs actual / akar | Fix / regresi / hasil | Risiko dan blocker |
| --- | --- | --- | --- | --- |
| R19-SEC-02 High | `auth.service.ts:requestPasswordReset`, `password-reset-email.ts`; mock mail + DB disposable | Sebelumnya bearer plaintext/log dan sukses semu tanpa delivery. Kini digest SHA256, mail fail-closed, penghapusan token bila delivery gagal, consume atomik. | Source #37 `fc738f5` diintegrasikan melalui merge `6d147a7`; `auth-security.test.ts`, `password-reset-email.test.ts` PASS. | Pemilik perlu konfigurasi provider/from/base URL per environment; existing plaintext rows/log lama perlu assessment/retention. Tautan reset format lama tidak diterima source baru. Tidak mengirim email nyata. |
| R19-SEC-03 High | `auth/session.ts`, `auth/session-state.ts`, `auth/jwt.ts`, `auth.service.ts:resetPassword`; replay fixture JWT hanya di memori | Sebelumnya logout hanya hapus cookie dan reset tidak mencabut JWT. Kini jti acak + hashed revocation per sesi; sessionVersion naik atomik saat reset. Semua identity query memeriksa active/version/revocation. | `b93654e`; PG replay logout/reset + legacy token + inactive PASS; `session-lifecycle.test.ts` mencakup DB gagal dan race reset/login. | Migrasi/role server wajib disetujui sebelum rollout; request yang sudah diotorisasi sebelum revocation tidak dibatalkan. JWT preview/prod wajib memakai key berbeda; binding efektif belum dapat diverifikasi. |
| R19-SEC-06 High | `auth/rate-limit.ts`, service login/register/reset/resetConfirm; 24 koneksi paralel | Sebelumnya tanpa limiter durable. Counter INSERT ON CONFLICT bersyarat menerima tepat 10/24, sisanya 429; generic response, hash identity dan bucket global. | `b93654e`; `auth-security.test.ts` concurrency dan unknown-login enforcement PASS. | Fixed-window: burst pada batas window masih mungkin; bukan WAF/per-IP atau jaminan anti-bot. Global quota berdampak availability dan perlu review traffic pemilik. DB gagal fail-closed; cleanup expiry berindeks. |
| R19-SEC-04 High | `orders.service.ts:expireStaleOrders/transitionOrder`, `expiry-policy.ts`, cron route; order fixture | Baseline bisa melepas stok proof-under-review. Source #38 memeriksa ulang status di bawah row lock, batch 50 ordered, stock/voucher lifecycle idempotent; WAITING_VERIFICATION dipertahankan dan proof tepat waktu dapat direview terlambat. | Source #38 `134c6f9`, merge `1bffcd5`; PostgreSQL transaksi/expiry + operations browser PASS, unit auth cron PASS. DB error tidak ditelan; hanya konflik 409 yang diabaikan. | `CRON_SECRET`, aktivasi jadwal, kapasitas batch harian dan rekonsiliasi backlog memerlukan pemilik. Tidak memanggil cron produksi. |
| R19-SEC-05 High exposure assessment | Metadata `git ls-tree` `.postgres`: 1.481 path, 67.327.374 bytes | Snapshot fisik dapat memuat data/credential; isi tidak dibaca. Kebocoran nilai credential nyata **belum dibuktikan**. | Assessment metadata selesai; PR #39 tetap HOLD. | Incident/exposure review, untracking, retention/history/rotasi merupakan keputusan pemilik. Tidak mengklaim aman hanya karena nilai belum dibaca. |

JWT tetap HS256 + issuer/audience #42, dengan validasi tipe sub/email/exp/version/jti.
Legacy JWT tanpa version diterima pada version nol, lalu dapat dicabut berdasarkan digest
bearer verified; tidak ada bearer yang disimpan/log. Sesi baru hanya dibuat jika version
yang diautentikasi belum berubah, mencegah race password reset dengan login lama.

Migrasi `20261017000000_auth_session_controls` menambah User.sessionVersion dan dua
tabel keamanan, masing-masing dengan indeks expiry dan RLS tanpa public policies.
Tes role NOLOGIN dengan explicit SELECT/INSERT grants tetap mendapat nol baris dan
penolakan write. Ini memverifikasi default-deny RLS; tidak mengubah kebijakan tabel lama
atau memberi grant anon/authenticated. Trusted server role/ownership efektif harus direview
saat rollout; source memerlukan migrasi terlebih dahulu. Hanya loopback disposable diuji.

Panduan Supabase dan Postgres dibaca; changelog terkini dan dokumentasi RLS diambil
melalui HTTPS. Tidak memakai Supabase CLI untuk mengganti workflow migrasi Prisma repo,
tidak memodifikasi cipher/extension/role pada project bersama, dan tidak menonaktifkan TLS.


## Integrasi perubahan main yang baru terdeteksi

Recheck sebelum gate akhir menemukan PR #59 sudah masuk main (`8e2a4f4`), sedangkan
baseline awal R19 adalah `4f141dd`. R19 tidak menulis main. Source dashboard/nav/tests
#59 dipertahankan melalui normal merge ke branch fix; konflik workflow diselesaikan
dengan mempertahankan loop10, JSON gagal, dan screenshot dashboard sintetis #59.
Skenario baru dijalankan pada empat viewport: final **44 checkpoint/run**, 11/viewport.
Assertion KPI pada viewport tambahan 768/1024 mengikuti grid dua kolom sampai breakpoint
xl1280; assertion asli 390 dan1360 tetap sama. Tidak mengurangi assertion asli mana pun.
Gate awal `8fe5029` dihentikan karena basis berubah; hasilnya tidak digabung ke gate final.
Hasil lint/type/build dan regresi source gabungan #59 harus diverifikasi ulang sebelum
klaim final. SHA akhir dan hasil berada pada deskripsi/check PR #61.
