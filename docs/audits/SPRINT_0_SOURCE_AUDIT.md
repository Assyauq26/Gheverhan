# Sprint 0 — Audit source dan cleanup aman

Tanggal: 14 Oktober 2026 (Asia/Jakarta). Status: **pre-flight PASS; audit statis dan cleanup selesai; risiko Sprint 1 masih terbuka**.

Pembaruan final: [dead code review dan handover MVP](FINAL_DEAD_CODE_REVIEW_AND_MVP_HANDOVER.md) menyelesaikan cleanup terfokus setelah baseline `aca835a`: dua helper/tiga ekspor total tanpa consumer dan tiga output JUnit dihapus, gates final lulus, backlog Seller Dashboard/Product Management diprioritaskan. Kandidat dan validasi pada bagian berikut adalah riwayat audit awal; laporan final menjadi acuan terbaru untuk perubahan tersebut.

## Baseline dan environment

- Repository: `Assyauq26/Gheverhan`.
- Baseline PR #18: `d4a3d28d7d3141276cbaf3fdb1b8abe026abfdba`, dikonfirmasi melalui GitHub API.
- Head Sprint 0 sebelum tindak lanjut: `8bf9a97`, branch `chore/sprint-0-codebase-audit-cleanup`.
- Target stacked Draft PR: `fix/netlify-tailwindcss-animate-version`, head PR #18. Bukan `main`.
- Instance: `ccarenv_855ae1585cf8819192ae0acc25ba6ede`; source version `cecfgver_6acf8fa326e881a393faf52283e3d9bc`.
- Runtime melaporkan `spec_revision=2`, `observed_spec_revision=2`, `observations_current=true`, running/connected. Ini membuktikan revisi instance yang diamati, bukan pemeriksaan terhadap draft konfigurasi yang mungkin berubah sesudahnya.
- Policy HTTP restricted dengan preset `package_managers`; custom hosts `api.github.com`, `binaries.prisma.sh`, `cdn.playwright.dev`, `images.unsplash.com`. Keempatnya ada di snapshot `/etc/codex/network-policy.json`. Tool status masih melaporkan enforcement `unknown`; tidak dinyatakan enforced hanya berdasarkan daftar desired hosts.
- Request nyata melalui proxy `http://proxy:8080`, TLS tetap diverifikasi: GitHub API root dan metadata PR #18 HTTP 200; checksum engine Prisma HTTP 200. Root Prisma HTTP 404 karena tidak ada objek root, bukan penolakan policy. Tidak ada HTTP 403 pada pemeriksaan ini.
- VPN tidak dikonfigurasi; TCP grants kosong. Tidak ada perubahan policy, bypass proxy, atau perubahan TLS/checksum.
- Toolchain: Node `22.22.0`, npm `11.9.0`. Node default instance adalah 24; semua npm/Prisma/TypeScript/build checks memakai Node 22 sesuai `engines`.

## Batas eksekusi

Semua Prisma/build checks memakai `DATABASE_URL` dan `DIRECT_URL` dummy pada `127.0.0.1:1`, bukan kredensial production. Tidak ada query database, seed, bootstrap admin, migrasi, reset, deploy, atau akses Supabase production. Artefak `.postgres` tidak dibuka, dihapus, dipindahkan, atau di-untrack. Kesamaan tree Git-nya diperiksa melalui metadata saja.

`package-lock.json` yang sudah dibuat dalam pemulihan sebelumnya dipakai apa adanya. SHA-256 sebelum/sesudah: `3eea0888c85f52b41599ec7042917051308f73431eb98a0c088732981d851b66`. Tidak ada regenerasi lockfile, upgrade paket, atau perubahan manifest. Percobaan `npm ci` pertama gagal karena cache default tidak writable; percobaan berikutnya memakai cache di workspace dan memasang 537 paket dengan sukses.

## Cakupan dan metode audit

