# Sprint 2J — Dashboard Marketing: Voucher & Manual Flash Sale

Base: `main` after Sprint 2I PR #32. No new database tables, migrations, dependency packages or production credentials.

## Existing capability vs new scope

- Coupon and Promotion database models existed, and checkout already calculated server-side discounts; there was no backoffice Marketing route or UI.
- Product `isFlashSale` and `salePrice` already drive storefront Flash Sale list and cart/checkout prices. The new UI exposes limited, audited management.
- This is a **single-store** backoffice, not multi-seller/tenant scope. No seller-specific tables or ownership semantics are invented.

## Features delivered

**Marketing (/admin/marketing):**
- Permission-filtered mobile and desktop navigation.
- Voucher table, edit/create form, activation/deactivation, percentage/nominal discounts, minimum spend, optional cap and expiration.
- Code normalization and immutable voucher code after creation; duplicate-code conflict and expiration checks.
- Flash Sale: select a published product, set a discounted price, activate listing; manual end returns its product price to base price. This MVP only enables products whose variants inherit the product price; variants with explicit prices require the product editor.
- Server-side guards `promotion.create` for new vouchers, `promotion.update` for voucher edits and flash sale, plus `product.read` for flash sale; authorization enforced by the server action *and* service.
- Transactional audit log entries. Catalog invalidation refreshes storefront and checkout quote is independently recalculated on transaction.

## Restrictions (important)

- No scheduled start/end, quotas, per-user voucher limits, public marketing banners, or campaign analytics in this phase. Flash sale is explicitly **manual**, and ending it clears the product-level `salePrice` (it will no longer be discounted). Do not advertise time-limited redemption controls until those are implemented.
- Flash sale only works with published products with variant prices inherited from the product. Existing variant-level pricing requires dedicated implementation.
- Loading is capped at 100 latest vouchers and 60 published products in this iteration; pagination/search planned next.
- Existing bank/payment/shipping flows and production database are unchanged.

## Validation

- Unit tests: voucher code, discount, max caps, expired activation, required flash sale price.
- Disposable local PostgreSQL tests: permission denial (no side effects), voucher CRUD/duplicate, audit trail, product discount + stale revision + variant-price restriction.
- Chromium production-like browser test: admin Marketing route, voucher creation and toggle, flash sale activation/end, regular storefront price remains correct.
- All GitHub Actions workflows must PASS on exact HEAD before merge. Do not seed production or touch real customer orders.

## Recommended next scope

Sprint 2K: scheduled campaigns with start/end timestamps + automatic price changes without race conditions, coupon redemption quota/per-customer limits, banner visibility and campaign-level reporting. Requires a reviewed database migration and careful storefront/checkout concurrency testing.
