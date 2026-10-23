# PR #87 — operator read-only preflight

Lihat OPERATOR_RUNTIME_HANDOFF.md untuk probe runtime/direct dan perbaikan grants terbaru; SHA/CI final di PR #87. Snapshot historis 22 Oktober 2026. Source yang diperiksa `24189db1875efa760c1375ba874fb08d0673a299`; perubahan berikut hanya dokumentasi. Jangan memakai hasil ini sebagai PASS Production menyeluruh.

## Status terpisah

| Gate | Status dan bukti |
| --- | --- |
| Akses akun/team/project Vercel | PASS CLI 65.0.0; syauqi3/gheverhan, project prj_J8Fao07yrACLGjiDtY3ftRcLkI2s |
| MCP Codex | BLOCKED OAuth remote; tidak mengulang callback localhost. Tidak memblokir pemeriksaan CLI |
| Runtime Production | READY dpl_621bV44pjJVzHJ5NuCQNTFU4JEb1, main@b2d18192d99db379b6894a51abaaded22cc329e0, domain gheverhan.store; PR #87 belum aktif |
| Production env presence | Key wajib tercantum; nilai/validitas/deployment snapshot belum diverifikasi |
| Preview isolation | BLOCKED pembuktian; shared DB opt-in true pada metadata Preview, writer/deployment lama belum diverifikasi |
| Storage privacy | BLOCKED: product-images public=true; payment-proofs public=false pada project Supabase yang diperiksa |
| Database role dan identity efektif | BLOCKED: inspection role postgres bukan bukti role/DSN aplikasi Vercel |
| Migration readiness | 10 completed, 0 failed/rolled-back pada snapshot; checksum historis sesuai laporan sebelumnya. Tepat satu file V2 tambahan pada source; StagedProductMedia/ProductEditorSave belum ada. Bukan izin migrate |
| Dependency risk | Audit terakhir 0 Critical/7 High/0 Moderate; mitigasi dan residual di HIGH_RISK_REVIEW.md; owner acceptance belum ada |
| Cleanup | Source default disabled; flag activation tidak tercantum Production; tabel V2 belum tersedia. Kapasitas, cadence, owner, monitoring dan approval belum lengkap |
| Production preflight | BLOCKED; belum dijalankan dengan effective application environment target yang terverifikasi |

Database Supabase diperiksa read-only: project `bztprltkevacidcpjaam`, database postgres, PostgreSQL 17.6. Snapshot tidak menemukan transaksi >60 detik; bukan jaminan tidak ada lock saat cutover. Project binding Vercel ke database tersebut masih perlu bukti DSN efektif. Migration V2 `20261021093000_product_editor_staged_media_shipping`, SHA-256 `63eefd28491f47b5ed269539d88b52b985f47aac4b620e6600f1607f06414198` tidak berubah.

## Perintah metadata read-only

Jalankan CLI operator yang sudah login; jangan memakai perintah bare vercel yang dapat memulai deployment. Tidak perlu link project.

```bash
vercel project inspect gheverhan --scope syauqi3 --non-interactive
vercel env ls --environment production --scope syauqi3 --project gheverhan
vercel env ls --environment preview --scope syauqi3 --project gheverhan
vercel inspect https://gheverhan.store --scope syauqi3
vercel list gheverhan --environment production --scope syauqi3
```

Daftar env dapat menampilkan nilai Config non-secret; jangan mengarsipkan output mentah bila berisi data sensitif. Jangan gunakan env pull, env run, debug, token flags atau printenv untuk memperoleh Production secrets pada workspace ini. Secret presence bukan bukti key valid. Daftar deployment dipaginasi; halaman pertama tidak membuktikan semua deployment lama aman atau tidak ada queued/running di halaman/filter lain.

Bila metadata first-class tidak cukup, GET Vercel API melalui CLI dapat dipakai dengan explicit scope dan output whitelist (hindari dump raw project/env/deployment records). Verifikasi source SHA, domain alias, git binding dan protection tanpa mencetak field secret. Tidak mengubah Git deployment atau membatalkan deployment pada fase read-only ini.

## Preflight di kanal operator yang aman

Operator perlu menyediakan environment efektif aplikasi Production melalui mekanisme secret resmi pada runtime yang dipercaya, tanpa chat, artifact CI atau env file di Git. Verifikasi DATABASE_URL dan DIRECT_URL mengarah ke project yang disetujui, database/schema sama, pooling/direct dan TLS sesuai; lakukan koneksi sebagai role aplikasi untuk membuktikan grants/RLS. Inspection Supabase tidak menggantikan langkah ini. Jangan menambahkan/mengganti Production secrets untuk menjalankan audit.

Setelah binding target dibuktikan, dari source kandidat dan Node 22/pinned dependencies:

```bash
cd frontend
R21_EXPECTED_SUPABASE_REF=bztprltkevacidcpjaam \
R21_ALLOW_PRODUCTION_READ_ONLY=1 npm run release:preflight
```

Kedua flag hanya mengizinkan pemeriksaan read-only, tidak mengisi credential atau membuktikan database benar. Script memeriksa ledger/checksum, schema, role/grants, konfigurasi dan private bucket metadata. Tidak memanggil Prisma migrate/deploy, Storage mutation atau cleanup. Saat schema V2 belum diterapkan atau bucket masih public, hasil BLOCKED adalah benar; jangan memperlemah pemeriksaan agar PASS. Preflight tidak membuktikan delivery email, recovery, kebijakan semua objek, kapasitas cleanup, isolasi writer atau approval.

Jangan menjalankan endpoint cleanup, upload/cancel/save dummy atau smoke test mutasi Production pada fase ini. Real private-bucket/proxy compatibility probes memerlukan persetujuan terpisah. Tetapkan cadence/capacity sesuai batas maksimum 5 candidate visits per invocation, dua tahap tombstone dan volume/retry; lihat CLEANUP_OPERATIONS.md. Tetapkan owner dan monitoring sebelum aktivasi.

## Bukti CI dan keputusan

CI source 24189db: [unit](https://github.com/Assyauq26/Gheverhan/actions/runs/39696346136) dan [isolated regression](https://github.com/Assyauq26/Gheverhan/actions/runs/39696346129) PASS. Bukti ini milik SHA tersebut; commit dokumentasi baru perlu statusnya sendiri dan tidak diklaim sudah PASS.

**NO-GO Production.** MCP bukan alasan NO-GO akses akun; blocker release adalah privacy, effective role/DSN, writer isolation, migration target readiness, residual High acceptance dan operational cleanup/approval. Original editor reference visual acceptance juga masih menunggu lampiran yang sesuai. Tidak ada merge, deployment, migration, bucket change, secret change atau cleanup activation.

Peringatan background CLI tentang npm dist-tags sempat muncul setelah read berhasil; bukan error akses project dan tidak dipakai sebagai bukti update CLI tersedia.
