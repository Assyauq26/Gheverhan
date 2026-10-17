# R20 — Validasi integrasi cart, order dan payment

Source: branch `integration/r20-release-hardening-cart-sync`, dari #61 afb8b34 dengan normal
merge #60 491a1dc dan toolchain #62. #59 pada main8e2a4f4 dipertahankan. Source final tidak
menggunakan hasil gate R19 sebagai buktinya sendiri. PostgreSQL17.11 disposable loopback,
Node22.22.0, Next15.5.28, Prisma5.22.0, Playwright1.63.0/Chromium153.0.8010.12.

## Konflik dan perbaikan

`frontend/src/app/admin/orders/[id]/page.tsx` konflik antara label #60 dan perlindungan
review #61. Resolusi mempertahankan paymentDisplayStatus/orderDisplayStatus, memblokir
CANCELLED/EXPIRED saat WAITING_VERIFICATION, serta tetap memperlihatkan approval setelah
deadline untuk proof tepat waktu. Domain OrderStatus/PaymentStatus tidak diubah oleh label.

Cart #60 sudah merevalidasi sebagian route dan snapshot, tetapi remove belum mengaktifkan
pendingRef yang sama dengan update, request rejection belum ditangani, dan badge quick-add
hanya berupa delta. R20 menyatukan mutasi, menonaktifkan kontrol bersamaan, melakukan rollback
UI/feedback pada kegagalan, merekonsiliasi server melalui router.refresh, dan mengirim
count otoritatif dengan aggregate sempit. Revalidasi cart/shared layout berlaku setelah
write berhasil. Tidak memakai document reload atau timeout baru.

Order/payment display fungsi bersama mencakup pembeli list/detail, payment, admin list/detail,
dan dashboard. History tetap memakai status domain. Proof Server Action merevalidasi route
terkait dan payment UI menampilkan snapshot server segera setelah upload. Tidak menyatakan
PAID sebelum approval aktual, tidak mencampur label dengan logic stok/expiry/refund/fulfillment.

## Hasil source gabungan sebelum freeze akhir

| Area | Hasil | Bukti/metode |
| --- | --- | --- |
| Unit + containment |221 unit +25 containment PASS | Container offline, read-only, rootless, cap-drop, no-new-privileges, tanpa credential host |
| PostgreSQL bisnis/guard/auth |94 PASS | Cart concurrency, checkout/stock/voucher/refund/shipping/product, direct-entrypoint safety dan9 auth/RLS |
| Product/cart browser |17 PASS | product-browser.ts dan cart-sync-browser.ts; empat viewport |
| Operations/payment browser |21 PASS | operations-browser.ts dan payment-sync-browser.ts; flow UI390/1360 |
| TypeScript/lint/build |PASS | Kandidat gabungan; perubahan harness typing diperbaiki tanpa menghapus test |
| Migration/restore |PASS | Dua cluster disposable baru; enam ledger, lock timeout, backup/restore, RLS/FK/index/default |
| Hydration causal harness |Unpatched FAILED418, patched PASS | Reproduksi independen pada runtime bundled yang benar |
| Gate final10run |Wajib pada HEAD final | Hasil per-SHA akhir pada matriks lokal/CI dan deskripsi Draft bila publikasi tersedia |

## Cart mandatory reproduction

Keempat390/768/1024/1360: registrasi dummy melalui UI, logout dan replay JWT lama ditolak,
login UI; tambah3produk, hapus1, database/UI2; checkout→Back dan Forward/Back tiga kali tetap2;
badge header/bottom sesuai quantity; update qty menjadi total3; abort satu Server Action
untuk update dan remove: UI rollback, DB tidak berubah, kedua badge3. Dua input quick-add
berbeda dikirim dalam satu event turn, wajib dua HTTP200 dan count DB5; checkout/history
kembali tetap3line/5quantity. Document marker dipertahankan; order count tetap0 dan stok
onHand20/reserved0. Kegagalan request tidak menghasilkan browser exception yang disembunyikan.

Probe minimal membuktikan Promise.all dua mouse click Playwright memakai satu pointer dan
menghasilkan satu klik pada10/10 percobaan; itu bukan bukti lost update aplikasi. Driver
mengirim dua DOM click terpisah dan tetap menuntut dua request terakui serta count5. Pada768,
Shop link memang tersembunyi oleh breakpoint; pencarian header yang tersedia dipakai untuk
kembali ke katalog. Tidak menaikkan timeout atau melonggarkan assertion. Percobaan invalid
build/harness dicatat terpisah dari kegagalan aplikasi/gate final.

## Payment mandatory reproduction

390/1360: checkout form UI menghasilkan tepat1order; upload form UI menampilkan
WAITING_VERIFICATION tanpa refresh manual/document reload. Buyer list/detail/payment,
admin list/detail/dashboard menampilkan label yang sama. Reject melalui UI admin menampilkan
label ditolak dan memungkinkan upload ulang; proof kedua kembali menunggu verifikasi.
Deadline dummy dibuat setelah timestamp proof tetapi sudah lewat saat review; expiry service
lokal mempertahankan order dan reservasi. Approval UI setelah deadline menghasilkanPAID,
onHand3→2, reserved1→0, tepat1SALE, nolRELEASE dan tetap1order. Test API/proof storage lama,
retry approval/refund, RBAC dan batas4MiB tetap dipertahankan.

## Bukti akhir dan batas klaim

JSON browser `validation-results.json` menyimpan SHA, Node/browser/build, checkpoint dan
PASS/FAILED bahkan saat gagal, sebelum cleanup. CI mengunggah hanya JSON sintetis dan
screenshot dashboard fixture yang sudah disetujui scope R19, bukan server log/cookie/token.
Navigation matrix menuntut10run berurutan pada SHA/build/Node/browser identik,44PASS/run,
11/viewport dan nol page/hydration errors. Satu kegagalan menggagalkan gate.

Laporan ini dibekukan sebelum gate supaya pencatatan hasil tidak mengubah SHA yang diuji.
Hasil final ada pada `/workspace/scratch/r20/evidence/final-matrix/navigation-stability-matrix.md`
dan laporan hasil lokal `/workspace/scratch/r20/FINAL_RESULTS.md`; jika akses GitHub pulih,
source yang sama dipush dan hasil CI SHA identik dicatat dalam deskripsi Draft integrasi.
Belum ada klaim staging/live validation; tidak ada customer data atau mutasi shared database.
