# R23 — Production Prisma migration workflow (Gheverhan)

Status: **DRAFT / NOT EXECUTED**. This PR defines a future manual operation. No database migration or deployment is performed.

## Target and scope

- Repository: `Assyauq26/Gheverhan`
- Approved release source commit: `d5882c88fa9cc398b2a1cb458b502a2c92cf382b` (squash of PR #65)
- Supabase project: `bztprltkevacidcpjaam`
- Prisma migration: `20261017000000_auth_session_controls`
- Workflow file: `.github/workflows/production-prisma-migration.yml`
- Current live Vercel production source when prepared: `8e2a4f4`
- This runbook does **not** authorize deploying R21, changing Vercel build behavior, expiring sessions, deleting data, or running the migration automatically.

## Prerequisites before merging or dispatching the workflow

1. Review the PR and ensure the workflow contains only the explicitly approved manual migration path. Verify the workflow does **not** trigger on push, pull_request or schedule.
2. In GitHub **Settings → Environments**, create **exactly** `gheverhan-production-db-migration`.
3. Configure **Required reviewers**, prevent self-review when supported, and restrict **Deployment branches/tags** to `main` only. Merely naming an environment in YAML does **not** create approval enforcement. If these settings are unavailable, **DO NOT MERGE or DISPATCH** until an alternative approved control exists.
4. Store these as **environment secrets**, not repository-wide secrets:
   - `PRODUCTION_DATABASE_URL` — pooled/runtime database URL targeting project `bztprltkevacidcpjaam`.
   - `PRODUCTION_DIRECT_URL` — approved direct/migration database URL targeting the same project.
   Never put credentials in GitHub code, PRs, comments, logs, or ChatGPT.
5. After actually reviewing required-reviewer and branch restriction settings, set **environment variable** `PRODUCTION_MIGRATION_APPROVAL_CONFIGURED` to `yes`. This is only an operator acknowledgement; it **does not enforce** the settings by itself.
6. Confirm both database connection strings use database `postgres`, schema `public`, and target only the specified Supabase ref. The runner refuses other project refs and does not print credentials.
7. Confirm a maintenance/writer-freeze plan for existing production and all old **Preview** deployments (some still share the same database). The Vercel variable `MAINTENANCE_MODE=1` only applies to **new** deployments; the old live deployment still serves requests. Close/stop all writers and drain in-flight requests **before** performing a production migration. The workflow does not freeze external writers.
8. Confirm no other migrations/DDL jobs or production deployments are underway. Decide whether to take a backup/snapshot; owner previously elected to skip a full backup because records were dummy, but this is a known data-loss risk and does not authorize deletion.
9. Recheck the live production SHA and verify credentials, roles, database permissions, and expected migration checksum/ledger. If any condition differs, stop.
10. Obtain explicit release-operator approval for **running** the migration after the workflow has been reviewed and merged. Permission to create this PR alone is not permission to run migration.

## How to run after approval

GitHub Actions → **Production Prisma Migration (manual and approval gated)** → **Run workflow**, choose branch `main`.

### Step A: read-only preflight

- Operation: `preflight`
- Project ref: `bztprltkevacidcpjaam`
- Apply confirmation: leave empty
- Approve the protected environment if requested.
- The runner checks target database URLs, active Prisma migration checksums, expected **five** completed migrations, and absence of the three new R21 objects.
- A pass is not a proof that Vercel deployment, email delivery, or all old writers are safe.

### Step B: apply (separate manual dispatch)

Only with the writer freeze in effect and preflight PASS:

- Operation: `apply`
- Project ref: `bztprltkevacidcpjaam`
- Apply confirmation: `APPLY_R21_AUTH_SESSION_MIGRATION`
- Approve in the protected environment.
- The workflow checks out the **pinned** R21 source SHA and installs locked dependencies, performs the same read-only preflight, then runs **`npm run prisma:deploy`** (Prisma CLI) from `frontend/`.
- The postcheck verifies the Prisma ledger contains **six** completed migrations with matching SHA256 checksums, plus expected column, tables, indexes, foreign key, RLS, and privileges for the runtime DB role.
- A workflow failure does **not** roll back a partially applied migration; do not retry blindly or manually edit `_prisma_migrations`. Investigate the database state before any follow-up.

## Controls and limitations

- The `workflow_dispatch` trigger and `main` branch guard restrict invocation. Only the checkout source is pinned to `d5882c8`; changes to the workflow itself still require PR review.
- `permissions: contents: read`; checkout does not persist Git credentials.
- Missing GitHub Environment secrets or missing `PRODUCTION_MIGRATION_APPROVAL_CONFIGURED=yes` fail closed.
- Production credentials are not available on PR test workflows. A workflow defined only on the PR branch cannot be dispatched normally until merged to the default branch.
- The source has six Prisma migration files; the guard requires five already recorded, exactly one pending (`20261017000000_auth_session_controls`) and checksum parity. Unexpected migrations, schema drift or target mismatches stop the operation.
- All migration DDL is executed **only** by Prisma migrate deploy, not the Supabase migration subsystem or SQL Editor. This preserves the Prisma ledger.
- Manual approval in GitHub environments must be configured in Settings; this PR cannot configure or attest that dashboard setting.
- A successful migration is **not** permission to deploy or promote the new Vercel application. A separate controlled R21 deployment (maintenance-first, preflight, smoke tests, rollback plan and authorization) remains required.
- R21 login/JWT/session changes can invalidate user sessions. Owners must explicitly accept the impact before opening production traffic.

## After migration

1. Validate the ledger and schema again using a read-only check and inspect logs.
2. Verify new app's database role has the expected SELECT/INSERT/UPDATE/DELETE access and RLS bypass/approved policies for newly created tables.
3. Plan and approve a **separate** Vercel deployment of R21 in maintenance mode, verify 503 on business routes and 200 on health.
4. Once all checks pass, approve opening maintenance, perform buyer/seller smoke tests, and only then restore automatic build behavior.
5. Keep a record of workflow run IDs, approvals, SHA, findings and follow-up remediation.

**Stop conditions:** incorrect DB project, wrong branch, no required reviewers, exposed/shared secrets, Preview writers not frozen, active production writers, unexpected Prisma ledger or schema, privileges mismatch, unverified deployment controls, or unapproved migration run.
