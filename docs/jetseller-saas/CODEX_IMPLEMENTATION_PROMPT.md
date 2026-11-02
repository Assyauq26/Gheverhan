# CODEX IMPLEMENTATION PROMPT — JetSeller SaaS Multi-Tenant

> **URGENT CURRENT TASK — 2026-11-02:** Build an actual **JetSeller seller registration form + OTP → provision isolated tenant database, storefront and authenticated seller dashboard automatically**. Follow [09_MVP_SELLER_SIGNUP_AUTO_STORE.md](09_MVP_SELLER_SIGNUP_AUTO_STORE.md) as highest-priority implementation specification. This is the immediate deliverable; do not start paid hosting billing, custom-domain purchase or J&T API integration before it works in isolated staging. **J&T is tenant-owned credentials only**, not shared Platform/Super Admin credentials.

> **Salin semua isi di bawah ini ke Codex Desktop/Cloud atau agent implementasi.** Prompt ini mengatur pekerjaan DEVELOPMENT; bukan persetujuan merge/deploy/live. Seluruh source of truth ada di direktori ini.

---

Kamu bertindak sebagai Principal Engineer / Solution Architect, Next.js Engineer, PostgreSQL/Prisma Engineer, Security Engineer, SaaS Billing Engineer, UI/UX Engineer, QA/Release Engineer untuk platform **JetSeller** pada repo GitHub **Assyauq26/Gheverhan**.

## TUJUAN PRODUK — WAJIB DIPAHAMI

JetSeller adalah platform SaaS pembuat toko online bagi seller/UMKM, bukan hanya toko demo.

**PERAN DAN PEMISAHAN AKSES**
- `jetseller.web.id` tetap landing JetSeller dan menyediakan **form pendaftaran seller publik**.
- **Dashboard utama JetSeller khusus Super Admin platform**. Seller tidak boleh mempunyai akses ke akun/platform dashboard Super Admin.
- Ketika seller mendaftar dan OTP email berhasil, sistem **OTOMATIS** membuat 1 tenant, 1 storefront baru di `<slug>.jetseller.web.id`, 1 dashboard seller di `<slug>.jetseller.web.id/admin`, 1 owner account, template toko serta subdomain setelah DNS/TLS terverifikasi; user tidak perlu membeli paket dulu. **Reserve `dashboard.jetseller.web.id` untuk Super Admin**, bukan slug seller.
- Seller masuk ke dashboard tokonya sendiri dan di dalamnya tersedia **Hosting & Domain**: trial gratis 30 hari, status paket, pilih/upgrade/perpanjang hosting, subdomain platform, menghubungkan domain custom, dan membeli domain **hanya setelah** registrar resmi benar-benar tersedia.
- Seller dashboard juga mengelola produk/varian/stok, order, payment, Appearance/dekorasi, gudang, marketing, pengiriman resmi J&T, role staff, analytics.
- Satu source code Next.js terpusat meng-upgrade seluruh seller. Data dan user tenant **terisolasi**, target tiap tenant database PostgreSQL terpisah; control-plane DB dan superadmin terpisah. **Jangan** buat copy repo/app per seller.
- Pertahankan `gheverhan.store` sebagai JetSeller Demo Store dan `jetseller.web.id` sebagai landing yang sudah ada. Repo mungkin tetap bernama Gheverhan; **jangan rename/private** tanpa persetujuan.
- API J&T pada **fase lanjutan** wajib **milik dan dikelola masing-masing seller/tenant**, dengan kredensial API resmi seller sendiri via dashboard seller. **Tidak ada satu kunci API global JetSeller maupun fallback platform-managed.** Dilarang pakai QR Fast Order privat, CAPTCHA/ticket/randstr buatan, undocumented endpoints, atau real order tanpa izin. Publikasi/carrier capability hanya setelah official UAT seller terkait. Checkout otomatis baseline EZ saja sampai J&T menyetujui layanan lain.

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
10. **`09_MVP_SELLER_SIGNUP_AUTO_STORE.md` — CURRENT PRIORITY**

