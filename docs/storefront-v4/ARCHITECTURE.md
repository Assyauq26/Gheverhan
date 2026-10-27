# Storefront V4 — architecture / working contract

Main baseline: `f6e7fbfd24cf618e55adf9bb4d260e0a2ce6ab5f` (approved/deployed hotfix #111). V4 branch: `fix/storefront-pdp-sheet-reviews-checkout-v4`. No main push, merge, Production deployment, live theme change or Production migration is authorized for V4. No new dependencies, hosted storage/database provider or credentials are introduced. The three named reference screenshots were not attached; local before/after evidence is not a reference-fidelity claim.

## Audit / root causes

| Area | Actual cause | Result |
|---|---|---|
| Featured prices | Home forced three narrow columns; one special discounted branch had nowrap on a flex container while a non-discounted featured card fell into the ordinary card branch and could show quick-add. Ordinary price spans could break inside a currency value. | Readable responsive carousel minimum; each primary/strike value is independently nowrap/tabular; container-sized fonts; strike can wrap to another row. All featured cards omit purchasing shortcuts. |
| PDP | Information panel was ordinary document content above a sticky gallery, so its top could pass under the fixed header. Reviews/lower sections lived outside that panel. | Document scroll raises one bounded panel; its top stops at header+38px, then contents scroll internally. All PDP sections remain inside the mobile region. |
| Details | Size chart preceded description; description and size chart had inconsistent row/icon structures. | Description, size chart, material/care, shipping/returns; Lucide icons, minimum44px summaries, subtle derived separators and reduced-motion-aware disclosure. |
| Reviews | `requireUser()` was the only mutation gate; `createReview()` accepted a client productId and published any authenticated user's review. Reads and rating cache trusted all PUBLISHED rows. | Purchase item is the only submitted identity; server resolves product/owner/status/payment, locks and verifies refund policy. Shared verified predicate controls public rows and ratings. |
| Checkout | Sole submit button lived at the bottom of the summary; server quote state was already authoritative. | Same single button/action/form, fixed full-width bar on mobile, static summary placement on desktop; currentQuote supplies both totals. |

Audit included storefront page/layout/header/bottom nav, ProductCard/gallery/purchase/detail/size chart, shared buttons/appearance schema/presets/runtime/CSS, customer order pages, checkout client/page/layout/actions/service, review actions/service, Prisma schema/migrations, permission mapping, order/payment/shipment transitions, refund lock/policy, catalog/wishlist readers, audit service, deployment preflight and existing regression workflows. Existing header, image fallback, cart events, Buy Now authority and theme publication path are retained.

## Review trust boundary

`Review.orderItemId` is nullable and unique, with an OrderItem FK using SET NULL on deletion. Null permits existing records to survive unchanged; it is never purchase evidence. No heuristic backfill links old reviews to orders.

Create order: authenticated active user → owned item hint → lock Order → re-read authoritative item/order/payment → require DELIVERED or COMPLETED and both PAID flags → lock Payment → existing `assertNoActiveRefund` → require no review → lock Product → create one PUBLISHED review, recalculate legacy rating cache, write audit in the same transaction. The existing lifecycle/refund writers use Order-first locking, so refunds and review submission serialize without changing finance/fulfillment rules. Unique identity also prevents duplicates outside the service.

Input is bounded plain text (rating1–5 integer, title120, body3–2000), with product/status/price/owner fields rejected or ignored by the server action. Product and revalidation destinations come from the actual purchased variant/order. No images/upload URLs are accepted by the review mutation. Form radio controls retain native keyboard behavior; pending/ref guards prevent accidental repeat requests. Duplicate network retries fail closed at the database/service.

Public SQL verifies PUBLISHED review + matching variant/product + matching order/reviewer + eligible order/payment + no unresolved refund. It projects no order IDs, item IDs, emails, phone numbers, addresses or financial events. Display identity uses the first name only, with generic fallback for email/phone-like names. Body/title remain React text, never HTML. Existing review-image DTO fields are retained only for eligible rows, with a bounded image read; no new media feature/provider is enabled.

PDP list and aggregate use one SQL window snapshot before the20-row display limit. Cached catalog metadata is decorated by a fresh, bounded batch aggregate query outside Next's metadata cache; current Home/shop/category/brand/search listing, related and wishlist cards therefore share the verified policy even when refund/publication changes. No per-card N+1 query. `ratingAvg/reviewCount` database fields remain compatibility caches, refreshed transactionally on create/moderate; public readers do not trust stale legacy or refund-era cache values. The unused legacy recently-viewed read helper has no current UI caller; any future consumer must use the same verified projection.

Moderation reuses existing catalog-edit permission (`product.update`) and backoffice role authority in `setReviewStatus`; customer denial is tested. It updates rating cache and audit atomically. No customer-accessible moderation endpoint is added. PENDING/REJECTED and unlinked legacy rows never publish. Publishing a legacy row does not manufacture verification. Linking historical reviews later requires independently audited purchase evidence, outside this task.

## PDP / checkout contract

Mobile panel height =100dvh minus measured-by-CSS header height,38px strip, and existing purchase bar/safe area. Parent scroll runway ends at the stop; a passive, animation-frame-bounded listener switches overflow to internal scrolling at that boundary. No body lock, global preview flag, duplicated content tree or client fetching of initial HTML. Keyboard focus into lower content can expand the panel; purchase-bar focus is excluded to preserve cart return position. Desktop uses display:contents for the shell, original two-column information layout, sticky media constrained to its row, and full-width lower sections.

Checkout keeps existing createOrderAction, expectedLines/requestId/intentId, HTML required validation and server revalidation. Only one submit exists. Quote loading/error/stale disables it; total is never invented locally. Immediate submit ref plus existing pending state guards rapid repeat clicks; server idempotency remains authoritative. The summary stays in content, and bottom padding reserves the mobile bar. Legacy checkout keeps its existing root namespace; new scoped CSS supports both legacy and published wrappers.

## Theme / containment

No changes to appearance schema, presets or saved records. Existing primary/text/nav/card/decorative-border/focus/radius/button/shadow/font tokens drive new controls. Disabled action fill derives from the published primary pair; enabled gradients retain the existing runtime. Changes are scoped to customer components, with no admin/body/root styling changes. Current theme defaults and all prior ten-preset preview tests remain enabled.
