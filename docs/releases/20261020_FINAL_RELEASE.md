# Gheverhan — kandidat rilis 20 Oktober 2026

**Keputusan saat persiapan: BLOCKED untuk Production.** Otorisasi pemilik mencakup rilis aman setelah gate terpenuhi. Belum ada merge, migration Production, maintenance Production atau deployment oleh pekerjaan ini. Source terbaru dan status CI otoritatif tersedia di PR #83/#84; hasil CI lama tidak menjadi bukti kandidat baru.

## Source dan integrasi

- #75: `d685813d02e457e5ccc182a145598c3b139b5559`, open; visual review diminta dari `mrifatsyauqi`, belum ada approval saat pemeriksaan.
- #83 semula `6d78dc0de6bec363067677fd8c31ef0af6d3a3fb`; kini digabung dengan `main` terbaru tanpa rewrite history.
- #84 semula `59967eec0adec674d16025e772cb946d7befe502`; mempertahankan ancestry #75/#83 dan mengintegrasikan `main@f0ead54` serta perbaikan direct checkout. Tetap Draft sampai review/gate selesai.
- `main` sudah memuat PR #74 (squash `7225d7b`) dan workflow read-only #81/#82. Tidak menggabungkan ulang PR lama.
- Konflik pada workflow integrasi, `release/preflight.ts`, test migration/preflight, dan `vercel.json` diselesaikan dengan union: kontrol OTP/index identitas **dan** variasi kustom dipertahankan. Test migrasi historis masih menguji upgrade historisnya; fresh source final memiliki sepuluh migration. Tidak mengubah checksum delapan migration yang telah diterapkan.
- Git deployment dinonaktifkan untuk branch #83/#84 dalam `frontend/vercel.json`. Ini **bukan** bukti bahwa autodeploy `main` sudah dijeda.

## Root cause dan perbaikan Beli Sekarang

Sebelumnya `PurchasePanel` memanggil `addToCartAction` lalu menuju `/checkout`; service checkout membaca dan mengosongkan seluruh Cart. Karena itu SKU pilihan ikut bercampur dengan item sebelumnya.

Sekarang `buyNowAction` membuat `CheckoutIntent` server-side berumur 15 menit. Pilihan menyimpan variant ID dan quantity saja, tanpa harga dari browser. Guest diikat ke random secret 256-bit dalam cookie HttpOnly/SameSite Lax/Secure pada Production; database hanya menyimpan SHA-256. Login meneruskan URL lokal yang dibentuk server. Claim hanya berhasil dengan secret browser asli, lalu atomik terikat user; user lain tidak dapat mengklaim ulang. ID URL sendiri tidak cukup.

Checkout, preview API, order API, dan Server Action menerima intent ID yang divalidasi. Harga/promo, foto/label opsi dan ketersediaan menggunakan projection yang sama dengan cart. Commit mengunci intent, Product, Variant, coupon dan inventory melalui transaksi existing. Order ID deterministik per user/intent dan request digest mencegah replay berbeda; digest checkout cart lama dipertahankan. Intent dikonsumsi bersama order, payment, reservation dan audit. Jalur direct tidak menulis Cart/CartItem. Tidak ada capture atau order sebelum konfirmasi pelanggan.

Rate limit atomik PostgreSQL: 300 intent/minute per deployment realm dan 30/15 menit per user/browser. Counter global tidak bergantung identitas client. Cleanup oportunistik dibatasi 1.000 intent yang telah expired lebih dari tujuh hari, satu batch pada request pertama tiap menit; tidak menghapus order/audit/history. Replay intent setelah retention tidak didukung. Tidak ada endpoint GET yang membuat order.

Tap target dots galeri menjadi 44px dan dapat wrap, tanpa mengubah tampilan dot kecil. Pending action memiliki guard synchronous agar double-click React 18 tidak membuat request paralel.

## Migration dan bukti read-only Production

Project Supabase `bztprltkevacidcpjaam`, `ap-southeast-1`, ACTIVE_HEALTHY, PostgreSQL 17.6, database `postgres`, role inspeksi connector `postgres`. Role ini **belum membuktikan role aplikasi atau operator Prisma**.

