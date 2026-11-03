# Installer control registry — independent backend slice

This Node22 package is separate from the storefront application and database. It
implements persistent installation intent CRUD, verified seller ownership, atomic
one-time device pairing and a key-bound agent identity check. It does not deploy
containers, expose a shell, access seller commerce data or alter existing hosting.

Source: `docs/self-hosted/API_CONTRACTS.md`, `ARCHITECTURE_GATE_DECISION.md`,
ADR0001/0002 and FR01/04/09. Node-postgres transactions use one checked-out client;
JOSE signs/verifies Ed25519 JWTs and calculates public JWK thumbprints. This is a
restricted proof profile inspired by RFC9449, not an OAuth/DPoP compliance claim.

## Running an authorized isolated instance

Use Node22 and `npm ci --ignore-scripts`. `npm test` runs input/key-proof unit
tests. `npm run test:integration` requires explicit
`JETSELLER_CONTROL_TEST_CONFIRM=isolated-control-fixture` and a private
`JETSELLER_CONTROL_TEST_DATABASE_URL` naming `js_control_fixture` on loopback.
It never falls back to DATABASE_URL. CI provisions its own PG17 service, verifies
ownership/CSRF/replay/concurrent consent/expiry/revocation/durable reads and real
HTTP OIDC callback/session/create/logout routes with a synthetic issuer transport.

Migration requires a dedicated database named `jetseller_control...` or
`js_control_...`, with no storefront User/Prisma schema. Use a migration owner and
private URL file; set `JETSELLER_CONTROL_DATABASE_URL_FILE` and the explicit
`JETSELLER_CONTROL_MIGRATION_CONFIRM=dedicated-control-database` before `npm run
migrate`. The migration is transactional and refuses storefront database identity.
Do not point this command at an existing production database. Runtime database
role should receive schema USAGE and SELECT/INSERT/UPDATE/DELETE on installer
tables only, without schema creation, role administration or a storefront grant.

`npm start` loads `JETSELLER_CONTROL_CONFIG_FILE` (private JSON, mode0600). Fields:

- `controlOrigin`: canonical HTTPS origin, no path/credentials/query.
- `databaseUrlFile`: private control DB connection file; never a store DB.
- `signingKeyFile`: private Ed25519 PKCS8 key for short-lived agent credentials.
- `port`: optional loopback port, default3100. No public listener is created.
- `sessionIssuer`: optional pinned issuer/audience/JWKS public file adapter for an
  existing authenticated seller service with DB-backed verified/revocable sessions.
- Or `oidc`: issuer, clientId, authorizationEndpoint, tokenEndpoint, redirectUri,
  jwksFile, sessionSigningKeyFile. Provider endpoints are HTTPS and pinned to the
  issuer origin; redirectUri is exactly controlOrigin plus `/auth/callback`.
  Configure a public PKCE client at the provider; provider registration/email
  verification occurs there. Session key must differ from the agent signing key.

No issuer configuration means seller APIs return AUTH_UNAVAILABLE; no fallback
identity header, development password, pasted bearer token or store cookie exists.
Private keys/DB URLs belong in local private files, not examples, CLI args or logs.
The Node server binds loopback for a separately approved TLS reverse proxy.
Forwarded user/host/IP headers are ignored; rate limits use the direct peer, so
the future trusted proxy integration must specify its own reviewed IP policy.

## Seller routes

`GET /auth/status` reports whether login is configured; `GET /auth/login` starts
Authorization Code+S256 PKCE. A durable10minute state/nonce/verifier transaction and
Secure HttpOnly SameSite=Lax cookie bind `/auth/callback` to that browser. Callback
atomically consumes the transaction, exchanges code server-side, verifies pinned
issuer/audience/algorithm/nonce/verified-email and creates a revocable one-hour
local session cookie. No access/ID token is returned in a page or persisted in
browser storage. A failed exchange requires a new login. Provider keys are pinned
via administrator-managed JWKS file; scheduled key refresh and provider operations
are deployment tasks, not a reason to accept unknown signing keys.

API prefix: `/api/installer/v1`. `GET /session` returns authenticated seller ID and
CSRF token from the verified session; every seller mutation requires exact Origin
and X-CSRF-Token. `/session/logout` revokes the durable session.

- `GET/POST /installations`: owner-only list/create. Create requires UUID
  Idempotency-Key and `{display_name,domain,profile:"fresh_vps_ubuntu_amd64",
  requested_install_version:"stable"}`. Same key+input returns the same intent;
  changed input conflicts. Pending domain claims reserve for24hours.
- `GET/PATCH/DELETE /installations/{uuid}`: owner-scoped; PATCH/DELETE require
  numeric If-Match. Delete cancels only an unpaired intent and never deletes data.
- `POST /pairing-sessions/lookup` with `{user_code}` reveals only the owning
  seller's pending fingerprint, scopes and technical identity for confirmation.
- `POST /pairing-sessions/{uuid}/approve` with `{user_code,
  public_key_thumbprint,confirm:true}` atomically binds one device to the existing
  intent. A second/concurrent consent conflicts. `/cancel` accepts `{}`.
- `POST /installations/{uuid}/unpair` revokes management credentials and pairing
  sessions, preserving store data. No request ever contacts a seller database.

Public installation projections report app_version/last_heartbeat_at as null;
PAIRED is identity binding, not successful installation or ready-to-sell.

## Agent transcript

`POST /agent/pairing/device` accepts `{installation_hint,public_key,
protocol_version:"1",os:"ubuntu-24.04",arch:"amd64",agent_version}`. Public key must
be Ed25519 JWK with only kty/crv/x. Response contains pairing_session_id,
device_code, user_code, nonce, expires_in600, interval5, expires_at and the same
origin verification_uri. Device/user codes are stored hashed; never log them.
The authenticated owner must independently confirm the public fingerprint/scopes.

Poll `/agent/pairing/token` with `{device_code,proof}`. Proof is an EdDSA compact
JWT, typ `jetseller-pairing+jwt`, aud equal controlOrigin, iat/exp no longer than
60seconds, UUID jti, server nonce, operation `pairing-token`, code_hash SHA256hex
of device_code. Stored device key verifies it. Durable replay cache rejects reused
proof IDs; polling uses5second spacing. Initial session expires in10minutes.

Success returns installation_id, device_id, credential_expires_at, scopes,
credential, token_type `jetseller-pop`, public_key_thumbprint and management_nonce.
Credential lasts10minutes and binds cnf.jkt. A bounded2minute same-key retry recovers
a lost issuance response without creating or consuming a second device binding.

`GET /agent/identity` requires Authorization `DPoP <credential>` plus a `DPoP`
header signed by that device, typ `dpop+jwt`, htmGET, htu exact request URL, ath
base64url SHA256 of credential, nonce management_nonce, fresh iat and UUID jti.
Revocation is checked in PostgreSQL for every authorization. Token without key proof,
wrong key, wrong URI/hash/nonce or duplicate proof is rejected. No remote command
or update operation is implemented by this endpoint.

## Remaining release gates

Production provider setup and security review, credential renewal/key rotation and
lost-key recovery, domain ownership/TLS/public reachability, signed bootstrap and
private artifact grants, installer orchestration, heartbeat/status reporting,
backup/restore and update compatibility remain separate gates. No real provider
account/email was created and no production service was deployed by this slice.
Registering a seller identity does not imply storefront readiness. TLS termination,
operational retention/rate sizing and provider JWKS rotation need deployment review.
