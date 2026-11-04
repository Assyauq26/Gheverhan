# Buat Toko Online Sendiri — rebranding dan migrasi domain

Tanggal: 4 November 2026 (Asia/Jakarta). PR: #170. Dokumen ini adalah referensi identitas terkini; audit dan bukti lama tetap historis, bukan merek produk aktif.

| Permukaan | Identitas/alamat |
|---|---|
| Produk | Buat Toko Online Sendiri |
| Tagline | Platform Buat Toko Online Sendiri |
| Landing canonical | https://buattokosendiri.web.id |
| Portal/control plane | https://dashboard.buattokosendiri.web.id |
| Staging Tencent | https://staging.buattokosendiri.web.id |
| Toko merchant | Domain, nama, logo, PostgreSQL, media, dan kredensial milik merchant |

## Perubahan yang disiapkan

- Landing, halaman informasi daftar/masuk, 404, title, canonical/OG, alt, footer, wordmark dan ikon memakai identitas resmi. Ilustrasi SVG baru menggantikan bitmap yang berisi logo lama; ilustrasi ditandai bukan transaksi nyata.
- Janji waktu instalasi, percobaan gratis, hosting gratis, dan langsung siap berjualan yang belum terbukti dihapus/dibatasi. Halaman daftar/masuk tetap informasi, tanpa formulir palsu.
- Portal instalasi dan nama workflow menggunakan nama resmi. Pesan kegagalan CLI memakai Bahasa Indonesia tanpa membuka error jaringan/kredensial.
- Dashboard merchant menampilkan nama platform secara terpisah dari logo/nama toko. Auth/legal memakai identitas toko tersimpan. Default draft baru adalah `Toko Anda`; parsing/published revision tidak dimigrasi atau ditimpa.
- Copy merchant, email OTP/reset, admin claim, SEO default dan error J&T tidak lagi memaksakan merek lama. Sender/address dan tautan reset tetap menggunakan konfigurasi per toko; tidak ada perubahan DNS email.

## Kompatibilitas (tidak diubah secara membabi buta)

`legacy-reference-inventory.tsv` menginventarisasi occurrence tekstual tracked dengan path/baris/kelas/rationale, tanpa menyalin isi baris yang mungkin sensitif. Klasifikasi ini adalah triase berbasis konteks path; bukan bukti bahwa setiap record merupakan merek yang dirender. Uji `identity.test.cjs` memeriksa permukaan aktif secara terpisah.

| Kelas | Keputusan |
|---|---|
| A: merek aktif | Ganti pada HTML, React UI, metadata, email, pesan CLI, artwork yang digunakan |
| B: konfigurasi/package/comment internal | Nama workflow tampilan diganti; package privat tidak didistribusikan sebagai nama produk; rename teknis ditunda sampai consumer diperiksa |
| C: identifier persisten | Pertahankan `JETSELLER_*`, `jetseller-setup`, direktori `/var/lib/jetseller-agent`, marker media, schema/migration DB, label/volume, issuer/audience/typ token, TXT proof, AAD J&T, path GitHub/workflow, identitas signature dan artifact |
| D: histori/bukti | Pertahankan audit, laporan rilis, screenshot lama dan provenance; jangan mengubah bukti agar terlihat seperti hasil uji baru |

Perubahan origin tidak memperbarui agent lama secara otomatis: issuer/audience/PoP dan credential diikat ke origin. Migrasi membutuhkan versi protokol eksplisit, pengujian old/new identity, masa overlap yang terbatas, re-pair/renew yang aman, dan rollback. Jangan redirect request API, bearer, device credential, atau callback secara massal. Nama/brand yang disimpan merchant tetap data miliknya, termasuk bila kebetulan sama dengan nama lama.

## Installer E2E: bukti dan batas kesimpulan

Run gagal 41755784036 pada `c3757f5b268363f93480af7b206a4d86ea88c5c1` hanya menyimpan `CLI exited before pairing checkpoint`. Fixture membuang stderr dan status exit; CLI sendiri menyembunyikan seluruh kategori error. Karena fakta host/error asli tidak tersimpan, **penyebab proses keluar pada run tersebut belum terkonfirmasi**. Tidak sah menyimpulkan kekurangan disk, ownership, CA, atau resource tanpa bukti.