Delapan ledger completed, nol failed/incomplete; seluruh checksum historis cocok dengan source. Migration index identitas #74 sudah diterapkan. `ProductOptionGroup` dan `CheckoutIntent` belum ada. Dua migration kandidat belum diterapkan:

| Migration | SHA-256 |
| --- | --- |
| `20261020070000_custom_product_variations` | `499d4c6259b90c2342c5dc1a2baebcb04e72751c8a9f3111414ad7db492e4735` |
| `20261020120000_direct_checkout_intents` | `96c9e45d13d8379c67bfdd87f3971664e3dcd43d19b6e430f60f7899186f55f0` |

Migration intent dihasilkan dengan Prisma 5.22.0 `migrate diff` kemudian ditambahkan batas transaction/timeout, RLS dan CHECK yang direview: additive table/index/FK, `BEGIN/COMMIT`, lock 5s, statement 60s. Tidak mengubah transaksi lama atau menjalankan DDL manual di Production. Variant ID intent adalah referensi pilihan sementara yang diverifikasi ulang; variant yang sudah dihapus ditolak, tidak memblokir penghapusan katalog dengan intent expired. Order ID intent dicatat hanya dalam transaksi order.

Agregat awal: 11 Product, 49 Variant, 5 CartItem, 4 Order, 5 OrderItem; nol pasangan legacy ganda, opsi >80 karakter, produk >50 SKU, atau inventory `reserved<0`/`reserved>onHand`. Tidak ada transaksi aktif >60 detik saat sampel. Pemeriksaan canonical agregat menggunakan whitespace POSIX; script/operator tetap harus mencocokkan canonical penuh migration sebelum menulis. Ini snapshot, bukan bukti freeze writer.

## Bukti lokal dan gate kandidat

Node.js 22, PostgreSQL 17 disposable loopback, dependency pinned, Storage/Resend mock. Tidak memakai Production credential/data untuk testing.

- 300 unit, 25 containment, 9 mitigation lulus pada source pengembangan; CI kandidat final wajib memverifikasi ulang.
- Sembilan pengujian direct checkout lulus: cart terjaga, guest claim, expiry/validation, tampering, replay/concurrency, last-stock race, voucher limit, rollback audit failure, rejection/resubmission/expiry protection/payment sale idempotent.
- Empat suite migration lokal, 16 tests termasuk parent: fresh, upgrade, historical checksum, lock failure, transactional rollback, official Prisma recovery/retry lulus.
- Sepuluh test release preflight lulus; role yang kurang DELETE, ledger/schema salah, index hilang ditolak. Fixture closed maintenance diuji pada skema lama sebelum schema baru.
- Browser product lulus 26 checkpoint, termasuk actual guest login → direct legacy/custom checkout → order manual pending, reload, cart terjaga, dan checkout cart normal sesudahnya. Screenshot `product-direct-checkout-390.png` tidak berisi credential.
- Prisma validate/generate, TypeScript, ESLint, production build lulus lokal. Setelah perubahan terakhir, kedua workflow harus lulus pada HEAD kandidat; full PG/auth/operations/hydration/navigation 10×44 menjadi gate CI, bukan diasumsikan dari run lama.
- Screenshot CI final wajib diunduh dan diinspeksi; pemeriksaan perangkat IME fisik belum dilakukan.

## Blocker operasional yang nyata

1. Vercel resmi `GET project gheverhan`, scope `syauqi3`, menghasilkan 403 forbidden. Tidak ada CLI atau credential Vercel lokal sebagai fallback. Belum dapat membuktikan domain/deployment SHA, pause autodeploy `main`, queued builds, old deployment/Preview writer protection, effective maintenance/env, Storage/Resend settings.
2. Environment operator ini tidak menyediakan `DIRECT_URL`/`DATABASE_URL`; keberhasilan connector Supabase read-only tidak cukup untuk official Prisma migrate status/deploy atau pembuktian binding database Vercel. Sediakan hanya melalui official environment secrets, jangan chat.
3. GitHub belum mempunyai approval pada #75/#83/#84. Pembacaan branch protection dan secret metadata environment via token saat ini juga 403. Required reviews/checks harus diverifikasi oleh akses yang berwenang; tidak self-approve/bypass.
4. Identitas provider email/Storage, isolasi Preview/writer, backup/recovery operasional dan release window belum dapat dibuktikan melalui akses saat ini. Keputusan sebelumnya untuk tidak membuat backup tambahan dihormati; tidak ada backup pelanggan diambil, pemulihan ke keadaan sebelum migration tidak dijamin.

