# PR #87 — final technical audit dan release gate

Tanggal laporan: 22 Oktober 2026 (Asia/Jakarta). Keputusan **NO-GO untuk Production**; PR tetap Draft. Tidak ada merge, deployment, migration, perubahan bucket, secrets atau data Production.

## Baseline dan cakupan

Baseline `main` tetap `b2d18192d99db379b6894a51abaaded22cc329e0`. Kandidat awal `b139baba3c4453b507121498ca93585c3962bd44` masih merupakan HEAD saat pemeriksaan dimulai. PR open/mergeable, tanpa perubahan baru di main. Seluruh commit diperiksa; package.json, package-lock.json dan migration historis tidak berubah dibanding main. Tambahan final review hanya probe release read-only, regression tests dan laporan. SHA final serta dua run CI dicantumkan pada PR; status lama tidak digunakan sebagai bukti commit baru.

## Temuan dan tindakan

| ID | Severity | Status | Bukti dan tindakan |
| --- | --- | --- | --- |
| INFRA-01 | High, blocker release | BLOCKED | Metadata resmi Supabase menunjukkan `product-images.public=true`. Request object publik dapat melewati session/ownership aplikasi jika URL diketahui; UUID bukan authorization. Belum ada staged upload Production karena fitur belum dirilis. Diperlukan bucket private dan pemeriksaan kompatibilitas URL lama, atau desain private bucket terpisah yang direview. Tidak mengubah Production secara otomatis. |
| PREFLIGHT-01 | Medium | PASS setelah perbaikan | CLI sebelumnya hanya memeriksa DB dan kehadiran env serta menyatakan batas Storage dalam output. Sekarang remote release preflight juga harus membuktikan bucket target private melalui metadata read-only; public/missing/mismatch/403/network/malformed/redirect gagal tertutup. Tidak mengirim key ke origin selain project ref terverifikasi. Local mock ditandai NOT APPLICABLE, bukan PASS Production. |
| RECOVERY-01 | Medium, coverage gap | PASS lokal; gate final melalui CI | Tambah drill proses Node baru yang membaca legacy dan finalized staged-prefix, menolak ID/path yang tidak cocok, dan membuktikan product/SKU/image/finalization tidak berubah. Cleanup/cancel tidak menghapus finalized media. Lihat RECOVERY_DRILL.md. |
| ACCESS-01 | Blocker operasional | BLOCKED | Vercel GET project `syauqi3/gheverhan` 403 pada scope `syauqi3`. Tool pemulihan authorize_team_access/authorize_team_sso tidak tersedia. Tidak dapat membuktikan selected bucket override, deployment efektif, koneksi database/role aplikasi, env atau automatic deployment. Koneksi Supabase sebagai postgres bukan bukti role aplikasi. |
| VISUAL-01 | Blocker penerimaan visual | BLOCKED | Screenshot referensi asli editor tidak ada di workspace/lampiran aktif. Sudah diminta kembali. Tidak ada skor fidelity 90% atau klaim side-by-side dengan referensi yang hilang. |
| OPS-01 | Medium, kontrol operasional | BLOCKED | Cleanup terbatas lima objek dipicu upload/cancel; tidak ada jadwal trusted cleanup yang telah dibuktikan di Production. Perlu owner operasional, pemantauan backlog/Storage, interval, retry dan alert. Jangan membuat public cleanup endpoint. |

Tidak ditemukan Critical atau High baru dalam source aplikasi pada jalur yang ditelaah. Audit aktual lockfile menghasilkan **0 Critical / 7 High / 0 Moderate**; perintah npm audit berakhir nonzero karena advisory tersebut, bukan dianggap audit bersih. Tujuh node: braces, chokidar, micromatch, fast-glob, tailwindcss, eslint-config-next dan @next/eslint-plugin-next. Lockfile tidak berubah.

Advisory GHSA-vfj7-8cjw-p6xm berasal dari stack exhaustion nested glob di braces 3.0.3 dan rantai dependennya. Jalur yang ditemukan adalah build/lint dengan glob konfigurasi, bukan input HTTP pelanggan. Kontrol kompensasi baseline membatasi parser/AST depth 128, guard SHA-256 fail-closed pada seluruh copy, security:prepare sebelum build/lint dan sembilan mitigation tests termasuk malicious AST. Tidak menghapus severity atau advisory; dependency major upgrade tetap di luar perubahan final review. **Penerimaan risiko residual secara eksplisit oleh pemilik masih BLOCKED untuk release ini**; tidak disimpulkan dari izin sprint sebelumnya. Lihat docs/audit/R21_SECURITY_HARDENING.md untuk matriks baseline. Hasil npm audit terbaru dan CI final ditautkan pada PR.

## Security review

**PASS pada source dan pengujian isolated:** mutation memakai exact Origin; permission read + admin create/update; hash sesi berasal dari cookie yang sudah divalidasi, bukan request; actor/session/purpose/TTL diperiksa sebelum reads/finalization. File signature, 4 MB, gallery 10, option 50 dan outstanding quota 60 terjaga. Upload intent durable, row lock, immutable object dan content hash mengatasi retry/lost response. Cancellation non-readable dan grace 24 jam mengatasi PUT terlambat; gagal delete tetap menyimpan metadata. Foto historis/finalized tidak menjadi kandidat TTL cleanup. Cross-actor/session association ditolak.

