# P0 ChatGPT operational handoff

## Current execution authorization and trust model

Owner has authorized production publication/deployment/routes/migrations and public onboarding only after production acceptance. Owner subsequently removed the application TUF/root ceremony process. Production now uses policy2 `keyless-v2`, protected GitHub Actions OIDC/Cosign and source-bound signed metadata. No root key/fingerprint or online TUF secrets are required. Root/TUF prerequisites and pre-integration status statements below are historical; use the current PR/workflow execution evidence for exact SHA and actual digests. Preserve all isolation, secret-file, backup, migration, Caddy coexistence and rollback procedures below.

Do not declare LIVE until actual signed artifacts are available and real OTP/domain/pairing/installation/admin/product/media/restart checks pass. No new expenditure, data deletion, weakening of authentication/signatures, or unvalidated checkout/J&T activation is authorized. Existing Gheverhan remains running. First publisher dispatch uses actual approved main SHA, `genesis=true`, version1.0.0/stable; retain protected environment reviewer separation. Follow the keyless section at the start of P0_OFFICIAL_PUBLISHER_HANDOFF.md, not the superseded root ceremony.

Current final audit: [P0_PRE_MERGE_AUDIT.md](P0_PRE_MERGE_AUDIT.md). Main remains913d5454bada484f3b6b9319d5b1abfb130c3b23. New release safety repairs must pass exact-HEAD CI before owner review. PRE_MERGE_READY is blocked by main's squash-only ruleset; no merge approval has been received. The14/16 CI proof at41a3152d and run41817017471 is the audited baseline, not a substitute for repair-HEAD checks.

PUBLIC_SELLER_ONBOARDING_READY: NOT_PROVEN. No merge or production access/deployment/restart/DNS/firewall/SSH change is authorized by this document. Checkout and production J&T stay disabled.

Authoritative current publisher/root/grant procedure: [P0_OFFICIAL_PUBLISHER_HANDOFF.md](P0_OFFICIAL_PUBLISHER_HANDOFF.md). It contains owner decisions, offline ceremony/recovery/rotation, protected environment variables/secrets, exact-source GHCR/OIDC publishing, scoped HTTPS activation and E2E evidence limits. No actual production root fingerprint or official image digest exists yet.

## Runtime configuration

Use a dedicated control PostgreSQL database, never Gheverhan commerce/customer DB or session. Service reads JETSELLER_CONTROL_CONFIG_FILE and private referenced files. All runtime private files UID1000 mode0400; private parent directory0700. Separate migration directory contains owner-database-url UID1000 mode0400. DB bootstrap/owner/runtime password files UID999 mode0400. Runtime receives no migration/bootstrap credential.

- controlOrigin: https://dashboard.buattokosendiri.web.id.
- listenHost:0.0.0.0 inside the PRIVATE container only; port3100 has no host mapping. Non-container default remains loopback.
- databaseUrlFile: dedicated runtime DSN file; database jetseller_control_plane, role js_control_runtime.
- signingKeyFile: independent Ed25519 agent credential key.
- authMode:email_otp, with emailAuth.resendApiKeyFile, otpPepperFile (independent32byte hex), sessionSigningKeyFile (separate Ed25519 key), and from=`Buat Toko Online Sendiri <otp@buattokosendiri.web.id>`.
- releaseAccess:{mode:"closed"} for initial deployment. Missing mode defaults closed. Pilot uses mode:"pilot" and pilotTokenFile:/etc/buattokosendiri/pilot-proxy-token, a separate private64hex random credential. Public requires explicit mode:"public" after final owner approval. The credential is injected only by the private pilot proxy block, never in browser JS/URLs or identity/session claims.
- releaseCatalogFile: separately protected approved publication catalog, absent means no release available.
- artifactDirectory:/opt/btos/releases; CONTROL_ARTIFACT_DIR is a NEW approved release-data directory mounted readonly. Public data root:1000 mode0440, directory0750; no publisher keys or raw grant tokens.

Resend is delivery only. Owner reports Verified domain and actual inbox delivery; integrated deployed signup is still a separate smoke gate. Never ask for or place API key values in chat/source/reports. No external OIDC provider is required. Local store admin session/cookie remains independent.

Apply additive001-005 through js_control_owner; do not reinitialize existing volumes. Runtime gets USAGE/DML but no schema ownership/CREATE. Verify runtime denial of CREATE using deploy/control-plane/verify-runtime.mjs. Health checks DB/schema; public Caddy denies /healthz. Scoped grant table005 contains only token hashes.

