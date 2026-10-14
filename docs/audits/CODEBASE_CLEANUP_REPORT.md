# Sprint 0 — Laporan pre-flight dan penghambat

Tanggal: 14 Oktober 2026 (Asia/Jakarta). Status keseluruhan: **BLOCKED**.

## 1. Ringkasan eksekutif

Baseline PR #18 telah diverifikasi melalui referensi GitHub. Branch khusus sudah dibuat dari commit persis yang diminta. Pemeriksaan lokal menggunakan dependensi onboarding yang sudah terpasang berhasil, tetapi instalasi berbasis lockfile, akses HTTPS resmi Prisma, dan aktivasi konfigurasi terbaru pada instance ini belum memenuhi prasyarat.

Sesuai instruksi Sprint 0 untuk berhenti sebelum cleanup apabila prasyarat kritis gagal, belum ada perubahan aplikasi, cleanup, atau audit menyeluruh terhadap seluruh sumber. Dokumen ini merupakan laporan pre-flight, bukan klaim penyelesaian audit komprehensif. Tidak ada artefak PostgreSQL yang dibuka, dihapus, dipindahkan, atau di-untrack.

## 2. Baseline commit dan branch

- Repositori: `Assyauq26/Gheverhan`, checkout `/workspace/Gheverhan`.
- Kondisi awal: branch `work`, HEAD `a17a7bfef15026d5c88740703e3f331eba8d49ea`, working tree bersih.
- `refs/pull/18/head`: `d4a3d28d7d3141276cbaf3fdb1b8abe026abfdba`.
- Baseline tersebut bukan ancestor HEAD awal; checkout awal tidak boleh dianggap sudah memuat PR #18.
- Branch lokal: `chore/sprint-0-codebase-audit-cleanup`, dibuat dari SHA baseline di atas setelah nama branch dipastikan tidak ada secara lokal maupun remote.
- Branch remote dengan SHA baseline yang sama: `fix/netlify-tailwindcss-animate-version`. Ini merupakan calon target stacked PR; metadata PR melalui API belum dapat diverifikasi karena akses ditolak.
- Tidak ada push ke main, merge PR #18, force-push, penghapusan branch, atau deployment.

## 3. Validasi lingkungan

Instance aktif melaporkan konfigurasi awal, `spec_revision=1`, observasi terkini, dan kebijakan jaringan restricted/enforced tanpa custom allowed hosts. Pembacaan konfigurasi tersimpan menunjukkan versi publikasi yang lebih baru beserta install/start instructions dan domain `binaries.prisma.sh`, `cdn.playwright.dev`, serta `images.unsplash.com`. Instance percakapan belum memakai versi publikasi tersebut; publikasi dan aktivasi runtime dibedakan.

Request HTTPS, dengan proxy serta verifikasi TLS tetap aktif, ke endpoint checksum resmi:

`https://binaries.prisma.sh/all_commits/605197351a3c8bdd595af2d2a9bc3025bca48ea2/debian-openssl-3.0.x/schema-engine.gz.sha256`

gagal saat CONNECT dengan `403 Forbidden`. Generasi Prisma yang berhasil menggunakan artefak yang sudah tersedia tidak membuktikan akses unduhan baru.

`gh api repos/Assyauq26/Gheverhan/pulls/18` juga gagal dengan `Forbidden` pada `api.github.com`. Akses baca Git melalui HTTPS bekerja; hasil tersebut tidak membuktikan izin GitHub API atau push. Tidak ada token atau nilai secret yang ditampilkan maupun diminta.

Draft jaringan baru berhasil disimpan dengan tambahan `api.github.com`, mempertahankan ketiga domain sebelumnya. Penyimpanan draft tidak menerapkan perubahan runtime atau menerbitkan versi baru.

## 4. Inventaris repositori

Inventaris metadata Git pada baseline, sebelum penambahan laporan:

| Lokasi | File tracked |
| --- | ---: |
| `.postgres` | 1.481 |
| `frontend` | 153 |
| `backend` | 4 |
| `docs` | 4 |
| `test_reports` | 5 |
| `.emergent` | 3 |
| `.gitconfig`, `.gitignore`, `memory`, `netlify.toml` | masing-masing 1 |

