# Native purchase V3 — architecture and evidence

Source: user-authorized `Gheverhan_Codex_Implementation_Brief_V3.md`. Baseline main `dd27f03148632481f156c9c4a648a222a146c028`, baseline 500 unit tests/61 files and 48 product browser checkpoints PASS. Use a feature branch only; no merge, Production deployment, live data/theme write, schema/migration or transaction-rule change.

The visual reference screenshots named in the brief were not attached. Preserve Gheverhan's existing monochrome default, borderless chrome and all published Customize tokens. No90% screenshot-fidelity claim is possible. Operate mode: explicit options → exact SKU/quantity → authoritative server response → persistent success sheet → continue shopping at the same scroll/focus or view the reconciled cart. The product image/content leads; no new identity, decorative panels or marketing claims.

## Confirmed root causes

- Catalog cards previously took one variant ID and `toCardData` treated it as the purchasing choice. Quick-add mutated it silently and emitted an optimistic badge delta before server confirmation.
- PDP preselected a sellable variant and used transient success feedback. Quantity controls differed across PDP/cart.
- Cart used the strong functional border token for decoration; an anchor carried `disabled` although anchors do not honor native disabled behavior. Shipping estimate was outside total, but the total label did not communicate that clearly.
- PDP topbar was absolute inside media; mobile gallery was not sticky; dots rendered all photos; variant image swatches always circular.

## Architecture and authority

- `purchase-options.ts`: typed DTO, legacy-dimension normalization, exact-ID domain `resolveVariant` reuse, group membership/completeness validation, availability and image projection. Only sole values can initialize automatically; multi-choice groups start empty.
- `purchase-options.service.ts` plus additive public GET `/api/v1/products/[slug]/purchase`: one on-demand published-only query, explicit public projection, existing 3/50/50 group/value/SKU bounds, no-store. Does not reuse expensive review/Q&A/detail queries, write on GET or expose raw inventory/provider/user fields. Existing public API and mutation contracts remain unchanged.
- Listing retains one identifier hint plus count, not full SKU/media/inventory payload. The hint is used only for stable UI test IDs; it never authorizes or selects a mutation. All ProductCard callers use the same on-demand control, including related/search/category/wishlist.
- A single customer `CartInteractionProvider` coordinates metadata loading, selection, pending, failure and confirmed success. One modal root, one active mutation; no permanent optimistic delta. Existing `addToCartAction` supplies the authoritative cart view. Success image/name/variant label/unit price come from that response. A lost response never offers blind mutation replay; it offers checking the cart. Route epochs suppress late success after leaving the route.
- Radix Dialog (already installed) provides focus trap, Escape/backdrop dismissal, scroll lock and aria semantics. Portal content is mounted inside `.storefront-root`, inheriting the published theme. Explicit trigger ref restores focus without scrolling. No timed success dismissal or duplicate success toast.
- Shared `ProductOptionSelector`, `QuantityStepper` and selection hook across quick-add/PDP/cart. SKU price logic uses existing `effectivePrice`/`effectiveProductPrice`. Buy Now still calls existing `buyNowAction`; cart/order/inventory/promotion/payment/shipping/auth authorities are unchanged.
- Mobile PDP uses fixed translucent topbar, natural document scroll, sticky gallery behind a rounded information panel, bounded five-dot window/counter, keyboard/swipe controls and floating purchase actions. Desktop retains two columns. No permanent body lock on PDP.
- Customer CSS is scoped under `.storefront-root`; no admin/global-body theme changes. Legacy empty `themeStyle()` remains valid. Existing borderless header/nav/footer and card/search styling are retained. Preview uses the same presentational controls with synthetic data and no mutation/navigation handlers; no draft theme leaks publicly.

## Validation contract

Use guarded disposable loopback PostgreSQL only. Keep every existing suite enabled. Test private/draft denial, metadata failures/retry, no cart mutation before options submit, exact sparse3-group SKU, real stock race, quantity bounds, double-tap, success summary and persistence, auth continuation, cart badges/back/refresh/delete, gallery12-photo window and full PDP section reachability, all presets, square/soft/pill, gradients, keyboard/reduced motion and320–1440 widths. Capture actual mobile/desktop evidence and report physical-device/visual-reference limits honestly.

