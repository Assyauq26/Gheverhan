# R18 — recovered remediation and retained navigation failure evidence

16 October 2026 (Asia/Jakarta). Release: **NOT READY**.

## Recovery and verified environment

Initial checkout `work` was clean at `4f141dd`, matching fetched `origin/main`.
Local historical audit branch still ends at `8bf9a97`; its files are not the latest
remediation. Remote PR #56 (`a77991f`) and #57 (`97614e0`) recover the completed
direct-entrypoint guard and cart fix. Their final GitHub unit and full isolated
integration/browser checks report SUCCESS. R18 is a dedicated diagnostic branch
stacked on #57; no main update, merge or production deployment is performed.

Managed environment observations are current, revision 5, running/connected.
Policy state is `unknown`; desired configuration is not evidence of enforcement.
Actual HTTPS through the inherited proxy, with TLS verification enabled:

- Production `/`: HTTP 200.
- Plural `results-receiver.actions.githubusercontent.com/`: HTTP 404, reachable.
- `gh run view 38922040001 --log`: succeeds, 1,679 lines downloaded locally.
- Exact Preview `gheverhan-j810hetwu-syauqi3.vercel.app`: CONNECT 403,
  **BLOCKED**. Production access does not establish wildcard Preview access.
- GitHub Actions permissions and main protection API: HTTP 403, resource not
  accessible by integration. Account policy remains **BLOCKED**.

The executor snapshot still names singular `result-receiver` while the managed
status lists plural; actual plural HTTPS and log retrieval now succeed. No proxy
bypass, TLS bypass, credential output, policy edit or new Supabase project is used.

## P0 database guard verification

The recovered #56 assertion runs inside seed/bootstrap before Prisma construction;
managed migration npm scripts use the same assertion. Preview rejection is independent
of the shared-development opt-in. No new seed fix is claimed as R18 work.

Fresh PostgreSQL 17 cluster `/tmp/gheverhan-recovery-pg`, loopback port 55432, database
`gheverhan_sprint1_test` was initialized solely for this session. Five migrations
apply successfully. Direct seed, direct bootstrap, Prisma db seed and all four
managed npm mutation scripts reject Preview with nonzero exits and leave the
isolated schema empty. Non-Preview seed, bootstrap and repeated bootstrap work.
The entrypoint integration test removes its UUID-owned schema afterwards.

Raw Prisma migrate/db push/SQL are **not intercepted** by repository guards. Build
source remains `prisma generate && next build`, without schema mutation. Vercel
command overrides and Preview credential scope are **BLOCKED**, so no claim that
all Preview mutations are prevented is justified. Restrict DDL credentials and
untrusted deployment access at the provider. All test DSNs are explicit loopback;
no shared Supabase operation was performed.

## P0 navigation: finding and diagnostic correction

PR #54 navigation source and #55 product card source are byte-identical to recovered
#57, verified with Git diffs against their actual PR heads. They do not establish
that the intermittent issue is fixed.

Three production runs on recovered application source, unchanged assertions,
600 ms synthetic RSC delay and original timeouts:

1. Original suite: **PASS**, 10/10 at 390px and 1360px.
2. Original suite: **PASS**, 10/10 at both widths.
3. Suite with retained diagnostics: **FAILED**. All ten steps completed, but the
   strict browser-error assertion caught React #418 on `/admin/inventory` at 1360px.
   Chromium version: `154.0.8037.57`.

Root cause of application hydration/aborted navigation is **NOT ESTABLISHED**.
The third run disproves consistent correctness; two passes do not cancel a failure.

Verified diagnostic defects corrected in `frontend/tests/integration/navigation-browser.ts`:

- Results JSON was written only after all assertions passed; failed runs lost the
  structured evidence. It now writes PASS/FAILED, partial checks, full browser error
  stack, browser version and path-only RSC events in `finally`, before teardown.
- RSC tracking used URL keys. Concurrent prefetch/navigation at the same URL could
  overwrite/remove each other's records. Tracking now uses Playwright request identity.
- Direct HTML checks searched plain text containing dynamic numbers; React streaming
  inserts comment separators. These comments are stripped for the diagnostic check.
  This changes no browser assertion or navigation behavior.

The failing run created `/tmp/gheverhan-recovery-nav-3-artifacts/navigation-results.json`
with `status=FAILED`, ten completed checks and the full #418 stack. No errors are
suppressed. Teardown still runs if writing the artifact fails. Data is synthetic;
request headers, cookies and connection strings are not captured.

Separate sparse detached worktree `/tmp/gheverhan-hydration-diagnostic` contains
**uncommitted diagnostic-only changes**. One development run passed 10/10 (two image
500 console messages from synthetic `example.test` image fixtures, not hydration).
A Webpack loader adds recoverable-error component-stack logging to a separate
production build without removing Next's original reporter. These are investigations,
not application fixes or replacement release gates.

## Validation and remaining scope

