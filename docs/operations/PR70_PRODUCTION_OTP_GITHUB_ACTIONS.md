# PR #70 — Approval-gated Production Prisma OTP migration

**Status: preparatory only; no Production DDL or deployment by this PR.** This workflow targets only the reviewed source commit `b1e38ce3086ee85df5fd01e609cc5e89e3db949f`, migration `20261018150000_registration_email_otp` (SHA-256 `eec85ff983628830923da3c7b0760bfc20378bdcf9cb7376dd6b1cca539eb84e`) against Supabase `bztprltkevacidcpjaam`. Code review and isolated regression CI passed at the pinned source. The owner explicitly approved skipping additional backups and the associated irreversible data-loss risk.

## Configure before merging/dispatching this workflow

1. In GitHub **Settings → Environments**, create or verify `gheverhan-production-db-migration`. Enforce **Required reviewers** who can independently approve; prevent self-review if supported; restrict deployment branches/tags to `main`. **Do not merely create an unprotected environment**.
2. Within that *environment only*, store `PRODUCTION_DATABASE_URL` (application/runtime PostgreSQL URL) and `PRODUCTION_DIRECT_URL` (direct/session PostgreSQL URL) for the Supabase Production project. Values must remain secret, never in chat or PR comments; protect the source of the secret. Ensure the URL's effective database is `postgres`, schema `public`, and direct/session endpoint is not a transaction pooler.
3. After independently checking the actual GitHub Environment settings, create environment **variable** `PRODUCTION_MIGRATION_APPROVAL_CONFIGURED=yes`. This acknowledgement alone is not approval enforcement.
4. Verify and document Resend's domain and **actual permitted inbox delivery**, control all old registration writers including older Vercel Preview deployments, ensure Preview credentials can't write to Production, coordinate the cutover window and stop/recovery plan. Changing future Preview environment scopes does not revoke old immutable deployments' credentials.
5. Review the workflow code for its `workflow_dispatch`-only trigger, `main` branch guard, immutable source checkout, no log printing credentials, `contents: read`, serial concurrency and *Prisma CLI* execution. The workflow deliberately omits backup, seed, reset, auto-deploy and auto-merge.

## Execute after this workflow-only PR is safely merged to `main`

GitHub → Actions → **PR70 Production OTP Prisma Migration (manual and approval gated)** → Run workflow → branch `main`.

**First invocation: read-only preflight**

- Operation: `preflight`
- Supabase project ref: `bztprltkevacidcpjaam`
- Leave remaining optional fields blank.
- Approve GitHub protected environment review and inspect the successful logs for the `before` phase. Do not run `apply` on an unexpected ledger, checksum, schema, URL or grant.

**Second invocation: apply** — only after all required operational controls are truly met

- Operation: `apply`
- Supabase project ref: `bztprltkevacidcpjaam`
- Apply confirmation: `APPLY_PR70_OTP_NO_BACKUP`
- Writer freeze confirmed: `YES`
- Resend delivery confirmed: `YES`
- Have the required reviewer approve the protected environment independently.

The runner checks exact source+historical checksum ledger (six completed migrations, exactly one OTP pending); then executes `npm run prisma:deploy`, followed by a read-only postcheck requiring seven complete migrations, OTP table+column, RLS, indexes and effective DB role privilege. **Do not retry automatically** if apply fails or postcheck blocks. Investigate the database before any follow-up.

## Release PR #70 only after the database step

Use the existing `release:preflight` from the exact source commit with Production application environment to verify role/configuration. Confirm ledger7 from Supabase independently, Resend, no unapproved Preview writers, and current PR HEAD+CI still equal the frozen SHA. Then SHA-guarded squash-merge PR #70. Verify Vercel Production deployment/alias, OTP registration inbox, login and no unexpected errors. No automated merge in this workflow.

**Important:** Merging this workflow-only PR to `main` may itself trigger a Vercel build from `main`; the source code change is limited to workflow/docs and must be reviewed for that side effect. Do not merge the workflow until GitHub Environment reviewer enforcement and production auto-deploy implications are verified.