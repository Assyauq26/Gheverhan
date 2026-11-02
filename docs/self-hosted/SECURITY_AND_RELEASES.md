# Security, Software Supply Chain, Operations & Recovery

Companion to `PRD.md` and `ARCHITECTURE.md`. **Do not implement a remote root execution backdoor in order to make updates easy.**

## 1. Threat model

| Threat | Impact | Mandatory controls |
|---|---|---|
| Fake bootstrap domain/script | Full VPS compromise | Official HTTPS, version-pin, hash + signature verification BEFORE execution, browser anti-phishing guidance |
| Stolen pairing code | Server hijack / malicious link | Code expiry, entropy, rate limiting, logged-in approval, fingerprint confirmation, single-use atomic binding |
| Stolen agent credential | Impersonated VPS | Device-bound PoP key/mTLS, short expiry, revocation, rotation, IP anomaly monitor |
| Compromised control plane | Fleet command abuse | No shell API, local manifest verification, minimum permissions, two-person release approval for broad rollout |
| Registry compromise | Malicious image | Immutable digest, pinned signers, signed metadata, provenance, fail closed |
| Rollback/freeze metadata | Forced vulnerable version | TUF-compliant versions/expiry, no implicit downgrade, signed rollback authorization |
| Malicious tenant or portal input | SSRF/SQLi/IDOR | Input validation, account authorization, remote fetch restrictions, parameterized SQL, concurrency locks |
| Leaked local store secrets | Customer/payment/shipping breach | Local secret-only, not in image/log/telemetry, file ACL, encrypted backups, credential rotation |
| Postgres exposed publicly | Data exfiltration | No published DB port; private Docker net, least-privileged account |
| Agent Docker socket misuse | Host root compromise | Privilege separation and narrowly scoped local helper, no generic Docker API |
| Update breaks store / migrations | Outage/data loss | Backup, app/schema compatibility, canary, smoke, journal and restore drill |
| Insecure support | Cross-seller privacy | Opt-in diagnostics, no default DB access, redaction, time-limited permission, operator audit |

## 2. The single copy-paste command (design, not executable)

The portal should generate a **single copyable shell line** that downloads a **fixed-version signed installer**, verifies against an independently displayed expected SHA-256 + trusted signer, and only then runs it. **Never display a functional one-liner until delivery location and signature infrastructure exist**. Do not use an unsafe `curl | bash` shortcut. Do not include any secret/device code/SSH credential in the command or shell history.

Implementation details:

1. Bootstrap launcher is independently signed (Cosign bundle or reviewed equivalent), version pinned, and securely hosted.
2. Portal renders its version and hash; agent verifies pinned certificate identity or trusted public key, signature, SHA-256, OS/arch match and revocation metadata before executing binary.
3. After successful verification the launcher prompts local operator for sudo as necessary (not remote) and starts device pairing; display a short user_code in terminal only.
4. Installer never collects SSH password. If it needs OS packages it asks before installing and describes changes.
5. Repeating launcher detects existing installation ID and offers repair/resume/unpair, never installs a second DB stack by accident.
6. Bootstrap artifacts cannot be replaced under the same immutable version identifier.

## 3. Local privilege separation

Preferred design: a small unprivileged outbound agent plus restricted signed local updater helper. Privileged helper operations limited to prepared templates and verified release digest, with exact file paths and Docker Compose project allowlists. Local socket only, OS peer credential checks, no arbitrary executable paths or command strings. Run security review of helper before pilot; if too complex for MVP, use root-only systemd updater with predefined signed manifest and minimal agent IPC, and document residual risk. Never mount Docker socket inside ordinary web app container.

## 4. Release supply chain

- CI must pass lint, typecheck, unit, integration DB, browser critical flows, container image scan, dependency audit, secret scan, migration tests and signing verification.
- Build immutable images tagged for human discovery but **deploy only by digest**. Create SBOM and signed provenance; sign image with Cosign and pin signer identity to approved release workflow/repository.
- Build/approve/deploy use separate roles and permissions. CI success is not authorization to deploy.
- Registry credentials scoped to image pull per installation with rotation; avoid shared GitHub personal access token distributed to sellers.
- Publish a signed release manifest containing schema range, agent range, compatible OS/arch, rollout ring, time window and digest.
- For metadata freshness/revocation and anti-rollback, implement audited TUF-compatible verification or equivalent reviewed trust protocol. Verify metadata expiry and reject stale manifests.
- Versions use semver for application, **separate** `agent_version`, `schema_version`, `compose_template_version`, and `protocol_version`; no assumption that app version = DB schema version.

