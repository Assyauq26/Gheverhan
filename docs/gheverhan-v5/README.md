# Gheverhan V5 — cards, structured Indonesia addresses and J&T checkout

Base: main `3115a3646fd56f09abcfb91b529de0b40e2107db` (PR #116). Review-only change; no Production mutation or deployment is authorized for V5.

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

There are deliberately no example Production amounts, defaults or wildcard routes. Expired/unsupported routes return no services. Overlapping service rules fail closed. Record approval/reference and configuration change in the deployment audit. Use operator-managed environment/secret injection; never commit actual account credentials. The current deploy Compose must explicitly receive these optional values before enabling a manual tariff in a future approved release.

For a future official integration, `JNT_OFFICIAL_AREA_MAPPING` is an array of `{indonesiaCode,areaCode,reference,confirmedAt}` from confirmed J&T data; `JNT_ORIGIN_WAREHOUSE` names the approved origin. No credentials/specification are fabricated. `/admin/shipping/coverage` (SHIPPING_READ permission) shows readiness and recent coded destination areas lacking official mapping. Historical courier records remain untouched.

## Quote and order guarantees

Five-minute HMAC quotes bind user, canonical destination, cart lines/prices, actual weight/package dimensions and rate configuration. They expire sooner if the tariff expires. Preview and create-order re-query the provider; hidden `shippingCost` never controls totals. Quotes are checked again under existing cart/product/variant locks before any stock/order/payment mutation. Changed route, user, cart, package metadata, tariff/configuration, cost, expired/tampered tokens, and non-J&T courier selections fail closed.

Address changes discard shipping selection and quote immediately. AbortController plus request keys suppress late responses. Explicit service selection and a valid current quote are required. The CTA also checks recipient/phone/street/location/bank and pending submission. Existing order idempotency, voucher locking, payment flow and stock lifecycle are retained. Quote failure/expiry offers refresh and requires re-selection.

## Additive database migration and rollback

`20261030090000_checkout_indonesia_regions_jnt` adds nullable region code/name/source-version fields to CustomerAddress and OrderAddress, and nullable accepted shipping snapshot fields to Order. Old address strings, order snapshots and historical shipments are not rewritten or assigned invented codes. Legacy saved addresses remain visible, with their detail input preserved while the customer completes structured location on a later checkout. New order snapshots use canonical server names and codes.

Use official Prisma deploy after verified backup, isolated fresh/upgrade/lock tests and release preflight. Lock/statement timeouts bound migration locking. Do not perform a down migration or delete old addresses. To roll back, restore the previous compatible app image and keep additive columns/data; keep snapshots, backups and all media/volumes. Rolling back shipping restrictions also changes checkout policy and needs explicit business approval. No migration has been applied to Production for V5.

## Validation evidence

Local Node 22 typecheck and lint passed; production build compiled successfully (local build has no configured DATABASE_URL and prints missing-database diagnostics). Unit suite: 553 pass, 3 pre-existing Windows permission/symlink failures, including all new region/J&T tests passing. CI Linux is required for complete green validation.

The regression suite adds full v2 fallback/hierarchy checks, tariff absence and approved service checks, token tamper/expiry tests, real PostgreSQL quote/order invariants, and Chromium modal search/cascade/cancel/focus/failure/8-viewport checks. Existing checkout fixtures now request actual server quotes for a guarded disposable route instead of relying on retired illustrative defaults. Existing stock, coupon, refund, payment, race and idempotency assertions are retained.

Eight widths: 320, 360, 375, 390, 430, 768, 1024, 1440. Featured measurements assert ≤1 CSS px width/height/price-position differences and left alignment. Existing published-theme tests remain enabled. Browser screenshots/results are uploaded with the existing isolated CI artifact. Android coverage is Chromium mobile/touch emulation, not a physical-device claim.

Before evidence uses PR #116's measured browser captures; after evidence and exact-head CI results are recorded in the PR once complete. Four screenshot references described in the supplied brief were not present as image files in the attachment directory; the existing application/theme is the visual authority.
