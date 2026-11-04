# Official publisher: owner setup and activation

PUBLIC_SELLER_ONBOARDING_READY: NOT_PROVEN. No production root fingerprint, official image digest or live installer endpoint is asserted. No production operation has occurred.

## Public configuration selected by owner

Registry prefix: `ghcr.io/assyauq26/buattokosendiri`, repositories `app`, `migration`, `control`. Owner must approve namespace, visibility and workflow write access. Sellers load verified archives without a shared PAT.

OIDC issuer: `https://token.actions.githubusercontent.com`. Proposed official identity: `https://github.com/Assyauq26/Gheverhan/.github/workflows/btos-official-release.yml@refs/heads/main`. It becomes evidenced only after an approved actual run signs and standard Cosign verification succeeds.

HTTPS origin: `https://dashboard.buattokosendiri.web.id`; namespace `/bootstrap/`. Policy `artifact_origin` is the origin WITHOUT a path. Existing HTTPS503 does not establish active artifact delivery.

Official initial root SHA256: **NOT_SET**, pending actual offline ceremony and independent verification. Never copy a fixture pin.

## Offline root custody - owner only; not executed

Use a reviewed, physically offline Linux workstation and encrypted storage, with preverified toolchain/module cache. Build audited `agent/cmd/jetseller-root` and `agent/cmd/jetseller-publish` beforehand. Root CLI refuses non-Linux and CI/GITHUB_ACTIONS contexts; this prevents accidental use, not proof of physical isolation/encryption.

On that offline workstation only:

```sh
./jetseller-root init /media/offline-encrypted/btos-root-v1 offline-encrypted-custody
sha256sum /media/offline-encrypted/btos-root-v1/1.root.json
```

Fresh directory0700 contains root-1.pem/root-2.pem/root-3.pem, separate targets-1.pem/snapshot-1.pem/timestamp-1.pem, and public1.root.json; private files0600. Root threshold is2of3. Never overwrite an earlier ceremony. Tool output is a CANDIDATE digest, never an automatically official fingerprint.

Transfer ONLY public root bytes to a second offline verification machine. Compare SHA256 through a separate authenticated channel. Run `jetseller-publish check-root /absolute/private/check.json` using a0600 JSON config containing `Policy.BootstrapRootSHA256`, `Policy.MinimumRootThreshold:2`, and absolute `RootFile`; it verifies signatures/quorum/expiry. Record both independent results and explicit owner approval before adopting the fingerprint. Do not reformat root JSON bytes.

Distribute root keys to distinct offline encrypted custody/recovery media. Root private keys must NEVER enter GitHub secrets, repository, chat, CI artifacts/logs, control-plane or seller VPS. Only ONLINE role keys may be transferred through approved encrypted operational means to protected environment secrets. No private key or API key is requested through chat.

Rotation: reviewed versionN+1 public metadata and future expiry; `jetseller-root rotate /absolute/private/rotation.json offline-encrypted-custody` requires PreviousRoot, CandidateRoot, OutputFile, independently reviewed PreviousRootSHA256/CandidateRootSHA256 and SigningKeys paths presented by offline custodians. Both OLD and NEW quorum must sign. Independently verify the final signed root digest. Publish sequentialN.root.json updates; retain original bootstrap pin. Renew before expiry. Loss of one root key permits recovery using two; loss of quorum requires explicit out-of-band rebootstrap, never silent trust reset.

## Protected workflow and public variables

`.github/workflows/btos-official-release.yml` is workflow_dispatch only, main only, concurrency1/non-cancelling. Environment `btos-release-publisher` must have required reviewers, prevent-self-review, exact main-only custom branch policy (or protected branches with the workflow main-only guard) BEFORE secrets. Dispatch and approval therefore need separate principals. Do not assume an environment is protected merely because a workflow names it.

Job permissions: content/check/action read, package/id-token write. It reads protection metadata and requires the LATEST successful result of all16 named exact-main-SHA checks. Missing, running or failed check refuses publication. Do not dispatch the Helipod production deploy workflow merely to obtain a build check; main pushes already run its build-only path.

Environment variables:

| Variable | Required content |
|---|---|
| APPROVED_GHCR_PREFIX | ghcr.io/assyauq26/buattokosendiri |
| APPROVED_ROOT_SHA256 | Actual independently approved production root digest |
| TUF_PUBLIC_ROOT_JSON | Exact initial public root bytes |
| TUF_ROOT_UPDATES_JSON | Array of sequential signed public root JSON strings; initially `[]` |
| TUF_PREVIOUS_STATE_JSON | Last successful publication state; preserve counters |
| RELEASE_MANIFEST_JSON | Reviewed version/channel/sequence/expiry/schema/compatibility template |
| REVIEWED_COSIGN_SHA256 | Approved existing upstream verifier binary hash below |
| GENESIS_APPROVED_PIN | Actual root pin, first publication only |

Existing pinned upstream Cosignv3.1.4 hash: `424e2c97d0b45fd7a6b608a87f090f35633f4c23ece5f092d48bba11aaf4bbfa`. This is a VERIFIER hash, not a production root fingerprint. Approve before setting its variable.

