# R21 — Infrastructure configuration assessment

Pemeriksaan read-only; **NOT READY** untuk release. Tidak membuat staging/project/server, mengubah environment live, membaca secret values, membuat share/bypass URL, atau menjalankan email/payment/cron production. Metadata aman: `evidence/r21/provider-readonly.json`.

## Vercel

Production `https://gheverhan.vercel.app` terhubung ke project `prj_J8Fao07yrACLGjiDtY3ftRcLkI2s` melalui deployment `dpl_CydWVY2Hnx8pPDuuGGDfRbK64Kb9`, READY, git/main `8e2a4f4` (#59), region sin1, Node22.x. Alias production dan main terdaftar. GET homepage dan health HTTPS200 dengan TLS verification aktif; health hanya liveness, tidak membuktikan schema/auth/provider readiness.

Source build `npm run build` melakukan security preparation, Prisma generate dan Next build; tidak migrate/seed. `npm ci --ignore-scripts` adalah install locked yang diuji. Root directory/build/install overrides efektif provider tidak tersedia pada snapshot connector, sehingga tidak dinyatakan cocok hanya dari source. Runtime/build logs ditolak403 pada koneksi Syauqi yang sesuai project. CLI Vercel tidak tersedia/credential CLI tidak terverifikasi; tidak mencoba akun lain/login/bypass. Tidak ada klaim log bersih.

Project passwordProtection disabled; SSO protection `all_except_custom_domains`, trusted IP disabled pada metadata. Observasi HTTP200 menunjukkan domain yang diuji dapat dibuka; tidak menganggap seluruh alias memakai protection identik. Git integration terkonfirmasi deployment source/git dan commit/repo. Ruleset aktif Protect Main Branch menarget default branch main: mencegah deletion/non-fast-forward, mewajibkan PR/thread resolution, tetapi0 approving reviews dan hanya unit-tests yang required; strict-up-to-date false. Endpoint branch protection terpisah403. Integration/browser belum required dalam ruleset ini; owner perlu memperkuat gate atau menerapkan approval prosedural tertulis sebelum release. Deployment approvals/kuota dan build overrides masih perlu review. Source memblokir deployment branch R21/R20 dan Netlify ignore; judul/tip memakai `[skip netlify]`. CI test tidak di-skip.

## Supabase

Ref `bztprltkevacidcpjaam`, ACTIVE_HEALTHY, Free, ap-southeast-1, PG17.6. Database size saat sampel13.626.515 byte bukan ukuran disk total/WAL/headroom. Compute SKU/disk quota pemakaian penuh/pooler settings dan inventaris backup tidak tersedia melalui tool yang dipakai; tidak mengasumsikan Micro/PITR/kapasitas.

Public41 tabel RLS enabled tanpa policy. Advisor security41 INFO no-policy adalah default-deny yang disengaja untuk server-owned schema; bukan instruksi membuka policy publik. Advisor performance16 unindexed FK/8 unused index INFO memerlukan review query terukur. [Remediasi RLS advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) dan [FK advisor](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

Bucket product-images public, limit5MiB; payment-proofs private, limit5MiB. Tidak ada policy storage.objects saat introspeksi; proof akses melalui server service-role dengan ownership/RBAC aplikasi. Source membatasi proof4MiB dan magic/MIME serta server-owned paths. Metadata private bucket bukan pengganti uji akses ownership pada deployment; source lokal/CI menguji owner/stranger/admin dan storage double.

Connector memakai postgres/BYPASSRLS, bukan role aplikasi yang telah terbukti. Privilege anon/authenticated SELECT User tidak membuka baris ketika RLS no-policy. Jangan memberi public policy/BYPASSRLS live demi membuat auth berjalan. Identity DATABASE_URL dan role/pooler efektif deployment belum terbukti; request metadata non-rahasia pemilik tetap pending.

Aggregate read-only pada project yang diperiksa:1 kandidat expiry,0 overdue review,0 paymentStatus mismatch,0 stock negatif/over-reserved. Tidak mengeksekusi cron atau menganggap project ini pasti target production. Setelah identitas/otorisasi jelas, rekonsiliasi kandidat dengan bounded batch50 dan pantau ulang; jangan menjalankan catch-up tanpa review.

## Matriks konfigurasi

| Fungsi | Keperluan | Observasi production / batas |
| --- | --- | --- |
| Runtime query | DATABASE_URL | Ada; nilai/host/pool budget tidak dibuka |
| Migration/generate | DIRECT_URL | Ada; manual direct connection/role/lock budget harus diverifikasi sebelum migrasi |
| Login/session | JWT_SECRET; cookie gh_session/default atau AUTH_COOKIE_NAME | JWT ada; entropy/validitas/isolasi nilai belum diaudit. Cookie source HttpOnly/Secure/SameSite=Lax/path/,7hari; tidak memakai fallback signing key |
| Storage/proof | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, bucket names, STORAGE_APP_NAME | Semua tercatat ada; tidak decrypt. Bucket/provider binding efektif tetap perlu konfirmasi |
| Reset password | RESEND_API_KEY, PASSWORD_RESET_FROM, PASSWORD_RESET_BASE_URL | Tidak terlihat pada metadata production; reset fail-closed, belum siap delivery. Sender/domain HTTPS/otorisasi email nyata belum terverifikasi |
| Expiry background | CRON_SECRET dan jadwal | Secret tidak terlihat; source cron02:00UTC dan endpoint auth fail-closed, batch50. Jangan test terhadap production |
| Payment/shipping | PAYMENT_PROVIDER/SHIPPING_PROVIDER dan bank/rate config | Tidak terlihat; source default manual. Default tidak membuktikan bank/rate/rekonsiliasi operational sudah disetujui; gateway real tidak diaktifkan |
| Controlled release | MAINTENANCE_MODE eksplisit0/1 | Belum ada pada metadata; profil source baru menutup halaman/API/Action/cron dan mengizinkan hanya health read-only. Belum diaktifkan live |

DATABASE_URL dan DIRECT_URL masing-masing merupakan satu env metadata record yang menarget production+preview; preview JWT punya metadata record terpisah. Ini menunjukkan sharing konfigurasi DB, bukan membuktikan isi secret atau isolasi Preview. Preview tidak dipakai untuk mutation test. Keputusan tanpa staging dihormati.

`npm run release:preflight` hanya read-only: menolak remote ref tidak cocok sebelum koneksi, memeriksa ledger/schema/role dan presence, tanpa menampilkan secret/customer rows. PASS script bukan persetujuan release, bukan validasi delivery provider/backup/key entropy/pool budget. Jalankan pada perangkat operator tepercaya setelah source review dan binding yang aman; runner ini hanya mengujinya dengan fixture lokal.
