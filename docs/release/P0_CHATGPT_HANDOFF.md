# P0 handoff â€” Buat Toko Online Sendiri

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
| OTP adapter and direct-session UX | READY (code/fixture scope) | Real PostgreSQL/HTTPS transport OTP + browser + real Go pairing passed at code402705bf (runs41774960048/41774960472/41774960087); fixture delivery is not live Resend inbox proof |
| Production Resend and sender DNS | BLOCKED | Operational configuration and real delivery verification required |
| Session/CSRF/owner isolation/re-auth | READY (code/fixture scope) | Revocable PostgreSQL sessions; one-use HMAC OTP, 10-minute TTL, five attempts, cooldown/IP/email limits |
| Verified domain claim | READY (code/fixture scope) | Typed/pairing domain intent alone is nonexclusive; fresh TXT proof acquires a limited lease |
| Real CLI pairing | READY (code/fixture scope) | OTP browser consent plus real Go CLI, preserving key/UUID binding |
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


Fresh self-hosted appearance uses the authorized installation display name (maximum100characters) via private `JETSELLER_STORE_DISPLAY_NAME`; missing configuration uses neutral Toko Anda branding. Existing published merchant appearance remains authoritative and legacy-profile branding is preserved. Installer checkpoints bind the initial display name and reject a changed name during resume rather than rewriting an existing installation.

Registry integration files share one dedicated schema and each exercises additive DDL/migration idempotency. They run sequentially to prevent one suite migrating tables while another holds business transaction locks. Each suite's concurrent request assertions remain concurrent, including double domain verification and OTP replay/consumption races.


## Final sprint: Helipod coexistence (review only)

Use `deploy/control-plane/compose.helipod.yml` ONLY for coexistence. It has no Caddy service or published port. Standalone compose.yml remains for independent hosts and must never be used for Helipod rollout. Topology: existing proxy → dedicated external INTERNAL network btos_control_ingress → btos-control-api:3100 → private database network → dedicated control DB. Existing proxy retains its original network and Caddy volumes; control never joins the Gheverhan database network.

Capacity is BLOCKED for the last reported host without fresh evidence: existing limits512+900+128=1540MiB, new runtime384+256=640MiB, total2180MiB before OS; migration adds192MiB. Swap2GB is not extra physical RAM. Read-only coexist-preflight.sh requires896MiB currently available and12GiB Docker-filesystem free (6GiB images/pull/update,1GiB initial DB,1GiB logs,4GiB reserve). Reported9GB free is insufficient. Do not install until capacity is reviewed; no existing service limits may be reduced automatically. Do not build images on Helipod.

After explicit final approval ONLY, operational sequence:
1. Back up the exact current Caddyfile and its checksum privately; record existing proxy container ID/networks, control DB backup/restore evidence and approved immutable CONTROL_IMAGE.
2. Validate config with Compose using production private paths (never print interpolated secrets). Initialize only the dedicated control volume; existing DB bootstrap is never altered.
3. Create network `docker network create --internal btos_control_ingress` if absent after inspecting its driver/internal flag. Attach ONLY the existing proxy via `docker network connect btos_control_ingress deploy_proxy_1`; retain every existing network. This does not require restarting proxy. Review helipod-proxy-network.yml for persistence in the existing Compose source; do not recreate it automatically.
4. `docker compose -f deploy/control-plane/compose.helipod.yml up -d --wait db`; `... run --rm migrate`; `... up -d --wait control`. Run verify-runtime.mjs via stdin from the runtime container (DML yes, schemaCREATE no). Secret files/UID1000 and PostgreSQL UID999 remain as documented above; never mount owner/bootstrap credentials in control.
5. From existing proxy, check credentialless private /auth/status. Apply ONLY dashboard.Caddyfile.diff after matching the actual live dashboard503 block, validate the entire copied Caddyfile with existing Caddy, and obtain approval for limited reload. Never replace other hostnames or certificate storage. No Codex production operation has occurred.
6. Smoke normal TLS without -k, real OTP/session/wizard, isolation/logout, pairing and store admin. Record actual run/host/source/image digests. Do not enable checkout/J&T.
7. Rollback only dashboard hostname to its saved503 block, validate/reload after approval; stop control application if needed, preserve dedicated DB and all other volumes. Keep proxy attached until safe removal is separately reviewed. Never stop Gheverhan app/db/proxy.

## Official publisher inputs required (no secrets in chat)

Owner/ChatGPT must approve: OCI registry and repository write scope; release HTTPS origin and immutable object path convention; exact Sigstore OIDC issuer + workflow certificate identity; independent initial root SHA256 distribution channel; offline root quorum custody (minimum2) and approved online role public keys; online signer files or isolated signing service access; prior trusted publication state/sequence. Provision private keys through protected runner storage, not source/PR/chat. An initial empty publication state is permitted only for an explicitly approved genesis. Update state only after successful immutable publication; never reset it to reuse a version.

Tooling now includes jetseller-publish (online TUF metadata, self-verifies against pinned root and previous state), deploy/release/build-candidate.sh (exact-source OCI build/push, immutable digest/config IDs, archive signing and standard Cosign verify), prepare-manifest.mjs (binds approved manifest template to built digests), package-candidate.mjs (constrained ZIP after private verification receipt). These are candidate tools, not evidence that official artifacts exist. No root/private key or production signature has been generated, and the build/push script has NOT been executed.

On an approved isolated publisher runner: build pinned Go CLI; supply protected JSON publication configuration with Policy, RootFile, ManifestFile, PreviousStateFile, ArtifactDirectory, OutputDirectory, Version and Keys{targets,snapshot,timestamp}; each signer is approved Ed25519 PKCS8 private file0400/0600. Supply independently pinned Cosign binary/path/SHA and exact signer identity. Build candidate only with RELEASE_OWNER_APPROVED=signed-candidate-build, exact RELEASE_SOURCE_SHA, approved RELEASE_IMAGE_REPOSITORY, RELEASE_COSIGN_PATH/SHA256 and RELEASE_SIGNER_IDENTITY/ISSUER. This command writes registry images, so requires publisher approval even though it does not deploy a store.

Generate the manifest using the approved version/channel/schema/compatibility template and actual build outputs; sign metadata with jetseller-publish. Assemble metadata plus the four exact signed artifacts in a protected directory. Run the existing root-owned jetseller-setup verify-release using independently pinned policy/Cosign, then package-candidate with its receipt. Upload only after review to an immutable HTTPS object. Do not publish candidate-state.json, private key paths/files or credentials. Verify remote download hash, signature and full metadata chain using seller installer before activating the protected release catalog. Initial installer binary signature/root bootstrap and limited per-device download grant delivery are STILL incomplete operational/publisher gates; a shared permanent URL must not be called a limited grant.

## Required final gate status

PUBLIC_SELLER_ONBOARDING_READY: NOT_PROVEN. Official signing/publication and full NEW installer2/2/40 journey remain BLOCKED. No app/media restart or publicTLS claim may be inferred from control database-only coexistence/restore fixtures. Real Resend delivery is owner-reported; live deployed onboarding remains unverified. Exact final-head checks are required after these code changes. Checkout/J&T remain disabled.
