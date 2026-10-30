# Mobile product grid hotfix

Baseline: `acb9e04834004fc3f0c89d433e5be9c057a0b7f7` (PR #114). Review only; no merge or deployment authorized.

The rich-price parent `:has()` rule replaces `grid-cols-2` with a minimum 16rem track. Two further rules force one column below 340px and span wide-price cards below 480px. Together these let price content control mobile track count.

This patch adds `product-listing-grid` only to ProductListing and Home recommendations. A mobile-only selector keeps these grids at two equal tracks and resets card spans. Price fonts/gaps adapt within these cards. All existing tablet/desktop rules, the featured carousel, ProductCard markup, commerce logic, backend and schema remain unchanged.

## Evidence and limits

`node tests/integration/mobile-grid-preview.mjs` (from frontend) performs read-only browser previews of public HTML. Candidate CSS and the marker are injected only into the local browser; this does not represent a deployed candidate. The script checks 320/360/375/390/430/768/1024/1440px, default/published theme attributes, single-result tracks, synthetic inline/stacked/plain prices and countdown content. Actual candidate routes/campaign behavior are covered by the existing isolated Chromium CI suite, now asserting computed mobile tracks and uniform card widths on Shop, Home, Flash Sale, search, category and brand.

Public previews covered five populated routes; the public Flash listing was empty during capture. Synthetic content covers price/countdown layout; it does not test timer logic. The live campaign fixture in isolated CI covers the populated Flash route. Preview tests do not click wishlist or make cart/order mutations; existing isolated browser interactions cover those behaviors.

**Review tradeoff:** keeping inline prices and the existing 44px cart target within two 320px tracks requires the main inline price to shrink to approximately 6px (struck price approximately 5px). This follows the user's choice to reduce only price typography/spacing, but limits readability at the narrowest width. Do not describe this as a readability/accessibility improvement. Tablet/desktop typography is unchanged.

Local lint and typecheck passed; production build exited successfully, with database-unavailable diagnostics because this workstation has no configured local database. The isolated CI build/database/browser checks are required before acceptance.

- [Home before, 390px](evidence/before-home-390.png) / [after](evidence/after-home-390.png)
- [Shop before, 390px](evidence/before-shop-390.png) / [after](evidence/after-shop-390.png)
- [Shop after, 320px](evidence/after-shop-320.png)
- [Synthetic before](evidence/before-synthetic-390.png) / [published 320px](evidence/after-synthetic-published-320.png) / [default 320px](evidence/after-synthetic-default-320.png)
- [Measurements](evidence/public-preview-results.json)

The two user-referenced screenshots were not attached in this conversation; the before images above are captured browser baselines.