Seluruh source aplikasi di `frontend/src` ditinjau secara statis: 132 file TypeScript/TSX dan satu CSS. Inventaris mencakup 56 file app (24 route handler, 25 page, lima layout, loading, CSS), 31 komponen, 25 file modul bisnis, 11 library, dan 10 file provider/contract. Schema Prisma (40 model), migrasi awal, seed/bootstrap source, konfigurasi package/tooling, proxy Python, dan kedua suite API Python juga ditinjau. Script database hanya dibaca sebagai source; tidak dijalankan.

Review mengikuti jalur page/component → Server Action/REST → session/RBAC → service → Prisma/provider. Fokus mencakup input tidak tepercaya, kepemilikan data, transaksi/stok, status pembayaran/order, upload/storage, cache, efek samping, dan batas integrasi. Import graph statis dari entrypoint App Router mencapai seluruh 132 file TS/TSX; tidak ada file source aplikasi yang aman diklasifikasikan sebagai tidak terpakai hanya dari graph ini. Ekspor tanpa consumer dibedakan dari file/entrypoint framework.

Audit ini bukan pentest, pemeriksaan data production, bukti bebas kerentanan, atau validasi E2E semua fitur. Risiko concurrency di bawah diturunkan dari urutan query source dan tidak direproduksi terhadap database.

## Perubahan yang diterapkan

| Perubahan | Alasan dan batas perilaku |
| --- | --- |
| `auth.actions.ts` dan REST logout menunggu `destroySession()` | Cookie deletion selesai sebelum redirect atau respons sukses; tidak mengubah nama cookie/session policy |
| Redirect login menolak backslash dan karakter kontrol | `/\\host` dan `/\t/host` dapat dinormalisasi browser menjadi URL eksternal; path lokal, query, dan fragment valid tetap diterima |
| Validasi quantity dalam `cart.service.ts` | Add/quick-add harus integer aman positif; update menolak pecahan/non-finite/unsafe integer sebelum akses DB. Integer nol/negatif tetap menghapus item sesuai kontrak lama |
| Aturan ignore `*.tsbuildinfo`; hapus file generated tracked `frontend/tsconfig.tsbuildinfo` | Metadata incremental dapat dibuat ulang; tidak memengaruhi source atau build |
| Komentar lint scoped pada `<img>` bukti pembayaran | Gambar privat membutuhkan session cookie dari browser. Pertahankan `<img>` dan endpoint privat; perbaiki posisi directive yang sebelumnya berada pada anchor |
| Dua suite regression unit baru | Memeriksa completion logout dengan promise tertunda, redirect berbahaya/valid, dan quantity sebelum DB serta alur add/update/remove yang tetap valid |

Generated `next-env.d.ts` yang berubah karena tooling dikembalikan ke versi branch. Tidak ada route, fitur, adapter future, dependency, schema, atau artefak PostgreSQL yang dihapus. Cleanup tidak mengaktifkan integrasi yang masih disabled.

## Temuan dan prioritas

P0 tidak terkonfirmasi dalam review ini. Itu bukan jaminan tidak ada P0. P1 berikut masih memerlukan pengerjaan tersendiri sebelum dinyatakan siap production.

