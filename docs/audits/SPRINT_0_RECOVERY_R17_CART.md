# R17 — concurrent cart mutation recovery

16 October 2026 (Asia/Jakarta). Dedicated branch:
`fix/remediation-r17-cart-concurrent-updates`, stacked on R16 / PR #56.

## Verified finding and root cause

**P1 correctness:** both regular and quick add read quantity, calculate a replacement
and upsert it without a common transaction/lock. Concurrent requests can all report
success while overwriting each other's increments. First-cart creation also has a
read/create race; Prisma's previous empty-update upsert did not prevent P2002 failures.

Three regression tests were run against the pre-fix source on disposable loopback
PostgreSQL, waiting for all requests to settle before asserting or cleaning fixtures:

| Scenario | Expected | Actual before fix |
| --- | --- | --- |
| Existing quantity 1 + eight accepted mixed adds | 9 | 3 |
| Eight first adds | Eight successes, one cart, quantity 8 | One success, seven failures |
| Quantity 1 with stock 2, eight competing quick adds | One success, seven 409s | Six reported success |

No stock is reserved by adding to cart, and checkout independently revalidates stock.
This finding proves lost updates / false acknowledgement, not an inventory oversell.

## Change

All cart mutations now hold the same parent Cart row lock used by checkout before
reading/changing lines. Native PostgreSQL `INSERT ... ON CONFLICT ... RETURNING` creates
or locks the first cart atomically; existing-line update/removal uses `FOR UPDATE`.
Regular and quick add share the same increment path; quick add still omits the full
cart-view query. Ownership and stock checks remain inside the transaction. Catalog
publication and checkout price/stock validation remain in place. No schema migration
or dependency update is required.

Files: `frontend/src/modules/cart/cart.service.ts`, existing cart unit mocks,
`frontend/tests/integration/cart-concurrency.test.ts`, and the isolated CI workflow.

Four integration checks cover mixed increments, first-cart creation, last-stock
acknowledgement and add-versus-checkout accounting. The last races five independent
checkouts: every accepted unit must remain either in an order or the remaining cart;
a stale checkout may return 409. Fixtures are owned and cleaned on a validated local
test database; no Supabase credentials or shared database operations are used.

## Verification and release boundary

The first fixed integration run passed all **four** checks (including five checkout
races). Existing **21** cart unit tests pass; full local suite passes **168 unit + 20
containment**. Lint and production build pass. A typecheck initially raced the parallel
build replacing generated `.next/types`; it is rerun sequentially after build, with no
configuration or assertion weakening. Five repeated concurrency runs and full combined
PostgreSQL/browser/remote CI verification follow on this branch.

[The R16 recovery report](SPRINT_0_RECOVERY_R16.md) records the successful security
patch verification and the still-open intermittent navigation gate. No navigation
assertion, timeout or transport behavior is changed by R17. Broad release readiness
remains **NOT READY** while that failure, auth/cron follow-up, dependency findings,
public history artifacts and account-level Preview credential controls remain open.
Merge R17 only after its base/security stack is reviewed and this branch's full CI is
verified; do not merge experimental integration PRs wholesale or promote to production.

## Completed R17 verification and current handover

Draft PR: https://github.com/Assyauq26/Gheverhan/pull/57.
Implementation commit: `6ab625bbf7711670cc13d7dc42590f35ba14bbba`.

