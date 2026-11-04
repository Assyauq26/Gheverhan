# P0 handoff — Buat Toko Online Sendiri

Branch: `feat/buattokosendiri-p0-mvp`, stacked on PR #170 branch `feat/jetseller-buattokosendiri-domain-cutover`, reference `77c25c361f388b3db0f92a60915c2344ad550252`. Read the implementation PR for current exact HEAD and CI; this document does not imply deployment approval.

## Final authentication decision

Primary mode is **passwordless email OTP through Resend**. No platform password and no mandatory OIDC provider. Registration asks name/email/store name, sends six digits, verifies mailbox possession, stores/recognizes the seller in the independent control PostgreSQL and immediately issues a secure HttpOnly session. The browser opens the wizard without a second login. Returning sellers use email plus OTP and retain installation ownership.

Resend is delivery only, not identity/session storage. Merchant customer databases and local admin sessions are not reused. Existing device PoP, UUID/key binding and JWT audiences remain compatible. Legacy OIDC is an explicitly selected compatibility adapter, not a production requirement.

## Private configuration required from the operational workstream

The service reads `JETSELLER_CONTROL_CONFIG_FILE`. Keep the config and referenced secret files private, owned by the dedicated service identity, with restrictive permissions. Never place their contents in chat, PRs, CI logs, screenshots or this report.

- `controlOrigin`: `https://dashboard.buattokosendiri.web.id`.
- `databaseUrlFile`: dedicated control PostgreSQL DSN file. Existing database-name allowlist is `jetseller_control...`; never use the Gheverhan commerce database.
- `signingKeyFile`: independent Ed25519 agent credential signing key.
- `authMode`: `email_otp` (default).
- `emailAuth.resendApiKeyFile`: private Resend API credential file.
- `emailAuth.otpPepperFile`: independently generated 32-byte hexadecimal OTP HMAC pepper file.
- `emailAuth.from`: brand display name plus a sender address on a verified domain.
- `emailAuth.sessionSigningKeyFile`: separate Ed25519 session signing key, distinct from agent signing key.
- Optional `releaseCatalogFile`: protected publication catalog; absent or invalid means no installer commands/download are offered.

No OIDC issuer, callback, JWKS or provider logout is needed for primary OTP authentication. Local logout revokes the PostgreSQL session and expires the platform cookie. Unpair requires authentication within five minutes; email change/ownership transfer have no enabled endpoints.

ChatGPT/owner must verify Resend account/sender readiness and actual delivery. Copy exact SPF/DKIM verification records from the selected Resend domain configuration; do not invent records, overwrite existing mail records or rotate credentials automatically. Review DMARC alignment and sender policy with the owner. No operational DNS or Resend account changes were made by Codex.

## Gates

| Component | Gate | Evidence/remaining work |
|---|---|---|
| OTP adapter and direct-session UX | Implemented; CI pending | Real PostgreSQL/HTTPS transport OTP + browser + real Go pairing passed at code402705bf (runs41774960048/41774960472/41774960087); fixture delivery is not live Resend inbox proof |
| Production Resend and sender DNS | BLOCKED | Operational configuration and real delivery verification required |
| Session/CSRF/owner isolation/re-auth | Implemented; CI pending | Revocable PostgreSQL sessions; one-use HMAC OTP, 10-minute TTL, five attempts, cooldown/IP/email limits |
| Verified domain claim | Implemented; CI pending | Typed/pairing domain intent alone is nonexclusive; fresh TXT proof acquires a limited lease |
| Real CLI pairing | CI pending | OTP browser consent plus real Go CLI, preserving key/UUID binding |
| Signed installer executor | NOT_TESTED | Fixed-operation candidate, TUF + pinned Cosign archive verification, checkpointed DB/migrations/media/app/Caddy; full runtime acceptance still required |
| 2/2/40 production installation | NOT_TESTED | Actual QEMU resource-only test passed: 2vCPU/2147483648bytes RAM/40000000000bytes disk, boot14s, 17samples, OOM0, swap0, min available1535725568bytes, min free35114160128bytes. No application containers ran in this resource-only proof; full provisioning remains NOT_TESTED |
| Store admin/product/photo/restart | NOT_TESTED for integrated P0 | Existing app features are retained; the full new installer-to-product journey must still be demonstrated |
| Public HTTPS and production deployment | BLOCKED | Belongs to the operational workstream, with separate approval |

