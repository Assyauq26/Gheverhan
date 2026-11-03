# M1 — Reviewable small-PR implementation plan

Status: IMPLEMENTATION UNDER REVIEW; isolated runtime evidence available, full M1 exit pending. Authority: PRD M1, FR-02,06,07 and NFR-01–09. M0 audit merged and architecture direction authorized in ARCHITECTURE_GATE_DECISION.md; specialist/delivery gates remain open. This is the decomposition of canonical PR-01 (store runtime portability), not a replacement sequence for PR-02–09. M1-01 merged in #138; M1-02/#143, M1-03/#144 and M1-04/#145 are separate open dependency PRs. See M1-RUNTIME-RESULTS.md for actual evidence and pending gates.

## Common gates

- #136 approved/merged; docs-only M0 audit PR reviewed; named acceptance of applicable ADRs or explicit scoped decisions. Private registry/pairing choices can remain pending during isolated M1, but must not be silently implemented.
- Establish a reviewed CI/release boundary **before any frontend-affecting merge**: main push to `frontend/**` currently can auto-deploy Gheverhan. A future standalone CI policy PR must fail closed on unapproved deploy; it itself requires owner review because changing the autodeploy file also matches its trigger. No toggling live vars/settings as part of M1 by assumption.
- Initial isolated template/docs paths should be under a new `deploy/self-hosted/` profile and use a dedicated non-deploy CI workflow, rather than changing `deploy/helipod/`. Proposed paths are new, not falsely described as existing.
- Every implementation PR: requirement/test mapping; explicit lint, typecheck, build, unit + relevant isolated DB/container/browser/security checks, observed results and redacted evidence. Unrelated tests marked not applicable with reason, never reported as passed. Existing commerce behavior remains unchanged.
- Only synthetic local fixtures and disposable Ubuntu24.04 amd64 hosts. No inherited production env, ports, secrets or volumes; fixture identity/sentinel guard, loopback exposure only where required for test, distinct Compose project and test roots. Cleanup only fixture-owned resources, never volume prune.
- No public portal claiming successful install/available command, no central DB/customer model, no agent/pairing endpoint, no production J&T requests in M1.

## M1-01 — Explicit standalone configuration contract

Dependency: M0 review and CI boundary decision. Scope: pure versioned self-hosted profile parser and sample config; opt-in profile absent by default. Canonical origin, local storage provider/root, database role/DSN source, sender, app/session identity, fresh-install versus existing-instance designation. Avoid logging secret values or embedding real domains. Preserve legacy defaults in current profile.

Acceptance: malformed origin/path/provider and missing required settings fail before startup; a valid synthetic profile parses without calling network; legacy profile output unchanged; messages enumerate safe field names, not DSN/token/password. Secret material read via supported private files/adapters, no secret value in rendered commands. Independent two-instance fixture uses distinct secrets/root/DB identity. No automatic admin creation.

Tests: parser positive/negative/property cases; symlink/outside-root/unknown-property and secret-sentinel output checks; existing auth/storage/checkout unit suites; lint/typecheck/build. Mapping NFR-01,03,08, FR-06/07; supports A17 but does not complete A22 or installation flow.

Rollback: no production enablement; revert opt-in profile only. No migration.

## M1-02 — Standalone image and Compose/Caddy templates

Dependency: M1-01; reviewed packaging ADR. Prefer a separate build/template path without editing live Helipod profile. Pin tested Node22 and PG17/Caddy image digests and template version, production Next command, non-root app, narrowly copied runtime assets and validated secret inputs. No unauthenticated installer distribution in this PR. Keep internal DB, app non-public, only Caddy ingress; persistent DB/media/Caddy state with installation-owned labels.

Acceptance: validated rendered Compose has no DB host port or Docker socket; cannot mount arbitrary host paths; proper secret file ownership; no build context env/keys in image history or layer contents; no dev server or source-secret artifacts. Home/admin assets and region snapshot work. Recreate app and proxy retains DB/media and Caddy state. Build artifact can be used in isolated CI only; signature/release deliverability remains a later explicit gate.

Tests: render/schema and injection/path/domain negatives; `docker compose config` with synthetic secret files; isolated image startup + non-root UID/ports/mount inspection; image-layer secret sentinel check; DB role smoke. Relevant existing browser regressions on synthetic store, default production image contract comparison. Mapping FR-06/07, NFR-01/03/08; partial A17/A18/A20, no claim A20 signed initial install complete.

