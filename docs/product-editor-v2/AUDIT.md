# Product editor V2 — baseline dan root cause

Baseline `main`: `b2d18192d99db379b6894a51abaaded22cc329e0`. Branch: `feat/product-editor-ux-shipping-v2`.

- `product-editor.tsx`: upload mensyaratkan `productId`; `prepareDraft` membuat draft persisten untuk mendapatkan ID. Dampak: foto tidak dapat ditambahkan pada formulir kosong.
- `setDirty(true)` tidak membandingkan snapshot; mengembalikan nilai lama tetap dianggap dirty. Save bar sticky dan label bergantung mode.
- `custom-variation-editor.tsx`: SKU baru `GHV-` + random UUID, seluruh SKU expanded, belum ada operasi massal.
- `Product` hanya memiliki kebijakan `shippingReturn`, tanpa berat/dimensi fisik. Checkout meminta `weightGram: 1000` pada adapter manual. Metadata baru tidak boleh mengubah tarif adapter ini.
- Backend sudah memiliki transaksi serializable, revision CAS, inventory expectedOnHand, RBAC dan proteksi referensi historis; semuanya harus dipertahankan.

Screenshot referensi editor tidak tersedia dalam lampiran aktif/workspace. Tidak ada klaim persentase fidelity; screenshot aktual akan menjadi bukti layout, bukan pengganti referensi asli.

Migrasi hanya disiapkan dan diuji pada PostgreSQL disposable. Tidak ada perubahan Production.

## Temuan lanjutan selama implementasi

- Intent upload perlu durable sebelum Storage write; jika intent dan remote write berada pada satu transaksi database yang rollback, objek bisa kehilangan referensi cleanup. Intent sekarang disimpan terlebih dahulu, lalu isi diproses di bawah row lock.
- Cancel/cleanup harus terserialisasi dengan Storage write dan finalization. Upload mengunci row sebelum I/O, cancel mengunci row yang sama, finalization conditional dan transactional. Cleanup hanya menghapus object setelah cancellation durable dan tidak pernah menyentuh row finalized.
- Gagal simpan tidak boleh mengonsumsi staged photo; rollback SKU/relasi/audit mengembalikan association ke null. Receipt request/payload mencegah create ulang setelah respons hilang.
- Existing published null weight tidak boleh diblokir untuk edit unrelated, tetapi perubahan metadata pengiriman eksplisit harus mengisi berat valid. Menghapus berat produk terbit ditolak.
- Native details menutup kartu selain pertama; invalid capture membuka kartu agar field wajib bisa difokuskan.
- Uji browser lama mengharapkan save kedua sesudah undo foto/restore field. Canonical snapshot sekarang clean; regression diubah untuk membuktikan tombol disabled, bukan memaksakan write yang tidak perlu.
- Bulk status dan global status merupakan dua live region yang sah; assertions diarahkan ke region yang relevan. Next route announcer juga role alert, sehingga error form diperiksa dalam region form.
- Baseline screenshots sudah tersedia dari pengujian kandidat ec3e56f. Diff komponen admin/catalog ec3e56f→baseline main kosong; bukti tersebut dipakai sebagai before aktual. Itu bukan screenshot desain referensi pengguna.
