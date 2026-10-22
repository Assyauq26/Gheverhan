# Production read-only workflow dan keputusan operasional

Tanggal: 22 Oktober 2026 (WIB). Workflow: `.github/workflows/production-read-only-preflight.yml`. Ini pemeriksaan, bukan workflow cutover. Status Production tetap **NO-GO** sampai seluruh bukti target tersedia.

## Bukti konfigurasi GitHub yang benar-benar dibaca

REST environments: `production-migration` memiliki required reviewer `mrifatsyauqi`, prevent_self_review=true, can_admins_bypass=false, custom deployment branch policy tepat `main` bertipe branch. Environment `Production` dan `Preview` tidak memiliki protection rules; keduanya **tidak dipakai** workflow baru. Tidak mengubah protection atau membuat environment baru.

Daftar repository secrets dan environment secrets mengembalikan **403 Resource not accessible by integration**. Keberadaan, validitas, dan kesetaraan secret dengan snapshot Vercel belum terbukti. Tidak mengambil nilai secret maupun menduplikasi credential. Environment Codex tidak memiliki protected Production bindings.

## Kontrak workflow

- Hanya workflow_dispatch dari main dengan project_ref tepat `bztprltkevacidcpjaam`; ref feature/tag atau target salah menghasilkan failure eksplisit sebelum credential job, bukan skipped workflow hijau.
- Job protection tanpa Production secret memverifikasi required reviewer, larangan self-review/admin bypass, dan hanya branch main. Kegagalan API/permission/metadata berarti BLOCKED. Token GitHub job ini hanya contents:read/actions:read; tidak memakai PAT tambahan untuk menutupi 403.
- Job preflight depends-on protection dan menunggu approval environment `production-migration`. Owner/dispatcher tidak dapat menyetujui sendiri; reviewer independen harus tersedia.
- Checkout immutable **2069bdeae3ab74fabd640b23b71d5c7f073f7f21**, yang telah lulus kedua workflow dan memuat perbaikan ALL privileges. Tidak menerima source SHA/ref dari input dispatcher. Pembaruan pin memerlukan code review dan CI baru.
- Actions dipin commit, persist-credentials=false. Node22, pinned lockfile, npm ci --ignore-scripts dan Prisma generate dijalankan tanpa Production secrets. Generate bukan migration.
- Secret hanya disediakan pada satu step read-only: runtime-role-probe untuk dua koneksi, lalu release:preflight untuk ledger/checksum/schema/grants/RLS/config presence dan metadata private Storage. Kedua hasil ditampilkan terpisah; kegagalan salah satunya membuat job gagal. Missing V2 atau bucket public tidak dikecualikan.
- Tidak upload artifact, env pull, dump, shell trace, provider body, customer rows atau raw Prisma error. Summary hanya status. Role/schema dan boolean metadata dari script reviewed tetap technical metadata; tidak mempublikasikan DSN/token.
- Bukan bukti automatic deployment aman atau secret GitHub identik dengan effective deployed Vercel snapshot. Operator wajib membuktikan provenance binding melalui kanal resmi terlebih dahulu.

## Pemasangan dan dispatch: blocker bootstrap yang disengaja

Workflow baru belum berada pada default branch. GitHub tidak menawarkan workflow_dispatch baru sampai file tersedia di default branch; environment juga hanya mengizinkan main. **Jangan mengendurkan branch policy, dispatch feature branch, atau merge PR87 hanya untuk menjalankan probe.**

Opsi operator: review dan integrasikan hanya workflow/test/docs operasional ke main melalui perubahan terpisah yang disetujui, setelah kontrol automatic deployment dibuktikan. Aplikasi V2 tetap belum di-merge. Ini belum dilakukan dan memerlukan keputusan owner/reviewer. Alternatif tanpa merge: jalankan prosedur Windows pada OPERATOR_RUNTIME_HANDOFF.md di workstation operator terpercaya. Tidak menyalin Production credential ke Codex remote.

