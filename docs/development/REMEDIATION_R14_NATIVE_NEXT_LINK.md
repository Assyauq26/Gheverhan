# R14 — Next.js native Link navigation experiment

## Reproduction
Cross-PR integration CI on R13 succeeded once, then failed during a second
isolated Chromium run: admin pagination at 1360px remained on page 1 for
15 seconds. The failing RSC trace reported HTTP 200 responses followed by
`net::ERR_ABORTED`, with no remaining in-flight RSC requests when the
assertion fired. A read-only full HTML request also returned 200. Root cause
is not conclusively proven, but the existing custom NavigationLink prevented
NextLink's own navigation and launched an independent router.push inside
`startTransition`.

## Experiment
- Keep all form submission navigations using the existing provider and router.
- For user-initiated links, let **NextLink** run its normal App Router
  transition. Remove the `event.preventDefault()` + duplicate router.push
  from its `onNavigate` callback.
- Observe native `useLinkStatus()` from a child inside each NextLink and
  expose an aggregated pending banner in NavigationProvider.
- Track each Link by React useId to avoid cross-link cleanup prematurely
  clearing another in-progress navigation.
- Keep native onNavigate handlers, normal hrefs, modifier-click behavior and
  the existing live feedback assertions.

## Validation
This is an experimental branch off the unmerged R13 integration branch, not
a proposal to merge straight into main. Require typechecking and Next build
(to prove Next.js 15.5.26 exports useLinkStatus), plus the existing isolated
PostgreSQL and Chromium suite. Intermittent failures require repeated runs
and do not disappear simply because a single attempt passes.

The shared dummy-data Supabase project is NOT used by CI and no production
configurations or records are touched.
