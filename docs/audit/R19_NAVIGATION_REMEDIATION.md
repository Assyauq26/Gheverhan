# R19 — Remediasi navigasi

Finding **R19-P0-02 · Critical · ROOT CAUSE ESTABLISHED**.

Di runtime React bundled Next 15.5.26, `pingSuspendedRoot` dapat kehilangan ping
wakeable yang selesai ketika renderer sedang bekerja. Bila root perlu restart
namun `executionContext & 2` menunjukkan render sedang berlangsung, kode lama
melewati restart sekaligus tidak mencatat ping. `markRootSuspended` kemudian
menandai lane yang datanya sudah selesai sebagai suspended, tanpa retry.

Sumber: `next/dist/compiled/react-dom/cjs/react-dom-client.production.js`, fungsi
`pingSuspendedRoot`, sekitar baris 11724. Backport upstream
[facebook/react#36134](https://github.com/facebook/react/pull/36134), commit
`c0d218f0f3e02ed581f74096e56baa947213135d`, mencatat ping pada cabang tersebut
serta mempertahankan restart normal di luar render.

## Bukti kausal

- Trace aplikasi: RSC lengkap diterima; seluruh model yang diperlukan tersedia;
  server-patch diterapkan dan cache memuat marker halaman benar. Action queue
  kosong tetapi UI tetap halaman lama. Root menunjukkan pending/suspended lanes
  `49152`, pinged `0`. Respons selesai dan cache benar tidak menjamin render retry.
- Aplikasi Next minimal tanpa Prisma/auth/komponen bisnis juga macet; masih macet
  setelah observasi tambahan 10 detik. Chromium sistem gagal setelah 9 siklus,
  pinned 153 gagal setelah 12. Menghapus provider, memperkecil shell, memakai
  anchor biasa pada menu, atau menghapus interception bukan solusi.
- Regresi terhadap fungsi runtime asli: sebelum backport 2 PASS / 1 FAIL;
  setelah backport 3 PASS / 0 FAIL. Kasus gagal memastikan data selesai tetap
  eligible untuk retry ketika restart sedang tidak aman.
- Minimal app dengan backport lulus 20 siklus. Next 16/React baru juga lulus
  eksperimen pembanding, tetapi major upgrade itu tidak diterapkan ke aplikasi.
- Kandidat dengan kedua backport lulus 36 pemeriksaan pada 390/768/1024/1360px.
  Kualifikasi sepuluh run identik dicatat terpisah dalam matriks stabilitas.

Implementasi final memakai loader Webpack kecil dengan checksum guard, bukan
modifikasi node_modules, timeout baru, reload paksa, atau routing custom.
Native NextLink, useLinkStatus, search state, RBAC, SSR, serta SEO dipertahankan.
Regresi: `tests/unit/react-lost-ping.test.ts` dan suite navigation empat viewport.
Bukti deterministik: `evidence/r19/lost-ping-before.txt` dan `lost-ping-after.txt`.

## R19-P2-03 — Input inventori pada tablet

Severity **Medium**. Pada 768px, sidebar + kontrol filter menyisakan input kurang
dari 180px karena label mengizinkan shrink sampai nol. Browser assertion yang
sudah ada menangkapnya setelah viewport diperluas. `src/app/admin/inventory/page.tsx`
menambahkan `sm:min-w-[180px]` pada label, sehingga flex-wrap mempertahankan input
terbaca. Tidak menaikkan batas waktu atau mengurangi assertion overflow/aksesibilitas.

Risiko tersisa: backport hanya menargetkan production App Router runtime yang
checksum-nya diverifikasi. Upgrade Next harus menghapus atau memvalidasi ulang
backport; development renderer tidak dinyatakan telah diperbaiki oleh loader ini.
Semua eksperimen berada di worktree terpisah; build release tidak memuat probe.


## Referensi fix dan validasi

PR: [#61](https://github.com/Assyauq26/Gheverhan/pull/61). Commit kedua backport:
`4f057e4db7c167368ad47cd8ba1b56fb16739f52`; kualifikasi 10/10 ×36 PASS pada commit
tersebut. Pembaruan kompatibel Next15.5.28 tetap membawa source renderer yang identik
(checksum guard lulus build). Gate source akhir setelah P1 wajib dipisahkan dan
hasil per-SHA dirujuk melalui deskripsi PR/check, sesuai `R19_STABILITY_MATRIX.md`.
Build/typecheck/lint dan regresi runtime lulus. Risiko maintenance backport tetap
memerlukan review ketika dependency Next berubah; development renderer tidak tercakup.
