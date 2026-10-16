# Sprint 2L — Scheduled Flash Sales (marketing dashboard)

**Base:** production `main` after Sprint 2K, commit `cb6b32b6b7f0f06471babedcebe73f9e19f33894`.

## Goal
Admin/Marketing can schedule a product discount to become active automatically at a specific start time and return to the normal product price at end time, without a cron job or manual product-price mutation.

## Pricing source of truth
New nullable Product fields: `flashSalePrice`, `flashSaleStartsAt`, `flashSaleEndsAt` (PostgreSQL UTC timestamps). All three are either null or a valid window/positive price. Existing `salePrice` remains unchanged, and existing manual `isFlashSale` controls are preserved.

- Active window: `start <= now < end` (start inclusive, end exclusive).
- Effective price while active: `flashSalePrice` only if positive and strictly less than the current product `basePrice`. Otherwise, use the existing normal/sale price.
- Product visibility: only PUBLISHED products; variants with custom price/salePrice cannot be scheduled through this module.
- Server authoritative: catalog cards, product detail, cart, checkout preview, checkout create-order transaction all use the same read-time effective-price helper. Buyer-approved lines/quote checks detect the price change and refuse stale order confirmations.
- Automatic switch uses time-based conditional reads; it does not write to Product on start/end. Flash Sale listing's data-cache TTL is 5 seconds (other catalog lists remain at 30 seconds), so the listing may lag a window boundary by up to approximately 5 seconds.
- A previously rendered client page cannot change text in-place at the exact millisecond of a boundary; navigation/refresh requests show the recalculated price. Checkout always verifies server-side.

## Backoffice
Mobile-first Marketing page provides product selector, promo price, start and end times in local browser timezone, create/update/remove schedule and campaign status (Terjadwal, Berlangsung, Berakhir). Requires `promotion.update` and `product.read`, checked again server-side. All changes create an AuditLog entry.

Existing manual flash sale mode remains, but it rejects scheduling conflicts; product management refuses conflicting base/variant/regular sale-price updates while a schedule exists. Admin can archive the product, which excludes it from buyer browsing.

## Constraints and limitations
- No limited-stock quota for flash sales (inventory remains the source of stock truth), no category-wide campaigns, no stacking or overlapping scheduled/regular discounts.
- Exactly one scheduled campaign per product at a time. To schedule a new one, edit the existing window or remove it first.
- Products with custom variant pricing are excluded; maintain variant pricing in product editor.
- It is an additive database migration requiring a safe database-first rollout, review and dedicated approval before production merge.
- Existing manually flagged flash products will continue their current behavior; no automatic end without using a scheduled campaign.

## Validation and rollout
- Unit tests for date-window inclusivity/exclusivity, expired/invalid promo prices and validation.
- Disposable PostgreSQL integration: role guard, conflict with manual promo, stale product version, automatic price switch, checkout preview price, removal and audit log.
- Chromium browser: Marketing schedule form, active display, removal, original product management regression.
- Full app typecheck, lint, build, isolated transaction correctness and mobile browser suites run in GitHub Actions.
- Do not apply this migration to real users' DB until PR review and CI pass. Database migration must be applied before the new app version deploys.
