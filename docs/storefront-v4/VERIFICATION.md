# Storefront V4 — verification and evidence

Baseline main `f6e7fbfd24cf618e55adf9bb4d260e0a2ce6ab5f`; branch `fix/storefront-pdp-sheet-reviews-checkout-v4`. No Production access, data/theme writes, deployment or merge for this task. Tests use guarded loopback PostgreSQL17, dummy accounts/orders/media, manual payment/shipping and the existing loopback storage/email doubles. No real mail/payment/refund is sent. No providers/dependencies are re-enabled.

## Actual local results

| Check | Command / actual result |
|---|---|
| Unit | `npm test`: PASS527 tests /68 files |
| Existing PostgreSQL regression | All existing21 integration commands from isolated-regression workflow: PASS215 tests, no fail/skip |
| Verified-review security | `node --disable-proto=throw --import tsx --test tests/integration/verified-reviews.test.ts`: PASS21 tests |
| Official migration/recovery | `node --disable-proto=throw --import tsx --test tests/integration/verified-review-migration.test.ts`: PASS2 tests, legacy preservation, fresh/upgrade/retry, unique/FK and bounded-lock rollback/recovery |
| Lint / types | `npm run lint`, `npm run typecheck`: PASS; existing unrelated hero-editor.tsx:175 no-img-element warning |
| Production build | `npm run build`: PASS, existing Tailwind easing utility warning retained |
| Native purchase baseline/regression | `NATIVE_PURCHASE_ONLY=1 npm run test:e2e:products`: PASS8 checkpoints on Chromium154, including the new bounded-sheet contract |
| Complete product browser | Existing harness on CI-matched Chromium153: PASS64 checkpoints; [record](evidence/full-browser.json) |
| Final V4 source/presentation | `STOREFRONT_V4_ONLY=1` on production build with CI-matched Chromium153: PASS7 deep checkpoints; [record](evidence/final-v4-browser.json) |

The PostgreSQL batch initially contained236 tests (existing215 + migration2 + review19). After adding two atomic-read/pagination cases, the final review suite21 was rerun successfully on disposable PostgreSQL. Counts above select the latest execution per suite; repeated runs are not counted as extra coverage. [Sanitized summary](evidence/local-summary.json).

The complete64 browser run precedes the final small shared verified-badge/subtle-card presentation refinement; the final7 rerun includes that source, exact badge assertion and fully unobscured review capture. Exact final-commit CI reruns the complete unchanged pipeline; final job links/status, operations/auth/hydration and ten-run navigation matrix belong in the PR checks/body rather than a premature committed PASS claim.

## Tested contracts

- Prices: actual5/6/7-digit and discounted fixture values, each primary value remains nowrap and wholly inside its card; independent strike wrapping, responsive font bounds, no document overflow; featured cards have no wishlist/quick-add controls.320/360/375/390/430/768/1024/1440px.
- PDP: initial decoded gallery; document wheel raises panel to header+38px; subsequent inner wheel and keyboard End move content while shell stays put; lower sections reachable and panel ends above the full-width CTA. Collapse returns to document scroll; desktop retains grid/sticky media. Required accordion ordering/table/unit/icon targets are checked. Existing gallery/variant/cart/keyboard/hydration assertions stay enabled.
- Reviews: anonymous/session denial, no public form, missing/foreign item denial, unpaid/unreceived/cancelled/expired/refunded and inactive-account denial, active refund and refund race, exact product/source resolution, bounded input, per-item repeats across multiple real purchases, concurrent duplicates/DB uniqueness, moderator permission, pending/rejected hiding, immutable legacy preservation, wrong-owner/product linkage exclusion, privacy projection and literal XSS text. Snapshot/rating and21+ row pagination checks preserve aggregate consistency.
- Browser review flow starts from owned received order, tampers hidden item identity and verifies denial, submits twice and observes exactly one persisted row, returns to Sudah Diulas, then checks verified badge/PDP/card rating, escaped HTML-like body and publication changes against warmed metadata cache. Next may stream a notFound document with HTTP200 after layout headers flush; the test requires its404 marker, no form or product snapshot, while service/action authorization is independently tested.
- Checkout: exactly one submit within the original form, mobile fixed/full-width geometry and bottom clearance at all widths, same summary/sticky total; shipping/coupon changes, loading/error/retry/stale quote, native required validation, real stock rejection with no new order, duplicate click yielding one successful order, and direct Buy Now checkout. Existing server pricing/idempotency remain unchanged.
- Published themes: dark Midnight Ink, Sage Studio and gradient Monochrome; nav fill, disabled primary-pair blend, enabled gradients, price and PDP layout. Existing ten-preset private-preview tests remain enabled; there is no new transactional preview route or draft flag.

