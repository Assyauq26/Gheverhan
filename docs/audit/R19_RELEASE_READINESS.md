# R19 — Kesiapan review dan release

**NOT READY untuk merge/deploy production.** [PR #61](https://github.com/Assyauq26/Gheverhan/pull/61)
adalah hasil reviewable; tidak ada merge/deploy/migrasi Supabase bersama yang diotorisasi.

Dua akar P0 terbukti dengan before/after: hydration cursor replay upstream #35494
serta lost wakeable ping #36134. Kedua backport minimal memakai checksum guard dan
regresi runtime asli. P0 terkualifikasi **10/10 full runs pada `4f057e4`**:
36 pemeriksaan/run di 390/768/1024/1360px, Node22.22.0, Chromium153.0.8010.12,
nol hydration/page errors. Bukti lengkap disimpan di repo, bukan gabungan eksperimen.

Setelah kualifikasi tersebut, source auth #37 dan cron #38 diintegrasikan, dependency
same-major diperbarui, session revocation dan limiter atomik ditambahkan. Validasi pada
source gabungan: **199 unit +25 containment offline, 85 PostgreSQL bisnis/guard +8 auth,
16 product +20 operations browser, replay hydration pinned, typecheck/lint/build/Prisma PASS**.

Gate akhir adalah **10 consecutive full runs pada HEAD akhir PR #61**, dengan satu build,
Node/browser identik, 9 checkpoint per viewport dan nol page/hydration errors. Hasil
kualifikasi lama tidak menggantikan gate ini. Matriks akhir disimpan pada artifact/check
`Sprint 2E isolated PostgreSQL and browser regression`, juga dicetak ke log dan diringkas
dengan SHA persis di deskripsi PR. Checkout CI memakai PR head SHA, bukan synthetic merge.
Jika gate akhir gagal atau belum selesai, status P0 akhir tetap belum memenuhi DoD.

Blocker production yang tetap terbuka:

- Dependency: 2 Critical/8 High/5 Moderate pada full audit; major upgrade memerlukan review.
- Review dan penerapan terkendali migrasi auth, trusted role/RLS, mail provider, key JWT terpisah.
- CRON_SECRET/jadwal/batch/backlog dan kebijakan rekonsiliasi finansial pemilik.
- Assessment exposure runtime PostgreSQL tracked; PR #39 tetap HOLD.
- Preview tepat untuk SHA akhir dan effective provider/repository settings belum terverifikasi.

Tidak ada klaim bahwa satu Preview lama atau check Vercel kuota-gagal memvalidasi head baru.
Source Next16 dan probe eksperimen bukan perilaku aplikasi release. Backport hanya
production App Router; development renderer tidak dinyatakan diperbaiki oleh loader.
Upgrade Next berikutnya harus memvalidasi ulang checksum atau menghapus backport saat
upstream fix sudah tersedia. Main tetap `4f141dd9e7aec14cfceb9568dd136a40b9a833e4`.