## Helipod coexistence and capacity

Use deploy/control-plane/compose.helipod.yml ONLY on shared Helipod; standalone compose.yml contains its own Caddy and is not suitable there. Dedicated DB/volume/secrets/networks; no public3100/5432. Existing proxy retains its networks and connects only to dedicated INTERNAL btos_control_ingress; upstream btos-control-api:3100. Never join the Gheverhan DB network.

Owner update (4 November2026): Helipod upgraded to4GB RAM/60GB SSD and capacity preflight PASS. This supersedes the old2GB/9GB audit; capacity is no longer an outstanding blocker based on that old report. A subsequent authorized read-only audit independently observed 3.6GiB physical RAM, 2GiB unused swap, 2970996KiB MemAvailable and 30219276288 free Docker-filesystem bytes; existing proxy/app/DB remained running with zero restarts/OOM. Retain the normal read-only preflight immediately before an approved installation; do not reduce limits or build on production.

After FINAL owner approval only:

1. Privately back up exact Caddy config/checksum, network/container IDs, dedicated DB/secrets; verify encrypted disposable restore. Record approved immutable CONTROL_IMAGE and source SHA.
2. Inspect/create dedicated internal ingress network. Attach only deploy_proxy_1 while retaining all existing networks; no proxy restart. Review helipod-proxy-network.yml for persistent source configuration.
3. Validate Compose; start dedicated DB; run migration owner; verify runtime cannot CREATE; start control and private health. Do not alter Gheverhan DB/volume or reinitialize an existing control database.
4. Verify private credentialless /auth/status says method=email_otp, configured=false, release_mode=closed and null login/registration links. After separately approved pilot admission, an admitted request must say configured=true. Activate verified artifact directory/catalog only after separate publication and transfer checks.
5. Apply ONLY dashboard.Caddyfile.diff against actual live dashboard503 block, validate full Caddyfile, then separately approved reload. Preserve all other hostnames/certificate volumes.
6. Smoke normal public TLS without -k, real OTP registration/immediate wizard, returning OTP, logout revocation, cross-seller denial, TXT, PoP pairing, scoped download, local admin/product/photo/restart. Record exact source/image/release SHA and actual results.
7. Rollback only dashboard to saved503 block, validate/reload after approval; retain all volumes/keys/UUIDs. Never stop/replace Gheverhan proxy/app/DB, prune volumes or restore stale identity data casually.

CI coexistence/backup/503 rollback evidence is synthetic disposable evidence. Capacity was owner-reported and independently checked read-only; actual encrypted production backup/disposable restore evidence remains an operational gate.

## Final gate boundaries

Full synthetic VM E2E workflow must actually finish every stage and report resources; adding it or passing component tests is insufficient. Its fixture OTP/DNS/local CA and test-only Caddy template must never be called live Resend/public ACME or official production root evidence. Actual official publication/HTTP activation and integrated public smoke require separate approvals. See linked current publisher handoff for all setup inputs and commands.

## Publisher environment audit

Read-only GitHub audit confirms btos-release-publisher exists, requires an independent reviewer with prevent-self-review, and has exactly one custom deployment policy: branch main. Workflow/input validation must use this actual environment and accept only that exact main-only policy (or protected-branches policy with existing main-only workflow guards). No environment secrets or variables were configured at the audit snapshot. Owner must privately supply the listed ONLINE TUF role keys and approved public variables in the publisher handoff; offline root keys must never enter GitHub. No environment configuration was changed by this audit.

## Engineering evidence snapshot

Full synthetic seller journey PASS at89d4fcb792900b5f5f830ba1f0e00cfae6e9d765: run41810599049, artifact13312103804; repository evidence docs/release/evidence/p0/full-vm-89d4fcb7.json. This includes real Docker29 dual-layout image identification, DB/migrations, local admin, product/photo, restart and persistent inventory/media/session. OOM0, swap0. It does not attest official artifacts, public ACME, real Resend integration or sustained capacity. Require all latest exact-final-SHA CI checks after the final CI repairs before approval. Manual Helipod validation must use build_only=true; never use a deploy confirmation to obtain a build check.

## Gate A: exact owner actions before any merge

