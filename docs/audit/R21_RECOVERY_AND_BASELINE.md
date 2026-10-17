# R21 — Recovery dan baseline

Tanggal 17 Oktober 2026 UTC. Status awal **NOT READY**. Keputusan pemilik: tidak membuat staging terpisah; ketentuan staging R19/R20 dan R21_PRODUCTION_PREFLIGHT adalah catatan historis yang digantikan keputusan ini. Seluruh mutation test tetap lokal/disposable; risiko managed production tetap wajib dibuktikan atau diterima secara eksplisit.

- `git fetch --all --prune` berhasil. Main8e2a4f475333b1beb68063e6e060aa1247e2b90c memuat #59.
- #60 OPEN Draft491a1dc; #61 OPENafb8b34; #62 OPEN Draftae9abac, base#61; #63 OPEN Draftd002623, base main; #64 OPEN Draft341f2e9, base main.
- #64 tepat satu commit dokumentasi di atas #63, tanpa perubahan runtime. Branch baru `fix/r21-production-hardening` dimulai dari341f2e91b1a12c1410f82acd05d91ac07343cabe; tidak merge ulang #60–#63. Ancestry normal merge R20 tetap dipertahankan. PR baru adalah kandidat terlengkap; PR lama tidak dihapus/di-merge berantai.
- Kedua workflow #63 SUCCESS pada d002623; #64 unit SUCCESS dan integration masih berjalan pada snapshot recovery. Hasil historis tersebut bukan bukti source final R21.
- Working tree asli `/workspace/Gheverhan` masih pada dbb529e dengan WIP next-env/navigation/docs/probe. Tidak reset/stash/overwrite. Worktree R20 tetap bersih; R21 memakai `/workspace/scratch/r21/app` dan dependency sendiri.
- Laporan R19/R20 dan R21 preflight ditelaah. Baseline actual npm audit:0Critical/7High/2Moderate. Next15.5.28, React18.3.1 publik, runtime bundled19.2 canary, Prisma5.22.0, Vitest4.1.11, Tailwind3.4.19. Tidak memakai severity pengganti.
- Environment revision39 current/enforced unrestricted; tanpa secret/runtime/outbound identity bindings. Akses connector provider tidak membuktikan credential aplikasi tersedia di runner.
- Production Vercel domain sesuai projectprj_J8Fao07yrACLGjiDtY3ftRcLkI2s, deploymentdpl_CydWVY2Hnx8pPDuuGGDfRbK64Kb9 main8e2a4f4, regionsin1, Node22.x. Supabasebztprltkevacidcpjaam ACTIVE_HEALTHY, Free, ap-southeast-1/PG17.6. Keterkaitan DATABASE_URL production dengan Supabase ini belum terverifikasi; nama tidak dijadikan bukti.
- Catalog/ledger Supabase read-only mengonfirmasi lima migrationfinished, checksum historis tersedia; SessionRevocation/AuthRateLimit/User.sessionVersion belum ada. Dilarang menjalankan auth kandidat terhadap schema ini sebelum migrasi yang disetujui.
- Source memblokir automatic deployment branch R21 pada Vercel/Netlify sebelum push. Tidak membuat deployment/project/server baru. CI test tetap aktif.

Bukti aman metadata PR berada pada scratch R21; laporan akhir merujuk hasil per-SHA final. Tidak membaca dump PostgreSQL tracked (#39), secret values, customer rows, atau mengubah konfigurasi live.

Recheck sebelum freeze: default branch GitHub main; ruleset aktif hanya unit-tests required dan0 approval, integration/browser belum mandatory. Kedua workflow #63 tetap historis SUCCESS; check aktual #64 dicatat di metadata recovery, bukan dipakai untuk qualification R21.

Review lanjutan PR #61 menemukan P1 rate-limit lintas-environment yang masih berlaku pada kandidat dcdf77f. Temuan direproduksi lokal, kandidat dihentikan, lalu namespace global/identitas dan pemeriksaan privilege DELETE ditambahkan. Hasil parsial dcdf77f disimpan sebagai upaya yang superseded; source dan bukti SHA itu tidak diklaim sebagai kandidat akhir.
