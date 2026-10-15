# PR #18 — CI containment backport dan verifikasi pre-flight

Tanggal: 14 Oktober 2026 (UTC). Repository `Assyauq26/Gheverhan`.

**Hasil: PASS untuk jalur PR maintainer yang diuji.** Backport CI dari PR #19 telah di-push ke branch PR #18, `fix/netlify-tailwindcss-animate-version`, commit `5024fc001b3423bcf850c5b5174263a2d692bd53`. PR #18 tetap Draft/open menuju `main`. PR #19 tetap Draft/open menuju branch PR #18. Tidak ada merge atau deploy production; patch dependency Sprint 0B belum dimulai pada tugas backport ini.

## 1. Allowlist dan approval

Run PR #19 [38626148799](https://github.com/Assyauq26/Gheverhan/actions/runs/38626148799) sebelumnya `startup_failure`, tanpa job. Annotation GitHub menyebut persis: `The action actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 is not allowed in Assyauq26/Gheverhan because all actions must be from a repository owned by Assyauq26.`

**Allowlist minimal:** `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683`. Maintainer mengonfirmasi pola tersebut sudah ditambahkan/disimpan. Workflow hanya menggunakan Action eksternal ini; tidak memerlukan pola wildcard seluruh marketplace atau Actions lain. Checkout dan seluruh job pada run PR #18 kemudian success, membuktikan pengecualian efektif pada SHA yang diuji.

Bukti manual maintainer yang diterima:

- Selected actions/reusable workflows milik Assyauq26, dengan pengecualian checkout pinned di atas.
- **Require approval for all external contributors** untuk fork PR workflows.
- Default GITHUB_TOKEN read contents/packages; izin Actions membuat/menyetujui PR disabled.
- Repository/environment secrets yang terlihat kosong; ruleset main aktif dengan required `unit-tests` dari GitHub Actions.

Endpoint administratif selected-actions/permissions/fork approval tetap HTTP 403 `Resource not accessible by integration`. Bukti manual tidak dianggap gagal karena API 403. Run yang diuji berasal dari branch repository maintainer: **tidak menguji secara empiris challenge approval pada PR fork eksternal**. Kebijakan fork terverifikasi manual, bukan lewat simulasi contributor eksternal; tidak dibuat PR fork/identitas tambahan untuk mengujinya.

## 2. Scope backport

Sembilan file: workflow, Dockerfile.test, dockerignore, wrapper test, Vitest config, security containment tests, worker regression test, manifest test scripts, dan lockfile.

- Lockfile PR #19 disalin byte-for-byte; SHA-256 `3eea0888c85f52b41599ec7042917051308f73431eb98a0c088732981d851b66`. Tidak dibuat ulang atau dijalankan audit fix/override.
- Manifest PR #18 tetap memakai versi dependency/engines/Prisma config yang sama. Hanya empat npm test scripts ditetapkan. Command dev/start/build/serve/seed/migration tidak diubah.
- PR #18 sebelumnya tidak memiliki lockfile; backport menstabilkan transitive graph memakai graph yang sudah diaudit pada PR #19. Tidak ada klaim dapat membandingkan graph install lama yang tidak dikunci dengan graph ini.
- Source aplikasi, Prisma schema/migrations, PostgreSQL artifacts dan konfigurasi Netlify tidak berubah.
- Sepuluh test unit baseline dipertahankan, satu worker test ditambahkan. Suite **11 unit test** pada PR #18 berbeda dari **42 unit test** PR #19. Dua file berisi 31 test cleanup PR #19 tidak disalin karena bergantung pada cleanup source di PR #19. Tidak ada test baseline yang dihapus/dinonaktifkan.

Workflow `pull_request` tanpa filter branches/paths tersedia pada PR #18 dan otomatis terpicu oleh push. Tidak memakai `pull_request_target`, reusable workflow, secret expression, environment deployment, token forwarding ke Docker, host volume/socket, atau publish port. Permission `contents:read`; checkout pinned, persist-credentials:false. Hosted Ubuntu 24.04; test container non-root, network=none, read-only, cap-drop=ALL, no-new-privileges, memory/pids/CPU limits.

