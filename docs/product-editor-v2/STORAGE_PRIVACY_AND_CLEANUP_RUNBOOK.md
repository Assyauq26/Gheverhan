# Storage privacy dan cleanup — prosedur belum diaktifkan

## Inventaris dan kompatibilitas

Seluruh I/O Storage aplikasi melewati server-only `src/lib/storage.ts` dengan service-role headers. `resolveStorageObject` mengikat app prefix dan tipe bucket, menolak traversal/encoded path/cross-bucket/PDF produk. Tidak ditemukan getPublicUrl atau konstruksi `/object/public/` pada source client.

| Penggunaan | Path objek | Akses |
| --- | --- | --- |
| Galeri legacy | `<app>/product-images/<productId>/<imageId>.<ext>` | ProductImage → `/api/v1/product-images/<id>?object=...` → server GET bercredential |
| Variasi legacy | Path sama, ProductImage.isVariation=true | Proxy yang sama; order/cart/history authorization tetap berlaku |
| Foto pending | `<app>/product-images/staged-<id>/<id>.<ext>` | `/api/v1/admin/product-media/<id>` memeriksa actor/session/purpose/ready/TTL |
| Foto finalized | Path staged immutable tetap, ProductImage terikat dalam transaksi | Proxy permanen dan pemeriksaan published/staff/cart/order; reader baru mengenali prefix |
| Payment proof | `<app>/payment-proofs/<userId>/<id>.<ext>` | Bucket terpisah, buyer/admin proof routes berizin; tidak ikut perubahan produk |
| External legacy URL | URL eksternal pada ProductImage | Tidak dipindah atau diubah; pembacaan pihak ketiga bukan dari product-images |

Read-only pada project `bztprltkevacidcpjaam`: 18 ProductImage (16 galeri, 2 variasi); 8 proxy aplikasi, 10 external HTTPS, 0 direct public Storage URL, 0 relative legacy lainnya. OrderItem memiliki 0 referensi direct public product bucket; 0 staged-prefix objects. Tidak membaca isi foto, customer identity atau signed URL.

`product-images` masih **public**, `payment-proofs` private; storage.objects RLS enabled dan tidak ada Storage policies. Flag public melewati pembatasan read RLS untuk endpoint publik, sehingga ketiadaan policy bukan perlindungan foto staged. Effective bucket override/service-role aplikasi tetap belum terverifikasi: CLI kini dapat diakses, tetapi nilai environment tidak dibaca. Agregat bukan bukti tidak ada URL lama di bookmark/CDN/pihak eksternal.

## Bukti private-access disposable

Fixture HTTP Storage pada PostgreSQL disposable sekarang menolak tanpa apikey + Bearer dummy yang benar dan menolak seluruh `/object/public/` requests. Test membuktikan anonymous/public GET ditolak, sedangkan helper server dan recovery proses baru dapat membaca bytes yang benar untuk legacy dan staged. Finalization, retry, cancellation dan cleanup juga berjalan di fixture private tersebut.

Ini **emulator Storage bercredential dengan PostgreSQL nyata**, bukan klaim integrasi Supabase Storage private remote. Tidak membuat staging/project baru. Real bucket flip + delivery/CDN/permission probe tetap BLOCKED sampai operator berwenang memberikan target dan approval.

## Paket perubahan private bucket untuk approval terpisah

1. Gunakan akses CLI resmi yang telah pulih; verifikasi project ID, domain, deployment/SHA, actual SUPABASE_URL/ref, selected SUPABASE_PRODUCT_IMAGES_BUCKET (default product-images), role dan service-role presence melalui kanal aman. Jangan hanya memakai nama project.
2. Konfirmasi hanya bucket produk target yang berubah dan semua URL aplikasi/default/override kompatibel; review konsumen lain/CDN/cache dan approved dummy probes. Jangan membuka policies atau membuat bucket lain sebagai workaround.
3. Setelah approval spesifik: ubah **hanya** `product-images.public` true→false melalui dashboard/API resmi yang berwenang. Jangan mengganti bucket/path, memindah/menghapus file, mengganti credential, atau mengubah payment-proofs.
4. Read-only verifikasi metadata public=false. Dengan dummy yang disetujui, anonymous/public reads harus ditolak; authenticated legacy dan staged proxies tetap berhasil. Jalankan release:preflight dengan identitas/role aplikasi terverifikasi. Uji foto variasi dan histori sebelum membuka writer.
5. Endpoint publik sebelumnya bisa telah dicache/disalin; perubahan privacy tidak menjamin penarikan byte lama dari seluruh cache. Review provider cache/CDN sesuai kebijakan; jangan mengklaim revocation retroaktif.
6. Bila media gagal, pertahankan private dan perbaiki reader/override/credential secara roll-forward. Jangan otomatis membuka bucket kembali setelah staged photos digunakan. Traffic-stop/maintenance membutuhkan approval tersendiri.

