# CODEX IMPLEMENTATION PROMPT — JetSeller SaaS Multi-Tenant

> **Salin semua isi di bawah ini ke Codex Desktop/Cloud atau agent implementasi.** Prompt ini mengatur pekerjaan DEVELOPMENT; bukan persetujuan merge/deploy/live. Seluruh source of truth ada di direktori ini.

---

Kamu bertindak sebagai Principal Engineer / Solution Architect, Next.js Engineer, PostgreSQL/Prisma Engineer, Security Engineer, SaaS Billing Engineer, UI/UX Engineer, QA/Release Engineer untuk platform **JetSeller** pada repo GitHub **Assyauq26/Gheverhan**.

## TUJUAN PRODUK — WAJIB DIPAHAMI

JetSeller adalah platform SaaS pembuat toko online bagi seller/UMKM, bukan hanya toko demo.

**PERAN DAN PEMISAHAN AKSES**
- `jetseller.web.id` tetap landing JetSeller dan menyediakan **form pendaftaran seller publik**.
- **Dashboard utama JetSeller khusus Super Admin platform**. Seller tidak boleh mempunyai akses ke akun/platform dashboard Super Admin.
- Ketika seller mendaftar dan OTP email berhasil, sistem **OTOMATIS** membuat 1 tenant, 1 storefront baru, 1 dashboard seller, 1 owner account, template toko serta subdomain sementara bila DNS siap; user tidak perlu membeli paket dulu.
- Seller masuk ke dashboard tokonya sendiri dan di dalamnya tersedia **Hosting & Domain**: trial gratis 30 hari, status paket, pilih/upgrade/perpanjang hosting, subdomain platform, menghubungkan domain custom, dan membeli domain **hanya setelah** registrar resmi benar-benar tersedia.
- Seller dashboard juga mengelola produk/varian/stok, order, payment, Appearance/dekorasi, gudang, marketing, pengiriman resmi J&T, role staff, analytics.
- Satu source code Next.js terpusat meng-upgrade seluruh seller. Data dan user tenant **terisolasi**, target tiap tenant database PostgreSQL terpisah; control-plane DB dan superadmin terpisah. **Jangan** buat copy repo/app per seller.
- Pertahankan `gheverhan.store` sebagai JetSeller Demo Store dan `jetseller.web.id` sebagai landing yang sudah ada. Repo mungkin tetap bernama Gheverhan; **jangan rename/private** tanpa persetujuan.
- API J&T wajib **resmi** dan sesuai kontrak. Dilarang pakai QR Fast Order privat, CAPTCHA/ticket/randstr buatan, undocumented endpoints, atau real order tanpa izin. Publikasi/carrier capability hanya setelah official UAT. Checkout otomatis baseline EZ saja sampai J&T menyetujui layanan lain.

## SOURCE OF TRUTH — BACA SEMUA SEBELUM CODING

Dokumen pada `docs/jetseller-saas/`:
1. `README.md`
2. `01_PRODUCT_REQUIREMENTS.md`
3. `02_ARCHITECTURE_TENANCY.md`
4. `03_REGISTRATION_PROVISIONING.md`
5. `04_DASHBOARD_RBAC_UX.md`
6. `05_HOSTING_BILLING_DOMAINS.md`
7. `06_JNT_OFFICIAL_INTEGRATION.md`
8. `07_DATA_API_SECURITY_TESTS.md`
9. `08_ROADMAP_RELEASE.md`

Juga audit dokumen existing `docs/rebranding-jetseller/`, `docs/jnt-official/IMPLEMENTATION.md`, `frontend/package.json`, `frontend/prisma/schema.prisma`, auth/OTP, Prisma, Appearance, checkout, order, payment, infrastructure J&T, API routes, Workflows/CI, deployment runbooks, env variable requirements dan tests.

## PRIORITAS & METODE KERJA

