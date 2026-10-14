# Sprint 1 Milestone 2A — Backend transaction correctness

Baseline: `7c1bb61` (Draft PR #20). Branch: `feat/milestone-2a-transaction-correctness`.
No dependency, lockfile, Prisma schema, migration or seed changes. UI changes are limited to
checkout confirmation fields and the existing error message's reconfirmation link.

## Reproduction before / after

Source exported from baseline commit, with unchanged dependencies, reproduced all seven
previous scenarios on a disposable loopback PostgreSQL database. Deterministic barriers
paused real database reads to demonstrate the unsafe interleavings; service results were
not mocked. Baseline data was discarded with the test container's temporary filesystem
before testing the new implementation. No production database was accessed.

| Finding | Baseline result | Fix and verified result |
| --- | --- | --- |
| High: parallel checkout, stock 1 | Two orders; onHand 1 / reserved 2 | Conditional reservation checks available stock in the UPDATE itself; one order/reservation, loser 409, full rollback. |
| High: parallel approval | Two SALE movements; onHand -1 / reserved -1 | Order then Payment row locks; locked status validation; one SALE/history/audit/notification. Successful parallel/sequential replay returns success without repeating effects. |
| High: parallel cancellation | Reserved -1 | Order lock and terminal replay; release exactly once; payment/order paymentStatus become EXPIRED. Repeated pending cancellation returns existing cancelled order. |
| High: approval after cancellation | CANCELLED revived to PAID, reserved -1 | Terminal/deadline validation under the same Order lock. Approval versus cancellation has exactly one winning lifecycle; cancelled/expired orders cannot accept approval or proof. |
| High: generic PAID | Payment stayed waiting; stock stayed reserved | Generic PAID/REFUNDED rejected; dedicated approval requires PAYMENT_VERIFY from actual active staff role bindings. |
| Checkout price snapshot | Charged 100000 after edit committed to 200000 | Submitted confirmation compared with fresh locked cart/product/variant data; 409 with reconfirmation; no order/reservation. Reload and explicitly confirm 200000 to proceed. |
| Generic REFUNDED | Label changed without finance/stock reconciliation | Unsafe generic transition blocked. Actual refund/return workflow remains unimplemented. |

## Transaction and lifecycle policy

- Conditional inventory UPDATEs require positive integer quantities; reservation checks
  `onHand-reserved >= quantity`, release requires enough reservation, sale requires enough
  reserved/physical stock. Movement and business writes stay in the caller transaction.
  Adjustment retains revision/stock guards and rejects inconsistent legacy inventory.
- Lifecycle mutations lock **Order → Payment → Inventory**, with variant IDs sorted.
  Checkout locks **Cart → CartItems → Products → Variants → Inventory**; catalog rows are
  held through order creation. Prices, variant metadata, published status and availability
  are reread; coupon recalculation uses the transaction client.
- Generic order matrix: PENDING_PAYMENT → CANCELLED/EXPIRED; PAID → PROCESSING → PACKED →
  SHIPPED → DELIVERED → COMPLETED. Financial verification alone moves pending order to PAID.
  Paid cancellation/refund cannot use the generic operation.
- Payment matrix: PENDING_PAYMENT → WAITING_VERIFICATION/EXPIRED; WAITING_VERIFICATION →
  PAID/REJECTED/EXPIRED; REJECTED → WAITING_VERIFICATION/EXPIRED. PAID and EXPIRED terminal.
  Re-upload while waiting may append proof under the Order lock, without changing state.
- Submit/reject/approve use the same lifecycle lock, preventing proof submission from
  resetting a concurrently approved payment. Rejection now uses REJECTED consistently with
  the existing payment matrix and UI. System expiry audits use a nullable actor, and
  unexpected expiry errors are propagated rather than silently reported as success.
- Shipping's existing propagation delegates SHIPPING_UPDATE only for fulfillment targets;
  it does not grant generic financial transition access.

## Checkout contract and idempotency

Existing route URLs and order response shape remain. Checkout now requires `expectedLines`
(`variantId`, `quantity`, `unitPrice`); missing/tampered/stale confirmation fails with 409.
The first-party page/form supplies these fields and a server-issued UUID `requestId`.
API consumers must supply a fresh confirmation too; prices are never taken from that payload.

With `requestId`, the existing Order primary key is derived from customer + key; an immutable
request fingerprint is stored in the same transaction's order.create audit. Same user/key/body
returns the original order, even after cart replenishment. Different body using that key is
409. A new purchase uses a new key. Without a key, cart serialization still prevents duplicate
consumption, but successful durable replay is unavailable. Retain the creation audit: if its
fingerprint is missing, replay fails closed rather than creating another order.

## Verification

Node 22.22.0. **90 unit tests**, **20 local containment checks**, **22 PostgreSQL correctness
checks** (21 subtests plus parent suite), **17 existing product PostgreSQL checks**, and
**14 production-server browser checks PASS**, no skips. Strict typecheck including unused
locals/parameters, lint without warnings, Prisma generate and production build PASS.
Browser confirms an actual stale checkout form produces reconfirmation error with no order.

The concurrency suite observes simultaneous PostgreSQL lock waiters via pg_stat_activity.
Rollback tests cause an actual unique-constraint failure on audit insertion after inventory,
payment/order and cart mutations, then verify their rollback. Tests also cover checkout replay,
key/body mismatch, both approval/cancel winners, expiration, RBAC, reject/resubmit/fulfillment,
adjustment versus reservation, and invalid movement quantities. Tracked inventory satisfies
`0 <= reserved <= onHand` after each business scenario; a deliberately corrupt legacy fixture
is isolated and restored after verifying rejection.

From `frontend/`, run `npm run test:ci`, typecheck, lint, prisma:generate, build.
With current schema on explicitly disposable loopback database **gheverhan_sprint1_test**,
set `SPRINT1_TEST_DATABASE_URL` and run `npm run test:integration:transactions`, then
`npm run test:integration:products`; run `npm run test:e2e:products` after build with Chromium.
Tests refuse non-local/non-test databases and do not load production URLs or run seeds.
The real PostgreSQL tests were executed locally; the existing unit-only Actions workflow does
not automatically execute this integration suite.

## Remaining risks / scope

- Financial refund/return and cancellation after payment need a dedicated authorized workflow
  with explicit money reconciliation and stock-return policy. They are safely blocked here.
- Existing shipment write and order propagation remain separate transactions; propagation
  still catches transition failures. Shipment/order atomicity is deferred, not marked PASS.
- Inconsistent existing production data is not inspected or repaired by this change.
- Live storage remains external verification pending. Browser upload uses the existing adapter
  with a local contract double; orphan cleanup and provider DELETE verification are unchanged.
- Identified High transaction cases are closed in isolated tests. This is backend review-ready,
  not production release clearance. No merge or production deployment.