Checkout menggunakan token bawaan untuk fetch; token tidak diteruskan ke build/test container. Repository adalah public milik owner bertipe User (`Assyauq26`), sehingga organization-level Actions secrets tidak berlaku. Kontrol secret dalam Netlify tidak dibaca/dimutasi pada tugas ini; verifikasi preview memakai metadata deploy, tanpa mengakses data production.

## 3. Bukti pada SHA PR #18

| Gate | Bukti |
| --- | --- |
| Local locked image build | PASS; pinned Node/BuildKit, npm ci dengan install hooks disabled, downloader engine Prisma pinned, generate offline |
| Local isolated suite | PASS: 25 native containment + 11 unit/4 file, nol fail/skip; image `669660273fd6e332254725c3420ba29d48342a83a55ae51a5bdc68aca94080d5` |
| GitHub run | [38628049379](https://github.com/Assyauq26/Gheverhan/actions/runs/38628049379): pull_request, terkait PR #18 base main, head `5024fc001b3423bcf850c5b5174263a2d692bd53`, completed/success |
| Required check | `unit-tests`, github-actions app ID 15368, completed/success pada SHA yang sama; cocok dengan integration_id required check ruleset main |
| Job steps | Checkout, locked dependency image build, offline unit/containment execution, dan cleanup seluruhnya success menurut API jobs. Jumlah assertion di atas berasal dari log lokal dengan command sama |
| Netlify Deploy Preview | [Deploy 6acfdebf4fcb82731f1b7dea](https://app.netlify.com/projects/gheverhan/deploys/6acfdebf4fcb82731f1b7dea): state ready, context deploy-preview, review_id 18, commit_ref `5024fc001b3423bcf850c5b5174263a2d692bd53`, error_message null |
| Preview URL | [deploy-preview-18--gheverhan.netlify.app](https://deploy-preview-18--gheverhan.netlify.app). Keberhasilan build/deploy diverifikasi dari metadata; tidak dilakukan DB/business E2E pada URL tersebut |

Ruleset main aktif melalui API rules/branches/main: required check `unit-tests` dari app 15368, require PR, approvals 0, conversation resolution, deletion/force-push blocked. Policy strict required checks saat pemeriksaan terbaru **false**, berbeda dari snapshot sebelumnya; tidak diubah oleh agen. Tidak ada mandatory CODEOWNERS review yang diklaim berlaku.

Disk lokal sempat penuh sehingga container/index Git awal gagal; tidak dianggap PASS. Cache build dan image test containment lama yang tidak bertag dibersihkan, tanpa volume/image/artifacts PostgreSQL. Build dan seluruh tests kemudian selesai dengan exit 0 sebelum commit/push backport.

## 4. Integritas stack dan risiko residual

Backport menyebabkan konflik urutan key script `package.json` pada PR #19. Commit terpisah pada PR #19 menyamakan urutan key saja; hasil JSON parsed dan lockfile identik dengan sebelumnya. Pemeriksaan `git merge-tree` terhadap base baru berhasil tanpa konflik; tidak melakukan merge PR atau integrasi commit base ke branch Sprint.

Critical Vitest/Tinypool dan temuan CVE lainnya tetap residual sesuai audit sebelumnya: tidak ada patch vulnerability atau penurunan severity dalam backport ini. Container/flag Node bukan patch permanen atau jaminan tahan seluruh prototype-pollution/kernel-escape/supply-chain attacks. Approval fork adalah bukti konfigurasi manual; effectiveness terhadap fork hostile belum diuji. Ruleset hanya melindungi main, approvals 0 tidak menjamin independent protected-file review.

Blocker operasional sebelumnya (checkout ditolak, tidak ada unit-tests pada PR menuju main, dan nilai approval fork tidak disebutkan) sudah ditangani dengan bukti yang dibedakan di atas. **Sprint 0B siap dimulai secara terkendali sesuai rencana**, dengan versi target resmi diverifikasi ulang dan gates penuh per patch. Tidak ada clearance merge/deploy production atau izin major upgrade yang tersirat.
