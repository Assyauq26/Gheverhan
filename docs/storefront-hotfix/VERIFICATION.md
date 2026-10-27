# PDP image / disabled action hotfix

Baseline main: `0e303a5760ba143f04aadbacd3d3c4589dc28e95`. Feature branch: `fix/pdp-image-disabled-actions`. Application change commit: `f7dec14`. Frontend only; no backend/service, schema/migration, pricing, stock, transaction, auth, theme records or Production changes.

## Root causes and changes

1. Mobile `.pdp-hero` and `.pdp-media` had explicit height, but the intermediate gallery root did not. The frame used `height:100%` and its Next Image used absolute `fill`, leaving no in-flow image height. A successful image download/naturalWidth assertion therefore did not prove visible pixels. Extend the mobile height chain to `.pdp-gallery`; preserve desktop aspect ratio and sticky/header/full-width action-bar contracts.
2. Gallery accepted empty/failed sources and had no load/error recovery. Keep first valid gallery order, put a selected option image first, deduplicate and reject empty/unsupported sources, clamp/reset indices, skip network failures to the first remaining valid image, and render a themed loading state or explicit no-photo message. Track loaded URLs independently to avoid late load events replacing readiness for a newer image. Serve published product-image API URLs directly, matching existing option/media controls; external/static optimization remains enabled.
3. Shared theme disabled rules could override purchase actions with a pale background. Introduce one scoped purchase-state rule with sufficient specificity regardless of stylesheet order; derive its muted solid from 65% published primary + 35% primaryText, retain primaryText and full opacity, remove disabled gradients/shadow. Controls outside these purchase CTAs keep their existing states. Private Customize preview uses the same quick-add component automatically.
4. The PDP label condition changed purchase intent to “Pilih variasi”. Keep “Beli Sekarang” while disabled; retain existing helper copy and all native disabled/selection checks. Pending still says “Memproses…”.

## Changed implementation files

- `frontend/src/components/storefront/product-gallery.tsx`
- `frontend/src/components/storefront/product-detail.css`
- `frontend/src/components/storefront/purchase-panel.tsx`
- `frontend/src/components/storefront/quick-add-variant-sheet.tsx`
- `frontend/src/components/storefront/purchase-controls.css`

Tests extend `product-gallery-keyboard.test.ts` and `native-purchase-browser.ts`; `custom-variations-browser.ts` resolves direct/optimized image sources and compares the complete expected URL. No global token/schema edits or changes to existing mutation functions.

## Actual local verification

- `npm test`: PASS 520 tests / 66 files (four new gallery recovery tests; existing keyboard tests retained).
- `npm run lint`: PASS with the existing unrelated `hero-editor.tsx:175` image warning.
- `npm run typecheck`: PASS.
- `npm run build`: PASS production build. Existing Tailwind easing utility warning remains.
- `NATIVE_PURCHASE_ONLY=1 npm run test:e2e:products`: PASS 8 checkpoints including the new hotfix case, on disposable local PostgreSQL and synthetic fixtures.
- Final complete browser regression and exact-commit GitHub CI results are linked and counted in the PR description/checks. No test has been disabled or weakened.

New browser assertions require a visible, decoded hero occupying more than 250px height at 360/390/430px, not merely naturalWidth. Verify initial cover, option photo switch, no-photo option fallback, broken first cover fallback, simple product enabled CTA, incomplete dark disabled PDP/cart/modal, valid selection enabling, preserved labels, and no cart mutations while merely selecting. Existing dark/sage/gradient theme checks additionally compare disabled computed colors with the actual published primary pair. Existing preview ten-presets, cart/badges, Buy Now, checkout, ownership, stock-race and keyboard/gallery regressions stay enabled.

A diagnostic full run initially failed an unchanged admin product-editor Back/Forward assertion (`product-native-browser.ts:147`). This failure is retained as a limitation of that run, not described as PASS; that assertion passed on the next run. A later existing gallery assertion assumed optimizer encoding; it now compares the complete selected image URL for either direct or optimized delivery. The complete rerun and exact-commit CI determine final status. During development the new visibility assertion also exposed streamed hidden content; it now waits for visible PDP before measuring. No runtime/auth or admin editor code was changed.

## Evidence and limits

Screenshots are local synthetic fixtures, not Production or the user's device. Random product labels differ between runs. Baseline reproduces the blank mobile gallery; do not claim pixel fidelity against screenshots absent from this conversation. Modal captures wait for its finite opening animation. See `evidence/before` and `evidence/after` for 390px before/after plus 360/430px mobile and broken-image fallback.

Physical iOS/Android, assistive technology and real device safe-area/browser chrome QA remain manual. Existing header logo/back behavior, full-width mobile purchase bar, sticky gallery, dot controls, bottom sheet shape and published theme authority are preserved. No merge/deploy is authorized by this hotfix implementation. Rollback, if later released with separate approval, is the normal reviewed application revert/previous artifact; no data or schema rollback is needed.

| Surface | Before | After |
|---|---|---|
| PDP mobile | [390px](evidence/before/product-v3-pdp-start-390.png) | [390px](evidence/after/hotfix-pdp-390.png), [360px](evidence/after/hotfix-pdp-360.png), [430px](evidence/after/hotfix-pdp-430.png) |
| Quick-add disabled | [390px](evidence/before/product-v3-options-unselected-390.png) | [390px](evidence/after/hotfix-quick-add-390.png), [360px](evidence/after/hotfix-quick-add-360.png), [430px](evidence/after/hotfix-quick-add-430.png) |
| Invalid cover fallback | — | [390px](evidence/after/hotfix-fallback-390.png) |
