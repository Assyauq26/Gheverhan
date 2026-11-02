# 10 — PRIORITAS PERTAMA: Frontend Form Pendaftaran Seller JetSeller

**Keputusan 2026-11-02:** sebelum membuat backend, OTP sesungguhnya, tenant, database, storefront atau dashboard seller, selesaikan **UI/UX frontend form pendaftaran** terlebih dahulu. Instruksi ini mengatur PR frontend pertama, bukan mengganti target produk end-to-end pada dokumen 09.

## Ruang lingkup PR frontend pertama

- Halaman target: `landing/jetseller/daftar/index.html` dalam landing static JetSeller yang sudah ada (bukan route customer registration demo).
- Reuse `landing/jetseller/assets/css/main.css`, tipografi Plus Jakarta Sans, header/footer/wordmark JetSeller, dan JavaScript yang ada; buat CSS/JS yang **scoped untuk halaman daftar** agar landing dan `/masuk/` tidak rusak. Boleh struktur modular sesuai arsitektur aktual tanpa framework baru yang tidak diperlukan.
- Buat desain signup wizard **frontend-only** yang berfungsi secara interaktif untuk validasi UI serta state preview. **Tidak boleh memanggil API, mengirim email/OTP asli, menyimpan password, membuat account/tenant/subdomain, atau mengubah database/hosting.**
- Semua alur setelah pengumpulan data yang membutuhkan backend tampil **disabled/pending** dalam pengalaman pengguna publik. Preview visual OTP/provisioning/sukses boleh dibuat dalam **mode demo pengujian lokal saja**, dengan label `Simulasi antarmuka — belum membuat akun/toko`, tanpa fake success claim. Jangan menampilkan OTP hardcoded sebagai kode asli/verified.
- Jangan deploy ke produksi atau mengganti halaman publik yang masih coming-soon sebelum ada backend yang aman dan persetujuan rollout. Implementasi di branch + Draft PR saja.

## Alur dan field yang harus didesain

### Step 1 — Data akun
- Nama pemilik toko (required).
- Email (required, format valid, trim/lowercase di UI preview; validasi server tetap wajib nanti).
- Nomor WhatsApp/telepon Indonesia (required; UI hint contoh `081234567890`).
- Password (required) dan konfirmasi password (required), tombol tampil/sembunyikan, indikator persyaratan dan match; jangan menyimpan ke localStorage, analytics, URL, log, screenshots dengan data nyata.
- Checkbox setuju S&K dan Kebijakan Privasi (harus explicit consent; tautan benar atau status belum tersedia, jangan mengarang URL).

### Step 2 — Identitas toko
- Nama brand/nama toko (required).
- Slug toko (required, diturunkan dari nama brand untuk suggestion lalu bisa diedit, lowercase ascii dan hyphen, blacklist reserved: `dashboard`, `www`, `api`, `admin`, `support`, `mail`, `static`; server availability belum ada, tampilkan `Belum diperiksa ketersediaannya`).
- Pratinjau URL `[slug].jetseller.web.id` dengan caption: `Contoh alamat, belum dibuat atau dipastikan tersedia.`
- Kategori usaha opsional, tidak memaksa data gudang/paket/J&T.

### Step 3 — Verifikasi email (preview-only)
- Layout input 6 digit atau satu input dengan auto-advance/paste handling sesuai aksesibilitas, error invalid/expired, resend, countdown **hanya berupa representasi UI/test fixture**.
- Tanpa endpoint, tombol `Kirim kode OTP` tidak boleh menyatakan email terkirim. Jalur publik berhenti pada `Verifikasi email akan tersedia setelah sistem pendaftaran diaktifkan`.
- Preview state melalui dev-only fixtures: waiting, invalid, expired, resend-pending, loading. Jangan simpan OTP atau rahasia.

### Step 4 — Menyiapkan toko (preview-only)
- Layout progress: `Memverifikasi akun`, `Membuat toko`, `Menyiapkan dashboard`, `Mengaktifkan alamat toko`.
- Preview success/error/retry **ditandai contoh tampilan**; jangan navigasi ke subdomain tenant yang belum ada dan jangan klaim toko telah live.
- Final target masa depan: `[slug].jetseller.web.id` storefront, `[slug].jetseller.web.id/admin` seller dashboard; reserved `dashboard.jetseller.web.id` Super Admin only.

## Detail UX/UI

