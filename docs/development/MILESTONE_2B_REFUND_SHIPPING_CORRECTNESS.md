# Milestone 2B — refund and shipping correctness

Baseline: PR #21, `2bb469f0ce3b56769546dda1d234a1d4e4d28298`. Branch: `feat/milestone-2b-refund-shipping-correctness`. No merge, production deployment, production database access, seed, or dependency change.

## Root causes and changes

- Shipment previously committed in its own transaction and swallowed an invalid order transition. Order transition, shipment, history, events and audit now share one transaction; errors propagate and roll back all writes. Order-row serialization prevents refund/fulfillment races.
- Repeated shipment writes previously created duplicate events. An optional UUID `requestId` stores a durable request fingerprint in the existing audit ledger. Same key/body returns the current resource without repeated effects; different body is 409. Identical keyless writes are also no-ops. Shipment transitions cannot regress.
- There was no dedicated verified-refund/physical-return workflow, and PaymentStatus could not represent REFUNDED. Full manual refund intent, independent settlement verification, decline, and warehouse receipt now have separate authorized services and append-only PaymentEvents. Generic PAID/REFUNDED changes remain forbidden.
- A pending refund freezes fulfillment. Confirming refund changes Payment.status, Order.paymentStatus and Order.status atomically to REFUNDED, without changing inventory. A separate explicit physical receipt creates RETURN movements and increases onHand exactly once, capped cumulatively per sold order item. Partial physical receipts are supported; partial monetary refunds are rejected.
- A confirmed refund does not erase physical shipment history. An already dispatched shipment may continue IN_TRANSIT/DELIVERED tracking while financial/order states remain REFUNDED; new dispatch is prohibited.

## Financial policy and state transitions

Unpaid cancellation/expiry releases reservations once through the existing Milestone 2A workflow. Paid cancellation remains forbidden. A full refund can be requested only for manual payments with consistent PAID payment/order payment status and order status PAID, PROCESSING, PACKED, SHIPPED, DELIVERED or COMPLETED. One active request per payment is allowed.

Request -> confirmed or declined is a single serialized resolution. Confirmation requires a different active PAYMENT_VERIFY staff member from the requester, full matching amount, registered source bank account, already-settled timestamp, transaction/evidence reference and explicit MANUAL_BANK_REVIEW attestation. A normalized bank reference/account pair cannot confirm two payments, including concurrent attempts. This records a human verification of an already settled refund; the application does not transfer money or independently query a bank. Automated/nonmanual providers fail closed pending a dedicated integration.

Shipment matrix: new -> PENDING/PROCESSING/SHIPPED; PENDING -> PROCESSING/SHIPPED; PROCESSING -> SHIPPED; SHIPPED -> IN_TRANSIT/DELIVERED; IN_TRANSIT -> DELIVERED; DELIVERED terminal. Same-state metadata updates are allowed. Dispatch requires a PACKED order and tracking number; delivery requires prior dispatch. Inventory SALE is not repeated by shipping/refund operations. Invariant remains `0 <= reserved <= onHand`.

## API and authorization contract

All paths below are under `/api/v1/admin`. Session/permission checks are repeated against active database staff in services. Mutation routes reject a supplied cross-origin Origin header; authenticated non-browser callers may omit Origin.

| Endpoint | Permission | Request/behavior |
| --- | --- | --- |
| POST `/orders/:orderId/refunds` | PAYMENT_VERIFY | `{requestId: UUID, amount: integer Rupiah, reason}`; returns request event, not money settlement |
| GET `/orders/:orderId/refunds` | PAYMENT_READ | Financial ledger; includes sensitive evidence, not exposed to warehouse-only staff |
| POST `/refunds/:requestEventId/confirm` | PAYMENT_VERIFY | `{amount, sourceAccountId, evidenceReference, settledAt: ISO date, verificationKind: "MANUAL_BANK_REVIEW", attested: true}` |
| POST `/refunds/:requestEventId/decline` | PAYMENT_VERIFY | `{reason}`; releases active fulfillment hold, never restocks |
| GET `/orders/:orderId/return-eligibility` | INVENTORY_READ + INVENTORY_ADJUST | Request event ID and per-order-item returnable quantities; excludes bank/settlement evidence |
| POST `/refunds/:requestEventId/returns` | INVENTORY_READ + INVENTORY_ADJUST | `{requestId: UUID, receivedAt: ISO date, receiptReference, physicalReturnVerified: true, reason, items: [{orderItemId, quantity}]}` |
| POST `/shipments` | SHIPPING_UPDATE | Existing contract plus optional UUID requestId; omitted dates preserve existing values |

