# Verification record

Baseline `65addb420fccc74129ed72add4a27465ee0c90f8`; synthetic development environment only. Baseline commit checks `build-and-deploy` and `public-smoke` were successful when inspected. The production host, database and media were not accessed. No merge, production migration or deployment is authorized by this record.

## Executed checks

| Check | Final observed result |
|---|---|
| Node22 `npm run typecheck` | PASS |
| `npm run lint` | PASS; existing hero-editor `<img>` warning remains |
| `npm run build` | PASS on final source build before browser regression |
| `npm test` | PASS: 69 files, 545 tests, including 16 campaign unit cases |
| Hardened offline container `npm run test:ci` | PASS: 545 unit, 25 containment, 9 braces/security cases |
| `node --test .github/tests/production-read-only-preflight.test.mjs` | PASS: 11 |
| All25 CI PostgreSQL test invocations | PASS: 261 tests, zero failures/skips in final results |
| Campaign-specific PostgreSQL service cases | Included above: 21 tests |
| Official campaign migration and bounded lock recovery | Included above: 2 tests |
| Legacy cutover CLI inventory with `--conditions=react-server` | PASS, read-only, zero unresolved local legacy records |
| Chromium full storefront/editor/commerce regression | PASS: 73 checkpoints, including nine campaign scenarios; exact-head CI also runs this entrypoint |
| GitHub CI for feature head | See PR Checks for the exact feature-head result; CI is independently required before release |

The full browser record is [evidence/browser-results.json](evidence/browser-results.json), with deadline/64 card geometry measurements in [evidence/flash-campaign-results.json](evidence/flash-campaign-results.json). The PostgreSQL summary is [evidence/postgresql-results.json](evidence/postgresql-results.json). Commands use `SPRINT1_TEST_DATABASE_URL` restricted to loopback and database `gheverhan_sprint1_test`; Production URLs are never used. Existing storage-provider doubles require `STORAGE_PROVIDER` and `STORAGE_LOCAL_ROOT` unset. Existing local-adapter tests set their own bindings. Container containment requires the offline unprivileged/read-only/no-capabilities/no-secrets profile; running those environment assertions directly on the developer host is not valid evidence.

The release-preflight legacy-server test initially overlapped a local `.next` rebuild; rerunning after the build finished passed all15 tests unchanged. Product-editor storage tests initially inherited the local provider instead of their loopback double; correcting the invocation passed all15 unchanged. Browser selectors were narrowed to the actual searched product, and new geometry checks validate computed44px CSS dimensions plus a0.1px tolerance for transformed bounding-box rounding. Cart fixtures that bypass application writes now invalidate catalog metadata through an actual authorized save of a synthetic product before asserting global Shop navigation. This preserves the existing cache and all navigation assertions. Screenshot fixtures use a visible generated garment PNG rather than a one-pixel white image. The native-history fixture now lets Next commit its manually pushed history entry before exercising Back/Forward; all cancellation/acceptance assertions remain. CI exposed2px clipping for a seven-digit amount at360px with a different installed font. Long primary/struck amounts now span a mobile grid row up to479px; the original clipping assertions remain and also exercise a wider fallback font. No existing test was disabled or weakened.

## Assertions exercised

- Strict campaign DTO, WIB conversion, impossible dates, >24-hour deterministic SSR, client clock skew, unknown fields and legacy archive UTC comparison.
- Authorized Marketing-only writes, anonymous/read-only action replay, forged false/null/nested product fields, archived/unpublished/unavailable eligibility, variant reference prices, draft privacy and optimistic conflicts.
- Concurrent campaign saves, database exclusion defense, adjacent windows, stale versions, audited edit/end/removal, fresh projection and master regular-price preservation.
- Cart, direct purchase, checkout preview, stale create-order denial, and an actual campaign-end/order transaction lock race. Existing transaction, refund, stock and registration suites remain enabled.
- Official migration on fresh/legacy/conflicting datasets preserves all Product rows and archives distinct original windows without creating campaigns. Lock timeout rolls back the complete DDL; official Prisma resolve/retry succeeds.
- Existing Customize10 presets, dark/colored/gradient themes, image ownership, navigation, checkout, cart badge and V4 verified reviews run through the unchanged browser entrypoint with added campaign cases.

## Visual evidence

Eight [before captures](evidence/before/) cover Home, Shop, Flash listing and Marketing at390/1440px, taken against the pre-change V4 build. Eight matching [after captures](evidence/after/) were collected by the new browser cases. Product card geometry is checked at320/360/375/390/430/768/1024/1440px, with eight prices including long values and a long title, plus Search/Category/Brand checks. Home/listing/cards share the exact same deadline; decorative Zap is below foreground at4% opacity with pointer events disabled.

The user's two reference screenshots were not attached. Images and products here are synthetic. Baseline and final fixtures differ, so these captures show structural/behavioral changes rather than a production pixel-identity claim. Desktop/mobile physical device QA is still a human release check; automated Chromium does not establish every OS/browser/device behavior.

## Release constraints

Review [ROLLOUT.md](ROLLOUT.md) before any separate release approval. The additive database transition is intentionally gated on explicit legacy conversion/retirement. Old V4 image rollback cannot reproduce central campaign pricing after cutover. No database reset, destructive migration, cloud-provider provisioning or production data edit was performed.

## Price arrangement revision

Original prices belowRp1,000,000 appear alongside the discounted price; original prices at/aboveRp1,000,000 appear above it. The cart remains centered on the discounted-price row in both modes. Four unit cases cover the exact threshold/no-discount case, and the eight-width browser geometry checks also assert original-price position and clipping. The latest PR checks and Actions screenshots cover this revision.

The price revision also checks simulated four-column grids at768/1024px and a600px content column on desktop. Rich-price grids use their actual available width with readable minimum tracks and a four-column cap, so original prices cannot overlap the cart in Home, PDP recommendations, wishlist or preview.
