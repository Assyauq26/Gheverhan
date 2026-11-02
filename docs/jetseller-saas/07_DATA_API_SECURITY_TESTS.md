# 07 — Data Model, API Contracts, Security and QA

## 1. Existing baseline vs proposed data

Existing `frontend/prisma/schema.prisma` contains ecommerce single-store model: `User`, `Role`, `Permission`, `PendingRegistration`, `Product`, `Inventory`, `Order`, `Payment`, `Shipment`, `StoreAppearance`, dll. `frontend/src/lib/prisma.ts` menginisialisasi satu `PrismaClient`. **Tidak ada bukti multi-tenant provisioning/tenant DB routing produksi** dalam audit terbatas ini. Codex wajib menjalankan pencarian kode, tes dan schema scan ulang.

**Proposed control plane models** (nama bisa disesuaikan ADR):

| Model | Field minimum/invariants |
| --- | --- |
| PlatformUser | id, unique normalizedEmail, status, emailVerifiedAt, passwordHash, sessionVersion, roles |
| SellerAccount | id, platformUserId, legalDisplayName, normalizedPhone, status |
| Tenant | id, uniqueSlug, ownerSellerId unique (MVP 1 seller=1 toko), state, createdAt, readyAt, dataRegion |
| TenantMembership | tenantId, platformUserId, tenantRole, status, unique(tenantId,user) |
| TenantDatabase | tenantId unique, encryptedSecretRef, schemaVersion, lastMigrationAt, status; NO raw password |
| TenantProvisioningJob | tenantId, step, state, attempt, lease, idempotencyKey unique, errorCode, timestamps |
| TenantDomain | id, tenantId, canonicalHost unique, kind, verificationTokenHash, state, sslState, verifiedAt |
| Plan & PlanLimit | price version, recurringPeriod, entitlements, quota unit |
| Subscription | tenantId unique active subscription, planId, state, trialStartedAt, trialEndsAt, periodEnd |
| Invoice & BillingPayment | globally unique invoiceNumber, providerEventId unique, amount, currency, status |
| CarrierAccountRef | tenantId scoped, environment, managed/BYOK mode, encrypted secret reference, enabled |
| OutboxEvent & AuditEvent | eventId unique, tenantId nullable, eventType, payloadVersion, state, correlationId |
| IdempotencyRecord | scope, actorId, key, requestHash, resultRef, expiration, unique(scope, actorId, key) |

Tenant DB retains existing commerce schema and versioned legacy data migration; configure per-tenant `StoreAppearance` revision-history/asset provenance. Do not blindly add tenantId to every legacy table if each DB is a hard tenant boundary, but every externally shared event/backup/storage/API record must carry tenantId where needed.

## 2. Proposed API surface (names provisional)

**Marketing/control plane**
- `POST /api/platform/auth/seller/register` creates pending registration (no tenant); OTP dispatch through approved email adapter.
- `POST /api/platform/auth/seller/verify-otp` finalizes seller identity + idempotent provisioning job; no synchronous CREATE DATABASE.
- `GET /api/platform/onboarding/status` returns state, next action, no DB secrets; platform session only.
- `GET /api/platform/me/tenants` list allowed memberships (MVP exactly 1).
- `GET /api/platform/owner/billing`, `POST /api/platform/owner/billing/checkout` & verified `/webhooks/billing`.
- `POST /api/platform/owner/domains` create domain verification challenge; `GET /api/platform/owner/domains` states.
- `GET /api/platform/superadmin/tenants`, `POST .../provisioning/{jobId}/retry` step-up + audit only.

**Tenant**
- `GET /api/tenant/context` expose public tenant identity + readiness (without secrets).
- Existing `/api/v1/admin/**`, `/api/v1/**`, `/admin/**` must be reviewed and adapted to resolved tenant route, not copied and mounted twice.
- `GET /api/tenant/hosting` and `POST /api/tenant/hosting/change-plan` validate owner on server and forward to control plane business service.
- `GET/POST /api/tenant/domains/**` authenticated seller owner only.
- `GET/POST /api/tenant/shipping/jnt/**` tenant owner or approved staff, with service availability and official credential contract.

Routes are **design proposals**; check Next.js filesystem route collisions, CSRF/cookie policies, and existing versioning before implementation. API handlers require Zod validation, response contracts, server-side RBAC, rate limits, tenant scope, immutable audit, and business invariants.

## 3. Security checklist

