# Milestone 2C — Inventory & Order Management UI

Baseline: Draft PR #22, `d1beee990740a52d1c604e2e01693deca8bb6f67`. Feature branch: `feat/milestone-2c-inventory-order-ui`. Single Gheverhan store; existing session, database permissions, services and UI components remain the architecture.

## Operational workflow

- `/admin/inventory`: product/variant/SKU search, physical/reserved/available quantities, stock filters and 20-row pagination. Variant detail provides paginated/filterable movement history and an adjustment form requiring expected physical stock and a reason. Existing `adjustStock` CAS is reused inside a transaction with an active-staff permission check, movement and audit record. Missing/invalid/stale expected stock is rejected; reservations are not directly edited.
- `/admin/orders`: order-number search, status filter, date/customer/payment/total columns and 20-row pagination. Detail displays immutable item/price snapshots, address, order history and permission-filtered payment/shipment/refund information.
- Authorized operators can verify/reject manual transfer proof, process/pack orders, record manual tracking, request/decline full refund, independently verify an already settled manual refund, and receive explicit physical returns. All lifecycle writers remain Milestone 2A/2B services. The shipment policy was extracted without changing its transitions so the writer and server-rendered action choices use one policy.
- The refund requester cannot confirm their own settlement. Warehouse-only staff see return eligibility without bank/evidence fields; refund history notes containing financial evidence are also hidden from them. No actual money transfer or carrier API is invoked. Refund confirmation does not restock; explicit, attested warehouse receipt does.
- Forms require confirmation, disable during submission, synchronously block overlapping submits, preserve input on validation/conflict, focus feedback, and provide refresh recovery. Refund/receipt/shipment requests retain a UUID for same-payload retry after an uncertain network result. A new page load obtains current server state; this is not durable offline form storage.
- API success adapters invalidate operational pages and the existing catalog cache after commit. Committed mutations also reload the document to ensure streamed boundaries display fresh state: a focused reproduction showed direct HTTP current state was correct while client-only refresh retained old controls. A 60-second, same-path sessionStorage notice stores only path/time, never financial data; navigation works even when browser storage is disabled. Backend authorization/lifecycle checks continue to reject stale actions independently of UI state.
- Skeletons live inside the new pages after authorization. A global admin loading boundary was removed after the existing browser regression showed streamed HTTP 200 instead of the existing permission-denied 404 contract. No authorization assertions were weakened.

## API additions and compatibility

POST `/api/v1/admin/inventory/:variantId` accepts `{expectedOnHand, newOnHand, reason}`. Requires active staff with INVENTORY_READ and INVENTORY_ADJUST; returns 409 on stale stock and 422 on schema validation failure.

POST `/api/v1/admin/orders/:orderId/status` accepts `{status}` and delegates to `transitionOrder` with ORDER_UPDATE. Existing prohibitions on generic financial/shipping transitions remain intact. Existing payment, refund, return and shipment APIs retain their URLs and response envelopes. Manual payment API mutations now use the existing same-origin guard too.

The payment queue uses the same verification controls; the shipping queue links into order detail so there is a single shipment editor. Product editor variants now use deterministic createdAt/id ordering after the existing browser regression reproduced swapped row positions following edits. A native regression verifies stable identity/order and removal of only the fresh zero-stock variant. No deletion guard was relaxed.

No schema, migration, dependency, lockfile, database seed, production configuration or production data changes.

## Verification

Node 22; explicit loopback PostgreSQL 15 disposable test database. Existing migrations (including PR #22's additive enum) were applied only to that test database. Native tests refuse non-local/non-test URLs.

| Gate | Result |
| --- | --- |
| Unit/component/validation | 110 tests PASS |
| Critical containment | 20 checks PASS |
| Native PostgreSQL refund/shipping plus adjustment | 27 checks PASS (26 subtests and parent) |
| Native Milestone 2A transaction/concurrency regression | 22 checks PASS (21 subtests and parent) |
| Native product lifecycle regression | 18 checks PASS (17 subtests and parent) |
| Existing production-browser product regression | 14 checks PASS |
| New production-browser operations/API regression | 17 checks PASS |
| Typecheck, lint, Prisma generate, production build | PASS |

No skipped native checks. Adjustment races observe two real PostgreSQL lock waiters and prove one committed movement/audit; injected audit constraint failure proves rollback. Existing Milestone 2A/2B races and inventory invariants remain tested. Browser assertions cover anonymous/read-only API rejection for every mutation family, origin rejection, stock conflict without lost update, manual approval/rejection, process/pack/dispatch, refund request/independent settlement/physical receipt, post-refund tracking, cancellation, pagination/filter/empty states and 390/768/1360px overflow/error checks.

Browser fixtures are synthetic. A loopback storage contract double serves transfer proof; no real bank settlement, carrier dispatch, external storage verification or Supabase production was exercised. GitHub's existing `unit-tests` workflow runs unit/containment checks; native PostgreSQL/browser results here are local cloud-environment evidence, not claims about that CI job.

## Limits and handover

Full manual refunds and physical-return policy remain PR #22's scope; partial monetary refunds and automated bank/carrier effects are not introduced. Financial settlement/receipt truth still depends on authorized human verification. No real payment/carrier integration or external storage clearance is implied. Rollout still inherits PR #22's enum/client migration coordination and legacy-data reconciliation requirements. Review the stacked Draft PR before merging any baseline or deploying.

## Main integration follow-up — legacy page authorization

Five legacy server-rendered pages (payments, shipping, bank accounts, customers and audit) previously propagated a permission HttpError into a generic HTTP 500 page. They now use the existing requireBackofficeUser guard, matching other backoffice pages: anonymous users redirect to login; unauthorized staff receive HTTP 404 before page data is read. API authorization continues returning 401/403. No permission grants, financial lifecycle, schema or dependency changes.

Before-fix evidence: the 112-cell local admin/RBAC smoke recorded 16 permission denials as HTTP 500 and 18 as 404. After-fix: all 34 denied staff/page combinations return 404; all 112 checks pass, including customer and anonymous access behavior. A permanent operational browser regression now explicitly asserts all sixteen formerly failing role/page combinations. The operational suite increases from 17 to 18 checks; product browser remains 14. Unit110, containment20, native PostgreSQL67, typecheck, lint, Prisma generate and production build pass on the updated candidate.

Main merges, remote development migration and the live website smoke remain separately gated on identifying the database configured in Netlify and establishing its authorized migration path. Netlify's technical production context is the maintainer-authorized development website; the context name itself is not evidence of real customer data. No main merge or remote migration was performed by this follow-up.
