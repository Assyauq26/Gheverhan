# Gheverhan V5 — cards, structured Indonesia addresses and J&T checkout

Base: main `3115a3646fd56f09abcfb91b529de0b40e2107db` (PR #116). Production release requires explicit owner approval, validated recovery, compatible migrations and all safety gates.

## Findings and behavior

- Home previously selected `min-width: 12rem` for discounted cards and `9.25rem` for other cards. All featured tracks now use the existing 12rem minimum and the same desktop width formula. Flex stretch, a single-line name, and a bounded natural price row synchronize heights. Horizontal scroll and snap remain intact. Grid breakpoints, images, wishlist and cart targets are unchanged.
- Discounted price groups used `justify-content:flex-end`. Both ordinary and featured groups now start at the same left edge as the title/rating. The rendered-width fitter from #116 remains intact and keeps the largest fitting type. At normal font caps spare space stays to the right of the group; this is intentional left alignment.
- Checkout previously obtained illustrative JNE/J&T/SiCepat rates for an empty city and a fixed 1000g. New quotes use validated province/city/district/village codes, postcode, actual database product weight × quantity, and package metadata. No dummy default rate remains.

## Region source and offline behavior

Primary provider: [emsifa Indonesia v2](https://www.emsifa.com/api-wilayah-indonesia/), [source repository](https://github.com/emsifa/api-wilayah-indonesia). V2 uses dotted administrative IDs and `{data,meta}` envelopes. V1 IDs are rejected. The adapter validates level, parent prefixes, unique IDs, schema and postcode. The UI only requests the current parent's children, never all villages.

The bundled normalized gzip snapshot contains 38 provinces, 514 cities/regencies, 7,285 districts and 83,762 villages; source `updated_at` **2026-10-25**, retrieved **2026-10-30**. See [manifest](../../frontend/src/modules/regions/data/manifest.json) for SHA-256 and source attribution (MIT). Names, IDs and postcodes are factual source data; no carrier area mappings are inferred from them.

Provider requests time out after 2.5s and retry once. Server cache: 24h success, 5min fallback, bounded 512 keys, coalesced in-flight requests. A complete bundled snapshot survives outages and restarts. Browser cache: 5min, 128 keys; search filters only the active level. `REGION_DATA_MODE=snapshot` explicitly selects offline snapshot operation. Failures have loading, empty and retry states. Missing provider postcodes require user input; known village postcodes must match server data.

Refresh explicitly with `node scripts/regions/snapshot.mjs` from `frontend`. This downloads v2 data with 12 bounded workers and writes the snapshot/manifest. Review hierarchy counts, source date, checksum and source changes, run tests, then release through a separate reviewed commit. It never runs on application startup/build. Audit at least monthly; this dataset is not claimed to be real-time. Temporary downloads are outside source under `.release-evidence`; no credentials are used.

## J&T readiness and configuration

The user confirmed official credentials/specification, mappings and approved manual tariffs are **not yet available**. Accordingly V5 does not call an unofficial endpoint or invent service availability. New checkout is blocked without a valid tariff. The official [J&T developer portal](https://developer.jet.co.id/) requires a cooperation agreement, official mapping and test API/UAT before Production activation.

`JntProvider` is an integration boundary with an injectable official transport, 5s timeout, origin warehouse, destination mapping, weight/packages and normalized service response. No transport is installed in the registry until the account-specific specification and UAT are approved. `EZ/HBO/JND/ECO` are supported codes, not assumed available services. Mapping entries must come from official confirmation; administrative codes are never used as guessed carrier area codes.

If the business approves manual operation, an operator can configure `SHIPPING_PROVIDER=manual` and **admin-approved** `JNT_MANUAL_RATE_CONFIG` JSON:

- `origin`: `warehouseId`, `street`, `provinceCode`, `cityCode`, `districtCode`, `villageCode`, `postalCode` (a valid v2 hierarchy).
- `rates`: entries with exact `destinationVillageCode`, inclusive positive `minWeightGram`/`maxWeightGram`, `service`, integer Rupiah `cost`, optional `etd`, `reference`, `approvedBy`, ISO `validUntil`.

There are deliberately no example Production amounts, defaults or wildcard routes. Expired/unsupported routes return no services. Overlapping service rules fail closed. Record approval/reference and configuration change in the deployment audit. Use operator-managed environment/secret injection; never commit actual account credentials. The proposed Compose passes these optional values to the app with empty defaults; no server configuration is modified by this PR.

For a future official integration, `JNT_OFFICIAL_AREA_MAPPING` is an array of `{indonesiaCode,areaCode,reference,confirmedAt}` from confirmed J&T data; `JNT_ORIGIN_WAREHOUSE` names the approved origin. No credentials/specification are fabricated. `/admin/shipping/coverage` (SHIPPING_READ permission) shows readiness and recent coded destination areas lacking official mapping. Historical courier records remain untouched.

## Quote and order guarantees

Five-minute HMAC quotes bind user, canonical destination, cart lines/prices, actual weight/package dimensions and rate configuration. They expire sooner if the tariff expires. Preview and create-order re-query the provider; hidden `shippingCost` never controls totals. Quotes are checked again under existing cart/product/variant locks before any stock/order/payment mutation. Changed route, user, cart, package metadata, tariff/configuration, cost, expired/tampered tokens, and non-J&T courier selections fail closed.

Address changes discard shipping selection and quote immediately. AbortController plus request keys suppress late responses. Explicit service selection and a valid current quote are required. The CTA also checks recipient/phone/street/location/bank and pending submission. Existing order idempotency, voucher locking, payment flow and stock lifecycle are retained. Quote failure/expiry offers refresh and requires re-selection.

## Additive database migration and rollback

`20261030090000_checkout_indonesia_regions_jnt` adds nullable region code/name/source-version fields to CustomerAddress and OrderAddress, and nullable accepted shipping snapshot fields to Order. Old address strings, order snapshots and historical shipments are not rewritten or assigned invented codes. Legacy saved addresses remain visible, with their detail input preserved while the customer completes structured location on a later checkout. New order snapshots use canonical server names and codes. A successful order also saves the confirmed structured address as the customer's default, keeping old addresses intact; a dedicated address advisory lock serializes cart/Buy Now default selection, and the entire write rolls back with a failed order.

Use official Prisma deploy after verified backup, isolated fresh/upgrade/lock tests and release preflight. Lock/statement timeouts bound migration locking. Do not perform a down migration or delete old addresses. To roll back, restore the previous compatible app image and keep additive columns/data; keep snapshots, backups and all media/volumes. Rolling back shipping restrictions also changes checkout policy and needs explicit business approval. Implementation did not apply a Production migration; record subsequent approved release operations separately.

## Validation evidence

Local Node 22 typecheck, lint and production build passed with isolated PostgreSQL 17.11. The full initial Windows unit run had 553 passes and 3 pre-existing POSIX-permission/symlink failures; all current targeted region/J&T/fitter tests pass (12/12). Linux CI runs the complete suite without disabling those checks.

The regression suite adds full v2 fallback/hierarchy checks, tariff absence and approved service checks, token tamper/expiry tests, real PostgreSQL quote/order invariants, and Chromium modal search/cascade/cancel/focus/failure/8-viewport checks. Existing checkout fixtures now request actual server quotes for a guarded disposable route instead of relying on retired illustrative defaults. Existing stock, coupon, refund, payment, race and idempotency assertions are retained.

Eight widths: 320, 360, 375, 390, 430, 768, 1024, 1440. Featured measurements assert ≤1 CSS px width/height/price-position differences and left alignment. Existing published-theme tests remain enabled. Browser screenshots/results are uploaded with the existing isolated CI artifact. Android coverage is Chromium mobile/touch emulation, not a physical-device claim.

See [before/after screenshots, viewport measurements and narrow-card limits](EVIDENCE.md). The baseline was captured from the actual #116 source in an isolated checkout. After captures use the V5 branch; final exact-head CI links are recorded in the PR. Four screenshot references described in the supplied brief were not present as image files in the attachment directory; the existing application/theme is the visual authority.

## Changed surfaces and review map

| Area | Files |
|---|---|
| Featured cards and left alignment | `app/(storefront)/page.tsx`, `components/storefront/product-card.tsx`, `purchase-controls.css` |
| Address selection | `components/storefront/region-selector-dialog.tsx`, `modules/regions/*`, `app/api/v1/regions/route.ts`, `scripts/regions/snapshot.mjs` |
| Checkout and signed quotes | `app/checkout/page.tsx`, `components/storefront/checkout-client.tsx`, `modules/checkout/checkout.service.ts`, `checkout.actions.ts`, `shipping-quote.ts`, preview/order API routes |
| J&T adapter/configuration | `infrastructure/shipping/contracts/*`, `manual/*`, `jnt/*`, `infrastructure/shipping/index.ts` |
| Additive persistence | `prisma/schema.prisma`, `20261030090000_checkout_indonesia_regions_jnt/migration.sql` |
| Operator readiness | `/admin/shipping/coverage`, shipping page link, optional empty Compose/env fields |
| Regression evidence | Region/J&T unit tests, new PostgreSQL migration/order tests, existing checkout/payment/legacy-migration fixtures, V5/V4/Flash browser measurements, existing isolated workflow |

The fitted-price algorithm is unchanged. A measured last-stock replay race was repaired by re-checking durable idempotency before returning an availability error; a deterministic delayed-read test protects this case. Existing concurrency, voucher, stock and payment assertions remain active.

## Cross-platform release artifacts

Create operational archives with `git -c core.autocrlf=false archive ...` and verify bytes against the committed blobs. Git's Windows archive conversion can otherwise change SQL line endings. Preflight accepts only original/LF/CRLF SHA-256 variants, matching [Prisma 5.22 migration-history compatibility](https://github.com/prisma/prisma-engines/blob/5.22.0/schema-engine/connectors/schema-connector/src/checksum.rs). It still rejects changed SQL, comments, whitespace, missing/extra terminal newlines, unknown/duplicate/unfinished migrations and altered schemas. It never rewrites the Production ledger. Unit and guarded disposable-PostgreSQL regressions verify both accepted cross-platform history and rejected SQL edits.

Order details for both customer and staff render the canonical village and district between the street detail and city/province. Legacy snapshots with null locality preserve their original display. The shipping coverage route is explicitly exempted from generated `coverage/` ignore rules. Browser regression follows the real readiness link, checks SHIPPING_READ denial, and verifies both structured and legacy address rendering.
