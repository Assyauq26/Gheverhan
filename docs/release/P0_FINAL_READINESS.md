# P0 final release readiness

PUBLIC_SELLER_ONBOARDING_READY: NOT_PROVEN

This is an engineering candidate, not merge or production deployment approval.

## Integration chain

Snapshot main: 913d5454bada484f3b6b9319d5b1abfb130c3b23.
Required order is #154 (4f1f25614260d8cc8698495a387b777b2a6596c8) → #164 (13e2b9bfc0f9ff4374b67a309c18e05924a6a65b) → #170 (77c25c361f388b3db0f92a60915c2344ad550252) → #171.
All remain open at audit. main is an ancestor of #171; 37 additional commits before this readiness work. Do not squash or rebase intermediate stacked branches while dependent PRs remain open. After explicit approval, preserve commit ancestry with merge commits in that order, retarget each next PR to main, review the resulting diff and rerun exact-SHA checks. Freeze heads, compare ancestry and tree before every merge; stop on movement/conflict. Never force push or reset main. Existing optional OIDC and legacy resource profiles remain compatibility paths.

## Control-plane deployment candidate

`deploy/control-plane/compose.yml` uses independently stored PostgreSQL data, internal database/proxy networks, outbound email connectivity, memory/pid limits, readiness, readonly secret directories, and only Caddy TCP80/443 host mappings. Backend binds explicitly to0.0.0.0:3100 inside its container; no host3100 or5432 publication. Default non-container bind remains loopback.

Build the control image in CI from the approved exact commit, publish only after review, and set CONTROL_IMAGE to an immutable registry@sha256 reference. The fixture uses a local immutable image ID and never publishes a release. Production image provenance remains a release gate.

Secret layout: CONTROL_DB_SECRETS_DIR contains bootstrap-password, owner-password, runtime-password readable by PostgreSQL UID999; CONTROL_MIGRATION_SECRETS_DIR contains owner-database-url readable only by UID1000; CONTROL_RUNTIME_SECRETS_DIR contains control.json and only runtime DSN, distinct session/agent keys, OTP pepper, Resend key, optional approved release catalog. Files0400, private directories0700 with matching UIDs. Never mount migration/bootstrap credentials into control. Runtime DSN identity js_control_runtime; owner DSN js_control_owner; dedicated database jetseller_control_plane. init.sql runs only on fresh volume; existing clusters require reviewed role provisioning, never volume deletion. Migration001–004 and runtime grants are one transaction. Re-run migration with owner; runtime has DML/USAGE, no schema ownership/CREATE.

Sender is Buat Toko Online Sendiri <otp@buattokosendiri.web.id>. Owner reports domain Verified and real delivery successful; no new live-delivery claim is made by Codex. Provide the existing API key through private secret files only. Test live registration/session on the actual deployed control-plane before enabling public redirects. Current socket-IP limits aggregate clients behind a reverse proxy; capacity and a reviewed trusted-proxy identity strategy remain necessary before broad public onboarding.

## Release and E2E blockers

Signed package verification/fetching exists, but the official publisher, independent production trust-root custody, immutable signed application/archive publication and real catalog receipt still require completion and verification. Never promote test roots or synthetic signatures. No official release artifacts were published in this task.

Full2CPU/2GiB/40GB VM journey through the NEW installer, local admin, real product/photo publication, restart and persistence: NOT_TESTED. Existing QEMU resource-only evidence and component provisioning do not establish this gate. Resend delivery reported by owner does not prove the integrated browser journey. PUBLIC_SELLER_ONBOARDING_READY remains NOT_PROVEN until one exact release passes that journey and external HTTPS verification.

## Limited operational plan (review only)

Before deployment, record exact image/source SHA and independently verified release hashes, back up control PostgreSQL via pg_dump with owner-controlled credential files, encrypted secret/key backup, and record checksums without printing secrets. Restore into a new disposable database and verify seller/installation ownership before acceptance. No backup/restore was performed here.

Validate Compose interpolation and Caddy config first. On an approved control-plane target only: start DB; run owner migration; require successful exit and verify runtime denied DDL; start control and check private health plus /auth/status; validate the limited dashboard.buattokosendiri.web.id Caddy route and public TLS normally. Preserve existing unrelated Caddy routes. Never use Gheverhan production as a target.

Smoke: registration with live OTP, immediate wizard, returning login, logout revocation, cross-seller denial, TXT ownership, PoP pairing, verified download/install, local admin claim, public product/photo, restart persistence. Capture exact SHA, timings, RAM/swap/disk/OOM and public TLS chain. Checkout and J&T remain disabled.

Rollback: stop onboarding traffic, retain all database/media/Caddy volumes and keys, return to the last approved image only if additive schema compatible, run smoke again. Do not roll back identity data or replay consumed OTPs by restoring a stale database casually. Database restore is a separately approved recovery procedure; no down migrations, prune or volume deletion.