Inventaris ini menghitung metadata tracked; belum menilai penggunaan seluruh modul. Tidak ditemukan AGENTS.md yang berlaku pada checkout.

## 5. Temuan berdasarkan tingkat keparahan

| Tingkat | Temuan | Status bukti |
| --- | --- | --- |
| P0 | Belum ada temuan P0 yang dapat dikonfirmasi | Audit keamanan menyeluruh belum dilakukan; bukan pernyataan bebas kerentanan |
| P1 | Prasyarat jaringan/runtime belum terpenuhi; GitHub API terhalang | Observasi runtime dan request resmi gagal |
| P1 | Direktori data PostgreSQL tracked, berpotensi memuat informasi sensitif | Lokasi, jumlah dan ukuran terkonfirmasi; isi serta paparan data belum diperiksa |
| P2 | Tidak ada lockfile dependensi proyek; instalasi bersih tidak dapat direproduksi dengan `npm ci` | Inventaris baseline dan kegagalan `EUSAGE` |
| P2 | `frontend/tsconfig.tsbuildinfo` tracked dan dapat berubah ketika tooling dijalankan | Status tracked terkonfirmasi; file dipertahankan |
| P3 | Peringatan ESLint `@next/next/no-img-element` pada `frontend/src/app/admin/payments/page.tsx:83` | Satu warning, tanpa error; kebutuhan penggunaan gambar tersebut belum dinilai |

## 6. Inventaris dead code

Belum ditentukan. Tidak ada file, komponen, import, dependensi, atau direktori aplikasi yang dinyatakan dead code tanpa pemeriksaan penggunaan, dynamic imports, routing Next.js, dan referensi framework. Tidak ada penghapusan berdasarkan dugaan.

## 7. Audit dependensi awal

`frontend/package.json` pada PR #18 sudah menggunakan `tailwindcss-animate@1.0.7` dan mencantumkan CLI `prisma@5.22.0`; dua masalah manifest pada checkout onboarding awal sudah diperbaiki oleh baseline ini. Temuan lama tidak diterapkan kembali sebagai perubahan Sprint 0.

