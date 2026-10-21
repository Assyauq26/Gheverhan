# Bukti pengujian V2

Seluruh data dummy; Node.js 22, PostgreSQL disposable lokal, mock Supabase Storage dan provider manual. Tidak ada migration/deploy Production.

## Gate lokal

- Unit: 343 PASS.
- Containment: 25 PASS pada Docker `--network none`, read-only, non-root, cap-drop ALL, no-new-privileges. Eksekusi awal pada host gagal pada assertion containment karena kondisi host tidak sesuai; tidak ada assertion yang dilemahkan.
- Braces mitigation: 9 PASS.
- PostgreSQL: 184 pemeriksaan (termasuk parent test) pada 17 suite berurutan, 0 fail: database entrypoints, auth security, release preflight, registration migration, custom migration, custom variations, normalized indexes, cart concurrency, product lifecycle, direct checkout migration, direct checkout, transaction correctness, refund/shipping, registration OTP/conflicts, V2 migration/media/shipping.
- V2 migration: fresh, legacy upgrade, repeated deploy, bounded lock failure with transaction rollback, verified official Prisma resolve/retry — PASS.
- V2 browser focused: upload before name/draft, no hidden Product, reorder/remove, session-bound reload recovery, weight/partial dimensions validation, absolute bulk stock, save/read/reload persistence, canonical revert, non-sticky Save, dirty guard, six widths — PASS pada source development; full regression dan CI pada final PR HEAD menjadi bukti final.
- TypeScript, ESLint dan production build telah lulus selama implementasi. CI final menjalankan kembali source final.

Screenshot/full browser results di artifact workflow `sprint-2e-isolated-regression.yml` pada HEAD Draft PR. Final status dan run links dicantumkan pada PR agar tidak menulis SHA self-reference yang salah di dokumen ini.

## Visual

Lebar: 360, 390, 430, 768, 1024, 1360. Capture mencakup create empty, partially filled, edit filled, shipping, clean/dirty save, custom groups, upload, selected bulk, expanded SKU, photo library dan storefront compatibility. Fixtures menggunakan PNG dummy; bukan foto pelanggan.

Referensi desain pengguna belum tersedia. Tidak ada skor fidelity 90% atau klaim kesetaraan dengan screenshot asli. Pembandingan yang dapat dilakukan adalah before source baseline dengan after aktual, dan pemeriksaan viewport/overflow/focus/scroll. Persetujuan visual final membutuhkan gambar referensi tersebut.

## Investigasi kegagalan

Selector price/stock/status yang semula tunggal sekarang ambigu karena bulk controls dan live regions. Tests memakai field ID / named feedback region tanpa mengurangi assertion. URL `/admin/products/new` tidak boleh dianggap sebagai detail produk; assertion menolak `new`. Fixture baru yang akan dipublikasikan diberi berat valid sesuai kontrak baru; fixture legacy tetap menguji null compatibility. CI fresh-dependency unit image tidak menginstal marker `server-only`; unit test product service kini memock marker tersebut sebagaimana tes auth existing, sambil mempertahankan guard runtime. Historical migration drills memakai select eksplisit untuk field yang memang ada pada schema historis dan jumlah migration diperbarui menjadi sebelas.

## Batas release

Draft source review, bukan persetujuan merge/Production. Migration baru wajib database-first sesudah approval operator. Konfigurasi Storage, kapasitas cleanup backlog, session binding dan trusted role/RLS harus diverifikasi pada release aktual. Tidak ada rahasia baru yang diperlukan atau dikirim ke browser.