### Release channel policy

`internal` → `canary` (disposable) → `pilot` (opt-in) → `stable` (general). Production approval cannot be inferred from merge. Agent sees allowed channel and update policy only for bound installation.

## 5. Agent update state machine

```text
IDLE -> CHECKING -> UPDATE_AVAILABLE -> PREPARING
     -> BACKUP_READY -> DOWNLOADING -> VERIFYING
     -> PRE_MIGRATION_CHECK -> APPLYING -> HEALTH_CHECK
     -> SUCCESS

Failure: PREPARE_FAILED / SIGNATURE_REJECTED / BACKUP_FAILED /
         MIGRATION_BLOCKED / HEALTH_FAILED / ROLLBACK_IN_PROGRESS /
         ROLLED_BACK / REQUIRES_MANUAL_RECOVERY / PAUSED
```

Mandatory checks:

1. Local update policy allows action; authenticated seller approval where necessary.
2. Signed digest, signer, manifest timestamp, version and compatibility valid.
3. Disk/memory/bandwidth sufficient; volume/backup location usable; maintenance window honored.
4. Local exclusive lock and operation journal durable. Do not have two agents deploy simultaneously.
5. Backup of DB and uploads if change requires it; **last restore test** not conflated with backup success.
6. DB migrations designed expand/contract with backward compatibility. No automatic revert of destructive migration.
7. Switch only app service to verified image; ensure Caddy persisted TLS and database untouched.
8. Probe liveness + readiness + auth navigation + safe read-only smoke. Never send real shipping order/payment in smoke.
9. Report result; on app failure rollback image **only if old app compatible with new schema**. Otherwise fail to safe maintenance and request recovery.
10. Protect against endless loops/retries with retry budgets and suppression after repeated failure.

## 6. Backup policy

Use PostgreSQL documented methods appropriate to data size and RPO/RTO (pg_dump for small installations and portability, base backup/WAL for larger production-grade recovery). Always include media uploads and encrypted application configuration secrets necessary for recovery. Seller owns backup endpoint/retention and encryption keys; off-VPS destination is strongly recommended. JetSeller central stores only status metadata, never raw backup by default.

First release test: disposable store with synthetic orders/media; take backup, corrupt/stop database in controlled environment, restore into fresh environment, verify checksums and critical flows. Record evidence in PR.

**Don't** use `docker compose down -v`, `docker system prune --volumes`, `DROP DATABASE`, or `rm -rf` on seller data paths in automatic rollout/uninstall paths. Explicit uninstall requires comprehensive separate destructive-action procedure and seller consent.

## 7. Per-store operational independence

Storefront, admin authentication, local J&T shipping, local payment setup, and customer checkout never call central for each transaction. Agent heartbeat and update check run asynchronously. Central may pause updates or revoke agent access but must not kill store. License failures should use contractually defined local grace policy, offline tolerant, and never be silently added as per-request checkout checks.

## 8. Security and privacy review gate

Before any production pilot, document: system threat model, privilege/escalation review, signed release trust chain and key rotation/revocation drill, authz cross-seller checks, SSRF protections, secret leakage checks, backup/restore evidence, rollbacks and failure injections, diagnostics consent UX, local installation ownership transfer, network egress and audit retention.

## 9. Operational incident response

- Suspected compromised signing key: freeze rollout, revoke key/signing identity, mark affected releases revoked, rotate trust roots with recovery process, notify sellers; **never replace image silently by mutable tag**.
- Agent credential compromise: revoke device only, re-pair after seller proof, store remains online.
- Bad release: stop ring rollout, record impacted IDs, evaluate schema compatibility, deliver signed rollback authorization to eligible versions, restore manually if needed.
- Center outage: store continues operating; agent backoffs; no forced logout or checkout failures.
- Support case: inspect sanitized metadata, request scoped diagnostic export approved by seller; avoid database snapshots and PII.

## 10. References

- https://docs.sigstore.dev/cosign/verifying/verify/
- https://docs.sigstore.dev/cosign/signing/signing_with_containers/
- https://theupdateframework.github.io/specification/
- https://www.postgresql.org/docs/current/backup.html
- https://docs.docker.com/compose/gettingstarted/