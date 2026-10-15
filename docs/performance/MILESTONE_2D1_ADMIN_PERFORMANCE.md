# Milestone 2D.1 — Products and Inventory performance confirmation

Measured 15 October 2026. Continues Draft PR #25; no new PR. **No application optimization was justified by the controlled measurements, so application code remains identical to `bcfc74b`.** This delivery improves measurement evidence rather than claiming an unmeasured speedup.

## Revisions and method

- **A:** `f452ab5`, main before Milestone 2D, original production build.
- **B:** `bcfc74b`, PR #25 before this work, preserved production build.
- **C:** independently rebuilt candidate, same application source as B; only test instrumentation/documentation changed. C is an unchanged-code control, **not a distinct optimized implementation**.
- Node22.22.0, Next15.5.26, Prisma5.22.0 and the same disposable PostgreSQL16.15 instance for all three. Identical 45 products/45 variants/45 orders, twenty rows per list page, synthetic image paths, authenticated Admin. No production connections or real user data.
- Six blocks, revision order ABC / BCA / CAB / CBA / ACB / BAC. Products then Inventory in even blocks, reversed in odd blocks. One server at a time; request concurrency1. No builds/regression suites run during sampling.
- Fresh Next production process per revision/route/block. One first-process request; five excluded HTML warmups; ten measured HTML requests; five excluded RSC warmups; ten measured RSC requests. **60 warm HTML +60 warm RSC samples per route per revision**, 720 measured requests plus360 warmups and36 first-process requests. All raw phases retained. This is local process warmup, not platform cold-start measurement.
- RSC GET uses `RSC: 1` and checks `text/x-component`; it requests the full route tree without browser router-state headers. It is not a literal browser navigation trace. Separate browser regression verifies real router behavior. HTML always precedes RSC within each block; compare revisions within a mode, not modes as a randomized experiment.
- TTFB is fetch response/header availability at the local client. Full response ends after consuming every streamed body chunk. Payload bytes are uncompressed body bytes, not wire transfer or JS bundle size. No image fetching/prefetch traffic.
- SQL event durations have integer-ms resolution; operation wall time wraps Prisma middleware (query preparation, waiting and decoding included). Overlapping operations must not be summed/subtracted from response time to invent pure React CPU time. Same instrumentation on all revisions; no SQL text, query parameters, credentials or tokens recorded.
- Percentiles use linear interpolation at `(n-1)*p`. Range is min–max; no outliers discarded. Samples within blocks are correlated; these are descriptive statistics, not proof of statistical equivalence. See block medians in the summary.

Raw evidence: [all phases](milestone-2d1/samples.json), [derived distributions and block medians](milestone-2d1/summary.json). The earlier exploratory A/B run and prior seven-sample numbers are not pooled into these results.

## HTML timings

Milliseconds; each cell is **p50 / p75 / p95**, n=60.

| Route | Revision | TTFB | Full streamed response | Full range | SQL count |
| --- | --- | ---: | ---: | ---: | ---: |
| /admin/products | A | 14.13 / 16.04 / 20.39 | 20.03 / 24.46 / 29.65 | 13.33–52.32 | 9 |
| /admin/products | B | 9.74 / 11.37 / 16.89 | 20.30 / 22.91 / 31.15 | 15.21–40.10 | 8 |
| /admin/products | C | 10.19 / 11.71 / 14.16 | 20.07 / 24.96 / 33.81 | 12.68–44.67 | 8 |
| /admin/inventory | A | 8.75 / 9.99 / 13.28 | 19.46 / 21.61 / 28.25 | 14.21–31.40 | 10 |
| /admin/inventory | B | 8.88 / 9.96 / 11.97 | 18.98 / 21.78 / 30.25 | 13.45–32.32 | 9 |
| /admin/inventory | C | 8.81 / 10.23 / 12.36 | 19.57 / 22.29 / 28.86 | 13.70–32.65 | 9 |

TTFB ranges are in the raw/summary files. Products A→C median TTFB falls14.13→10.19ms while full response is essentially unchanged20.03→20.07ms. Inventory full response19.46→19.57ms and TTFB8.75→8.81ms are close. Products C p95 is33.81ms versus A29.65ms; this tail increase is reported, not hidden. Block-to-block direction changes and unchanged B/C variation do not establish a consistent causal regression. No statistical significance or universal speedup is claimed.

