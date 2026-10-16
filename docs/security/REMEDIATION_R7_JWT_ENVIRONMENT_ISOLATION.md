# Remediation R7 — JWT isolation between Preview and Production

## Verified configuration (2026-10-16)
The owner chose ONE Supabase PostgreSQL database for DEVELOPMENT only because
all current catalog, customer, order and payment records are synthetic.
Vercel `DATABASE_URL` / `DIRECT_URL` are therefore deliberately scoped to
Production + Preview. That data-sharing decision is governed by PR #40.

However, JWT signing material is isolated regardless of database topology:
- Production: original `JWT_SECRET` retained, Production-only.
- Preview: separately generated strong `JWT_SECRET`, Preview-only.
- Both secret keys are server-only and must never be committed.
- `GHEVERHAN_SHARED_DEV_DATABASE=true` is Preview-only.
- Supabase service-role/storage keys remain Production-only.

The configuration metadata was verified without decrypting either JWT key.
A Vercel environment-scope update affects NEW deployments only. Inspect or
protect old Preview deployments separately; do not assume previously built
deployments have been retroactively revoked.

## Code behavior
- Production issuer `gheverhan`, audience `gheverhan-web` remain unchanged.
  Existing Production cookies keep the same signing key and claims.
- Vercel Preview uses issuer `gheverhan-preview`, audience
  `gheverhan-web-preview`.
- Cross-environment JWT acceptance is rejected by issuer/audience, independently
  of key separation; separate secrets also prevent JWT forgery between scopes.
- Old Preview sessions will need to sign in again after the new code deploys.
- Local development retains legacy claims solely for backwards compatibility.

## Release gates
1. PR #40 must be reviewed for the explicitly approved single-dummy-database
   guard. When real customers arrive, split databases or disable Preview DB
   access and remove the development exception.
2. Keep Vercel JWT keys scoped separately and **do not rotate Production JWT**
   without a planned session-invalidation event. Do not use `NEXT_PUBLIC_`
   secrets. A new Preview build is needed to use newly scoped variables.
3. Verify Preview sign-in and protected routes with SYNTHETIC accounts only.
   An existing Production JWT must not work in Preview; a Preview JWT must
   not work in Production.
4. Because data is shared, Preview test writes are visible to Production:
   no destructive E2E, delete/reset, migrations or background automation on the
   shared database. PostgreSQL/Playwright CI MUST use disposable LOCAL DB.
5. Verify Vercel environment assignments, code review, typechecking, isolated
   PostgreSQL CI and browser regression before merging this PR.
6. Inventory stale Preview deployments built while JWT_SECRET had both scopes;
   revoke/protect old deployments as needed. No production data migration or
   production token rotation is authorized by this PR.

## Security limitations
This implementation separates session authorization, NOT data access.
A Preview code vulnerability can still access dummy records in the shared DB.
The shared-DB exception must end before ANY real customer information appears.
