# Remediation R9 — Block Preview data/schema mutation npm scripts

## Why
The owner approved a single Supabase database for Gheverhan's DUMMY-DATA
development phase. Both main and Vercel Preview deployments can reach that
database. A Preview CI/build process MUST NOT change its shared schema or
bootstrap/seed accounts via npm script entrypoints.

## Guarded commands
The npm scripts `prisma:migrate`, `prisma:deploy`,
`prisma:bootstrap-admin`, and `seed` now run
`node scripts/assert-safe-db-operation.mjs` BEFORE Prisma/tsx.
If `VERCEL_ENV=preview`, the guard returns a nonzero exit code,
and the mutating command will not be executed.

This restriction applies **even when**
`GHEVERHAN_SHARED_DEV_DATABASE=true`. Database read/write
performed by the application is not blocked by this guard.

Production and manual local commands retain their existing behavior, but
a reviewer must approve any schema migration and confirm a recent recoverable
backup **before** executing one. The existing Preview runtime guard is in
PR #40; environment-specific JWT isolation is PR #42.

## Important limitations
- This guards only the four `package.json` scripts, not direct invocations
  of `npx prisma migrate`, arbitrary SQL/Node programs, compromised PR code,
  or Vercel project build-command overrides.
- Protect deployment/GitHub permissions and check the actual Vercel
  build/install commands; Preview must not use direct migration CLI.
- GitHub Actions PostgreSQL integration tests must continue to use their own
  **disposable localhost database**, never shared Supabase.
- Keep production service-role/storage credentials out of Preview.
- A paid backup entitlement must NOT be assumed. Confirm the project's plan,
  and take a controlled logical backup before a migration when needed.
- Before handling real user data, end the shared-DB exception entirely.

## Acceptance
Run unit tests (including `preview-database-script-guard.test.ts`), typecheck,
build, isolated PostgreSQL regression and browser tests. Hold this PR in Draft
pending review and coordination with #40/#42. No database operation was run
when creating this PR.
