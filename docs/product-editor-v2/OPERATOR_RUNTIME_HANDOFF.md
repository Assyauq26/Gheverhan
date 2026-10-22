# PR #87 — Production runtime preflight handoff

Tanggal: 22 Oktober 2026. Baseline source `7b3d93490af204fc2449567fb9ca63629526081c`; perbaikan gate/operator tools dilakukan di branch PR #87. SHA dan CI final dicatat pada PR setelah push. Tidak mengubah Production atau credential. Working tree awal bersih.

## Status dan bukti

| Pemeriksaan | Status | Bukti / batas |
| --- | --- | --- |
| Vercel account/team/project | PASS | CLI 65.0.0, syauqi3/gheverhan |
| Production key presence | PASS metadata | DATABASE_URL, DIRECT_URL, JWT_SECRET, Supabase/Storage, cron dan Resend keys tercantum; nilai tidak dibaca/pull |
| Effective runtime DSN / deployed snapshot binding | BLOCKED | Environment resmi Codex tidak memiliki secret/runtime bindings; metadata project tidak membuktikan snapshot deployment aktif |
| Runtime/direct target database/schema/mode/TLS | BLOCKED | Belum ada koneksi dengan credential aplikasi/operator target |
| Effective role / individual CRUD / RLS | BLOCKED | Tidak menggunakan credential inspection Supabase sebagai pengganti aplikasi |
| Prisma compatibility dan ledger target | BLOCKED untuk effective runtime | Source CI isolated PASS; belum membuktikan Supavisor/TLS/runtime role aktual |
| V2 schema Production | BLOCKED | Snapshot read-only sebelumnya 10 completed, V2 pending, dua tabel belum ada; tidak diulang memakai credential alternatif pada task ini |
| Preview current env | PASS metadata, isolation BLOCKED | GHEVERHAN_SHARED_DEV_DATABASE=true dan JWT_SECRET; DSN tidak tercantum pada current Preview list |
| Legacy Preview inventory | PASS metadata | Pagination lengkap filter Preview: 207 deployment, 142 READY; field target null/non-Production. Bukan bukti semua mempunyai credential, bisa diakses, atau mempunyai grants |
| Preview guard tests | PASS | 13 tes / 2 files, Node 22, exact HEAD di atas; ini membuktikan kontrak source, bukan live isolation |
| Official release:preflight | BLOCKED, exit 1 | Berhenti sebelum koneksi; databaseIdentity=false dan semua presence key wajib false di environment sesi |

Tidak menjalankan mutation untuk menguji kemampuan write. Jika credential runtime tersedia, has_table_privilege per privilege + RLS metadata dapat membuktikan kemampuan role tanpa INSERT/UPDATE/DELETE percobaan. Successful SELECT saja tidak cukup.

## Temuan source Preview

- Satu Prisma client pada src/lib/prisma.ts; guard dijalankan sebelum inisialisasi. Tidak ditemukan fallback credential DB lain pada src yang ditelaah.
- Guard mengizinkan database dummy bersama bila opt-in literal true dan kedua DSN menunjuk project bztprltkevacidcpjaam. Jadi tidak bisa diklaim sebagai strict Production/Preview isolation. Komentar prisma tentang distinct project bukan kontrak guard aktual.
- Missing DSN, wrong ref/username/flag ditolak. Prisma build/generate tidak membuktikan runtime dapat/tidak dapat menulis.
- Migration/seed/bootstrap npm entrypoints menolak VERCEL_ENV=preview; ini bukan sandbox runtime mutation/arbitrary Prisma CLI.
- JWT issuer/audience Preview dipisah; itu tidak memisahkan database atau membuktikan signing keys berbeda.
- Endpoint cleanup menolak Preview dan default disabled. Tidak menguji/memanggil cleanup Production.
- Menghapus env current project tidak mencabut snapshot credential pada deployment lama.142 READY legacy perlu owner review, deployment protection, snapshot binding dan writer control.

## Grants gate yang diperbaiki

Audit seluruh tracked source/workflow menemukan satu pemanggilan multi-privilege ANY pada productEditorV2. Sekarang StagedProductMedia dan ProductEditorSave memerlukan SELECT **AND** INSERT **AND** UPDATE **AND** DELETE. Gate baru schemaUsage mensyaratkan public USAGE; catalogPrivileges memeriksa CRUD individual dan RLS tidak aktif untuk role server pada Product, ProductImage, ProductVariant dan Inventory. Inventory/variant/image DELETE memang dipakai service katalog. Tidak menambahkan GRANT pada migration atau Production.

