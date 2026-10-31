# J&T Express Official API — PR #118 implementation and release gates

**Status:** PR draft, NOT merged. Shipping on current production stays fail-closed. Do not enable outbound order API or official checkout without provider UAT and approval.

## Features implemented
- Platform-owner-only /admin/integrations/jnt: four endpoint configs (Create Order, Tariff Check, Tracking, Cancellation) for Testing/Production. Encryption is AES-256-GCM with independent server key. Account secrets are redacted in GET/audit, and all endpoint URLs use strict official host/path allowlists.
- Official request transport: MD5(hex)+Base64 signed data_param/data_sign (Order/Cancel) and data/sign (Tariff); Tracking Basic Auth. Order/Cancel require both outer success and matching detail status. Tracking shows only statuses, timestamps and cities, not raw names, phones, or addresses.
- Official L3 data supplied by the platform owner: 7,128 records in frontend/resources/jnt-l3-official.csv. Imported as a versioned dataset; Emsifa v2 remains the address authority down to village/kelurahan.
- Deterministic crosswalk via scripts/jnt/reconcile-l3.mjs, matching source province + municipality type/name + district against bundled Emsifa. No fuzzy guesses. Ambiguous, duplicate and missing matches remain UNMATCHED/AMBIGUOUS and are never selectable for shipping. The active approved mapping version is stored in JntMappingRelease.
- Checkout JntProvider reads *only* the approved DB mapping and official requested rates; shipping HMAC and weight/route rechecks from PR #117 still apply. Because only EZ Create Order is documented publicly, live checkout returns no other services until official service-type agreements are verified.
- Backoffice official fulfillment for paid, packed, EZ orders: stable carrier order ID, transactional unique request row BEFORE network call, no automatic retry after ambiguous responses, AWB stored with shipment PENDING, explicit handover updates to SHIPPED, tracking and cancellation controls. Existing manual shipment mutation rejects official-mode orders.
- Safe operator flags default off; no real J&T calls in CI.

## Offline mapping procedure (from frontend/ with controlled disposable DB)
1. Preview report (no database mutation):
   node scripts/jnt/reconcile-l3.mjs --preview
   Inspect .jnt-mapping-report/report.json for matched, ambiguous and unmatched rows and version SHA-256. The official source CSV is committed and immutable for the PR.
2. After approval and verified DB target / backup, stage version:
   JNT_MAPPING_IMPORT_APPROVED=yes node scripts/jnt/reconcile-l3.mjs --stage
3. After manual review of exact matches, stage counts and differences, approve the exact version with an authorized reviewer:
   JNT_MAPPING_IMPORT_APPROVED=yes JNT_MAPPING_APPROVED_VERSION=<hash> JNT_MAPPING_REVIEWER=<server-authorized-user-id> node scripts/jnt/reconcile-l3.mjs --activate
   Activation authorizes only 1:1 exact district matches, never unmatched rows.
   The current script does not offer an override UI for unresolved districts; they are blocked until formally reviewed and a new source/crosswalk version is approved. A mismatch report is not equivalent to J&T sign-off.
4. PostgreSQL migration is additive. Do not run stage/activate from shared Vercel Preview. The isolated CI runs stage/activate only against disposable PostgreSQL 17.

## Server-only configuration (on Helipod)
Required for platform settings:
- JNT_PLATFORM_OWNER_USER_IDS: allowlisted owner user database IDs. Super Admin role is ALSO required. Seller-admin roles alone cannot edit.
- JNT_INTEGRATION_ENCRYPTION_KEY: 32 random bytes, padded Base64; back up outside VPS. Do not disclose through chat or Git.
- JNT_API_ENV: sandbox or production; independent from which environment an owner edits in the form.
- JNT_RATE_SERVICES: explicit allowed list; for full checkout only EZ is supported in this release.
- JNT_ORIGIN_WAREHOUSE: official uppercase origin city name for tariff sendSiteCode.
- JNT_ORIGIN_CITY_CODE: official three-character origin_code for Create Order.
- JNT_SENDER_NAME, JNT_SENDER_CONTACT, JNT_SENDER_PHONE, JNT_SENDER_ADDRESS: real approved warehouse identity/address. Never dummy values.
- JNT_ENABLE_ORDER_CREATE=yes: only after safe tests and operational approval. Default no.
- JNT_PRODUCTION_ORDER_APPROVED=yes: independent explicit gate when JNT_API_ENV=production. Default no.
- JNT_ENABLE_CANCELLATION=yes: separate explicit action gate. Default no.
- SHIPPING_PROVIDER=jnt: enable official tariffs only after successful mapping and validated measured product weights. Default remains manual.

## Carrier-dependent limitations / blockers
- Production Tariff Check HBO was reported successful by the owner (specific Batang–Warungasem, 3 kg, Rp14,500). It does not prove HBO Create Order supported. Demo EZ Create Order returned AWB, not Production proof. Production Tracking and Cancellation UAT have not been independently confirmed.
- Credentials previously shared in screenshots/Postman must be rotated in the official dashboard before Production; no live secret values may be checked into Git.
- The user reported 12/13 published products still missing actual measured weight. Such products cannot checkout.
- Unknown/ambiguous J&T L3 ↔ Emsifa districts cannot checkout. J&T team must confirm the final mapping, source version, and operational service coverage.
- Create Order cannot safely auto-retry on 502/timeout: it is held UNKNOWN until operator reconciles the durable external ID with J&T. Shipment creation is not a proof of physical handover.
- Cancellation success only affects the carrier AWB. Do not automatically refund/cancel the customer's paid order; existing money/stock workflows remain authoritative.
- No live J&T API requests were sent from PR CI or by this implementation effort.
- A production rollout still requires backup/restore check, effective DB role privileges, migration approval, stable release image, provider UAT and owner release sign-off. This branch remains Draft until reviews pass.

## Source of truth
Official spec: https://developer.jet.co.id/documentation. The public Basic Order specification documents expresstype "1" for EZ; servicetype 1 = pickup and 6 = dropoff. Shipping weights use kg up to two decimal places and request timestamps are WIB. Carrier-specific Production endpoints/keys are taken from the owner's authenticated J&T dashboard and validated against the application allowlist.
