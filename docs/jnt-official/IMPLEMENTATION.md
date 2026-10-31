# Official J&T Express API — controlled rollout

Status: DRAFT / NOT LIVE. This PR adds a protected platform configuration UI and backend operations, but does not authorize a Production shipment or open checkout.

Official contract source: https://developer.jet.co.id/documentation (reviewed 2026-10-31)

## Four types
1. Create Order — POST data_param and data_sign. Payload detail is an array containing username, api_key and shipping details. Both outer success and per-detail status Sukses with the matching orderid and AWB are required.
2. Tariff Checking — POST data and sign. Response content is a JSON-encoded *string*; is_success is often the string "true". Validate requested service and safe nonnegative integer cost.
3. Tracking — POST JSON body with awb and eccompanyid, Basic Authentication.
4. Cancellation — POST data_param and data_sign using order credentials. Even HTTP 200 or success=true may contain per-detail status=Error; reject these cases.

MD5 signing is Base64 of the 32-character *hexadecimal* MD5 string, not Base64 of raw MD5 bytes. Official public documentation lists servicetype 1=Pickup, 6=Drop Off, and expresstype "1"=EZ. No HBO/JND/ECO create-order express types are assumed.

## Security and dashboard
- Dashboard at /admin/integrations/jnt, read/write API at /api/v1/admin/integrations/jnt.
- Only Super Admin role AND explicit ID in JNT_PLATFORM_OWNER_USER_IDS can open, read or update. Empty allowlist denies all, including tenant/seller Super Admin users.
- AES-256-GCM encrypts the whole JntPlatformIntegration record with JNT_INTEGRATION_ENCRYPTION_KEY in the server runtime. No decrypted keys in GET responses, audits or logs; values typed into the UI are never prefilled.
- Strict endpoint host/path allowlist by environment, HTTPS only and redirects disabled. If J&T issues a new host, verify and review a code change first.
- Saving Production credentials does not modify SHIPPING_PROVIDER or create any AWB. Checkout remains disabled without approved mapping, measured weights and valid tariffs.

## Server environment settings
Keep values private in Helipod VPS .env, never in Git or chat:
- JNT_PLATFORM_OWNER_USER_IDS: comma-separated trusted owner *user IDs* (not email and not tenant admins)
- JNT_INTEGRATION_ENCRYPTION_KEY: securely generated 32-byte random key in standard Base64, backed up outside VPS
- JNT_API_ENV: sandbox or production
- JNT_RATE_SERVICES: explicit supported service list, comma-separated (e.g. EZ after account approval)
- JNT_ORIGIN_WAREHOUSE: official uppercase city name for tariff sendSiteCode (not 3-character origin_code)
- JNT_OFFICIAL_AREA_MAPPING: temporary verified district mapping until database importer is completed
- SHIPPING_PROVIDER: keep manual until all Production readiness gates are approved

## Geography
Gheverhan keeps Emsifa v2 for province, city, district, and village/kelurahan selection. The J&T L3 spreadsheet maps *districts*, not villages. Its rows have no Emsifa district IDs, so human-reviewed reconciliation is required. The temporary district mapping JSON uses indonesiaCode as Emsifa district ID, areaCode as J&T district *name* for destAreaCode, and optional cityCode and receiverAreaCode for Create Order. Missing/ambiguous mappings must fail closed.

The bulk spreadsheet has NOT been imported in this PR. Storing thousands of mappings in an environment variable is not a production design. Create a versioned DB crosswalk + importer and independent review for mismatches in a separate PR.

## Remaining mandatory gates
1. Rotate all credentials exposed in shared screenshots/collections and store fresh values only in server secrets.
2. Verify the four account-specific Production endpoints/keys via the J&T dashboard and vendor UAT. The user has demonstrated Production Tariff Check (HBO 14500 for a specific test) and Demo Create Order (AWB); this does not prove Production Create Order or Tracking.
3. Complete official L3 mapping review, ensure every ordered product has actual measured weight, and validate service availability and origin destination pairs.
4. Wire Create Order only to a PAID, locked and durable idempotent order flow. Any timeout/uncertain result must reconcile with J&T before retry to avoid duplicate AWBs. Tracking and Cancellation require ownership, shipment state and audit control.
5. Run unit, PostgreSQL migration, functional browser and security regression checks; verify backups, rollback and a controlled Production release after separate approval.

CI unit tests use a mocked network; no real J&T calls. No secret or sample rate is committed.
