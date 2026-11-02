# PROMPT CODEX — FRONTEND FORM PENDAFTARAN SELLER TERLEBIH DAHULU

**Status: FRONTEND-ONLY PRIORITY (2026-11-02).** Dokumen ini adalah prompt kerja pertama untuk Codex. Master plan multi-tenant dan backend tetap ada di `01–09`, tetapi **tidak boleh dikerjakan dalam PR frontend ini**. Spesifikasi detail UI, kriteria penerimaan dan batasan ada di [10_FRONTEND_REGISTRATION_FIRST.md](10_FRONTEND_REGISTRATION_FIRST.md).

## Instruksi untuk Codex (salin seluruh bagian berikut)

Kamu adalah Senior Frontend Engineer, UI/UX Designer, Accessibility Engineer, QA Engineer dan Code Reviewer untuk JetSeller.

**Repo:** `Assyauq26/Gheverhan`.

### Tujuan utama — implementasikan sekarang

Buat **frontend UI/UX form pendaftaran seller JetSeller** di `landing/jetseller/daftar/index.html` (saat ini halaman informasi/coming-soon), mobile-first, modern, elegan, konsisten dengan branding JetSeller. Fokus **frontend dulu**, bukan mengimplementasikan OTP backend, database seller, pembuatan tenant, storefront atau dashboard.

**Sumber spesifikasi wajib:**
1. `docs/jetseller-saas/10_FRONTEND_REGISTRATION_FIRST.md` — PRIORITAS dan acceptance FE-01–FE-10.
2. `docs/jetseller-saas/09_MVP_SELLER_SIGNUP_AUTO_STORE.md` — konteks alur end-to-end masa depan; JANGAN mulai backend dalam task ini.
3. `docs/jetseller-saas/README.md`, `01_PRODUCT_REQUIREMENTS.md`, `04_DASHBOARD_RBAC_UX.md`.
4. Inspect source: `landing/jetseller/daftar/index.html`, `landing/jetseller/assets/css/main.css`, `landing/jetseller/assets/js/main.js`, `landing/jetseller/index.html`, `landing/jetseller/masuk/index.html`. Cek repo terbaru dan jangan membuat asumsi fitur sudah berfungsi.

### Desain dan brand

- Latar putih, aksen merah JetSeller `#E1251B`, teks `#111418`, surface `#F7F7F8`.
- Tipografi Plus Jakarta Sans seperti landing existing, tombol utama merah, minimal/borderless, panel rounded, spasi rapi, label dan helper text jelas.
- Desktop: form di panel yang nyaman dengan stepper; mobile 360–428 px satu kolom tanpa scroll horizontal. Header, footer dan tautan login/beranda konsisten dengan landing.
- Bersih profesional tanpa background foto; transisi lembut, respect reduced-motion.

### Wizard 4 langkah (frontend UI)

**Langkah 1 — Akun Seller**
Nama pemilik, email, nomor WhatsApp/HP, password, konfirmasi password, checkbox persetujuan syarat & ketentuan/kebijakan privasi. Tampilkan eye toggle, rule/strength hint, validasi field, inline error, dan tombol Lanjutkan disabled secara tepat. Validasi email, nomor HP Indonesia, minimum password dan match konfirmasi, checkbox required. Jangan memakai form registrasi customer demo.

**Langkah 2 — Identitas Toko**
Nama toko/brand, kategori opsional, slug toko yang otomatis disarankan namun bisa diubah. Format `namatoko.jetseller.web.id` hanya sebagai **pratinjau alamat**, bukan domain yang sudah tersedia. Validasi slug lowercase, a-z, 0-9 dan dash; reserved slug termasuk `dashboard`, `admin`, `www`, `api`, `support`. Tampilkan `Ketersediaan nama toko belum diperiksa` sampai API tersedia.

**Langkah 3 — Verifikasi Email (tampilan/simulasi saja)**
Siapkan layout enam digit OTP, cooldown/resend, loading/error/expired sebagai **state preview untuk pengujian lokal**. Jangan mengirim email, memasang kode OTP tetap yang seolah valid, atau menyatakan OTP telah diverifikasi. Alur publik harus berhenti dengan pesan jelas bahwa sistem pendaftaran belum diaktifkan.