- Sessions platform/tenant/customer: distinct cookie prefixes/Domain/SameSite/Secure, CSRF protection, token issuer/audience and tenant binding; rotate and revoke on role change. 2FA/MFA for Super Admin high-risk operations.
- Auth credential storage salted KDF approved, OTP HMAC hashed and 6 digit+expiry+rate limit, generic anti-enumeration messages, retry throttles, email sender SPF/DKIM/DMARC validation.
- Strict input validation for slug, domain, address, money amounts in integer IDR, product weights, request idempotency key, Unicode normalization; reject overlong/malformed inputs and mass-assignment of roles/entitlements.
- Tenant record selection always from resolved host+membership; never trust client `tenantId`. SSR, server actions, API, cron, webhooks and storage operations follow same scope enforcement.
- Headers: strict trusted forwarding and host allowlist, Content Security Policy, HSTS after valid TLS, no PII in cache/CDN; all host-specific caches include tenant id and version.
- SQL and migrations only via safe Prisma parameters and approved deploy pipelines; strong separation of runtime/control/provisioner DB privileges.
- Secrets in approved manager, no JWT/password/API tokens in repo/CI artifacts; encrypted backup, restore tests, rotation and break-glass audit.
- PCI/PSP: hosted checkout/token; verify signed webhooks, amount/currency, invoice/tenant ownership, repeated event semantics.
- Privacy: Indonesian data protection obligations, customer/seller consent, retention, delete/export, access logging. Legal copy requires owner/legal review.
- Anti-abuse: signup throttles, rate limits per IP/account/tenant and request quotas; safe observability without accidental high-cardinality PII tags.

## 4. Test plan (isolation is release-blocking)

| Suite | Examples |
| --- | --- |
| Unit | slug normalization, domain parser, OTP, subscription state, quote signature, entitlement limits |
| Integration PostgreSQL | 2+ disposable tenant DBs, independent session/customer/product/orders, unique constraints, provisioning retry |
| Authorization negative | Host spoof, cross-tenant IDOR, owner/staff/customer route matrix, trial/expired access |
| Concurrency | Two signup same email/slug, concurrent cart/inventory checkout, duplicated billing webhook/AWB, migrations interrupted |
| Migration | fresh DB, old legacy compatibility, expand/contract, rollback to prior app image/version, tenant DB version drift |
| Browser | signup OTP, first-run dashboard, hosting plan, custom domain verification UI, product/PDP/cart/checkout, admin mobile |
| Contract | J&T transport stub/official sandbox approved, billing webhooks sandbox, DNS service mock, no real credentials |
| Security | input fuzz, SSRF URL rejection, secret leak scan, cache isolation, response header isolation |
| Operability | cold-start, limits, backup/restore, pool exhaustion recovery, domain TLS failure, worker queue backlog |

Minimum browser viewport matrix: 360, 390, 428, 768, 1024, 1440; verify keyboard flows and screen reader semantics for critical forms. Repeat navigation/mobile regression to detect hydration/race failures. Screenshot baseline/post-change and trace on failures; **do not rewrite tests solely to make them green**.

## 5. CI gates and evidence

Required before merge: lint, typecheck, production build, unit+containment, isolated PG integration (control + 2 tenants), Chromium flows, security/tenant isolation regression, tests for legacy demo, dry-run migration, secret scan. CI service identity must not have production DB access, real J&T API credentials, domain registrar production access, or email blasting capability.

Evidence per PR: base/head SHA, exact test commands, counts, Green CI URLs, screenshots, coverage of acceptance IDs, schema version, migration & rollback plan, manual review findings, open blockers. For real hosted tenant provisioning: staging-only smoke with permission; production trial rollout via explicit owner gate.

## 6. Observability, retention and incident

Metrics: provisioning success/age/retry, tenant DB pool utilization, tenant schema drift, trial expiration, billing unpaid, DNS/TLS failures, J&T API rate/latency/unknown AWB backlog, image/media usage, checkout error rates. Logs include correlationId + tenantId (non-PII), sanitized user intent; separate security audit log with retention. Alerts to platform team based on thresholds tuned from baseline (no fabricated SLO).

Incidents: kill switch global/per tenant (disable checkout/J&T), quarantine duplicate payment, tenant routing fails closed, manual reconciliation for AWB UNKNOWN, restore per-tenant backup to safe environment, postmortem. Report status `LIVE_VERIFIED` only after hosted smoke, not after CI/build alone.