## RSC timings and payload

Milliseconds, p50 / p75 / p95, n=60. RSC is measured separately from HTML.

| Route | Revision | TTFB | Full response | Full range | HTML / RSC bytes |
| --- | --- | ---: | ---: | ---: | ---: |
| /admin/products | A | 3.66 / 3.95 / 4.62 | 12.38 / 14.73 / 18.99 | 7.48–22.88 | 85013 / 36832 |
| /admin/products | B | 3.65 / 3.94 / 4.45 | 12.12 / 13.87 / 16.00 | 7.76–20.49 | 89218 / 38586 |
| /admin/products | C | 3.41 / 3.70 / 4.03 | 11.37 / 13.14 / 15.33 | 7.82–16.29 | 89218 / 38586 |
| /admin/inventory | A | 3.45 / 3.70 / 4.38 | 11.43 / 13.04 / 15.16 | 7.85–22.93 | 78401 / 34770 |
| /admin/inventory | B | 3.16 / 3.64 / 4.02 | 11.19 / 13.09 / 15.32 | 7.56–16.17 | 80483 / 35855 |
| /admin/inventory | C | 3.69 / 3.89 / 4.42 | 12.18 / 14.45 / 18.22 | 7.91–20.26 | 80483 / 35855 |

Inventory C RSC median12.18ms/p9518.22ms is higher than B11.19ms/15.32ms despite identical application code and byte counts. This illustrates remaining run/build/process noise; it does not prove a new code regression. Products C RSC tail is lower than A/B. All HTML and RSC requests retain query count reductions.

B→C payload is identical. A→B increases (Products HTML4205bytes/RSC1754bytes; Inventory HTML2082bytes/RSC1085bytes) are the existing skeleton/navigation/accessible-control changes, not additional 2D.1 growth. Production build First Load JS stays Products112kB, Inventory107kB; shared103kB.

## Database observations

SQL duration summed per HTML request, p50 / p75 / p95 milliseconds; integer event resolution, **not** DB wall time:

| Route | A | B | C |
| --- | ---: | ---: | ---: |
| /admin/products | 1.00 / 2.25 / 5.00 | 1.00 / 2.00 / 5.05 | 0.00 / 2.00 / 6.05 |
| /admin/inventory | 0.00 / 1.00 / 3.00 | 0.50 / 2.00 / 5.05 | 0.00 / 2.00 / 6.00 |

Prisma operation wall-time medians (ms; individual independent operations can overlap):

| Route / operation | A | B | C |
| --- | ---: | ---: | ---: |
| /admin/products / User.findUnique | 2.91 | 2.84 | 2.84 |
| /admin/products / Product.count | 1.34 | 2.60 | 2.41 |
| /admin/products / Product.findMany | 2.32 | 3.14 | 3.07 |
| /admin/inventory / User.findUnique | 2.61 | 2.54 | 2.53 |
| /admin/inventory / ProductVariant.count | 1.57 | 2.03 | 1.92 |
| /admin/inventory / ProductVariant.findMany | 1.90 | 2.68 | 2.67 |

## Targeted investigation and decision

- **Products:** server projection already selects displayed fields, one image and variant count; permission checks and stable ordering remain. Twenty list items do not expose a proven formatting/mapping bottleneck in these measurements. `formatIDR` creates an Intl formatter per call, but isolated CPU cost and material request impact have not been established; no speculative global/shared helper change was made.
- **Inventory:** count/findMany dispatch concurrently. Each operation can take slightly longer while overlapping; end-to-end response does not show the previous large increase. Sequential execution was not substituted because no end-to-end harm from concurrency was demonstrated. Existing last-page clamp/corrective read stays; no shared inventory cache, transaction or expected-stock validation change.
- **Suspense:** Products streams after the permission guard; Inventory already did so on A. Lower Products HTML TTFB with similar completion is consistent with earlier shell availability. It is not proof that the entire gain is caused by Suspense; revisions contain multiple changes. Keep skeletons and guarded404 behavior.
- **RSC/navigation/filter components:** B/C bytes are identical; no new client boundary or bundle cost. Client transition wrapper overhead was not independently isolated, so it is not named as a proven root cause. Existing loading feedback, URL state, sorting, images and in-app navigation remain.
- **Render/serialization:** full streamed response and chunks are measured. Pure React render CPU, serialization CPU and first paint are not separately instrumented. Prisma middleware does not provide those numbers. No wall-time subtraction or invented render benchmark.
- **Root cause:** the seven-sample full-response increase is **not confirmed as a reproducible code regression**. Increased sample size, explicit warmup and counterbalancing change the result. Noise/warmup/order sensitivity is a plausible explanation, not a proven single cause.

