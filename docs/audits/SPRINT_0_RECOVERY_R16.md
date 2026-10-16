# Sprint 0 recovery — direct database entrypoints (R16)

Date: 16 October 2026 (Asia/Jakarta). Draft PR: https://github.com/Assyauq26/Gheverhan/pull/56.

## Recovery and scope

Initial checkout was clean on `work`, commit `4f141dd`, identical to fetched `origin/main`.
The old local Sprint 0 branch ends at `8bf9a97`; no uncommitted direct-seed fix survived.
That unfinished change is **NOT RECOVERED**. Current remote PR metadata was read rather
than assuming the onboarding branch represented the previous session.

Recovered PR #53 at `8984334d4c6c53ebc65fd289528a631236461173` as the integration baseline.
Its navigation source is byte-identical to PR #54; its product card and markup regression
are byte-identical to PR #55. It includes #40/#41/#42/#44/#45/#46. R16 uses dedicated
branch `security/remediation-r16-direct-db-entrypoints`, stacked on #53. Do not merge
this integration stack wholesale into main. No main update or production deployment
was requested or executed. Git push caused the configured **Preview** deployment.

## Environment findings

- Managed runtime is running/connected, observations current, spec revision 6. HTTP
  policy state is `unknown`; do not claim enforced readiness from the configuration.
- Actual HTTPS production request succeeds (HTTP 200).
- Configured host is **`result-receiver.actions.githubusercontent.com`** (singular);
  actual HTTPS reaches it and returns HTTP 400 at `/`.
- Requested **`results-receiver.actions.githubusercontent.com`** (plural, used by
  Actions log redirects) is absent and CONNECT is denied HTTP 403. Log download is
  **BLOCKED**; API job/step metadata remains usable. No proxy bypass was attempted.
- Browser live smoke is **BLOCKED** by `ERR_CERT_AUTHORITY_INVALID` for the proxy CA
  in system Chromium. curl TLS verification works. TLS checking was not disabled.
- Playwright bundled Chromium download returns a proxy 403; installed system
  `/usr/bin/chromium` works for local tests. No alternate forbidden download path used.
- Vercel administrative tools/credentials are unavailable. API calls for Actions
  permissions and main branch protection return `Resource not accessible by integration`
  (403). Deployment command overrides, credential scopes and review protections remain
  **BLOCKED**, independently of repository checks.

## P0 root cause and fix

PR #44 guarded npm scripts only. Both TypeScript scripts instantiated their own
`PrismaClient`, so direct `tsx prisma/seed.ts`, direct bootstrap, and Prisma's seed
hook bypassed the wrapper. On recovered source `8984334`, direct seed with
`VERCEL_ENV=preview` exited **0** and created **two users**, reproduced only inside a
new disposable loopback PostgreSQL schema. That schema was dropped afterwards.

The shared assertion is now importable without side effects, and each script invokes
it **before client construction**. Preview is rejected even with the shared-database
opt-in. Non-Preview behavior remains available. The executable guard still protects
managed migrations. Raw Prisma errors from seed/bootstrap are replaced with fixed
messages, avoiding URL/credential disclosure. Seed failure sets a nonzero exit code
while allowing disconnect cleanup to run.

Changed implementation/test files:

- `frontend/scripts/assert-safe-db-operation.mjs`
- `frontend/prisma/seed.ts`
- `frontend/prisma/bootstrap-admin.ts`
- `frontend/tests/unit/preview-database-script-guard.test.ts`
- `frontend/tests/integration/database-entrypoints.test.ts`
- `.github/workflows/sprint-2e-isolated-regression.yml`

Implementation commit: `cab6e45e4ea920719ed1641c7e2bbd6b6546defb`.

## Database execution matrix and trust boundary

