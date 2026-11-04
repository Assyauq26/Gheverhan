# Issue 175 — seller dashboard identity and integration navigation

Date: 2026-11-05. Base: `0ce1f130b65cd8cbf2f1f3832cfda935632ff502`. Scope is the independently installed seller app, not the BTOS operator portal or Gheverhan carrier activation (#174).

## Identity boundary

Admin layout previously used PlatformWordmark while its storefront link used the published StoreWordmark. The dashboard now reads only the current database's saved draft identity via an authenticated, request-local `getDashboardIdentity`. It returns identity and version counters, not the complete draft. Sidebar, mobile header, store menu and generated dashboard titles use that identity. No persistent/shared draft cache, tenant selector or browser-storage identity is introduced. The central PlatformWordmark remains a separate component and is no longer used by the store dashboard.

Public StoreWordmark remains published-only. Unauthenticated login (including redirectTo=/admin) uses published branding/title; exposing draft branding before login would violate the private-draft boundary. Auth pages render dynamically so image-build branding cannot be frozen into a new installation. Published data cache keys are installation-scoped, including when test processes share a build directory. Existing legacy fallback remains the store's own identity; fresh self-hosted fallback uses JETSELLER_STORE_DISPLAY_NAME / neutral defaults only before an appearance is saved.

Saved draft logos have an admin-only current-identity endpoint. Ordinary local staff can view their saved dashboard logo without obtaining appearance-edit privileges, arbitrary staging assets or another installation's media. Public logo access remains controlled by published references. All private responses use no-store and Vary: Cookie.

After successful save/publish/discard/reset/rollback, the editor sends a same-origin invalidation signal; the dashboard re-reads its authenticated identity and refreshes the server render/metadata. Other tabs reconcile on BroadcastChannel, focus/visibility and a bounded 30-second visible-tab interval. Signals contain no identity, credential or configuration values. In-flight reads are serialized and aborted on unmount. No localStorage or global process identity cache.

Rollback retains the existing independent-draft semantics: it restores published configuration while preserving the current draft. Discard copies the current published configuration into draft. Self-hosted revision zero now records that store's actual baseline, and reset uses its provisioning identity, avoiding accidental restoration of a legacy/platform brand. Legacy appearance lifecycle semantics remain unchanged.

## Integrations and truthful J&T status

Authorized navigation is Integrasi → J&T Express. Desktop exposes an explicit parent/submenu and overview; mobile uses Lainnya → Integrasi → J&T Express with four pinned controls plus Lainnya. Only the existing J&T provider is advertised. Existing backend authorization, ciphertext schema, canonical self-hosted UUID/profile and JNT_CONFIG_SCOPE gates remain intact; no settings/migrations are applied to Gheverhan.

The existing write-only form is reused: environments, four endpoint configurations, sender warehouse, declared EZ agreement and credential rotation/preservation. Cancellation explicitly reuses Order credentials; no fake cancellation secret is added. The safe connection action is labelled Uji Check Fee. Successful proof includes environment, local scope, configuration revision timestamp and test timestamp; the UI rejects evidence for a different saved revision, clears proof on save/environment changes, and clears a stale success on network error. A valid Check Fee response does not authorize checkout/order or certify other endpoints. Unsupported probes show "Tidak tersedia uji aman untuk endpoint ini". No Create/Cancel operation is used for testing. No credential value/warehouse PII is added to audit metadata or connection responses.

## Tests and evidence

- Unit: private draft/auth boundary, fallback/legacy, read-only identity DTO, private current-logo authorization, desktop/mobile grouping, canonical J&T auth and scoped test evidence.
- PostgreSQL: existing full appearance lifecycle/concurrency/media suite plus self-hosted baseline/reset/publish/rollback/discard.
- Browser: two separate canonical self-hosted databases, domains, JWT keys and TLS loopback proxies; real editor Save Draft/server action, tab synchronization, metadata, public storefront/login publication, private/public logos, foreign-token/asset rejection, reset/discard/rollback and provider navigation. Viewports 320/360/390/430/768/1440, no horizontal overflow. Existing legacy/self-hosted J&T redaction and RBAC browser suites also remain required.
- The synthetic HTTPS fixture permits only loopback CONNECT for its assigned `.example` hostname and uses test-only certificate acceptance; runtime TLS verification is unchanged. It is not a real seller deployment.
- Exact-HEAD CI and screenshot artifacts must be linked in the PR. No passing runtime, signing, deployment or live status is inferred from adding tests. Local Windows has no Docker; actual disposable PostgreSQL/browser runs are required in Linux CI. Local production build may log optional static-data DB-unavailable warnings when the fixture DB is absent.

## Release accounting

Report IMPLEMENTED, CI_PASS, RELEASE_SIGNED, SELLER_STORE_DEPLOYED and LIVE_VERIFIED separately. The existing official workflow is main-only, exact-source checked, keyless Cosign/OIDC and protected by the btos-release-publisher reviewer environment. A previous successful publication exists; use verified previous monotonic state, never genesis/reset counters or fixture signing material. This feature PR does not alter that mechanism.

After review/CI, official source must actually be on the approved main SHA and satisfy the publisher's complete check list. Publishing signs/stages artifacts; it does not itself prove a seller store updated. A specific seller installation, compatibility/backup/update consent, verified signed artifact/receipt and post-update browser/API smoke are required before SELLER_STORE_DEPLOYED/LIVE_VERIFIED. Gheverhan legacy and the control portal are not substitute deployment targets. No production secrets, host settings, DNS, database migration or carrier orders are part of implementation/testing.
