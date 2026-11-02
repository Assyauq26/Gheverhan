# 08 — Sprint Roadmap, Work Packages, Release Gates & Risks

> **Gate FE-0 mendahului semua sprint di bawah:** implementasikan frontend form `landing/jetseller/daftar/index.html` saja sebagai Draft PR, dengan validasi, stepper, dan OTP/provisioning preview lokal yang jujur; **tanpa backend atau tenant**. Gunakan [10](10_FRONTEND_REGISTRATION_FIRST.md) dan [Prompt Codex](CODEX_IMPLEMENTATION_PROMPT.md). Setelah FE-0 direview, lanjutkan S0/S1/S2.
> **Roadmap terbaru (2026-11-02):** Semua pekerjaan diarahkan lebih dulu pada **seller signup real form/OTP → automatic isolated database, storefront dan seller dashboard**. Detail acceptance/urutan PR [09](09_MVP_SELLER_SIGNUP_AUTO_STORE.md). **J&T tenant-managed/BYOK only**, dikerjakan setelah MVP toko otomatis terbukti. Hosting berbayar, pembelian custom domain, full commerce dan Super Admin advanced dipindahkan ke fase lanjut; jangan membuat pendaftaran tergantung J&T atau pembayaran.

## 1. Execution order: do not start with visual dashboard alone

Workstream dependencies:
```text
Inventory/baseline -> architecture/2 disposable-DB spike
   -> minimal control plane + seller OTP auth -> idempotent provisioning
   -> trusted host/domain + isolated storefront and seller-dashboard shell
   -> connect real /daftar/ form to backend -> E2E seller signup + store (MVP FIRST)
   -> seller catalog/Appearance adaptation
   -> hosting paid billing / custom domains / tenant-owned J&T (LATER)
   -> advanced Super Admin operations -> phased SaaS release
```
Parallelization is possible only for isolated design/contract tasks; no conflicting schema changes in multiple branches.

## 2. Detailed sprint backlog (each row = proposed PR/work package)

| Sprint | PR | Deliverable | Acceptance/evidence |
| --- | --- | --- | --- |
| S0 Audit | S0-A | Inventory route/auth/DB/CI, legacy and J&T feature map, current deployment snapshot | actual HEAD + gaps + dependency graph, no prod mutation |
| S0 ADR | S0-B | DB-per-tenant spike, bounded client pools, 2 disposable DB, backup/restore | cross-tenant 403/404, memory/cost/load benchmark |
| S0 UX | S0-C | Seller onboarding/dashboard design spec mobile+desktop | reviewed screens, route ownership, error/empty states |
| S1 Foundation | S1-A | Control-plane Prisma schema + migrations + fixtures; no legacy change | isolated Postgres fresh/migrate/rollback |
| S1 Security | S1-B | Host → tenant resolver, default deny, trusted proxy & cache scoping | domain spoof/IDOR/cache tests |
| S1 Auth | S1-C | Platform Super Admin login/RBAC + seller auth separation | negative role/access matrix and regression demo |
| S2 Signup | S2-A | Seller registration + OTP isolated from customer signup | OTP replay/rate limit/concurrency test |
| S2 Worker | S2-B | Provisioning jobs/outbox/leases/idempotent DB+schema+seed | kill/retry 3 points, no duplicates, trace |
| S2 Trial | S2-C | Trial 30d on tenant ready + status/notifications | fixed-clock boundary, never reset |
| S2 Routing | S2-D | Trusted host/subdomain + tenant SSR/API/storage **and initial storefront + authenticated seller-dashboard shell** | tenant A/B own brand and empty-state storefront, owner dashboard access, demo smoke, DNS/TLS review |
| S2 Signup UI | S2-E | Connect real `jetseller.web.id/daftar/` form, OTP, status UI and redirect to generated storefront/dashboard | E2E landing→OTP→provision→seller `/admin` + public store; no placeholder/fake signup |
| S3 Seller | S3-A | Expand seller dashboard onboarding wizard + store-profile editor; initial seller shell is already delivered in S2-D | responsive nav, owner/staff/customer isolation |
| S3 Commerce | S3-B | Per-tenant product, appearance, cart, checkout, order core adaptation | DB isolation + commerce concurrency |
| S3 Staff | S3-C | Staff roles, orders, warehouse, merchant payment configuration | server permission tests and audit |
| S4 Plans | S4-A | Super Admin plan catalog, entitlement, storage/resource quota | quota concurrency and upgrade tests |
| S4 Billing | S4-B | Billing invoices, trial expiration/grace, verified PSP sandbox | signed webhook replay and duplicate check |
| S4 Domains | S4-C | Domain connect: challenge, routing, TLS/renewal and recovery | domain takeover/rollback tests |
| S4 Registrar | S4-D | **Optional/gated:** Buy domain official registrar contract | only after agreements, pricing and E2E sandbox |
| S5 Carrier | S5-A | **Seller-owned official J&T account only**: credential form in seller dashboard, per-tenant vault refs and secure resolver, no shared platform API credentials | tenant owner-only configuration, seller A/B credential isolation, no global J&T fallback |
| S5 Shipping | S5-B | Tenant-specific area mapping, tariff quote and weight validation | EZ only unless vendor UAT, 2-tenant tests |
| S5 Fulfillment | S5-C | Durable create AWB, UNKNOWN reconciliation, tracking/cancel per tenant | no duplicate AWB, refund/stock safety |
| S5 UAT | S5-D | Carrier official sandbox/UAT package and operator signoff | no live order without separate authorization |
| S6 Admin | S6-A | Platform Super Admin tenant/provisioning/billing/domain dashboards | management RBAC, audit/redaction |
| S6 Ops | S6-B | Tenant backup/export/restore, schema fleet upgrades and alerts | test restore, drift handling, rollback |
| S7 Release | S7-A | 2→10→pilot tenants staging, load/security/visual regression | signed evidence and rollback rehearsals |
| S7 Launch | S7-B | Production pilot with strict feature gates | explicit separate merge/release/contract approvals |