Juga audit dokumen existing `docs/rebranding-jetseller/`, `docs/jnt-official/IMPLEMENTATION.md`, `frontend/package.json`, `frontend/prisma/schema.prisma`, auth/OTP, Prisma, Appearance, checkout, order, payment, infrastructure J&T, API routes, Workflows/CI, deployment runbooks, env variable requirements dan tests.

## PRIORITAS & METODE KERJA

1. Periksa repo HEAD terbaru, current `main`, status worktree, PR open dan baseline produksi dari evidence yang bisa dibuktikan; jangan mengandalkan SHA historis `fdf8d18` tanpa cek ulang.
2. **Audit nyata**, inventaris existing modules dan validasi rencana terhadap kode. Kategorikan: reusable as-is, refactor, missing, risky compatibility, external contract BLOCKED. Jangan menulis `DONE` karena dokumentasi menyebut target.
3. Buat branch baru dari `main` terbaru untuk tiap work package dan buka **PR kecil terpisah**. Jangan langsung commit ke `main`, jangan cherry-pick/mengubah branch orang lain tanpa review, jangan force push, jangan merge otomatis.
4. **KERJAKAN VERTICAL SLICE S0 → S1 → S2 SEKARANG**: audit & 2 disposable-tenant DB spike → minimal control-plane/seller auth → OTP/tenant job → isolated DB/owner/domain → **real tenant storefront dan seller dashboard shell** → sambungkan form `landing/jetseller/daftar/index.html` dan jalankan E2E landing→OTP→generated storefront+dashboard. **Jangan menunggu S3 untuk membuat dashboard awal**. Gunakan [09](09_MVP_SELLER_SIGNUP_AUTO_STORE.md) sebagai acceptance gate. S3 memperkaya modul ecommerce; S4 hosting/billing/custom domains, S5 seller-owned J&T, S6 ops, S7 release pilot adalah tahap **berikutnya**. Berhenti pada gate eksternal/produksi dan laporkan BLOCKED bila belum authorized.
5. Tulis catatan architecture decision (ADR) sebelum mengubah model database, auth, public routing atau tenant storage. Pilih DB-per-tenant sesuai keputusan produk; lakukan benchmark PostgreSQL connection pools, Prisma dynamic clients, 2+ disposable DBs, migration fleet, backup/restore; jika tidak feasible pada VPS existing, ajukan alternatif dengan bukti/biaya **sebelum mengganti desain**.
6. Design frontend mobile-first dengan putih, aksen merah JetSeller, minimalis, border ringan/borderless, rounded, sticky CTA bila relevan, keyboard/accessibility, error/loading/empty states. Dashboard Super Admin ≠ Seller. Signup seller ≠ customer signup demo. Hasil implementasi screenshot 360/390/428/768/1024/1440.
7. **Initial MVP**: real secure seller form (`/daftar/` currently placeholder) + password/confirmation + verified OTP → platform SellerAccount + provisioning job/outbox atomic → worker idempotent (DB, migrate, seed, owner, domain, trial) → **verified tenant storefront + authenticated seller dashboard**, owner landing in welcome/onboarding. Brand/slug can be entered during registration; product/payment/gudang/J&T completed **later in tenant dashboard**. Storefront safe public catalog empty state, **no live checkout** until payment/shipping/domain readiness.
8. Trial hosting 30 hari dimulai tepat sekali pada TENANT_READY. Di initial MVP boleh ada **read-only Hosting & Domain trial status** yang jujur; **jangan** membangun/menampilkan pembayaran hosting, custom-domain order, invoices atau registrar sebagai fitur aktif. Plan entitlements, quotas, PSP sandbox, invoices, renewals dan custom domain ditunda ke S4 setelah signup→toko lulus.
9. Adapt existing ecommerce module ke per-tenant DB dan enforce request host-to-tenant resolution. Semua JWT/cookie/sessions, SSR/cache, admin checks, media URLs, API/webhook, domain routing, uploads, checkout, order ID, inventory movement, email and Appearance scopes wajib aman. Review secara eksplisit kompatibilitas `gheverhan.store` / historical JWT env / current production.
10. **J&T pekerjaan S5, jangan implementasikan pada MVP signup.** Nanti baca dokumentasi resmi `https://developer.jet.co.id/documentation`, audit `frontend/src/infrastructure/shipping/jnt/**` dan `frontend/src/modules/shipping/jnt-fulfillment.service.ts` termasuk config/demo legacy. Bangun **tenant-owned / BYOK ONLY** credential UI di seller dashboard, tenant-specific secrets vault and resolver; **jangan membuat pilihan atau fallback platform-managed/global credential**. Seller mengatur kredensial J&T resmi, gudang dan izin layanan sendiri; Super Admin hanya melihat health metadata teredaksi dan dapat menonaktifkan koneksi berisiko, tidak melihat kuncinya. Pertahankan allowed official endpoints, mapping, quote validation, stable ID, durable AWB intent, UNKNOWN reconciliation, tracking/cancel/refund safety; HBO/JND/ECO tetap OFF untuk Create Order sampai disetujui per seller.
11. Setiap perubahan auth/tenancy/DB wajib diuji negative cross-tenant (A tidak bisa membaca B), auth role matrix, OTP replay, provisioning concurrency, billing webhook replay, J&T duplicate AWB, cache/request spoof, storage ACL, tenant database rollback.
12. CI dan laporan: `npm run typecheck`, `npm run lint`, `npm run build`, unit/containment, isolated PostgreSQL, browser regression plus extra multi-tenant tests. Sesuaikan perintah final dengan `frontend/package.json` pada HEAD; **jangan menonaktifkan tes keamanan, lint, CI gate atau menyembunyikan failure**.
13. Gunakan CI/disposable DB/isolated email sink/mock carrier; jangan memanggil live J&T, mengirim email nyata ke pelanggan, membayar sungguhan atau membuat order nyata dalam CI. Jangan mengakses/mengekspor data pelanggan produksi tanpa izin.
14. Catat per PR: branch + SHA exact, changed files, migration/DB effects, source-vs-goal status, test commands/counts, CI URLs, screenshots, security review, residual risks, release gates, rollback dan blockers. Audit/approval tertulis diperlukan sebelum merge/production release. Jangan mengklaim deploy berhasil hanya dari green image build.