## Reproduction

Use the dedicated disposable local test DB, never the regression fixture database. Apply existing migrations only to that disposable DB. Build A and B separately with Node22 and identical dependencies; preserve their builds. Build C independently. Keep regression suites stopped during measurement.

Create a scratch JSON manifest with three entries `{ "label": "A", "root": "/absolute/checkout/frontend", "revision": "f452ab5" }` (likewise B/C; their application sources are identical here). Set the three test database variables securely and point them at the same loopback database named `gheverhan_sprint1_test`.

```sh
cd frontend
PERF_REVISIONS=/tmp/revisions.json PERF_OUTPUT_DIR=/tmp/admin-comparison \
  node --import tsx tests/performance/admin-comparison.ts
python tests/performance/summarize-admin.py /tmp/admin-comparison/results.json > /tmp/summary.json
```

The harness rejects non-loopback/test database targets and contaminated dataset counts. Test-only Prisma preload is never imported by the deployed app. It logs operation durations only when explicitly enabled by this harness.

## Validation and review status

All required local gates completed:

| Gate | Result |
| --- | --- |
| Unit/component | 123 PASS, no skips |
| Security containment | 20 PASS, no skips |
| Real isolated PostgreSQL transaction / refund-shipping / product suites | 22 +27 +18 =67 PASS, no skips |
| Product browser/API | 14 PASS |
| Operations browser/API | 18 PASS, including all16 legacy HTTP404 denials |
| Navigation browser | 8 PASS, mobile390px and desktop1360px |
| TypeScript / ESLint / Prisma generate | PASS; no lint warnings/errors |
| Production build | PASS; application source identical to the measured C build |

Transaction suites retain checkout idempotency, reservation, expected-stock conflict, independent refund settlement verification, physical return and shipment/order atomicity assertions. Browser storage remains a loopback contract double, not external storage verification.

One pre-existing browser fixture failure was reproduced during this run: Playwright rejects `datetime-local` fill `2026-10-15T10:14:00` because Chromium normalizes it to `2026-10-15T10:14`. Filling the canonical minute form and a nonzero-second value both pass. The test-only settlement/return fixtures now remove only a trailing zero-second component; nonzero seconds and business verification remain. The full operations suite was rerun and all18 checks passed. No application lifecycle fix was needed. An initial new-harness TypeScript stream-iterator mismatch was corrected to use the standard reader before the successful production build and benchmark.

**GO for maintainer final review**, based on reproducible local measurements and complete regression gates. This is not automatic merge approval or live serverless performance certification. Updated-head GitHub Actions and automatic Vercel/Netlify preview statuses are recorded in PR #25 after push; older-head checks are not substituted.

External live performance remains pending: this Cloud environment has no application-host HTTPS grants or database bindings. Tail latency and representative larger datasets merit observation on the authorized preview; do not claim pure render CPU, real carrier/bank integration or live Lighthouse results. No merge, manual deployment, schema/dependency changes or production database access.

## Files changed in 2D.1

- `frontend/tests/performance/admin-comparison.ts`: controlled HTML/RSC comparison and separate warmups.
- `frontend/tests/performance/prisma-profile.cjs`: opt-in operation timing, isolated-test guard retained.
- `frontend/tests/performance/summarize-admin.py`: reproducible percentiles/ranges/block summaries.
- `frontend/tests/integration/operations-browser.ts`: reproduced zero-second fixture normalization only.
- This report, the existing2D report follow-up link, and `milestone-2d1/samples.json` / `summary.json`.

No changes to `frontend/src`, dependencies, schema/migrations, hosting settings or transaction logic.
