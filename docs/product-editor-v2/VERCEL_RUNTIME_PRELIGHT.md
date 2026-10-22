# Vercel runtime preflight

Tanggal 22 Oktober 2026. Jalur resmi CLI operator, bukan MCP Codex. MCP OAuth remote BLOCKED tidak berarti akses akun gagal. Tidak mengulang OAuth localhost.

Bukti CLI: user mrifatsyauqi21-1024, team syauqi3, project prj_J8Fao07yrACLGjiDtY3ftRcLkI2s. Git integration Assyauq26/Gheverhan, main; frontend; Node 22.x/Next.js. Domain gheverhan.store mengarah ke dpl_621bV44pjJVzHJ5NuCQNTFU4JEb1 READY, source b2d18192d99db379b6894a51abaaded22cc329e0. Bukan PR87. Metadata function output sin1 berbeda dari Sandbox iad1.

Production env names yang dibaca: DATABASE_URL, DIRECT_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, kedua bucket override, STORAGE_APP_NAME, JWT_SECRET, CRON_SECRET, RESEND_API_KEY, PASSWORD_RESET_FROM, PASSWORD_RESET_BASE_URL, MAINTENANCE_MODE. Secret tidak dibaca/pull; presence bukan validitas/snapshot deployment. MAINTENANCE_MODE Config 0. Cleanup flag tidak tercantum. Peringatan npm dist-tags background tidak membatalkan hasil read project yang berhasil.

## Perintah Windows PowerShell

```powershell
vercel.cmd project inspect gheverhan --scope syauqi3 --non-interactive
vercel.cmd env ls --environment production --scope syauqi3 --project gheverhan
vercel.cmd env ls --environment preview --scope syauqi3 --project gheverhan
vercel.cmd inspect https://gheverhan.store --scope syauqi3
vercel.cmd list gheverhan --environment production --scope syauqi3
```

Jangan menjalankan bare vercel.cmd, env pull, env run, debug atau mencetak credential. Metadata Config bisa tampil; redaksi output sebelum diarsipkan. Inspect deployment/SHA, protection, git auto-deployment/ignored-build rules dan seluruh queued/running termasuk pagination tepat sebelum cutover. Repo binding main membuktikan potensi deploy dari merge, bukan membuktikan rules efektif/semua jalur telah dihentikan. Tidak ada kontrol deployment yang diubah.

## Target identity dan role: BLOCKED

Environment resmi sesi tidak memiliki secrets/runtime variables. Nilai DSN/SSL/pooler/bucket efektif tidak dibaca. Operator harus membuktikan target DB/ref/schema, direct5432 versus pooler 6543 (sesuaikan endpoint aktual), TLS dan role melalui kanal resmi terlindungi; jangan menebak berdasarkan nama project. Jalankan preflight sebagai role aplikasi, bukan inspection postgres. DIRECT_URL operator DDL privilege berbeda dari role runtime.

Dari environment operator yang telah terverifikasi, Node 22 dan dependency terkunci:

```powershell
Set-Location frontend
$env:R21_EXPECTED_SUPABASE_REF = 'bztprltkevacidcpjaam'
$env:R21_ALLOW_PRODUCTION_READ_ONLY = '1'
npm.cmd run release:preflight
```

Tidak mengisi/mengubah credential di sini. Flag bukan bukti target. Preflight read-only saat schema V2 belum ada/private bucket belum siap seharusnya BLOCKED. Detail keterbatasan di OPERATOR_READ_ONLY_PREFLIGHT.md. Status Production preflight **BLOCKED**, bukan PASS dari CLI identity/env presence.
