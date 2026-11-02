# API Contracts V1 (Proposed) — JetSeller Installer and Update Agent

**These are design schemas, not existing endpoints.** Final paths depend on actual repository layout. Never use raw client-supplied installation owner IDs as authority. All endpoints versioned under `/api/installer/v1` for initial MVP. JSON examples contain only synthetic test data.

## 1. Authentication realms

- **Seller portal**: browser session with CSRF protection for unsafe methods; seller is allowed to operate only on own installation.
- **Operator portal**: separate role/scope and optional MFA; release approval is not a seller API.
- **Unpaired device**: short-lived `device_code` pairing session; rate-limited no seller data disclosure.
- **Paired agent**: outbound mTLS certificate or equivalent proof-of-possession + short-lived access; per installation ID and limited API scopes.
- **Delivery**: agent downloads public metadata and signed artifact through hardened registry credentials issued only to agent, not a long-lived owner PAT.

All auth tokens/fingerprints/signatures are sensitive; never put them in query params, logs, bug reports or browser local storage.

## 2. Installation lifecycle endpoints (seller session)

| Method | Path | Purpose | Idempotency |
|---|---|---|---|
| POST | `/installations` | Create installation intent | Required `Idempotency-Key` |
| GET | `/installations` | List only user's installs | N/A |
| GET | `/installations/{installationId}` | Status + progress + safe metadata | N/A |
| PATCH | `/installations/{installationId}` | Modify pre-install store name/domain | Required concurrency `If-Match` |
| POST | `/installations/{installationId}/pairing-sessions` | Issue pairing authorization session | Required |
| POST | `/pairing-sessions/{id}/approve` | Confirm code, fingerprint, scope, account | Required |
| POST | `/pairing-sessions/{id}/cancel` | Revoke unapproved session | Required |
| POST | `/installations/{id}/domain-challenges` | Create ownership challenge | Required |
| POST | `/installations/{id}/domain-challenges/{challengeId}/verify` | Verify TXT ownership | Required |
| POST | `/installations/{id}/update-policy` | Set channel/window/auto-update consent | Required |
| POST | `/installations/{id}/unpair` | Revoke agent credentials; retain local data | Required; MFA recommended |
| GET | `/installations/{id}/events` | Paginated sanitized installation timeline | N/A |

### Create installation request

```json
{
  "display_name": "Fashion Cantik",
  "domain": "fashioncantik.example",
  "profile": "fresh_vps_ubuntu_amd64",
  "requested_install_version": "stable"
}
```

Response `201 Created`:

```json
{
  "installation_id": "ins_01JEXAMPLE123456789",
  "status": "DRAFT",
  "version": 1,
  "next_action": "START_PAIRING",
  "created_at": "2026-11-02T04:00:00Z"
}
```

Uniqueness: `(seller_account_id, client_request_id)`, active claimed domain unique (pending claims have TTL) and installation ID globally unique. Avoid hardcoding demo IDs in app. Domain normalization/Unicode/IDN rules must be tested.

## 3. Device pairing (RFC 8628-inspired)

### `POST /agent/pairing/device`

Unpaired agent sends:

```json
{
  "protocol_version": "1",
  "agent_version": "0.1.0",
  "public_key": "BASE64_PUBLIC_KEY_TEST_PLACEHOLDER",
  "installation_hint": "ins_01JEXAMPLE123456789",
  "os": "ubuntu-24.04",
  "arch": "amd64",
  "server_fingerprint": "sha256:LOCAL_FINGERPRINT_TEST"
}
```

Response `201` (agent only):

```json
{
  "device_code": "OPAQUE_RANDOM_SECRET_NOT_FOR_LOGS",
  "user_code": "ABCD-EFGH",
  "verification_uri": "https://jetseller.web.id/hubungkan-server",
  "expires_in": 600,
  "interval": 5
}
```

**Do not log `device_code`; browser never receives it.** Portal prompts seller to enter the human readable `user_code`, reviews installation/server fingerprint and scopes, and approves. Pairing code is not sufficient without authenticated seller session and positive confirmation.