## Diagnostic limits retained honestly

Chromium154 local complete runs reproduced the pre-existing admin-editor Back/Forward assertion at product-native-browser.ts:147. No assertion or admin code was changed. A fresh disposable database and the bundled Chromium153 used by CI passed the full64 checks. V4-specific checks also pass on154. One existing OTP countdown unit assertion locally differed by1 second; the unchanged527-test suite passed on rerun. Final CI status remains authoritative; neither failure is relabeled as a passing execution.

During test development, helper selectors were corrected to select the actual featured section and review-form alert rather than Next's route announcer, and review success accepts the authoritative Sudah Diulas rerender. Security and numerical assertions were retained/strengthened; no tests skipped. Evidence waits for image readiness and targets visible regions. Recreating the task's own disposable database did not disable any auth/rate limit or use migrate reset.

Physical Android/iOS Safari, browser-toolbar/keyboard/notch behavior and assistive-technology QA remain manual. Three reference screenshots named in the brief were not supplied: no pixel-match or percentage-fidelity claim. Baseline screenshots retained cover PDP; matching baseline price/checkout/review screenshots were unavailable and are not fabricated. Random synthetic labels/configurations differ between runs.

## Screenshots

### Final CI follow-up: legal-footer pointer preconditions

On `efa2e35`, unit/policy and production-image builds passed; both integration attempts passed all238 PostgreSQL tests/23 invocations,64 product-browser and21 operations checkpoints, then failed the unchanged legal-footer pressed-color check (idle gray instead of pressed blue). Hydration/navigation CI was consequently skipped, not counted as passing. Local auth/legal15 and hydration replay had passed independently.

The pointer prerequisite failure was reproduced locally: `:active` was false after mouse-down. Focusing/centering the element alone did not fix it. The harness now brings the anonymous second page to the front, verifies document/element focus, centers the link before pointer input and explicitly checks `:active`. Exact hover/pressed color assertions remain unchanged; no application CSS, auth code or test exclusions changed. The complete auth/legal15 then passed with CI-matched Chromium153 (`/tmp/v4-auth-focused.log`, synthetic evidence `/tmp/gheverhan-v4-auth-focused`). Typecheck/lint also passed (existing hero-editor warning). Final CI on this test-only follow-up is reported in PR112; no Production deployment occurred.

| Surface | Before | After |
|---|---|---|
| PDP initial | [390](evidence/before/product-v3-pdp-start-390.png) | [390](evidence/after/v4-pdp-initial-390.png) |
| PDP expanded | [390](evidence/before/product-v3-pdp-expanded-390.png) | [bounded top/gradient preset](evidence/after/v4-pdp-theme-0-390.png), [last content](evidence/after/v4-pdp-expanded-390.png), [desktop1440](evidence/after/product-v3-pdp-1440.png) |
| Featured prices | — | [320](evidence/after/v4-prices-320.png), [390](evidence/after/v4-prices-390.png), [1440](evidence/after/v4-prices-1440.png) |
| Reviews | — | [owned form](evidence/after/v4-order-review-form-390.png), [verified/XSS-text proof](evidence/after/v4-verified-review-390.png) |
| Checkout | — | [320](evidence/after/v4-checkout-320.png), [390](evidence/after/v4-checkout-390.png), [1440](evidence/after/v4-checkout-1440.png) |
| Published themes | — | [dark](evidence/after/v4-checkout-theme-1-390.png), [sage](evidence/after/v4-checkout-theme-2-390.png), [gradient](evidence/after/v4-checkout-theme-0-390.png) |
| Cart regression | — | [390](evidence/after/product-v3-cart-390.png) |

See [architecture](ARCHITECTURE.md) for root causes/security/cache, and [migration/rollback](ROLLBACK.md) for release boundaries.