Pemeriksaan auth/custom variations/direct checkout sebelumnya sudah individual AND; session-state hanya SELECT sesuai kontrak read-nya. Tidak ada pemanggilan has_sequence_privilege/has_column_privilege pada source/workflow yang diaudit; schema Prisma/migrations tidak memakai sequence/nextval/autoincrement. Tidak menambahkan syarat sequence spekulatif. RLS enabled tetap diwajibkan pada tabel V2/auth/variation yang migration-nya mengaktifkannya; tabel katalog legacy diuji untuk akses server tanpa row filtering, bukan diam-diam diubah policy-nya.

Regression PostgreSQL: role parsial SELECT, SELECT+INSERT, SELECT+INSERT+UPDATE pada **masing-masing** tabel V2 harus BLOCKED meski semua gate lain valid; DELETE melengkapi kontrak menjadi PASS. Per-table missing DELETE katalog, missing public USAGE, NOBYPASSRLS dengan CRUD lengkap dan missing V2 table juga ditolak. Fixture GRANT/REVOKE/role/table changes hanya pada database disposable yang memiliki guard localhost dan nama database khusus, selalu dipulihkan dengan finally. Tidak ada perubahan hak akses Production.

Referensi semantik ANY: https://www.postgresql.org/docs/17/functions-info.html. Daftar privilege comma-separated bukan pemeriksaan ALL.

## Windows PowerShell — metadata dan setup lokal

Gunakan komputer operator yang dipercaya. Tidak memakai Start-Transcript, debug/verbose, printenv/Get-ChildItem Env:, clipboard secret, env pull/run atau token flags. Jangan mengirim connection string, cookie/key atau raw error melalui chat/GitHub/artifact.

```powershell
vercel.cmd project inspect gheverhan --scope syauqi3 --non-interactive
vercel.cmd env ls --environment production --scope syauqi3 --project gheverhan
vercel.cmd env ls --environment preview --scope syauqi3 --project gheverhan
vercel.cmd inspect https://gheverhan.store --scope syauqi3
vercel.cmd list gheverhan --environment preview --scope syauqi3
# Ikuti --next sampai pagination selesai. Config non-secret dapat tercetak.
```

Checkout source reviewed tanpa menimpa pekerjaan lokal, verifikasi git rev-parse HEAD sama dengan SHA kandidat final yang sudah direview pada PR dan Node 22. Jangan reset. Dari frontend, bila dependency belum ada, npm.cmd ci --ignore-scripts lalu npm.cmd run prisma:generate adalah setup lokal; tidak migrate/seed/deploy. Jangan mengeksekusi workflow cutover/migration historis sebagai pengganti read-only diagnostics.

## Secret binding dan probe metadata

Operator mengambil binding **effective deployed Production** melalui mekanisme secret resmi di workstation/runtime terpercaya; tidak menyalin nilai ke prompt, script, .env Git atau artifact. Cocokkan Vercel project/environment/deployment snapshot dengan konfigurasi yang dipakai probe. Credential alternatif dari Supabase MCP/admin atau GitHub secrets yang belum terbukti ekuivalen tidak boleh menggantikan runtime credential.

Sediakan DATABASE_URL dan DIRECT_URL dalam process environment melalui secret manager resmi. Jangan mengubah Production secret untuk menjalankan audit. Pastikan Supabase/Storage dan auth/email/cron keys tersedia di proses yang sama untuk full preflight; gunakan hanya approved effective bindings.

Probe versi reviewed tersedia di frontend/scripts/release/runtime-role-probe.mjs. Jalankan dari frontend agar @prisma/client diselesaikan dari dependency repository:

```powershell
Set-Location 'C:\path\to\Gheverhan\frontend'
node.exe scripts/release/runtime-role-probe.mjs
$LASTEXITCODE
```

Probe memerlukan Node22 dan PrismaClient5.22.0 pinned. Duplicate query parameters/hash/unknown host ditolak. Probe hanya menerima target ref yang ditentukan, /postgres/public, direct 5432 atau Supabase session 5432 / transaction 6543 yang sesuai ref. DIRECT_URL transaction-pooler ditolak. Ia mensyaratkan explicit sslmode=require dan sslaccept=strict sebelum koneksi; jika konfigurasi tidak membuktikannya, hasil BLOCKED bukan klaim server pasti insecure. Jangan menambahkan parameter/merotasi secret Production tanpa review/approval. Cocokkan kebijakan TLS dengan dokumentasi Prisma 5.22 dan endpoint operator.