| ID | Prioritas | Bukti source / dampak | Status dan rekomendasi |
| --- | --- | --- | --- |
| AUTH-01 | P1 | `auth.service.ts:69–77` menulis email dan token reset mentah ke log; tidak ada pengiriman email. Token DB juga disimpan plaintext | Terbuka. Gunakan delivery nyata, hash token, redaksi log; jangan sekadar menghapus satu-satunya jalur delivery demo dan mengklaim flow reset bekerja |
| AUTH-02 | P1 | `resetPassword` membaca `usedAt` sebelum transaksi; update token tanpa predicate unused. JWT tujuh hari tidak memiliki versi revocation setelah reset; tidak ditemukan rate limiting login/reset dalam repo | Terbuka. Konsumsi token atomik, invalidasi session, dan rate limiting dengan uji integrasi |
| STOCK-01 | P1 | `inventory.service.ts:15–22` melakukan read/check lalu increment tanpa lock/conditional update. Dua checkout dapat sama-sama melewati pengecekan stok | Terbuka. Gunakan update atomik/locking atau isolation yang sesuai dan retry; verifikasi stok bersama request paralel |
| PAY-01 | P1 | `approvePayment` memeriksa status sebelum update tanpa predicate status; dua approve dapat memanggil `commitSale` dua kali | Terbuka. Transition atomik dan idempotensi pada operasi stok/payment, bukan hanya pemeriksaan status di dalam transaksi |
| PAY-02 | P1 | `submitConfirmation` hanya menolak PAID; order cancelled/expired belum dibatasi. Approval selalu menulis order PAID; `transitionOrder` juga dapat menulis PAID langsung tanpa payment/stock side effect | Terbuka. Satukan invariant Order/Payment/Inventory dan tetapkan kebijakan cancel/refund/expired; uji ulang bukti setelah cancellation dan approval stale |
| ORDER-01 | P1 | `expireStaleOrders` tidak punya consumer/scheduler. Default actor `system` dipakai sebagai FK `AuditLog.userId`; jika user itu tidak ada, transaksi dapat rollback. Error ditelan tetapi jumlah kandidat tetap dilaporkan | Terbuka. Actor system nullable/representasi valid, scheduler terotorisasi, dan laporan sukses/gagal yang benar |
| RBAC-01 | P1 | Dashboard `admin/page.tsx` membaca revenue dan seluruh order/customer summary; layout hanya memeriksa `isAdmin`, bukan permission per data. Role Marketing tidak punya `order.read`/`payment.read` | Terbuka. Filter dashboard/query menurut permission. Guard mutation/detail API yang sudah ada dipertahankan |
| CAT-01 | P2 | `getProductBySlug` memakai status `not ARCHIVED`, sehingga DRAFT dapat tampil melalui slug. Cart variant lookup juga tidak memeriksa status produk | Terbuka. Tetapkan preview draft terotorisasi dan policy published-only untuk storefront/cart |
| UPLOAD-01 | P2 | Server Action dan REST mengunggah object sebelum ownership/status order diperiksa; MIME berasal dari `file.type`, tanggal hanya string nonempty | Terbuka. Ownership/status sebelum upload, signature file/date validation dan orphan cleanup. Proof GET sudah permission-gated, mengambil path dari confirmation id, serta private/no-store |
| SHIP-01 | P2 | Shipment dan order transition berada pada transaksi terpisah; `.catch(() => {})` menyembunyikan gagal sinkronisasi. Tidak ada guard status pembayaran dalam service shipment | Terbuka. Tetapkan invariant shipment/order, validasi request langsung, serta transaksi/observability yang tepat |
| CAT-02 | P2 | `pageSize` dibatasi maksimum saja; REST dapat memberi angka negatif/pecahan/Infinity. Sort/page cast bukan validasi runtime | Terbuka. Normalisasi integer/range dan batas input/cache cardinality sebelum Prisma/cache |
| UI-01 | P2 | React 18 `useTransition` dengan callback async pada mutasi tidak menjamin pending selama seluruh network request; cart memungkinkan request item berbeda dengan snapshot seluruh cart, purchase fallback bisa memilih variant lain | Terbuka. Uji latensi/concurrency, state per item, dan pemilihan variant invalid; jangan mengubah UX tanpa validasi browser |
| INTEGRATION-01 | P2 | Webhook stub merespons sukses tanpa signature/idempotensi dan hanya log; provider gateway/shipping belum aktif | Boundary future dipertahankan. Jangan mengaktifkan provider sebelum verifikasi signature/event dispatch/idempotensi selesai |
| DATA-01 | P1 potensial | `.postgres/data` tracked: rekaman audit historis menghitung 1.481 file/64,21 MiB. Isi belum diperiksa | Ditunda sesuai instruksi pengguna. Perlu keputusan penanganan artefak/history terpisah; tidak ada klaim kebocoran aktual |
| TEST-01 | P2 | Python API tests memakai akun demo, remote preview/default lama, fallback psql, dan skip pada kegagalan setup; beberapa test menerima 404/405 sebagai pass | Terbuka. Gunakan fixture dan target isolated eksplisit; hentikan false-positive dan skip diam-diam. Suite ini tidak dijalankan pada tahap sekarang |
| DEV-01 | P2 | Seed berisi deleteMany dan password demo; bootstrap dapat memberi Admin role/reactivate matching user | Script dipertahankan dan tidak dijalankan. Build tetap `prisma generate && next build`; perlindungan operasional dan guard database perlu pengerjaan tersendiri |
| AUTH-03 | P2 | Logout sebelumnya tidak await; redirect check hanya menolak `//`; quantity Server Action tidak divalidasi | Diperbaiki dalam cleanup ini, dengan regression test |
| TOOL-01 | P3 | Metadata TypeScript generated tracked; satu warning img akibat posisi directive | Diperbaiki. Deprecation `next lint`/Vite CJS masih ada sebagai pemberitahuan tooling |