### `POST /agent/pairing/token`

Agent sends device_code via authenticated TLS POST body (no GET URL). Responses:

- `202 authorization_pending` — safe to retry after interval.
- `429 slow_down` — apply Retry-After and backoff.
- `410 expired_token` — code expired/restart pairing.
- `403 access_denied` — seller rejected.
- `200` — one-time scoped binding result tied to agent public key (mTLS certificate enrollment / proof-of-possession).

Example success (fields illustrative, secret redacted):

```json
{
  "installation_id": "ins_01JEXAMPLE123456789",
  "device_id": "dev_01JEXAMPLE123456789",
  "credential_expires_at": "2026-11-03T04:00:00Z",
  "scopes": ["report:heartbeat", "install:progress", "release:read"],
  "credential": "REDACTED"
}
```

Do not use a long-lived bearer shared between machines. Rotate/renew credentials and support revocation. Multi-device server rebind requires explicit ownership transfer flow.

## 4. Agent telemetry and job endpoints

| Method | Path | Agent scope | Body |
|---|---|---|---|
| POST | `/agent/heartbeat` | `report:heartbeat` | Only allowlisted telemetry |
| POST | `/agent/install-progress` | `install:progress` | Job ID, step, status, sanitized code |
| GET | `/agent/desired-release?channel=stable` | `release:read` | Signed release manifest; server enforces entitlement |
| POST | `/agent/update-events` | `release:report` | Update action outcome, digest, phase, correlation |
| POST | `/agent/credentials/rotate` | `agent:rotate` | New public key CSR/proof |
| POST | `/agent/diagnostics/request` | `support:diagnostics` | Agent-initiated request with seller consent identifier |

Heartbeat example:

```json
{
  "installation_id": "ins_01JEXAMPLE123456789",
  "device_id": "dev_01JEXAMPLE123456789",
  "agent_version": "0.1.0",
  "app_version": "1.0.0",
  "app_image_digest": "sha256:EXAMPLE_DIGEST",
  "health": {"app":"healthy", "db":"healthy", "tls":"valid"},
  "resources": {"disk_used_percent": 42, "memory_used_percent": 35},
  "last_backup_at": null,
  "last_restore_test_at": null,
  "update_state": "IDLE",
  "observed_at": "2026-11-02T04:00:00Z"
}
```

Accept only defined enum keys and bounded numeric ranges; reject unknown metadata that could contain PII. Do not push order totals, email addresses, full process command lines or connection strings.

## 5. Signed release manifest

Manifest **must be cryptographically signed**, version monotonic, non-expired, and tied to signed image digest plus approved identity. This JSON is an example of the unsigned content; actual signature delivered via reviewed signing format or TUF metadata.

```json
{
  "schema_version": "1",
  "release_id": "rel-1.1.0-stable",
  "app_version": "1.1.0",
  "channel": "stable",
  "image": "ghcr.io/organization/jetseller-store@sha256:EXAMPLE",
  "platform": "linux/amd64",
  "min_agent_version": "0.1.0",
  "min_store_schema_version": 100,
  "max_store_schema_version": 109,
  "migration_policy": "compatible_expand_only",
  "rollout_ring": "pilot",
  "not_before": "2026-11-02T05:00:00Z",
  "expires_at": "2026-11-09T05:00:00Z",
  "requires_backup": true,
  "requires_operator_approval": true
}
```

Reject if unsigned, wrong signing identity, unknown root, digest mismatch, expired, lower rollback-protected metadata version, unsupported OS/arch/schema/agent, blocked or revoked. A signed `rollback_authorization` may permit explicit previous image where DB/schema compatibility verified.

## 6. Local helper command contract (not HTTP public API)

Use a private Unix domain socket with filesystem ACL, strict peer identity, schema and allowlist. Commands: `PREFLIGHT`, `INSTALL_RECORDED_RELEASE`, `VERIFY_HEALTH`, `APPLY_APPROVED_RELEASE`, `ROLLBACK_APPROVED_RELEASE`, `GET_SANITIZED_LOCAL_STATUS`, `PAUSE_UPDATES`. **NO arbitrary command, shell/script path, bind mount, image URL, Docker parameter or volume delete in agent input.** Local helper obtains verified release data using trusted manifest, not an untrusted arbitrary URL from portal.