## IMPLEMENTATION CHECKLIST PER SPRINT

**S0 — AUDIT AND SPIKE**
- Inventaris existing modules dan deploy; prioritaskan **landing/jetseller/daftar/index.html (currently placeholder)**, `frontend/src/modules/auth/registration-otp.ts` (customer only), `frontend/prisma/schema.prisma`, `frontend/src/lib/prisma.ts`, `frontend/src/app/(storefront)/page.tsx` dan `frontend/src/app/admin/page.tsx`. Buktikan bukan sekadar form UI; identifikasi routing, auth, DB isolation, worker, domain wildcard and secure API link.
- Buat `docs/jetseller-saas/reports/S0-BASELINE.md` dan architecture ADR.
- Buktikan 2 disposable tenant databases routed via trusted host, resource/pool benchmark, migration/restore feasibility.
- PR docs/POC minimal non-production. Minta review arsitektur.

**S1 — PLATFORM CONTROL PLANE**
- Implement **minimum** control-plane schemas SellerAccount/PlatformUser, Tenant/TenantMembership/TenantDatabase, seller OTP pending, Domain registration, ProvisioningJob/Outbox/Audit and one-time TrialEntitlement. Full paid billing schema deferred.
- Tenant host resolver, pooled tenant client factory + least privilege, control-plane auth/Super Admin role separation, default deny cross-tenant.
- Legacy demo compatibility + negative tests. PRs terpisah.

**S2 — SELLER SIGNUP / AUTO-PROVISION**
- Implement real seller signup on JetSeller landing (currently placeholder) with OTP/resend/rate limit and anti-enumeration, owner account, slug reservation. Do not route to demo customer registration.
- Idempotent worker: DB create→migration→seed→owner→subdomain/validated host→30-day trial, retry-safe state machine with polling status UI.
- **In S2, ship initial tenant-scoped public storefront and seller dashboard shell** (login, welcome/setup, empty catalog, own brand, trial metadata), not only provisioning schema. Wire landing real form last after backend is secure; use 2 tenant disposable DBs and browser E2E landing→OTP→dashboard+storefront.
- No J&T credentials, hosting payment, domain purchase or live checkout in this initial MVP.

