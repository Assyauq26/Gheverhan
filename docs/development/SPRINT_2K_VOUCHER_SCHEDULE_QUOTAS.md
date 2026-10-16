# Sprint 2K — Scheduled vouchers, global quota and per-buyer redemption limits

**Parent:** Sprint 2J merged to main (commit `c58cdef4050560c235fe2ba849233f58438196b0`).
**Status:** candidate PR only. **Requires a reviewed database migration before production rollout.**

## New voucher fields
- `startsAt: DateTime?`: not redeemable before the specified timestamp.
- `usageLimit: Int?`: maximum lifetime order creations using the coupon across all buyers; null = unlimited.
- `perUserLimit: Int?`: maximum lifetime order creations using the coupon for a single user; null = unlimited.
- Existing `expiresAt`, `minSpend`, discount percent/fixed, max discount and activation remain intact.
- Existing coupons migrate with all three new fields null, preserving their current behavior.

## Contract and accounting
A redemption counts once a new Order is committed with the coupon (not on preview, not on cart addition, not on idempotent replay). Canceled/unpaid/expired orders do **not** automatically return a quota slot in this MVP. This avoids creating an exploit path through cancellations while still giving explicit, auditable quota accounting.

Admin can view total redemptions per coupon and choose limits. A scheduled, future-start coupon is visible as **Terjadwal**; it becomes redeemable when time reaches `startsAt` without requiring a cron service. Coupon validity and capacity are evaluated live on every preview and again inside each checkout transaction.

## Concurrency/transaction safety
- Checkout locks the coupon row using PostgreSQL `FOR UPDATE` before rechecking discount and usage limits, holding the lock until order commit. Concurrent buyers cannot both claim the last quota slot.
- The server compares the buyer's preview-confirmed subtotal, shipping cost, discount and total against the recalculation inside the transaction. A sold-out or expired promo returns HTTP 409 and preserves the cart/stock.
- Idempotent retries still return the original order without consuming extra capacity.
- Admin coupon edits use the same row lock, and cannot reduce a finite total cap below the count already used.
- The preview endpoint never increments any counter, creates orders or reserves inventory.
- `Order(couponCode, userId)` gets a composite index for efficient count queries.

## Validation
- Unit: negative/noninteger limits, date boundaries, cap values.
- Isolated disposable PostgreSQL: two simultaneous checkouts for one redemption slot produce exactly one committed order and one reservation; scheduled coupon cannot redeem before startsAt; per-buyer cap blocks a repeat; idempotency replays do not use extra slots.
- Existing checkout pricing, product, shipping, admin and mobile browser workflows must remain green.

## Deferred scope
- Product-specific vouchers, scheduled flash-sale pricing, campaign banners and analytics remain separate backlog. Flash sale stays manually controlled for the present production version; **do not** describe it as scheduled.
- Production release must separately review DB migration safety, CI, rollback and operational monitoring. Never migrate the live database from a test runner.
