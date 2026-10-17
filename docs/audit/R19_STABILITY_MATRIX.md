# R19 — Matriks stabilitas

Gate final membutuhkan **10 consecutive full runs pada HEAD dan build identik**.
Hasil baseline, probe, eksperimen minimal, kandidat, serta gate final tidak digabung.
Satu kegagalan menggagalkan gate; loop berhenti dan seluruh JSON parsial dipertahankan.

Setiap full run akhir mencakup 390/768/1024/1360px dan 44 pemeriksaan (36 pemeriksaan P0 +8 dashboard/admin #59):
shop load/pagination/sort/search/history; dashboard/products/inventory pagination;
keyboard/rapid navigation; product detail/wishlist/cart yang dibuktikan sampai DB;
anonymous login redirect; deliberate RSC failure/recovery; delay RSC 600ms asli;
assertion seluruh browser exceptions, pending clear, overflow, dan state preservation.
Tidak ada timeout yang diperbesar. Probe respons JS tidak boleh aktif pada gate.

JSON tiap run mencatat commit SHA, Node, browser, build ID, viewport, checkpoint,
status dan error. `frontend/scripts/navigation-stability-matrix.mjs` menolak jumlah
selain 10, SHA/build/browser berbeda, urutan lompat, kurang dari 44 PASS, error,
Node unsupported, viewport kurang, atau profil diagnostik. Matriks JSON/Markdown
juga dibuat saat gate gagal dan disimpan dalam artifact GitHub Actions.

CI memakai executable Chromium hasil instalasi Playwright yang dipin, bukan
berasumsi browser sistem sama. Bukti final berada pada artifact
`navigation-diagnostics-<run_id>-<attempt>` dan check PR; matrix di dalam artifact
adalah sumber hasil per-SHA. Hasil gate akhir dicatat dengan SHA persis pada deskripsi PR #61 dan artifact/check terkait.
Dokumen ini dibekukan sebelum gate agar penulisan hasil tidak mengubah SHA yang diuji.

## Kualifikasi P0 yang selesai

**10/10 PASS, 360/360 checkpoint**, SHA `4f057e4db7c167368ad47cd8ba1b56fb16739f52`,
Node22.22.0, pinned Chromium153.0.8010.12, production build identik, tanpa probe.
[Tabel sepuluh run](evidence/r19/QUALIFICATION_MATRIX.md) dan
[JSON matriks + bukti tiap run](evidence/r19/qualification-matrix.json) tersimpan di repo.
Kelompok ini dilakukan sebelum perubahan P1; **bukan gate SHA akhir PR**.

## Gate akhir source gabungan

CI checkout persis `pull_request.head.sha`; workflow mengulang sepuluh full run,
berhenti pada kegagalan pertama, dan menulis matriks meskipun run parsial gagal.
Generator memeriksa 11 checkpoint per viewport selain total 36. JSON/Markdown sintetis
disimpan 7 hari; ringkasan hasil akhir dan SHA juga berada di deskripsi PR #61 agar
status tetap dapat direview setelah artifact kedaluwarsa. Unduhan storage artifact lama
masih 403; matriks dicetak ke log untuk menyediakan bukti lewat jalur log yang tersedia.

## Kelompok sebelum gate

| Kelompok | Source / profil | Hasil dan batas |
| --- | --- | --- |
| R18 | Laporan asli docs/audits | FAILED; kelompok baseline/instrumentasi/A-B tetap terpisah |
| Awal R19, sebelum restart | dbb529e + variasi diagnostik | System baseline 1 PASS; pinned baseline FAILED admin pagination. Artefak /tmp hilang saat restart; jangan mengklaim file tersedia. |
| R19 trace aplikasi | dbb529e + CDP | FAILED; RSC/cache benar tetapi root suspended tanpa ping. |
| Minimal tanpa bisnis | 3bb4e36 + fixture 50ms | FAILED pada Chromium 154 dan pinned 153; tetap macet setelah observasi tambahan 10 detik. |
| Prefetch off | b932e44 | Tetap FAILED #418; bukan solusi dan tidak dipakai final. |
| Hydration natural passive | b932e44 + probe opsional | FAILED #418 dengan cursor `$~` di dalam main; bukti sanitized disimpan di repo. |
| React replay fixture | Runtime asli / kedua backport | Before FAILED #418, after PASS pada 153 dan 154. |
| Kandidat awal lost-ping saja | 4c92ec1 + working test expansion | Masih #418, sehingga kedua akar tidak disamakan. |
| Kandidat empat viewport | Kedua backport + input tablet | PASS 36/36 pada pinned Chromium 153. Belum dianggap gate sepuluh run. |

Percobaan dengan port 3116 bertabrakan, fixture Promise tanpa protocol Flight,
atau probe yang mengalami transform error ditandai tidak valid untuk inferensi
aplikasi. Koreksi harness (selector h1 dan menunggu URL saat item sort sama)
dipisahkan dari kegagalan aplikasi; assertion tidak dihapus atau dilonggarkan.


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