Ruleset25111842 currently permits squash only despite repository-level merge support. Review main-ruleset-merge-proposal.json: only allowed_merge_methods changes to ["merge"], no bypass/check/approval protection is removed. AFTER explicit policy approval, refetch the current ruleset; stop if any audited condition/rule changed. Apply the reviewed proposal through GitHub settings or `gh api --method PUT repos/Assyauq26/Gheverhan/rulesets/25111842 --input docs/release/main-ruleset-merge-proposal.json`. Do not use admin bypass or disable protection.

AFTER separate merge approval, preserve154→164→170→171. Mark each draft ready only as it is reviewed. Use `gh pr merge NUMBER --merge --match-head-commit APPROVED_HEAD`, never squash/rebase/delete source branches. Retarget only the next PR to main after the previous merge. Recheck heads/CI/review threads and compare merge parents/tree after every step; stop on unexpected changes. Expected lower heads are recorded in P0_PRE_MERGE_AUDIT.md; final171 SHA must be taken from the reviewed repair-HEAD report.

Freeze the NEW main SHA after all four merges. Dispatch relevant manual workflows on main to obtain all16 exact-source checks. `gh workflow run helipod-autodeploy.yml --ref main -f build_only=true` performs build-only; do not supply a production deploy confirmation. Only then can main-only publisher validation succeed. Integration approval does not approve signing/push/HTTP activation.

## Private setup and deployment proposal (not executed)

Target:43.173.21.197 only for central control, existing /opt/gheverhan/deploy/Caddyfile. Audited checksum9eae91383254cccb5e29f20a1beb2250026f8ac15900bdcc0253e54ba733e8b7; retain a timestamped private backup and compare immediately before an approved change. Existing deploy_proxy_1/app_1/db_1 remain running. Never run the seller installer on this shared host.

Suggested new private directories: /srv/btos-control/runtime UID1000 mode0700, /srv/btos-control/migration UID1000 mode0700, /srv/btos-control/db UID999 mode0700. Runtime files0400: control.json, control-database-url, agent-signing-key.pem, session-signing-key.pem, otp-pepper, resend-api-key, and pilot-proxy-token only when pilot is selected. Migration contains only owner-database-url0400. DB directory contains bootstrap-password, owner-password, runtime-password0400. Read keys from the owner's private store; create independent runtime keypairs/pepper/admission credential on the approved setup host, never fixture inputs. Root TUF ceremony is different and remains offline. Verify `stat -c '%u %a %n'` on these paths; do not cat secret contents or run docker-inspect Env.

Copy the example control JSON privately, retaining closed mode; set dedicated runtime DSN, official release catalog path and readonly artifactDirectory only after verified publication. A catalog absent in preview is intentional. Agent/session public-key equality is now rejected even if PEM formatting differs.

AFTER deployment approval identifies exact official CONTROL_IMAGE@sha256 and target, set CONTROL_IMAGE, CONTROL_RUNTIME_SECRETS_DIR, CONTROL_MIGRATION_SECRETS_DIR, CONTROL_DB_SECRETS_DIR and CONTROL_ARTIFACT_DIR in the operator's private shell. Define `dc() { docker compose -f deploy/control-plane/compose.helipod.yml "$@"; }`. First run read-only coexist-preflight.sh and `dc config --quiet`; check there are no host3100/5432 mappings. A readonly private-config check can run the approved image with network none, read-only runtime mount and `node --input-type=module -e "import {runtimeConfig} from './src/runtime.mjs';const c=await runtimeConfig('/etc/buattokosendiri/control.json');console.log(c.authMode,c.releaseAccess.mode)"`; it prints enums only.

After approved backup/restore evidence, create the dedicated INTERNAL btos_control_ingress if absent. Connect only existing proxy, retaining deploy_default; persist helipod-proxy-network.yml without recreating the live proxy. Then `dc up -d --wait db`, `dc run --rm migrate`, `dc run --rm migrate` for idempotency, `dc up -d --wait control`; verify-runtime.mjs asserts no runtime CREATE privilege. Runtime sees no owner credentials. Public dashboard stays503; private /healthz must return200. Closed /auth/status reports method=email_otp, configured=false and null links: closed admission is intentional, not an email configuration failure.

## Pilot admission and public activation are separate approvals

Prerequisites: approved official artifacts/root, central deploy/backup, one real seller email, owner-supplied browser public IP and disposable Ubuntu24.04 seller VPS/IP/domain. Standard wizard uses production4GiB/40GiB preflight. Earlier2GiB Tencent/CI experiments do not certify that profile; shared Helipod cannot be used as the seller VPS. Provisioning/resizing any paid VPS requires its own approval.

