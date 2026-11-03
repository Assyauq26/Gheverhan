# J&T Production Tracking — observed response, safe integration review

**Evidence provenance:** seller manually sent a successful Postman response for a real J&T Production AWB. This repo change did **not** send any J&T Production request or receive/store carrier credentials. The original response included private recipient, driver and address data; **none of these names, phones, addresses or the real AWB are added to source/tests**.

## Observed API contract
- Method: `POST`, HTTP Basic authentication; JSON body `{"awb":"<AWB>","eccompanyid":"<seller J&T ecommerce ID>"}`.
- The user's exported Production Postman request points at the exact HTTPS endpoint:
  `https://secure-jk.jet.co.id/jandt-order-web/track/trackAction!tracking.action`.
- Successful JSON fields included: `awb`, `orderid`, `detail` and ordered `history[]` entries containing `date_time`, `city_name`, `status_code` and `status`.
- Example state-code progression observed: `101 → 100 → 150 → 100 → 200`. A past `150` (held in warehouse) is **not** proof of an unresolved shipping failure; last `200` represented successful delivery in the observed case.
- The exported Postman Collection used identical tracking Basic Auth username and `eccompanyid` for this account, but **other seller accounts may receive different values**. Implementing a distinct field requires a reviewed schema/API/UX change.

## Changes staged in this PR
- Permit the above host/path as an **exact** additional Production Tracking allowlist combination, retaining existing `partner-track.jet.co.id/jandt_track/track/trackAction!tracking.action` configuration. Sandbox still only accepts the previous sandbox endpoint. URL search/fragment, embedded credentials, alternate ports, non-HTTPS, lookalike hosts and crossed host/path combinations are rejected.
- A Tracking response must return the **matching** `orderid` when the caller supplies `expectedOrderId`; a missing order ID is no longer treated as a match.
- Synthetic 5-event fixture exercises real-shaped history and verifies that personal names, phone numbers and full delivery details are **not** propagated into the minimized event result.

## NOT authorized or released
- This source-level change does not enable JNT-SH-02 for self-hosted seller checkout or expose raw Tracking to unauthenticated clients.
- Local seller `activeJntConfig()` remains fail-closed until downstream order/quote/authorization/provider testing is approved.
- No real AWB, bearer/basic password, carrier API signing key or customer PII is included in CI artifacts.
- Live account-specific `eccompanyid` independence, endpoint contract and historical state interpretations require authorized seller UAT and provider confirmation before wide public release.
