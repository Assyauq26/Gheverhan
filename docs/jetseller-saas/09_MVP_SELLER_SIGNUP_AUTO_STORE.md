# 09 — TARGET MVP SETELAH FRONTEND: Seller Signup → Automatic Storefront + Seller Dashboard

> **Urutan kerja baru 2026-11-02:** PR pertama **hanya frontend** signup JetSeller (form, stepper, validasi, preview OTP/status tanpa backend). Lihat [10](10_FRONTEND_REGISTRATION_FIRST.md). Dokumen 09 ini tetap spesifikasi tujuan **end-to-end tahap kedua**, jangan meminta Codex membuat backend, database tenant, provisioning, storefront atau dashboard pada PR frontend pertama.

**Product decision 2026-11-02 (overrides prior roadmap when sequencing differs, tetapi tidak mengesampingkan urutan frontend-first pada dokumen 10).**
**Status:** IMPLEMENTATION SPEC / not implemented. Read with 01–08; the MVP defined here precedes hosting billing, custom-domain purchase and J&T integration. Only approved development PRs may follow it.

## 1. Goal and hard product contract

A visitor on `https://jetseller.web.id/daftar/` creates and verifies a **seller account**, enters a unique brand/store slug and, without manually deploying software or paying for hosting, obtains:
1. A **real, isolated seller tenant** with its own database, owner, storefront, dashboard and starter Appearance/template.
2. A **working seller dashboard** on that tenant's host (`/admin` with authenticated owner). An empty but genuine catalog/order shell and editable store profile/setup are acceptable for first vertical slice; fake metrics, shared demo data, or mere static mockup do **not** count.
3. A **public storefront** on its own validated platform subdomain displaying the correct brand and a clean catalog empty state, without exposing any other tenant's data.
4. An initial **30-day hosting trial entitlement**, created once when the tenant is ready, not a payment/purchase flow.

**Critical:** no need to configure J&T, billing, custom domain or real checkout before tenant creation. Seller can configure those later; checkout stays disabled until payment/shipping prerequisites are validated.

**J&T product decision:** each seller/tenant configures and owns **their own official J&T Express credentials and warehouse** in their seller dashboard, later phase. JetSeller Super Admin does **not** manage a shared operational J&T API account for all sellers. Platform has redacted connection health and can suspend unsafe integrations, never read/use seller secrets. Do not implement J&T credential entry in initial signup.

## 2. Actual repo baseline (read-only inspection, 2026-11-02)

- `landing/jetseller/daftar/index.html` currently is a **registration coming-soon page**, not a live signup form; replace only after securely connected server implementation and QA.
- `landing/jetseller/assets/js/main.js`: existing static landing navigation; its form route hosting/API contract must be designed explicitly (CORS/CSRF, TLS, cookie, same-origin); don't put passwords or OTP in third-party scripts/analytics.
- `frontend/src/modules/auth/registration-otp.ts`: existing OTP for **store customers**, NOT platform sellers. Reuse safe helper patterns only through reviewed boundaries.
- `frontend/prisma/schema.prisma` and `frontend/src/lib/prisma.ts`: legacy single-store database. Tenant control plane/DB resolver not yet implemented; don't pretend tenant isolation already exists.
- `frontend/src/app/admin/page.tsx`: legacy seller/admin dashboard, can be adapted to tenant context later; do not expose its privileged routes without server-side tenant auth.
- `frontend/src/app/(storefront)/page.tsx`: legacy storefront consumes catalog and Appearance; must use tenant DB and tenant cache keys before wildcard hosts are enabled.
- `gheverhan.store` demo and existing JetSeller marketing host must keep working during migration.

## 3. Form design and UX (mobile-first)

**Step A — Seller identity:** name (required), verified email (required, normalized unique), phone (required; normalize Indonesia), password and confirmation (server-side strength and generic errors), explicit ToS/privacy consent (version/time). Do not collect J&T API credentials, government IDs or payment cards at registration.

**Step B — Email OTP:** six digits from approved email delivery, TTL and attempt limit, resend cooldown, generic anti-enumeration feedback; hash secret server-side, never log full OTP. If error/timeout allow safe resume; no duplicate seller.

**Step C — Store identity:** brand name, unique slug preview (lowercase ascii rules/reserved list), optional category, logo optional. Domain preview is provisional until platform DNS/TLS verified. Slug reservation atomic, retry-safe.

**Step D — Provisioning status:** `Menyiapkan toko` progress with safe polling, retryable/non-retryable error, support path; `Buka Dashboard` and `Lihat Toko` only when actual URLs pass readiness checks. Show accurate readiness badge, no fake claim “live” before verified host/TLS.

**Initial dashboard first-login:** welcome/onboarding checklist: store profile, first product, logo/dekorasi, warehouse, payment, shipping J&T later, Hosting & Domain trial status. The platform Super Admin login is completely separate. Responsive 360/390/428/768/1024/1440; keyboard, labels, focus, loading, error/resend, accessibility checks.

## 4. Target API & state machine (proposed, verify route compatibility)

```text
POST /api/platform/sellers/register/start       -> pending email verification
POST /api/platform/sellers/register/verify-otp   -> verified seller + reserved tenant + job (atomic/idempotent)
POST /api/platform/sellers/store/setup           -> brand/slug draft (or earlier if held in pending)
GET  /api/platform/sellers/provision/status      -> authorized progress + URLs when ready
GET  /api/tenant/context                         -> host-resolved public tenant info only
GET  /admin                                      -> owner-authenticated dashboard for that tenant
```

