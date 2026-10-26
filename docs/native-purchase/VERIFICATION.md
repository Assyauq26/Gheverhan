# Native purchase V3 — verification

## Provenance and safety

Baseline `origin/main`: `dd27f03148632481f156c9c4a648a222a146c028` (500 unit tests/61 files, 48 product browser checkpoints PASS). Branch: `fix/variant-quickadd-native-pdp-cart-controls`. Final application source: `0b1993ece5b146c6f4d87c215e8a7c36190382f8`; following evidence/test/documentation commit changes no application source. Retained browser result JSON records actual commit, build ID, Node and Chromium versions. Local runs used Node 22.23.4 and Chromium 154.0.8037.57.

Only guarded disposable loopback PostgreSQL, synthetic accounts/products/images, dummy credentials and loopback storage double were used. Existing migrations were applied to fresh disposable PostgreSQL 17. No Production migration, storage access, customer data, published-theme change, merge or deployment occurred. No schema, dependency, workflow or existing cart/checkout/auth authority changes.

## Executed local checks

| Command / check | Actual result |
|---|---|
| `npm test` | PASS 516 tests / 66 files |
| Fresh `docker build -f frontend/Dockerfile.test ...` then hardened offline `npm run test:ci` container | PASS same 516 tests, 25 containment tests, 9 braces mitigation tests; network none, read-only filesystem, nonroot, dropped capabilities |
| `node --test .github/tests/production-read-only-preflight.test.mjs` | PASS 11 policy tests |
| `npm run lint` | PASS; one incumbent `admin/hero-editor.tsx:175` no-img-element warning |
| `npm run typecheck` | PASS |
| `npm run build` | PASS production compilation and route validation |
| All 21 PostgreSQL test invocations from existing isolated-regression workflow | PASS 215 tests, zero failures/skips |
| `npm run release:preflight` with read-only disposable configuration | PASS: appearance tables/permissions, hero tables, local storage |
| `npm run test:e2e:products` | PASS 56 checkpoints, [record](evidence/product-browser.json) |
| Targeted native purchase browser confirmation | PASS 7 checkpoints, including touch dismissal and explicit normal/hover gradient assertions; [record](evidence/native-confirmation.json) |
| `npm run test:e2e:operations` | PASS 21 checkpoints |
| `node --import tsx tests/integration/auth-ui-browser.ts` | PASS 15 checkpoints; [record](evidence/auth-ui.json) |
| `node --import tsx tests/integration/react-hydration-replay.ts` | PASS; [record](evidence/hydration.json) |

PostgreSQL coverage preserves existing migration/recovery, concurrent cart creation/increments, lifecycle, Buy Now ownership/replay, checkout/transaction, refund/shipping, registration/indexes/OTP, appearance/media/RBAC and hero invariants. Broader local PostgreSQL/operations/auth/hydration checks ran before the last minor presentation hardening; final PR CI repeats all unchanged suites against the exact final commit. Complete CI status and same-commit navigation stability matrix are reported in the PR checks/body, not asserted prematurely here.

## Browser acceptance coverage

- On-demand bounded published metadata; hidden/draft denial; no private stock/provider data; failed/aborted metadata retry without mutations.
- Explicit sparse three-group choices resolve exact blue/XL/slim SKU. Two units at Rp150,000 plus a Rp95,000 item reconcile to Rp395,000. Duplicate taps issue one mutation; closing/canceling choices does not add. Stock races preserve choices and never display phantom success. Unit cases cover uncertain response recovery without blind replay.
- Persistent confirmed success sheet, actual returned line/name/image/variant/price, quantity/subtotal, continue-shopping focus/scroll, view-cart reconciliation, guest login continuation. Existing real concurrent increment tests stay enabled.
- Shared bounded quantity controls, pending checkout blocked, serialized cart reconciliation/rollback, badge events, exact direct checkout and old-cart preservation.
- Native PDP fixed topbar/sticky gallery/natural scrolling, 12-image five-dot window/counter, keyboard focus including repeated boundary keys, touch/swipe, option image synchronization, decoded hero screenshots, reachable lower sections and disabled incomplete CTA.
- Legacy Default, all ten preview presets, published dark/sage/gradient, square/soft/pill and none/soft/raised shadows, themed focus and controls; preview never mutates transactions.
- Responsive 320–1440 purchase/PDP checks plus incumbent editor/customizer widths through 1920, no horizontal overflow; 844×390 landscape sheet actions remain reachable. Reduced motion, touch-enabled emulation, 45-character unbroken labels, keyboard and enlarged text/reflow checked. A CSS `zoom:2` diagnostic was unsuitable for browser zoom because it does not change responsive breakpoints; the final check uses viewport/DPR reflow emulation. Native browser toolbar zoom and hardware devices remain manual QA.

Intentional aborted requests, negative HTTP responses and stock-conflict errors are tested separately; “PASS” does not claim absence of all transport errors. No tests were disabled. Settled-panel assertions require exactly one panel/action; they do not mask duplicate content using `.first()`.

Repeated diagnostic registration runs reached the existing per-IP rate limit. The limit stayed enabled; the final full run used a fresh disposable database with all existing migrations. Intermediate runs are not presented as final passing evidence.

## Screenshots

All screenshots use synthetic fixtures. Random product suffixes differ between baseline/current runs; these are behavior/layout evidence, not a pixel-diff or reference-fidelity measurement. Baseline had no corresponding variant/success sheet, so no such “before” image is fabricated.

| Surface | Before | After |
|---|---|---|
| Mobile PDP | [390px baseline](evidence/before/product-custom-store-red-390.png) | [start](evidence/after/product-v3-pdp-start-390.png), [expanded](evidence/after/product-v3-pdp-expanded-390.png) |
| Desktop PDP | [1360px baseline](evidence/before/product-custom-store-1360.png) | [1440px current](evidence/after/product-v3-pdp-1440.png) |
| Variant sheet | — | [unselected](evidence/after/product-v3-options-unselected-390.png), [selected](evidence/after/product-v3-options-selected-390.png) |
| Confirmed success | — | [390px](evidence/after/product-v3-success-390.png) |
| Cart | — | [items](evidence/after/product-v3-cart-top-390.png), [summary/CTA/navigation](evidence/after/product-v3-cart-390.png) |
| Published themes | — | [gradient pill](evidence/after/product-v3-published-0-options.png), [dark square](evidence/after/product-v3-published-1-options.png), [sage desktop](evidence/after/product-v3-published-2-options.png) |
| Private preview | — | [1360px](evidence/after/customize-preview-1360.png) |

## Review and remaining limits

Scoped finish review found four issues, all resolved: mobile total hidden by CTA, gallery focus across dot windows, hardcoded focus color, premature undecoded hero capture. Its “ship — scored fixes only” verdict is not a whole-repository or physical-device certification. Launcher/detector binaries were unavailable; no detector result is asserted.

User-named visual references were not attached: no ≥90% fidelity claim. Physical iOS Safari/Android Chrome, keyboard/notch/browser chrome, screen-reader and real browser-zoom QA remain outstanding. Sheet drag handle is visual; drag-to-dismiss is optional and not implemented. Close, backdrop, Escape, focus restoration and interior scrolling are supported. Human review and explicit release approval remain required; do not merge or deploy from this task.
