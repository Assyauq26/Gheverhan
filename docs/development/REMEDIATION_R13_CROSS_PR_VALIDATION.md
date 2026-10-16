# R13 — Cross-PR validation on a disposable PostgreSQL database

Integration test branch containing the **unmerged content** of:
- #40: approved single dummy-data Supabase Preview runtime guard
- #42: Preview/Production JWT issuer and audience separation
- #44: block Preview-triggered project npm migrate/seed/bootstrap
- #45: shared admin product pagination links plus RSC diagnostics
- #46: deterministic WIB Marketing statuses across SSR/hydration
- #49: separate wishlist button from the product image anchor

## Why
Each independent PR was tested against main, not the combination. These
fixes touch shared authentication, ORM setup, React SSR, and package scripts.
A combined CI suite is required before progressing release reviews.

## Boundaries
**Only for CI**. Do not merge, deploy to Production, or run migrations against
shared Supabase. The GitHub integration workflow creates a disposable LOCAL
PostgreSQL service. Vercel Preview may deploy automatically using the
already-configured dummy-data DB (same project as main): do not enter real
credentials/orders or execute destructive tests there. This document cannot
substitute for environment access controls.

## Acceptance
- unit/containment checks,
- TypeScript, lint and full Next.js build,
- isolated real PostgreSQL checkout, stock, refunds and operations,
- two-viewport Chromium storefront/admin regression,
- independent reviewer security and accessibility inspection.

An intermittent browser regression is **not** waived on a green rerun.
Root causes and countermeasures remain in the individual PRs; the
combined branch exists solely to detect cross-PR integration defects.
Do not promote this integration branch to main.