| Path | Expected / actual policy | Verification |
| --- | --- | --- |
| `npm run seed` | Preview denied before seed | Real subprocess in isolated schema |
| Direct `tsx prisma/seed.ts` | Preview denied before client; local seed functional | Unit subprocess + real PostgreSQL |
| `prisma db seed` | Configured seed hook denied in Preview | Real CLI subprocess, schema stays empty |
| Direct `tsx prisma/bootstrap-admin.ts` | Preview denied; local bootstrap functional/idempotent | Unit subprocess + real PostgreSQL |
| `npm run prisma:bootstrap-admin` | Preview denied | Real npm subprocess |
| `npm run prisma:migrate` / `prisma:deploy` | Preview denied; local deploy functional | Real npm subprocess; isolated migrations |
| `npx prisma migrate`, `npx prisma db push`, direct CLI / arbitrary SQL | **Not intercepted by repository guard** | No unsafe command executed against shared DB |
| Build (`prisma generate && next build`) | No seed/bootstrap/schema mutation | Source audit and production build |
| Vercel Preview command override | Must not run raw migrations/push/SQL | **BLOCKED**: account configuration unavailable |
| Actions DB operations | Disposable PostgreSQL service, literal loopback test URLs; no production secret references | YAML audit, local equivalent, remote steps |

Prisma 5 CLI has no repository hook that makes arbitrary direct SQL/CLI commands a
security boundary. Removing a wrapper or using credentials directly bypasses repository
controls. The existing shared development exception also permits application writes
from trusted Preview code. Therefore the broader claim “Preview cannot mutate the
shared database” is **not satisfied** by this patch. Restrict Preview credentials and
build/deployment permissions at the provider; do not expose owner/DDL credentials to
untrusted builds. No shared Supabase connection or mutation was used for these tests.

## Navigation / hydration verification

All original hydration and content assertions and timeouts are preserved. R16 changes
no rendering or navigation source.

The first local run of the original navigation suite passed all 10 checks across
390px/1360px. The second failed mobile admin page 2: HTTP 200 RSC responses followed
by `net::ERR_ABORTED`, URL remained page 1 and pending feedback remained visible.
Thus #54/#55 plus one successful CI run do **not** close the intermittent regression.
No React #418 was observed in these two runs; its absence is not proof of resolution.

