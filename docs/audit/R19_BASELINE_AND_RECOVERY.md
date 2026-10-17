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
Eksperimen tidak digabung ke source aplikasi final; kode P0 hanya backport
upstream terverifikasi, regresi, matriks, dan koreksi minimum lebar input tablet.
Setelah gate P0 10/10, tindak lanjut P1 mengintegrasikan #37/#38 dan kontrol sesi
serta limiter atomik; cakupan final dijelaskan di laporan security dan PR #61.


## Pemeriksaan akses aktual dan referensi hasil akhir

Production HTTPS200; exact Preview lama `gheverhan-j810hetwu-syauqi3.vercel.app`
dan branch Preview #58 `gheverhan-git-test-remediation-r18-hydration-fai-ca4477-syauqi3.vercel.app`
HTTPS200 dengan trust TLS aktif. Ini bukan bukti deploy SHA akhir #61.
Domain plural `results-receiver.actions.githubusercontent.com` reachable (HTTP404
pada root); download log GitHub berhasil, download storage artifact lama tetap403.
Effective branch protection/workflow permissions GitHub403; Vercel project API
pada koneksi Syauqi yang dipilih forbidden/auth error. Tidak mencoba akun lain,
provider write, atau bypass. Pinned Chromium berhasil diunduh dari sumber resmi.

Satu PR perbaikan [#61](https://github.com/Assyauq26/Gheverhan/pull/61) melanjutkan
#58 dan mempertahankan seluruh commit; semua eksperimen dan WIP diagnosis tetap
tersimpan lokal. Bukti baru berada di scratch persisten dan subset sintetis di
`docs/audit/evidence/r19`. Tidak menyatakan artefak /tmp awal yang hilang tersedia.


## Integrasi perubahan main yang baru terdeteksi

Recheck sebelum gate akhir menemukan PR #59 sudah masuk main (`8e2a4f4`), sedangkan
baseline awal R19 adalah `4f141dd`. R19 tidak menulis main. Source dashboard/nav/tests
#59 dipertahankan melalui normal merge ke branch fix; konflik workflow diselesaikan
dengan mempertahankan loop10, JSON gagal, dan screenshot dashboard sintetis #59.
Skenario baru dijalankan pada empat viewport: final **44 checkpoint/run**, 11/viewport.
Assertion KPI pada viewport tambahan 768/1024 mengikuti grid dua kolom sampai breakpoint
xl1280; assertion asli 390 dan1360 tetap sama. Tidak mengurangi assertion asli mana pun.
Gate awal `8fe5029` dihentikan karena basis berubah; hasilnya tidak digabung ke gate final.
Hasil lint/type/build dan regresi source gabungan #59 harus diverifikasi ulang sebelum
klaim final. SHA akhir dan hasil berada pada deskripsi/check PR #61.