**S3 — SELLER DASHBOARD EXPANSION & COMMERCE (AFTER INITIAL S2 SHELL)**
- Expand S2 existing tenant seller dashboard with responsive Beranda/Produk/Pesanan/Pengiriman/Marketing/Dekorasi/Analitik/Hosting & Domain/Pengaturan and onboarding wizard. Do not postpone the first working dashboard until S3.
- Per-tenant adaptation of product editor, media, promo, Appearance save/preview/publish, cart, checkout, payment/refund/shipping; staff RBAC; no demo regression.

**S4 — HOSTING, SUBSCRIPTIONS & DOMAINS**
- Plan catalogue and quotas managed by Super Admin; trial and grace/expiry rules, invoices, verified PSP sandbox webhooks.
- Seller Hosting & Domain UI, verified custom domain/TLS, protected host routing. Domain buy optional only after legal registrar API confirmed.

**S5 — SELLER-OWNED J&T OFFICIAL API (DEFERRED)**
- Each seller manages **their own official J&T account and encrypted credentials** in own seller dashboard; tenant-scoped secret vault, warehouse and rates. No Super Admin shared operational key and no default credential inherited by new tenants.
- Official tariff/area mapping, EZ create order after paid+packed and approved gates, AWB idempotency/UNKNOWN, tracking/cancel.
- CI mocked; carrier UAT explicitly authorized; no undisclosed API calls.

**S6 — PLATFORM OPERATIONS**
- Super Admin SaaS dashboard only for platform admins; tenant health, provisioning, billing, domains, **redacted tenant J&T connection health (not credentials)**, quotas, audit, alerts, backup/restore and migration fleet management.

**S7 — QA / PILOT RELEASE**
- Run full two-tenant and multi-tenant security, desktop/mobile visual regression, load/performance and DR drills.
- Draft release manifest and rollback, staging pilot, deployment gates. Do not deploy pilot/production without explicit owner approval.

## HARD STOP / NO-AUTO-ACTION GATES

Jangan: merge PR, deploy/modify production VPS, publish draft Appearance demo maupun tenant, change schema/data production, rotate/expose secrets, enable auto-deploy, change DNS/domains, purchase hosting/domain, create/cancel real AWB, call live J&T, change payment provider, create user accounts on production, rename/private repo. Semua memerlukan persetujuan terpisah sesuai dampak. User’s request to **implement code** tidak sama dengan izin melaksanakan mutation produksi.

Jika memerlukan external permissions (J&T agreement, registrar, PSP, DNS, credentials, owner decisions), lanjutkan pekerjaan independen dan tandai `BLOCKED — input/approval needed` secara spesifik; jangan invent hasil atau meminta secret di chat.

## FINAL DELIVERABLE FOR EVERY ITERATION

Kirim ringkasan: (a) apa yang sudah implemented, (b) PR & SHA, (c) test CI green/fail/pending and links, (d) screenshot desktop/mobile & UX assessment, (e) tenant/security findings, (f) migrations + backup/rollback impact, (g) apa yang belum didukung dan alasan, (h) next smallest PR/task. Status harus jelas: PLANNED / IMPLEMENTED_IN_BRANCH / CI_PASSED / REVIEWED / MERGE_APPROVED / DEPLOYED / LIVE_VERIFIED.

**MULAI SEKARANG: baca docs [09] dan seluruh source-of-truth, audit HEAD, kemudian implementasikan S0–S2 secara bertahap dalam PR kecil sampai staging E2E real form seller→OTP→tenant→storefront+dashboard berhasil. Fokus ini dulu; tunda J&T per seller, pembayaran hosting dan pembelian domain. Jangan berhenti hanya pada analisis konseptual, dan jangan merge/deploy/publish atau memanggil layanan produksi tanpa izin.**
