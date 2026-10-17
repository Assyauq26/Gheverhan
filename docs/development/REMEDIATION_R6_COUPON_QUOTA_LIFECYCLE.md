# Remediation R6 — Coupon quota lifecycle

## Fixed semantics
- Checkout creation **reserves** a coupon slot.
- Orders with status `PENDING_PAYMENT`, `PAID`, fulfillment states, and
  `REFUNDED` continue to consume the total and per-user quota.
- When an order transitions to `CANCELLED` or `EXPIRED`, its coupon quota is
  released for reuse.
- Marketing counters show **terpakai/ditahan**, including pending reservations.
- The existing exclusive Coupon row lock remains in checkout and serializes
  last-slot concurrent redemption, while Order row status transitions are atomic.

## Operational note
Past-deadline orders that have not yet transitioned to `EXPIRED` continue
to hold slots. This is intentional until the bounded expiry cron in R3 is
enabled; do not silently free on a timer while a financial proof could be
under review. Refunds remain counted to prevent recycling after settlement.

## Acceptance
The isolated PostgreSQL transaction suite verifies reserved quota, cancel
release, per-user reuse, new checkout quota hold, expiry release and dashboard
counters; existing concurrency and idempotency tests remain mandatory.

## Safety
No production DB migration, code in standalone draft PR, no production data
changes. Requires independent review and green CI before merge.
