# R19 — Validasi source gabungan sebelum freeze

Lingkungan: Node22.22.0, PostgreSQL17 disposable loopback, Next15.5.28, Prisma5.22.0,
Playwright1.63.0, pinned Chromium153.0.8010.12. DSN/cookie/bearer tidak disimpan.

| Pemeriksaan | Hasil | Cara mengulang |
| --- | --- | --- |
| Unit + containment | 199 +25 PASS | Dockerfile.test / test-containment.yml: tanpa network, readonly, rootless, tanpa credential |
| PostgreSQL guard + bisnis | 85 PASS | database-entrypoints/cart-concurrency/product-lifecycle/transaction-correctness/order-refund-shipping |
| Auth PostgreSQL | 8 PASS | `node --import tsx --test tests/integration/auth-security.test.ts`, DB disposable eksplisit |
| Product browser | 16 PASS | `npm run test:e2e:products` |
| Operations browser | 20 PASS | `npm run test:e2e:operations` |
| Hydration replay | PASS, zero errors | `node --import tsx tests/integration/react-hydration-replay.ts` |
| Build/typecheck/lint/Prisma | PASS | scripts package.json; validate Prisma dengan target lokal |
| Kualifikasi P0 lama | 10×36 PASS pada 4f057e4 | QUALIFICATION_MATRIX.md; tidak digabung ke gate final |
| Gate HEAD akhir | Lihat SHA/matriks pada PR #61 | CI loop10 dan navigation-stability-matrix.mjs; satu kegagalan => FAILED |

Full audit tetap 2 Critical/8 High/5 Moderate; production-only 0 Critical/5 High/2 Moderate.
Tidak ada tes keuangan, seed/reset/migrasi terhadap Supabase bersama atau production.