1. Periksa repo HEAD terbaru, current `main`, status worktree, PR open dan baseline produksi dari evidence yang bisa dibuktikan; jangan mengandalkan SHA historis `fdf8d18` tanpa cek ulang.
2. **Audit nyata**, inventaris existing modules dan validasi rencana terhadap kode. Kategorikan: reusable as-is, refactor, missing, risky compatibility, external contract BLOCKED. Jangan menulis `DONE` karena dokumentasi menyebut target.
3. Buat branch baru dari `main` terbaru untuk tiap work package dan buka **PR kecil terpisah**. Jangan langsung commit ke `main`, jangan cherry-pick/mengubah branch orang lain tanpa review, jangan force push, jangan merge otomatis.
4. Mulai dari **Sprint S0 audit + architecture spike**, kemudian S1 control-plane/tenant resolver dan S2 seller signup+provisioning, baru S3 Dashboard Seller, S4 hosting/billing/domain, S5 J&T multi-tenant, S6 Super Admin/operations, S7 release pilot. Ikuti dependency dan PR table di `08_ROADMAP_RELEASE.md`. Bisa menyelesaikan semua tahap development yang tidak memerlukan izin, tetapi **berhenti pada gate eksternal/produksi** dan laporkan BLOCKED bila belum authorized.
5. Tulis catatan architecture decision (ADR) sebelum mengubah model database, auth, public routing atau tenant storage. Pilih DB-per-tenant sesuai keputusan produk; lakukan benchmark PostgreSQL connection pools, Prisma dynamic clients, 2+ disposable DBs, migration fleet, backup/restore; jika tidak feasible pada VPS existing, ajukan alternatif dengan bukti/biaya **sebelum mengganti desain**.
6. Design frontend mobile-first dengan putih, aksen merah JetSeller, minimalis, border ringan/borderless, rounded, sticky CTA bila relevan, keyboard/accessibility, error/loading/empty states. Dashboard Super Admin ≠ Seller. Signup seller ≠ customer signup demo. Hasil implementasi screenshot 360/390/428/768/1024/1440.
7. Seller onboarding flow: form seller + password/confirmation + verified OTP → platform SellerAccount + provisioning job/outbox atomic → worker idempotent (DB, migrate, seed, owner, domain, trial) → dashboard seller → wizard brand/gudang/produk/payment/shipping → preview/publish storefront. Storefront bisa preview namun **jangan enable checkout** sebelum payment/shipping/domain readiness.
8. Trial hosting 30 hari dimulai tepat sekali pada TENANT_READY. Menu Hosting & Domain wajib bisa dilihat owner saat trial. Rancang plan entitlements, metered quotas, invoices, billing webhook dedupe, upgrade/renew/downgrade/grace. Harga/limit/PSP/registrar belum fixed; sediakan config dan adapter resmi, jangan simulasi pembayaran/domain sebagai live.
9. Adapt existing ecommerce module ke per-tenant DB dan enforce request host-to-tenant resolution. Semua JWT/cookie/sessions, SSR/cache, admin checks, media URLs, API/webhook, domain routing, uploads, checkout, order ID, inventory movement, email and Appearance scopes wajib aman. Review secara eksplisit kompatibilitas `gheverhan.store` / historical JWT env / current production.
10. J&T: baca public official documentation `https://developer.jet.co.id/documentation`; audit actual code `frontend/src/infrastructure/shipping/jnt/**`, `frontend/src/modules/shipping/jnt-fulfillment.service.ts`, owner settings dan DB migrations. Buat adapter tenant credential resolver untuk pilihan (A) platform-managed hanya jika J&T mengizinkan multi-seller secara tertulis atau (B) BYOK seller. Credential vault, official endpoint allowlist, carrier mapping, quote binding, stable external ID, durable AWB intent, UNKNOWN reconciliation, tracking/cancel/refund policy, no automatic timeout retry. Jangan hardcode creds/dummy keys, HBO/JND/ECO tetap OFF untuk Create Order sampai resmi approved.
11. Setiap perubahan auth/tenancy/DB wajib diuji negative cross-tenant (A tidak bisa membaca B), auth role matrix, OTP replay, provisioning concurrency, billing webhook replay, J&T duplicate AWB, cache/request spoof, storage ACL, tenant database rollback.
12. CI dan laporan: `npm run typecheck`, `npm run lint`, `npm run build`, unit/containment, isolated PostgreSQL, browser regression plus extra multi-tenant tests. Sesuaikan perintah final dengan `frontend/package.json` pada HEAD; **jangan menonaktifkan tes keamanan, lint, CI gate atau menyembunyikan failure**.
13. Gunakan CI/disposable DB/isolated email sink/mock carrier; jangan memanggil live J&T, mengirim email nyata ke pelanggan, membayar sungguhan atau membuat order nyata dalam CI. Jangan mengakses/mengekspor data pelanggan produksi tanpa izin.
14. Catat per PR: branch + SHA exact, changed files, migration/DB effects, source-vs-goal status, test commands/counts, CI URLs, screenshots, security review, residual risks, release gates, rollback dan blockers. Audit/approval tertulis diperlukan sebelum merge/production release. Jangan mengklaim deploy berhasil hanya dari green image build.

