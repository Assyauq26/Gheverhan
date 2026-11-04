# P0 ChatGPT operational handoff

PUBLIC_SELLER_ONBOARDING_READY: NOT_PROVEN. No merge or production access/deployment/restart/DNS/firewall/SSH change is authorized by this document. Checkout and production J&T stay disabled.

Authoritative current publisher/root/grant procedure: [P0_OFFICIAL_PUBLISHER_HANDOFF.md](P0_OFFICIAL_PUBLISHER_HANDOFF.md). It contains owner decisions, offline ceremony/recovery/rotation, protected environment variables/secrets, exact-source GHCR/OIDC publishing, scoped HTTPS activation and E2E evidence limits. No actual production root fingerprint or official image digest exists yet.

## Runtime configuration

Use a dedicated control PostgreSQL database, never Gheverhan commerce/customer DB or session. Service reads JETSELLER_CONTROL_CONFIG_FILE and private referenced files. All runtime private files UID1000 mode0400; private parent directory0700. Separate migration directory contains owner-database-url UID1000 mode0400. DB bootstrap/owner/runtime password files UID999 mode0400. Runtime receives no migration/bootstrap credential.

- controlOrigin: https://dashboard.buattokosendiri.web.id.
- listenHost:0.0.0.0 inside the PRIVATE container only; port3100 has no host mapping. Non-container default remains loopback.
- databaseUrlFile: dedicated runtime DSN file; database jetseller_control_plane, role js_control_runtime.
- signingKeyFile: independent Ed25519 agent credential key.
- authMode:email_otp, with emailAuth.resendApiKeyFile, otpPepperFile (independent32byte hex), sessionSigningKeyFile (separate Ed25519 key), and from=`Buat Toko Online Sendiri <otp@buattokosendiri.web.id>`.
- releaseCatalogFile: separately protected approved publication catalog, absent means no release available.
- artifactDirectory:/opt/btos/releases; CONTROL_ARTIFACT_DIR is a NEW approved release-data directory mounted readonly. Public data root:1000 mode0440, directory0750; no publisher keys or raw grant tokens.

Resend is delivery only. Owner reports Verified domain and actual inbox delivery; integrated deployed signup is still a separate smoke gate. Never ask for or place API key values in chat/source/reports. No external OIDC provider is required. Local store admin session/cookie remains independent.

Apply additive001-005 through js_control_owner; do not reinitialize existing volumes. Runtime gets USAGE/DML but no schema ownership/CREATE. Verify runtime denial of CREATE using deploy/control-plane/verify-runtime.mjs. Health checks DB/schema; public Caddy denies /healthz. Scoped grant table005 contains only token hashes.

## Helipod coexistence and capacity

Use deploy/control-plane/compose.helipod.yml ONLY on shared Helipod; standalone compose.yml contains its own Caddy and is not suitable there. Dedicated DB/volume/secrets/networks; no public3100/5432. Existing proxy retains its networks and connects only to dedicated INTERNAL btos_control_ingress; upstream btos-control-api:3100. Never join the Gheverhan DB network.

Owner update (4 November2026): Helipod upgraded to4GB RAM/60GB SSD and capacity preflight PASS. This supersedes the old2GB/9GB audit; capacity is no longer an outstanding blocker based on that old report. The agent has not accessed production to independently repeat the operational audit. Retain the normal read-only preflight before an approved installation; do not reduce limits or build on production.

After FINAL owner approval only:

1. Privately back up exact Caddy config/checksum, network/container IDs, dedicated DB/secrets; verify encrypted disposable restore. Record approved immutable CONTROL_IMAGE and source SHA.
2. Inspect/create dedicated internal ingress network. Attach only deploy_proxy_1 while retaining all existing networks; no proxy restart. Review helipod-proxy-network.yml for persistent source configuration.
3. Validate Compose; start dedicated DB; run migration owner; verify runtime cannot CREATE; start control and private health. Do not alter Gheverhan DB/volume or reinitialize an existing control database.
4. Verify private credentialless /auth/status says configured email_otp. Activate verified artifact directory/catalog only after separate publication and transfer checks.
5. Apply ONLY dashboard.Caddyfile.diff against actual live dashboard503 block, validate full Caddyfile, then separately approved reload. Preserve all other hostnames/certificate volumes.
6. Smoke normal public TLS without -k, real OTP registration/immediate wizard, returning OTP, logout revocation, cross-seller denial, TXT, PoP pairing, scoped download, local admin/product/photo/restart. Record exact source/image/release SHA and actual results.
7. Rollback only dashboard to saved503 block, validate/reload after approval; retain all volumes/keys/UUIDs. Never stop/replace Gheverhan proxy/app/DB, prune volumes or restore stale identity data casually.

CI coexistence/backup/503 rollback evidence is synthetic disposable evidence. Capacity PASS is owner-reported; actual encrypted production backup/disposable restore evidence remains an operational gate.

## Final gate boundaries

Full synthetic VM E2E workflow must actually finish every stage and report resources; adding it or passing component tests is insufficient. Its fixture OTP/DNS/local CA and test-only Caddy template must never be called live Resend/public ACME or official production root evidence. Actual official publication/HTTP activation and integrated public smoke require separate approvals. See linked current publisher handoff for all setup inputs and commands.

## Publisher environment audit

Read-only GitHub audit confirms btos-release-publisher exists, requires an independent reviewer with prevent-self-review, and has exactly one custom deployment policy: branch main. Workflow/input validation must use this actual environment and accept only that exact main-only policy (or protected-branches policy with existing main-only workflow guards). No environment secrets or variables were configured at the audit snapshot. Owner must privately supply the listed ONLINE TUF role keys and approved public variables in the publisher handoff; offline root keys must never enter GitHub. No environment configuration was changed by this audit.
