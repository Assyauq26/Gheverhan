# R21 production Prisma migration — operator procedure

This change adds a **manual-only** GitHub Actions runner for the existing Prisma
migration `20261017000000_auth_session_controls`. It does not deploy the app,
seed/reset data, change Vercel configuration, or invalidate user sessions.

## Configure the gate before executing

1. GitHub repository **Settings → Environments**: create
   `production-db-migration`; require reviewer approval, and restrict
   deployment to branch `main`.
2. Store these environment secrets, never in the repository or chat:
   `GHEVERHAN_PROD_DATABASE_URL` and `GHEVERHAN_PROD_DIRECT_URL`. Use the
   reviewed **Production** connection strings for Supabase project
   `bztprltkevacidcpjaam`, database `postgres`, schema `public`.
3. Keep the GitHub workflows isolated-test CI green and double-check
   `main` has not changed unexpectedly. The workflow pins reviewed R21
   migration/schema/package files to commit
   `d5882c88fa9cc398b2a1cb458b502a2c92cf382b`.
4. Keep Vercel Ignored Build Step `Don't build anything`. Confirm that the
   **next** R21 Production deployment will have `MAINTENANCE_MODE=1`.
   The currently active old deployment is **not** placed in maintenance by
   changing that variable.
5. Freeze all external, Preview, and background database writers for the
   migration window. Guards on Prisma seed/migration scripts in Preview do
   **not** prevent its application code from writing to the shared database.
   Obtain operator sign-off that there are no unauthorized writers.
6. Document the previously agreed operator decision to skip a database backup
   because the existing data are dummy; skipping backup does **not** allow
   deletion/reset of database contents. Review the recovery procedure anyway.

## Manually execute

After the workflow PR is reviewed and merged, open
**GitHub → Actions → R21 controlled production Prisma migration**.
Select branch `main`, enter confirmation `MIGRATE_R21_AUTH`,
then use **Run workflow**. The GitHub Environment reviewer must separately
approve the job only after the above checks pass.

The runner performs a read-only project-identity and Prisma checksum/ledger
preflight, runs the project's **existing** `npm run prisma:deploy`,
and then performs another read-only schema/ledger/privilege verification.
It intentionally does not log connection credentials.

## Failure handling

* If preflight fails, **STOP**. Do not bypass the checks or paste SQL into
  the Supabase SQL editor.
* If the Prisma command fails, **STOP** and inspect the migration ledger and
  schema before retrying. Do not blindly mark a migration as complete.
* If postflight fails, keep the R21 application inactive; investigate whether
  the application runtime role can access the new tables. A separate
  authorized rollback plan is required for schema changes.

## After PASS

Confirm all **six** migrations in `_prisma_migrations`, valid indexes,
foreign key, RLS, and correct runtime privileges. Recheck the live domain
still resolves to the old `8e2a4f4` deployment, then separately approve
a **maintenance-mode** production deployment of reviewed R21 source.
Run release preflight and complete login, password reset, cart, checkout,
order, and dashboard smoke tests before any public cutover.

This operator procedure does not by itself prove that user traffic or
existing Preview deployments cannot write during migration.
