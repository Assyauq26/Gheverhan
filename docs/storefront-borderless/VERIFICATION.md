# Borderless storefront chrome

Baseline: `origin/main` **6c1e05020a92809e0b515e22dc0855207eac0a95**, merged PR #104 (baseline main build check: success). Branch: `fix/storefront-borderless-chrome`. The implementation follows the attached Borderless Storefront Chrome specification. All fixtures, users, theme publishes and browser writes in this report are synthetic and run against guarded disposable loopback PostgreSQL17. No Production data, saved theme, VPS configuration or deployment was accessed or changed.

## Root cause and bounded inventory

| File / selector | Finding | Change / disposition |
| --- | --- | --- |
| `components/storefront/header.tsx`, outer `header` | `border-b border-line` creates a structural separator | Remove both classes. Sticky toggle, stacking, branding, search and actions unchanged. No header shadow added. |
| `components/storefront/bottom-nav.tsx`, outer `nav` | `border border-line` creates a pill outline; `shadow-lg` couples chrome to card elevation | Remove these three utilities. Preserve surface, pill geometry, fixed/safe-area position, active capsule, core links, cart listener and bar mode. |
| `app/(storefront)/layout.tsx`, `footer` and copyright wrapper | Two `border-t border-line` separators inherit a strong theme border | Remove both pairs; add `pt-2 md:pt-4` to copyright wrapper. Trust columns, logo, tagline, legal routes and existing padding retained. |
| `components/appearance/preview.tsx`, preview footer | `border-t` introduces an extra preview-only divider | Remove it; shared header/nav automatically use the same correction. Isolation/messages/logo reads untouched. |
| `components/appearance/theme.css`, border utility mapping | Functional `--store-border` colors any shell still carrying a border utility | Keep functional mapping; remove widths at their JSX sources. Add narrowly scoped pill/bar shadow rules. No blanket border suppression or new `!important`. |
| `modules/appearance/runtime.ts`, style mapper | Existing card shadow cannot independently express gentle shell elevation | Derive `--store-shell-shadow` from existing `styling.shadow`: none, soft 4px/16px at .08, raised 8px/24px at .14. Tint uses validated `navText`. No stored setting/schema change. |
| `app/globals.css`, base `*` border color | Sets color, not structural width | Audited and unchanged. Functional borders/focus remain. |
| Product cards/search | PR #104 already derives soft decorative borders and 16px/12px geometry | Retain unchanged and assert across all ten presets. |
| Controls/options/dialogs; checkout/business flows | Accessible boundaries and transaction semantics are unrelated | Retain unchanged; existing regression suites remain enabled. |

The legacy mapper still returns `{}`. Legacy shell shadows have narrow CSS fallbacks; published themes use generated palette-aware values. Existing published Default and custom themes receive the presentation correction from code, with no reset, save or republish required. All other tokens, gradients, color contrast validation, presets and card shadows retain their existing mapping.

## Regression and screenshots

The expanded browser test **fails against the baseline build**: `legacy 390: header bottom`, actual `1px`, expected `0px`. See [pre-fix-regression.txt](evidence/pre-fix-regression.txt). This is the intended red check, not a passing final result.

The new assertions verify actual existing header/footer/nav elements; computed header bottom, footer top, trust/legal wrapper top and all four navigation borders must be `0px`. They run on legacy, published Midnight/Monochrome, all ten private preview presets, gradient header/footer, bar layout and shadow preferences. Search retains a 1px border and visible focus feedback. Existing card/media radius and decorative border checks remain. Public/preview navigation retains four core destinations, active aria-current and preview cart badge. Sticky/nonsticky behavior is exercised. All three iframe widths remain covered.

Public/editor widths: **320, 360, 375, 390, 412, 430, 768, 1024, 1280, 1360, 1440, 1920**. Check no horizontal overflow; mobile target sizes at least44px; footer clears the fixed nav at the end of the page; nav hidden on desktop. Existing mobile touch/reduced-motion/cart synchronization and checkout assertions stay enabled.

Before and after captures use the same source baseline fixtures, Node22, Chromium and viewport dimensions. They show synthetic `Local product` cards and a synthetic logo, not Production photography. Some original fixture image URLs are unavailable; these image placeholders are present in both sets and are not evidence of media-provider readiness. Images are visual evidence of chrome, not pixel-identical comparisons.

| View | Before | After |
| --- | --- | --- |
| Published Monochrome390 top | [Before](evidence/before/customize-chrome-monochrome-390-top.png) | [After](evidence/after/customize-chrome-monochrome-390-top.png) |
| Published Monochrome390 footer/pill | [Before](evidence/before/customize-chrome-monochrome-390-footer.png) | [After](evidence/after/customize-chrome-monochrome-390-footer.png) |
| Published Monochrome1360 footer | [Before](evidence/before/customize-chrome-monochrome-1360-footer.png) | [After](evidence/after/customize-chrome-monochrome-1360-footer.png) |
| Midnight390 footer/pill | [Before](evidence/before/customize-chrome-midnight-390-footer.png) | [After](evidence/after/customize-chrome-midnight-390-footer.png) |
| Preview390 footer/pill | [Before](evidence/before/customize-chrome-preview-gheverhan-monochrome-390-footer.png) | [After](evidence/after/customize-chrome-preview-gheverhan-monochrome-390-footer.png) |

Local browser metadata records the baseline commit because captures precede the feature commit. [summary.json](evidence/summary.json) identifies the staged frontend tree actually tested; different build IDs distinguish baseline/feature. Final CI revalidates the pushed head.

Both evidence directories include top/footer captures of legacy, Monochrome and Midnight at390/1360 plus Monochrome/Midnight390 private previews (16 per set).

## Commands and results

Supported Node22 and disposable `gheverhan_sprint1_test` are required. The existing CI workflow is the authoritative complete command list; no workflow or test disabling is part of this change. Existing Prisma migrations are applied only to disposable test databases, with no new migrations in this PR.

- Baseline `npm test`: **494 PASS /60 files**.
- `npm run typecheck`, `npm run lint`, `npm run build`: **PASS** (ESLint: no warnings/errors; existing Next CLI deprecation notice remains).
- Final `npm test` and hardened offline `Dockerfile.test` runner: **497 PASS /60 files**; **25 containment +9 mitigation PASS**. The container uses no network, read-only image, no capabilities, no privilege escalation and no runtime credentials.
- `node --test .github/tests/production-read-only-preflight.test.mjs`: **11 PASS**.
- All20 existing PostgreSQL integration suites from the workflow: **207 PASS**, zero failures/skips.
- `node --import tsx tests/integration/product-browser.ts`: **48 PASS** (baseline screenshot harness also48 PASS).
- `npm run test:e2e:operations`: **21 PASS**.
- `node --import tsx tests/integration/auth-ui-browser.ts`: **15 PASS**, errors=[] (the expected intentionally aborted transport is tracked separately).
- `node --import tsx tests/integration/react-hydration-replay.ts`: **PASS**, errors=[].
- Final same-SHA navigation matrices and complete CI/provider-contract outcomes are recorded in the PR checks/description after completion. CI is rerun on the pushed final commit; a running job is not considered PASS.

## Scope and release

Only six frontend presentation files, established tests and this evidence are changed. No backend/API/auth/checkout/cart/transaction source, schema, migration, saved appearance or deployment workflow change. Review requested from `mrifatsyauqi` through the PR. Physical Android/iOS safe-area and screen-reader checks remain manual release QA, not an automated claim. Rollback is a code revert; no theme reset, database rollback or republish is needed. **Do not merge or deploy without explicit release approval and green CI.**