Only an explicitly approved genesis may use previous state`{}` and dispatch genesis=true with matching actual pin/rootversion1. Remove genesis approval after first success. Never reset state to reuse a sequence.

Manifest template selects actual release_id/app_version/channel, next sequence, real not_before/expires_at, Ubuntu24.04 amd64, protocol/template1, compatible agent/schema bounds, compatible_expand_only and requires_operator_approval=true. Fresh stores require min schema0 and requires_backup=false. Build outputs replace image/config digests and target names; Go validates them. Store updates remain unauthorized by this MVP.

Protected ONLINE secrets: TUF_TARGETS_PKCS8, TUF_SNAPSHOT_PKCS8, TUF_TIMESTAMP_PKCS8. Populate from the corresponding approved private online export using local secret-management tooling. NEVER root-*.pem or fixture keys. Job checks key membership against current root, rejects reused/root keys and removes online signing inputs on its disposable runner.

References: [GitHub environment REST](https://docs.github.com/en/rest/deployments/environments), [OIDC claims](https://docs.github.com/en/actions/reference/security/oidc).

## Publication, then separately approved activation

After explicit integration approval preserve ancestry#154,#164,#170,#171; freeze main SHA and obtain exact checks. No merge has happened here. Owner dispatches official workflow on main with matching release_sha only after review. It verifies independent root before push, builds outside seller VPS, pushes/signs/verifies immutable GHCR images, signs native bootstrap/archives, signs TUF roles, verifies directory AND exact ZIP, stages catalog/state and signed source/image/release manifest. It never generates root keys, activates HTTP or deploys a store.

Archive verification command: `jetseller-setup verify-release-archive --policy /root-private/policy.json --artifact /root-private/release.zip --receipt /root-private/archive-receipt.json`. Receipt binds bundle SHA and length to extracted/TUF/Cosign-verified bytes. `stage-publication.mjs` refuses mismatched ZIPs and independently verifies bootstrap signature. Preserve publication state privately; do not serve it generically.

Immutable bootstrap URLs:

- `/bootstrap/<binarySHA>/jetseller-setup`.
- `/bootstrap/<signatureSHA>/signature.json`.
- `/bootstrap/<policySHA>/policy.json`.
- `/bootstrap/downloads/<opaque-token>` is a private one-use capability, not a permanent ZIP link.

After SEPARATE HTTP activation approval, install verified release data into a NEW `/srv/btos-release/<release-id>-<source-sha>/`. Directory root:1000 mode0750, data files root:1000 mode0440. CONTROL_ARTIFACT_DIR mounts read-only at `/opt/btos/releases`; runtime artifactDirectory uses that path. Catalog is separate, UID1000 mode0400 in runtime secrets and referenced by releaseCatalogFile. Explicitly install permissions after artifact extraction. Never mount publisher keys or serve publication-state files.

Test normal TLS bootstrap SHA/signature, scoped GET/replay/expiry/revocation and exact downloaded ZIP before broad activation. Initial root/verifier pin must be independently supplied; hashes from this same portal alone are not bootstrap trust.

Apply migrations001-005 with separate migration owner. Runtime schemaUSAGE/DML only, no ownership/CREATE. Grant005 stores token hashes only. Agent PoP authorizes one-use capabilities bound to installation/device/manifest/bundle, expiring within120s. Unpair/claim expiry/catalog replacement invalidate them. Failed transfers require new capabilities; routine phase checks mint none. Delivery is bounded64KiB streaming, max2 concurrent responses, max2GiB/20minute transfer timeout. Do not log raw capability URLs.

## Synthetic full VM evidence and public release gate

Full VM workflow attempts browserOTP/wizard, fixture TXT observation, native CLI pairing, verified scoped download, actual Install/ActivateAdmin engine, product/photo, restart/persistence/retry in a monitored clean Ubuntu24.04 2CPU/2GiB/40GB guest. Builds happen outside guest.

Fixture root keys exist only in Go test memory. Sigstore uses the distinct E2E workflow identity, never official production identity. OTP is trusted local HTTPS, not live Resend; TXT observation is labelled synthetic. A test-only Caddy internal-CA template exists ONLY in compiled Go test harness; production CLI has no flag/env route enabling it. TLS clients trust the specific fixture CA and retain certificate checking, without curl-k/global bypass.

PASS requires all stages in full-seller-summary.json, public-product.png and RAM/swap/disk/OOM evidence from actual run. Failure retains failed_stage/checkpoints, not readiness. Resource-only success or adding a workflow is insufficient.

Owner still handles actual capacity, backup/restore, Resend secret placement, public DNS/TLS and approved deployment/smoke. Owner reports4GB RAM/60GB SSD upgrade and capacity preflight PASS (4 November2026), superseding the old capacity blocker. Actual production backup/restore and integrated smoke remain required. Use compose.helipod.yml, retain existing proxy/DB/volumes and dashboard-only503 rollback.

PUBLIC_SELLER_ONBOARDING_READY remains NOT_PROVEN until full engineering evidence, approved real publication, capacity/backup and integrated public normalTLS/realOTP/store smoke pass. Checkout and production J&T stay disabled.
