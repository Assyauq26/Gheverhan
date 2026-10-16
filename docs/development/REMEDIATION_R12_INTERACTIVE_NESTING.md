# Remediation R12 — Product card interactive semantics

## Confirmed structural problem
The storefront's product image link wrapped a `WishlistButton` (native
`<button>`) inside a `<Link>` (anchor), violating HTML's prohibition on
nested interactive content. This risks ambiguous click/keyboard behavior,
invalid accessibility semantics, and HTML/server hydration differences.

## Change
The wishlist button is an absolutely positioned **sibling** of the product
image anchor inside the relatively positioned card. The same coordinates,
z-index, visual label, and client/server wishlist behavior are retained.
Wishlist remains omitted on featured cards.

## Tests and limitations
The dedicated component test asserts that the wishlist button is not inside
an anchor. The full isolated PostgreSQL and Chromium suite remains required,
especially navigations to /shop. No product/customer/order data is changed.

This structural correction is **not established as the sole cause** of
intermittent React hydration #418 or App Router pagination timeouts. Continue
RSC transport diagnostics in PR #45 and keep all CI failures visible.

Draft until reviewed. No production merge, migration or environment change.
