# Gheverhan — GitHub Actions final Production cutover (PR #75 → #83 → #84)

**Status: AWAITING REVIEW / SECRETS / VERIFIED MAINTENANCE. This workflow is not permission to bypass safeguards.**

This is a *separate* automation PR based on `main`. It makes the already-existing `production-migration` GitHub Actions environment the only operator for approved Prisma schema writes, instead of relying on ChatGPT's Vercel connector (which returns scoped HTTP 403).

## Source pins / migration hashes

- #75: `d685813d02e457e5ccc182a145598c3b139b5559` (requires review).
- #83: `62477c97ded2ac2ab552b31c7e9ac1a3fd045032` (requires review).
- #84 immutable release source: `ec3e56f8b84d3446a3c19a51a8049d2beb999896`.
- Approved schema only:
  - `20261020070000_custom_product_variations`: `499d4c6259b90c2342c5dc1a2baebcb04e72751c8a9f3111414ad7db492e4735`
  - `20261020120000_direct_checkout_intents`: `96c9e45d13d8379c67bfdd87f3971664e3dcd43d19b6e430f60f7899186f55f0`.
- Eight previously applied Prisma migrations are SHA-256 pinned in `.github/scripts/gheverhan-final-release-gate.mjs`.

## One-time configuration (authorized operator only)

1. Review and approve this automation PR, and merge it to `main` **only when this workflow itself has passed code review**. Its only app-impacting files are `.github/workflows/` and `.github/scripts/`; it does not migrate or deploy by merging. Note: even a workflow-only commit can trigger Vercel Git deployment when main autodeploy is on; first examine this behavior using the existing Production project settings.
2. Open repository **Settings → Environments → production-migration**. Retain required human reviewers and prevent unprotected branches from deploying to this environment. Do not turn off environment approval or branch protection.
3. Via GitHub's secret UI, verify protected **environment secrets** (do not paste them in chat): `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_DB_CA_CERT`. Add `VERCEL_TOKEN` with access to scope `syauqi3` and project `gheverhan`; it must have permission to read project/deployments/domain metadata. If scoped Vercel API still returns 403, stop rather than remove the scope or try an unrelated project.
4. Confirm Production URL IDs, PostgreSQL SSL verify-full, app role/DDL privileges, migration checksums, preview/live writer inventory and agreed recovery constraints. The previous decision **not to create an additional backup because data is dummy** must be reconfirmed explicitly at run time.
5. Use GitHub's PR review UI for #75, #83 and #84. An authorized human (requested reviewer: `mrifatsyauqi`) must approve **each exact pinned HEAD**. This workflow refuses to migrate if any of them remain unapproved or if their two required CI workflows are not SUCCESS. Do not self-approve or bypass protected branch review.

## How to execute

Open **Actions → Gheverhan controlled final Production migration and verification → Run workflow**.

Choose branch **main** and supply:
- `project_ref`: `bztprltkevacidcpjaam`
- `approved_sha`: `ec3e56f8b84d3446a3c19a51a8049d2beb999896`.

### First: `operation = preflight`

Set both maintenance/writer acknowledgments to NO and backup to UNCONFIRMED. This performs pinned source, approvals, Vercel scope/alias and database read-only ledger/Prisma pending checks. It does **not** mutate Production. It will fail closed until three human reviews and all protected secrets are present.

### Second: `operation = migrate`, ONLY after preflight PASS

Operator must verify:
- Preview, immutable old deployments, cron/webhook and active writers are effectively isolated, not merely configured.
- Current Production is in closed `MAINTENANCE_MODE=1`, verified GET and POST from both public domains return HTTP 503, contain maintenance message and `no-store` cache policy.
- Main Git autodeploy is paused (or otherwise proven unable to activate incompatible code). No queued/running deployments.
- Operational recovery/backup decision is documented. No automatic backups will be taken by this workflow.

Inputs:
- `maintenance_confirmed = YES`
- `writer_isolation_confirmed = YES`
- `backup_decision = NO_ADDITIONAL_BACKUP_DUMMY_DATA`

The job checks the exact historical 8/8 Prisma ledger and the two pending migrations, verifies the frozen source, approval and TLS, then calls official `npm run prisma:deploy` from candidate SHA. Afterward it checks 10/10 ledger and official up-to-date Prisma status. **Never retry a failed migration blindly.** If an error occurs, inspect the ledger/schema and follow the candidate runbook.

### Third: merge and Production deployment

After 10/10 schema and app-role/preflight checks pass:
- Merge PR #75, then retarget/merge #83, then #84; honor GitHub required checks/reviews, and verify final main tree/CI.
- Use one controlled Vercel Production deployment of final main. Git auto-deploy is acceptable only after verified writer isolation and safe final schema. This workflow intentionally **does not merge PRs or deploy code**, because GitHub's required-review policy and provider release controls must not be bypassed.
- Verify final Vercel READY and alias/source commit with scoped provider access.

### Fourth: `operation = verify_live`

Run the same workflow from `main` with `approved_main_sha` set to the exact final merged `main` commit. This mode verifies the Vercel READY Production Git source and read-only public HTTP routes. It is **not** a substitute for authenticated seller/variation/OTP/direct-checkout smoke tests or payment reconciliation. Those require separate controlled dummy accounts and evidence.

## Hard-stop outcomes

- Missing GitHub approval on #75/#83/#84.
- GHA secrets missing or wrong Supabase project identity.
- Vercel token 403 or wrong team/project/domain.
- Production maintenance 503 not observed or operator cannot attest all-writer isolation.
- Unexpected Prisma migration name, checksum, failed/incomplete ledger row, or DB drift.
- Active deployment, unapproved source SHA, CI fail, unexpected queued writer.
- Reviewer approval and required checks not verifiable by workflow GitHub token.
- Postmigration app-role/preflight not verified before merge.

Keep release status **BLOCKED** until every gate has evidence. Never print secrets, remove RLS, edit `_prisma_migrations` manually, run `db push`, force-merge, or execute production SQL outside approved migrations.
