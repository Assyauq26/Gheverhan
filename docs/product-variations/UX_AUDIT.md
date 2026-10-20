# Audit dan spesifikasi variasi produk

Baseline PR #75 `d685813d02e457e5ccc182a145598c3b139b5559`, belum merged. Branch dependent `feat/custom-variations-lumen-ux`; PR baru menuju branch #75. Pertahankan seller editor, upload draft-first, permission, dan sticky save yang sudah ada. Tidak mengintegrasikan atau mengubah branch #74 yang terpisah.

| Temuan source | Severity | Perbaikan |
| --- | --- | --- |
| Nama Warna/Ukuran terkunci pada model, generator dan storefront | High | Grup/opsi relasional dengan ID stabil; maksimum tiga grup, 50 nilai/grup, 50 SKU |
| Selector kombinasi yang tidak ada fallback ke SKU pertama | High | Resolve seluruh ID opsi secara eksak; kombinasi tidak tersedia tidak bisa dibeli |
| Foto hanya galeri produk, tidak bisa terikat pilihan | Medium | Reference ProductImage milik produk, kategori foto opsi terpisah dari maksimum 10 foto galeri |
| State baris baru memakai indeks dan nama sebagai identitas | Medium | ID grup/nilai dan combination key kanonis mempertahankan SKU/stock saat rename/reorder |
| Form varian selalu menampilkan metadata legacy dan banyak input | Medium | Grup sederhana, live jumlah kombinasi, progressive SKU detail; cards mobile/grid desktop |
| Penghapusan opsi/mode foto tidak menjelaskan dampaknya | Medium | Konfirmasi Radix focus-trapped; unlink saja, bukan penghapusan storage otomatis |
| Draft wajib sebelum upload | Low | CTA simpan draft eksplisit; unggahan tersimpan di server dan version ikut diperbarui |

Flow: informasi produk → tambah/ubah grup dan opsi → foto opsional pada satu grup → review jumlah → generate SKU → harga/stok → simpan produk. Satu penyimpanan utama; perubahan variasi masuk draft editor, tidak ter-reset saat pindah bagian. Empty state menjelaskan langkah berikutnya. Up/down keyboard serta tombol sentuh untuk reorder. Konfirmasi sebelum membuang draft, mengganti mode foto, atau menghapus opsi/SKU. Validasi inline dan ringkasan fokus, pending mutex dan upload progress/retry.

## Acuan Lumen yang benar-benar diperiksa

Skill Lumen, MCP rules/meta/diagnostics/tokens, React Card/CardHeader/CardContent/CardFooter/Field/Input/Button/Switch/Dialog/Alert/Stack; recipes content-flow-settings/actions/review-workflow. Catalog hash `7113faa8466fe24529069b1918abbbfdf18c101d00341b2824cba2149c416e77`.

Compatibility: npm metadata Lumen React 4.1.0 membutuhkan React >=19 dan motion ^14, sementara aplikasi React 18.3.1. 3.0.1 juga React >=19. Tidak memakai --force/legacy-peer-deps atau upgrade React. Gunakan documented equivalents: presentational composition dengan token related/group/section dan semantic surface/ink/line/brand, native fields; perilaku dialog memakai Radix existing. Tidak mengklaim package Lumen sudah diinstal dan tidak memasang runtime Astro. Adaptasi selektif ini menjaga satu behavior system.

Warna brand hitam/putih Gheverhan; tanpa teal TikTok. Satu pemilik border tiap permukaan, kontrol >=44px, reduced motion, sticky tidak menutup input, responsive 360/390/768/1024/1360 dan enlarged text. Screenshot TikTok spesifik tidak terlampir pada request ini; referensi fungsional berasal dari prompt, tanpa klaim fidelity numerik. Bukti visual wajib dari browser lokal aktual.