Each command has `operation_id`, `installation_id`, `manifest_digest`, required expected state, idempotency key, timestamp, and deadline. Permission escalation of helper is reviewed before deployment.

## 7. Response conventions and error codes

Envelope:

```json
{
  "error": {
    "code": "DOMAIN_DNS_MISMATCH",
    "message": "DNS domain belum mengarah ke VPS yang terverifikasi.",
    "remediation": "Periksa record A dan AAAA pada penyedia domain.",
    "correlation_id": "req_01JEXAMPLE",
    "retryable": true
  }
}
```

Codes (subset): `ACCOUNT_NOT_VERIFIED`, `PAIR_EXPIRED`, `PAIR_ALREADY_USED`, `PAIR_PENDING`, `PAIR_DENIED`, `DEVICE_ALREADY_BOUND`, `SERVER_PREFLIGHT_FAILED`, `UNSUPPORTED_OS`, `DISK_SPACE_INSUFFICIENT`, `PORT_CONFLICT`, `DNS_OWNERSHIP_FAILED`, `DOMAIN_DNS_MISMATCH`, `TLS_VALIDATION_FAILED`, `DB_INIT_FAILED`, `SCHEMA_INCOMPATIBLE`, `MIGRATION_FAILED`, `IMAGE_SIGNATURE_INVALID`, `RELEASE_REVOKED`, `AGENT_OUTDATED`, `UPDATE_LOCKED`, `APP_HEALTH_FAILED`, `REPAIR_REQUIRED`, `PERMISSION_DENIED`, `RATE_LIMITED`, `CENTRAL_UNAVAILABLE`.

HTTP semantics: `400` invalid, `401` auth failure, `403` forbidden, `404` inaccessible resources (avoid ID enumeration), `409` conflict/state, `410` expired, `422` validation, `429` rate limit, `503` temporary. Include bounded `Retry-After` where applicable.

## 8. Concurrency and safety rules

- Every write is idempotent or has explicit unique operation ID; return same accepted result for retries.
- Optimistic version `If-Match` or a transactional state CAS protects portal installation updates.
- Pairing approval transaction atomically consumes code and binds exactly one installation; race tests compulsory.
- Agent report sequence numbers/timestamps must be checked for replay/out-of-order events; no authorization decisions from arbitrary reported state.
- Central update manifest is **declarative desired state**; local agent assesses preconditions and retains final safety authority.
- Rate limits per account/IP/pairing code/device; log minimal metadata; default no access to server root shell.
- Reinstallation of same server must detect existing installation and require recovery flow rather than creating duplicate data volumes.

## 9. Proposed control database tables (no PII commerce)

`users` / existing auth, `seller_accounts`, `installations` (id, owner, domain, status, active_version, channel, time), `installation_domains` (ownership challenge/status), `pairing_sessions` (hashed device_code/user_code, TTL, status, attempt), `agent_devices` (public key, revocation, scopes, last_seen), `installation_jobs` + `job_steps` (journal summary), `releases` (digest, signing status, policy, approval), `release_rollouts` (rings, targeting, status), `update_events` (sanitized outcome), `operator_audit_events`, `support_diagnostics_consents`.

Do not use a foreign key to local store customer/order tables; there are none centrally.

## 10. Contract tests

- Schema-based request/response validation and fuzzed inputs.
- Cross-seller IDOR attempts; unbound device attempt to pull private image.
- Device-code brute force, replay, expiry, duplicate, code approval concurrency.
- Agent cert rotation/revocation and stale token rejection.
- Tampered manifest, wrong signer, image digest mismatch, expired metadata.
- Rollout blocked when incompatible agent/store schema, missing backup readiness, or unsupported platform.
- Heartbeat rejects raw customer PII, database DSN or token fields.
- Store functions when central API down for hours (no runtime dependency).