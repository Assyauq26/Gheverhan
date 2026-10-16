# Remediation R8 — Chromium hydration diagnostics (non-production)

## Observed failures
- PR #42 navigation suite sometimes completes all ten mobile/desktop navigation checks, then reports React production hydration exception `#418` (server HTML/client DOM mismatch).
- Other attempts failed on desktop admin pagination after clicking Next, while the navigation state had not changed within the test timeout.
- These failures are not caused by PR #42 JWT claim logic as far as the available traces establish; the root hydration cause is **not yet proven**.

## Changes
- Retain strict failure on **any** uncaught browser exception, even if React recovers visually; do not suppress hydration errors or mark flaky runs successful.
- Browser console reports failing pathname (without query parameters), viewport, current test step and `document.readyState` captured at the hydration fault, without cookies/tokens/DB URLs.
- Persist `navigation-results.json` to the temporary isolated CI path **also on failed assertions**, not just successful runs.
- The test uses only its dedicated local disposable PostgreSQL fixture. There are **no production or shared Supabase writes**.

## Follow-up acceptance
1. Inspect CI's first `[hydration-diagnostic]` and `[browser-exception]` logs to locate the route and whether the HTML parser was still loading.
2. If reproducible, fix the actual component/server-stream cause in its own code PR. Do NOT add `suppressHydrationWarning` globally or ignore error #418.
3. Require a clean full Chromium run, plus independent unit/DB integration CI, before removing Draft status from #42.

## Release
Draft test-only PR; no schema, env, credentials, main merge or live deployment requested.
