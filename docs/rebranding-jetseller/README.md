# JetSeller — Rebranding Gheverhan (Dokumen Pengendali)

**Status:** SPECIFICATION ONLY — belum mengubah frontend, database, domain, nama repo, visibilitas repository, atau production.
**Baseline audit:** `main` commit `9f97384f466151c45bc91ca944797864fe60a3ad`, 1 November 2026. Codex wajib mengecek ulang HEAD ketika mulai pekerjaan.
**Pemilik keputusan:** Owner project. Perubahan production dan perubahan nama/visibility repo memerlukan persetujuan tahap terpisah.

## Tujuan

Mengubah aplikasi e-commerce yang saat ini dikenal sebagai Gheverhan menjadi **JetSeller Demo Store**, yaitu toko demonstrasi utama untuk platform JetSeller, sambil menjaga fungsi transaksi, sistem seller, dan deployment yang sudah berjalan. Landing pemasaran JetSeller tetap berada di `https://jetseller.web.id/`, sedangkan toko demo saat ini berada di `https://gheverhan.store/`.

## Dokumen wajib

1. [PLAN_REBRANDING.md](./PLAN_REBRANDING.md) — source of truth arsitektur, ruang lingkup, daftar target, fase, pengujian, rilis, rollback, dan migrasi nama/Private repo.
2. [PROMPT_CODEX.md](./PROMPT_CODEX.md) — prompt eksekusi siap salin untuk Codex, tunduk pada PLAN_REBRANDING.md.

## Urutan implementasi

- **Gelombang A:** Audit → frontend/brand JetSeller Demo Store → tes → PR → review owner.
- **Gelombang B:** Deploy aplikasi dan publish konfigurasi branding toko setelah backup + persetujuan rilis, lalu smoke production.
- **Gelombang C (TERPISAH):** Audit semua referensi & autentikasi GitHub → rename `Assyauq26/Gheverhan` menjadi `Assyauq26/JetSeller` → private → verifikasi GitHub/Codex/VPS/CI. Jangan menjalankan Gelombang C sebelum jalur akses repo private terbukti aman.

## Batas paling penting

- **Jangan** `git grep "Gheverhan"` lalu replace semua secara otomatis. Bedakan copy pengguna dari JWT issuer/audience, environment variables, database, path VPS, Docker, checksums, sejarah migrasi, dan bukti audit.
- **Jangan** ubah produk, user, order, pembayaran, J&T API, logic bisnis, auth/OTP, model Prisma atau data historis untuk sekadar branding.
- **Jangan** memperlakukan merge PR sebagai bukti perubahan sudah live.
- **Jangan** menonaktifkan perlindungan deployment, memaksa SSH key, atau mengaktifkan autodeploy utama.
- **Jangan** memakai logo J&T Express atau mengklaim status partner/fitur shipping resmi tanpa izin dan verifikasi relevan.

Codex: baca **kedua dokumen** sebelum membuat perubahan. Berikan evidence untuk setiap gate, lalu buka PR yang scope-nya terpisah.
