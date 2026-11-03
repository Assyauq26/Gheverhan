# Agent proactive credential renewal (security increment)

**Status:** REVIEW REQUIRED. This is not a complete offline identity recovery or production device lifecycle.

## Existing boundary reused

The control plane already issues short-lived, device-bound Ed25519-signed JWT credentials (10 minutes) and verifies the device's per-request DPoP-like JWT signature, access-token hash, method, exact URL, nonce and replay ID with the durable device registry. A revoked device is rejected even if the access token has not yet expired.

## New endpoint

`POST /api/installer/v1/agent/credential/renew`

Request:
- `Authorization: DPoP <existing valid agent JWT>`
- `DPoP: <fresh Ed25519-signed proof>` with `htm=POST`, `htu` set to this exact HTTPS URL, `ath` hash of bearer JWT, device nonce, fresh UUIDv4 jti and current iat
- `Content-Type: application/json` with `{}` body

Response: existing `credential()` schema, with a new random JWT jti, at most ten minutes of lifetime, same installation ID, same active device ID, same thumbprint and **no expanded scopes**. Response is `Cache-Control: no-store`.

Checks happen in one PostgreSQL transaction, including durable proof replay detection and active device lookup; unknown/revoked device, wrong proof, wrong HTTP method/URL/token hash and replay are rejected. A bounded per-IP rate bucket protects the route.

This extends the lifespan of an **online agent that renews before its old token expires**, without persisting new secrets on the control plane and without introducing a permanent shared refresh token.

## Deliberately not solved

1. **No expired-token rescue**: token expiry still requires a separately security-reviewed device reauthentication or seller-approved recovery design.
2. **No long-running agent scheduler yet**: the Go `PairingClient.Renew` method now constructs the bound DPoP proof, calls the endpoint, checks same installation/device/nonce/scopes and persists the new credential atomically. A background agent must still call it proactively before expiry, with jitter, backoff, and clock skew resilience. Do not assume this method alone makes an agent durable.
3. Device/key rotation, replacement, renewal loss response handling, complete RFC 9449 compliance, registry credentials and signed release rollout are separate review gates.
4. Never use this route to grant new scopes or bypass device revocation.

## Tests

Isolated PostgreSQL integration covers: successful renewal, matching device/installation/PoP thumbprint, scope preservation, no new device, invalid/missing proof, wrong signing key, wrong method and URL, proof replay, repeated authorized renewal and revoked device rejection.

Go unit tests additionally cover signed POST/URL/token binding, atomic credential persistence, and rejecting a foreign device or expanded scope. No VPS access or production changes. Do not enable production until a specialist verifies the proof profile, error responses, rate limiting and recovery semantics.
