# Private distribution capability

This optional module implements a Harbor 2.15 provider and a durable encrypted PostgreSQL pull-grant broker. It does not deploy a registry or establish production approval.

## Provider policy

Use one PRIVATE Harbor project per installation: `js_` plus its canonical UUID without hyphens. Populate only entitled app/migration repositories. Harbor robots are project-scoped; they are not digest-scoped. The credential can read every artifact/version placed in that project; signed local metadata restricts execution, not registry data access. Do not place private source or another installation's artifacts in that project.

The API accepts duration in whole days. This adapter uses one day and verifies the returned expiry is at most 24 hours plus clock margin. It requires Harbor's actual registry token_expiration configuration to equal one minute. Disabling/rotating a robot prevents new token minting, but an existing registry JWT may survive until expiry. Provider outages leave revocation PENDING; the underlying robot secret can remain valid until its actual expiry. Never claim instant revocation.

Operator authentication remains in the control plane and is never returned to sellers. Use an approved restricted Harbor service identity in production; CI administrator credentials are synthetic. Supply a separate 32-byte encryption key through protected secret storage. AES256GCM AAD binds each stored secret to grant, installation, device and project. Audit rows contain no secrets.

## Integration contract

`createBroker({pool,provider,encryptionKey,authorizeAgent,assertActive,resolveVerifiedRelease})` exposes `issue(request,rawBody)`, `revokeInstallation(id)` and `sweep()`.

- POST body is strictly `{release_id,request_id}`; UUID request_id provides idempotency. The caller must read the request with a 4096-byte bound, return no-store responses, and redact credentials/Authorization/proofs from logs.
- `authorizeAgent(request,tx,'release:read',{bodyHash:sha256hex(rawBody)})` must perform actual fresh device-key PoP, body binding, nonce/replay and ownership checks. Use the lifecycle implementation's generalized `agentIdentity`; never trust caller-supplied owner/device IDs.
- `assertActive(tx,principal)` is checked again after provider calls and before revealing a secret. Use lifecycle `assertActiveAgent`, including exact key_epoch and public_key_thumbprint, to reject revocation or key rotation in flight. This callback must lock central installation then device rows in the supplied final transaction, matching lifecycle revocation lock order; a bare unlocked SELECT is insufficient.
- `resolveVerifiedRelease(tx,principal,releaseId)` must independently verify trusted TUF/catalog authorization and compatibility. It returns `{project,repository,digest,version,metadataExpiresAt,signatureVerified:true,compatible:true}`. This callback is a trust boundary, not a replacement for signature verification. Existing receipts reject changed digest/repository/version under one release ID.
- Revoke authoritative agent state first, then call `revokeInstallation`. Observe `{revoked,pending}` honestly. Schedule `sweep()` at least every 60 seconds and drain its bounded batches (50 rows). Failures remain retryable revoking rows. Account absence also remains pending while creation outcome is uncertain; late creation is compensated with disable. Least-recently-checked persistence prevents old active grants starving later revoked grants.
- A new request ID renews by creating a fresh robot and disabling older active grants for that device before exposing the new secret. Same request ID retries return the same encrypted receipt. Deterministic names plus explicit secret PATCH reconcile a lost provider creation/reply: Harbor ignores supplied create-secret.

The additive `distribution` schema belongs only in the dedicated control-plane DB. Never point it at a seller's store DB. Control-plane recovery must preserve its encryption key and DB; loss of central service must not stop independent commerce.

## Verification and limits

Local Node 22: `npm ci --ignore-scripts && npm test`.

Dedicated Ubuntu CI verifies a pinned official Harbor offline installer with real upstream Sigstore provenance before loading its included images. It uses only the verified preparation tool and Compose startup; the upstream installation wrapper is excluded because its cleanup can remove volumes. The 2 GB Tencent VPS is not used.

Tests target a real TLS Harbor registry with an explicit generated fixture CA: anonymous/cross-project/push denial; actual Docker digest pull; direct fresh manifest/config/layer downloads with digest verification; missing/tampered digest rejection; robot rotation/disable; actual one-minute registry JWT expiry; durable encrypted broker receipt/audit and revocation sweeper. Robot-expiry testing ages a synthetic Harbor DB row then exercises the real authentication path; this is not a 24-hour wall-clock run. Fixture authentication callbacks are not proof of portal HTTP PoP integration.

Until exact-HEAD CI succeeds this capability is UNVERIFIED. Production registry operations, signer/root custody, real lifecycle HTTP route wiring, verified release resolution and full seller installation remain separate gates.

Official references: [project robots](https://goharbor.io/docs/2.15.0/working-with-projects/project-configuration/create-robot-accounts/), [API schema](https://github.com/goharbor/harbor/blob/v2.15.0/api/v2.0/swagger.yaml), [robot handler](https://github.com/goharbor/harbor/blob/v2.15.0/src/server/v2.0/handler/robot.go), [Harbor resource requirements](https://goharbor.io/docs/2.15.0/install-config/installation-prereqs/).
