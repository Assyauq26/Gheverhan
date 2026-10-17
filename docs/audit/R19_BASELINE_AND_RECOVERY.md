# R19 — Baseline dan recovery

Tanggal pemeriksaan: 16 Oktober 2026, Asia/Jakarta. Status: NOT READY.

- Checkout awal bersih, branch PR #58 `test/remediation-r18-hydration-failure-artifacts`, SHA `dbb529e1b6060e1ea6a26be48978c2061d7f821e`. Branch ini dilanjutkan untuk diagnosis, tanpa branch baru.
- `git fetch origin` berhasil; main tetap `4f141dd9e7aec14cfceb9568dd136a40b9a833e4`.
- Laporan asli dibaca: `docs/audits/SPRINT_0_RECOVERY_R18_DIAGNOSTICS.md`.
- PR #56 OPEN `a77991f`, #57 OPEN `97614e0`, #58 OPEN `dbb529e`; stack #58 → #57 → #56 → #53. Daftar seluruh PR terbuka diperiksa melalui GitHub CLI.
- Source navigation #54 dan product-card #55 tidak berbeda dari checkout pada path terkait. Tidak ada konflik atau perubahan belum di-commit saat mulai.
- Worktree diagnostik `/tmp/gheverhan-hydration-diagnostic` hanya tersisa registrasinya (prunable); direktori dan patch tidak tersedia. Tidak dihapus atau direkonstruksi sebagai bukti lama.
- CI head #58: unit dan isolated-integration-browser SUCCESS. Run lama 38925473100 CANCELLED. Vercel head FAILURE karena kuota deployment harian; status Preview lama tidak membuktikan deploy head.
- Artefak CI 12056987110 tersedia pada metadata tetapi unduhan storage ditolak 403. Tidak dianggap sudah dibaca.
- Node default 24.19.0 tidak sesuai engines; runner R19 memakai Node 22.22.0 yang tersedia. Next 15.5.26, React/ReactDOM 18.3.1, Prisma 5.22.0, Playwright 1.63.0.
- PostgreSQL 17 disposable baru `/tmp/r19-pg`, bind 127.0.0.1:55432; database khusus tes. Tidak memakai cluster tracked atau Supabase bersama.
- Chromium sistem 154.0.8037.57. Unduhan resmi pinned Chromium sedang diperiksa ulang; belum dianggap diuji.
- 1.481 path runtime PostgreSQL masih tracked, dihitung dari nama path tanpa membaca data.

Belum ada perubahan aplikasi. Keberhasilan CI tunggal tidak membatalkan kegagalan R18.

## Kelanjutan environment

Environment sempat restart; artefak `/tmp` fase awal tidak bertahan. Bukti lanjutan
sekarang disimpan di `/workspace/scratch/r19/evidence`. Status managed environment
revision 6 current/enforced, networking unrestricted. Cluster PostgreSQL 17 baru
berada di `/workspace/scratch/r19/pg`, hanya bind loopback port 55432.
Pinned Chromium resmi **153.0.8010.12** berhasil diunduh dan benar-benar diuji.
Kegagalan navigasi dan fixture hydration direproduksi pada pinned dan Chromium
sistem 154; blocker unduhan browser R18 sudah teratasi.

Diagnosis tetap pada #58; setelah dua akar runtime terbukti, satu branch fix
`fix/remediation-r19-react-lost-ping` dibuat. Tidak ada branch/main rewrite atau
merge/deploy production. Eksperimen detached hanya lokal: minimal streamed Link
`4db8bdd`, shell besar `fc5fa95`, minimal tanpa bisnis `3bb4e36`, prefetch off
`b932e44`, serta aplikasi dengan backport ping pertama `4c92ec1`.
Eksperimen tidak digabung ke source aplikasi final; kode final hanya backport
upstream terverifikasi, regresi, matriks, dan koreksi minimum lebar input tablet.
