# R19 — Matriks stabilitas

Gate final membutuhkan **10 consecutive full runs pada HEAD dan build identik**.
Hasil baseline, probe, eksperimen minimal, kandidat, serta gate final tidak digabung.
Satu kegagalan menggagalkan gate; loop berhenti dan seluruh JSON parsial dipertahankan.

Setiap full run mencakup 390/768/1024/1360px dan 36 pemeriksaan:
shop load/pagination/sort/search/history; dashboard/products/inventory pagination;
keyboard/rapid navigation; product detail/wishlist/cart yang dibuktikan sampai DB;
anonymous login redirect; deliberate RSC failure/recovery; delay RSC 600ms asli;
assertion seluruh browser exceptions, pending clear, overflow, dan state preservation.
Tidak ada timeout yang diperbesar. Probe respons JS tidak boleh aktif pada gate.

JSON tiap run mencatat commit SHA, Node, browser, build ID, viewport, checkpoint,
status dan error. `frontend/scripts/navigation-stability-matrix.mjs` menolak jumlah
selain 10, SHA/build/browser berbeda, urutan lompat, kurang dari 36 PASS, error,
Node unsupported, viewport kurang, atau profil diagnostik. Matriks JSON/Markdown
juga dibuat saat gate gagal dan disimpan dalam artifact GitHub Actions.

CI memakai executable Chromium hasil instalasi Playwright yang dipin, bukan
berasumsi browser sistem sama. Bukti final berada pada artifact
`navigation-diagnostics-<run_id>-<attempt>` dan check PR; matrix di dalam artifact
adalah sumber hasil per-SHA. Hasil lokal kualifikasi dicatat setelah selesai.

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
