# Verification

All writes and browser users in this report use synthetic fixtures and a disposable loopback PostgreSQL17 container. No Production bindings, user data, migration, VPS deployment or live theme update was used.

Baseline: main `b452fd10d52e9d439a58b9d0466ba4991ac8dcf0`; baseline unit suite447/447 PASS. Full browser-tested implementation: `1864a34ebf606b1d29508e218ae1b8d632378eec`. The final source adds stricter per-segment gradient validation, covered by the493-unit suite and the final CI rerun. Current-head CI validates all gates again; the committed local browser report preserves its original code/build identity. Exact source/tree and totals are in [verification-summary.json](evidence/verification-summary.json).

## Executed checks

| Command / gate | Actual result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, no ESLint warnings/errors; Next's CLI deprecation notice remains |
| `npm run build` | PASS, optimized Next15 production build and Prisma generation |
| `npm test` | **493 PASS /60 files**, zero failures |
| Hardened offline `Dockerfile.test` runner |488 unit +25 containment +9 mitigation PASS on intermediate source; final-source offline result is reported by the unchanged GitHub unit job |
| Existing isolated PostgreSQL suites | **193 PASS**, zero fail/skip |
| `store-appearance-migration.test.ts` + `store-appearance.test.ts` | **13 PASS**, zero fail/skip |
| `scripts/appearance/preflight.ts` | PASS:4 RLS tables,3 permissions, configured local provider; schema/config check only |
| Real disposable Supabase Storage API drill | PASS: product and branding namespace byte integrity, private/public anonymous denial, invalid bearer denial, duplicate upload denial, verified delete |
| `product-browser.ts` | **46 PASS**, including12 Customize checkpoints and unchanged commerce/media/variation assertions |
| `operations-browser.ts` | **21 PASS**, including390/1360 shipping/payment proof, rejection/resubmission/approval and totals/stock checks |
| `auth-ui-browser.ts` | **15 PASS**, including9 viewport geometry checks, OTP/reset/revocation and neutral legal/auth surfaces |
| `react-hydration-replay.ts` | PASS, zero recoverable errors on the actual patched App Router runtime |
| Navigation stability gate | Existing **10 cycles ×44 cases** remains unchanged. The final result/matrix is generated and uploaded by CI; consult [current PR checks](https://github.com/Assyauq26/Gheverhan/pull/103/checks) and the PR validation description for the completed run rather than treating a running job as PASS. |

Sanitized command tails: [command-results.txt](evidence/command-results.txt). Browser checkpoints and exact source/build/browser versions: [browser-results.json](evidence/browser-results.json). Auth and hydration details are adjacent JSON reports.

## What the new tests prove

- All10 presets are structurally complete, render in the shared iframe and pass the declared WCAG pairs. Narrow gradient transitions are also sampled within every interval, so a1% transition cannot hide between global samples. Automatic foreground generation also passes every grayscale boundary from0 through255.
- Strict schema, unknown version/keys, URL/encoded traversal, CSS injection, required mobile destinations and separate branding path/PDF rejection.
- Authoritative permission checks for private reads, actions, preview and media; a customer identity is denied even with a misplaced permission. Direct admin HTTP clients receive401/403 and409 as appropriate.
- Public no-row reads perform no bootstrap write. Saved draft does not appear in visitor HTML, image references or branding before Publish.
- Atomic save/publish races have exactly one winner; stale versions fail without overwrite. Invalid contrast can save draft but cannot publish. Rollback appends a revision and preserves draft/history assets.
- PNG/JPEG/WebP signatures, size, dimensions/frames, explicit PNG animation envelope rejection, canonical WebP and metadata removal; staging ownership/session, idempotency, current-published-only public reads, retirement/reference protection, expiry retention and atomic rate buckets.
- Additive migration preserves legacy Product/SKU values; a blocked Permission lock fails within the bound, rolls back all new DDL and succeeds through official Prisma resolve/retry with exact checksums. Existing migration assertions retain their historical boundaries and now account for13 migrations.
- Logo text/image/both, real canonical logo read, error fallback, live gradient normal/hover state, contrasting header-gradient hover, header visibility, bottom-bar labels, no admin token inheritance, two tabs, real touch preview and all three iframe widths.
- Palette/layout edits perform zero additional private-logo requests after initial loading. Preview uses synthetic presentation with no transactional handlers and a sandbox/CSP boundary.

## Visual evidence and limits

Authenticated baseline captures compare identical data, fixed synthetic product images, completed font/image loading and reduced motion. Home/shop/PDP/cart/account/checkout were captured at390 and1360. Ten of12 decoded screenshots match exactly; home390 differs in42 channels with max delta2/255, and checkout1360 in153 channels with max delta1/255. No channel differs by more than2/255. See [baseline-comparison.json](evidence/baseline-comparison.json). This is **not** a claim of12 pixel-exact matches or a comparison of Production photography.

Studio/storefront screenshots: [desktop editor](evidence/customize-editor-1360.png), [mobile editor](evidence/customize-editor-390.png), [desktop preview](evidence/customize-preview-1360.png), [mobile touch preview](evidence/customize-preview-390.png), [desktop published](evidence/customize-storefront-1360.png), [mobile published](evidence/customize-storefront-390.png).

Document overflow checks cover320,360,375,390,430,768,1024,1280,1360,1440,1920. The iframe is measured at390/768/1360. Existing variation/auth regressions also exercise keyboard, enlarged text and reduced motion. New editor captures have no unhandled browser exceptions. Deliberately aborted logo requests test fallback; that is not a claim that all network-console events are absent.

The preview is a shared-component gallery with synthetic content, not a live checkout session. Actual VPS provider/storage readiness and physical iOS/Android/screen-reader QA remain release checks. Auth/legal stay neutral by agreement. No independent human review or Production readiness is implied by automated PASS results.

## Reproduce safely

Use Node22, a disposable loopback database named `gheverhan_sprint1_test`, and the fixture variables from the existing isolated CI workflow. Install locked dependencies, prepare Prisma, apply migrations and build before running browser scripts. Direct Node integration services use the CI-only server-only marker setup already present in that workflow.

Run the unchanged workflow gates plus:

```sh
node --disable-proto=throw --import tsx --test tests/integration/store-appearance-migration.test.ts
node --disable-proto=throw --import tsx --test tests/integration/store-appearance.test.ts
STORAGE_PROVIDER=local STORAGE_LOCAL_ROOT=/tmp node --import tsx scripts/appearance/preflight.ts
```

For baseline images, seed a separate disposable fixture, run detached main and feature servers against the same fixture with no concurrent commerce tests, then run `tests/integration/store-appearance-baseline.ts`. Do not seed or reset a Production environment.

The hardened unit runner requires its offline/read-only/unprivileged container profile. The managed host is not that profile. Its first build needed the configured proxy CA; a later local build exhausted disk and stopped only the disposable PostgreSQL container. Generated Docker caches were removed, that container restarted, and affected checks rerun. No containment assertion or TLS verification was disabled.

Browser fixtures retain the singleton/history for the app server's lifetime, then tear down rows and generated cache only after stopping it. Branding objects have their own bucket map in the storage double, so existing product-object count assertions remain unchanged. Warmed-cache assertions still run inside the same live server.
