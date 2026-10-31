# JetSeller: phased control plane and isolated storefronts

Status: architecture and foundation implementation; NOT a Production migration.
Supersedes earlier claims that a Gheverhan store Super Admin is a SaaS owner.

## Decision and trade-offs

Use one control-plane PostgreSQL database plus one database per tenant. Central records contain platform accounts/sessions, sellers, tenant IDs, verified domains, subscriptions, provisioning jobs and encrypted global integrations. Tenant databases retain the existing shop schema and all customer, inventory, payment, media and shipment data. No shared tenant-id filter can accidentally expose another store's rows. The cost is more database migrations, connection budgets and backup coordination. A schema-per-tenant shortcut is rejected for this initial security boundary.

One seller initially owns one tenant (unique seller reference); suspended stores retain their identity. Storefront software and seller modules remain one centrally built release artifact. Do not fork Gheverhan business logic per tenant. Scale tenant runtimes in bounded shards; do not keep an unbounded PrismaClient per hostname in a 2 GB process. The control-plane connection has a separate small pool. Tenant pools must reserve active leases, cap concurrency, refuse overload and disconnect only idle clients. A suspended tenant must fail closed regardless of cache freshness. No arbitrary database URL may come from request input; resolve a server-held secret reference through the control-plane registry.

## Domains and identity

| Host | Authority | Session boundary |
|---|---|---|
| jetseller.web.id | JetSeller public pages, seller registration, /superadmin | platform issuer, host-only cookie |
| dashboard.jetseller.web.id | tenant-scoped seller modules | separate dashboard audience/cookie, central membership lookup |
| gheverhan.store | tenant_gheverhan_001 storefront and existing customer accounts | existing Gheverhan host-only customer cookie |
| <slug>.shops.jetseller.web.id (proposed) | verified registry entry only | per-store customer audience/cookie |

The storefront pattern is a proposal; wildcard DNS is NOT assumed configured. Unknown hosts, unverified domains, inactive tenants and identity mismatches reject before querying a store. Parse a canonical hostname and resolve an exact registry record; never use a suffix match, query parameter, arbitrary X-Tenant header or forwarded-host header as authority. Only a configured trusted ingress may establish the external host. Custom domains require a random DNS TXT ownership challenge, independent verification and TLS readiness; reserve platform/dashboard hosts so tenants cannot claim them. DNS resolution alone does not prove account ownership.

Platform owner role PLATFORM_OWNER belongs only to a separate PlatformAccount authenticated against the control-plane database. A store role named Super Admin, matching email address, owner allowlist or store JWT never confers platform access. Recheck active account and platform session version for privileged actions; require owner MFA/reauthentication before global secret changes. Central seller sessions require an exact tenant membership, server-selected scope, distinct issuer/audience and short lifetime. Cross-host navigation uses a single-use short-lived code exchange bound to audience and redirect allowlist, not a shared Domain cookie or JWT in a URL. Customer sessions remain isolated from platform/seller sessions.

Unsafe HTTP methods require exact Origin validation and CSRF protection; CORS is a narrow explicit allowlist and not authorization. Return private no-store responses; no tenant/private data in a shared CDN cache. Namespace cache keys, queues, media paths, signed URLs, rate limits and audit events by immutable tenant ID. Host/tenant selections cannot override authorization. Callback and return URLs are server allowlisted.

## J&T and PR #118 boundary

PR #118 remains an integration/security stabilization PR. Its store-host owner allowlist is a temporary legacy boundary, not the JetSeller platform implementation. Relocate configuration to jetseller.web.id/superadmin/integrations/jnt using the independent platform identity and central encrypted configuration. Seller-facing fulfillment stays under authorized tenant membership. Never copy global keys into tenant environment variables, databases or frontend bundles. The platform shipping broker must load credentials only after validating its authenticated caller, immutable tenant/order context, request purpose and operational flags.

Preserve the durable dispatch ledger in each tenant database; external order IDs must include a bounded immutable tenant namespace before any second tenant can dispatch. Current #118 IDs hash only the order ID and are suitable only for the existing single-store rollout. Bind quotes, callbacks and reconciliation to tenant + order + environment; audit centrally with a tenant reference and locally with the order. Never allow a broker timeout to create a new dispatch ID or automatic duplicate AWB. A broker outage fails closed; do not fall back to fabricated rates or direct tenant access to carrier credentials.

All Production API flags remain off pending new credentials, official UAT, approved mapping, measured weights and valid warehouse data. Relocation cannot be declared complete until old store configuration endpoints are disabled in a staged, tested cutover. LIVE_CONFIGURATION and LIVE_SHIPPING are independent outcomes.

## Migration and rollback sequence

1. M1: complete exact-head PR #118 CI and API/security review. Keep deployment gates; document compatibility, backup and operational blockers. No SaaS schema changes in #118.
2. M2: separate PR for control-plane schema and identity/host boundary. Validate migrations against disposable PostgreSQL, separately provision control-plane DB with independent credentials, encryption key and backups. Do not point PLATFORM_DATABASE_URL at the shop DB.
3. M3: separate PR for central dashboard adapter and authenticated code exchange; implement bounded tenant connection management and exhaustively test two synthetic tenant databases, ID collisions, suspended accounts/stores and cross-tenant requests.
4. M4: register immutable tenant_gheverhan_001, reconcile baseline table/media fingerprints and connect its existing DB through a verified secret reference. Keep old dashboard available until central dashboard parity and rollback tests pass. No bulk customer/order copy, renumbering, password reset or deletion. Cutover only after explicit release approval.
5. M5: onboarding saga: verified account -> owner/brand/warehouse -> approved plan/domain -> allocation -> migrations -> domain verification -> TLS -> decoration/product readiness -> activation. Durable unique idempotency key per seller; append step results and allow safe resume after a partial failure. Compensate only newly allocated disposable resources; never destroy an existing shop on retry. Paid hosting/domain actions require their own approval.
6. M6: verify domain control and approved DNS changes, then route staging first, check TLS/redirects/cookies/CSRF/tenant isolation, back up and deploy exact tested artifacts. Roll back ingress/app routing and broker flags without reverting additive DB changes. Preserve Gheverhan online throughout.

The current VPS has 2 vCPU/2 GB RAM; do not assume it can safely serve unlimited tenant pools, another full Next build and a second DB. Measure capacity, connection and backup budgets before allocating more tenants. Separate central DB/server may require infrastructure approval.

## Acceptance and current limits

Foundation code is intentionally not connected to the legacy app or autodeploy. Schema and pure policy tests do not prove end-to-end tenant isolation, working authentication, DNS ownership or LIVE status. Before enabling a second tenant require real two-database integration/browser tests, encrypted secret lookup, bounded leased client pools, domain challenges, independent sessions and broker context enforcement. Report each milestone and domain separately as IMPLEMENTED / TESTED / DEPLOYED / LIVE / BLOCKED with evidence; never infer LIVE from CI.
