# R19 — Validasi lintas PR

Sumber PR dibaca dari head aktual GitHub, bukan hanya nama branch historis.
#53 dipakai sebagai referensi integrasi historis. Target perbaikan melanjutkan
#58; main `4f141dd` tetap tidak berubah.

| PR | Head diperiksa | Cakupan / kesimpulan source |
| --- | --- | --- |
| #40 | b7f4e04a5d31 | Dua source guard identik dengan kandidat. |
| #41 | 06365d4fb21a | Lifecycle coupon identik; UI marketing memperoleh perbaikan clock #46. |
| #42 | 32f074dd4009 | Issuer/audience/HS256 tetap dipertahankan; ditambah validasi claims/version/revocation P1. |
| #44 | 99f48293cffa | Guard dipertahankan dan diperkuat #56 menjadi callable entrypoint assertion. |
| #45 | 685816356864 | Ancestor; pagination source tercakup. |
| #46 | 00a9b99a1e60 | Clock deterministik tercakup; selisih marketing hanya label kuota ditahan/terpakai. |
| #53 | 8984334d4c6c | Ancestor integrasi; guard lebih baru #56 menggantikan versi historis. |
| #54 | 4e09768db1f7 | Navigation source identik sebelum backport runtime; native Link dipertahankan. |
| #55 | 1b16d705bc65 | ProductCard source identik; tidak ada nested wishlist button dalam link. |
| #56 | a77991f6c853 | Ancestor; 14 source file relevan identik. |
| #57 | 97614e0c32d6 | Ancestor; 15 source file relevan identik, termasuk cart concurrency. |
| #58 | dbb529e1b606 | Ancestor; retention diagnostik dan request identity dipertahankan. |

Tidak semua commit menjadi ancestor karena integrasi sebelumnya memakai
cherry-pick; perbandingan source membedakan kesetaraan perilaku dari ancestry.
Tidak ada konflik source yang belum diselesaikan pada kandidat ini.

Validasi lokal dengan PostgreSQL 17 disposable:

| Area | Bukti | Hasil |
| --- | --- | --- |
| Direct seed/bootstrap/migration containment | database-entrypoints.test.ts, schema UUID sendiri | PASS, 1 test |
| Cart, checkout, order, voucher quota, stok, refund/shipping, concurrency | Lima file integration dijalankan bersama, termasuk guard di atas | PASS, 85 total setelah integrasi #38, termasuk guard |
| Product image lifecycle, private media, RBAC, marketing SSR dan cart checkout | product-browser.ts | PASS, 16 pemeriksaan |
| Payment proof, operations, permission/page denials, inventory lifecycle | operations-browser.ts | PASS, 20 pemeriksaan |
| Unit + containment offline | Pinned Node 22 container, network none, read-only, cap-drop, no-new-privileges, tanpa secret | PASS, 199 unit + 25 containment |
| Runtime React yang benar | Replay hydration fixture, dua Chromium | Before FAILED #418; after PASS |
| Navigasi empat viewport | Kandidat kedua backport, tanpa probe | PASS, kualifikasi 10 ×36 pada 4f057e4; gate HEAD akhir terpisah |

#37 `fc738f5` dan #38 `134c6f9` diintegrasikan dengan normal merge lokal ke branch
#61 (masing-masing `6d147a7`, `1bffcd5`), tanpa konflik tersisa atau merge main.
PostgreSQL/business dan browser di atas dijalankan kembali pada source gabungan.
Delapan tes auth PostgreSQL tambahan membuktikan revocation/reset/limiter/RLS.
Cron auth diuji fail-closed dan proof preservation tetap dilindungi regression.
PR sumber dipertahankan, tidak dibuat pengganti auth/cron yang duplikat.
Tidak ada Supabase bersama yang dimigrasikan. Hasil gate akhir ada pada SHA persis
PR #61 dan artifact CI; laporan ini tidak mencampur run source sebelum/sesudah P1.
