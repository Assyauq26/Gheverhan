# Laporan rebranding — Buat Toko Online Sendiri

Tanggal: 4 November 2026. PR [#170](https://github.com/Assyauq26/Gheverhan/pull/170), branch `feat/jetseller-buattokosendiri-domain-cutover`, base `feat/jetseller-rc-release-workstreams`.

Kode kandidat: `077a06d0ce2c65b6a51699f319288fae5a622772`. Commit setelahnya pada laporan ini hanya dokumentasi; SHA HEAD final dan hasil check terkini harus dibaca dari PR, bukan diasumsikan sama dengan snapshot ini.

| Bagian | Hasil dan batas bukti |
|---|---|
| Rebranding aktif | Landing, daftar/masuk informasional, 404, portal instalasi, dashboard platform, metadata/OG/canonical, ikon, hero, alt/footer, email OTP/reset, pesan error J&T dan CLI diperbarui |
| Identitas merchant | Nama/logo tersimpan tetap dirender melalui StoreLogo; auth/legal menggunakan identitas toko; published revision dan DB tidak dimigrasi; draft baru memakai nama netral |
| Legacy | Inventory path/baris/kelas di `legacy-reference-inventory.tsv`; token issuers/audiences, proof TXT, AAD, env, CLI path, persistence, workflow paths dan signature identities tetap kompatibel; bukti lama dipertahankan |
| Installer | Diagnostik exit/category/fakta host ditambahkan dengan whitelist dan uji kerahasiaan; run 41762514125 lulus real CLI + OIDC/HTTPS + Chromium + PostgreSQL pada SHA kode di atas |
| Root cause historis | **BELUM TERKONFIRMASI**: run 41755784036 tidak menyimpan penyebab CLI keluar. Keberhasilan run berikutnya tidak membuktikan penyebab historis atau menghilangkan seluruh kemungkinan flake |
| Domain baru | Canonical dan default control origin konsisten; owner melaporkan landing/TLS aktif; tidak ada probe atau perubahan production oleh sesi ini. Branding baru belum dideploy |
| Control portal | Contoh config fail-closed untuk dashboard baru disiapkan; provider/auth publik, dedicated DB/key custody dan onboarding seller production belum diverifikasi; tidak ada proxy ke storefront |
| Keamanan | Preflight 4 GiB/40 GiB, signature, state persistence, device binding, CSRF, sesi, J&T dan production deploy gate dipertahankan. Kunci production yang dilaporkan terekspos memerlukan transisi rotasi terpisah |
| Production | **NONE**: tidak ada SSH, DNS mutation, Caddy reload, restart, sertifikat ulang, merge main, migrasi DB atau transaksi production |

## Pengujian aktual

- Go unit seluruh module lulus secara lokal; installer foundation di Ubuntu CI lulus pada kandidat kode.
- Landing: tujuh viewport Chromium 360–1440 px, navigasi/menu/FAQ/tautan/status page/asset/overflow lulus. Bukti baru di `landing/jetseller/tests/evidence/rebrand/`; bukti lama tidak ditimpa.
- Static identity/canonical/legacy-origin isolation/preflight invariants: 6 check lulus. Diagnostik secret-redaction: 2 lulus. Dashboard contracts lokal: 9 lulus. Containment lokal: 20 lulus.
- Typecheck lokal lulus setelah Prisma Client dihasilkan dari schema kandidat dalam direktori verifikasi terisolasi. ESLint lulus dengan warning existing `hero-editor.tsx` tentang img. Enam unit merchant identity/draft lulus setelah penyesuaian ekspektasi rebranding.
- Full unit Windows tidak seluruhnya lulus: empat kegagalan permission/symlink platform Windows, ditambah tiga ekspektasi wordmark lama yang sudah diperbaiki dan diuji ulang. Full Linux unit/containment CI pada kandidat kode lulus; tidak ada pelemahan test Linux untuk menyamakan permission Windows.
- Pada snapshot kandidat kode: build PR (langkah production dilewati), unit/containment, registry PostgreSQL, dashboard contracts/browser, landing browser, installer foundation, dan real CLI pairing lulus. Disposable runtime, signed provisioning, serta suite commerce PostgreSQL/browser masih berjalan saat laporan ini ditulis. Status final exact HEAD wajib dilihat dalam PR.
- Artefak landing dari SHA kode berhasil disiapkan lokal oleh `prepare-release.cjs` dengan 12 file dan hash per file, status `NOT_DEPLOYED`. Ini bukan signature release installer atau bukti deployment.

## Langkah berikutnya dan rollback

Selesaikan seluruh check exact HEAD dan review diff; pertahankan kebutuhan investigasi bila early-exit berulang. Jangan menyatakan semua acceptance criteria tercapai hanya karena pairing sekali berhasil. Portal onboarding dan produksi tetap terblokir gate autentikasi/installer/credential rotation dan persetujuan deployment.

Rilis landing disiapkan pada direktori versi baru, terpisah dari legacy. Operator harus menampilkan target/SHA/diff vhost/backup/risiko/rollback untuk approval terakhir; jangan menimpa Caddyfile aktif dengan draft. Rollback hanya pointer aset dan diff vhost domain baru; pertahankan DB, volume, domain lama, dan semua bukti. Rencana rinci ada di [README](README.md).