**Langkah 4 — Menyiapkan Toko (tampilan/simulasi saja)**
Desain visual tahapan membuat tenant, menyiapkan storefront, dashboard dan alamat toko, dengan contoh state sukses/gagal/retry untuk QA lokal. Semua demo diberi label **`Pratinjau UI — belum membuat akun atau toko`**. Jangan melakukan redirect ke subdomain yang belum aktif dan jangan menampilkan `toko berhasil dibuat` sebagai hasil nyata.

**Navigasi:** stepper Akun → Toko → Verifikasi → Siap, tombol Kembali/Lanjutkan, state error, disabled, loading, aman ketika Back; simpan input hanya dalam memory halaman, **JANGAN localStorage/sessionStorage/cookie untuk password/OTP**.

### Keamanan/kejujuran UX yang wajib

- **FRONTEND ONLY:** tidak mengubah backend, database, Prisma schema, worker, API routes, JWT, RBAC, checkout, J&T, billing, hosting/DNS, tenant dan dashboard seller.
- Tanpa backend resmi, tombol `Kirim OTP`, `Buat Toko` dan `Buka Dashboard` tidak boleh bekerja palsu. Preview state boleh melalui test fixtures lokal saja, diberi label simulasi dan tidak mengklaim keberhasilan operasi.
- Tidak ada `fetch` ke API fiktif, tidak ada dummy hardcoded customer/seller, tidak menyimpan/mengirim PII atau password ke analytics/logs/URL, dan jangan menampilkan secret dalam screenshot.
- Homepage landing, `/masuk/`, `gheverhan.store` dan storefront/admin demo **tidak boleh terdampak**; CSS/JS baru khusus halaman daftar.
- Tujuan akhir berikutnya setelah UX disetujui: backend OTP → provisioning DB tenant → storefront `<slug>.jetseller.web.id` dan dashboard `<slug>.jetseller.web.id/admin`. Dashboard JetSeller `dashboard.jetseller.web.id` khusus Super Admin. J&T nantinya **konfigurasi kredensial resmi per seller**, bukan platform global.

### Cara eksekusi

1. Audit `main` terbaru, worktree dan PR terbuka. Dokumentasikan kondisi halaman `/daftar/` dan ambil screenshot before desktop/mobile.
2. Buat branch development `feat/jetseller-seller-registration-frontend` atau nama unik dari `main` terbaru. Jangan commit langsung `main` dan jangan menimpa worktree orang lain.
3. Implementasi HTML/CSS/JS yang responsif dan modular sesuai stack landing existing; tidak menambah Next.js route/komponen yang tidak dipakai tanpa alasan. Buat reusable validation utilities jika perlu.
4. Tulis automated tests validasi input, aturan slug, navigation/back, consent, password match, no network submit; uji accessibility keyboard, aria-describedby, aria-live, focus errors dan mobile touch controls.
5. Browser regression/screenshot pada **360, 390, 428, 768, 1024, 1440**. Pastikan tidak ada overflow/overlap atau broken header/footer. Jalankan checks yang relevan pada repo serta browser test yang ada.
6. Buat **Draft PR frontend saja**. Lampirkan screenshot before/after desktop/mobile, laporan FE-01–FE-10, daftar perubahan, SHA commit, bukti tes/CI, known limitation `BACKEND_NOT_CONNECTED`, contract integrasi API berikutnya, dan rollback. Jangan mengklaim ini live atau sudah bisa mendaftar.
7. **BERHENTI setelah PR frontend selesai untuk review UI.** Jangan lanjut ke OTP server, tenant provisioning, dashboard seller, billing, J&T atau deployment tanpa instruksi berikutnya.

### Batas persetujuan

Tidak melakukan merge, deploy produksi, publish Appearance, perubahan DNS/VPS/DB, mengaktifkan autodeploy, pemanggilan J&T API atau mengubah secret tanpa persetujuan terpisah. Jika alat/browser test terbatas, laporkan `NOT_RUN` atau `BLOCKED`, jangan mengarang bukti.

### Format laporan akhir

Kirim PR URL, branch, SHA, file changed, daftar screen/step yang dibuat, screenshot desktop dan mobile, validasi yang sudah bekerja, hasil CI/browser/axe jika tersedia, isu visual/aksesibilitas, hal yang masih backend-pending, dan rekomendasi keputusan review sebelum fase backend.

**MULAI SEKARANG: selesaikan UI form pendaftaran seller terlebih dahulu sampai Draft PR frontend siap direview. Jangan membangun backend atau generate tenant dalam PR ini.**
