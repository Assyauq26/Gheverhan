# JNT-SH-01 — local seller J&T configuration

Status: implementation for review, **not deployed**, not shipping activation. Initial implementation based on main `cc88229e`, then synchronized after M1-01 PR #138 merged (`913d5454`). Independent branch `feat/jetseller-selfhost-jnt-seller-config`; no Gheverhan production release. Requirements: FR-06/08/09, NFR-01/03/09, A23/A24/A26 and existing J&T regression gates.

## Audit and reuse

The store already has four official transports, strict host/path/environment validation, AES-GCM configuration, secret-preserving updates under a PostgreSQL advisory lock and transactionally coupled audit. Reuse `official-config.ts`, `official-transport.ts`, `verified-mapping.ts` and the existing store database's `JntPlatformIntegration` table. Its historical name is retained to avoid migration/compatibility risk; one row per environment belongs to this independent store, not a shared tenant database.

Legacy SaaS coupling: settings API/page/nav require `isJntPlatformOwner`, Super Admin and `JNT_PLATFORM_OWNER_USER_IDS`; warehouse and service eligibility are host env settings in `jnt-provider.ts` / fulfillment. Checkout already binds signed quotes to user/cart/address/weight, repeats eligibility checks inside the order transaction, and fails closed on absent tariff/mapping/weights. Fulfillment reserves a durable external identity before network dispatch and preserves UNKNOWN after ambiguity. Cancellation does not perform a customer refund. Existing tracking webhook acknowledgement is not authenticated carrier fulfillment.

## Opt-in and compatibility

No existing production flags or Compose config changed. Absent `JNT_CONFIG_SCOPE` (or explicit `legacy_platform`) preserves old owner allowlist, v1 ciphertext and host-config shipping. A new isolated installation opts into `JNT_CONFIG_SCOPE=local_store`. Unknown scopes deny management. Local settings require a currently authenticated local **Admin or Super Admin**, plus `shipping.update`; customer, Manager, anonymous and client-supplied foreign installation IDs cannot authorize access. No center account/DB/API is involved.

Local server must provision a **fresh installation-unique 32-byte random** `JNT_INTEGRATION_ENCRYPTION_KEY` (padded Base64). J&T v2 AAD now binds to the **canonical `JETSELLER_INSTALLATION_ID` UUIDv4** from M1; an optional legacy `JNT_INSTALLATION_ID`, if present, must match exactly. A missing or malformed canonical ID denies local J&T access. Generate/retain these locally through private operator tooling, not chat/browser/telemetry. Configuration does not prove global key uniqueness; operator provisioning must generate independent randomness rather than reuse an example/key. Full M1 profile/environment verification is still an **installer release gate**. The staged J&T local settings require the canonical installation UUID and reject a conflicting explicit `JETSELLER_STORE_PROFILE`, but until the isolated HTTPS/PostgreSQL browser fixture is upgraded, J&T-SH-01 does not claim complete `parseSelfHostedConfig` validation. Do not use `JNT_CONFIG_SCOPE=local_store` on a legacy production host. New installer must set `JETSELLER_STORE_PROFILE=self-hosted` and validate its full profile before any seller can enter settings.

Local writes use v2 AES-256-GCM with fresh nonce and authenticated installation/environment binding. Moving ciphertext between instances or sandbox/production fails authentication. Legacy v1 remains readable only in legacy mode; switching an existing live store to local mode is **not** an automatic migration. A separately approved local adoption/re-encryption procedure is required. Never enable the flag on Gheverhan as part of this PR.

## Delivered behavior

- Sandbox and Production have separate saved settings and four allowlisted endpoint URLs.
- Warehouse identity/address/origin and declared EZ agreement reference/expiry are encrypted with credentials in the existing column. No new Prisma schema/migration or tenant_id.
- GET returns configured booleans, endpoint URLs and local warehouse/service metadata, never credential values. New credentials necessarily pass transiently from the seller's write-only form to their own HTTPS API; **stored server credentials are never downloaded/prepopulated**. No localStorage/sessionStorage/analytics/logging. Successful save/environment switch clears credential inputs. Never put keys in screenshots.
- Blank secrets preserve current values; submitting replacements rotates carrier credentials atomically with the audit event. Audit records field names changed, environment/scope and actor, never secret/address/payload values. Rotating the encryption key itself is a separate private re-encryption/backup operation, not a browser action; replacing it without migration makes existing data unreadable.
- Connection results are explicit and session-scoped; saved/enabled is not CONNECTED or provider UAT. A Check Fee response with zero EZ rates, wrong service or malformed cost must never display CONNECTED. Probe outcomes are audited. Check Fee is read-only and requires enabled saved credentials, warehouse, non-expired declared EZ agreement, approved local district mapping, valid weight and separate server approval for Production calls. Five tests/minute/admin enforced by existing PostgreSQL rate-limit bucket.
- Create Order and Cancellation are never called from test buttons. Tracking probe also remains unavailable until a safe owned-AWB test fixture/contract is approved. These buttons return **SAFE_PROBE_UNAVAILABLE**, not false success. No invented health endpoint or dummy live order.
- Local `activeJntConfig` intentionally fails closed pending JNT-SH-02; saving/enabling/testing cannot open checkout, create/cancel AWB, or pass readiness. Legacy shipping gates are unchanged.