Sesudah pemasangan workflow disetujui, operator yang berbeda dari required reviewer dapat menjalankan:

```powershell
gh.exe workflow run production-read-only-preflight.yml --repo Assyauq26/Gheverhan --ref main -f project_ref=bztprltkevacidcpjaam
gh.exe run list --repo Assyauq26/Gheverhan --workflow production-read-only-preflight.yml --limit 5
# Reviewer memeriksa exact source/provenance, lalu Review deployments pada GitHub Actions.
# Gunakan run ID hasil nyata, jangan menganggap dispatch berarti PASS.
gh.exe run view <RUN_ID> --repo Assyauq26/Gheverhan
```

Jangan bypass reviewer atau mengubah protection bila GitHub API job menolak akses. Pemilik repository memeriksa dukungan izin Actions:read untuk environment metadata; jika belum dapat dibuktikan workflow tetap BLOCKED dan operator lokal menjadi jalur terpisah.

## Binding yang diperlukan melalui GitHub Settings

Buka repository → Settings → Environments → **production-migration**. Pertahankan reviewer independen, prevent self-review, no admin bypass, selected branch tepat main. Audit secret existing dahulu. Gunakan secret existing jika valid/equivalent; jangan membuat salinan dengan nama baru.

| Jenis | Nama | Validasi operator sebelum approval |
| --- | --- | --- |
| Secret | DATABASE_URL | Effective application pooled/direct DSN untuk ref target, postgres/public, role runtime, strict TLS |
| Secret | DIRECT_URL | Direct/session connection target sama; bukan transaction pooler |
| Secret | JWT_SECRET, CRON_SECRET | Presence dari binding Production yang benar; tidak dicetak |
| Secret | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY | Exact target ref dan credential Storage berwenang |
| Secret | RESEND_API_KEY, PASSWORD_RESET_FROM, PASSWORD_RESET_BASE_URL | Binding Production; presence bukan deliverability |
| Variable | MAINTENANCE_MODE | Nilai aktual 0/1; jangan mengarang 1 agar PASS |
| Variable opsional | SUPABASE_PRODUCT_IMAGES_BUCKET | Effective override yang benar; kosong berarti default product-images |

Nilai dimasukkan oleh operator berwenang melalui UI GitHub/secret manager resmi, bukan chat, PR, script literal atau artifact. Jangan mengganti credential Production untuk menjalankan test. Sebelum reusing repository-scoped secret, verifikasi scope dan provenance; environment-scoped binding memiliki prioritas. Secret encrypted yang ada tidak dapat divalidasi hanya dari namanya. Workflow tidak meminta VERCEL_TOKEN, SUPABASE_ACCESS_TOKEN atau credential admin alternatif.

## Preview isolation — belum PASS

Refresh resmi Vercel CLI pada 22 Oktober 2026 15:26:18 WIB, pagination lengkap: 207 metadata Preview/non-Production, 142 READY. Snapshot capability database tetap UNKNOWN. Pada 22 Oktober 2026 09:21:35 WIB, 142/142 URL READY merespons HTTP302 terhadap unauthenticated GET /api/v1/health tanpa redirect follow, credential atau mutation. Ini membuktikan HTTP response edge, bukan authenticated app reachability atau DB writer capability. Bukan bukti semua deployment adalah writer maupun sudah terisolasi.

Current Preview config menunjukkan shared-dev opt-in true pada snapshot sebelumnya. Current env key list tanpa DSN tidak mencabut snapshot lama. Source guard migration/seed tidak memblokir semua runtime Prisma writes. Probe Production baru juga tidak mengaudit tiap snapshot Preview.

Operator menyusun inventaris lokal berizin: deployment ID/source SHA, alias/domain, status/protection, snapshot binding provenance, target DB/ref/schema, effective role/grants/RLS, serta status unknown/isolated/writer. Jangan mengekspor env values atau signed URLs. Untuk setiap deployment yang masih serveable, uji hanya akses metadata read-only dengan binding **Preview itu sendiri** di kanal tepercaya; jangan mengganti dengan role admin. Missing credential/snapshot berarti UNKNOWN/BLOCKED, bukan aman.

