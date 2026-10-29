# Centralized Flash Sale campaign

Baseline: `main` at `65addb420fccc74129ed72add4a27465ee0c90f8` (V4, PR #112). Work is isolated on `feat/centralized-flash-sale-campaign-card-alignment`. No production environment or customer data was used.

## Findings and changes

- `product-card.tsx` positioned the cart against a wrapping price container. Titles and struck prices changed its visual baseline. The footer now has independent grid columns, a reserved price stack and a 44px cart target aligned to the primary price row. Amounts do not break. Narrow screens use a single column when two columns cannot fit readable prices and controls. Featured cards keep their existing action-free layout.
- Home's large Zap shared the content plane. `flash-sale-banner.tsx` now isolates a 4% decorative background layer from the foreground and stacks content on mobile. Colors and gradient foregrounds still use appearance tokens.
- `flash-sale-timer.tsx` previously counted down a demonstration duration of 8127 seconds. Timers now share an absolute campaign deadline and one monotonic ticker per tab. SSR starts from the supplied server snapshot; wall-clock changes cannot restart the timer. A single no-store request on navigation/focus, every 30 seconds while visible, and at schedule boundaries synchronizes server time and refreshes route data. Cards do not fetch or rerender their parent catalog every second.
- Product `isFlashSale` and per-product scheduled columns formed two independent promotion writers. Marketing now owns campaigns, product payloads explicitly reject legacy/campaign keys (including false/null), and old Marketing flash writers return 410 after authorization. Voucher behavior is retained.

## Persistence and authorization

The application is currently one store, not a tenant marketplace. `storeKey='primary'` is enforced by a database check and all campaign queries. No client-provided store/tenant scope is accepted. A future multistore migration must introduce an authorized store context and extend the exclusion constraint before allowing another store; this change does not pretend to implement SaaS tenancy.

`FlashSaleCampaign` owns one UTC `startsAt`/`endsAt`, status and optimistic version. `FlashSaleCampaignItem` owns only product and price, with unique campaign/product membership; it has no date columns. Admin inputs explicitly use WIB (UTC+07). Drafts do not affect public pricing. Status SCHEDULED covers upcoming and active campaigns; time determines phase with start inclusive and end exclusive. End/cancel are explicit mutations.

A PostgreSQL GiST exclusion constraint prevents overlapping half-open SCHEDULED intervals, including concurrent writers. `FlashSaleControl` serializes mutations. All writes validate server permissions using existing `promotion.create/update` plus product-read/admin authority. Product IDs are loaded and checked against this store's catalog; unpublished, unavailable and incompatible SKU prices have explicit errors. Maximum 200 participants per campaign and 20 products per picker page bound request/query work. Page-only select-all is labeled. Every successful mutation writes an audit event in the same transaction.

Lock order is campaign control → sorted product locks → related records. Product metadata edits validate campaign compatibility while already holding the existing product lock; they do not acquire control afterward. Checkout acquires a shared campaign control lock before its existing cart/product locks. This keeps an accepted quote and campaign change from racing through an order commit. No payment, shipping, inventory or order snapshot authority moved to the browser.

## Price projection and caches

`campaign-pricing.ts` is the shared fresh server projection used by catalog, product purchase options, cart/direct purchase, wishlist and recently viewed. A campaign price must be below the effective regular parent price and every effective SKU price, with published status and available inventory. It overrides explicit SKU prices only while eligible; regular base/sale and SKU master values are untouched. Invalid stored regular discounts use the existing `effectivePrice` fallback semantics.

Metadata caching stays separate: campaign overlays are applied after cached metadata, and Flash Sale listing membership/count/items use one transaction and captured server time. Campaign mutations invalidate catalog tags and relevant storefront/admin routes. Checkout always rereads server prices and rejects stale expected lines/totals. Timer display never authorizes a price. The no-store public clock endpoint exposes no drafts, actor identity or legacy archive.

## Legacy transition

The additive migration archives every original manual/scheduled Product flash record in `FlashSaleLegacy`; it does not rewrite Product prices, activate campaigns, combine differing windows or delete original columns. RLS is enabled on all four new tables. New application preflight blocks switching traffic while raw legacy settings remain. An authorized, reviewed cutover maps explicit participants/intervals or retires obsolete promos through the same locked/audited domain service. Original snapshots remain intact. See [ROLLOUT.md](ROLLOUT.md).

## Scope and evidence limits

Two reference screenshots are mentioned by the brief but were not attached. Captures use synthetic products in a disposable environment. They demonstrate layout and behavior; they are not evidence about the production catalog or exact reference-image matching. The existing image storage adapter, appearance presets/tokens, authentication authority, and regular discount semantics are preserved. No hosted Supabase or Vercel services were enabled.
