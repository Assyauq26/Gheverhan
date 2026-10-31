# J&T Express four-endpoint integration — first phase

This branch adds an owner/admin-only settings screen at /admin/shipping/integrations.
It stores four separate API credential sets for Sandbox and Production.

## Supported APIs
- Order: POST form-urlencoded data_param, data_sign; signed with base64(hex(md5(data_param + key))).
- Tariff: POST form-urlencoded data, sign; signed with the same protocol.
- Tracking: POST JSON body with HTTP Basic Auth using E-Company ID/password.
- Cancellation: POST form-urlencoded data_param, data_sign.

Official reference: https://developer.jet.co.id/documentation

## Security / launch constraints
- Supply JNT_SETTINGS_ENCRYPTION_KEY as a fresh random 32-byte Base64URL secret in the *server runtime only*. Never put it in GitHub or Postman exports.
- Secrets are encrypted at rest using AES-256-GCM, never included in admin GET responses.
- URLs are checked against exact official J&T host/path pairs and HTTPS. Untrusted arbitrary URLs are rejected (SSRF guard).
- Only single-store Admin and Super Admin with jnt.integration.manage can read/update/test settings. This permission must be **Super Admin only** once the platform becomes multi-tenant. Global platform credentials must never belong to seller tenant databases.
- Browser requests use same-origin validation. Read-only tariff/tracking probes are rate-limited. Order/Cancel are not exposed as test actions.
- No request details, auth headers, or credentials are logged. Do not paste exposed historical credentials into the form; rotate them with J&T first.
- Production checkout stays BLOCKED: this phase does not switch SHIPPING_PROVIDER, ingest/approve the L3 mapping, create an AWB for a paid order, or clear unknown product weights. It is the transport/configuration foundation, not a release authorisation.
- The transport functions jntCreateOrder and jntCancelOrder are **internal-only**. Future work must add durable idempotency and reconciliation across timeouts, paid-order ownership checks, legal pickup and cancellation windows, and audited state transitions before invoking them for a real order.
- Production hostname/path in the defaults must match the authenticated J&T dashboard. Tracking production path is a candidate derived from the collection and must be verified against the account before use.
- No plaintext secret backup. Backup restoration requires the exact same master encryption key; rotation requires a planned re-encryption procedure.

## Release procedure
1. Run unit, integration, security, migrations and checkout regression CI on the PR exact head.
2. Apply the additive migration after a verified backup and restoration test.
3. Provision JNT_SETTINGS_ENCRYPTION_KEY via server secret manager and verify no secret reaches client bundles/logs.
4. Test sandbox tariff/tracking with sanitized synthetic inputs; verify Production tariff with an approved route.
5. Keep checkout disabled until L3 district-to-Emsifa mapping, real product weights, official J&T approval and real purchase flow are independently verified.