## Hydration and readiness

The purchase portal container is resolved when `openProduct` or `add` runs, rather than by a mount-time effect. This avoids an ancestor state update while React Flight hydrates the PDP subtree. It preserves the existing React runtime and authentication authority. Settled-panel assertions remain explicit (one purchase action/panel); tests do not hide duplicates with `.first()`.

Gallery `aria-busy` exposes client readiness. Keyboard tests wait for `aria-busy="false"`; arrow/Home/End navigation restores focus to the active dot when the five-dot window changes. Screenshot evidence waits for the hero image to decode, distinguishing a loaded image from an early blank capture.

## State, theme and performance inventory

| Surface | State and authority | Presentation and cost |
|---|---|---|
| Card quick-add | Loading → options/error → pending → confirmed success; metadata retry is read-only. Automatic add is limited to one available SKU with no option groups. | One bounded request on interaction, not per card render. |
| Options/PDP | Shared exact-ID resolver; incomplete/impossible choices block submit, stock bounds clamp quantity. | Shared selector/stepper; variant imagery stays in the existing carousel. |
| Add result | Mutation ref blocks duplicate submits; route epoch drops late results. Returned cart count and line supply badge and success summary. | One persistent modal, focus restored without scrolling; uncertain writes direct the buyer to inspect the cart. |
| Cart | Existing reconciliation and checkout routing; subtotal/discount remain authoritative and estimated shipping is identified separately. | Mobile total and checkout CTA reserve space above floating navigation; page bottom padding keeps remaining content reachable. |
| PDP gallery | Five-dot window/counter, option-image synchronization, swipe and keyboard controls. | Natural document scrolling and CSS sticky/fixed stacking; responsive image sizes, no continuous scroll-state handler. |
| Customize | Existing published/runtime tokens; private preview uses the same controls with synthetic data. | Existing ten presets, square/soft/pill, radius, gradient and shadow settings; no new setting or token source. |

The incumbent world remains monochrome by default with borderless storefront chrome. Purchase surfaces consume modal/card/field/surface/text tokens; primary/selected states retain their contrast. Decorative outlines use `--store-decorative-border`, while keyboard focus uses `--store-focus`, including gallery controls. Sheet motion is disabled under reduced-motion preferences. Existing typography and responsive hierarchy are retained; this ordinary extension establishes no new brand system, `PRODUCT.md`, `DESIGN.md` or sidecar.

## Security and change boundary

The additive purchase endpoint checks `PUBLISHED` status and projects public identities, options, effective price, image and computed availability. Raw `onHand`/`reserved` rows are read server-side only; provider/user fields and draft/private products are excluded. Bounds fail closed rather than truncating a valid selection silently. GET does not write and responses are uncached. Client price/availability never authorize a transaction: existing cart actions revalidate stock, price and authentication.

Cart, checkout and authentication transaction source remains unchanged. No schema/migration, Production data/theme change, merge or deployment belongs to this implementation. No launcher/detector binary was available; no result from either is asserted.

## Evidence and remaining limits

See [VERIFICATION.md](VERIFICATION.md) for actual commands, counts, provenance and retained screenshots. Local final application evidence: 516 unit tests/66 files, 56 full product-browser checkpoints and 7 targeted native confirmations. GitHub checks on the final PR commit remain authoritative for the complete unchanged pipeline.

Finish review scored 4; its four listed fixes are resolved: reserved mobile cart total/CTA above navigation, gallery focus across the moving dot window, theme focus token, and decoded hero capture. Disposition: ship at the scored-fixes scope only; it does not certify all CI or physical-device behavior.

Reference screenshots named by the user were absent, so fidelity against them and any ≥90% claim remain unverified. Physical Android Chrome/iOS Safari, browser chrome collapse, device keyboard/notch behavior and assistive-technology QA remain outstanding; viewport automation is not a substitute.
