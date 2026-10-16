# Remediation R12 — Product card DOM and hydration

## Confirmed HTML defect
The Shop product image was a link that **contained an interactive wishlist `<button>`**. Interactive controls may not be nested inside links under HTML's transparent anchor content model. This may interfere with keyboard navigation, synthetic event handling and SSR hydration. This static defect is confirmed, but there is no proof yet it caused every intermittent React #418 or RSC pagination timeout.

## Fix
Keep the same image/product detail anchor but move the independent wishlist control into a positioned sibling overlay. The wishlist stays keyboard accessible and does not trigger product navigation; the clickable image remains a link. Preserve visual overlay with relative positioning and z-index.

## Tests and gates
A jsdom React-SSR regression parses `renderToStaticMarkup` and asserts no `<a> <button>` descendants, verifies anchor and wishlist semantics, and confirms featured cards omit wishlist. Require full isolated PostgreSQL/Chromium CI, repeat browser runs and review before merge. Do not suppress React hydration errors or replace product navigation with plain nonsemantic click divs.

## Remaining investigation
PR #45 still reproduces intermittent server-component navigation and PR #43 traces React hydration. The app's single database remains dummy-data development only. No DB changes or deployment to main are authorized in this draft PR.
