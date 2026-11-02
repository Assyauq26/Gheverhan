# J&T Express Self-Hosted — Seller-owned integration (increment 01)

**Status:** staged implementation in a separate PR. No live J&T API requests or production configuration changes.

## Purpose

The existing Gheverhan integration already implements official endpoint validation, encrypted credentials, redacted status, audited updates, rate checks, request intents and fulfillment. Its settings permission previously required a **central platform-owner user ID**; that is incompatible with seller-owned self-hosted installations.

This increment reuses the existing implementation and changes only the owner boundary:

- **Legacy/default Gheverhan:** still requires a `Super Admin` account ID in `JNT_PLATFORM_OWNER_USER_IDS`.
- **Explicit JetSeller Self-Hosted:** requires `JETSELLER_STORE_PROFILE=self-hosted`, a valid standalone installation configuration and a **local `Super Admin` from that store's own database**. The central platform allowlist has no authority over the seller store.
- Any missing/invalid profile or less privileged user fails closed.
- Seller admin page explains that credentials are stored inside the seller's own DB; existing legacy page retains the SaaS owner explanation.
- This change does **not** create tenant IDs, access a central JetSeller database, change encryption algorithm, or enable carrier calls.

## Secret and release controls

- `JNT_INTEGRATION_ENCRYPTION_KEY` must be a newly generated independent 32-byte key on **each seller VPS**. The current AES-256-GCM column remains local to its database. Never send a seller's key to the control plane.
- Do not configure production credentials in a shared test environment.
- Keeping `JNT_PRODUCTION_API_APPROVED=no`, `JNT_ENABLE_ORDER_CREATE=no`, `JNT_PRODUCTION_ORDER_APPROVED=no` and `SHIPPING_PROVIDER=manual` prevents automatic production shipping while provider UAT, weights, warehouse mapping and services remain incomplete.
- Existing official endpoint allowlists are not loosened, and no automatic retry of uncertain Create Order is introduced.

## Tests & next increments

The J&T unit suite verifies both authorization modes, a malformed self-hosted profile being refused, encryption redaction, endpoint allowlists, and production API flags. Exact-head PR CI must include full unit, Docker build and isolated PostgreSQL/browser tests.

**Deferred JNT-SH-02**: warehouse and service configuration stored per seller; safe non-order-changing connection diagnostics; certified local J&T mapping/version and seller-specific origin; checkout/quote/dispatch/track/cancel UAT; migration & rescue compatibility; real carrier Sandbox and approved production proofs. Implement via follow-up isolated PRs with no shared credential broker.

Reference: `docs/jnt-official/IMPLEMENTATION.md` and `docs/self-hosted/ARCHITECTURE_GATE_DECISION.md`.

## Rollback

Revert these authorization/page changes only, without deleting or rewriting the seller-local `JntPlatformIntegration` table or encrypted settings. No DB migration in this PR. Production Gheverhan behavior defaults are unchanged.
