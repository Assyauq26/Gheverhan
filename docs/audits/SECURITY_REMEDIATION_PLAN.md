# Gheverhan — Security Remediation Plan

Tanggal: **14 Oktober 2026 (Asia/Jakarta)**. Status: **PLANNING ONLY — belum ada upgrade atau perubahan konfigurasi/kode**.

Pembaruan setelah baseline planning: pengguna telah mengotorisasi Sprint 0A containment. Implementasi/config/CI dan bukti pengujian tersedia pada [laporan Sprint 0A](SPRINT_0A_CRITICAL_CONTAINMENT.md); belum ada upgrade dependency. Status “planning only” dan kebutuhan approval di bawah mencatat snapshot rencana pada commit `3997430`, bukan membatalkan otorisasi containment terbaru. Perubahan dependency/major/override tetap belum diotorisasi.

## 1. Baseline, keputusan, dan batas izin

Repository `Assyauq26/Gheverhan`, Draft PR [#19](https://github.com/Assyauq26/Gheverhan/pull/19), branch `chore/sprint-0-codebase-audit-cleanup`. Baseline persis: `ff4623b9258f2408cceee8c02be9a967f0ed3d56`. Seluruh bagian [CODEBASE_CLEANUP_REPORT.md](CODEBASE_CLEANUP_REPORT.md), termasuk 17 advisory pada bagian 16, telah dibaca; audit source dan dependency tree/manifest/lockfile dipakai untuk menilai reachability.

**Keputusan utama:** mulai dengan containment developer/CI dan perubahan patch/minor yang terpisah, kemudian lakukan migrasi test toolchain sebelum migrasi CSS. Tidak ada patch kecil yang telah terverifikasi menutup semua 6 entri High production dan 2 entri Critical development. Approval final untuk merge/deployment tetap ditahan sampai temuan tersebut ditutup atau residual risk diterima secara eksplisit.

Dokumen ini adalah rencana untuk approval, bukan izin melakukan implementasi. Turn ini hanya membaca source/metadata resmi dan menambahkan dokumentasi. Tidak ada `npm install`, `npm ci`, `npm audit fix`, upgrade/downgrade/removal, perubahan lockfile, npm overrides, perubahan application/config/test, seed/migrasi/bootstrap, akses Supabase production, atau merge. Artefak `.postgres` tidak dibuka/dimodifikasi. Credential, token, `.env`, dan data database tidak dikirim. Tidak ada pentest atau PoC pada sistem/data nyata.

Pemeriksaan dilakukan pada Node `22.22.0`/npm `11.9.0`. Environment aktif melaporkan revisi `9`, observasi terkini, HTTP restricted/enforced; registry npm, GitHub API, dan raw GitHub berada pada policy yang diizinkan. Source resmi diakses melalui proxy dengan TLS verification aktif. Status runtime ini berbeda dari snapshot revisi 5 pada audit historis; tidak mengubah hasil audit historis menjadi audit baru.

## 2. Cara membaca prioritas dan akar dependency

Baseline audit: 18 entri paket (2 Critical, 9 High, 7 Moderate). Production tree: 9 entri (0 Critical, **6 High**, 3 Moderate). Terdapat 17 advisory unik/16 CVE; parent package yang ditandai karena child bukan CVE baru. Rencana ini tidak menghitung ulang audit atau mengklaim daftar advisory tidak dapat berubah.

Enam entri High production yang diprioritaskan: **`postcss`, `braces`, `chokidar`, `micromatch`, `fast-glob`, `tailwindcss`**. Dua entri Critical development/CI: **`vitest`, `tinypool`**. Ini delapan entri prioritas, bukan delapan CVE independen.

| Akar langsung pada manifest | Jalur penyebab terverifikasi | Scope dan implikasi |
| --- | --- | --- |
| R1: `next@15.5.26` + `postcss@8.4.47` root | Next → nested `postcss@8.4.31`; root PostCSS dipakai Autoprefixer, Tailwind/PostCSS plugins, dan Vite | Dua instance perlu ditangani. Root ada di devDependencies tetapi shared/prod; Next nested adalah production dependency |
| R2: `tailwindcss-animate@1.0.7` production + `tailwindcss@3.4.14` dev | Animate peer → Tailwind → Chokidar → Braces; Tailwind → Micromatch → Braces; Tailwind → Fast-glob → Micromatch → Braces | Peer membuat Tailwind/glob chain tetap terpasang dalam production tree. Memindahkan satu deklarasi tidak otomatis menutup CVE |
| R2, parser CSS | Tailwind → `postcss-selector-parser@6.1.4`; Tailwind → `postcss-nested@6.2.0` → selector-parser 6 | Upgrade root PostCSS tidak meng-upgrade selector-parser major 6 ke 7 |
| R3: `eslint-config-next@15.5.26` | config-next → `@next/eslint-plugin-next@15.5.26` → `fast-glob@3.3.1` → `micromatch@4.0.8` → `braces@3.0.3` | Development path Braces akan tetap ada sekalipun production CSS chain dihilangkan |
| R4: `vitest@2.1.3` | Vitest → `tinypool@1.1.1`; → `@vitest/mocker@2.1.3`; → `vite-node@2.1.3` → `vite@5.4.21` → `esbuild@0.21.5` | RCE/file read berkaitan dengan proses test/API/UI/developer; bukan Next storefront. Vite juga ditarik langsung Vitest/Mocker |
| R5: `tsx@4.19.1` | tsx → `esbuild@0.23.1` | Jalur esbuild kedua; upgrade Vitest tidak menutup jalur tsx |

Priority tidak menurunkan severity upstream. **Critical CI diberi containment pertama** karena dampak RCE dapat menjangkau runner, kemudian **High PostCSS production/shared** karena ada patch root yang bisa dievaluasi tanpa migrasi UI. Braces/glob production tetap P1, tetapi belum memiliki fix leaf terverifikasi sehingga memerlukan migrasi/risiko tersisa yang eksplisit.

## 3. Versi resmi dan jenis perubahan

Versi kandidat di bawah benar-benar tersedia di registry npm resmi pada saat planning, dan fix floor dicocokkan dengan advisory/release resmi. “Tersedia”/“memenuhi peer range” bukan bukti build, UI, atau seluruh dependency tree sudah aman. Target minimum harus diaudit ulang ketika implementasi dimulai; jangan memakai `latest` tanpa pin/review.

| Komponen | Baseline → kandidat | Jenis update dari baseline | Bukti dan kesimpulan |
| --- | --- | --- | --- |
| Next + eslint-config-next | 15.5.26 → **15.5.27** keduanya | Patch | [Release security Next](https://github.com/vercel/next.js/releases/tag/v15.5.27), [manifest Next](https://registry.npmjs.org/next/15.5.27), [manifest ESLint config](https://registry.npmjs.org/eslint-config-next/15.5.27). Memperbaiki dua advisory cache Next; nested PostCSS **masih exact `8.4.31`** dan plugin ESLint **masih exact fast-glob `3.3.1`** |
| Root PostCSS | 8.4.47 → **8.5.23** | Minor (8.4 → 8.5), bukan patch | [Registry](https://registry.npmjs.org/postcss/8.5.23), [release](https://github.com/postcss/postcss/releases/tag/8.5.23). Minimum gabungan untuk empat advisory PostCSS. Instance Next 8.4.31 tidak ikut berubah hanya karena root diperbarui |
| Vitest/Mocker | 2.1.3 → **4.1.11** | Major, melintasi 3 dan 4 | [Vitest manifest](https://registry.npmjs.org/vitest/4.1.11), [Mocker manifest](https://registry.npmjs.org/%40vitest%2fmocker/4.1.11), [migration guide v4.1.11](https://github.com/vitest-dev/vitest/blob/v4.1.11/docs/guide/migration.md). Mocker fixed >=4.1.11; Vitest 4 menghapus Tinypool dan vite-node |
| Vite untuk Vitest 4 | 5.4.21 → **6.4.3** sebagai kandidat pin konservatif | Major | [Manifest](https://registry.npmjs.org/vite/6.4.3), [migration Vite 6](https://github.com/vitejs/vite/blob/v6.4.3/docs/guide/migration.md). Diterima Vitest 4; esbuild dependency `^0.25.0`, PostCSS `^8.5.3` sehingga final lock harus resolve PostCSS >=8.5.23. Alternatif major 7/8 minimal 7.3.5/8.0.16 bukan kebutuhan awal |
| Tinypool sebagai leaf | 1.1.1 → **2.1.2**, atau tidak lagi hadir melalui Vitest 4 | Major bila mengganti leaf | [Manifest](https://registry.npmjs.org/tinypool/2.1.2). Tidak sesuai range `^1.0.0` parent Vitest 2; pilih upgrade parent, bukan override lintas major |
| Tailwind | 3.4.14 → **4.3.3** + `@tailwindcss/postcss@4.3.3` | Major + konfigurasi/CSS | [Tailwind](https://registry.npmjs.org/tailwindcss/4.3.3), [PostCSS integration](https://registry.npmjs.org/%40tailwindcss%2fpostcss/4.3.3), [official upgrade guide](https://github.com/tailwindlabs/tailwindcss.com/blob/main/src/docs/upgrade-guide.mdx). Base Tailwind 4 tidak membawa old glob/parser chain; integration membawa PostCSS `^8.5.16`, sehingga resolusi >=8.5.23 harus diperiksa |
| Tailwind 3 patch alternatif | 3.4.14 → 3.4.19 | Patch, **bukan closure High** | [Manifest 3.4.19](https://registry.npmjs.org/tailwindcss/3.4.19) masih memakai Chokidar 3, Micromatch 4, Fast-glob 3, selector-parser 6/postcss-nested 6 |
| Braces | 3.0.3 → **belum ada fixed version terverifikasi** | Tidak ada patch tersedia yang dapat direkomendasikan | [Advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) belum memiliki first_patched_version; [registry dist-tag](https://registry.npmjs.org/braces) latest tetap 3.0.3. Jangan mengarang nomor versi fix |
| Chokidar/Fast-glob/Micromatch | Chokidar 4.0.3 tersedia; Fast-glob 3.3.3 masih menarik Micromatch 4.0.8 → Braces 3.0.3 | Chokidar major; Fast-glob patch tidak menutup chain | [Chokidar](https://registry.npmjs.org/chokidar/4.0.3), [Fast-glob](https://registry.npmjs.org/fast-glob/3.3.3), [Micromatch](https://registry.npmjs.org/micromatch/4.0.8). Chokidar 4 tidak diterima Tailwind 3 `^3.6.0`, dan tidak menutup jalur Micromatch lain |
| Selector parser | 6.1.4 → **7.1.6** | Major leaf; perlu parent compatible | [Manifest](https://registry.npmjs.org/postcss-selector-parser/7.1.6). Ditolak range Tailwind/postcss-nested `^6.x`; jangan override hanya karena signature parse terlihat sama |
| tsx / esbuild | 4.19.1 → **4.23.15**; esbuild transitive `~0.28.0` | tsx minor; esbuild 0.x minor dapat breaking | [tsx manifest](https://registry.npmjs.org/tsx/4.23.15). Fix esbuild floor >=0.25.0; gunakan parent tsx, bukan memaksa esbuild 0.28 ke Vite 5 `^0.21.3` |

Vitest **2.1.9** adalah patch yang menutup CVE-2025-24964 saja, tetapi [manifestnya](https://registry.npmjs.org/vitest/2.1.9) tetap memakai Mocker 2/Tinypool 1/Vite 5. Vitest **3.2.6** menutup advisory UI tersebut tetapi [manifestnya](https://registry.npmjs.org/vitest/3.2.6) tetap Mocker 3 dan Tinypool `^1.1.1`. Keduanya bukan target closure semua Critical/Mocker. Hindari menambah dua migrasi sementara jika tidak ada kebutuhan darurat yang disetujui secara khusus.

Release Next 15.5.27 juga menyebut [GHSA-f87g-xv8r-7p7x / CVE-2026-94485](https://github.com/advisories/GHSA-f87g-xv8r-7p7x). Metadata public advisory yang diperiksa saat planning hanya mencantumkan range Next >=16.0.0 <16.3.8. Jangan otomatis memasukkannya ke 17 advisory baseline Next 15.5.26 atau menaikkan jumlah audit tanpa audit baru. Release note dan metadata range dicatat terpisah.

## 4. Matriks mitigasi dan regression gate

T1–T6 didefinisikan di bagian 8. “Tidak terbukti HTTP” berarti precondition tidak ditemukan dalam source saat ini, bukan bebas vulnerability. Production tree adalah classification instalasi; affected runtime menunjukkan konteks eksekusi yang ditemukan, bukan klaim isi bundle Netlify live.

### 4.1 Delapan entri prioritas

| Paket / severity | Exploitability saat ini | Affected runtime | Recommended version / pendekatan | Breaking-change risk | Regression test | Sprint |
| --- | --- | --- | --- | --- | --- | --- |
| **PostCSS / High** (R1/R2) | CSS/sourceMappingURL attacker diperlukan; tidak ada endpoint CSS pengguna. Build dari source/package tak tepercaya tetap berisiko file read | Build/transform CSS; ada dua instance di prod tree | Root **8.5.23**; nested Next butuh parent resmi dengan safe pin atau evaluasi scoped replacement terpisah. Root-only bukan closure | Root rendah–sedang (minor/peers cocok); nested sedang–tinggi (melanggar exact pin Next) | T1, T3, T4: compile CSS, maps, plugin APIs; synthetic map traversal hanya fixture isolated | Root kandidat Sprint 0; nested conditional, bukan otomatis |
| **Braces / High** (R2/R3) | DoS dari brace pattern bertingkat; globs aplikasi berasal dari config/source build, bukan parameter pelanggan | Tailwind build/watch, ESLint glob; terpasang prod/shared | **Tidak ada safe leaf version terverifikasi**. Migrasi Tailwind **4.3.3** menghilangkan production path lama; ESLint path perlu parent release yang menghilangkan Braces atau risk acceptance sementara | Tinggi untuk migrasi; containment konfigurasi/CI rendah | T1, T4, T6: CSS classes/glob coverage dan batas runner | Containment Sprint 0; closure sprint CSS/toolchain |
| **Chokidar / High diwarisi** (R2) | Braces child menjadi pemicu; bukan CVE terpisah Chokidar | Watch/build Tailwind; prod tree tidak berarti digunakan oleh next start | Upgrade parent Tailwind ke **4.3.3**, bukan override Chokidar 4 ke parent 3. Chokidar **4.0.3** saja tidak menutup jalur Braces lain | Tinggi: watch/glob API/major incompatibility | T4: file-change watch dan full class scan/build | Sprint CSS |
| **Micromatch / High diwarisi** (R2/R3) | Brace pattern attacker; belum ada HTTP input menuju matching | Glob build/lint; production peer path | No fixed Micromatch leaf dibuktikan; Tailwind **4.3.3** untuk production path, pantau parent ESLint. **4.0.8 masih membawa Braces 3.0.3** | Tinggi bila mengganti matcher/parent; jangan disable matching fitur | T4, T6: globs, route/components class coverage, lint coverage | Sprint CSS/lint |
| **Fast-glob / High diwarisi** (R2/R3) | Melalui Micromatch → Braces; source/config attacker saat build/lint | Build/lint/production peer path | Tailwind **4.3.3**; Fast-glob **3.3.3 bukan fix chain**. ESLint plugin 15.5.27 tetap Fast-glob 3.3.1 | Tinggi untuk parent migration; patch leaf tidak cukup | T4, T6: discovery files/globs dan lint | Sprint CSS/lint |
| **Tailwind / High diwarisi** (R2) | Tidak ditemukan parsing CSS/globs input pengguna di request; untrusted source build tetap relevan | CSS build; production karena peer animate | **4.3.3** + **@tailwindcss/postcss 4.3.3**, final PostCSS >=8.5.23. Jangan memakai upgrade 3.4.19 sebagai closure | Tinggi: config/CSS/browser floor/visual behavior | T1, T4; visual mobile/desktop, auth/admin/storefront, browser floor | Sprint CSS tersendiri |
| **Vitest / Critical** (R4) | API/UI tidak diaktifkan dalam config; remote precondition absent. Flags tambahan developer dapat mengaktifkan RCE/file access | Developer test/CI, bukan storefront produksi | **4.1.11** + coherent Vitest packages; candidate Vite **6.4.3** pinned/reviewed | Sedang–tinggi, major 2→4, mocks/module runner/pools | T1, T2, T6: 41 test/5 file tidak skip, isolation/mocks/auth/cart invariants; API/UI tetap off | Containment Sprint 0; migrasi test sprint khusus pertama |
| **Tinypool / Critical** (R4) | Pool digunakan, options call-site ada; masih perlu upstream prototype pollution + attacker worker. Tidak ada HTTP app path ke pool | Worker test/CI; risiko secret runner jika compromised | **Hilangkan parent path melalui Vitest 4.1.11**. Jika ada consumer lain, perlu Tinypool >=**2.1.2** dengan parent compatible | Tinggi untuk leaf override 1→2; major parent lebih terarah | T1, T2: tree tidak memuat 1.1.1, worker lifecycle/isolation; synthetic regression bila pool masih dipakai | Containment Sprint 0; sprint test prioritas |

### 4.2 Sisa entri baseline dan follow-through

| Paket / severity | Exploitability / affected runtime | Recommended version / pendekatan | Breaking-change risk | Regression test | Sprint |
| --- | --- | --- | --- | --- | --- |
| Next / Moderate (R1) | SSG/ISR cache poisoning: Pages Router/root catch-all yang disyaratkan tidak ditemukan; App Router production | **15.5.27**, React tetap 18.3.1; bukan closure PostCSS | Rendah–sedang patch; runtime adapter/cache perlu validasi | T1, T3: route/metadata/auth/cache, Node 22 production build | Kandidat Sprint 0 |
| eslint-config-next + @next/eslint-plugin-next / High diwarisi (R3) | Lint glob dari repo; development, Braces child | Align **15.5.27** bila Next dipatch, tetapi High tetap ada. Parent fix Braces belum terverifikasi; jangan downgrade 14 atau lompat Next 16 sebagai jalan pintas | Alignment patch rendah; perubahan lint stack major tinggi | T1, T6: lint coverage, nol warning/error, rule equivalence | Alignment Sprint 0; closure lint terpisah |
| @vitest/mocker / Moderate (R4) | Standalone/HMR interceptor exposed diperlukan; tidak diaktifkan | **4.1.11**, lewat Vitest; jangan override hanya mocker sementara runner tetap2 | Sedang–tinggi coherent major | T2: vi.hoisted, module mock, alias, reset behavior | Sprint test |
| Vite / High + Moderate (R4) | Tidak serve storefront; file-read reachable bila dev server exposed; sebagian Windows-specific | **6.4.3** dipasangkan dengan Vitest 4; jangan override Vite 6 ke Vitest 2 | Sedang–tinggi major/module resolution/config loading | T2, T6: import Next helpers, CSS config discovery, no dev-server exposure | Sprint test |
| vite-node / Moderate diwarisi (R4) | Test module executor membawa Vite 5 | Dihilangkan sebagai dependency Vitest 4; bukan leaf update ke versi lain secara mandiri | Sedang: Module Runner mengganti executor | T2: mocks, imports, async actions/errors | Sprint test |
| esbuild / Moderate (R4/R5) | Advisory CORS perlu esbuild serve; pemakaian saat ini transform/build | **>=0.25.0** via Vite 6; **~0.28.0** via tsx4.23.15; verifikasi kedua instance | Sedang: 0.x minor changes dapat breaking | T1, T2, T5: TS/ESM transforms/imports | tsx kandidat Sprint 0; Vite di sprint test |
| tsx / Moderate diwarisi (R5) | Local script/Prisma tooling, bukan HTTP runtime | **4.23.15**; tidak menjalankan DB-mutating script saat verifikasi | Rendah–sedang minor; esbuild transitive berubah | T5 + typecheck; future script test di DB isolated setelah approval | Kandidat Sprint 0 |
| postcss-selector-parser / Moderate (R2) | DoS selector attacker; tidak ada request parser CSS pengguna | **7.1.6** minimum; parent-compatible atau hilangkan old path melalui Tailwind 4 | Tinggi untuk override 6→7 di plugin 6 | T4: nesting/arbitrary selectors, CSS visual equivalence | Sprint CSS |
| postcss-nested / Moderate diwarisi (R2) | Membawa parser6 dalam build; bukan advisory tambahan | Parent Tailwind 4 menghilangkan chain lama; no leaf recommendation yang melanggar parent | Sedang–tinggi perubahan CSS nesting | T4: nested rules, variants, stylesheet output | Sprint CSS |

## 5. Coverage seluruh 17 advisory

Detail judul/range/CVE ada di laporan baseline; tabel ini mengikat **setiap** advisory ke akar dan closure, tanpa menghitung parent ganda.

| CVE / GHSA resmi | Akar | Closure minimum yang relevan | Catatan implementasi |
| --- | --- | --- | --- |
| CVE-2025-24964 / [9crc-q9x8-hgqq](https://github.com/advisories/GHSA-9crc-q9x8-hgqq) | R4 Vitest | Vitest 2.1.9 khusus advisory ini; target gabungan 4.1.11 | Patch2 bukan closure seluruh Critical |
| CVE-2026-47429 / [5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp) | R4 Vitest | 3.2.6 pada lini3 / 4.1.0 lini4; pilih4.1.11 | UI/network preconditions tetap dicegah |
| CVE-2026-104848 / [5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) | R4 Tinypool | 2.1.1 untuk advisory ini; 2.1.2 gabungan atau Vitest 4 tanpa Tinypool | Child1→2 bukan patch compatible |
| CVE-2026-104849 / [85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) | R4 Tinypool | >=2.1.2 atau parent tanpa pool ini | Verify worker options dan residual consumers |
| CVE-2026-93687 / [vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | R2/R3 Braces | Belum ada patched leaf resmi | Tailwind 4 memutus prod path; ESLint old path tetap blocker dev/risk acceptance |
| CVE-2026-45623 / [6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) | R1/R2 PostCSS | 8.5.12 khusus; >=8.5.23 gabungan | Root dan Next nested harus diperiksa |
| CVE-2026-73646 / [r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) | R1/R2 PostCSS | 8.5.18 khusus; >=8.5.23 gabungan | `.map` traversal/input boundary |
| CVE-2026-69153 / [fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) | R1/R2 PostCSS | >=8.5.23 | Release menolak map tanpa `from`; bisa mengubah behavior map tooling |
| CVE-2026-41305 / [qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) | R1/R2 PostCSS | 8.5.10 khusus; >=8.5.23 gabungan | Tidak ada CSS pengguna di inline style; test embedding bila ditambah |
| CVE-2026-94543 / [4jqv-mc3x-m676](https://github.com/advisories/GHSA-4jqv-mc3x-m676) | R1 Next | >=15.5.27 | Pages Router SSG/ISR absent pada baseline |
| CVE-2026-94484 / [mcj8-r9mp-w47p](https://github.com/advisories/GHSA-mcj8-r9mp-w47p) | R1 Next | >=15.5.27 | Root catch-all absent pada baseline |
| CVE-2026-84373 / [82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | R4 Vitest/Mocker | >=4.1.11 | Menolak solusi intermediate2/3 sebagai closure |
| CVE-2026-39365 / [4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) | R4 Vite | >=6.4.2 khusus; pilih6.4.3 gabungan | Server exposure perlu dicegah |
| CVE-2026-53632 / [v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) | R4 Vite | >=6.4.3 pada lini6; launch-editor >=2.14.1 bila ada consumer lain | Developer Windows/NTLM belum diverifikasi |
| CVE-2026-53571 / [fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) | R4 Vite | >=6.4.3 | Windows NTFS/ADS/alias issue; tidak berlaku pada runner Linux |
| GHSA-only [67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | R4/R5 esbuild | >=0.25.0 | Dua jalur parent; tidak ada esbuild serve saat ini |
| CVE-2026-104844 / [rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) | R2 selector-parser | >=7.1.6 | Parent6 tidak menerima major7 tanpa migrasi/compatibility proof |

## 6. Analisis kompatibilitas framework dan overrides

### Next.js / React / Prisma

- Manifest Next 15.5.27 menerima React/ReactDOM `^18.2.0`; **18.3.1 tetap cocok**. ReactDOM18.3.1 menerima React `^18.3.1`. Tidak perlu React 19 atau Next 16 untuk dua cache advisory ini. `useFormState`/`useFormStatus` yang dipakai UI tidak perlu dimigrasikan hanya untuk patch ini; full auth/action regressions tetap wajib.
- `eslint-config-next@15.5.27` menerima ESLint 8.57.1 dan TypeScript 5.6.3 menurut peer range. Alignment config/plugin diperlukan, tetapi tidak menutup Braces path: plugin15.5.27 masih `fast-glob: 3.3.1`.
- Node 22.22.0 memenuhi engine kandidat Next, PostCSS, Vitest 4, Vite 6, dan tsx. `@types/node@20.16.11` masih diterima peer Vitest 4/Vite 6; alignment types ke22 dapat dilakukan terpisah bila perlu, bukan dependency security wajib.
- Prisma CLI dan Client tetap **5.22.0 bersama**. Tidak ada advisory Prisma dalam baseline, dan rencana ini tidak mengubah schema/client API atau datasource. Metadata engines keduanya `>=16.13` menerima Node 22; Prisma generation/build sebelumnya lulus, tetapi ini bukan klaim seluruh produk Prisma 5 disupport selamanya pada semua engine. Tidak perlu major Prisma 6/7 atau migrasi database untuk remediation ini. Future generation/typecheck diperlukan agar perubahan bundler/tooling tidak mengganggu Prisma.
- Netlify adapter5.16.0 mempunyai engine Node>=18 dan **tidak mendeklarasikan peer Next yang memastikan kompatibilitas patch**. Metadata saja tidak cukup; preview/build/SSR adapter harus diuji setelah perubahan di environment non-production yang disetujui. Tidak ada deployment dalam planning ini.

### PostCSS root dan instance Next

Semver compatibility check terhadap manifest resmi menunjukkan PostCSS 8.5.23 diterima Autoprefixer10.4.20 `^8.1.0`, postcss-nested6.2.0 `^8.2.14`, Tailwind 3 `^8.4.x`, dan Vite 6 `^8.5.3`. Root update menjadi **kandidat minor berisiko rendah–sedang**, bukan jaminan tanpa breaking behavior. PostCSS 8.5.23 sengaja menolak map tanpa `opts.from`; perlu test generation/consumer source maps dan CSS Modules.

Next 15.5.27 mem-pin PostCSS **exact8.4.31**. Mengganti ke8.5.23 berarti keluar dari constraint parent, sekalipun major8 sama. Source baseline `next/dist/build/webpack/config/blocks/css/index.js` memuat `require('postcss')` dan memasang compatibility APIs `postcss.plugin`/`postcss.vendor`; `postcss-loader` memanggil `.process` dengan `from`, `to`, dan map handling. Ini memberi titik test konkret, **bukan sertifikasi bahwa replacement berhasil**. Root PostCSS upgrade tidak mengganti module resolution instance nested ini.

Jalur pilihan: (1) utamakan release parent yang secara resmi memakai PostCSS safe; Next 15.5.27 yang diperiksa belum memenuhi itu; (2) jika tidak ada parent compatible, lakukan eksperimen scoped replacement di branch isolated **setelah approval**, dengan CSS/SSR/maps/API/plugin tests dan review upstream. Planning tidak memilih global override. Tidak ada versi parent Next lain yang dinyatakan aman untuk PostCSS tanpa bukti manifest tambahan.

Mengubah `productionBrowserSourceMaps` saja **bukan** bukti previous-map auto-loading PostCSS dinonaktifkan. Workaround `map:false` berlaku pada invocation PostCSS yang benar-benar dikontrol; jangan menyisipkan webpack hack/global behavior change untuk Next tanpa analisis. Itu juga bukan solusi seluruh CVE/chain.

### Vitest / Vite

Vitest 4.1.11 menerima Vite 6.4.3 dan Node 22.22.0. Sebaliknya, Vite 6.4.3 **tidak** memenuhi Vitest 2 `^5.0.0`, Tinypool 2.1.2 **tidak** memenuhi Vitest 2 `^1.0.0`. Vitest 3.2.6 masih membawa Tinypool 1 dan Mocker 3. Karena itu upgrade parent secara coherent lebih masuk akal daripada override leaf lintas major.

Migration guide resmi Vitest 4 menjelaskan penghapusan Tinypool, penggantian vite-node dengan Vite Module Runner, perubahan mock/spies/reset behavior, opsi pools, coverage, dan test exclusions. Gheverhan memakai `vi.hoisted`, module mock, `vi.resetAllMocks`, async session/cart actions, alias `@`, dan explicit include `tests/unit/**/*.test.ts`; semua adalah gate regresi nyata. Config tidak memakai custom pools/workspace/coverage sehingga beberapa migrasi opsional tidak diperlukan. Test discovery harus tetap **41 test/5 file**, bukan berkurang diam-diam.

Vite 6 mengubah resolution conditions dan loader config, termasuk postcss-load-config6; project sekarang memakai JS PostCSS config dan tidak memakai Sass. Risiko ada pada transform/module runner/test import, bukan migrasi frontend ke Vite. Jangan mengganti Next build dengan Vite. Pin candidate6.4.3 saat resolusi nanti agar rentang luas Vitest tidak otomatis memilih Vite 7/8 tanpa review; ini dapat melalui devDependency eksplisit yang disetujui, bukan global override.

### Tailwind / selector-parser / watch

Tailwind 4 memerlukan PostCSS plugin baru, mengganti `@tailwind` directives dengan import, dan tidak otomatis mendeteksi JavaScript config lama. Konfigurasi Gheverhan berupa TypeScript dengan theme tokens, container center/padding, keyframes, plugin animate, dan CSS custom layers; semuanya perlu mapping eksplisit. Official guide menyebut browser floor Safari16.4+/Chrome111+/Firefox128+, perubahan shadow/radius/ring/border/placeholder/container, hover mobile, dan custom utilities. Ini **upgrade major UI**, bukan cleanup Sprint 0.

Peer literal animate1.0.7 adalah `>=3.0.0 || insiders`; cabang numeriknya mencakup Tailwind 4, tetapi dist-tag `insiders` membuat strict semver parse gagal sementara loose parse menerima `>=3.0.0`. Ini bukan bukti incompatibility runtime ataupun jaminan compatibility Tailwind 4. Clean install/peer resolution dan animation outputs wajib diuji; jangan otomatis mengganti/menghapus plugin.

Selector 7.1.6 tidak memenuhi postcss-nested6 `^6.1.1` atau Tailwind 3 `^6.x`; Chokidar 4 tidak memenuhi Tailwind 3 `^3.x`. Membuat constraint lolos dengan override saja tidak membuktikan kompatibilitas AST/selector/glob/watch APIs. Tailwind 4 menghilangkan path lama, tetapi **ESLint Braces path tetap ada** dan seluruh tree integration baru masih harus diaudit.

### Keputusan overrides

**Tidak ada npm overrides yang direkomendasikan sebagai langkah default atau ditambahkan.** Scoped Next/PostCSS replacement tetap kandidat penelitian bersyarat, bukan fix yang disetujui. Global override Braces/Micromatch/Chokidar/Tinypool/Vite/selector-parser ditolak pada tahap rencana karena tidak ada fixed Braces leaf atau constraint major tidak cocok.

Jika scoped override akhirnya diajukan: catat exact parent/child version/range, changelog/API usages, semua consumer, target path resolution setelah install, regression fixtures, full/prod audit, rollback, dan kebutuhan approval. Persetujuan planning tidak sama dengan persetujuan override/lockfile mutation. Semver checks di atas menggunakan metadata, tanpa install target; masih memerlukan dynamic compatibility proof.

## 7. Pemisahan sprint dan urutan implementasi

| Tahap | Scope yang diusulkan | Alasan / exit gate |
| --- | --- | --- |
| **0 — containment Sprint 0, tanpa upgrade** | Pastikan API/UI/HMR tooling tidak exposed; CI untrusted PR tanpa secret production, isolated/ephemeral runner dan batas resource; CSS/glob source hanya dari code review | Melindungi developer/CI selama Critical belum tertutup. Tidak mengklaim CVE fixed. Perubahan workflow/config tetap perlu approval |
| **1 — root PostCSS minor Sprint 0** | Root PostCSS 8.5.23 saja, satu commit/perubahan terpisah | Mengurangi High yang punya jalur upgrade peer-compatible. T1/T3/T4; daftar nested8.4.31 yang belum tertutup harus eksplisit |
| **2 — Next patch Sprint 0** | Next 15.5.27 + eslint-config-next15.5.27, React/Prisma/Node tetap | Menutup advisory Next dengan blast radius kecil. T1/T3; bukan penutupan High Braces/PostCSS nested |
| **3 — tsx minor Sprint 0 opsional** | tsx4.23.15 untuk esbuild pathR5 | Dapat dipisah dari patch production agar rollback jelas; T5. Tidak menjalankan seed/migrasi/bootstrap |
| **4 — sprint security test toolchain, segera berikutnya** | Vitest 4.1.11 + Vite 6.4.3, periksa removal Tinypool/vite-node dan Mocker 4.1.11 | Closure dua Critical tanpa override leaf; T1/T2/T6. Tidak ditunda menunggu upgrade UI besar |
| **5 — nested PostCSS compatibility work** | Cari parent safe; bila belum ada, evaluasi scoped candidate di branch terpisah setelah approval | High nested tetap P1. Prioritas investigasi dapat berjalan sebelum/during tahap1–4; implementasi hanya setelah T3/T4 dan compatibility approval, bukan dipaksa masuk Sprint 0 |
| **6 — sprint CSS/UI terpisah** | Tailwind 4.3.3 + PostCSS integration, class/config/plugin/browser migration | Menghapus production old Braces/selector-parser chain dengan T4/visual gates. Perlu persetujuan browser support dan scope UI |
| **7 — lint residual / closure** | Parent ESLint compatible yang tidak membawa Braces bila tersedia; jika belum, residual risk acceptance berbatas dengan review date dan containment | Tailwind 4 tidak menghapus R3. Jangan downgrade ESLint config14 atau memaksakan Next 16/React 19 hanya agar angka audit turun |

Tahap1/2 boleh dipertukarkan sesuai kesiapan regression gate, tetapi tetap dipisah agar kegagalan minor CSS tidak tertutup patch framework. **Urutan default paling aman: containment → root PostCSS → Next patch → tsx opsional → Vitest/Vite major → nested PostCSS setelah proof → Tailwind major → lint residual closure.** Investigasi High nested/Braces tidak menunggu akhir sprint; yang ditunda adalah perubahan dengan risiko breaking yang belum terbukti aman.

Kandidat Sprint 0 berarti **layak diajukan untuk approval + pengujian**, bukan sudah aman di-merge. Sprint 0 tidak boleh diberi status “seluruh Critical/High ditutup” jika hanya patch/minor itu diterapkan.

## 8. Regression tests, acceptance, dan rollback

| Gate | Pemeriksaan setelah implementasi terotorisasi | Kriteria lulus |
| --- | --- | --- |
| **T1 — integrity/tree** | Clean npm install berbasis lockfile di checkout isolated Node 22; manifest diff; `npm ls --all`; full dan production npm audit ke registry resmi | Tidak ada invalid peer/unexpected major/link lokal; root vs nested versions tercatat; seluruh target advisory hilang atau residual disetujui, bukan hanya count turun |
| **T2 — test tooling** | Typecheck/lint; seluruh 41 unit test; mocking Next/session/Prisma; zero-qty removal, malicious redirect rejection, delayed logout; repeat run/isolation/worker exit | 41 test/5 file tetap terdeteksi dan lulus tanpa skip; no dangling worker/no API/UI activation. Coverage bila ditambahkan memiliki baseline baru eksplisit |
| **T3 — framework/server** | Prisma generate tanpa mutasi DB; production build; anon/auth/RBAC/Server Actions, route handlers, private proof cookie/no-store, metadata, catalog user separation/cache | Behavior tetap sama; React 18 dan Prisma 5 tetap; SSR/function adapter di approved non-production preview lulus. Tidak ada deploy production otomatis |
| **T4 — CSS/security/UI** | Build global CSS/CSS Modules/nesting/maps; synthetic `.map` traversal/no-from fixture milik test dalam sandbox; tokens/container/stagger/gallery/nav/cart/auth/admin visual mobile/desktop; watch glob/class discovery; browser-floor check | CSS/maps security behavior sesuai fix; tidak ada pembacaan secret nyata; seluruh utilities/plugin/keyframes/contrast/layout terjaga. Tree prod old Braces/parser6 tidak hadir pada closure CSS |
| **T5 — tsx/Prisma boundary** | TypeScript/ESM/import smoke terhadap fixture tanpa database; typecheck bootstrap/seed source tanpa eksekusi; Prisma CLI/Client generation matching | esbuild pathR5 >=0.25.0; imports tetap valid; tidak ada seed/migrate/bootstrap production atau schema change |
| **T6 — developer/CI exposure** | Review command/config/bind/port/secret scopes; Windows conditional advisories bila runner/developer Windows relevan; lint globs/rules dan repeatability | Test/HMR server tidak publik; untrusted code tidak menerima secret production; dev Braces residual hanya dengan persetujuan tertulis dan batas waktu |

Full database/storage E2E harus memakai **database isolated baru** yang disetujui, bukan `.postgres` tracked atau Supabase production. Data fixtures bukan alasan menjalankan seed destruktif. Unit mocks dan production build sebelumnya tidak menggantikan E2E checkout → payment → shipment/RBAC yang masih terbuka pada audit source.

Setiap kelompok perubahan memiliki commit/PR terpisah atau diff terpisah yang dapat direvert utuh (manifest, lockfile, config). Jangan mencampur migrasi React/Prisma/Next major dengan closure CSS/test. Jika test discovery berkurang, peer mismatch muncul, CSS drift terjadi, atau nested version masih rentan, hentikan promotion dan revert kelompok tersebut. Rollback dependency tidak dianggap memperbaiki security; containment tetap aktif sampai fix/risk acceptance berikutnya.

## 9. Bukti, keterbatasan, dan status publikasi

- Manifest official registry, release Next/PostCSS, official Vitest/Vite/Tailwind migration guides, serta GHSA links di atas diperiksa read-only. Source upgrade Tailwind memakai branch official main dan dapat berubah; planning implementation harus mengunci doc/release version yang dipakai.
- Dependency path/versions dicocokkan dengan lockfile dan hasil `npm ls` dari audit; semver checks menilai declared ranges. Tidak dibuat candidate lockfile atau install/bundle target baru, sehingga kompatibilitas runtime target **belum dinyatakan lulus**.
- Audit full/prod tidak diulang pada turn planning; jumlah 18/9 dan 17 advisory adalah baseline `ff4623b`. Re-audit wajib sebelum approval implementation selesai karena database advisory dan resolved tree bisa berubah.
- Hanya `docs/audits/SECURITY_REMEDIATION_PLAN.md` ditambahkan pada branch PR19. Dependency/lockfile/source tetap identik; tidak ada merge/deployment. Rencana ini menjaga seluruh fitur dan tidak memberi izin perubahan otomatis.

**Persetujuan implementasi yang perlu dibedakan:** (A) containment/config Sprint 0, (B) tiga kandidat patch/minor terpisah, (C) Vitest/Vite major, (D) eksperimen nested PostCSS jika parent safe tidak tersedia, (E) Tailwind/browser/UI major, (F) residual Braces lint acceptance. Tidak ada satu persetujuan planning yang menggantikan seluruh keputusan tersebut.
