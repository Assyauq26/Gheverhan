# Remediation R3 — Safe pending-order expiry

## Contract
Daily Vercel Cron invokes GET /api/internal/cron/expire-orders with
`Authorization: Bearer $CRON_SECRET`. Only the production deployment runs
scheduled invocations (not preview). The route refuses requests without a
random secret of at least 16 characters. Cron runs at 02:00 UTC (09:00 WIB),
with plan-dependent scheduling accuracy.

## Non-destructive safety
- Process at most 50 overdue orders per invocation.
- Only PENDING_PAYMENT orders with Payment in PENDING_PAYMENT/REJECTED may expire.
- Hold orders with WAITING_VERIFICATION proof for human financial review;
  do NOT release their stock or close them automatically.
- Re-check eligibility UNDER the order row lock in the transaction, so
  an incoming proof concurrent with expiry cannot be silently discarded.
- Cancellation by staff also refuses WAITING_VERIFICATION orders.
- Existing expired orders are not changed by deployment until a cron run.

## Before enabling
1. Ensure Vercel project root points at `frontend` so `frontend/vercel.json`
   is discovered.
2. Configure a strong, server-only `CRON_SECRET` for production.
3. Review any existing overdue orders/proofs through SELECT-only reconciliation.
4. Verify the cron registration in Vercel Settings > Cron Jobs.
5. Monitor batch counts, error logs, inventory RELEASE movements, and
   overdue backlog. Hobby allows only daily jobs; this policy does not
   promise sub-hour expiration, and max batch 50 needs revisiting at scale.
6. Financial staff must reconcile proof-under-review orders rather than
   leaving them in WAITING_VERIFICATION indefinitely.

## Known future work
- Real-time/near-real-time expiration requires a plan-compatible frequency
  or reliable queue, and a policy for late-arriving bank settlement.
- Large backlog needs cursor/batches beyond the 50-order daily cap.