Baseline tidak memiliki `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, atau `pnpm-lock.yaml`. `frontend/prisma/migrations/migration_lock.toml` merupakan metadata migrasi Prisma, bukan lockfile dependensi JavaScript.

Dependensi tersedia melalui symlink onboarding ke `/workspace/.tools/frontend-deps/node_modules`. Lockfile eksternal onboarding bukan lockfile proyek dan tidak menggantikan syarat instalasi baseline. Belum dilakukan pemeriksaan CVE, unused dependencies, atau upgrade paket.

## 8. Audit keamanan

Audit autentikasi, RBAC, IDOR, upload, pembayaran, transaksi, dan cache belum dilakukan karena gate pre-flight. Hasil onboarding terdahulu tidak diklaim sebagai regresi atau E2E pada baseline Sprint 0.

Pemeriksaan sekarang memakai konfigurasi database lokal loopback, bukan Supabase produksi. Tidak ada migrasi, reset, seed, pembacaan data, maupun operasi destruktif terhadap database produksi. Tidak ada checksum/TLS verification yang dinonaktifkan.

## 9. Penilaian risiko artefak PostgreSQL

Lokasi persis: `.postgres/data/`. Metadata baseline memperlihatkan 1.481 blob dengan ukuran agregat **67.327.374 byte**, sekitar **64,21 MiB**, atau **99,31%** dari jumlah ukuran blob tracked pada baseline. Ini bukan ukuran packfile Git atau ukuran transfer clone.

Komposisi utama: 1.406 file di `base`, 61 di `global`, dua WAL di `pg_wal`, serta file konfigurasi, metadata kontrol, transaction state, dan metadata proses. Struktur tersebut konsisten dengan direktori runtime cluster PostgreSQL, bukan migrasi aplikasi. Isi tidak dibuka; versi cluster dan isi tabel tidak disimpulkan dari nama file.

Potensi risiko mencakup data pelanggan, hash autentikasi, detail transaksi dan rekaman historis WAL. Keberadaan data sensitif atau kebocoran aktual belum dikonfirmasi. Aturan ignore tidak menghapus file yang sudah tracked.

Tree `.postgres` pada checkout awal dan baseline identik: `cfd41b52eb72cebf8894aaeff1f80bceb1408850`. Perpindahan branch tidak mengubah artefak tersebut. Penanganannya ditunda sampai ada persetujuan eksplisit terpisah; tidak ada dump atau isi database yang dimasukkan ke laporan/PR.

## 10. Perubahan yang diimplementasikan

- Branch lokal khusus dari baseline persis PR #18.
- Laporan pre-flight ini.
- Draft kebutuhan akses GitHub API pada konfigurasi lingkungan pengembangan.

Tidak ada perubahan aplikasi, skema, dependensi, lockfile proyek, atau artefak PostgreSQL. Perubahan metadata generated yang dibuat oleh pemeriksaan Next.js dipulihkan ke byte semula, dengan mempertahankan kondisi awal pengguna.

## 11. Perubahan yang sengaja ditunda

Seluruh cleanup kode, pengurangan dependensi, perbaikan keamanan aplikasi, dan klasifikasi dead code ditunda sampai prasyarat dipenuhi. Pembuatan lockfile juga belum dilakukan agar tidak diam-diam mengubah syarat pre-flight. Artefak PostgreSQL memerlukan keputusan terpisah sebelum tindakan apa pun.

## 12. Hasil validasi sebelum/sesudah

Semua pemeriksaan berikut dijalankan pada baseline PR #18. Pemeriksaan lokal menggunakan dependensi yang sudah tersedia; tidak dinyatakan sebagai clean-install validation.

| Pemeriksaan | Sebelum cleanup | Sesudah cleanup |
| --- | --- | --- |
| Repo/branch/SHA/working tree | Terverifikasi; branch sudah dipindahkan ke baseline persis | Tidak berlaku |
| Konfigurasi publikasi terbaru aktif di instance | Belum; instance menggunakan versi sebelumnya | Tidak berlaku |
| HTTPS checksum resmi Prisma | FAIL: CONNECT 403 | Tidak berlaku |
| `npm ci --no-audit --no-fund` | FAIL: EUSAGE, lockfile tidak ada | Tidak berlaku |
| `npm run prisma:generate` | PASS, artefak lokal tersedia | Tidak berlaku |
| `npm run typecheck -- --incremental false` | PASS | Tidak berlaku |
| `npm run lint` | PASS, satu warning dan pemberitahuan deprecation `next lint` | Tidak berlaku |
| `eslint .` | PASS, nol error dan satu warning | Tidak berlaku |
| `npm test` | PASS: tiga file, 10 test | Tidak berlaku |
| `npm run build` | PASS | Tidak berlaku |
| API/integration/browser E2E pada baseline Sprint 0 | Tidak dijalankan | Tidak berlaku |
| GitHub API / Draft PR | BLOCKED: Forbidden | Tidak berlaku |

Tidak ada cleanup aplikasi sehingga tidak ada hasil sesudah-cleanup atau klaim bebas regresi. Log non-secret pemeriksaan lokal tersimpan di `/workspace/.tools/gheverhan/sprint0-preflight/`, bukan disertakan ke commit. Alur registration, RBAC, checkout, payment confirmation/verification, shipping, customer management, dan dashboard belum diklaim lulus E2E.

## 13. Risiko tersisa dan minimum tindakan berikutnya

1. Simpan/publish perubahan domain di pengaturan lingkungan dan gunakan instance yang benar-benar memuat versi terbaru. Verifikasi kembali HTTPS Prisma dan GitHub API setelah perubahan runtime yang bermakna.
2. Sediakan lockfile proyek untuk baseline, atau izinkan langkah persiapan lockfile tersendiri sebelum gate Sprint 0 diulang. Jangan memperlakukan lockfile onboarding eksternal sebagai penggantinya.
3. Setelah gate lulus, lakukan audit menyeluruh, cleanup rendah risiko, validasi regresi, dan Draft PR terhadap baseline yang benar. Jangan membuat PR ke main hanya untuk menghindari hambatan relasi stacked PR.
4. Akses GitHub API saat ini terhalang kebijakan; kebutuhan autentikasi/izin tambahan baru dapat dinilai setelah operasi tersebut dapat diakses. Jangan meminta token hanya berdasarkan asumsi.

## 14. Rekomendasi prioritas Sprint 1

Rekomendasi awal, belum merupakan hasil audit aplikasi lengkap: keputusan penanganan data PostgreSQL tracked; instalasi dependensi yang dapat direproduksi; baseline coverage integrasi untuk checkout, RBAC, pembayaran dan shipping. Prioritas kerentanan aplikasi spesifik harus ditetapkan setelah audit sumber dilakukan, bukan diasumsikan dari pre-flight ini.

Draft Pull Request: **belum dibuat**. Belum ada cleanup commit atau push remote. Laporan ini tidak menyatakan kriteria keberhasilan Sprint 0 sudah terpenuhi.

## 15. Pembaruan pemulihan environment dan pre-flight

Bagian 1–14 dipertahankan sebagai rekaman pemeriksaan sebelumnya pada commit `052c02ab06e3baade5111cd1a2465ca43a94b119`. Bagian ini mencatat tindak lanjut yang diotorisasi pengguna pada 14 Oktober 2026; hasil terbaru tidak menggantikan riwayat dengan klaim keberhasilan yang belum terjadi.

### Status Git dan laporan

Working tree awal tindak lanjut bersih dan branch tetap `chore/sprint-0-codebase-audit-cleanup`, dengan parent laporan tepat pada baseline PR #18. Setelah fetching seluruh branch dan tag yang diiklankan remote, tidak ada remote branch atau tag yang mengandung commit laporan `052c02a`; branch Sprint 0 juga belum diiklankan remote. Jadi laporan sebelumnya masih lokal pada saat pemeriksaan ini. Ini tidak menyimpulkan keberadaan objek orphan yang tidak diiklankan server.

Native HTTPS Git read/fetch bekerja. GitHub API untuk metadata PR #18 tetap gagal dengan `Forbidden`. Branch target baseline yang terverifikasi melalui Git masih `fix/netlify-tailwindcss-animate-version`, SHA `d4a3d28d7d3141276cbaf3fdb1b8abe026abfdba`.

### Package manager dan pemulihan lockfile

Package manager yang didokumentasikan proyek adalah **npm**: `docs/NETLIFY_DEPLOYMENT.md` menggunakan `npm install`/`npm run build`, `netlify.toml` menjalankan `npm run build`, dan scripts manifest juga menggunakan npm. Manifest belum mendeklarasikan field `packageManager`, sehingga ini merupakan konvensi proyek yang terdokumentasi, bukan pin versi npm formal.

Lockfile tidak ditemukan dalam baseline atau riwayat lokal yang tersedia untuk nama lockfile npm/Yarn/pnpm, dan `git check-ignore` menunjukkan `frontend/package-lock.json` tidak di-ignore. Penyebab langsung kegagalan `npm ci` sebelumnya adalah file yang tidak tersedia. Alasan historis file tersebut tidak pernah dibuat/di-commit belum dapat dipastikan dari bukti yang diperiksa.

Pengguna secara eksplisit mengizinkan pembuatan lockfile pada tahap pemulihan. Ditambahkan `frontend/package-lock.json` format v3 dengan mempertahankan resolusi onboarding yang sudah terpasang. Sebelum menjadikannya lockfile proyek, root name/version, seluruh `dependencies`, `devDependencies`, dan `engines` dibandingkan dengan manifest PR #18 dan cocok persis. Tidak ada link lokal atau resolved URL selain registry npm HTTPS. Setelah itu `npm ci` dijalankan pada `frontend/`, menggantikan symlink dependency lama dengan instalasi proyek yang baru. Tidak ada perubahan `package.json` atau upgrade dependency yang diminta/dilakukan; lockfile mengunci resolusi transitif yang sebelumnya tersedia.

Toolchain pemeriksaan: Node `22.22.0`, npm `11.9.0`. SHA-256 lockfile: `3eea0888c85f52b41599ec7042917051308f73431eb98a0c088732981d851b66`.

### Hasil setelah clean install

| Pemeriksaan | Hasil terbaru |
| --- | --- |
| Git HTTPS read/fetch | PASS |
| GitHub API | BLOCKED: Forbidden |
| Endpoint HTTPS resmi checksum Prisma | BLOCKED: CONNECT 403 |
| Lockfile cocok manifest | PASS; tidak mengubah versi langsung |
| `npm ci --no-audit --no-fund` | PASS; 537 paket terpasang pada dependency tree proyek |
| `npm run prisma:generate` setelah clean install | FAIL: unduhan checksum schema-engine ditolak 403 |
| TypeScript setelah clean install | Tidak dijalankan: prerequisite Prisma Client gagal |
| `npm run lint` | PASS; satu warning `no-img-element`, nol error |
| `npm test` | PASS: 10 test pada tiga file, tidak ada skip |
| Production build setelah clean install | Tidak dijalankan: build mengulang prerequisite Prisma generate yang sudah diketahui gagal |
| Audit menyeluruh / cleanup aplikasi | Ditunda sesuai gate pre-flight |
| Draft PR | Terhalang akses GitHub API; tidak ada merge atau deployment |

Hasil PASS TypeScript/build pada tahap sebelumnya menggunakan dependency tree onboarding dan tidak diklaim berlaku sebagai validasi setelah clean install sekarang. Verifikasi checksum, signature, dan TLS tidak dinonaktifkan; saran mengabaikan checksum dari pesan error Prisma tidak diterapkan. Tidak ada pengulangan request gagal setelah diagnosis tanpa perubahan konfigurasi.

### Konfigurasi aktif dan tindakan minimum

Konfigurasi tersimpan terbaru sudah mencantumkan `api.github.com`, `binaries.prisma.sh`, `cdn.playwright.dev`, dan `images.unsplash.com`. Namun `environment_status` untuk instance percakapan masih menunjukkan versi awal `cecfgver_6acf689389a481a39c4ab8089ca4167e`, observasi terkini dan enforced, tanpa custom allowed hosts. Versi konfigurasi tersimpan yang lebih baru bukan bukti aktivasi pada instance lama.

Tidak perlu menambahkan domain yang sama lagi atau meminta token berdasarkan dugaan. Minimum tindakan eksternal: gunakan instance task yang memuat versi lingkungan terbaru atau fasilitas produk untuk menerapkan versi tersebut pada runtime. Setelah perubahan runtime dikonfirmasi, periksa kembali endpoint resmi Prisma dan GitHub API sekali, lalu lanjutkan Prisma generate, TypeScript, build, audit, dan Draft PR. Lockfile yang baru mengatasi penghambat instalasi, tetapi belum mengatasi kebijakan jaringan.

Tidak ada pembacaan atau perubahan artefak PostgreSQL, akses Supabase produksi, seed/reset/migrasi database, perubahan aplikasi, atau cleanup pada tahap ini. Laporan lama dipertahankan, dan output pemeriksaan terbaru disimpan di `/workspace/.tools/gheverhan/sprint0-recovery/` tanpa dimasukkan ke commit.

### Publikasi branch pemulihan

Commit pemulihan `3dfe9ef` berhasil di-push ke `origin/chore/sprint-0-codebase-audit-cleanup` tanpa force-push. Dengan demikian commit laporan sebelumnya `052c02a` kini juga tersedia melalui riwayat branch remote tersebut. Push Git berhasil tidak menghilangkan penolakan GitHub API dan tidak berarti Draft PR sudah dibuat. Draft PR masih belum tersedia; base yang direncanakan tetap branch baseline PR #18, bukan main.
