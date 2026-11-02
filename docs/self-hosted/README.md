# JetSeller Self-Hosted — Paket Spesifikasi Produk & Eksekusi Codex

**Versi:** PRD 1.0 / 2 November 2026  
**Status:** Proposed design — belum diimplementasikan dan belum dipasang di produksi  
**Pemilik produk:** JetSeller  
**Target:** Codex engineering team + reviewer  
**Model:** Seller membeli sendiri VPS dan domain, JetSeller menyediakan installer, aplikasi, dan pembaruan software terpusat.

## Lokasi resmi di GitHub

Dokumen ini disimpan di repository **`Assyauq26/Gheverhan`** pada `docs/self-hosted/`. Periksa branch dokumentasi `docs/jetseller-self-hosted-prd-20261102` sampai PR digabung ke `main`. Baca dokumen **langsung dari checkout repository**, bukan dari salinan chat atau ZIP lama.

Mulai dengan `docs/self-hosted/CODEX_EXECUTION_PROMPT.md` untuk instruksi Codex terbaru.

## Urutan baca (wajib)

1. `PRD.md` — kebutuhan bisnis, ruang lingkup, pengalaman pengguna, acceptance criteria.
2. `ARCHITECTURE.md` — batas trust, topology, arsitektur package, pairing, domain, DB, agent, state machine.
3. `API_CONTRACTS.md` — rancangan REST API v1, payload, token flow, error, idempotensi.
4. `SECURITY_AND_RELEASES.md` — threat model, prinsip keamanan, CI/CD, signing, backup, update dan rollback.
5. `ACCEPTANCE_TESTS.md` — test plan lintas UI/API/agent/VPS/restore.
6. `CODEX_EXECUTION_PROMPT.md` — instruksi langsung untuk Codex dan pembagian PR/milestone.
7. `OPEN_DECISIONS.md` — keputusan yang belum final dan default aman untuk MVP.

## Source of truth & catatan kompatibilitas

- Dokumen ini **menggantikan konsep** multi-tenant runtime bersama dan layanan hosting JetSeller untuk pengembangan baru. Tiap instalasi adalah aplikasi mandiri dengan server, domain, database, file dan kredensialnya sendiri.
- **Satu master codebase JetSeller** tetap digunakan. Perubahan kode dikompilasi menjadi rilis yang kemudian didistribusikan ke instalasi milik seller.
- `jetseller.web.id` = portal seller/installer; `dashboard.jetseller.web.id` = console operator JetSeller; `<domain-seller>/admin` = dashboard seller; `<domain-seller>` = storefront.
- J&T Express memakai **akun/kredensial API seller masing-masing**, disimpan lokal di toko. Tidak ada secret J&T global dalam control plane.
- `gheverhan.store` sudah memiliki deployment dan data/aplikasi yang harus dianggap berharga. Gunakan demo disposable atau staging VPS untuk semua uji, jangan mengubah situs live, data, atau DNS tanpa izin terpisah.
- Dokumen ini disusun dari percakapan dan referensi publik; **repository `Assyauq26/Gheverhan` dan branch `main` telah terverifikasi tersedia; struktur kode serta kompatibilitas implementasi belum diaudit secara lengkap**. Path/modul yang dicontohkan adalah target rancangan, bukan deskripsi kode existing.
- PRD ini **tidak memberikan izin untuk merge, deploy, mengubah data production, memindahkan database, atau mengaktifkan integrasi J&T Production**.

## Prinsip eksekusi

**Docs & inventory terlebih dahulu → application portability → bootstrap & pairing → local install → domain & DB → agent → signed update & recovery → portal UX → pilot → controlled release.**

**Milestone completion ≠ production release approval.** Persyaratan penerimaan terperinci ada di `ACCEPTANCE_TESTS.md`.

## Referensi primer

- Next.js Self Hosting: https://nextjs.org/docs/app/guides/self-hosting
- Docker Compose: https://docs.docker.com/compose/gettingstarted/
- Caddy automatic HTTPS: https://caddyserver.com/docs/automatic-https
- RFC 8628 Device Authorization Grant: https://www.rfc-editor.org/rfc/rfc8628
- Sigstore Cosign: https://docs.sigstore.dev/cosign/verifying/verify/
- TUF specification: https://theupdateframework.github.io/specification/
- PostgreSQL Backup and Restore: https://www.postgresql.org/docs/current/backup.html