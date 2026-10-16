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
- R2 (#37) one-use password reset tokens with fail-closed Resend delivery.
- R3 (#38) safe expiry of unpaid orders via authenticated production cron.
- R6 (#41) voucher reservation/usage exclusion for CANCELLED/EXPIRED orders.

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
8. R2, R3, and R6 code/tests are INCLUDED for cross-sprint integration, but
   email reset requires verified Resend sender and RESEND_API_KEY / PASSWORD_RESET_FROM /
   PASSWORD_RESET_BASE_URL; cron requires CRON_SECRET and production cron registration.
   Do not enable either service without an operational smoke test and proof review.
   R4 artifact clean-up (#39) is on HOLD for incident review.
9. Node.js engines aligned: Vercel project setting changed from 24.x to 22.x
   and re-read for verification on 2026-10-16. Repo and CI already require
   Node 22. This does not retroactively change the existing production build.
10. No main merge, production promotion, database migrations, wipes or secret
    rotations should occur from this Draft integration PR.

## Next.js references
https://nextjs.org/docs/15/app/api-reference/functions/use-link-status
https://nextjs.org/docs/15/app/api-reference/components/link

## Cross-sprint merge verification
PR #38 modifies transaction correctness tests for proofs awaiting review, while
PR #41 adds coupon quota lifecycle tests to the same file. These were combined
without dropping either test. PR #46 changes Marketing SSR dates, and PR #41
renames voucher counters; both changes are retained in the same Marketing client.
The shared database contains dummy data by owner decision; full integration
runs in disposable CI Postgres and MUST NEVER seed/reset shared Supabase.

## CI regression isolation improvement
The original Playwright network route delayed **every** non-prefetch RSC
request by 600 ms, across all navigations. Logs show several successful 200
RSC responses immediately followed by ERR_ABORTED streams during pagination.
The harness now injects this delay only for explicit navigation-feedback
checks; the pagination checks remain strict against real response behavior.
One CI integration run repeats navigation/browser 3 times on freshly created
synthetic fixtures, preserving all error/hydration assertions.
