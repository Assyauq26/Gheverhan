# CI evidence dan provider drill

## Binding SHA

Baseline input `9e3d87fec959b2a60d694b65270bcca72a23fc3c`. Unit run [39701258472](https://github.com/Assyauq26/Gheverhan/actions/runs/39701258472) SUCCESS; isolated run [39701258479](https://github.com/Assyauq26/Gheverhan/actions/runs/39701258479) SUCCESS, selesai sebelum push persiapan baru. Tidak menganggap run baseline sebagai bukti final source baru.

Source persiapan menambah **hanya provider drill dan CI step**, bukan perubahan perilaku aplikasi atau migration. Commit final, workflow run IDs, status dan artifact terverifikasi dicantumkan pada PR #87 setelah push. Wajib memeriksa headSha run sama dengan HEAD PR. Jangan mengubah dokumen sesudah CI final hanya untuk mencantumkan SHA dirinya sendiri; gunakan PR sebagai completion record yang terikat commit.

## Pengujian lokal yang benar-benar dijalankan

- npm audit lockfile: 0 Critical / 7 High / 0 Moderate; audit tidak PASS bersih.
- TypeScript: ditemukan optional req.url pada drill baru, diperbaiki dengan narrowing; rerun PASS.
- ESLint: PASS, tanpa warning/error aplikasi; next lint deprecated adalah warning toolchain.
- Real Supabase Storage API v1.81.0 dan PostgreSQL17 Alpine: private bucket metadata, legacy+staged application helper upload/read bytehash, public/anonymous denial, invalid Bearer denial, duplicate upload denial dan delete verified PASS.
- Reproducible runner scripts/run-private-storage-drill.mjs: PASS lokal, menghasilkan JSON boolean/counts, membersihkan container/network/bucket disposable yang dibuatnya sendiri. Tidak menampilkan provider body/token. Docker default proxy/CA dan credentials registry dipertahankan, daemon local socket eksplisit; port hanya loopback. Tidak menghubungi provider Production.
- Migration hash ulang cocok, semua 10 historical ledger checksum dibandingkan file source: 0 mismatch, tepat 1 pending V2, inspection long transaction/waiting lock 0 pada snapshot. Bukan bukti operator DDL readiness.

Percobaan awal Storage provider gagal karena disk 32GB penuh; dibersihkan hanya resource percobaan. Retry menggunakan image Alpine dan tmpfs PASS. Runner sempat tidak mendapatkan published port pada Docker internal network; beralih ke bridge disposable dengan loopback publish, credential dummy dan tanpa Production binding. Tidak memakai host networking atau bypass proxy/TLS.

## Cakupan final workflow

Workflow sprint-2e-isolated-regression.yml menambah step real provider contract sesudah marker server-only lokal dibuat. Marker adalah pola existing direct-service tests setelah build, tidak menjadi dependency/source Production. Images pinned digest, PostgreSQL data tmpfs, random credentials per-run, deadline health dan cleanup finally. Jalankan manual dari frontend sesudah dependency setup dan marker yang sama seperti CI:

```bash
node scripts/run-private-storage-drill.mjs
```

Workflow lengkap tetap memeriksa Prisma, TypeScript, lint/build, auth/session/OTP, product/editor/cart/direct checkout, payment/refund/shipping, migration fresh/upgrade/lock/retry, browser enam viewport, hydration dan navigation 10×44. Tidak menghapus/melemahkan test.

Batas: real provider drill memeriksa Storage/helper contract. Authorization/finalization/cleanup full routes menggunakan fixture pada suite PG/browser; bukan klaim seluruh app end-to-end terhadap Supabase remote private. Source unit/CI tidak membuktikan env efektif, private Production, Preview isolation, email deliverability, backup, operational approval atau visual fidelity.
