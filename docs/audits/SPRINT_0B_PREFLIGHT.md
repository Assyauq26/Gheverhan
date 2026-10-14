# Sprint 0B — Controlled Dependency Security Patching: BLOCKED

Tanggal: 14 Oktober 2026 (UTC). Repository `Assyauq26/Gheverhan`, branch `chore/sprint-0-codebase-audit-cleanup`, Draft PR [#19](https://github.com/Assyauq26/Gheverhan/pull/19). Baseline `5996d2a2817f722997795bf3995880ed6fcf1814`.

**Keputusan: BLOCKED sebelum perubahan dependency.** Instruksi Sprint 0B mewajibkan verifikasi keamanan approval workflow, secrets exposure, dan protected files sebelum patch. Observasi di bawah belum memenuhi gate tersebut. Tidak ada instalasi, upgrade, perubahan lockfile/kode/config, seed, migrasi, akses database/Supabase production, merge, atau deploy pada pemeriksaan ini. Perubahan hanya dokumentasi pre-flight.

## Bukti pre-flight

| Pemeriksaan | Hasil dan batas bukti |
| --- | --- |
| Branch / working tree / HEAD | Branch sesuai; working tree bersih sebelum pemeriksaan; HEAD persis baseline di atas |
| PR #19 | API: open, draft=true, merged=false; head baseline, base `fix/netlify-tailwindcss-animate-version` |
| Environment | Managed instance revisi 17, observations_current=true, HTTP restricted/enforced; `api.github.com`, `binaries.prisma.sh`, registry resmi npm termasuk host yang diizinkan. Tidak ada secret/runtime-variable binding pada status environment; ini tidak membuktikan secrets GitHub tidak ada |
| Containment repository Sprint 0A | Workflow, Dockerfile, dockerignore, wrapper, Vitest config, dan kedua file regression containment identik byte dengan baseline |
| Batas workflow | pull_request/workflow_dispatch; contents:read; checkout pinned SHA, persist-credentials:false; hosted Ubuntu 24.04; container network=none/read-only/non-root/cap-drop=ALL/no-new-privileges, resource limits; tanpa secret expression, host mount, atau publish port pada workflow ini |
| Remote regression baseline | [Run 38596555487](https://github.com/Assyauq26/Gheverhan/actions/runs/38596555487), head `5996d2a2817f722997795bf3995880ed6fcf1814`, completed/success menurut API. Ini bukti eksekusi containment, bukan bukti kebijakan administratif |
| Actions enabled / allowed actions | `GET actions/permissions`: Resource not accessible by integration; belum terverifikasi |
| Default token permissions / review privileges | `GET actions/permissions/workflow`: Resource not accessible by integration; belum terverifikasi |
| Outside-collaborator / fork approval | `GET actions/permissions/fork-pr-contributor-approval`: Resource not accessible by integration; belum terverifikasi |
| Fork workflows / secret forwarding policy | `GET actions/permissions/fork-pr-workflows-private-repos`: Resource not accessible by integration; belum terverifikasi, termasuk applicability policy pada repository ini |
| Repository secrets metadata | `GET actions/secrets`: Resource not accessible by integration. Tidak meminta/membaca nilai secret; tidak dapat menyimpulkan jumlah atau exposure efektif |
| Repository environments | `GET environments` sukses, total_count=0; tidak membuktikan repository/organization secrets tidak ada |
| Rulesets | `GET rulesets?includes_parents=true` sukses, array kosong. Tidak membuktikan legacy branch protection tidak ada |
| Legacy branch protection | GET protection pada branch Sprint dan base PR: Resource not accessible by integration; belum terverifikasi |
| Protected-file ownership | `git ls-files '*CODEOWNERS'` kosong. Tidak ada CODEOWNERS tracked pada checkout ini; required review/owner policy belum dibuktikan |

Penolakan administratif berasal dari izin integrasi GitHub, bukan penolakan domain `api.github.com`: PR, environments, rulesets, dan workflow runs dapat dibaca melalui domain yang sama. Tidak ada bypass proxy, penggantian identitas, permintaan token, atau perubahan kebijakan infrastruktur dilakukan. Berhasil membaca workflow YAML atau mendapatkan status CI success tidak menggantikan verifikasi approval/secret/protected-file gates.

## Dependency: inventaris, bukan implementasi

[Laporan audit](CODEBASE_CLEANUP_REPORT.md), [rencana remediasi](SECURITY_REMEDIATION_PLAN.md), dan [bukti containment Sprint 0A](SPRINT_0A_CRITICAL_CONTAINMENT.md) menjadi acuan. Manifest dan lockfile baseline menunjukkan:

| Paket | Locked sekarang | Kandidat rencana / status |
| --- | --- | --- |
| Root PostCSS | 8.4.47 | 8.5.23; minor update dalam major 8, ditunda sampai gate aman |
| Next.js / eslint-config-next | keduanya 15.5.26 | keduanya 15.5.27; patch terpisah dari PostCSS, ditunda |
| tsx | 4.19.1 | Opsional setelah menilai jalur esbuild aktual; ditunda |
| Vitest / Vite / Tailwind | 2.1.3 / 5.4.21 / 3.4.14 | Tetap sama; bukan scope Sprint 0B |

Ketersediaan versi target dan kompatibilitas belum diverifikasi ulang pada turn ini karena pre-flight wajib gagal. Tidak ada klaim target telah diterapkan. Audit historis tetap 18 entri: 2 Critical, 9 High, 7 Moderate; production tree historis 0 Critical, 6 High, 3 Moderate. Tidak ada npm audit baru atau CVE yang dinyatakan tertutup. Root PostCSS berlabel dev pada manifest tetapi shared production tree; Next production; eslint-config-next dan tsx development. Patch Next tetap tidak menyelesaikan PostCSS nested.

## Bukti manual yang diperlukan untuk membuka gate

Maintainer berwenang perlu memeriksa dan memberikan bukti kebijakan efektif pada SHA/branch yang relevan, atau menyediakan akses read-only administratif yang sesuai:

1. Actions enabled/allowed actions dan approval untuk outside collaborators/fork workflows; review perubahan workflow/Dockerfile/lockfile/runner sebelum execution.
2. Default GITHUB_TOKEN read-only, review privileges, dan fork secret/token forwarding; verifikasi repository **dan organization** secret policy serta bahwa job build/test tidak menerima production credentials. Bukti berupa setting/metadata yang disanitasi, bukan nilai secret/token atau file .env.
3. Proteksi base PR dan branch Sprint: required review/checks, siapa yang dapat mengubah/bypass kebijakan, serta mekanisme review wajib untuk workflow, Dockerfile, manifests/lockfile, wrapper/config dan security tests. Tentukan owner/reviewer yang sah; jangan menganggap array rulesets kosong sudah aman.
4. Pastikan hosted/ephemeral runner dan batas container tetap aktif. Run sukses tidak membuktikan kode PR berbahaya tidak dapat mengganti workflow sebelum approval.

Jangan membuka gate hanya dengan mengabaikan HTTP 403 atau menafsirkan izin push sebagai izin membaca/mengubah kebijakan Actions. Setelah bukti diverifikasi, ulangi pre-flight terhadap HEAD terbaru, verifikasi registry/version/path aktual, lalu lakukan patch terpisah dengan seluruh regression gates yang diminta setelah setiap patch. Jika ada regression, rollback hanya patch terkait.

## Hasil dan rekomendasi

Tidak ada commit patch dependency atau regression per patch karena implementasi belum dimulai. Gates npm ci/generate/typecheck/lint/unit/containment/build/audit tidak dijalankan ulang untuk perubahan dokumentasi ini; bukti baseline remote tetap success. Dependency/lockfile tetap byte baseline dan risiko residual Sprint 0A tetap berlaku.

**Sprint Vitest/Vite belum direkomendasikan dimulai.** Buka gate keamanan di atas terlebih dahulu; selesaikan Sprint 0B terpisah dan evaluasi audit/regression terbaru. Upgrade major Vitest memerlukan scope/otorisasi sprint tersendiri. PR tetap Draft; tidak ada merge atau deploy.
