# Remediation R13 — Native Next.js link navigation

## Evidence
Repeated isolated Chromium failures affected both `/admin/products` and
`/shop`, often on desktop. The combined R12 CI trace recorded several
`/admin/products` RSC responses returning HTTP 200 (about 600ms after the
synthetic response delay), followed by browser `net::ERR_ABORTED` and
a page stuck at page 1. The outgoing `NavigationLink` component intercepted
Next.js's `onNavigate`, called `preventDefault()`, then launched a second
`router.push` wrapped in its own transition.

This dual ownership is a credible cause of cancellation/conflicting router
transitions; the trace does not prove it is the only hydration source.

## Change
- Native `NextLink` always owns link navigation and client RSC transitions.
- Remove `preventDefault()`/custom `router.push` from link `onNavigate`.
- Use Next.js 15 `useLinkStatus` INSIDE each link for its native pending
  state and preserve the global `navigation-pending` test indicator.
- Preserve `NavigationProvider.navigate` for enhanced GET forms and searches
  which intentionally use imperative navigation.
- Keep `onNavigate` callbacks forwarded rather than silently calling them
  then preventing Next's default behavior.

## Acceptance
Require unit/typecheck/build, isolated PostgreSQL and Chromium in both
390px/1360px scenarios, and at least one rerun after full CI success.
Do not disable React hydration #418 assertion, mute browser exceptions, or
increase timeouts solely to pass tests. Do not merge to main until review.
