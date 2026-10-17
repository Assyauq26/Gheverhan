# R21 — Security hardening

Status: **READY FOR SOURCE REVIEW**, release **NOT READY**. Severity resmi tidak diubah. Baseline 0 Critical / 7 High / 2 Moderate; setelah perbaikan lockfile 0 Critical / 7 High / 0 Moderate. Rincian versi/range/node/dependency/fix ada di `evidence/r21/dependency-findings.json`; raw audit dan hasil akhir per-SHA ada pada CI/deskripsi Draft.

## Advisory dan perbaikan

| Advisory / dependency | Versi / vulnerable range | Patched upstream / keputusan | Reachability dan kontrol |
| --- | --- | --- | --- |
| GHSA-vfj7-8cjw-p6xm, braces | 3.0.3 / <=3.0.3 | Belum ada patched release resmi; npm latest juga 3.0.3 | Static glob compiler build/lint; bukan input request pelanggan. Patch lokal membatasi kedalaman parser/AST walker 128, dengan SHA-256 guard pada empat file |
| Rantai High | chokidar3.6.0, micromatch4.0.8, fast-glob3.3.1/3.3.3, Tailwind3.4.19, plugin/config Next15.5.28 | Audit fix Tailwind4 mengubah CSS/browser support; plugin Next16.4.2 juga masih memakai fast-glob3.3.1. Tidak mengganti Next major atau menurunkan lint config agar audit hijau | Semua node braces pada lockfile wajib dipatch/verify; build/lint Next langsung juga melewati guard next.config; test wrapper verify-only |
| GHSA-rj75-hqrm-r3gf, postcss-selector-parser | 6.1.4 / <7.1.6 | Override eksplisit7.1.6, published patched release | Leaf major6→7, API yang dipakai Tailwind/PostCSS diverifikasi melalui build dan kesetaraan CSS; tidak mengubah Tailwind3/React/Next/Prisma/Vitest |

Percobaan `postcss-nested7.0.2` saja masih meninggalkan parser6 langsung milik Tailwind; tidak dipertahankan. Final memakai hanya override selector-parser7.1.6, tanpa override severity/omit advisory. Semua dependency tetap ada.

## Reproduksi dan batas mitigasi High

Pola 4.000 brace bersarang (8.001 karakter, di bawah limit10.000) membuat compile asli melempar `RangeError: Maximum call stack size exceeded`. Test awal 10.001 karakter hanya menguji length guard; fixture dikoreksi agar benar-benar mereproduksi advisory. Patch menolak kedalaman berlebih dengan SyntaxError terkontrol sebelum rekursi tak terbatas. Regresi menguji string/parentheses/AST, pola normal/range/escaping/micromatch, idempotensi dan source tak dikenal. Tidak menaikkan nomor versi package atau menyembunyikan audit High.

Patch sumber/diff/checksum berada di `scripts/security/`. Semua file diverifikasi sebelum write; unknown version/hash gagal tertutup. Docker mempersiapkan patch setelah source tersedia dalam langkah network-none; image/runtime test read-only hanya memverifikasi. Fresh `npm ci --ignore-scripts` wajib diikuti `npm run security:prepare`; build/lint juga melakukannya. Pemanggilan library langsung sebelum prepare bukan profil tervalidasi. Pembaruan braces/Next/Tailwind harus mereview ulang guard, bukan menerima hash baru otomatis.

Ini mitigasi lokal terhadap rekursi advisory, bukan pernyataan semua kemungkinan ekspansi/glob resource exhaustion sudah diperbaiki. SyntaxError menolak input; caller tetap harus menangani error. Source build/config harus dipercaya, tidak menerima pola dari upload pelanggan. Offline test dibatasi CPU/RAM/pid, tanpa credential/network; deployment memakai source reviewed. Pemilik belum menerima risiko pemeliharaan patch/upstream advisory. Tujuh High tetap OPEN dan keputusan risiko masih wajib.

## Autentikasi dan bisnis

JWT HS256/issuer/audience/expiry, sessionVersion/revocation dan role/RLS guard tetap dipertahankan. Tidak mengubah format token atau schema sesi. Security event baru: `auth.session.created`, `auth.session.revoked`, `auth.password.reset`; metadata hanya user ID internal/action/entity, tanpa token/password/email. Cookie tidak diterbitkan jika audit gagal; revocation logout sudah durable sebelum audit, dan cookie tetap dihapus jika audit gagal. Reset audit berada dalam transaksi agar kegagalan audit membatalkan token consumption/password/version bersama-sama.

Regresi unit memeriksa no-cookie saat audit gagal, durable revocation/cookie deletion, serta metadata minimal. PostgreSQL menguji reset concurrent tepat satu sukses/audit, audit-trigger failure rollback lalu retry. Pengujian auth, transaksi finansial/stok, browser dan gate final diulang pada kandidat final; hasil lama bukan bukti HEAD baru.

Residual: register409 dan reset provider-failure enumeration, limiter fixed-window/global availability, telemetry denial/retention dan operational alerting perlu review pemilik. Tidak mengirim email nyata atau mengubah UX onboarding tanpa desain yang disepakati. Exposure tracked PostgreSQL historis #39 tetap HOLD; tidak membaca snapshot, merotasi credential, atau rewrite history.
