# Remediation integration R13 — all security + navigation + hydration changes

## Scope (2026-10-16)
This is a **Draft integration verification**, not a production release. This
branch combines:
- R5 (#40) shared DUMMY-DATA Supabase project Preview guard,
- R7 (#42) JWT Preview identity separation and distinct Vercel signing secrets,
- R9 (#44) refusal to run npm Prisma migration/seed/admin bootstrap in Preview,
- R10 (#45) admin pagination and read-only RSC route diagnostics,
- R11 (#46) deterministic Marketing SSR clock/timezone,
- R12 (#47) semantic, non-nested wishlist action markup.

## Root-cause investigation
The original `NavigationLink` cancelled Next.js `onNavigate` with
`event.preventDefault()` and then initiated a second `router.push` inside
a custom React transition. This custom re-routing affects **both** admin and
storefront routes and is a plausible common source of intermittent streamed
RSC navigation stalls. R13 removes this interception: `next/link` handles
navigation, while Next.js 15.3+ `useLinkStatus` supplies native pending state.
Forms and search continue using the shared `NavigationProvider.navigate`
programmatic API; they are not native link clicks.

Independent confirmed issues:
- ProductCard had `<button>` nested inside an `<a>`, violating HTML
  interactive content model.
- Marketing rendered `Date.now()` client and locale-dependent date strings
  during SSR/hydration.

**These findings are code-based risk factors, NOT proof that every #418 error
has been eliminated.** A green run must be repeated before release.

## Safety gates
1. New unit tests, typecheck, build and lint must all pass.
2. Full PostgreSQL integration and Playwright navigation must use disposable
   `localhost:5432/gheverhan_sprint1_test` only.
3. Run the Chromium navigation regression in at least two fresh jobs to detect
   intermittent page-2 freezes and hydration `#418`; do not ignore failures.
4. Verify JWT preview/production token claims and secret scopes (no key values
   logged, decrypted, or stored in Git).
5. Preview should never execute migrations and seeding. Direct Prisma CLI
   commands are outside the npm script guard; GitHub/Vercel review is required.
6. The root preview-database guard is restricted to the approved dummy-data
   Supabase project. Before real customers, remove the shared-DB exception.
7. Inspect old Preview deployments and the R4 tracked PostgreSQL runtime files
   in git history, regardless of whether build workflows pass.
8. R2 password reset (#37) and R3 expiry (#38)/R6 coupon (#41) are NOT
   included in this branch pending provider configuration and combined payment
   lifecycle tests. R4 artifact clean-up (#39) is on HOLD for incident review.
9. Align Node.js engines: repo/CI Node 22, Vercel project Node 24.x.
   This requires a reviewed project setting change, not a side effect of PR.
10. No main merge, production promotion, database migrations, wipes or secret
    rotations should occur from this Draft integration PR.

## Next.js references
https://nextjs.org/docs/15/app/api-reference/functions/use-link-status
https://nextjs.org/docs/15/app/api-reference/components/link
