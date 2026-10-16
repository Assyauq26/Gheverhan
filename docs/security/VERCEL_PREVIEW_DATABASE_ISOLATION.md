# Remediation R5 — Shared dummy-data development database (approved 2026-10-16)

## Current decision
Gheverhan has **no real customers/orders/payment data yet** (owner-confirmed). Its
Vercel Production (main) and Preview (PR) deployments may temporarily use the
**same existing** Supabase development PostgreSQL project, ref
`bztprltkevacidcpjaam`. **No additional Supabase project is needed.**

This is a knowingly reduced-isolation DEVELOPMENT-ONLY exception. Any PR
deployed on Preview can modify dummy records also visible on the main site.
Treat Preview builds as trusted code: require review before opening sensitive
endpoints or running migrations. Revisit isolation before onboarding real users.

## Runtime boundary
`frontend/src/lib/prisma.ts` invokes `assertPreviewDatabaseIsolation`.
On `VERCEL_ENV=preview`, the guard requires:
- `GHEVERHAN_SHARED_DEV_DATABASE=true` explicitly configured on **Preview**.
- Both `DATABASE_URL` and `DIRECT_URL` point at the currently approved
  Gheverhan Supabase project (direct host `db.bztprltkevacidcpjaam.supabase.co`
  as `postgres` or official pooler username `postgres.bztprltkevacidcpjaam`).
- Wrong/missing URLs, wrong usernames, or missing approval fail closed.
- Errors never print credentials or connection URLs.

The guard is specific to the existing dummy-data project and is not a general
permission to connect Preview to future production customer data. This is
**not** a migration/CLI security boundary: Prisma CLI and arbitrary scripts
can bypass `src/lib/prisma.ts`.

## Vercel environment setup
- `DATABASE_URL`: Production + Preview (same database credentials).
- `DIRECT_URL`: Production + Preview (same database credentials).
- `GHEVERHAN_SHARED_DEV_DATABASE=true`: Preview only.
- `JWT_SECRET`: **different secret per environment**. Never share the
  production signing key with Preview, even though data is shared. Keep
  original Production secret unchanged to avoid invalidating Production sessions.
- Keep `SUPABASE_SERVICE_ROLE_KEY` and storage service credentials
  **Production-only** unless separately scoped and reviewed. Sharing the DB
  does NOT authorize Preview access to privileged storage buckets or keys.
- Do NOT use `NEXT_PUBLIC_` for secrets or database connection strings.

Changes to Vercel environment scope do **not** retroactively revoke secrets
already embedded in old deployments. Inspect/delete or protect stale Preview
deployments if any credentials were previously exposed.

## Controls before merging
1. CI must use its own disposable LOCAL PostgreSQL instance; never point
   browser/integration tests, reset scripts, or migrations at shared Supabase.
2. Back up the existing database before schema migrations; migrations on main
   are manually approved, never automatically executed by Preview builds.
3. Test a Preview READ on existing dummy data only; keep destructive tests
   inside the ephemeral CI database. Review PR trust model and Preview URL
   access protection.
4. Confirm PR #42 separate JWT issuer/audience is merged and Preview has an
   independent `JWT_SECRET`; test that a Preview session is not accepted by
   Production and vice versa.
5. Explicitly end this exception before ingesting *any* real customer data
   (names, addresses, password hashes, payment proofs, orders).
6. This is a **draft PR** and does not authorize a release to main.

## Trade-offs
Shared DB enables fast iteration but means a Preview defect or compromised
PR can edit common tables. Preview deployments MUST be treated as live access
to the dev dataset. When real data arrives, split DBs or disable Preview DB
access entirely and retire `GHEVERHAN_SHARED_DEV_DATABASE`.