| Gate | Result |
| --- | --- |
| Unit / containment | **PASS**, 168 unit / 24 files + 20 containment, no skips |
| Typecheck after build | **PASS**, sequential `--incremental false` |
| Lint | **PASS**, no warnings/errors |
| Production build | **PASS**, local test DSNs only |
| Repeated cart concurrency | **PASS**, four scenarios × five repeated runs, including 25 add/checkout races |
| Full PostgreSQL product / transaction / refund suites | **PASS**, 23 / 26 / 30 tests on the combined security + cart source |
| Product browser | **PASS**, 16 checks, including Marketing and quoted checkout |
| Operations browser | **PASS**, 20 checks, payment proof / permissions / stock / shipping / responsive layouts |
| Original R17 navigation run 1 | **FAILED**: all ten navigation steps completed, then strict no-browser-error assertion caught React #418 on `/shop` at **both** 390px and 1360px |
| Original R17 navigation run 2 | **FAILED**: desktop shop back-navigation remained on the wrong page; original 5s assertion failed |
| GitHub unit at implementation SHA | **PASS**, [38920881011](https://github.com/Assyauq26/Gheverhan/actions/runs/38920881011) |
| GitHub full isolated integration/browser at implementation SHA | **PASS**, [38920881203](https://github.com/Assyauq26/Gheverhan/actions/runs/38920881203), including all four new cart scenarios |
| Vercel Preview build status | **PASS** provider status; no authenticated Preview HTTP smoke |
| Production HTTP GET smoke | **PASS**, `/`, `/shop`, `/login`, `/api/v1/health` each 200; expected HTML titles |
| Production Chromium / Preview administrative controls / Actions log download | **BLOCKED**, as recorded in R16 |
| Release readiness | **NOT READY** |

The R16 code and R17 code both pass remote full CI; repeated local browser failures
still disprove consistent navigation/hydration correctness. Do not rerun until green
and discard the failures. Across unmodified local suites, R16 had two successful full
runs and one failure; R17 had two further failures. These are **five runs, two passes,
three failures**, not a passing intermittent gate. Local system Chromium differs from
the Playwright browser installed in GitHub CI; that difference has not been proven to
be causal.

Useful local evidence (safe synthetic fixture output):

- `/tmp/gheverhan-r17-cart-before-settled.log`: all three pre-fix concurrency failures.
- `/tmp/gheverhan-r17-cart-1.log` through `cart-5.log`: repeated fixed behavior.
- `/tmp/gheverhan-r17-navigation-1.log`: both viewport #418 signatures.
- `/tmp/gheverhan-r18-dev.log`: second unmodified R17 suite (the filename is historical;
  this run used the original production script, **not** a development server).
- `/tmp/gheverhan-r18-instrumented-1.log`: separate diagnostic production build also
  failed desktop shop pagination with HTTP 200 then `ERR_ABORTED`.

A sparse, detached worktree at `/tmp/gheverhan-r18-diagnostic` was used solely for
hydration diagnostics, without copying PostgreSQL artifacts or editing shared
node_modules. A corrected development-mode shop-only run passed four checks without
reproducing the detailed hydration mismatch. A diagnostic Webpack loader adds logging
of React's recoverable-error component stack while retaining the original error
reporter. Neither diagnostic changes application source in PR #56/#57, relaxes the
original assertions/timeouts, or establishes a root cause. Further focused diagnostic
results belong to this unresolved investigation, not to the passing cart gate.

## Remaining owner/configuration actions and safe order

All R16 blockers remain. PR #37 and #38 are still open/draft and their existing unit
and isolated workflows report success, but they are **excluded** from this integration.
PR #37 requires `RESEND_API_KEY`, verified `PASSWORD_RESET_FROM`, and an HTTPS
`PASSWORD_RESET_BASE_URL`; its own description explicitly leaves session revocation
and distributed/IP rate limiting pending. PR #38 needs the `frontend` Vercel project
root, production-only `CRON_SECRET`, overdue-backlog review and confirmation that daily
scheduling is acceptable. Its recorded Vercel build status is a rate-limit failure.
No provider settings or production jobs were changed.

Review #40/#42/#44 with #56, then #57 after its base is integrated into a reviewed
release candidate. Validate #41/#45/#46/#54/#55 together, resolve the strict intermittent
browser gate, and separately complete #37/#38 and dependency remediation. Keep #39's
public PostgreSQL history incident on hold for owner incident-response decisions.
Do not merge #53 or the experimental diagnostic branches wholesale. No production
merge/deployment or shared Supabase mutation was performed.
