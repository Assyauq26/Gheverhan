# P0 final audit and merge gate — 4 November 2026

PRE_MERGE_READY: BLOCKED_OWNER_POLICY until the squash-only main ruleset is changed after approval and final repair-HEAD CI succeeds. Audit approval is not merge/publish/deploy approval. No production operation follows automatically from this report.

Audited starting candidate:41a3152dcdde667dffe56a5aaaa9e5228a22e836 (14 workflows/16 checks SUCCESS; full synthetic VM run41817017471 PASS). This document accompanies the final security/rollout repairs; the final exact SHA/tree/check results are recorded in PR171 and the execution report. Do not reuse the starting candidate's CI for the repair commit.

## Stack and integration

| Ref | Frozen audit head |
|---|---|
| main | 913d5454bada484f3b6b9319d5b1abfb130c3b23 |
| PR154 | 4f1f25614260d8cc8698495a387b777b2a6596c8 |
| PR164 | 13e2b9bfc0f9ff4374b67a309c18e05924a6a65b |
| PR170 | 77c25c361f388b3db0f92a60915c2344ad550252 |
| PR171 audited baseline | 41a3152dcdde667dffe56a5aaaa9e5228a22e836 |

Each row is an ancestor of the next. Baseline stack against main:328 files,18676 additions,332 deletions. Read-only merge-tree simulation has no conflict and equals the candidate tree dba24a9ef37c8f23a04575029e79fd4b64932805. Recompute against the final remediation head; do not treat this baseline tree as the final tree.

Other open PR heads are generally not ancestors: their features were ported into combined commits rather than merged individually. Required P0 runtime/readiness/backup/admin/registry/pairing/domain/J&T sandbox/renewal surfaces from141,143–153,158–159,161–163 are present; some differ through subsequent security/OTP fixes. PR155's old artifact workflow is superseded by monitored full-VM CI. PR156's Harbor broker and PR157's alternate lifecycle schema are intentionally not imported: current release uses owner-selected GHCR plus one-use archive grants and current control registry/PoP refresh/domain modules. Do not merge these older conflicting branches merely to make their heads ancestors. No additional PR is required for the tested P0 wizard journey. Historical unrelated UI/security PRs are outside this integration.

Main ruleset25111842 is ACTIVE, protects the default branch, blocks deletion/non-fast-forward, requires PR/thread resolution and unit-tests from GitHub Actions. It has no bypass actors and requires0 GitHub approvals; explicit owner release approvals still apply. Its allowed_merge_methods is currently only squash. Repository-level allow_merge_commit is true, but does not override this ruleset. All four PRs are draft and have no unresolved review threads at audit time.

Proposed exact policy change: main-ruleset-merge-proposal.json changes only allowed_merge_methods to merge, preserving all security/check/bypass settings. Owner must approve, refetch and compare current policy with the audited state before applying; stop if it changed. Do not disable the ruleset, bypass checks or use --admin.

After separate merge approval: ready PR154, merge with --merge and --match-head-commit; retarget164 to main, then170, then171 in that order after each preceding merge. Preserve source branches. At each step fetch main, verify merge parents (previous main and the approved PR head), compare result tree with the approved PR tree, and stop on an unexpected head/tree/conflict. Existing main and every stack prefix already gate production SSH deployment behind explicit manual dispatch; main push builds only. No automatic publisher/deployment is authorized by merging.

After the four merges, freeze the resulting NEW main SHA and run all16 relevant checks there (Helipod build_only=true). PR-head success does not prove a new merge commit. Only then can the main-only official publisher pass its source/check gate.

## Audit findings repaired in this revision