These are **proposed** routes, not existing endpoint claims; select final path consistent with source and host setup. Host bridging between the static marketing site and Next.js API must be designed for CSRF/origin allowlist, credentials, and secure redirect. Prefer same-origin reverse-proxy or dedicated registrar page on Next with a controlled marketing CTA; **never post password to unapproved cross-origin endpoints**.

```text
PENDING_VERIFICATION
 -> SELLER_VERIFIED
 -> TENANT_RESERVED
 -> PROVISIONING_QUEUED
 -> DB_ALLOCATED
 -> DB_SCHEMA_READY
 -> OWNER_AND_DEFAULTS_READY
 -> SUBDOMAIN_READY / DOMAIN_PENDING
 -> TENANT_READY [activate 30-day trial exactly once]
 -> ONBOARDING_REQUIRED
 -> COMMERCE_READY [future verified payment/shipping gates]
```

Use control-plane transactional unique constraints + outbox + stable idempotency key. Worker background provision with step checkpoint/lease/retry, secret refs and compensation; DB-per-tenant; migrate/seed with no demo customer data. DNS pending must not report public storefront live; can offer a verified authenticated preview/status until platform wildcard DNS and TLS ready.

**Domain choice:** default storefront/seller-dashboard tenant is `<slug>.jetseller.web.id` and `<slug>.jetseller.web.id/admin`. Reserve `jetseller.web.id` for marketing, `dashboard.jetseller.web.id` for Super Admin, plus `api`, `www`, `admin` and other sensitive labels; block slug collisions and all unknown hosts. **Do not assume wildcard DNS/TLS/Caddy routing is already available**. Preserve standalone `gheverhan.store` demo.

## 5. Narrow vertical-slice work packages (execute in order)

| PR | Scope | Pass condition |
| --- | --- | --- |
| MVP-0 | Read-only repo/host audit, 2 disposable tenant DB spike, architecture decisions, minimal UX screen spec | Verified route/DB plan and no production mutations |
| MVP-1 | Control-plane tenant registry, seller platform identity, OTP challenge; no live landing switch | Transactional tests, no legacy customer regression |
| MVP-2 | Reliable provisioning job/outbox, tenant DB create+migrate+seed, tenant owner, trial once | Retry/kill/concurrency tests; no duplicate tenant |
| MVP-3 | Trusted host routing, tenant resolver/DB client and isolated storefront + initial seller dashboard shell | Seller A/B different storefront/profile; cross-tenant negative tests |
| MVP-4 | Wire `/daftar/` real form and OTP/provision status to server, activate secure entry points | Browser E2E from landing → OTP → new dashboard + public store |
| MVP-5 | Seller onboarding/store profile/first product/Appearance in tenant; readiness flags and empty states | Seller publishes own theme/product; demo unaffected |
| MVP-6 | Full staging pilot, regression 6 viewports, two-tenant security, backups/rollback rehearsal | Reviewed evidence before any production approval |

Keep each PR separately reviewable and reversible; it is acceptable to split if a work package becomes too large. **No domain purchase, hosting invoices, or J&T API operations in these MVP PRs.** Trial metadata and a Hosting & Domain **status** tile may appear as read-only/coming later but must not fake working checkout.

## 6. MVP acceptance tests (release blockers)

- A01: OTP invalid/expired/replayed creates **zero** tenant; valid OTP exactly one seller and provisioning job.
- A02: 10 concurrent/repeated requests yield one seller, one tenant, one owner, one DB descriptor and one trial start.
- A03: New storefront renders correct tenant brand, placeholder/empty catalog, no demo products or Seller B data.
- A04: New seller owner can login to its `/admin` and see tenant onboarding; customer or other tenant gets denied 403/404.
- A05: Host spoof, wildcard unknown slug, forwarded header spoof, cache poisoning, IDOR/order/API/media path cross-tenant denied.
- A06: Broken job restarts from checkpoint with redacted errors and no duplicate tenant/DB; no accidental data deletion.
- A07: Legacy `gheverhan.store` storefront, login/OTP, `/admin`, Appearance draft/published and landing all pass regression.
- A08: Storefront available only if DNS/TLS/tenant status ready; checkout disabled until payment and shipping ready.
- A09: Responsive/accessibility/browser E2E for registration, OTP, provisioning, dashboard and storefront pass at 360/390/428/768/1024/1440.
- A10: No J&T shared credentials; no real carrier call, no domain purchase, no production mutation/merge/deploy during development.

## 7. Owner gates and reporting

- Early S0 ADR requires review for **DB-per-tenant feasibility/cost** and platform domain/wildcard route.
- No changes to real VPS DNS, database, secrets, marketing deployment, production demo or Appearance until separate approval.
- Commit/review only on branches; real connected signup rollout needs secure backend, anti-abuse, transactional provisioning, operational cleanup, backup and agreed privacy/ToS.
- Each PR report HEAD SHA, worktree, tests + CI, 2-tenant evidence, UI screenshots, expected vs actual flows, blockers, rollback, next PR; distinguish `implemented in branch` vs `live verified`.

**Definition of the first deliverable:** a test seller can complete a real OTP-driven signup in staging and open an isolated storefront and authenticated seller dashboard with verified readiness; billing and J&T not required.