Prepare an independent pilot-proxy-token privately (32random bytes encoded as64hex), UID1000 mode0400; no token through chat. After pilot deployment approval, set private control.json releaseAccess to pilot with its file and restart ONLY control. Generate a NEW private proposal with `node deploy/control-plane/render-pilot-caddy.mjs /private/pilot-proxy-token /private/dashboard-pilot.Caddyfile BROWSER_IP SELLER_VPS_IP`. It prints no credential and refuses wildcard/CIDR admission. The proposal contains a secret header and must stay0600 outside the repo/logs; do not print adapted Caddy JSON or enable header logging. Renderer never reloads or edits production.

Review that only dashboard hostname is replaced. Validate full Caddy configuration privately, compare saved checksum and container/network IDs, then request the explicit reload approval. Allowed IPs receive the injected admission credential; every other address gets503. /healthz remains hidden. A browser-supplied forged header does not override the proxy value. Admission never bypasses OTP, session, CSRF, seller ownership, PoP, scoped grants, TUF or Cosign. Keep landing portal-config enabled=false during the pilot; open the dashboard URL directly from the admitted browser.

The real pilot must use actual Resend inbox delivery, public TXT and trusted public ACME TLS, an actual product photo, official archive/bootstrap digests and all21 acceptance steps in the owner's release instruction. Record release/source/image hashes and before/after DB/inventory/media/session observations. No synthetic root, local CA,1pixel fixture or screenshots from CI count as this pilot.

Only after the complete matrix passes and GO-LIVE approval is recorded: change central private releaseAccess mode to public and separately approve the control-only restart; use dashboard.Caddyfile.diff (strips the pilot header) after full-config validation and approved Caddy reload. Explicitly approve landing portal-config activation. Remove/rotate the temporary pilot credential privately. No automatic public switch exists.

## Backup, restore and rollback gates

Production backup is not performed by this audit. Before any approved install/change, operator must privately record Caddy/config/image/container/network checksums and a consistent existing Gheverhan DB backup using its authorized backup role. Use PostgreSQL pg_dump custom format for MVCC consistency, not a tar of live PGDATA. Stream directly into approved encryption (for example age with an approved public recipient) and verify the encrypted backup is restorable on a separate disposable database; do not put credentials/dumps in GitHub artifacts or chat. Never restore onto deploy_db_1.

For the new control database, after creation use `dc exec -T db pg_dump -U control_bootstrap -d jetseller_control_plane -Fc` streamed to private encrypted storage. Restore ONLY into a new named disposable DB/volume, verify schema001–005, seller/installation counts and runtime DDL denial, with all outbound email and public ingress disabled. Preserve private session/agent/pepper files in a separate encrypted backup; restoring stale identity state requires explicit reconciliation, not blind rollback. Existing CI proves disposable control backup/restore, not actual operational production backup.

For pilot-store DB/media consistency, quiesce writes on that disposable store, back up PostgreSQL via pg_dump and its media/config/identity consistently into encrypted storage, then restore into separate quarantined volumes/VPS with no active duplicate agent, mail or checkout/J&T. Verify product, stock, actual image hash and installation identity before considering restore acceptance PASS. Never delete or overwrite the original volumes. Record exact restore and rollback evidence, not just backup-file existence.

Rollback dashboard FIRST to the saved503 block, validate and use the separately approved reload. Leave all DB/media/secrets and existing Gheverhan containers untouched. Restore the prior verified control image only after schema compatibility review; additive migrations are not reversed by deleting tables. Close control releaseAccess and keep landing enabled=false. Pilot failure does not authorize restoring Gheverhan or rebooting the host.

## LIMITED PREVIEW alternative

If official release/pilot approvals cannot finish today, prepare locally: `node landing/jetseller/deploy/prepare-release.cjs EXACT_REVIEWED_SHA ABSOLUTE_NEW_OUTPUT_DIRECTORY limited-preview`. This produces an immutable hash manifest, visible preview notice, disabled portal configuration and no public installer; it performs no network/deploy operation. It explicitly says registration and automatic store installation are unavailable to the public. Deployment of this static proposal still needs separate target/checksum approval. Keep dashboard503 and control closed. LIMITED_PREVIEW_PREPARED is not PUBLIC_SELLER_ONBOARDING_READY.
