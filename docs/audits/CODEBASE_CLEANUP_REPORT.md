# Sprint 0 — Riwayat pre-flight dan pemulihan

Tanggal: 14 Oktober 2026 (Asia/Jakarta). Status historis bagian 1–15: **BLOCKED**.

**Status terbaru:** pre-flight dan cleanup aman lulus. Audit CVE resmi menemukan 2 entri Critical, 9 High, dan 7 Moderate; belum diperbaiki. Lihat bagian 16 untuk rincian dan rencana mitigasi yang memerlukan persetujuan sebelum approval final/merge. Lihat [laporan audit source terbaru](SPRINT_0_SOURCE_AUDIT.md) untuk perubahan, validasi, dan risiko yang masih terbuka. Bagian di bawah dipertahankan sebagai riwayat pemeriksaan sebelumnya, bukan status runtime saat ini.

Sprint 0A containment telah diterapkan tanpa upgrade; lihat [bukti, risiko residual, dan manual controls](SPRINT_0A_CRITICAL_CONTAINMENT.md). Audit ulang tetap 2 Critical/9 High/7 Moderate. Containment tidak menyatakan CVE fixed atau memberi izin merge/deployment.

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


## 16. Audit CVE resmi npm — tindak lanjut persetujuan eksplisit

Tanggal pemeriksaan: **14 Oktober 2026 (Asia/Jakarta)**. Baseline pemeriksaan: commit `5e4422399b816e974f366c7c6b933efd433261e3`, branch `chore/sprint-0-codebase-audit-cleanup`, Draft PR [#19](https://github.com/Assyauq26/Gheverhan/pull/19) menuju `fix/netlify-tailwindcss-animate-version`. Hasil bagian ini menggantikan status CVE “belum tersedia” pada audit sebelumnya; riwayat penolakan sebelumnya tetap dipertahankan.

### 16.1 Otorisasi, metode, dan batas data

Pengguna memberikan izin eksplisit untuk mengirim metadata dependency yang diperlukan oleh pemeriksaan CVE ke **registry resmi `https://registry.npmjs.org`**. Pada `frontend/`, dengan Node `22.22.0` dan npm `11.9.0`, dijalankan:

```sh
npm audit --registry=https://registry.npmjs.org --json
npm audit --omit=dev --registry=https://registry.npmjs.org --json
npm ls --all --json
npm ls --omit=dev --all --json
```

Dua audit selesai dengan **exit code 1 karena vulnerability ditemukan**, bukan karena request jaringan gagal. `npm ls` selesai dengan exit code 0. Metadata GHSA/CVE/range/fix diperiksa melalui public GitHub Advisory API; manifest versi kandidat dibaca dari registry npm resmi. `npm audit` adalah pemeriksaan advisory yang diketahui, bukan deteksi seluruh vulnerability atau seluruh ekosistem. Python backend/OS/artefak database bukan cakupan npm audit.

Instance kini melaporkan revisi `5`, observasi terkini, HTTP restricted dengan registry npm dalam allowlist; enforcement masih dilaporkan `unknown`. Request nyata audit berhasil. Tidak ada perubahan policy/bypass. Tidak ada isi `.env`, credential/token, atau data database yang dibaca atau dimasukkan ke payload, report, maupun commit; tidak ada pengiriman source aplikasi. Tidak ada `npm audit fix`, `--force`, install/upgrade/downgrade/removal dependency, seed, migrasi, atau akses production.

### 16.2 Ringkasan jumlah dan scope production/development

| Scope audit | Critical | High | Moderate | Low / Info | Total entri paket |
| --- | ---: | ---: | ---: | ---: | ---: |
| Seluruh dependency | 2 | 9 | 7 | 0 / 0 | 18 |
| `--omit=dev` (production tree) | 0 | 6 | 3 | 0 / 0 | 9 |
| Paket terdampak yang hanya ada pada development tree | 2 | 3 | 4 | 0 / 0 | 9 |

**18 adalah jumlah entri paket di npm audit, bukan 18 CVE unik.** Terdapat **17 advisory unik: 16 memiliki CVE dan satu hanya GHSA**; severity advisory unik adalah 4 Critical, 4 High, dan 9 Moderate. Parent package dapat ditandai akibat dependency rentan tanpa memiliki advisory tersendiri, sehingga menghitung seluruh parent sebagai CVE terpisah menggandakan temuan.

`tailwindcss` dan `postcss` dideklarasikan di `devDependencies`, tetapi tetap masuk production tree: `tailwindcss-animate` adalah dependency production dengan peer Tailwind, sementara `next` membawa PostCSS nested. Status `devDependencies` pada manifest saja tidak cukup untuk menganggap paket tidak ada di production. Kehadiran di tree production juga tidak membuktikan kode rentan dipanggil dalam request runtime atau disertakan dalam bundle Netlify yang akhirnya deployed; bundle deployment belum diperiksa.

### 16.3 Semua entri paket terdampak dan dependency path

Versi installed diperiksa terhadap `node_modules/*/package.json` dan lockfile: semuanya cocok. Jalur berikut berasal dari `npm ls`; panah menunjukkan dependency/peer resolution. “Shared/prod” berarti juga terdeteksi oleh audit production, walaupun beberapa jalurnya berasal dari tooling development. M1–M4 merujuk rencana mitigasi pada 16.6. Parent hanya mewarisi severity, bukan advisory baru.

| Paket | Severity npm | Versi installed | Scope efektif | Dependency path terverifikasi | Rekomendasi |
| --- | --- | --- | --- | --- | --- |
| `tinypool` | Critical | 1.1.1 | Development only | `vitest@2.1.3 → tinypool@1.1.1` | M1 |
| `vitest` | Critical | 2.1.3 | Development only | `vitest@2.1.3` | M1 |
| `@next/eslint-plugin-next` | High | 15.5.26 | Development only | `eslint-config-next@15.5.26 → @next/eslint-plugin-next@15.5.26` | M3 |
| `braces` | High | 3.0.3 | Shared/prod | `tailwindcss@3.4.14 → chokidar@3.6.0 → braces@3.0.3`<br>`tailwindcss@3.4.14 → micromatch@4.0.8 → braces@3.0.3`<br>`tailwindcss-animate@1.0.7 → tailwindcss@3.4.14 → chokidar@3.6.0 → braces@3.0.3`<br>`tailwindcss-animate@1.0.7 → tailwindcss@3.4.14 → micromatch@4.0.8 → braces@3.0.3` | M3 |
| `chokidar` | High | 3.6.0 | Shared/prod | `tailwindcss@3.4.14 → chokidar@3.6.0`<br>`tailwindcss-animate@1.0.7 → tailwindcss@3.4.14 → chokidar@3.6.0` | M3 |
| `eslint-config-next` | High | 15.5.26 | Development only | `eslint-config-next@15.5.26` | M3 |
| `fast-glob` | High | 3.3.1 | Shared/prod | `tailwindcss@3.4.14 → fast-glob@3.3.1`<br>`eslint-config-next@15.5.26 → @next/eslint-plugin-next@15.5.26 → fast-glob@3.3.1`<br>`tailwindcss-animate@1.0.7 → tailwindcss@3.4.14 → fast-glob@3.3.1` | M3 |
| `micromatch` | High | 4.0.8 | Shared/prod | `tailwindcss@3.4.14 → micromatch@4.0.8`<br>`tailwindcss@3.4.14 → fast-glob@3.3.1 → micromatch@4.0.8`<br>`tailwindcss-animate@1.0.7 → tailwindcss@3.4.14 → micromatch@4.0.8`<br>`tailwindcss-animate@1.0.7 → tailwindcss@3.4.14 → fast-glob@3.3.1 → micromatch@4.0.8` | M3 |
| `postcss` | High | 8.4.31, 8.4.47 | Shared/prod | `postcss@8.4.47`<br>`autoprefixer@10.4.20 → postcss@8.4.47`<br>`next@15.5.26 → postcss@8.4.31`<br>`tailwindcss@3.4.14 → postcss@8.4.47`<br>`tailwindcss@3.4.14 → postcss-import@15.1.0 → postcss@8.4.47`<br>`tailwindcss@3.4.14 → postcss-js@4.1.0 → postcss@8.4.47`<br>`tailwindcss@3.4.14 → postcss-load-config@4.0.2 → postcss@8.4.47`<br>`tailwindcss@3.4.14 → postcss-nested@6.2.0 → postcss@8.4.47`<br>`vitest@2.1.3 → vite@5.4.21 → postcss@8.4.47` | M2 |
| `tailwindcss` | High | 3.4.14 | Shared/prod | `tailwindcss@3.4.14`<br>`tailwindcss-animate@1.0.7 → tailwindcss@3.4.14` | M3 |
| `vite` | High | 5.4.21 | Development only | `vitest@2.1.3 → vite@5.4.21`<br>`vitest@2.1.3 → @vitest/mocker@2.1.3 → vite@5.4.21`<br>`vitest@2.1.3 → vite-node@2.1.3 → vite@5.4.21` | M1 |
| `@vitest/mocker` | Moderate | 2.1.3 | Development only | `vitest@2.1.3 → @vitest/mocker@2.1.3` | M1 |
| `esbuild` | Moderate | 0.21.5, 0.23.1 | Development only | `tsx@4.19.1 → esbuild@0.23.1`<br>`vitest@2.1.3 → vite@5.4.21 → esbuild@0.21.5` | M1/M4 |
| `next` | Moderate | 15.5.26 | Production direct | `next@15.5.26` | M2 |
| `postcss-nested` | Moderate | 6.2.0 | Shared/prod | `tailwindcss@3.4.14 → postcss-nested@6.2.0`<br>`tailwindcss-animate@1.0.7 → tailwindcss@3.4.14 → postcss-nested@6.2.0` | M3 |
| `postcss-selector-parser` | Moderate | 6.1.4 | Shared/prod | `tailwindcss@3.4.14 → postcss-selector-parser@6.1.4`<br>`tailwindcss@3.4.14 → postcss-nested@6.2.0 → postcss-selector-parser@6.1.4`<br>`tailwindcss-animate@1.0.7 → tailwindcss@3.4.14 → postcss-selector-parser@6.1.4`<br>`tailwindcss-animate@1.0.7 → tailwindcss@3.4.14 → postcss-nested@6.2.0 → postcss-selector-parser@6.1.4` | M3 |
| `tsx` | Moderate | 4.19.1 | Development only | `tsx@4.19.1` | M4 |
| `vite-node` | Moderate | 2.1.3 | Development only | `vitest@2.1.3 → vite-node@2.1.3` | M1 |

`postcss@8.4.47` adalah root/shared instance; `postcss@8.4.31` adalah instance nested pada `next`. Untuk root PostCSS, jalur production lengkap dapat diprefix dengan `tailwindcss-animate@1.0.7 →` pada jalur Tailwind di tabel. `@next/eslint-plugin-next`, `eslint-config-next`, `chokidar`, `fast-glob`, `micromatch`, `tailwindcss`, `postcss-nested`, `tsx`, dan `vite-node` memiliki sebagian/seluruh severity yang diwarisi dari child package; masing-masing tetap dilaporkan agar dependency path tidak tersembunyi.

### 16.4 Semua advisory unik: CVE, range, dampak, fix, dan applicability

Range di tabel adalah range yang dilaporkan npm audit untuk major/version yang terpasang; bukan seluruh range major lain pada advisory upstream. Semua installed node dari paket advisory berada dalam range terdampak. Severity memakai label npm (`Moderate` setara `medium` GitHub). Link GHSA menyediakan deskripsi upstream; tidak ada payload eksploitasi dijalankan terhadap aplikasi, developer, atau data nyata.

| CVE / sumber | Severity | Paket / range terdampak | Dampak dan keterjangkauan pada Gheverhan | Perbaikan upstream / mitigasi yang diusulkan |
| --- | --- | --- | --- | --- |
| CVE-2026-104848<br>[GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) | Critical | `tinypool` / `<=2.1.0` | Tinypool: Prototype Pollution gadget in worker options leads to Remote Code Execution. Dipakai oleh worker test; perlu primitive prototype pollution sebelumnya dan worker berikutnya. Rantai attacker → pollution pada pipeline Gheverhan belum terkonfirmasi. | tinypool 2.1.1 untuk advisory ini; >=2.1.2 untuk keduanya, atau parent tanpa tinypool. |
| CVE-2026-47429<br>[GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp) | Critical | `vitest` / `<3.2.6` | When Vitest UI server is listening, arbitrary file can be read and executed. Tidak terjangkau pada konfigurasi test Node sekarang. Bersyarat: API/UI diekspos atau UI/Browser Mode Windows; dapat membaca/menulis file dan mengeksekusi test. | 3.2.6 pada lini lama / 4.1.0 pada lini 4; pilih >=4.1.11 untuk seluruh masalah mocker. |
| CVE-2026-104849<br>[GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) | Critical | `tinypool` / `<2.1.2` | Tinypool: Prototype Pollution Gadget to RCE in run() options. Vitest memanggil pool.run dengan options object, jadi syarat call-site ada. Masih perlu pollution filename dan modul attacker; tidak ada jalur HTTP produksi menuju pool ini. | tinypool >=2.1.2 atau migrasi parent yang menghilangkan jalur tersebut. |
| CVE-2025-24964<br>[GHSA-9crc-q9x8-hgqq](https://github.com/advisories/GHSA-9crc-q9x8-hgqq) | Critical | `vitest` / `>=2.0.0 <2.1.9` | Vitest allows Remote Code Execution when accessing a malicious website while Vitest API server is listening. Tidak terjangkau dari storefront; API/UI Vitest tidak diaktifkan. Berisiko jika developer mengaktifkannya dan membuka situs berbahaya. | 2.1.9 untuk advisory ini saja; rencana lengkap M1 memakai lini lebih baru. |
| CVE-2026-45623<br>[GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) | High | `postcss` / `<=8.5.11` | PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments. Butuh CSS attacker diproses dengan map auto-loading. Tidak ditemukan endpoint upload/transform CSS; build source atau dependency CSS berbahaya tetap dapat menyerang runner. | postcss >=8.5.12 untuk advisory ini; >=8.5.23 untuk seluruh empat advisory. |
| CVE-2026-53571<br>[GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) | High | `vite` / `<=6.4.2` | vite: `server.fs.deny` bypass on Windows alternate paths. Tidak berlaku pada runner Linux ini; butuh Vite server reachable serta Windows/NTFS/8.3 alias. Tidak ada deployment Vite storefront yang ditemukan. | vite >=6.4.3 / >=7.3.5 / >=8.0.16; jangan expose dev server lama. |
| CVE-2026-73646<br>[GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) | High | `postcss` / `<=8.5.17` | PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure. Syarat CSS attacker + sourceMappingURL traversal + map output terlihat. Tidak ada jalur CSS pengguna di runtime aplikasi; risiko build bersyarat tetap ada. | postcss >=8.5.18 untuk advisory ini; target lengkap >=8.5.23. |
| CVE-2026-93687<br>[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | High | `braces` / `<=3.0.3` | braces vulnerable to stack-exhaustion denial of service through deeply nested patterns. Butuh pola brace/glob bertingkat dari attacker. Content/glob Tailwind berasal dari source/config build; input HTTP pelanggan tidak dialirkan ke parser ini. | Belum ada first_patched_version di advisory. Hindari input glob tak tepercaya; evaluasi toolchain tanpa jalur braces. |
| CVE-2026-94543<br>[GHSA-4jqv-mc3x-m676](https://github.com/advisories/GHSA-4jqv-mc3x-m676) | Moderate | `next` / `>=15.0.0 <15.5.27` | Next.js has cache poisoning of SSG and ISR pages in self-hosted applications. Prasyarat Pages Router SSG/ISR tidak ditemukan: Gheverhan memakai App Router. Halaman statis App Router sendiri bukan bukti advisory ini terjangkau. | next >=15.5.27 pada lini 15; ini tidak memperbaiki nested PostCSS. |
| CVE-2026-39365<br>[GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) | Moderate | `vite` / `<=6.4.1` | Vite Vulnerable to Path Traversal in Optimized Deps `.map` Handling. Butuh Vite dev server diekspos dan .map sensitif dengan path diketahui. Dev/start aplikasi memakai Next, bukan Vite; test tidak mengekspos Vite server. | vite >=6.4.2 untuk advisory ini; >=6.4.3 / >=7.3.5 / >=8.0.16 untuk seluruh tiga advisory. |
| Tidak ada CVE yang tercantum<br>[GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | Moderate | `esbuild` / `<=0.24.2` | esbuild enables any website to send any requests to the development server and read the response. Butuh esbuild serve aktif dan browser membuka situs attacker. tsx/Vitest memakai transform/build; tidak ada pemanggilan serve esbuild dalam source/config. | esbuild >=0.25.0 melalui parent compatible; tidak mengaktifkan serve versi lama. |
| CVE-2026-84373<br>[GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | Moderate | `vitest`, `@vitest/mocker` / `>=2.1.0 <4.1.11` | Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock. Tidak ada standalone mockerPlugin/interceptorPlugin atau Vitest Browser Mode server. Unauthenticated exploit memerlukan plugin publik di HMR server yang reachable. | vitest/@vitest/mocker >=4.1.11; lini 2/3 tidak menerima fix ini menurut advisory. |
| CVE-2026-69153<br>[GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) | Moderate | `postcss` / `<=8.5.22` | PostCSS: incomplete fix of GHSA-6g55-p6wh-862q — attacker-controlled sourceMappingURL reads arbitrary .map files when `from` is unset. Syarat CSS attacker, from unset, dan map output diekspos. Belum ditemukan jalur tersebut pada endpoint aplikasi; jangan menganggap patch 8.5.18 menutup residu ini. | postcss >=8.5.23. |
| CVE-2026-94484<br>[GHSA-mcj8-r9mp-w47p](https://github.com/advisories/GHSA-mcj8-r9mp-w47p) | Moderate | `next` / `>=15.0.0 <15.5.27` | Next.js has cache poisoning in SSG/ISR rendering that leads to cross-user content substitution and persistent denial of service. Prasyarat root-level catch-all page bersama SSG/ISR tidak ditemukan; route produk/order memakai satu segmen dinamis. Tidak terjangkau menurut pola source sekarang. | next >=15.5.27 pada lini 15; verifikasi deployment/cache setelah perubahan. |
| CVE-2026-41305<br>[GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) | Moderate | `postcss` / `<8.5.10` | PostCSS has XSS via Unescaped `</style>` in its CSS Stringify Output. Butuh CSS attacker distringify lalu dimasukkan mentah ke inline style HTML. Tidak ada jalur tersebut dalam source aplikasi; CSS/theme/plugin tak tepercaya dapat mengubah penilaian. | postcss >=8.5.10 untuk advisory ini; target lengkap >=8.5.23 dan embedding CSS aman. |
| CVE-2026-104844<br>[GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) | Moderate | `postcss-selector-parser` / `<7.1.6` | PostCSS: Quadratic complexity in flat selector parsing allows CPU exhaustion. Butuh selector attacker diparse sinkron dalam request. Selector build berasal dari source; tidak ada service CSS/sanitizer pengguna yang ditemukan. | postcss-selector-parser >=7.1.6 melalui parent yang kompatibel; cap input bila menerima CSS pengguna. |
| CVE-2026-53632<br>[GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) | Moderate | `vite` / `<=6.4.2` | launch-editor: NTLMv2 hash disclosure via UNC path handling on Windows. Tidak berlaku pada runner Linux ini; butuh Windows/NTLM dan middleware launch-editor aktif. Konfigurasi mesin developer Windows belum diverifikasi. | vite >=6.4.3 / >=7.3.5 / >=8.0.16; launch-editor >=2.14.1 bila digunakan. |

### 16.5 Apakah benar-benar dapat dieksploitasi?

**Belum ada rantai eksploitasi remote yang terkonfirmasi pada storefront Gheverhan dengan konfigurasi source saat ini.** Penilaian ini berbasis reachability statis dan prasyarat upstream, bukan pentest atau inspeksi konfigurasi deployment/live developer machines.

- **Vitest API/UI RCE:** scripts memakai `vitest run`/watch biasa; `vitest.config.ts` memilih environment Node dan tidak mengaktifkan `api`, `ui`, Browser Mode, atau host publik. Production menggunakan Next.js. Dengan konfigurasi tersebut, syarat HTTP/WebSocket Vitest advisory tidak aktif. Konfigurasi CLI tambahan di mesin developer dapat mengubah kesimpulan.
- **Tinypool RCE:** worker pool memang dipakai oleh Vitest; source runner memanggil `pool.run(data, { name, channel })` atau options berisi transferList. Maka opsi `run()` bukan syarat yang absen. Namun kedua advisory juga memerlukan primitive prototype pollution dan modul/worker attacker. Jalur attacker → pollution pada proses test Gheverhan belum terkonfirmasi. Ini risiko developer/CI, bukan endpoint produksi yang ditemukan; jangan menyamakan “dev-only” dengan bebas risiko akses secret CI.
- **Braces/PostCSS/selector-parser:** aplikasi tidak menyediakan service transform CSS pengguna, upload CSS/theme, atau parser glob dari parameter HTTP. CSS/content patterns berasal dari source/config pada build. Exploit pada pipeline masih mungkin jika attacker dapat memengaruhi CSS, plugin, source, atau pola build yang kemudian diproses oleh runner dengan akses luas. Tidak ada pembacaan file sensitif atau PoC file read dilakukan dalam audit ini.
- **Next.js cache:** Gheverhan memakai `src/app`, tanpa Pages Router dan tanpa root catch-all page. Kedua prasyarat khusus advisory tidak ditemukan. Kehadiran page statis App Router atau `unstable_cache` catalog saja tidak membuktikan exploit SSG/ISR tersebut berlaku. Netlify bukan alasan blanket untuk mengabaikan advisory; konfigurasi deployment/cache tetap perlu diverifikasi setelah mitigation.
- **Vite/esbuild:** tidak ada Vite/esbuild serve endpoint untuk aplikasi. Dev/start menjalankan `next dev`; Vite/esbuild berada di jalur test/transform. Advisory Windows tidak berlaku pada runner Linux yang diperiksa, tetapi developer Windows belum diaudit. Jangan membuka API/UI/tooling server lama ke jaringan atau situs tak tepercaya.

Temuan Critical/High tidak diturunkan severity-nya hanya karena prasyarat remote belum ditemukan. Source sekarang membatasi reachability, tetapi tidak menjamin safe jika workflow CI, CLI flags, plugin, deployment, atau fitur CSS berubah.

### 16.6 Dampak dan rencana mitigasi — menunggu persetujuan, belum diterapkan

**M1 — Prioritas pertama: Vitest/Tinypool/Vite (Critical/High development).** Risiko RCE developer/runner dan kebocoran file melalui API/UI; Tinypool memerlukan pollution sebelumnya. Sementara, tetap gunakan test Node non-API/non-UI, jangan expose server test/HMR, dan jalankan pemeriksaan source tak tepercaya dalam runner isolated tanpa secret production. Rencana permanen: evaluasi migrasi `vitest` ke lini yang sudah memuat seluruh fix, minimal `4.1.11`, berikut mocker/runner yang seragam dan Vite patched (`>=6.4.3`, `>=7.3.5`, atau `>=8.0.16` pada major yang dipilih). Manifest resmi `vitest@4.1.11` mendukung Node 22 dan tidak mencantumkan Tinypool; verifikasi tree final benar-benar menghilangkan node Tinypool lama atau memakai versi `>=2.1.2`. Jangan memaksakan override Tinypool 2 ke parent yang meminta versi 1 tanpa pengujian kompatibilitas.

**M2 — Next.js dan kedua instance PostCSS (High/shared production dan Moderate framework).** Risiko file read/source-map disclosure/XSS bila CSS attacker masuk pipeline; cache poisoning mempunyai prasyarat routing yang saat ini tidak ditemukan. Rencana: patch Next pada lini 15 ke minimal `15.5.27` untuk dua advisory Next, lalu tangani **kedua** instance PostCSS ke `>=8.5.23` melalui upstream dependency yang compatible atau override scoped yang direview/diuji. Fakta penting: manifest registry `next@15.5.27` masih mem-pin `postcss@8.4.31`; menaikkan Next saja **tidak** menutup temuan PostCSS nested. Sampai disetujui, proses CSS hanya dari source yang direview; hindari CSS tak tepercaya pada runner berprivilege. Jika kelak menerima CSS pengguna, nonaktifkan previous-map loading pada pipeline tersebut dan tambahkan batas ukuran/embedding aman setelah desain dan approval tersendiri.

**M3 — Tailwind/ESLint/glob chain (High dan Moderate shared/dev).** Risiko stack exhaustion atau CPU exhaustion jika parser menerima glob/selector attacker. Advisory Braces tidak memiliki `first_patched_version` saat pemeriksaan. Saran npm menuju Tailwind `4.3.3` adalah **migrasi major**, perlu penyesuaian integrasi PostCSS/config/kompatibilitas UI, bukan patch otomatis. Manifest Tailwind 4.3.3 tidak memiliki dependency chain lama, tetapi package PostCSS integration/adapter yang dipilih masih perlu audit terpisah. Pertahankan content/glob dari source terpercaya, evaluasi toolchain yang menutup/menghindari chain Braces dan memakai selector-parser patched. Pertimbangkan pemisahan package build dari production setelah scope/peer resolution disetujui; audit ini tidak memindahkan atau menghapus package. Untuk ESLint, pilih release kompatibel dengan Next saat ini; jangan mengikuti saran downgrade `eslint-config-next@14.2.35` secara otomatis karena manifest saat ini mem-pin 15.5.26.

**M4 — tsx/esbuild (Moderate development).** Jangan aktifkan `esbuild serve` lama. Evaluasi `tsx@4.23.15` atau release compatible yang memuat esbuild patched; manifest kandidat itu memakai `esbuild ~0.28.0` (di atas minimum fix 0.25.0). Test eksekusi TypeScript dan script Prisma hanya pada database isolated; seed/migrasi/bootstrap production tetap tidak diotorisasi oleh audit CVE ini.

**Validasi setelah rencana disetujui:** branch mitigasi terpisah; review perubahan manifest/lockfile, clean install Node 22, audit full dan production ulang, Prisma generate, typecheck/lint/41 unit regression, production build, serta regresi UI/E2E pada database/storage isolated baru. Untuk upgrade Vitest/Tailwind major, pastikan test discovery/mocks/worker isolation dan tampilan CSS tidak berubah. Audit rekomendasi patch bukan bukti kandidat itu membersihkan seluruh tree; final resolved versions harus diverifikasi ulang.

Saran `fixAvailable` npm adalah kandidat solver, bukan jaminan penutupan seluruh advisory: `vitest@2.1.9` hanya menutup CVE-2025-24964 pada lini 2, masih di bawah fix untuk CVE-2026-47429 dan CVE-2026-84373; Tinypool juga perlu ditinjau. Demikian pula Next 15.5.27 masih membawa PostCSS rentan. **Tidak ada rencana M1–M4 yang diterapkan atau disetujui hanya dengan menjalankan audit.**

### 16.7 Integritas perubahan dan rekomendasi PR #19

- `package.json` dan `package-lock.json` identik dengan baseline audit; pemeriksaan SHA-256 sebelum/sesudah lulus. Lockfile tetap `3eea0888c85f52b41599ec7042917051308f73431eb98a0c088732981d851b66`.
- Tidak ada perubahan source, dependency tree, artefak PostgreSQL, schema/migration, credential, atau test. Log/JSON mentah non-secret disimpan di workspace intermediate, bukan diunggah sebagai payload aplikasi atau ditambahkan ke repository.
- Commit/push tindak lanjut hanya memuat dokumentasi audit pada branch PR #19. PR tetap Draft; tidak ada merge/deploy. Hasil pre-flight 41 test/build sebelumnya tidak dijalankan ulang karena perubahan sekarang hanya dokumentasi dan tidak menutup CVE.
- **Rekomendasi: review manusia terhadap PR #19 dapat dilanjutkan, tetapi approval final untuk merge/deployment sebaiknya ditahan** sampai dampak dan rencana Critical/High (M1–M3) disetujui dan mitigasi diverifikasi, atau residual risk diterima secara eksplisit dengan alasan/prasyarat yang terdokumentasi. Tidak ada rekomendasi “aman production” berdasarkan audit ini. Risiko non-CVE Sprint 1 pada laporan source tetap terbuka.

Fingerprint bukti audit (SHA-256 JSON lokal, untuk reproducibility; advisory database dapat berubah):

- `npm-audit.json`: `312dea6ce5730f4ebc65357703fb08fcc269b9ed512a9135a49da0473df4d4f9`.
- `npm-audit-production.json`: `fdfb07e5cee7b70c728f09722056566e3813cd385de7846094f339282aec3fca`.