Probe membuka dua koneksi secara berurutan memakai Prisma resmi, READ ONLY transaction, statement timeout 5s; memeriksa current_database/current_schema/current_user, read-only state, backend pg_stat_ssl, presence/RLS/CRUD individual pada tabel terkait. Tidak membaca customer rows, tidak DDL/DML/migrate. Metadata role hanya ditampilkan lokal; redaksi sesuai kebijakan sebelum dibagikan. pg_stat_ssl pada pooler menggambarkan hop backend PostgreSQL, bukan bukti tunggal TLS browser/client ke pooler. Strict requested TLS + koneksi Prisma sukses merupakan bukti hop client untuk konfigurasi yang diuji, bukan seluruh deployment snapshot.

Script syntax check PASS. Saat dicoba pada environment tanpa binding, exit 1 BLOCKED sebelum koneksi; koneksi target Production **belum diuji**.

## Official repository preflight

Script yang benar adalah release:preflight, bukan npm run release (tidak ada script release pada package.json yang diperiksa). Tidak menjalankan perintah release lain yang bisa mutate.

```powershell
$env:R21_EXPECTED_SUPABASE_REF = 'bztprltkevacidcpjaam'
$env:R21_ALLOW_PRODUCTION_READ_ONLY = '1'
npm.cmd run release:preflight
$preflightExit = $LASTEXITCODE
Remove-Item Env:R21_ALLOW_PRODUCTION_READ_ONLY -ErrorAction SilentlyContinue
Remove-Item Env:R21_EXPECTED_SUPABASE_REF -ErrorAction SilentlyContinue
$preflightExit
```

Tidak memakai GHEVERHAN_ISOLATED_TESTS untuk bypass target Production. Jangan melewati private bucket, ledger/checksum atau schema V2 gate. BLOCKED ketika bucket public/schema belum tersedia adalah benar. Preflight memakai DATABASE_URL untuk query; DIRECT_URL baru divalidasi bentuk/consistency dan **bukan koneksi kedua**. Karena itu probe kedua di atas tetap diperlukan untuk effective direct identity/TLS. Full checksum/ledger dan bucket check dilakukan script repository, bukan digantikan oleh probe pendamping.

## Paket perubahan konfigurasi — butuh approval, belum dijalankan

1. Inventory/verify snapshot seluruh Preview/legacy yang READY dan bindings DB/storage/JWT; current env list saja tidak cukup.
2. Review menonaktifkan shared DB opt-in hanya Preview dan membatasi writer legacy/protection melalui mekanisme resmi. Penghapusan env saja tidak mencabut deployment lama; jangan menghapus deployment atau memutar credential tanpa persetujuan.
3. Jika diperlukan strict source guard, lakukan source/CI remediation terpisah dengan regression. Jangan menganggap deploy guard baru mencabut writer lama.
4. Buktikan role Preview tidak memiliki write pada target yang dilindungi lewat grants/RLS menggunakan credential Preview resmi, tanpa write probe. Bila tidak ada binding, gunakan bukti fail-closed runtime; jangan menganggap missing current env otomatis membuktikan deployment lama aman.

## Urutan menuju controlled release

Effective runtime/direct target dan grants/TLS -> Preview/legacy writer control -> grant gate V2 dan CI final PASS -> review private bucket compatibility -> approval spesifik private transition -> approval Prisma migration V2 dengan tepat 1 pending / checksum cocok -> schema/grants/ledger 11 complete dan read-only preflight -> reviewed merge/controlled deployment exact SHA -> smoke dummy yang disetujui. Cleanup hanya dengan approval terpisah. Residual tujuh High dan visual/operational gates dari FINAL_RELEASE_READINESS.md tetap berlaku.

Tidak menjalankan merge, deployment, migration, bucket/env/credential change, session invalidation, write smoke test atau cleanup activation.

## Exact SHA dan CI

Baseline 7b3d93490af204fc2449567fb9ca63629526081c memiliki dua CI SUCCESS berikut; ini **bukan** bukti SHA baru. Completion record SHA dan run final diperbarui pada PR #87 setelah push.
- https://github.com/Assyauq26/Gheverhan/actions/runs/39703538240 — SUCCESS
- https://github.com/Assyauq26/Gheverhan/actions/runs/39703538244 — SUCCESS

CI itu bukti baseline source/isolated regression, bukan effective Production identity. Pengujian baru terdaftar di unit dan release-preflight integration suite yang sudah dijalankan workflow PR. Keputusan runtime preflight: **BLOCKED / NO-GO**, dengan akses CLI operator PASS dan MCP tetap isu integrasi terpisah.
