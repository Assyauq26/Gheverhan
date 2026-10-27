# V4 migration / rollback runbook

V4 stops at a reviewable PR. Do not merge, deploy or run Production migrations without new user approval. Use current Helipod/local PostgreSQL/persistent media/Resend infrastructure; do not provision Vercel or Supabase.

## Before a separately approved release

1. Confirm exact-head review and all CI, including isolated review migration/security suites and browser evidence. Retain previous application artifact and the normal verified database backup per existing operations policy; never print credentials.
2. Inspect `20261027090000_verified_purchase_reviews/migration.sql`: one nullable Review column, unique index and FK; no destructive SQL, proof backfill, order/payment/inventory rewrite, or old review deletion. Lock timeout3s / statement timeout30s fail closed on a busy Review table.
3. Apply official Prisma migrations through the established release workflow before switching the app. The extended read-only deployment preflight verifies the actual nullable column, valid unique index on that column and correct OrderItem FK. Do not use migrate reset or db push.
4. If a lock timeout leaves an unfinished migration ledger entry, verify the transaction rolled back and inspect actual schema; use official `prisma migrate resolve --rolled-back <migration>` only after confirming no partial committed DDL, then rerun deploy during a suitable window. Isolated tests exercise this exact recovery. Never mark a migration applied without proving the schema.
5. Smoke test published storefront prices/PDP, received-order review, denial/duplicate handling, regular/direct checkout quote/submit, media and theme without unnecessary Production transactions.

## Rollback

Leave the additive column/index/FK and new evidence records in place. Do not delete or convert reviews/orders to restore visuals. Prefer reverting the UI commit while retaining the verified review writer/readers and the atomic snapshot fix, then rerun checks; a UI regression need not reopen the review security gap.

A full rollback to the pre-V4 application would re-enable its unverified review writer/readers. Treat that as a security regression: retain the V4 review security commits or disable review submission through an approved operational control before such a rollback. Prefer a forward fix. Previous database cache ratings can contain legacy/unverified values; the V4 verified projection is authoritative.

Document any later release/rollback approval, exact image/commit, migration/preflight result and health response in the PR/release record. Physical iOS/Android, keyboard/browser chrome and assistive-technology QA remain manual and must not be represented as completed by Chromium viewport emulation.
