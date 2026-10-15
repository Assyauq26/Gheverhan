# Final dead code review, cleanup, dan handover MVP

Tanggal: **14 Oktober 2026 (UTC)**. Repository `Assyauq26/Gheverhan`, branch `chore/sprint-0-codebase-audit-cleanup`, [Draft PR #19](https://github.com/Assyauq26/Gheverhan/pull/19). Baseline review `aca835aaf1d0cb8e25fa3d8d843cdd781d64d845`.

**Status: final dead code review selesai, cleanup terfokus selesai, seluruh validation gates PASS.** Dua fungsi dan satu tipe tanpa consumer dihapus; tiga output JUnit generated dihapus dan di-ignore. Tidak ada route, API, komponen, hook, dependency, fitur customer/auth/RBAC/checkout/payment/shipping, schema, seed, atau migrasi yang dihapus. Tidak ada pembukaan/perubahan artefak PostgreSQL, akses Supabase production, merge, atau deploy yang dijalankan.

## 1. Acuan dan batas review

[Laporan source Sprint 0](SPRINT_0_SOURCE_AUDIT.md), riwayat [cleanup](CODEBASE_CLEANUP_REPORT.md), [containment](SPRINT_0A_CRITICAL_CONTAINMENT.md), dan [backport PR #18](PR18_CI_BACKPORT.md) dipakai sebagai konteks. Review ini tidak mengulang npm audit/CVE, audit CI, atau konfigurasi GitHub. `npm ci` memakai `--no-audit --no-fund` agar validasi install tidak memulai audit baru. Tidak ada scanner/dependency baru dipasang.

Metode terfokus: compiler TypeScript dengan noUnusedLocals/noUnusedParameters, resolusi import/alias dan referensi simbol melalui API compiler yang sudah terpasang, pencarian referensi source/tests/config/scripts, serta pemeriksaan consumer framework/provider. Seluruh **132 file TS/TSX source** masih terjangkau dari entrypoint App Router sebelum dan sesudah cleanup; tidak ada orphan file aplikasi yang terbukti aman dihapus. Compiler tidak menemukan unused import/local/parameter. Sebelum cleanup terdapat 13 ekspor tanpa consumer; tiga dihapus, sepuluh sengaja dipertahankan di bawah.

Analisis ekspor tanpa consumer bukan instruksi menghapus semua kemampuan yang belum tersambung. Penilaian ini berlaku pada checkout repository yang diperiksa, bukan bukti universal bahwa kode tidak pernah dipakai di luar repository.

## 2. Perubahan yang dilakukan dan bukti aman

| File / simbol | Perubahan dan bukti |
| --- | --- |
| `frontend/src/lib/utils.ts`: `slugify` | Hapus fungsi generik tanpa import, call, registry, atau consumer test/script. Fungsi tidak memiliki side effect saat module di-load. Tidak ada alur product creation aktif yang bergantung padanya; aturan slug untuk CRUD baru perlu dirancang tersendiri |
| `frontend/src/modules/cart/cart.service.ts`: `cartCount` | Hapus helper query dua langkah yang tidak dipanggil. Badge aktif membaca properti **cartCount** dari `getStorefrontUserContext`/`getCurrentUser`; count cart aktif berasal dari `getCartView` dan event client. Properti bernama sama bukan pemanggilan helper yang dihapus. Add/update/remove/quick-add dan perhitungan harga/count aktif tidak berubah |
| `frontend/src/modules/catalog/catalog.service.ts`: `ProductWithRelations` | Hapus alias tipe detail tanpa consumer. `productDetailInclude` dan query detail tetap aktif; listing memakai `Parameters<typeof toCardData>[0]`, sehingga kontrak card terinferensi tetap sama |
| `frontend/src/components/storefront/product-listing.tsx` | Perbarui komentar supaya tidak menyebut alias tipe yang dihapus. Tidak ada perubahan render, props, sorting, atau kelas CSS |
| `test_reports/pytest/all_results.xml`, `pytest_results.xml`, `sec_results.xml` | Hapus tiga output JUnit generated yang tidak menjadi fixture/input source atau build. Ringkasan historis `test_reports/iteration_1.json` dan `iteration_2.json` tetap dipertahankan |
| `.gitignore` | Tambah aturan scoped `/test_reports/pytest/` agar output tersebut tidak tracked lagi. Tidak memperluas ignore terhadap source/tests/JSON historis |

Tidak ada perubahan manifest atau lockfile. SHA-256 lockfile sebelum/sesudah `3eea0888c85f52b41599ec7042917051308f73431eb98a0c088732981d851b66`.

## 3. Kode yang dipertahankan

### Consumer dinamis/framework yang nyata

- Next.js page/layout/loading, route HTTP handlers, metadata/generateMetadata dan dynamic exports adalah entrypoint framework. Seluruh 25 page dan 24 API handlers dipertahankan, termasuk webhook routes.
- Semua komponen dan hook aktif mempunyai consumer source. React Server Actions/form callbacks dan parameter `_prev` merupakan kontrak form, bukan alasan menghapus handler.
- Payment/shipping provider dipilih melalui registry dan environment. Midtrans/Tripay/J&T/KiriminAja masih diimport/diinstansiasi dalam registry; adapter belum lengkap bukan dead module. Provider manual tetap aktif; gateway/webhook tidak diaktifkan oleh cleanup.
- Prisma client dihasilkan ke node_modules; schema, seed, bootstrap dan migrasi adalah entrypoint tooling/operasional, bukan unused source hanya karena tidak diimport page. Script DB tidak dijalankan.
- Tailwind/PostCSS config, Netlify plugin, Vitest/Playwright config, type packages, dan CLI tsx/Prisma merupakan consumer tooling. Tidak ditemukan computed module import yang tidak dapat diresolusikan dalam source yang diperiksa; registry selection tetap ditinjau terpisah dari import statis.
- Thin proxy Python tetap menjadi ingress glue untuk platform; tidak dihapus sebagai backend bisnis duplikat. `.emergent`, marker platform, dan `.gitconfig` tidak diklasifikasikan aman dihapus hanya berdasarkan tidak adanya import aplikasi.

### Sepuluh ekspor tanpa consumer aktif yang sengaja ditahan

| Ekspor | Alasan / kebutuhan nyata untuk handover |
| --- | --- |
| `ROLE_PERMISSIONS` | Declarative role policy, berbeda dari pemeriksaan permission DB yang aktif. Ada mapping lain di seed; deduplikasi harus dilakukan bersama desain role/provisioning, tanpa mengubah seed pada cleanup ini |
| `requireAdmin` | Guard RBAC yang disiapkan. Guard `requirePermission`/layout saat ini tetap dipakai; penghapusan guard keamanan bukan prioritas cleanup |
| `adjustStock` | Fondasi Inventory/Product Management; belum ada UI/action yang memanggilnya. Perlu permission, validasi dan concurrency tests sebelum dihubungkan |
| `getPaymentDetail`, `getOrderById`, `getShipmentByOrder` | Query detail untuk backoffice yang belum tersambung. Bukan API endpoint atau bukti detail UI sudah tersedia; future consumer harus menegakkan ownership/permission |
| `expireStaleOrders` | Kemampuan expiry order yang belum punya scheduler/consumer. Menjadi backlog wiring dan actor/status correctness, bukan diaktifkan atau dihapus |
| `getRecentlyViewed` | `trackView` sudah dipanggil PDP; pembacaan/section riwayat belum tersambung |
| `listReviews`, `answerQuestion` | Review/Q&A tetap fitur aktif; helper listing dan official-answer workflow belum tersambung ke UI/action |

Tidak ditemukan orphan component/hook/service file. Sepuluh ekspor di atas terbukti **belum dipanggil** tetapi sengaja menjadi kemampuan backlog, bukan dinyatakan fitur lengkap atau dihapus sebagai sampah.

### Dependency dan generated file yang ditahan

Tidak ditemukan consumer import aktif untuk empat Radix packages accordion/dialog/label/tabs, testing-library React/jest-dom, dan jsdom. Ini kandidat dependency belum dipakai pada suite sekarang; tidak otomatis dianggap aman dihapus karena persiapan UI/test dan peer/tooling resolution. Tidak ada dependency removal/upgrade atau lockfile regeneration pada final review ini. Radix Slot, React/ReactDOM, Prisma dan dependency runtime lain memiliki consumer; plugin/build/CLI/type dependencies ditinjau lewat konfigurasi, bukan import runtime saja.

`next-env.d.ts` dipertahankan sebagai deklarasi Next.js. Perubahan generated oleh production build dikembalikan ke byte baseline. `.next`, node_modules, tsbuildinfo, coverage dan Playwright outputs tidak tracked; aturan ignore yang sudah ada dipertahankan. Artefak PostgreSQL tidak dibuka/dihapus/di-untrack. Dokumen PRD v1.6 di `docs/PRD` saat ini kosong (0 baris); tetap disimpan sebagai provenance, tetapi tidak dipakai sebagai bukti fitur lengkap. `memory/PRD.md` adalah log historis dengan klaim/versi lama; source aktual dan handover ini menjadi acuan pekerjaan berikutnya.

## 4. Hasil validasi final

Seluruh validation gates final memakai **Node 22.22.0 / npm 11.9.0**. DATABASE_URL/DIRECT_URL dummy pada `127.0.0.1:1`; tidak ada query database, seed, bootstrap, migrate/reset atau akses production. Tidak ada server dev/test API/UI yang dibuka.

| Gate | Hasil |
| --- | --- |
| `npm ci --no-audit --no-fund --registry=https://registry.npmjs.org` | PASS, 537 packages; locked install, tidak menjalankan npm audit |
| `npm run prisma:generate` | PASS, Client 5.22.0 |
| `npm run typecheck -- --incremental false --noUnusedLocals --noUnusedParameters` | PASS, termasuk pemeriksaan unused sebelum dan sesudah cleanup |
| `npm run lint` | PASS, nol warning/error; pemberitahuan deprecation next lint tetap ada |
| `npm run test:ci` — containment | PASS, **20 native tests profil lokal**, nol fail/skip |
| `npm run test:ci` — seluruh unit | PASS, **42 tests / 6 file**, nol fail/skip; worker protection tetap diuji |
| `npm run build` | PASS, Prisma generate + Next production build; seluruh **49 page/API entrypoints tracked** tersedia pada manifest build |
| Reference graph sesudah cleanup | PASS, 132/132 source terjangkau; sepuluh ekspor retained di atas tersisa |
| Scope/integrity | Manifest/lockfile/next-env/schema/seed/bootstrap identik baseline; diff metadata migrasi/PostgreSQL/CI config kosong; `git diff --check` PASS |

Lima assertion boundary OS tambahan hanya didaftarkan oleh profil container isolated. Profil tersebut bukan command validasi lokal di atas; tidak diklaim 25 native assertions dijalankan pada turn ini, dan tidak diberi skip agar terlihat PASS. Tidak ada audit CI/Netlify/GitHub ulang atau E2E dengan database dalam scope ini. Build/unit PASS membuktikan regression gates yang disebut, bukan kelengkapan transaksi production.

## 5. Handover development MVP dari source aktual

Fondasi yang tersedia: storefront/catalog/search/detail, auth customer dan RBAC, cart/wishlist, checkout server-priced, order history/detail, transfer manual/proof/verification, shipping manual/timeline, bank management dan audit. Foundation ini dipertahankan; fitur lengkap dan aman production belum dibuktikan oleh unit/build saja.

**Prioritas pertama: Seller Dashboard dan Product Management.** Source sekarang adalah single-store storefront + backoffice admin, bukan multi-seller marketplace. Tidak ada route `/seller`, seller model/role khusus atau relasi owner pada Product. Gunakan backoffice operasional toko sebagai titik awal; scope multi-seller/tenant isolation harus diputuskan eksplisit sebelum perubahan model. Tidak ada implementasi fitur MVP baru pada cleanup ini.

| Prioritas / fitur | Bukti kekurangan pada source | Outcome dan acceptance test untuk sprint |
| --- | --- | --- |
| **Sprint 1A — Seller Dashboard** | `/admin/page.tsx` punya summary global; layout hanya memeriksa isAdmin. Tidak ada seller-specific navigation/dashboard atau filter metric per permission | Definisikan operator/role seller yang sesuai scope toko, dashboard sales/orders/pending payment/stock dan filter waktu. Gunakan guard per data/action, bukan sekadar sembunyikan UI. Test akses terotorisasi/ditolak dan metric yang boleh dibaca role tersebut |
| **Sprint 1B — Product Management** | `/admin/products/page.tsx` hanya tabel baca; API products hanya GET. Tidak ada service/action create/edit/archive produk/variants; `product.update` pada reviews hanya memperbarui agregat rating | Form create/edit/draft/publish/archive, brand/category, SKU/size/color/price, image ordering/alt dan validasi server. Permission PRODUCT_CREATE/UPDATE/DELETE telah didefinisikan, belum mengimplementasikan CRUD. Test permission, slug/SKU collision, invalid price, varian, published-only storefront, archive tanpa merusak order lama, dan invalidasi cache katalog |
| **Sprint 1B — Inventory Management** | `adjustStock` ada tetapi tanpa consumer UI/API; reservasi/sale dipakai checkout/payment | UI adjustment + alasan/movement history, guard INVENTORY_ADJUST dan invariant onHand/reserved. Test atomik/concurrent checkout, adjustment terhadap reserved stock dan repeat operations di database isolated baru |
| **MVP transaction correctness — paralel dengan backoffice** | Temuan AUTH/STOCK/PAY/ORDER/RBAC/SHIP dari laporan Sprint 0 masih terbuka; expiry belum tersambung dan shipment/order belum satu operasi konsisten | Selesaikan idempotensi approval, stock reservation, cancel/expire/refund invariant, scheduler dengan actor valid, dan status shipping. Auth reset delivery/session revocation dan dashboard permission juga tetap backlog nyata. Gunakan test integrasi isolated, tanpa production credentials/data |
| **MVP UX berikutnya — catalog/checkout/account** | Listing belum punya navigation pagination; CheckoutClient menampilkan subtotal+shipping tanpa live coupon preview meskipun service/API preview tersedia; account hanya membaca alamat | Pagination dengan validasi input server, preview kupon via server, CRUD/default alamat dengan ownership. Test total server/client setelah kupon, navigasi page bounds, dan user tidak dapat mengubah alamat milik orang lain |
| **MVP engagement/ops — berikutnya** | Recently-viewed write aktif tetapi section read belum wired; answerQuestion tanpa action/UI; notification tersimpan saat payment tetapi tanpa inbox; promotion/coupon admin CRUD belum ada | Hubungkan recently-viewed, official Q&A answer dan review moderation; inbox/read state; CRUD kupon/promosi setelah permission/validation disiapkan. Prioritas di bawah dashboard/product/inventory |
| **Integrasi provider — sprint tersendiri** | Midtrans/Tripay/J&T/KiriminAja adapter stub; webhook hanya acknowledgement/log | Implementasikan provider dengan signature/idempotency/event dispatch sebelum enable. Manual transfer/shipping tetap baseline MVP; jangan menganggap stub adalah integrasi selesai |

E2E saat ini hanya dua smoke specs storefront; suite API Python historis masih mempunyai target/fixture/skip limitations yang telah dicatat Sprint 0. Pengerjaan acceptance tests berikutnya perlu target isolated dan fixtures eksplisit. Tidak menjalankan seed lama untuk membuat data uji di production atau pada artefak tracked.

## 6. Baseline branch Sprint 1 dan pekerjaan tersisa

**Mulai development dari SHA tip PR #19 setelah commit final cleanup ini**, bukan main yang belum menerima fondasi, dan bukan PR #18 sendiri yang hanya memuat foundation/backport CI tanpa seluruh cleanup/regression Sprint 0. Nama rekomendasi: `feat/sprint-1-seller-dashboard`; Product Management dapat menjadi perubahan berikutnya atau `feat/sprint-1-product-management` dari baseline yang sama. Pin SHA tip saat membuat branch; gunakan PR #19 sebagai base selama stack belum diintegrasikan secara manual.

Setelah PR #18/#19 telah melalui review manusia dan masuk main, pindahkan pekerjaan Sprint 1 ke main yang benar-benar memuat kedua PR tersebut. Tidak merge/rebase/publish atau membuat branch development pada tugas ini. Perubahan dead code hanya di-push pada branch PR #19; branch PR #18 tidak disentuh.

Pekerjaan relevan tersisa: fitur pada matriks, invariant transaksi dan tests isolated, serta keputusan operasional atas artefak PostgreSQL yang telah dicatat sebelumnya. Risiko dependency/security yang sudah didokumentasikan tetap ditangani pada rencana remediasi terpisah; tidak ada CVE scan/patch baru atau klaim closed pada final review ini.

**Tidak ada alasan melakukan putaran audit tambahan tanpa temuan konkret baru.** Final dead code review ini selesai; lanjutkan development MVP dari baseline teruji dengan scope dan acceptance tests di atas.