Temuan belum diperbaiki sengaja dipisahkan dari cleanup: locking/idempotensi, email reset/session revocation, otorisasi dashboard, dan penyelarasan status membutuhkan perubahan perilaku serta coverage integrasi. Build/unit PASS tidak menghapus risiko-risiko tersebut.

## Bukti guard yang sudah ada

- JWT dibatasi HS256, issuer/audience, dan expiry; secret minimal diperiksa. Session cookie httpOnly/secure/sameSite lax; user aktif diperiksa dari DB.
- Permission setiap mutation admin diperiksa di Server Action/REST, bukan hanya menyembunyikan tombol. API order/customer detail dibatasi `userId`; update/remove cart memeriksa cart milik caller.
- Checkout menghitung ulang harga, kupon, dan shipping cost di server; cost kiriman client tidak dipercaya. Order/payment/stock/audit dibuat dalam transaksi, meski concurrency guard masih perlu perbaikan.
- HTML React umumnya ter-escape. JSON-LD produk meng-escape karakter `<` sebelum insertion; tidak ditemukan pemakaian user HTML mentah lain.
- Cache publik catalog terpisah dari auth/cart/wishlist request-specific. Catalog TTL 30–60 detik; belum ada invalidation terpadu untuk future mutation produk.
- Python backend tetap thin proxy, bukan backend bisnis kedua. Client HTTP global belum ditutup melalui lifespan dan request hop-by-hop headers belum difilter lengkap; cleanup proxy ditunda agar tidak mengubah ingress tanpa integration test.

## Kandidat dead code dan dependensi

TypeScript dengan `--noUnusedLocals --noUnusedParameters` lulus pada source sebelum cleanup. Tidak ada unused import/local yang terkonfirmasi oleh compiler untuk dihapus. Import graph mencapai semua source TS/TSX. Next.js `GET/POST/PATCH/DELETE`, page/layout, dan metadata exports adalah entrypoint framework, bukan dead code.

Ekspor tanpa pemanggil aplikasi yang ditemukan melalui pencarian referensi: `slugify`, `requireAdmin`, `getRecentlyViewed`, `adjustStock`, `getOrderById`, `expireStaleOrders`, `getPaymentDetail`, `listReviews`, `answerQuestion`, `getShipmentByOrder`, serta helper `cartCount`. `ROLE_PERMISSIONS` di library dan tipe `ProductWithRelations` juga belum memiliki consumer aktif. Semua dipertahankan: fungsi inventory/review/shipping/expiry berhubungan dengan fitur dan boundary yang telah disiapkan; penghapusan bukan cleanup aman tanpa keputusan scope.

