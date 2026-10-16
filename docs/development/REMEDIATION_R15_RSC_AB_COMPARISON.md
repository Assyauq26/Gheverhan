# R15 — A/B isolation of RSC delay interceptor

## Question
The R14 integration test passed after **two** changes at once:
1. Native NextLink navigation replaces manual preventDefault + router.push.
2. Playwright RSC latency is delivered after fetching the upstream response,
   not before calling route.continue().

A passing test cannot identify which change matters. R15 restores the
original `navigation.tsx` from `main` and keeps the revised **identical 600ms**
delayed RSC response delivery. It retains all original strict pagination and
hydration assertions, combined R40/R42/R44/R45/R46/R49 code and test fixtures.

Interpretation:
- If R15 repeatedly passes, the Playwright interception mechanism is a
  likely source of the CI-only aborts; the native Link refactor is not needed
  merely to make tests pass.
- If R15 fails while R14 repeatedly passes, the native Link change may also
  be necessary.
- A single pass/fail remains insufficient to eliminate intermittent risk.
- Both cases still require an independent realistic slow-network browser test
  on a trusted nonproduction deployment before claiming production stability.

This is test-only and MUST NOT be merged to `main`.