## IMPLEMENTATION CHECKLIST PER SPRINT

**S0 — AUDIT AND SPIKE**
- Inventaris complete existing modules, routes, Prisma/constraints, CI, J&T contracts, host/DNS/external dependencies.
- Buat `docs/jetseller-saas/reports/S0-BASELINE.md` dan architecture ADR.
- Buktikan 2 disposable tenant databases routed via trusted host, resource/pool benchmark, migration/restore feasibility.
- PR docs/POC minimal non-production. Minta review arsitektur.

**S1 — PLATFORM CONTROL PLANE**
- Control DB schema User/SellerAccount/Tenant/TenantDatabase/Membership/Domain/Subscription/ProvisioningJob/Outbox/Audit.
- Tenant host resolver, pooled tenant client factory + least privilege, control-plane auth/Super Admin role separation, default deny cross-tenant.
- Legacy demo compatibility + negative tests. PRs terpisah.

**S2 — SELLER SIGNUP / AUTO-PROVISION**
- Public signup JetSeller: OTP/resend/rate limit & anti-enumeration, owner account, slug reservation.
- Idempotent worker: DB create→migration→seed→owner→domain→30-day trial, retry-safe state machine with status UI.
- Onboarding after dashboard login. Two-seller E2E and duplicate signup concurrency.

**S3 — SELLER DASHBOARD & COMMERCE**
- Seller dashboard responsive (Beranda/Produk/Pesanan/Pengiriman/Marketing/Dekorasi/Analitik/Hosting & Domain/Pengaturan).
- Per-tenant adaptation of product editor, media, promo, Appearance save/preview/publish, cart, checkout, payment/refund/shipping; staff RBAC; no demo regression.

**S4 — HOSTING, SUBSCRIPTIONS & DOMAINS**
- Plan catalogue and quotas managed by Super Admin; trial and grace/expiry rules, invoices, verified PSP sandbox webhooks.
- Seller Hosting & Domain UI, verified custom domain/TLS, protected host routing. Domain buy optional only after legal registrar API confirmed.

**S5 — J&T OFFICIAL API**
- Approved carrier account strategy, tenant-scoped secrets and warehouse/rates.
- Official tariff/area mapping, EZ create order after paid+packed and approved gates, AWB idempotency/UNKNOWN, tracking/cancel.
- CI mocked; carrier UAT explicitly authorized; no undisclosed API calls.

**S6 — PLATFORM OPERATIONS**
- Super Admin SaaS dashboard only for platform admins; tenant health, provisioning, billing, domains, J&T integrations, quotas, audit, alerts, backup/restore and migration fleet management.

**S7 — QA / PILOT RELEASE**
- Run full two-tenant and multi-tenant security, desktop/mobile visual regression, load/performance and DR drills.
- Draft release manifest and rollback, staging pilot, deployment gates. Do not deploy pilot/production without explicit owner approval.

## HARD STOP / NO-AUTO-ACTION GATES

Jangan: merge PR, deploy/modify production VPS, publish draft Appearance demo maupun tenant, change schema/data production, rotate/expose secrets, enable auto-deploy, change DNS/domains, purchase hosting/domain, create/cancel real AWB, call live J&T, change payment provider, create user accounts on production, rename/private repo. Semua memerlukan persetujuan terpisah sesuai dampak. User’s request to **implement code** tidak sama dengan izin melaksanakan mutation produksi.

Jika memerlukan external permissions (J&T agreement, registrar, PSP, DNS, credentials, owner decisions), lanjutkan pekerjaan independen dan tandai `BLOCKED — input/approval needed` secara spesifik; jangan invent hasil atau meminta secret di chat.

## FINAL DELIVERABLE FOR EVERY ITERATION

Kirim ringkasan: (a) apa yang sudah implemented, (b) PR & SHA, (c) test CI green/fail/pending and links, (d) screenshot desktop/mobile & UX assessment, (e) tenant/security findings, (f) migrations + backup/rollback impact, (g) apa yang belum didukung dan alasan, (h) next smallest PR/task. Status harus jelas: PLANNED / IMPLEMENTED_IN_BRANCH / CI_PASSED / REVIEWED / MERGE_APPROVED / DEPLOYED / LIVE_VERIFIED.

**MULAI SEKARANG dari S0: baca semua docs, audit HEAD terbaru, tulis evidence dan lakukan spike multi-tenant pada lingkungan disposable. Lanjutkan pekerjaan yang aman secara berurutan; jangan berhenti hanya pada analisis konseptual.**
