# Inline prices and natural ProductCard spacing

Review only. No merge or deployment authorized. Baseline main: 0e0e04cd9167c0c9f1ef50699952dee66e237274.

Two presentation fixes only:

- Discounted and struck prices share one horizontal flex row for every amount. The million-rupiah stacked presentation and narrow-screen stacking override are removed. A numeric CSS property budgets type from formatted string lengths and actual card-container width; it does not change pricing values or promotion eligibility.
- The reserved upper price row, `mt-auto`, card `h-full`, and body `flex-1` no longer push prices to the bottom. Purchase content follows name/countdown with an 8px margin. Featured prices use natural height instead of a 44px blank action row. Card/track widths, carousel behavior, image size/aspect, borders, colors, actions and grid breakpoints stay unchanged.

Only product-card.tsx and purchase-controls.css change application presentation. No API, database, monetary calculation, countdown logic, cart/checkout, admin, header/footer or Home grid/carousel source changes.

## Explicit narrow-card tradeoff

The user explicitly authorized very small fonts for measured geometric cases, with actual sizes reported. Two prices plus a 44px cart target in a 320px two-column card cannot preserve the previous 12px/10px minimum. The regression tests therefore replace that superseded minimum with horizontal-coordinate, proportional-size, no-clipping, and unchanged 44px-target checks. This is a requested requirement change, not a readability improvement.

Measured synthetic examples at 320px (published and default theme):

| Current / struck amount | Main font | Struck font |
|---|---:|---:|
| Rp17,000 / Rp20,000 | 5.99px | 4.79px |
| Rp249,000 / Rp299,000 | 5.39px | 4.31px |
| Rp1,499,000 / Rp1,999,000 | 4.49px | 3.59px |
| Rp8,999,000 / Rp9,999,000 | 4.49px | 3.59px |

These sizes have a substantial legibility cost; review the screenshots before approving release. Wider/featured cards increase type up to existing caps. All amounts stay unbroken on one row.

## Verification evidence

`node tests/integration/product-card-layout-preview.mjs` from frontend runs read-only public-HTML previews. It removes only old price presentation rules in the local browser and injects candidate CSS/markup equivalents. No server files, database records, logins or orders are changed. This is CSS/layout evidence, not an actual candidate deployment or hydration test.

Preview covers eight required widths, populated Home/Shop/search/category/brand when available, synthetic ordinary/discounted/million-rupiah prices/countdown, default/published theme attributes, one result, no overflow/clipping/overlap, 44px cart alignment, 8–12px featured spacing, and unchanged carousel/tablet/desktop track widths. Actual candidate app, countdown and hydration checks run in isolated CI through the existing product browser suite, with new coordinate assertions.

- [Home before](evidence/before-home-390.png) / [after](evidence/after-home-390.png)
- [Shop before](evidence/before-shop-390.png) / [after](evidence/after-shop-390.png)
- [Narrow shop](evidence/after-shop-320.png)
- [Synthetic default](evidence/after-synthetic-default-320.png) / [published](evidence/after-synthetic-published-320.png)
- [Full measured geometry](evidence/public-preview-results.json)

Local Node22 lint/typecheck passed. Production build exited successfully with database-unavailable diagnostics because this workstation has no local database configured. Exact-head CI with disposable PostgreSQL remains authoritative. User-referenced screenshots were not attached to the pasted request; before captures above use the public baseline.
