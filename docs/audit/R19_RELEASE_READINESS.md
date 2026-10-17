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
Node/browser identik, 11 checkpoint per viewport (44 total) dan nol page/hydration errors. Hasil
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
upstream fix sudah tersedia. Main tidak diubah oleh R19. Recheck menemukan PR #59 sudah digabung oleh pekerjaan lain: `8e2a4f4`; perubahan tersebut diintegrasikan ke branch fix dengan normal merge.


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