- Styling: dominan putih `#FFFFFF`, merah JetSeller `#E1251B`, text gelap `#111418`, surface light `#F7F7F8`; rounded modern, border minimal, tanpa background foto, spacing konsisten, responsif mobile-first.
- Desktop: form fokus di panel lebar nyaman, opsional panel manfaat/ilustrasi yang ringan (CSS/asset existing), progress stepper jelas. Mobile: satu kolom, tombol utama mudah dijangkau, tetap bisa scroll, no horizontal overflow.
- Tampilkan stepper bernama `Akun → Toko → Verifikasi → Siap` dan tombol `Kembali`/`Lanjutkan` dengan progres validasi per-step. Back antar step tidak menghilangkan isian dalam sesi (memori JS in-page saja). Jangan simpan password secara persisten.
- Input labels eksplisit, autocomplete semantik, inline error `aria-describedby`, fokus ke error pertama, `aria-live` untuk feedback, keyboard support, focus-visible, 44px min touch targets, reduced-motion support, WCAG 2.2 AA sesuai kemampuan.
- UI state: empty, invalid email/phone, mismatched password, reserved/invalid slug, loading/disabled (preview), error, OTP expired (preview), success (preview); jangan membuat animasi atau spinner yang menyiratkan backend sedang bekerja jika belum ada.
- Tautan masuk seller `/masuk/` tetap ada, namun saat backend belum live jangan mengklaim seller bisa login. Tidak menggunakan auth/customer demo.
- Gunakan bahasa Indonesia yang jelas, tidak ada klaim `toko otomatis sudah aktif` sebelum layanan nyata ada.

## Acceptance criteria dan tes

| ID | Validasi |
| --- | --- |
| FE-01 | Halaman `/daftar/` menampilkan wizard branded JetSeller, bukan coming-soon saja, di branch preview. |
| FE-02 | Step 1 tidak bisa lanjut dengan required kosong, email/HP tidak valid, password tidak cocok, atau consent belum dipilih. |
| FE-03 | Step 2 menghasilkan slug preview sanitized dan menolak reserved words, tidak mengaku slug tersedia tanpa backend. |
| FE-04 | Stepper/back mempertahankan data input saat satu sesi; tidak menyimpan password/OTP ke localStorage, analytics, URL atau backend. |
| FE-05 | Preview OTP & provisioning dapat diuji lokal dengan state fixtures yang jelas berlabel simulasi, tanpa API call dan tanpa klaim sukses asli. |
| FE-06 | Pengunjung publik tidak dapat menyelesaikan pendaftaran palsu, menerima kode OTP palsu, atau diarahkan ke tenant yang belum ada. |
| FE-07 | Mobile 360/390/428, tablet 768, desktop 1024/1440 tanpa overflow, overlay rusak, fokus hilang, atau keyboard trap. |
| FE-08 | Header/footer, homepage, `/masuk/`, `gheverhan.store` tidak berubah secara fungsional. |
| FE-09 | Automated tests validasi input/stepper/reserved slug/no network submit + screenshot desktop dan mobile sebagai bukti. |
| FE-10 | Diff hanya frontend/asset/test/doc yang diperlukan, branch terpisah, Draft PR, CI hijau sebelum review. Tidak merge/deploy. |

## API contract future handoff (not implementation)

Siapkan interface contract `RegistrationDraft`, `StartRegistrationRequest`, `VerifyOtpRequest`, `ProvisionStatus` di dokumentasi atau tipe frontend non-runtime untuk future backend. **Jangan menambahkan `fetch` placeholder** yang mengarah ke endpoint fiktif produksi. Backend stage selanjutnya baru menambahkan server endpoint/OTP email/provisioning idempotent dan mengaktifkan final action secara nyata setelah CI, E2E dan approval terpisah.

## Tugas Codex

1. Audit source landing yang relevan dan catat baseline screenshots.
2. Buat branch `feat/jetseller-seller-registration-frontend` (atau nama unik), **dari main terbaru**, bukan dari draft planning branch kecuali sudah digabung resmi.
3. Implement wizard frontend sesuai scope. HTML/CSS/JS dibuat scoped dan testable, hindari UI framework berat tanpa alasan.
4. Jalankan checks yang relevan; gunakan browser automation screenshot 6 viewports, negative field validation dan verifikasi no API request/no fake account.
5. Draft PR berisi before/after, README test, route unchanged, aksesibilitas, known limitation `BACKEND_NOT_CONNECTED`, integrasi backend kontrak dan future cutover gate.
6. Laporkan link PR, SHA, test evidence, screenshots dan blockers. **JANGAN lanjut membuat backend atau provisioning pada PR ini**; nantikan persetujuan frontend sebagai baseline UX.