Rollback: remove test-only profile/artifacts; no existing volume or template modification. Docker command execution is only in later disposable CI, not this documentation task.

## M1-03 — Separate readiness with bounded local probes

Dependency: M1-01/02 and approved safe frontend merge boundary. Preserve `/api/v1/health` liveness contract; add a separate readiness implementation/route with no credential/internal-path leakage. Minimal local DB query, bounded media root access probe and schema compatibility status, strict timeout; no center/J&T/payment/email dependency in liveness or routine readiness. Avoid probe contention and private customer reads.

Acceptance: healthy local dependencies ready; DB down/read-only storage/schema mismatch/timeout yields safe non-ready code, not static200. Liveness remains responsive; no migration or seed on probe; rate/concurrency bounded. Readiness cannot be used as proof of commerce onboarding. Permission-aware media write probe, if needed, uses only an installation-owned temporary sentinel and safe removal; no product file mutation.

Tests: unit injected timeout/cancel/error sanitization; isolated Postgres disconnect/schema negatives; storage symlink/read-only cases; no central egress assertion; endpoint behavior and existing session/checkout regression. Mapping NFR-02/04/05, A18 partial, U11 prerequisite. Store-ready-to-sell and J&T UAT remain separate later work.

Rollback: disable opt-in readiness consumer/revert new endpoint without touching DB; keep liveness unchanged. No public detailed health telemetry.

## M1-04 — Disposable Ubuntu persistence and recovery evidence

Dependency: M1-01–03; approved test resources (not the live Helipod VPS). This PR supplies fixture harness/runbook and measured report, not a bootstrap agent. Separate migration owner/runtime permissions tested against real existing migrations; retain RLS invariants while reviewing grants. No new store schema change merely to make packaging pass.

Acceptance: clean Ubuntu24.04 amd64 fixture starts store locally with PG17, durable media and proxy. Migrations applied once, rerun safe or documented Prisma interrupted-state recovery; concurrent operation lock prevents duplicate work. Seed synthetic orders/media, back up DB+media+recovery configuration encrypted to a distinct fixture destination, restore into a **new separate fixture**, verify exact records/checksums and auth/navigation. Never overwrite source fixture or label same-host backup as production off-server durability. Host reboot/recreate retains state; no external service order.

Measure: image compressed/unpacked and peak build/import disk, free bytes/inodes before/after, PG/app/proxy RAM, swap/CPU startup and recovery time. Evaluate proposed 2vCPU/4GiB RAM/40GiB **free** disk, adjust minimum based on evidence. Host22.04 or 2GiB historical VPS is not proof of supported baseline. Capture safe versions/digests/Compose inspect summary, no full env output.

Tests: targeted DB/migration/local-role integration, complete current unit suite, lint/typecheck/build, current critical storefront/auth/cart/checkout/admin browser flows using mock shipping; offline-center test with no new center dependency. M1 evidence can prove runtime independence, but A25's final two-hour test must be repeated once agent/control plane exist. A04/A05/A06/A07 are partial host/runtime prerequisites until real bootstrap exists; A18 fixture persistence and U14-style recovery evidence recorded explicitly. A19 full installer power-loss resume is deferred to PR-05.

Rollback: stop/remove only fixture resources after verified labels/path boundary; preserve evidence and never touch live data. Production backup retention policy/RPO/RTO and signed rollback demonstration remain later approved gates.

## M1 exit / deferred acceptance matrix

| Outcome | M1 exit evidence | Explicitly later |
|---|---|---|
| Portable local runtime | Validated config, image, Compose/private PG, local media, measured resource baseline | Installer packages/sudo, domain ownership/TLS orchestration |
| Reset-free lifecycle | Container/reboot persistence; no schema reset; fixture restore into separate stack | Full installer journal, one-time admin claim, repair/re-pair |
| Existing app compatibility | Actual lint/typecheck/build/unit/isolated DB/browser evidence, unchanged live profile | No production rollout or real-provider UAT |
| Supply chain | Pinned tools/digests and local build inventory | Before ANY installer use: verified bootstrap and signed image/manifest (P0); fleet update engine later P1 |
| Architecture boundaries | No central runtime calls/secrets or shared commerce schema | Formal pairing/agent/helper/ring/revocation acceptance |