Read-only HTTP baseline `https://gheverhan.store/`, `/shop`, `/api/v1/health` menghasilkan 200. Ini **bukan** bukti fitur baru LIVE atau identitas deployment.

## Urutan cutover setelah blocker teratasi

1. Bekukan HEAD kandidat dan tunggu dua CI final serta approval source/visual reviewer. Periksa ulang perubahan `main` sebelum merge, ancestry, checks dan tree gabungan.
2. Verifikasi official Vercel team/project/domain dan metadata DATABASE_URL/DIRECT_URL lewat kanal aman; role/SSL/direct-vs-pooler/grants harus benar. Pastikan main autodeploy dijeda efektif, tidak ada queued/running Production, dan inventorikan seluruh writer/immutable deployment/Preview/cron/webhook.
3. Gunakan profil maintenance tertutup yang telah diuji; verifikasi health200 dan business/API/Server Action/cron503 pada **semua jalur writer**, lalu drain. Jangan hanya mengubah env tanpa membuktikan deployment efektif. Ikuti keputusan backup pemilik dan catat recovery limitations.
4. Ulangi ledger/checksum delapan historis, tepat dua pending di atas, no failed, lock/transaksi, ownership/DDL dan grants aplikasi, metadata legacy dan invariant hash/count. `npx prisma migrate status` resmi harus menunjukkan tepat dua pending. Preflight full-schema belum PASS sebelum schema diterapkan; kegagalan yang memang pending tidak boleh menyembunyikan kegagalan identitas/role lainnya.
5. `npx prisma migrate deploy` dari `frontend` dengan dependency/source frozen dan DIRECT_URL terverifikasi, hanya dua migration reviewed. Jangan reset/db push/manual ledger, menghapus timeout, terminate session, atau blind retry. Jika gagal, hentikan; dokumentasikan kondisi parsial dan recovery ter-review.
6. Verifikasi sepuluh completed dengan checksum tepat, no failed, RLS tanpa public policies, CRUD trusted app role pada empat tabel baru, fungsi/trigger/FK/index, invariant IDs/SKU/inventory/reservations/cart/order. `npm run release:preflight` dan official migrate status harus PASS/up-to-date memakai role efektif, bukan hanya connector.
7. Merge #75 lalu retarget/merge #83 kemudian #84 secara terkontrol; pertahankan seluruh historical migrations. Jika retarget/merge mengubah source tree, ulangi gate relevan dan approval menurut GitHub. Main belum boleh autodeploy source interim. Bandingkan tree main final terhadap candidate tervalidasi; jangan memaksa merge bila berbeda.
8. Satu final Production deployment pada main SHA approved. Verifikasi Vercel READY, source SHA, logs dan alias gheverhan.store; buka maintenance hanya setelah gate. Pulihkan autodeploy secara sengaja dan catat final setting.
9. Smoke LIVE read-only dan dedicated dummy account/product yang aman. Direct checkout harus mengecualikan/mempertahankan cart lama. Order/payment uji memerlukan reconciliation/exclusion keuangan yang bisa diaudit; jangan approve pembayaran nyata atau menghapus financial records untuk membersihkan test. Verifikasi OTP, storage, auth, editor permissions, image/SKU, voucher/shipping, hydration dan mobile/desktop. Jangan menamai hasil lokal sebagai LIVE proof.

Recovery mengutamakan roll-forward atau source kompatibel session revocation/custom options/intents. Jangan drop schema/history atau rollback ke writer lama yang tidak memahami relasi. Bila lock timeout/checksum/unknown migration/review/CI/provider failure: stop activation, pertahankan kontrol writer, simpan evidence dan perbaiki melalui source ter-review.
