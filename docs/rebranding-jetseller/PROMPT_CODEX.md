# PROMPT CODEX — Eksekusi Rebranding JetSeller Demo Store

> Salin seluruh prompt ini ke Codex / Codex Desktop. Repository masih `Assyauq26/Gheverhan` sampai fase rename yang terpisah disetujui.

## Peran

Kamu adalah Senior Next.js Engineer, Frontend UI/UX Engineer, Brand System Engineer, Security Reviewer, QA Engineer dan Release Engineer untuk proyek JetSeller.

## Source of truth yang WAJIB

Baca terlebih dahulu dokumen berikut pada commit `main` terbaru:

- `docs/rebranding-jetseller/README.md`
- `docs/rebranding-jetseller/PLAN_REBRANDING.md`

Jika ada konflik antara instruksi ini dan plan, ikuti plan. Baca file kode aktual dan jangan mengandalkan asumsi dari commit historis.

## Tujuan

Rebrand aplikasi toko e-commerce **Gheverhan → JetSeller Demo Store**, menggunakan wordmark **JetSeller**, warna primer merah `#E1251B`, warna utama background putih `#FFFFFF`, teks `#111418`, UI elegan modern tanpa border berat, mobile-first. Pertahankan seluruh flow ecommerce dan dashboard seller yang sudah bekerja.

- `https://jetseller.web.id/` tetap landing pemasaran JetSeller yang terpisah.
- `https://gheverhan.store/` tetap domain storefront **demo** selama fase UI, tanpa cutover DNS.
- `https://gheverhan.store/admin` tetap dashboard seller demo.
- Target repo masa depan `Assyauq26/JetSeller` Private, **JANGAN rename atau private sekarang**. Itu fase C setelah gate dibuktikan.

## Eksekusi bertahap — lakukan sekarang tanpa berhenti pada rekomendasi

1. Audit HEAD, status branch/PR, code dan state theme published; cari seluruh branding Gheverhan; klasifikasi public-facing, database appearance, technical compatibility, historical, test/fixtures. Catat baseline screenshot desktop/mobile, serta nilai yang terverifikasi vs tidak terverifikasi. Hasil audit ke `docs/rebranding-jetseller/reports/01-baseline-audit.md`.
2. Buat branch `feat/jetseller-demo-brand-ui` dari `main` terbaru (pilih nama unik jika sudah ada). Jangan edit `main` langsung.
3. Implementasikan wordmark JetSeller dan tema merah/putih di storefront, admin seller, auth customer, legal branding yang memang boleh diubah, favicon, metadata SEO, email display copy, footer, header, CTA, navigation, form, modal. Pertahankan identitas toko sebagai demo (label Demo Store ketika relevan); jangan samakan signup customer dengan signup seller.
4. Perlakukan Store Appearance sebagai perhatian khusus: audit `schema.ts`, `service.ts`, `published.ts`, `runtime.ts`, `StoreLogo`. Jangan sekadar mengubah default CSS lalu menganggap live selesai. Pertahankan semua revision history, draft/published separation, logo asset ownership, version guard dan rollback. Jangan ubah `legacyDefault()`/`isLegacy()` secara sembarangan. Buat fallback/preset JetSeller yang kompatibel dan tesnya; tulis prosedur **publish via admin resmi** untuk row production saat stage rilis.
5. Jangan menjalankan mass search-and-replace. Hati-hati `frontend/src/lib/auth/jwt.ts` memiliki issuer/audience `gheverhan` yang harus dipertahankan untuk session compatibility; environment `GHEVERHAN_*`, `/opt/gheverhan`, Docker image/tag, DB names, historical migration, referensi audit dan release pin SHA juga jangan otomatis diganti.
6. Jangan mengubah database schema, records produk/customer/order, Prisma migration, logika bisnis checkout/pembayaran, J&T official API/secrets, OTP/auth verification, user roles, checkout shipping, DNS/Caddy, landing marketing dan VPS production. Jangan buat multi-tenant baru pada task ini.
7. Jalankan build/typecheck/lint/unit/integration/browser regression berdasarkan `frontend/package.json` terbaru dan testing terkait Store Appearance; ambil screenshot pada 360, 390, 428, 768, 1024, 1440. Uji logo/header/footer, product/PDP, cart, checkout, wishlist, auth/OTP, admin, preview/publish theme (dengan data non-production), route demo dan tautan lihat demo. Hasilnya ke `reports/02-ui-implementation.md` dan `reports/03-qa-matrix.md`.
8. Audit residual string `Gheverhan` secara eksplisit: semua residual public-facing harus diperbaiki atau diberi alasan yang dapat diverifikasi; protocol/env/history tidak perlu dan tidak boleh dipaksa berubah.
9. Lakukan code review dan perbaikan bug, commit ke branch, buka Pull Request berisi visual before/after, catatan kompatibilitas, hasil tes, instruksi publish appearance, catatan rollback. Jangan klaim PASS kalau CI belum hijau.
10. Buat `reports/04-production-handoff.md` berisi gate backup, SHA reviewed, operator/akses VPS, deploy yang aman, langkah publish Store Appearance, verifikasi kedua domain, rollback. Buat `reports/05-private-repo-readiness.md` berisi checklist GitHub Actions/Codex/VPS/authenticated download untuk repo private. Jangan lakukan kedua aksi tersebut sekarang.

## Ketentuan release

- **Tidak deploy production atau merge PR secara otomatis.** Minta approval owner setelah review screenshot dan CI.
- Jangan aktifkan autodeploy, modifikasi GitHub Secrets/Variables, force Docker, mengubah SSH forced-command, melakukan reset DB, atau mengubah nama/visibility repository.
- Jika akses server/DB/asset tidak tersedia, kerjakan semua yang aman pada branch dan tandai `BLOCKED`. Jangan mengarang hasil.
- Hanya aset logo yang berizin; jangan mengklaim kerja sama J&T lebih dari yang terbukti.
- Output akhir: tautan PR, HEAD SHA, daftar modul diubah, risk summary, status CI, screenshots, plan actual-versus-target, dan checklist gate produksi.

**Mulai eksekusi audit dan implementasi rebranding sekarang sesuai plan, bukan hanya membuat prompt atau desain.**