Intentional behavior restrictions: generic order-update SHIPPED/DELIVERED now returns 409; use the shipment workflow so order and shipment cannot diverge. Generic financial transitions remain rejected. The admin generic transition buttons exclude these shipping statuses. Existing shipment URL/response shape is preserved, but invalid lifecycle operations now fail instead of appearing successful. Refund confirmation and receipt replays return the original event; shipment replay returns the current shipment resource. Conflicting idempotency payloads return 409. No large inventory/order UI was introduced. Customer payment pages explicitly represent REFUNDED and EXPIRED.

## Schema and rollout

The only schema change is additive migration `20261015000000_add_refunded_payment_status`: add PaymentStatus.REFUNDED. No tables, destructive SQL, dependency or lockfile changes. Existing PaymentEvent and AuditLog uniqueness support idempotency. Applied only to the disposable loopback PostgreSQL 15 test database after baseline migration; existing baseline rows were retained.

Future deployment must apply the additive enum migration and regenerate/roll out compatible Prisma clients before new REFUNDED writes. Old clients may not read new enum values; rolling back application binaries after such writes needs a compatibility plan. No production migration has been run.

## Verification — 2026-10-15

Before-fix reproduction ran the actual 2bb469f source against isolated PostgreSQL: an invalid transition left shipment SHIPPED while order remained PAID; repeating a shipment request wrote two events. The baseline intentionally rejected generic refund but lacked a verified refund/return service.

After-fix results:

| Gate | Result |
| --- | --- |
| All unit tests | 99 PASS, no skips |
| Containment checks | 20 PASS, no skips |
| PostgreSQL refund/shipping suite | 24 subtests + parent = 25 PASS |
| PostgreSQL Milestone 2A regression | 21 subtests + parent = 22 PASS |
| PostgreSQL product lifecycle regression | 16 subtests + parent = 17 PASS |
| Production browser/data-flow regression | 14 PASS; local storage contract double, not external storage verification |
| TypeScript typecheck | PASS |
| Lint | PASS, no warnings |
| Prisma generate | PASS, also executed by production build |
| Production build | PASS, dummy unreachable build-only database URL |

Native concurrency tests use actual PostgreSQL order locks and observe two waiting database sessions before releasing competing requests. Coverage includes duplicate/concurrent refund requests and confirmations, shared settlement evidence across orders, confirm versus decline, refund versus cancellation/dispatch, repeated shipments, independent role authorization, rollback after database write failures, exactly-once physical receipts, cumulative partial returns, financial evidence masking, and all Milestone 2A checkout/payment/stock regressions. No mock-only concurrency claim. Deliberate constraint-failure tests emit expected Prisma error logs while passing rollback assertions.

Baseline PR #21 unit-tests was rechecked SUCCESS at exact baseline: https://github.com/Assyauq26/Gheverhan/actions/runs/38646135788/job/116133336794 . New PR CI is separate evidence and must be checked on its pushed head. Existing GitHub workflow executes unit/containment tests, not native PostgreSQL or browser suites; those results above are local cloud-environment evidence.

## Remaining risks and next milestone

- Manual bank evidence and physical receipt truth depend on authorized human verification. No real bank transfer, carrier dispatch or production storage was exercised. Two-person financial verification is enforced, but operational evidence handling/reconciliation remains necessary.
- No automatic refund provider/carrier side effect exists here. A future external API integration needs durable outbox/provider idempotency and reconciliation; a database transaction cannot roll back a remote transfer/dispatch.
- Full monetary refunds only. Exchanges, partial monetary refunds, chargebacks, automatic refund execution and pre-refund physical-return workflows require a separate policy/design.
- Existing inconsistent legacy order/shipment data is not automatically repaired. Reconciliation should precede any production rollout. Production storage verification and upload-orphan cleanup remain prior external work, unchanged here.
- Backend is ready for review before Inventory & Order Management UI: expose request/independent confirmation/decline, warehouse eligibility and explicit receipt, and shipment actions with stable request UUIDs. Do not label release-ready or deploy until review, migration coordination and operational external verification are complete.