## Resource and deployment boundaries

Candidate resource profile checks Ubuntu 24.04 amd64, two CPUs, evidence for 2 GiB physical RAM, usable/effective memory, cgroups, at least 40,000,000,000 bytes total disk, free disk budget, inodes, free ports and existing-service conflicts. SMBIOS and MemTotal are distinguished; 1.89 GiB usable RAM is not automatically called 2 GiB physical RAM. The old profile remains unchanged until candidate evidence passes.

Budget explicitly includes image downloads/staging, expanded images, next update, database/media allowances and a 4 GiB reserve. P0 Compose limits are separately versioned; migrations and app startup must run sequentially. No Next.js or image build occurs inside the seller VM. Exact memory/swap/disk/OOM measurements must come from CI artifacts, not assumed limits.

Deployment templates remain code for review only. Exact target image digests and verified installer publication artifacts are a release gate; no mutable production image tag is authorized here. Never publish fixture roots or test credentials as production trust material.

## Read-only checks and operational next steps

After the operational team prepares an approved isolated target: inspect the configured service health, `GET /auth/status` (must say `method: email_otp`), private configuration permissions, independent control database migration state, and current exact-HEAD CI evidence. Do not print private config contents. Verify registration, mailbox delivery, immediate wizard session, session expiry/return login, seller isolation and revocation before enabling public landing redirects.

Backup the independent control PostgreSQL and private runtime configuration through the approved encrypted backup process before applying migrations. Verify a disposable restore. Rollback must preserve seller identities, sessions, installation UUIDs, device keys, database/media volumes and additive migration data; stop or revert only the reviewed application version when schema-compatible. No destructive migration, volume deletion, production restart, DNS mutation, paid action or merge is authorized by this handoff.

## Evidence snapshot and remaining release inputs

`evidence/p0/resource-only-summary.json` contains only allowlisted resource measurements, with its exact workflow link. `evidence/p0/synthetic-*.png` are clearly labelled synthetic UI contract screenshots at1440/390px; do not treat them as live Resend, TLS or VPS installation proof. Exact final-HEAD CI is recorded in PR171.

The installer has fixed `pair --profile p0-2-2-40`, `fetch-release`, `verify-release`, `install` and `activate-admin` operations. The P0 pair profile is explicit; legacy4/40 preflight is retained for compatibility. `verify-release` outputs a private receipt only after TUF and standard pinned Cosign checks. `fetch-release` requires a paired UUID, protected policy with an independently pinned `artifact_origin`, and an approved catalog `release_bundle` HTTPS URL/SHA256. Downloaded ZIPs are bounded/constrained data only; paths, symlinks, duplicates and executable scripts are denied. No downloaded shell script is executed.

ChatGPT/owner must provide a real approved signed release package (root custody and metadata, image archives+Sigstore bundles), a trusted initial installer/verifier/policy bootstrap, protected catalog/receipt, actual artifact delivery endpoint, official Docker/Compose prerequisites, and verified Resend sender before the complete operational journey can be tested. No fixture root, test receipt or synthetic sender may be promoted to production. `LOCAL_READINESS` is a device report, not central proof that a public storefront, uploaded photo, payments or J&T orders are verified.

New P0 runtime configs do not enable checkout: `SELF_HOSTED_CHECKOUT_APPROVED` is deliberately absent. A later local owner-reviewed payment/shipping release is required to enable transactions. Legacy Gheverhan behavior is preserved. No paid checkout or production J&T order was activated.