Import source langsung memakai Prisma, Radix Slot, bcryptjs, class-variance-authority, clsx, jose, lucide-react, Next/React, tailwind-merge, zod. Tidak ditemukan import aktif untuk Radix accordion/dialog/label/tabs; package tetap dipertahankan bersama testing-library/jsdom untuk menghindari pengurangan kemampuan/persiapan UI/testing dan perubahan lockfile dalam recovery ini. `tailwindcss-animate` dipakai di konfigurasi Tailwind; Prisma CLI, Netlify adapter, Vitest dan Playwright adalah tooling entrypoint sehingga tidak dinyatakan unused dari pencarian import runtime saja.

Pada tahap source audit awal, `npm audit --json` tidak dijalankan karena automatic approval review menolak pengiriman metadata dependency yang belum disetujui secara spesifik. Setelah pengguna memberi persetujuan eksplisit, audit resmi npm full dan production berhasil dijalankan. Hasil: 18 entri paket (2 Critical, 9 High, 7 Moderate); production tree memuat 9 entri (0 Critical, 6 High, 3 Moderate). Rincian 17 advisory unik/16 CVE, dependency path, applicability, dan mitigasi yang belum diterapkan tersedia pada [bagian 16 laporan pemulihan](CODEBASE_CLEANUP_REPORT.md#16-audit-cve-resmi-npm--tindak-lanjut-persetujuan-eksplisit). Dependency dan lockfile tetap tidak berubah.

## Validasi sebelum / sesudah

| Pemeriksaan | Sebelum cleanup pada clean install | Sesudah cleanup |
| --- | --- | --- |
| `npm ci --no-audit --no-fund` | PASS, 537 packages dengan cache workspace | Dependency/lockfile tidak berubah; tidak perlu install ulang |
| `npm run prisma:generate` | PASS, Client 5.22.0 | PASS, diulang oleh production build |
| `npm run typecheck -- --incremental false` | PASS | PASS |
| `npm run lint` | PASS, satu warning img | PASS, nol warning/error |
| `npm test` | PASS, 10 test/3 file | PASS, 41 test/5 file, tidak ada skip |
| `npm run build` | PASS | PASS; daftar 25 page/24 API tetap tersedia |
| Lockfile checksum / manifest | PASS | Identik dengan recovery sebelumnya |
| `git diff --check` | Clean baseline | PASS |
| Schema/migration/database artifacts | Tidak diubah | Tidak diubah; metadata tree `.postgres` identik |
| E2E/API dengan data / Netlify deploy | Tidak dijalankan | Tidak dijalankan |
| Advisory CVE online | Belum tersedia pada source audit awal | Tindak lanjut terotorisasi selesai; Critical/High masih terbuka, lihat bagian 16 laporan pemulihan |

31 regression test baru mencakup redirect/login (8), completion logout (2), dan cart quantity/alur valid (21). Mock Prisma/session digunakan agar unit test tidak mengakses database/storage. Dua production build memakai dummy database loopback dan tidak membaca catalog production. Tidak ada klaim registration → checkout → upload → admin verify → shipment sudah lulus E2E.

## Prioritas Sprint 1

1. Kerjakan AUTH-01/02, STOCK-01, PAY-01/02 dan RBAC-01 dengan uji integrasi terhadap database isolated baru, bukan artefak tracked atau Supabase production.
2. Perbaiki expiry/actor system dan sinkronisasi status order/payment/shipment; lakukan uji paralel, repeat approval, cancellation, dan expiration.
3. Hardening ownership sebelum upload, file/date validation, draft-product policy, pagination, serta request/pending state UI.
4. Pisahkan fixture/test-target eksplisit, lengkapi E2E dan advisory audit yang terotorisasi; rencanakan keputusan data PostgreSQL tracked terpisah.

Draft PR: [#19](https://github.com/Assyauq26/Gheverhan/pull/19), dari `chore/sprint-0-codebase-audit-cleanup` menuju `fix/netlify-tailwindcss-animate-version` (head branch PR #18). GitHub API mengonfirmasi state open dan draft true. Tidak ada auto-merge, push `main`, force-push, atau deployment. Riwayat hambatan sebelumnya tersedia di [laporan pemulihan](CODEBASE_CLEANUP_REPORT.md).