| Check | This session |
| --- | --- |
| Containment / unit | **PASS**, 20 + 168; zero skips |
| First unit attempt before Prisma generation | **FAILED**, 9 missing-client/enum failures; all pass after required generate |
| Lint / typecheck | **PASS** |
| Production build | **PASS**, explicit local DSNs |
| PostgreSQL migration / direct entrypoint regression | **PASS**, five migrations and one entrypoint test |
| PostgreSQL combined product, transaction, refund/shipping, cart | **PASS**, 83 tests, zero skips |
| Product browser | **PASS**, 16 checks |
| Operations browser | **PASS**, 20 checks |
| Navigation consistency | **FAILED**, two passes / one failure across three production runs above |
| Production HTTPS / Actions log download | **PASS** for connectivity/log retrieval only |
| Exact Preview HTTP smoke / provider policy | **BLOCKED** |
| npm official audit | **FAILED**, 23 package entries: 2 Critical, 9 High, 12 Moderate |
| Comprehensive new source/history review and all P1 remediation | **NOT COMPLETE**; prior reports are history, not renewed proof |

No dependency upgrade is included. Existing auth source still has plaintext reset
bearers/logging and lacks JWT revocation; PR #37 owns token/email changes but explicitly
leaves revocation/distributed throttling pending. PR #38 owns cron/payment-review expiry
and is outside this stack. Both PR descriptions were reread. 1,481 PostgreSQL runtime
paths remain tracked; only path metadata was counted, not database content. No history
rewrite, artifact cleanup, or claim of actual sensitive-data exposure is made.

## Owner actions and safe review order

1. Allow the exact required Preview hostname through the supported environment
   configuration workflow if Preview smoke is required; current production allowance
   does not cover generated Preview hosts.
2. Verify Vercel build overrides, credential scope, separate JWT keys, deployment
   trust/access and runtime selection; verify Actions approval/default token permissions
   and required reviews with an account that can read effective settings.
3. Review #40/#42/#44/#56 as the security stack, then #57 cart; validate #41/#45/#46/
   #54/#55 together on the reviewed candidate. Do not merge #53/experiments wholesale.
4. Keep hydration/navigation as a blocking gate. R18 is diagnostic evidence only.
5. Complete and independently validate #37/#38, then compatible Critical/High dependency
   remediation. Keep #39 public-history incident decisions separate.

No production deployment, main merge, shared database mutation or owner configuration
change is included. Release remains **NOT READY**.

## Additional diagnostic runs

Five separate instrumented production runs retained the original routing delay,
assertions and timeouts: **two passed, three failed**. Failures occurred at mobile
admin pagination, desktop shop pagination and desktop admin pagination. No hydration
component stack was emitted in these five runs; transport/page-state failures happened
first. Instrumentation alone does not resolve the regression. These five runs are
separate from the three application-baseline runs above and are not counted as a
passing release gate.

Final-source fourth production navigation run: **PASS**, 10/10. This session's
application-baseline/diagnostic-source count is therefore **four runs: three passes,
one #418 failure**, in addition to the five separate instrumented runs above.
The final source changes diagnostic collection only, not application/transport logic.
Full local unit/containment and sequential typecheck/lint pass again after the change.

Draft PR: https://github.com/Assyauq26/Gheverhan/pull/58, stacked on #57.
Initial diagnostic commit: `d5c2fcd`.
The CI navigation step now uploads only its synthetic `navigation-results.json`,
including on test failure, for seven days. No raw server logs, headers, cookies or
screenshots are uploaded. GitHub's upload-artifact action is pinned to verified
v7.0.2 commit `cf430e030ddbb5b0abf93d22962f4752f3646cd9`; its action manifest uses
Node 24. Missing expected JSON is an error. This does not change the test exit code.

The response-delay A/B experiment ran **five** times: **four passed 10/10, one failed**
React #418 at 390px inventory. Its captured recoverable component stack begins at
`main → div → div` in the admin layout. Changing the harness delay therefore does
**not** eliminate hydration failure and is not adopted as a fix. Thirty additional
development-mode inventory document loads (15 per viewport) emitted no hydration
error; this negative diagnostic is not a production regression pass. A separate
production hydration-claim probe remains diagnostic-only in the detached worktree.

At documentation time, code/CI-upload commit `a1a103e` has successful remote unit
run [38925472921](https://github.com/Assyauq26/Gheverhan/actions/runs/38925472921)
and successful Vercel Preview build status. Full isolated integration/browser run
[38925473100](https://github.com/Assyauq26/Gheverhan/actions/runs/38925473100)
is still running and must not be called PASS until completed. Vercel status alone
is not HTTP smoke. Final check status is also available directly on Draft PR #58.

## Final diagnostic limits

Thirty production-mode inventory-only document loads also completed without #418.
Five full runs on the additional hydration-claim-instrumented build passed 10/10;
no mismatch was captured by that probe. These negative diagnostic runs do not erase
any earlier failure and do not establish an application root cause or fix.

Local pinned-browser installation was retried using `PLAYWRIGHT_BROWSERS_PATH` under
`/tmp`. The official download for Chromium **153.0.8010.12**, revision **1243**, at
`cdn.playwright.dev/builds/cft/153.0.8010.12/linux64/chrome-linux64.zip` is denied
HTTP **403 Domain forbidden**, despite the configured hostname. Browser-version A/B
against local system Chromium **154.0.8037.57** remains **BLOCKED**. No alternate
forbidden download path, proxy bypass or TLS bypass was attempted. Owner/environment
support must reconcile effective CDN access before this comparison is possible.

All application-baseline, instrumented and A/B run groups above are deliberately
reported separately. The strict consistency gate remains **FAILED**. The remote
checks for the latest PR head must be read separately from these local observations;
a green remote run does not close intermittent failures.
