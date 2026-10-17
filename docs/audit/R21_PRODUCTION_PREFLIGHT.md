# R21 — Production readiness preflight (read-only)

Date: 2026-10-17 (Asia/Jakarta). Status: **NOT READY**. This file records observed state; it does not authorize migration, merge, credential changes, provider configuration, or production deployment.

## Provenance

- Integration candidate: Draft PR #63, `d002623665bdc06e61555d8f6ec3bc83d0650c39`, built from #61 + #60 + tooling changes #62, incorporating main's #59.
- Toolchain review: Draft PR #62, `ae9abacead0b7c4bcd3c01afca4a28b3f2fbcdfb`.
- #63 reports 221 unit, 25 containment, 94 isolated PostgreSQL, 17 product/cart browser, 21 operations/payment browser and local/CI navigation 10×44; CI runs 39024749844 and 39024749874 succeeded on the candidate. No live authenticated staging proof.
- Read-only Supabase connector: project `bztprltkevacidcpjaam` (Gheverhan), organization Free, region `ap-southeast-1`, PostgreSQL 17.6, project ACTIVE_HEALTHY.
- These observations **do not confirm Vercel's effective production `DATABASE_URL` points to this exact project**. Confirm connection identity via authorized settings before inferring a shared target.

## Database readiness: observed hard blocker

Prisma migration ledger from the observed Supabase project shows **five finished migrations**:

1. `20260922143925_init`
2. `20261015000000_add_refunded_payment_status`
3. `20261016112100_coupon_usage_limits`
4. `20261016112200_coupon_redemption_concurrent_index`
5. `20261016140500_product_scheduled_flash_sale`

The R20 candidate additionally requires **`20261017000000_auth_session_controls`**. Read-only schema introspection confirms at inspection time:

- `public."SessionRevocation"`: absent.
- `public."AuthRateLimit"`: absent.
- `public."User"."sessionVersion"`: absent.

Therefore **do not deploy R20/R21 auth code against this observed schema**. Schema changes must be staged and explicitly authorized; a read-only connection cannot assert the required trusted server role/RLS effective permissions. Querying the ledger on one project does not prove the schema of another production binding.

Other observed settings: `max_connections=60`, `statement_timeout=120000ms`, seven connections during the sample. None establishes a production connection pool budget or TPS capacity.

## Release blockers and owner actions

| Gate | Status | Required proof / owner approval |
| --- | --- | --- |
| Final source/CI candidate | PASS on R20 SHA | Re-run after any source/lockfile change; don't reuse old SHA results |
| Dependency security | HOLD: 0 Critical / 7 High / 2 Moderate per R20 audit | Per-advisory exploitability, mitigation and documented risk acceptance/compatible fixes |
| Dedicated staging | BLOCKED | Verify **separate** DB project/cluster, scoped runtime credentials, JWT key, private buckets, mail sink, payment/shipping fixtures, cron disabled |
| Auth migrations and trusted role | BLOCKED | Managed backup/restore proof, migration checksum and ledger, RLS role capability, lock timeout, migration window and operator approval |
| Connection pool/region | UNVERIFIED | Verify deployed Vercel functions region and pooled vs direct migration URL; budget Prisma connections per instance |
| Production recovery | BLOCKED | Managed backup/PITR availability, actual restore drill to isolated destination, rollback/roll-forward sign-off |
| Historical PostgreSQL tracked exposure | HOLD (#39) | Security assessment, retention/history and credential decisions; no snapshot inspection or history rewrite here |
| Operational integrations | BLOCKED | SMTP/from/base URL, environment-separated JWT, storage owner policies, cron secret/job/backlog, payment reconciliation |
| Preview and deployment controls | UNVERIFIED | Confirm branch deploy blocks, host identities, workflow required checks, protected main and rollback decision |
| Merge/deploy | NOT AUTHORIZED | Separate explicit approvals after all above gates |

## Execution order for the next R21 engineering pass

1. Review #63 final diff against current main, annotate residual High issues and confirm no overlapping active PR was silently superseded. Avoid main write.
2. Validate staging environment **metadata/identity** first. A public Preview HTTP 200, successful CI, and project name alone do not certify isolation.
3. If **and only if** isolation is proven and approved, run auth migrations on staging with a verified direct connection; inspect RLS and trusted role capability, rate limits, session revocation, and pool. Never place secrets in chat, docs or CI artifacts.
4. Run authenticated dummy end-to-end: login/logout/reset/revocation, cart 3→2→checkout→Back and both badges, proof submit/reject/resubmit/late review/approve, inventory, vouchers, shipment and cron using nonproduction fixtures.
5. Observe auth 401/429/503, PostgreSQL connection saturation/locks, browser hydration #418 and stuck navigation; record sanitized evidence.
6. Review 7 High advisories, managed recovery, financial reconciliation and production cutover. Only then seek written owner authorization for a migration window and production deployment.
7. Do not roll back to legacy auth that disregards session revocation after R20 migration; use a tested compatible roll-forward or recovery candidate.

## Completion criteria

R21 can be **READY FOR STAGING** only when an isolated staging target is positively verified and staged credentials are scoped. It can be **READY FOR PRODUCTION** only after staging acceptance, approved High mitigations/risk decisions, managed migration + recovery proof, operational credentials and deploy/runbook verified, all final SHA checks passing, and explicit owner approval.

**Actions performed in this preflight: read-only GitHub PR metadata and read-only Supabase catalog/migration/settings queries; no live writes.**