An independent temporary A/B script retains the same assertions and 600ms delay,
but fetches upstream before delaying delivery (`route.fetch` / `route.fulfill`, as
explored in #52). This is diagnostic evidence only, not a replacement for the original
suite or a proven application fix. Results are recorded below after completion.

## Verification matrix

Status at report creation; subsequent results are appended before handover.

| Check | Status / evidence |
| --- | --- |
| Baseline bypass reproduction | **PASS**: reproduced, exit 0, two local users |
| Fixed direct-script unit regression | **PASS**: 7 tests, including safe nonzero DB failures |
| Unit / containment | **PASS** initial full run: 166 unit + 20 containment; two further redaction tests pass separately |
| Typecheck / lint | **PASS** after Prisma generate; initial missing-client typecheck failure corrected |
| Production build | **PASS**, local test DSNs only |
| PostgreSQL migrations | **PASS**, five existing migrations on disposable local PostgreSQL 17 |
| New database entrypoint regression | **PASS**, Preview schema remains empty; allowed local seed/bootstrap work |
| Product lifecycle PostgreSQL | **PASS**, 23 tests |
| Checkout/transaction PostgreSQL | **PASS**, 26 tests |
| Refund/shipping PostgreSQL | **PASS**, 30 tests |
| Original navigation stress | **FAILED** consistency gate: first run 10/10, second run fails mobile admin pagination |
| Product and operations browser suites | Pending current local/remote runs |
| Live HTTPS smoke | **PASS** HTTP 200; authenticated/business flow not tested live |
| Live Chromium smoke | **BLOCKED**, proxy CA trust |
| GitHub unit check at `cab6e45` | **PASS**, run 38919500423 |
| GitHub isolated integration/browser at `cab6e45` | In progress, run 38919500387 |
| Vercel Preview build status | **PASS** provider status for `cab6e45`; not an HTTP deployment smoke |
| Production deployment / shared DB operations | Not performed |

## P1 audit follow-up and remaining findings

This is a targeted recovery and follow-up audit, not a claim that every source/history
object has been comprehensively audited. Existing audit reports remain relevant as
history, but findings must be checked against current source.

- **P0:** intermittent navigation remains reproducible on the integration baseline;
  root cause of #418 and aborted transport is not established. Keep strict browser gate.
- **P0 operational:** direct CLI/SQL credential boundary and Preview provider settings
  remain unverified. Application guards do not sandbox untrusted PRs.
- **P1 auth:** current `auth.service.ts` still stores raw reset tokens and logs reset
  URLs; reset updates have no conditional single-use claim and JWT sessions are not
  revoked by password reset. Existing PR #37 owns this remediation; it is excluded
  from #53/#56 and requires its separate provider/session/schema validation.
- **P1 expiry:** current `expireStaleOrders` has no cron route in this integration
  baseline and selects all pending orders, including payment review. PR #38 owns the
  scheduler/payment-review remediation; do not claim it is deployed.
- **P1 potential sensitive artifacts:** 1,481 PostgreSQL runtime files remain tracked.
  Contents were not opened and no actual data leak is asserted. PR #39 stays on hold;
  removal from HEAD alone cannot remove public history. No history rewrite performed.
- **Critical/High dependencies:** fresh official npm audit reports **23 package entries**:
  2 Critical, 9 High, 12 Moderate (exit 1 for findings). Critical remains Vitest/Tinypool;
  High includes PostCSS and glob/CSS/test chains. Containment passing is not a CVE fix.
  Manifest/lockfile were not changed. Prior dependency migration plan remains separate.
- **Validated existing controls:** current inventory uses conditional atomic SQL;
  payment approval locks order/payment and handles replay; proof upload checks ownership
  before storage and compensates failed DB submissions; dashboard filters by permission;
  checkout confirms server prices and serializes coupon quota use. Relevant local
  PostgreSQL suites pass; this does not prove provider configuration or all races safe.
- **JWT:** Preview issuer/audience isolation unit tests pass. Independent provider secret
  values/scopes and stale deployment credentials cannot be verified from source.
- **Runtime:** manifest/CI target Node 22; Next 15.5.26 / React 18.3.1 / Prisma 5.22.0
  build locally. Actual Vercel runtime selection remains account-level verification.

## Owner actions, release and merge order

Release readiness: **NOT READY**. Do not merge or promote based on this report.

1. Correct environment allowlist to include plural `results-receiver.actions.githubusercontent.com`,
   publish/activate configuration and verify log retrieval. Configure browser trust for
   the existing public proxy CA through the supported environment setup.
2. Verify Vercel Preview build override is generation/build only; inspect secret scopes,
   PR deployment trust and access protection. Review existing shared-dummy-data exception
   before any real data is introduced. Verify separate JWT keys and stale deployments.
3. Verify Actions approval/default permissions and required branch reviews with an owner
   account; current integration lacks administrative read permission.
4. Resolve the navigation/hydration gate and repeat full original mobile/desktop runs.
5. Review security #40/#42/#44 plus #56 together, coupon #41, navigation #45/#54/#55
   and marketing #46 through integration validation. Rebase R16 onto the reviewed release
   candidate after these changes; do not merge #53 or experimental #50–#52 as a shortcut.
6. Validate #37 and #38 independently with their required configuration before promotion.
   Keep #39 history incident response separate. Close Critical/High dependency findings
   through the planned compatible upgrades and rerun full verification.

No production/shared database mutation, new Supabase project, force push, merge or
production deployment was performed.

## R16 completed verification (before R17 follow-up)

On final R16 head `a77991f6c85309f16e9ba4de601fc8140e9bd183`, remote unit
[38920033646](https://github.com/Assyauq26/Gheverhan/actions/runs/38920033646) and full
isolated integration/browser [38920033670](https://github.com/Assyauq26/Gheverhan/actions/runs/38920033670)
are **SUCCESS**. The earlier code SHA `cab6e45` also passed both remote workflows.
Vercel Preview provider status is successful on both heads; no Preview HTTP smoke is claimed.

Final local R16 results: **168 unit tests + 20 containment**, product browser **16**,
operations browser **20**, and PostgreSQL **23 + 26 + 30 + 1 entrypoint regression**
all pass. Original navigation ran **three** times: **two passed 10/10**, **one failed**
mobile admin pagination. Delayed-response diagnostic ran twice, both **10/10 pass**.
No #418 observed in these completed local runs; intermittent hydration remains unclosed.

The cart follow-up was discovered afterwards; see [R17](SPRINT_0_RECOVERY_R17_CART.md).
Its changes and CI are separate from the verified R16 head above.
