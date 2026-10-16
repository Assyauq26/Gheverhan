# Remediation R5 — Isolate Vercel preview database

## Verified risk
On 2026-10-16, Vercel project `Gheverhan` exposes the same
`DATABASE_URL` / `DIRECT_URL` secret entries to both `production` and
`preview`. This is risky because preview requests can access shared data.

## Code guard
`src/lib/prisma.ts` now rejects Vercel preview DB initialization unless:
- Both URLs identify the same **separately approved** Supabase preview project.
- `GHEVERHAN_PRODUCTION_SUPABASE_REF` and
  `GHEVERHAN_PREVIEW_SUPABASE_REF` are present, valid, distinct 20-character
  references; do not put these values in `NEXT_PUBLIC_*`.
- Host/username prove the URLs belong to the PREVIEW project (direct
  `db.<ref>.supabase.co` or supported Supabase pooler user
  `postgres.<ref>`). Other DSN types fail closed.
- This guard affects `VERCEL_ENV=preview` only; production/local unchanged.

## Required operator workflow (before removing DRAFT status)
1. Create a **separate Supabase preview project** (cost/plan must be approved
   by owner). Initialize schema/migrations with synthetic seed data ONLY,
   no production customer orders, passwords, tokens, addresses or payment files.
2. In Vercel, split the shared `DATABASE_URL` and `DIRECT_URL` entries by
   environment, applying **production credentials to production only** and
   **preview credentials to preview only**.
3. Add `GHEVERHAN_PRODUCTION_SUPABASE_REF` and
   `GHEVERHAN_PREVIEW_SUPABASE_REF` for preview scope only.
   Production project reference is configuration metadata, not an auth token,
   but still avoid unnecessary public exposure.
4. Do not allow preview app builds or migration runners to use production
   DB credentials. Prisma CLI, scripts and other direct DB entrypoints
   require separate CI/deploy configuration audits; the runtime guard protects
   app imports using `@/lib/prisma` but not arbitrary external DB clients.
5. Validate a preview build with test accounts/dummy products. Confirm a
   preview write appears ONLY in preview DB, and that production row counts
   remain unchanged.
6. Re-run independent CI, inspect PR review, and only then merge; monitor
   production Vercel logs after deployment.

## Safe failure mode
Until the preview DB is provisioned and env variables separated, preview
deployments may build with missing env but DB operations **must fail closed**.
Do not switch off this guard for convenience.