Patch menambahkan kategori tetap `host_preflight`, `private_state`, `operation_failed`, exit code, dan whitelist fakta host publik. Error jaringan mentah, token, key, pairing code, URL callback dan environment tidak diteruskan. Run 41761022681 pada `152bf629ddf31a919f5f87ddfdb275f44826a51e` lulus real Go CLI + HTTPS OIDC + Chromium + PostgreSQL, tanpa mengubah preflight. Ini bukti berhasil pada runner baru, bukan pembuktian root cause historis. Exact final HEAD dan check dicatat dalam PR.

Ambang tetap 4 GiB RAM fisik/40 GiB disk kosong/2 CPU; instalasi menolak host tidak sesuai. Tidak ada bypass fixture ke production, perubahan signature, atau pelemahan persistence/device binding.

## Portal readiness dan keamanan

Kode backend control plane, DB terpisah, session/CSRF, domain proof, pairing dan UI tetap dipertahankan. Origin default CLI diarahkan ke dashboard baru. **PUBLIC_SELLER_REGISTRATION_NOT_VERIFIED**: provider OIDC/email production, callback exact, dedicated DB, key custody, signed installer distribution dan end-to-end seller onboarding masih harus diverifikasi sebelum domain portal diaktifkan. Jangan proxy dashboard ke storefront Gheverhan.

Kredensial SSH/deployment yang dinyatakan pernah terekspos harus dianggap berisiko. Inventarisasi public fingerprint/consumer tanpa membaca private key; siapkan kunci pengganti lewat kanal aman; uji akses administratif kedua; ubah secret CI; verifikasi audit/deploy manual; baru cabut kunci lama dan sesi yang relevan setelah persetujuan transisi. Jangan memasukkan nilai kunci/password ke PR/log. Tidak ada rotasi production otomatis dalam pekerjaan ini.

## Domain dan deployment aman (belum dieksekusi)

Owner melaporkan apex/www baru dan domain lama sudah aktif dengan sertifikat Let's Encrypt pada 4 November. Laporan itu bukan verifikasi independen oleh sesi ini. Tidak ada SSH, HTTP probe ke production, DNS mutation, reload Caddy, container restart, atau issuance sertifikat yang dijalankan.

1. Review SHA final/check/security. Jalankan `node landing/jetseller/deploy/prepare-release.cjs <fullSHA> <absolute-new-output-directory>` untuk menghasilkan aset dari commit tersebut beserta hash tiap file. Script hanya menulis artefak lokal baru dan menolak overwrite.
2. Setelah approval production eksplisit, operator memastikan target/container/mount/backup aktif melalui prosedur yang disetujui. Upload artefak ke direktori baru `/data/landing/buattokosendiri/releases/<SHA>` dan verifikasi hash; jangan mengubah `/data/landing/jetseller`.
3. Siapkan pointer `current` untuk domain baru dan diff vhost **hanya domain baru**. Draft repository tidak boleh menggantikan seluruh `/opt/gheverhan/deploy/Caddyfile`. Pertahankan seluruh route Gheverhan, legacy origin/API/callback dan konfigurasi TLS yang sudah berfungsi.
4. Tampilkan target, SHA, diff, risiko dan rollback kepada owner sebagai approval terakhir. Sesudah diizinkan, validasi/reload konfigurasi yang benar dan uji TLS normal/canonical/404/assets. Jangan menjadwalkan issuance ulang atau restart kontainer tanpa kebutuhan.
5. Rollback mengembalikan pointer aset domain baru dan hanya diff vhost yang disetujui ke backup terverifikasi. Simpan artefak gagal dan bukti; jangan menghapus volume/DB. Domain lama tetap pada aset lama sampai migrasi seluruh consumer disetujui.

Tidak ada merge, main commit, deployment production, destructive migration, aktivasi checkout/J&T, atau akses VPS production dalam perubahan ini. Readiness kode rebranding tidak sama dengan platform/installer production siap rilis.
