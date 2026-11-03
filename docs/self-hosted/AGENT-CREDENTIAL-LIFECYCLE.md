# Agent credential lifecycle review

This branch implements management-only credential renewal, key rotation, observation heartbeat and owner-authorized device replacement. It does not install a store or approve production rollout. Production4GiB/40GiB preflight is unchanged. No arbitrary command, Docker socket or seller DB access exists in this control API.

## Contracts

- POST `/api/installer/v1/agent/credentials/refresh`: installation_id,device_id,request_id,proof. An active, initially delivered paired Ed25519 key signs a60second `jetseller-management+jwt` transcript binding audience, HTTP method/URL, nonce, operation and SHA256 of the ordered validated request. Expired access tokens are not needed; a stolen token without the private key cannot refresh. Revocation is rechecked under installation/device locks.
- POST `.../credentials/rotate`: same plus new_public_key,new_key_proof. Requires both old and new key signatures. Current key epoch/thumbprint changes atomically, immediately rejecting all old-key access. The nonce is a public challenge and remains stable; this permits new-key possession to recover a lost response after the2minute receipt window without trusting an old revoked key.
- Credential issuance lasts10minutes; per-device/request receipts preserve fixed issuance/jti metadata for2minute same-key retry. Replay proof IDs are retained through complete accepted lifetime. Receipts are bounded to1day; renewal is a key-authorized credential operation, not a one-time commerce side effect.
- POST `.../agent/heartbeat`: allowlisted agent/app version,digest,readiness/update-state only; HTTP proof binds body hash. Stores observed metadata only and never promotes INSTALLED. Desired release is null until a verified release controller supplies it.
- Agent authorization export: `agentIdentity(request,tx,key,origin,requiredScope,{bodyHash})` returns authoritative installation/device IDs,scopes,key_epoch,public_key_thumbprint. `assertActiveAgent(tx,principal)` rechecks the epoch/key/revocation after an external distribution operation.
- Existing seller-session+CSRF `/installations/:id/unpair` revokes device identity and all future refresh/management immediately; data/secrets remain local. New identity must be paired with owner fingerprint confirmation. Audit event endpoint exposes sanitized latest100 events only to the owner.

The access proof retains the existing DPoP-shaped header/profile for compatibility; the renewal/rotation/body-binding transcript is custom application JOSE. This is NOT a claim of OAuth/RFC9449 compliance or independent cryptographic review.

## Durable CLI

`renew-credential`, `rotate-device-key`, `heartbeat` use existing private PAIRED state and never rerun an install preflight. Refresh request IDs persist before network IO. Rotation retains old/new keys privately until both identity and credential are durable, handles a crash between files, and recovers a longer lost-response outage with the new key. Network failure never deletes a key or store data.

`recover-device --confirm-management-recovery` requires a separate fresh state path and explicit owner revocation/approval at the server. It records a management-only recovery marker and INITIALIZED->PAIR_PENDING->PAIRED, never PREFLIGHT_OK. It cannot overwrite an existing paired state or claim the old server-generated device ID. Every actual installation/helper operation still requires its independent production host preflight and signed-release gate.

## Domain ownership security correction

Unverified intents, including paired devices, never exclusively reserve domains. Multiple sellers may hold unverified intents. Only fresh exact TXT proof atomically acquires a24hour domain lease under domain advisory lock before installation locks; current verified leases are protected until expiry. Pairing/name changes/unpair do not extend that lease. Reusing old verified challenges never renews the lease. Legacy unverified reservations are released by an additive migration; store databases are untouched.

Public installation responses add domain_claim.status (UNVERIFIED,VERIFIED,EXPIRED) and expires_at; challenge responses distinguish historical proof from domain_claim_active. Domain verification does not claim HTTPS, installation completion or readiness to sell.

## Validation and remaining boundary

Meaningful tests cover real PostgreSQL concurrency/replay/expiry/rotation/revocation/domain competitors, plus actual Go CLI against HTTPS and PostgreSQL with injected lost replies, interrupted identity replacement, outage recovery, body-bound heartbeat and fresh-device owner confirmation. Exact-HEAD CI results must be checked before acceptance; Windows unit success alone is not the PostgreSQL/Go Linux proof.

Still separate: production trust-root/signing custody, private distribution deployment entitlement, signed update orchestration/helper, real portal IdP provisioning, production-profile installation validation, named protocol review and complete public onboarding UAT. No claim of PILOT_READY or RELEASE_READY.
