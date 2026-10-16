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