Exit recommendation is READY_FOR_REVIEW with measured limitations, not READY_FOR_PILOT or permission to deploy. Subsequent canonical PR-02 registry, PR-03 verified bootstrap/pairing, PR-04 domain, PR-05 local install, PR-06 agent and PR-07 update engine each require their own review. Do not infer M1 completion from plans or green docs CI.

## Finalization after PRD merge

PR #136 merged at `5f6d21ed42c04ef7206e781edae09c728b52850b`. The four PRs above remain unchanged in scope/dependency; no M1 code is authorized. The audit documentation PR is the review vehicle for this plan. Proposed module names below are targets, not claims that those files exist.

| PR | Estimated files/modules | Migration impact | Definition of Done |
|---|---|---|---|
| M1-01 configuration | New `frontend/src/lib/self-hosted/config.ts` and adjacent focused parser tests; opt-in wiring in current storage/origin configuration; synthetic config examples under `deploy/self-hosted/` | None; no schema, seed, admin creation or live environment edits | Requirement mapping, reviewed opt-in boundary, unit negatives and legacy regression pass; lint/typecheck/build results; sanitized errors; no default behavior change |
| M1-02 packaging | New `deploy/self-hosted/Dockerfile`, `compose.yml`, `Caddyfile`, template/schema validator and fixture secret examples; reuse current frontend lockfile | Existing migration artifact packaged without executing against real data; no new migration | Non-root production runtime, private DB, persistent volumes/Caddy, isolated image-layer secret inspection, render and startup evidence; digests/version inventory; M1-01 DoD retained |
| M1-03 readiness | New `frontend/src/lib/self-hosted/readiness.ts`, `frontend/src/app/api/v1/ready/route.ts` and focused probe tests; opt-in Compose health consumer | Read-only schema check; no migration/seed/probe-driven grants | Bounded DB/storage/schema probes, failure/timeout/secret-redaction evidence, existing liveness contract preserved, isolated DB/storage and browser regression pass |
| M1-04 fixture recovery | New `deploy/self-hosted/tests/` disposable harness and `docs/self-hosted/m1-runtime-evidence.md` runbook/report; dedicated non-deploy CI only after owner review | Apply existing migrations only to synthetic isolated DB; test separate roles, interrupted state and new-fixture restore | Ubuntu24.04 persistence/reboot, consistent encrypted DB/media/config backup and separate restore verified; measured resources and recovery time; no commerce regression; honest partial/deferred acceptance matrix |

Names may be refined during each authorized implementation PR after checking adjacent module conventions. Any change to this four-part split requires rationale and review. No empty scaffold is requested here.

### Test strategy and explicit exclusions

M1-01 -> M1-02 -> M1-03 -> M1-04. Each PR carries unit plus relevant integration/security negatives; M1-02 adds isolated container startup; M1-03 adds bounded real-DB/storage failure probes; M1-04 runs the full synthetic browser/auth/cart/checkout/admin flow and backup/restore with checksums and exact records. Unit tests alone do not establish E2E behavior. Record command/tool versions, exact commit, counts, failures and fixture identity. No real J&T/payment/email orders, production resource or customer data. Screenshots only for actual changed UI, otherwise explicitly not applicable.

For all four: code review, requirement-to-test mapping, explicit lint/typecheck/build, no secret findings, no business behavior change in default Gheverhan profile, documented risks and rollback, and exact-HEAD CI evidence are required. Resource sizing and retention/RPO/RTO remain evidence/owner decisions. A signed image candidate is part of canonical M1 exit; digest/build inventory alone is insufficient. If approved signing infrastructure is not available, report M1 exit BLOCKED with that limitation. Signing the fixture candidate does not authorize distribution or production use; initial bootstrap trust remains a separate P0 delivery gate.

Rollback is per-PR revert of opt-in modules/templates or fixture-only shutdown after checking ownership labels and paths. No production database migration occurs; no schema downgrade or data-volume deletion. Retain recovery evidence and source fixture until verification completes. A frontend-affecting merge requires explicit reviewed deployment isolation because the existing main-push autodeploy can match those paths; this documentation PR changes no safeguard.

Approval checklist: accept applicable ADRs and D01–D11 resolutions; approve scoped M1 start and deployment boundary; provide authorized disposable test resources; settle signer/trust policy for M1 exit. Registry/pairing may remain pending during isolated runtime work, but private installer delivery cannot proceed without them. M1 remains NOT STARTED.