Create/update/receipt/Image/SKU/inventory/audit berada dalam transaksi serializable; revision CAS, unique SKU, reserved stock, permission adjustment dan flash sale tetap authoritative di server. Receipt mencegah create ganda dan menolak payload/session lain. Error mempertahankan form. Publish baru wajib berat; legacy published null menerima unrelated edit, bukan penghapusan berat atau metadata invalid. Dimensi all-or-none, integer mm, cm koma/titik, range dan Infinity ditolak.

Checkout, direct intent, cart, voucher, order snapshot, status payment dan manual shipping tetap memakai kontrak sebelumnya. Metadata paket tidak mengubah biaya kurir. Regression browser/PG mencakup flows tersebut. **Private Storage Production belum PASS**, walaupun route aplikasi sudah berizin.

## Visual QA

Menggunakan bukti browser aktual build production pada enam lebar: **360, 390, 430, 768, 1024, 1360**. Artifact berisi create empty/partial, edit filled, clean/dirty Save, shipping dan 50 SKU. Screenshot committed dan before/after tercantum di TEST_EVIDENCE.md. Bukan foto pelanggan; PNG dummy sengaja tampak kosong.

- PASS: hierarki header/back/title, kartu foto/basic/detail/penjualan/variasi/bulk/SKU/pengiriman/pengaturan dan Save diperiksa dari screenshot desktop/mobile dan source. Bulk tiga kolom desktop menjadi susunan responsif; radio all/selected dan permission stok tercakup browser.
- PASS: Simpan non-sticky dalam document flow, label tetap Simpan, abu-abu clean/disabled, dirty aktif, pending disabled, save sukses clean, failed save mempertahankan input. Browser membuktikan canonical revert, focus dan nol overflow pada enam viewport.
- PASS: pengiriman gram dan cm, contoh `12,5 cm` tersimpan 125 mm dan tetap benar setelah reload; dimensi opsional, partial/overflow ditolak.
- PASS pada checks yang tersedia: keyboard/focus, expandable SKU satu awal terbuka, no request saat mengetik 50 SKU, nama/group/photo/library dan transfer satu image-mode terjaga. Tidak mengklaim sertifikasi WCAG menyeluruh atau pengukuran kontras setiap pixel.
- BLOCKED: perbandingan side-by-side terhadap desain asli. Tidak menulis ulang UI yang sudah terbukti benar.

## Migration dan infrastructure read-only

Project target pemeriksaan: Supabase `bztprltkevacidcpjaam`, database `postgres`, PostgreSQL 17.6, inspection role `postgres`. **Hubungan ke Vercel Production belum dibuktikan.** Facts non-sensitif tersimpan di PRODUCTION_READ_ONLY_FACTS.json.

- PASS: 10 migration selesai, tidak ada failed/incomplete; semua 10 checksum cocok dengan source. Tepat satu migration source belum ada di ledger: `20261021093000_product_editor_staged_media_shipping`.
- PASS review: checksum `63eefd28491f47b5ed269539d88b52b985f47aac4b620e6600f1607f06414198`; DDL additive, empat nullable integer, dua tabel/CHECK/indeks/RLS tanpa public policy. Transaction, lock_timeout 5s, statement_timeout 60s; historical SQL tidak berubah, tidak ada DML/data rewrite/default berat.
- PASS snapshot metadata: 9 koneksi, nol transaksi >60 detik dan nol waiting lock. Bukan jaminan kapasitas atau lock pada waktu release; wajib periksa ulang.
- BLOCKED untuk aktivasi: dua tabel dan empat kolom belum tersedia. Read-only tidak menjalankan DDL.
- BLOCKED: effective role/grants aplikasi dan private bucket target belum dibuktikan. Role inspeksi bypassrls tidak mewakili aplikasi. Bucket `payment-proofs` private; ini tidak membuktikan bucket produk private.
- BLOCKED: operator Prisma/direct connection dan env Production tidak tersedia pada environment resmi ini. `npm run release:preflight` Production tidak dijalankan dengan credential tebakan. Local read-only preflight dan fail-closed cases diuji melalui suite resmi.

## Gate pengujian

Setelah perubahan final review, **seluruh workflow dijalankan ulang pada HEAD baru**, termasuk 352 unit awal ditambah empat Storage probe tests, 25 containment, 9 mitigation, 184 PG awal ditambah satu recovery drill, 30 product/cart/editor, 21 operations/payment, 15 auth, Prisma, TypeScript, ESLint, build, hydration dan navigation 10×44. Angka/status final harus dibaca pada CI/log/artifact HEAD PR, bukan disimpulkan dari daftar ini. Workflow: test-containment.yml dan sprint-2e-isolated-regression.yml. PR description menjadi indeks run final.

## Keputusan dan tindakan pemilik/operator

**NO-GO Production** sampai private bucket terverifikasi, akses Vercel/database efektif/role/env dipulihkan dan dibuktikan, cleanup operasional tersedia, risiko dependency diterima secara eksplisit, penerimaan visual diselesaikan, CI HEAD final PASS serta review/approval diberikan. Database-first release tetap wajib. Jangan merge dahulu untuk mencoba deployment.

Tindakan aman berikut: lampirkan gambar referensi, pulihkan akses resmi scope Vercel dan operator secrets melalui kanal resmi, lalu review paket perubahan bucket private beserta kompatibilitas existing media. Tidak meminta password/token melalui chat. Backup/recovery mengikuti keputusan pemilik yang dikonfirmasi untuk release ini, bukan asumsi izin task lama. Ikuti MIGRATION.md dan RECOVERY_DRILL.md; jangan rollback ke baseline lama setelah staged media dipakai.