Tidak ada langkah di atas dijalankan pada Production oleh task ini.

## Cleanup 24 jam dan observability

TTL akses 24 jam; cancel/expiry mengubah metadata menjadi non-readable. Tombstone dipertahankan minimal 24 jam dan remote DELETE diulang setelah grace untuk PUT provider terlambat. Retry cancel tidak memperpanjang grace. Ready/finalized media dengan productId tidak pernah menjadi kandidat cleanup. Batch maksimum 5, I/O timeout 15 detik, tanpa penghapusan massal atau perubahan stok/order.

`cleanupStagedMedia()` kini mengembalikan **scanned/cancelled/deleted/failed**. `deleted` adalah jumlah tombstone metadata yang dihapus sesudah remote delete sukses; cancelled baru tetap disimpan hingga grace. DELETE/provider failure mempertahankan metadata untuk retry, tidak membuang referensi object.

Endpoint **`GET /api/internal/cron/product-media-cleanup`** disiapkan tanpa jadwal. Default disabled; hanya berjalan bila PRODUCT_MEDIA_CLEANUP_ENABLED=1, VERCEL_ENV=production dan Bearer CRON_SECRET valid (minimum 16 karakter, timing-safe). Preview/development ditolak walaupun flag salah disalin. Log hanya empat angka, tanpa actor/session/token/object path/provider body. Partial failure menghasilkan HTTP 503 dan warning angka, bukan sukses palsu. Tidak ada vercel.json crons entry baru, env Production baru atau invocation live.

### Usulan operasi memakai Vercel yang ada

- Operator yang berwenang menyetujui source/schema/private bucket lebih dahulu, lalu memverifikasi kuota/frequency/duration plan Vercel; jangan membeli/upgrade tanpa izin.
- Setelah approval aktivasi spesifik, tambah jadwal untuk path cleanup tersebut pada Vercel Cron, pertahankan jadwal expire-orders yang ada, lalu set flag **Production only**. Tidak memasang schedule di task ini agar merge/deploy tidak mengaktifkannya diam-diam.
- Satu run menangani maksimal 5 kandidat. Harian hanya cukup bila laju backlog eligible <5/hari; jangan menyatakan semua beban terlayani. Jika perlu cadence lebih tinggi tetapi plan tidak mendukung, gate tetap BLOCKED sampai ada prosedur operator yang disetujui atau kapasitas yang memadai. Jangan menambah unbounded loop atau menonaktifkan timeout.
- Pantau failed>0/HTTP503, scanned=5 berulang, jumlah eligible dan oldest eligible age melalui query metadata berizin. Alert bila oldest eligible >24 jam melewati grace atau backlog bertambah; finalized tidak dihitung sebagai garbage.
- Retry terbatas setelah root cause provider/permissions diperbaiki; pantau run berikutnya, jangan menganggap platform melakukan retry otomatis. Pertahankan tombstone jika tidak dapat menghapus.
- Emergency disable: flag 0 dan pause schedule melalui operator yang disetujui; metadata/file tetap utuh. Maintenance global harus tetap memblokir endpoint writer ini.

Sebelum tabel V2 tersedia, backlog V2 pada database target **NOT APPLICABLE** (bukan nol yang telah diuji lewat tabel). Kesiapan schedule, owner operasional, quota, monitoring dan cleanup live masih **BLOCKED**.
