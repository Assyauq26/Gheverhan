# Variasi produk kustom

- [Audit dan acuan Lumen](UX_AUDIT.md)
- [Arsitektur dan lifecycle](ARCHITECTURE.md)
- [Migrasi, rollout dan recovery](MIGRATION_READINESS.md)
- [Bukti pengujian dan visual](TEST_EVIDENCE.md)

Alur seller: buat/ubah produk → tambah maksimal tiga grup → isi nilai → opsional foto pada satu grup → review maksimal 50 kombinasi → generate → atur SKU/harga/stok → Simpan Variasi. Foto produk baru membutuhkan draft; CTA draft-first mempertahankan input yang sedang diedit. Produk lama tetap legacy sampai konversi eksplisit yang mempertahankan identitas SKU.

PR bertumpuk pada #75. Tidak boleh merge/deploy/migrasi Production tanpa persetujuan terpisah.