- Release admission was only a Caddy503 convention. Runtime now defaults closed; a valid private pilot proxy credential admits only the IP-restricted pilot route, while all normal session/CSRF/PoP checks still run. Public requires explicit private mode change and separate approval. Landing portal-config remains disabled.
- Agent/session key independence used PEM string equality. A regression demonstrated the same key with an extra newline was accepted. Public SPKI bytes are now compared in both email and optional OIDC modes.
- Production CLI exposed an obsolete disposable-fixture command/flags. They are removed; marked fixtures remain in Go test binaries. No fixture trust root/local CA is compiled as a production trust default.
- Wizard previously generated the experimental2GiB pairing profile. It now explicitly uses the existing production4/40 profile; full synthetic VM retains its explicit isolated P0 profile. Production minima are unchanged.
- Dedicated control DB health uses TCP, excluding the temporary init server.

Targeted tests cover closed/pilot/public transitions, no denied-request DB/mail/artifact work, wrong pilot credentials, guarded identity, cryptographic key reuse rejection, fixture CLI rejection, public wizard commands and pilot proxy IP restrictions. Real Caddy/Compose CI tests pilot admission/reclosure with unchanged existing proxy ID/site and preserved control row. A fresh full VM run is required because release routing/CLI changed; no old debugging is repeated.

## Runtime, secrets and rollback review

Control runtime has Node/pg/jose only, independent PostgreSQL001–005, separate migration/runtime roles and no Vercel service requirement. Store local storage/database/JWT issuer/cookie/domain/installation UUID are separately bound per deployment. Self-hosted configuration rejects Vercel/Supabase environment credentials. Docker build contexts exclude env/private key files; control image includes only src/migrations/public assets/package dependencies. Pattern scan of328 changed files found no literal private-key material, GitHub or Resend tokens; no tracked .pem/.key/.pfx or live .env/pgdata paths were found. This is a bounded pattern/static review, not proof that every possible secret format is absent.

Email OTP uses CSPRNG/HMAC/TTL/attempt caps/single-use row lock/cookie binding; sessions are independent HttpOnly/Secure/revocable with origin+CSRF ownership checks. Unpair requires fresh authentication. No email-change/ownership-transfer shortcut exists. TUF/Cosign/pinned source and digest checks remain intact; production trust root and official signatures are not generated during this audit.

Checkout remains blocked unless the private self-hosted approval flag is set; generated runtime configuration never sets it. J&T production requires its separate approval flag, which the store launcher does not inherit/allow. Sandbox/test fixtures do not grant production access. Existing Gheverhan stays in its legacy profile.

Rollback before public approval: keep landing enabled=false, application releaseAccess closed, dashboard503. Pilot rollback: close dashboard route first, preserve DB/secrets/identity and set application mode closed through the separately approved control-only restart. Never reset main, delete volumes or restore stale identity data.

## Read-only production snapshot

SSH alias gheverhan-vps resolves43.173.21.197 with strict known-host checking. Observed Ubuntu22.04.5,2CPU,3.6GiB RAM,2GiB swap unused,MemAvailable2970996KiB and30219276288 free Docker-filesystem bytes. Proxy/app/DB running, restart0, OOMfalse. Existing proxy owns80/443 and has deploy_default only; backend3100 and PostgreSQL5432 are not public host listeners.

Proxy ID7927be8662c29a4303196edb2b82e875c13d8033dcb54e49b7330a8d77800f3a. Caddy source /opt/gheverhan/deploy/Caddyfile has SHA2569eae91383254cccb5e29f20a1beb2250026f8ac15900bdcc0253e54ba733e8b7. These are comparison evidence, not permission to change them; recheck before any approved deployment.

External normal TLS verification: gheverhan.store200, buattokosendiri.web.id200, dashboard.buattokosendiri.web.id503. Public resolver1.1.1.1 resolves dashboard to43.173.21.197. No service restart/reload, network attachment, file write, database query/migration, DNS/SSH/firewall change, or backup creation was performed on production. Operational encrypted backup/disposable restore remains pending.

Publisher environment btos-release-publisher has reviewer separation/prevent-self-review and exact-main policy; variables/secrets empty at audit. No approved production root fingerprint, official image digests, publication or real seller pilot exists yet. See P0_CHATGPT_HANDOFF.md for approval-separated commands and LIMITED_PREVIEW status.
