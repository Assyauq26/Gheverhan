# R19 — Akar masalah hydration

Finding **R19-P0-01 · Critical · ROOT CAUSE ESTABLISHED**.

Runtime App Router Next 15.5.26 memakai React bundled
`19.2.0-canary-0bdb9206-20250818`, walaupun dependency publik React adalah 18.3.1.
Tes React 18 sebelumnya tidak melatih jalur hydration runtime ini.

React dapat mengulang HostComponent setelah lazy content Flight selesai dalam
microtask tanpa mengembalikan hydration cursor ke node host yang sudah diklaim.
`beginWork` kemudian mencoba mencocokkan child cursor dengan host itu sendiri
sehingga menghasilkan #418. Sumber terpasang:
`next/dist/compiled/react-dom/cjs/react-dom-client.production.js`, fungsi
`replaySuspendedUnitOfWork`, awal sekitar baris 11186; cabang `case 5` hanya
memanggil `resetHooksOnUnwind(next)` lalu mengulang `beginWork`.

## Bukti sebelum dan sesudah

1. Probe respons JS khusus diagnosis menangkap #418 natural di `/shop`, 390px,
   pada build eksperimen `b932e44` (prefetch dimatikan hanya untuk isolasi).
   Fiber yang diulang adalah `main.container.py-2.md:py-6`; cursor masih berada
   **di dalam** main pada comment `$~`, diikuti template `B:0` dan skeleton.
   Bukti lengkap yang aman: `evidence/r19/natural-hydration-claim.json`.
   Tidak ada cookie, header, token, atau halaman akun dalam bukti ini.
2. Harness `tests/integration/react-hydration-replay.ts` memakai runtime App Router
   yang benar serta lazy chunk dengan status protocol Flight. HTML SSR identik
   sebelum/sesudah: `<main class="hydration-fixture">fixture value</main>`.
   Runtime asli **FAILED #418**, stack `beginWork → replaySuspendedUnitOfWork`.
   Runtime dengan backport **PASS**, nol recoverable errors. Ini dibuktikan pada
   Chromium 154.0.8037.57 dan pinned 153.0.8010.12.
3. Plain Promise tanpa status protocol Flight tidak memaksa jalur replay tersebut;
   hasil negatif fixture awal itu bukan bukti bahwa bug tidak ada.
4. Regresi VM mengeksekusi fungsi replay dari dependency asli: cursor child salah
   sebelum patch, host yang sama berhasil diklaim setelah patch. Browser harness
   melatih renderer lengkap, bukan hanya model VM.

Perbaikan upstream: [facebook/react#35494](https://github.com/facebook/react/pull/35494),
commit `c18662405cc4`. Backport menambahkan pemulihan cursor sebelum HostComponent
replay. Tidak menonaktifkan pemeriksaan mismatch atau menyembunyikan error.
Implementasi: `frontend/scripts/webpack/react-runtime-backports-loader.cjs`.
Sumber runtime diverifikasi SHA-256
`9bcaacd92279559075407d2fb09b19893f03f9b93ad74eb0ef42b31b66f6053e`;
perubahan dependency yang tidak cocok menggagalkan build dan wajib direview.
Lisensi dan atribusi disimpan bersama loader.

## Hipotesis lain

| Hipotesis | Hasil investigasi |
| --- | --- |
| H1 waktu/locale/browser state | Fixture deterministik tanpa data aplikasi tetap menghasilkan #418; bukan penjelasan untuk reproduksi yang terbukti. |
| H2 invalid HTML | Fixture hanya main dan teks sah; markup kartu #55 tetap tercakup. |
| H3 competing navigation | Native Link #54 dipertahankan; hydration fixture tidak melakukan navigasi. |
| H4 streaming/replay | Terbukti: lazy Flight child → host replay tanpa cursor restore → #418. |
| H5 auth/session | Fixture hydration tidak memakai auth, cookie, atau database. |
| H6 browser/tooling | Reproduksi sebelum/sesudah pada kedua Chromium. Probe terinstrumentasi tetap dipisahkan dari gate final tanpa probe. |

Regresi: `react-hydration-replay.test.ts`, `react-hydration-replay.ts`.
Bukti browser pinned: `evidence/r19/hydration-replay-before.json` dan
`evidence/r19/hydration-replay-after.json`.
PR diagnosis sebelumnya: https://github.com/Assyauq26/Gheverhan/pull/58.
PR fix dicatat pada laporan kesiapan setelah publikasi.

Hasil negatif R18 serta satu CI hijau tidak dipakai sebagai pembuktian stabilitas.
Klaim di atas berlaku untuk jalur replay yang sudah direproduksi; gate penuh tetap
memantau seluruh error browser agar penyebab lain tidak terlewat.


## Referensi fix dan validasi

PR: [#61](https://github.com/Assyauq26/Gheverhan/pull/61). Commit kedua backport:
`4f057e4db7c167368ad47cd8ba1b56fb16739f52`; kualifikasi 10/10 ×36 PASS pada commit
tersebut. Pembaruan kompatibel Next15.5.28 tetap membawa source renderer yang identik
(checksum guard lulus build). Gate source akhir setelah P1 wajib dipisahkan dan
hasil per-SHA dirujuk melalui deskripsi PR/check, sesuai `R19_STABILITY_MATRIX.md`.
Build/typecheck/lint dan regresi runtime lulus. Risiko maintenance backport tetap
memerlukan review ketika dependency Next berubah; development renderer tidak tercakup.


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
