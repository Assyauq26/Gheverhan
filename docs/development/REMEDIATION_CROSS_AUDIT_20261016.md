# Gheverhan — Cross-PR Remediation Audit (2026-10-16)

## Scope
Read GitHub source, current PR diff/metadata, historical and rerun CI logs,
and Vercel environment-scope metadata. Baseline `main` is
`4f141dd9e7aec14cfceb9568dd136a40b9a833e4`; no live deploy or shared
Supabase migration was authorized or executed in this remediation pass.

This document separates **confirmed defects**, **hypotheses**, **tested
improvements**, and **unverified operational gates**.

## Confirmed findings and evidence

| Severity | Finding | Reproduction/evidence | Remediation |
| --- | --- | --- | --- |
| P1 | Desktop admin pagination intermittent | 1360px `Halaman 1 dari 2` persisted 15s; repeated across #42/#43/#44/#45/#49 and integration #50 | #45 targeted link consistency, RSC diagnostics; #51 native-link experiment |
| P1 | React hydration error #418 intermittent | Browser exception after ten navigation checks on #42/#44/#45; no universal route-level root cause yet | #43 error reporting, #46 deterministic marketing render, #49 valid interactive nesting |
| P1 | RSC response cancellations during product pagination | Combined #50 rerun: RSC response 200 in ~609 ms, then `net::ERR_ABORTED`; no request left in flight; full GET status 200 | #51 removes manual NextLink `preventDefault()` and router re-push, retaining native `useLinkStatus` feedback |
| P1 | Preview and main share one database by owner-approved dummy-data exception | Supabase project `bztprltkevacidcpjaam`; Vercel Preview uses same DB connection, separate JWT secret | #40 fail-closed allowlist/opt-in, #42 separate JWT claims/keys, #44 CLI npm mutation guard |
| P2 | HTML interactive nesting on product card | Wishlist `button` was inside image `a`, causing invalid interactive markup | #49 moves button to independent sibling overlay, component DOM test |
| P2 | Marketing status/time hydration not deterministic | `Date.now()` and host-default `toLocaleString` in client component SSR render | #46 serialized clock from server, fixed WIB formatter, time-boundary tests |
| P2 | Build runtime inconsistent | CI and `package.json` pin Node 22; Vercel project metadata reports Node 24.x | Align project runtime through separately approved deployment configuration change |

## Test evidence and interpretation
- PR #40: isolated unit + PostgreSQL/Chromium workflow **passed**.
- PRs #42/#44: unit passed; Chromium regression **failed** with intermittent navigation or hydration. This does not, by itself, prove the isolated JWT or CLI guard code is defective.
- PR #46: unit passed; browser regression failed at 1360px `/shop` pagination.
- PR #49: unit and first integration/browser run passed; retry **failed** at desktop admin pagination. Valid HTML alone does not resolve the navigation hang.
- Integration #50: combined unit+isolated PostgreSQL/Chromium **passed once**; rerun **failed** at admin pagination. Network diagnostics showed completed RSC response headers followed by abort.
- Experiment #51: must prove no new type/build error and produce repeated fully green isolated Chromium runs; status pending until reported.
- HTTP 200 on a full direct page request is not proof that RSC navigation succeeded. Inspect response format, aborted requests, pending status and URL together.
- **Do not** remove failing assertions, increase timeouts merely to hide a defect, suppress React hydration errors, or count a single lucky green run as a fix.

## Security and data integrity gates
1. GitHub Actions tests must only use disposable local PostgreSQL and loopback storage doubles; never shared Supabase.
2. Production database is temporary dummy-only; before any real users/addresses/payment proofs, remove shared Preview access.
3. Preview JWT and Production JWT must remain independently random and server-only; issuer/audience checks are defense-in-depth, not key replacement.
4. Preview scripts must reject migrate/seed/bootstrap, but direct Prisma CLI can bypass those scripts: deployments and repository write access remain trust boundaries.
5. Confirm existence of recoverable backup before ANY manual schema migration.
6. Audit old Preview deployments built while shared secrets existed; changing env scopes does not revoke old deployments.
7. Validate authorized Preview sign-in, RBAC, and session rejection across environments; CI is not a substitute for deployment smoke tests.

## Still separate / not complete
- #37 password-reset provider setup and post-reset session revocation review.
- #38 cron secret, Vercel scheduling registration, and live pending-proof reconciliation.
- #39 possible historical tracked PostgreSQL artifacts in a public Git repository: incident review and credential rotation, not blindly force-pushing history.
- #41 coupon usage release and concurrency with order expiry (#38): combined PostgreSQL regression and manual review before release.
- #43 error diagnostics is not a behavioral root-cause fix.
- #45/#46/#49 must be reconciled into one reviewed release sequence once the navigation issue is demonstrated stable.

## Release criteria
A. Strict browser navigation/hydration regression passes on the same reviewed code consistently across at least two separate runs plus unit/integration checks.
B. Human review confirms native link behavior, keyboard interaction, preserved GET history/search, and marketing SSR across device time zones.
C. Environment-specific authenticated Preview smoke tests pass (synthetic accounts only), no secrets are logged or bundled.
D. Verify base/main has not advanced unexpectedly; merge individual PRs in reviewed dependency order with CI on the final combined tree.
E. Only then consider production deployment after explicit release approval; do not merge this test PR (#51) or the integration PR (#50) into main.