Sprint numbers are **dependency groups**, not commitments to a calendar or fixed number of days. Keep PRs small and separately reversible. Future packages may be split based on real code size.

## 3. Definition of Done per PR

- Requirements/acceptance ID mapped to files changed, baseline and threat model.
- Unit, containment, lint, typecheck/build PASS; isolated database+browser tests for relevant flows and cross-tenant denial; no weakened tests.
- No production credentials or customer PII in tests/screenshots/logs.
- Code review findings P1/P2 resolved or explicitly blocked, required approvals.
- Migration safe & reversible/compensatable, feature flags disabled by default; UX desktop/mobile and accessibility verified.
- Document update + runbook, rollback proof, QA evidence exact HEAD and links.
- **Do not merge/deploy by default**. Separate owner approval after evidence, especially DB schema, J&T external calls, DNS or payment.

## 4. Release stages and gating

**Gate G0 Documentation**: owner review roadmap/architecture, UX and external partnership decisions. No code change, no production mutation.

**Gate G1 Foundation staging**: approve control-plane schema, 2-tenant DB prototype, migrations/backup, threat-model tests.

**Gate G2 Seller signup (PRIMARY MILESTONE)**: staging E2E REAL landing registration form `/daftar/` → email OTP → isolated tenant DB/job → tenant-owned storefront on verified subdomain + authenticated seller-dashboard shell, correct tenant brand, no cross-tenant leakage, no duplicate tenant; checkout disabled until independently ready. **Do not start paid billing or live J&T before G2 evidence passes.**

**Gate G3 Commercial operations**: isolated commerce/payment/stock, hosting trial/billing/domain, webhook validation and entitlement.

**Gate G4 Official J&T pilot**: contract approved, UAT sandbox, service matrix/mapping, safe live-call approval, per tenant feature flag, order reconciliation.

**Gate G5 Production pilot**: backup and restore drill; SSH/deploy lock and pinned image SHA, monitor current demo/landing; 1–2 approved pilot tenants, staged expansion; rollback team ready.

**Gate G6 General availability**: monitored metrics, data protection/legal, support SLA, quotas, provider contracts, tenant-level restore and incident plan.

No gate can be inferred from a single CI success. Mark facts with `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`, `NOT_APPLICABLE` and supporting evidence.

## 5. Rollback/incident plan

- App rollout: immutable image tag pinned SHA, previous image retained, deploy lock, smoke both `gheverhan.store` and `jetseller.web.id`; revert image if source issue.
- Database: expand/contract, never destructive down migration blindly; backup and restore drill before production. Each tenant DB version inventory and migration batch checkpoint.
- Provisioning: stop queue; resume/compensate jobs safely; do not delete partially initialized DB with customer data.
- Billing: feature flag suspend upgrades, reconcile invoices; never erase settled payments.
- Domain: rollback canonical domain/SSL to previous validated route, revoke compromised challenge.
- J&T: flag-off creation, preserve UNKNOWN intent, manual reconcile AWB, do not automatically cancel/refund in-flight orders.
- Appearance: published/draft/version per tenant, revision history remains intact; do not publish demo Appearance as side effect.

## 6. Risk register

| Risk | Severity | Mitigation/owner decision |
| --- | --- | --- |
| Prisma connection explosion per tenant DB on 1 VPS | Critical | S0 benchmark + bounded pools, DB connection gateway, review topology |
| Cross-tenant data leakage in SSR/cache/API | Critical | deny-by-default tenant context, 2 DB isolation tests, security signoff |
| Legacy demo breaks during routing/auth migration | Critical | compatibility bridge, auth/cookie migration & independent smoke |
| J&T tenant credentials cross-contamination or missing official per-seller permission | Critical | **tenant-owned only**, no global fallback, vault isolation, per-seller vendor approval/UAT, checkout disabled by default |
| Billing events cause duplicate entitlement/invoices | High | verified webhook, idempotent ledger, reconciliation |
| Domain hijack/SSL mismatch | High | DNS challenge+reverification, host allowlist, cert lifecycle |
| Automatic AWB retry creates duplicates | Critical | durable intent, UNKNOWN state, manual reconciliation |
| Migration fleet partial failure | High | phased schema versions, batch pause, backward compatibility |
| Tenant PII/secrets leak in logs/backups | Critical | redaction, vault, access-controlled backups and retention |
| Storage quota/disk exhaustion | High | baseline usage/capacity tests, quota, alerts, backup/cleanup policy |
| Unsupported carrier service assumptions | High | EZ-only baseline, official service capability matrix |
| Team assumes draft docs mean feature live | High | evidence links, status labels, release approval gate |

## 7. Required final report per work package

Provide: objective, HEAD SHA, branch/PR URL, actual code/files touched, schema delta, CI and local tests with PASS/FAIL counts, two-tenant security evidence, before/after screenshots if UI, unverified assumptions and blockers, production impact statement, release/rollback plan, and next smallest PR. Distinguish `CODE_READY`, `MERGE_APPROVED`, `DEPLOYED`, `LIVE_VERIFIED`. Do not present planned work as shipped.