## Official contract verification and limits

Checked [official J&T documentation](https://developer.jet.co.id/documentation) on 2026-11-02. It describes Order/Cancel form signatures, Tracking Basic Auth with AWB context, and Check Fee's signed form/JSON response. Only EZ is supported by the public Order contract. Actual endpoint URLs and account values are supplied in the seller's authenticated provider dashboard, so the existing allowlist is retained, **not newly certified for every seller**. No public side-effect-free Order/Cancel authentication probe is documented. Seller agreements, approved mapping, endpoint/account assignments and endpoint-specific Production UAT still need J&T confirmation. No example tariff, demo key or sample AWB is copied into configuration.

Nonstandard contracted endpoints remain blocked rather than being accepted as arbitrary URLs. Additional services require provider evidence and reviewed transport changes. An administrator-entered agreement reference is a declaration, not proof independently checked by this form. No official account/secret or live carrier request is needed for automated tests.

## Verification

- Unit: local role/permission versus legacy allowlist, key/environment binding, redaction, blank preservation/rotation, missing identity/key, fail-closed activation and safe probe authorization/ID injection/Production gate. Existing mock transport signatures remain covered.
- Disposable PostgreSQL: existing migration/preservation/audit rollback/concurrency/UNKNOWN/refund suite plus local v2 concurrent credential rotation and legacy row preservation. Runs on guarded loopback test database, not Production.
- Browser/API: existing eight viewports 320/360/375/390/430/768/1024/1440, legacy owner and local Admin profiles, unauthorized Manager/anonymous, cross-origin, secret clearing, local warehouse form, unavailable-order probe, foreign ID rejection, encrypted row and response redaction. Screenshots/results are uploaded by isolated regression workflow for both profiles. Carrier traffic is not invoked by browser tests.
- Explicit lint/typecheck/build and exact-HEAD CI are required; historical results are not proof for this branch. Local Node22 is used. Docker is unavailable in the current Windows shell, so disposable PG and real browser/API/database evidence is obtained from isolated Linux CI; do not label it locally passed.

No autodeploy/visibility/Production settings changes, real orders or production-key tests. A merge affecting frontend remains held for the reviewed production-deploy isolation boundary; this PR is for review only.

## JNT-SH-02 plan

| Flow | Existing reusable boundary | Required next changes/tests |
|---|---|---|
| Checkout → address | Canonical region hierarchy + verified district release | Read local warehouse; reject unresolved/cross-version mappings and unmeasured products |
| Check Fee → signed quote | Official transport + user/cart/address/weight-bound expiring HMAC | Bind local config revision/environment/service; reject stale, replayed or changed config/weight quotes |
| Order → payment | Transactional checkout rechecks + local payment ledger | No new payment or shared tenancy model; prove no mutation on invalid tariff/readiness |
| Packed paid order → Create | Unique request/external ID, order lock and dispatch state | Local sender snapshot and endpoint-specific UAT gates before reservation; concurrency and timeout reconciliation |
| AWB → handover/tracking | Persisted AWB, explicit handover/delivery attestation | Only owned local order IDs; sanitized tracking, no raw PII; do not treat AWB creation as physical pickup |
| Timeout / uncertain response | Durable UNKNOWN without automatic Create retry | Operator reconciles stable external ID with carrier before manual retry authorization; test restart and refund races |
| Cancel AWB | Carrier cancellation ledger and financial workflow separation | Cancel is not refund/order financial cancellation; lock races and uncertain cancel require reconciliation |
| Credentials rotation | Transactional encrypted local config | Snapshot/version compatibility and revoke stale signed quote; no secret in audit or center |

JNT-SH-02 must remove the local activation block only after all readiness checks are implemented and negative tested. Safe sandbox/mock contract tests precede provider-authorized UAT. Real Production carrier orders never belong in CI/smoke. Authenticated webhook signature/replay processing requires a separately verified provider contract; the current acknowledgement is insufficient.
