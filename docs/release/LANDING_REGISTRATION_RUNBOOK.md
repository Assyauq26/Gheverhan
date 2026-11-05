# Landing and registration release

Owner decision: 2026-11-05. Scope is a public contact-registration form and a Git
Clone guide. It creates no central seller account, session, OTP, installation,
agent, license, subscription, or store database. Existing store authentication is
unchanged. Source license: owner-approved Apache-2.0; preserve third-party notices.

## Source and verification

Use the dedicated `feat/btos-landing-registration` PR from current main. Record its
exact SHA and the immutable image ID/archive checksum emitted by the successful
`BTOS landing and registration` workflow. Run the workflow on the integrated main
SHA before delivery. No workflow deploys a server. Download the artifact only from
that successful repository run; verify `source-sha.txt`, `SHA256SUMS`, image ID and
`org.opencontainers.image.revision`. Do not rebuild an image on Helipod.

Tests cover validation, consent, actual PostgreSQL insertion, eight concurrent
identical requests producing one row, conflicting idempotency payload, challenge
replay/expiry, origin, rate limit, separate runtime privileges, browser failures
and retries, no account/cookie creation, and 390/768/1440 layouts.

The old tracked `.postgres/` data is removed from the next Git tree with
`git rm --cached`; files, volumes and Git history are preserved. No assertion is
made that the historical cluster is synthetic or free of sensitive content.
Public instructions use `git clone --depth 1` after the clean tree is merged.
Historical source/data exposure remains an owner security-audit item; do not
rewrite history, publish cluster contents, or rotate unrelated credentials here.

## Infrastructure and isolation

Target: SSH `gheverhan-vps`, IP 43.173.21.197, hostname VM-5-135-ubuntu.
Existing Gheverhan `deploy_app_1`, `deploy_proxy_1`, `deploy_db_1` remain running.
Registration uses only existing dedicated platform DB `jetseller_control_plane`
in `btos-control-db-1`, on private `btos-control_database`. No app tables in the
Gheverhan database are read or changed.

New service: `deploy/registration/compose.helipod.yml`, project
`btos-registration`, CPU 0.35, memory cap 128 MiB, five DB connections, no host
ports, no Docker socket, non-root UID/GID 1000, read-only filesystem. Existing
Caddy reaches `btos-registration-api:3200` through `btos_control_ingress`.

Private directory `/srv/btos-registration/secrets`: UID/GID 1000, mode 0700.
Files `database-url`, `registration-secret`, `proxy-token`: mode 0400, UID1000.
Generate independent 32-byte random secrets locally on the approved server; never
print or commit them. DSN must use role `btos_registration_runtime`, host `db`,
and database `jetseller_control_plane`. The HMAC secret is long-lived: rotating
it invalidates outstanding challenges and old idempotency hashes; coordinate
rotation with a temporary write pause and an explicit migration policy.

Create `btos_registration_owner` NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE.
Create `btos_registration_runtime` LOGIN with independent password and the same
restrictions plus NOINHERIT. Apply `platform/registration/migrations/001_registration.sql`
as the owner role (bootstrap temporarily SET ROLE owner). Owner needs CREATE on
the dedicated database to create the schema; grant runtime CONNECT on that
database explicitly (PUBLIC CONNECT is revoked). Runtime receives no CREATE, schema
ownership, role management, entry DELETE/UPDATE, or access to installer accounts.
Repeat application is additive/idempotent. Do not rotate an existing role password
or overwrite secret files when resuming an interrupted deployment.

## Preflight, backup and activation

1. Reconfirm target IP/hostname, available RAM/disk, container identities, OOM,
   private networks and no host 3200/3100/5432 binding. Record Caddy checksum.
2. Take `pg_dump -Fc` of the dedicated control database. Encrypt the streamed
   backup using existing owner-custodied backup encryption; never emit raw data.
   Back up current Caddy, static landing, and private registration configuration.
3. Verify a disposable restore with matching row counts and schema. Preserve
   backup and named volume; no prune or production restore.
4. Apply role/schema setup, verify runtime cannot DDL, read installer accounts,
   or delete registrations. Load the CI image and check its ID/source label.
5. Set `BTOS_REGISTRATION_IMAGE=sha256:<verified image ID>` and
   `BTOS_REGISTRATION_SECRETS=/srv/btos-registration/secrets` in private env.
   Run `docker compose --env-file <private-env> -f <exact compose> up -d`.
6. Verify internal `/healthz` ready. Verify unauthenticated proxy requests deny.
   No public traffic is routed yet.
7. Prepare exact static artifact with
   `node landing/jetseller/deploy/prepare-release.cjs <SHA> <absolute-new-dir> registration`.
   Verify every manifest hash. Never use retired `limited-preview` mode.
8. Render a private Caddy block using
   `node deploy/registration/render-caddy.mjs <proxy-token-file> <new-private-output>`.
   Replace only the `buattokosendiri.web.id` block. The Caddy wrapper must verify
   all other hostname blocks byte-for-byte; no blind whole-file replacement.
   It overwrites the trusted client-IP header using the direct connection address.
   Do not add a CDN without a separately reviewed trusted-proxy configuration.
9. Validate full candidate with `caddy validate`. Swap the static directory with
   a preserved backup. Write Caddy through its existing bound inode, verify hash,
   then `caddy reload` (no proxy/container restart). This user explicitly approved
   deployment only after relevant checks and review pass.
10. Check HTTPS normally (no `-k`): `/`, `/pendaftaran` direct/reload,
    `/panduan`, `/kebijakan-privasi`; old `/daftar/` -> 308 `/pendaftaran`;
    unknown API/private health -> 404; cross-origin POST ->403. Check Gheverhan200.
11. Owner-approved production fixture: full name `Uji Rilis BTOS`, email
    `m.rifatsyauqii@gmail.com`, brand `Uji Rilis BTOS`, category `Lainnya`, other
    fields blank, explicit privacy consent. Submit once, then repeat same key to
    verify the same reference. Query by reference through authorized DB operator;
    report count/status/reference only, not PII. No email is sent.
12. Preserve evidence including image source, hashes, normal TLS, row count,
    no new installer seller, before/after existing container identities, resource
    use and rollback paths. `LANDING_AND_REGISTRATION_LIVE` requires these checks.

## Rollback and privacy operations

On failed smoke test, restore the backed-up BTOS landing directory and original
Caddy bytes through the same inode; validate/reload. Stop only the new registration
service if needed. Keep the registration schema, all entries and platform volumes;
never restore an older DB over new submissions. Existing Gheverhan is not restarted.

Privacy requests go to owner-approved `m.rifatsyauqii@gmail.com`. Verify the request
from the submitted email. Owner can export/correct/delete a specific registration
using parameterized SQL by reference inside a transaction. Delete associated
`registration.requests` before the entry. Record deletion references privately
and reapply them after a backup restore before opening traffic. Review retained
entries within 12 months. Runtime cleans expired HMAC rate counters hourly and
expired challenge records; no raw IP or form body is logged by this service.

## Honest guide boundary

The repository currently has local self-hosted components and a pairing-based
bootstrap, but no approved standalone Git Clone one-command installer. The public
guide identifies real files and prerequisites, and explicitly forbids deploying
test fixtures or inventing `install.sh`. Registration success means REGISTERED,
not STORE_READY. Do not claim that cloning alone installs a store. A production
seller installation pilot is outside this landing/form scope and still lacks
owner disposable infrastructure. Checkout and production J&T remain disabled.
