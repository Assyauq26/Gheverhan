# Local first-admin claim — 2026-11-03

Status: IMPLEMENTED_PENDING_CI. Stacked after M1 recovery, not deployed. This opt-in route is unavailable on the legacy profile. It does not establish Store Ready to Sell, public HTTPS, or pilot readiness.

A local operator runs `self-hosted/issue-admin.mjs --config <private-runtime-config> --out <new-private-file>` inside the installation runtime. Configuration must pass the complete self-hosted parser and actual database/runtime-role identity checks; output parent must be private and non-symlinked. The command writes a new mode0600 file with a random 256-bit claim and 15-minute expiry; stdout contains only a fixed success message. Existing files are never overwritten. No operator route can issue claims remotely.

The owner opens the store's own HTTPS `/admin/setup` form and enters the claim, name, email and password. The route requires canonical HTTPS and matching browser Origin for POST, rejects query parameters/unknown or repeated fields, bounds the request body and cancels stalled reads after three seconds, and sends no external request. Neither input nor error response echoes secrets. No client JavaScript, browser storage or query-string token is used. CSP disables scripts/framing and limits form submission to self; responses are private/no-store/no-referrer. Route handlers avoid the pre-authenticated admin layout.

PostgreSQL serializes issuance/redemption with a transaction advisory lock, bounded lock/statement timeouts and a dedicated silent HTTP client. Prisma errors are not logged by this setup client. Claim digest, expiry, bounded attempts and consumption are durable. Five validly shaped incorrect claims lock the attempt until a local operator reissues it; this bounds guessing but is not claimed as network DoS protection. Issuance refuses any existing staff account, and redemption never overwrites or elevates an existing customer. Exactly one new local Admin is created with the existing audited local Admin permission set, not a Super Admin or central operator role. The claim consume, user/role permissions and secret-free audit entry commit atomically. Subsequent setup GET is unavailable and replay is denied. Login remains the normal store authentication flow.

## Verification

Pure tests cover strict input/profile boundaries, bounded form decoding, duplicate/unknown fields, body-size and password confirmation. The disposable Ubuntu runtime harness additionally exercises actual private-file issuance, Caddy internal-CA HTTPS, origin denial, expiry, five-attempt lockout, existing customer preservation, concurrent single-consume, replay, response redaction and ordinary admin login/dashboard access. Exact-HEAD CI must be observed before reporting those as passed.

## Migration and rollback

Adds only the LocalAdminSetup table and index, with RLS enabled, and Prisma metadata. No existing table/data is modified by migration. The trusted server runtime role retains audited BYPASSRLS behavior and gets the new table through the existing explicit post-migration grant step. No production migration is run by this PR.

Code rollback may revert the opt-in route/CLI/modules while leaving the additive table and already-created admin intact. Never delete a user, reset a password, downgrade schema, re-enable a consumed claim or remove a volume as automatic rollback. A failed/expired unused claim may be rotated only by the explicit local operator. Keep admin recovery as a separately authorized local procedure; central support does not receive the claim or password. Deleting private operator output after use is an owner-local action, not an HTTP command.

Public HTTPS and host reboot remain PENDING_DISPOSABLE_VPS. SMTP, shipping/payment readiness, bootstrap trust and rollout approval remain independent gates.


The app port remains unpublished on the private Compose network. Setup validates the canonical configured Host and HTTPS forwarded protocol supplied by the trusted Caddy proxy, because Next start constructs request.url using its internal bind host/port. Caddy's default proxy handling overwrites client-supplied forwarded protocol. This boundary must not be reused behind an untrusted proxy or publicly exposed application port. Direct canonical HTTPS Request objects remain supported in unit tests; mixed protocol headers and foreign Host are rejected. Body reads have a three-second deadline and four-KiB limit; database setup probes use a lazy silent client and bounded connection/lock/statement waits.

Proxy reference: [Caddy default forwarded header handling](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#defaults). No trusted_proxies override is configured in this profile.