Remediation yang disiapkan untuk approval terpisah: hapus binding Production dari Preview untuk deployment baru, nonaktifkan shared opt-in bila tidak diperlukan, terapkan akses/protection atau hentikan deployment lama yang terbukti writer, kendalikan webhook/cron/writer lainnya. Mengubah current env saja tidak memperbaiki deployment immutable lama. Jangan merotasi credential bersama atau mengubah database grants sembarangan; dapat memutus Production. Setelah approval tindakan, ulangi inventory dan bukti no-writer. Tidak ada tindakan tersebut dijalankan di task ini.

## Urutan release dan recovery yang diverifikasi terhadap runbook

1. Runtime/operator bindings terbukti, seluruh checksum sesuai, expected single pending V2; saat schema masih lama preflight **harus BLOCKED**. Buktikan semua Preview/legacy/cron/webhook writers terkendali serta Git auto-deploy/queued jobs aman.
2. Owner menyetujui window, maintenance/writer stop dan recovery basis. Waiver backup lama tidak otomatis berlaku jika ada data nyata; konfirmasi data/risk aktual. Jangan membuat dump atau reset otomatis.
3. Reader kompatibel legacy + finalized staged prefix siap sebelum private Storage. Setelah approval spesifik, private hanya product-images; metadata public=false, anonymous direct reads ditolak dan authorized legacy/variation/history readers tetap berhasil. Jangan membuka public RLS workaround. Tidak mengubah payment-proofs.
4. Setelah approval migrasi dan lock/drain check: official Prisma status, tepat satu pending `20261021093000_product_editor_staged_media_shipping`, checksum `63eefd28491f47b5ed269539d88b52b985f47aac4b620e6600f1607f06414198`; official Prisma deploy memakai verified DIRECT_URL. Jika nama/checksum/ledger berbeda STOP. Jangan SQL Editor/db push/manual ledger. Lock timeout berhenti untuk diagnosis, tidak terminate sesi.
5. Verifikasi 11 completed, schema/index/CHECK/FK/RLS/grants dan full read-only preflight PASS; configuration/delivery/Preview gate tetap terpisah. Security seven High membutuhkan mitigasi/penerimaan eksplisit, visual sign-off dan cleanup capacity/owner tetap gate tersendiri.
6. Baru review/merge dan controlled deploy exact approved source setelah database kompatibel; catat squash SHA/tree/checks, Vercel deployment ID/alias gheverhan.store dan smoke evidence. Semua reviewer wajib dipenuhi; tidak merge/deploy otomatis lewat workflow ini.
7. Smoke approved dummy: legacy/finalized/variation photos, editor save/retry/conflict, shipping metadata, auth, storefront/cart dan Buy Now exact selected variation/quantity tanpa menyertakan cart lama. Tidak transaksi finansial live tanpa rekonsiliasi yang disetujui. Pantau 5xx/auth/hydration/media/storage/DB locks dan stock consistency; stop traffic bila integritas belum terbukti.
8. Recovery: roll-forward atau build kompatibel baru yang memahami finalized staged prefix, idempotency dan session revocation. Jangan rollback baseline reader lama, membuka bucket kembali, menghapus media/metadata atau mengoreksi stok/pembayaran massal. Maintenance/traffic-stop tetap tindakan operasional berizin. Cleanup tidak dijadwalkan/diaktifkan oleh merge ini; approval terpisah mencakup quota, backlog, owner dan monitoring.

Detail kanonik: MIGRATION_RELEASE_RUNBOOK.md, STORAGE_PRIVACY_AND_CLEANUP_RUNBOOK.md, MIGRATION.md, RECOVERY_DRILL.md, OPERATOR_RUNTIME_HANDOFF.md. Source/disposable recovery tests di CI bukan bukti restore Production berhasil.
