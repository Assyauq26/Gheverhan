# Milestone 2D — Performance and responsive navigation

Measured 15 October 2026 (WIB). Base: `f452ab5` (merged PR #24). Measured implementation: `7e7b5d9`. No hosting configuration, dependency, schema, migration or transaction lifecycle changes.

> Follow-up: [Milestone 2D.1 controlled Products/Inventory comparison](MILESTONE_2D1_ADMIN_PERFORMANCE.md) supersedes the seven-sample latency interpretation below with 60 warm samples per mode/route/revision and balanced A/B/C ordering. Application behavior is retained.

## Implemented

- Backoffice layout and page guards share `getCurrentUser(false)` through React request memoization. Active-user and DB-backed RBAC validation remain; customer cart reads are omitted for admin renders. Existing full-session callers retain cart context. No persistent/shared identity cache.
- Dashboard and product/order/inventory list reads select displayed columns. Order and inventory count/list queries start concurrently. An out-of-range inventory/order page still clamps to the last page, with a corrective query only when necessary. Product ordering gains an ID tie-breaker.
- Home/Shop/Product Detail reuse the shared storefront session context; independent catalog reads no longer wait for identity when only wishlist loading depends on it. Product metadata/page deduplication and existing public catalog invalidation remain.
- Dashboard and Products gain Suspense skeletons **after** authorization. Existing Inventory/Orders guarded boundaries remain. No blanket admin `loading.tsx` that could commit HTTP200 before permission denial; the browser regression verifies all sixteen previous denial cases still return404.
- Shared Next Link wrapper and transition provider give immediate, accessible navigation feedback while retaining prefetch/native modified-click handling. Admin menu prefetch is explicitly disabled, and its active item is scrolled into the mobile menu viewport without moving the document.
- Product/inventory/order and movement filters use enhanced GET navigation, with a native GET fallback, disabled pending controls, and URL-backed history/pagination. Storefront search synchronizes with back/forward navigation. Sensitive operational forms keep their existing confirmation, conflict, idempotency and document-refresh behavior.
- Product editor adds a synchronous mutation guard. Shared retry errors, reduced-motion skeletons, shorter card animation, readable full-width mobile search, larger touch targets and safe-area bottom navigation preserve the monochrome visual system.
- Browser fixture roles now remove unintended **local test** permissions from previous suites. This fixes a repeat-run fixture failure where an edit-only Manager inherited product.create from another suite; application RBAC policy is unchanged.

## Reproducible measurements

Raw samples: [before](milestone-2d/before.json), [after](milestone-2d/after.json). Use a dedicated empty local database named `gheverhan_sprint1_test`, separate from regression suites (those preserve historical fixtures). The harness refuses other database destinations and rejects any dataset other than its 45 products/45 variants/45 orders. No real customer data or Supabase connections were used.

Environment: Node22.22.0, Next15.5.26, Prisma5.22.0, local production builds, disposable PostgreSQL16.15 on loopback. Fresh Next process per route; one first-process request plus **7 warm samples per route, per revision** (56 HTTP requests per revision). Anonymous storefront; authenticated Admin. Sequential full-document HTTP GET with the entire streamed body consumed, no browser prefetch. Public Next fetch cache emptied once before each revision run; subsequent public cache hits are intentional. OS/DB caches are not forcibly emptied. This is a small single-worker development measurement, without mobile CPU/network throttling.

Repeat on the same fresh profiling database, building each revision separately. Copy `tests/performance/` into the detached baseline checkout to run the identical harness. Supply test URLs securely through environment variables; do not commit them:

```sh
cd frontend
npm ci
npm run prisma:generate
# DATABASE_URL and DIRECT_URL must point to the dedicated disposable local DB.
npm run prisma:deploy
npm run build
# SPRINT1_TEST_DATABASE_URL points to that same database.
PERF_OUTPUT_DIR=/tmp/gheverhan-2d-profile node --import tsx tests/performance/navigation-profile.ts
```

The test-only Prisma preload records query count and SQL duration only, without SQL text, parameters, tokens or user data. It is never loaded by the application/deployment.

### Warm HTTP wall times and database round-trips

Milliseconds, medians; arrows mean before → after. These are HTTP response measurements, **not Lighthouse scores**.

| Route | TTFB ms | Full streamed response ms | SQL statements/request |
| --- | ---: | ---: | ---: |
| Home | 15.8 → 15.7 | 22.3 → 20.7 | 0 → 0 |
| Shop | 14.6 → 17.7 | 20.3 → 22.1 | 0 → 0 |
| Product Detail | 8.3 → 10.1 | 23.9 → 27.5 | 9 → 9 |
| Admin Dashboard | 19.4 → 11.8 | 22.1 → 18.2 | 12 → 11 |
| Admin Products | 16.2 → 11.5 | 21.7 → 28.8 | 9 → 8 |
| Admin Inventory | 9.2 → 10.2 | 24.5 → 29.5 | 10 → 9 |
| Admin Orders | 11.1 → 11.6 | 27.2 → 23.8 | 9 → 8 |

The deterministic result is one fewer SQL statement per measured admin route, narrower projections, and removal of serial count→list dispatch. Latency is mixed: dashboard TTFB/response improve in this sample, while Products/Inventory full-response medians increase. Seven local samples do not establish statistical significance or a platform-wide speedup. Streaming can improve first paint while full response completion stays unchanged or increases. Do not claim every route is faster.

### Query time

Sum of emitted SQL execution durations per request, warm median, integer milliseconds:

| Route | SQL duration ms |
| --- | ---: |
| Home | 0 → 0 |
| Shop | 0 → 0 |
| Product Detail | 2 → 0 |
| Admin Dashboard | 7 → 8 |
| Admin Products | 2 → 2 |
| Admin Inventory | 0 → 1 |
| Admin Orders | 2 → 2 |

A value of0 reflects duration resolution on loopback, not absence of SQL (see statement counts). This sum excludes connection setup, JS query preparation/deserialization and some queuing; independent query durations can overlap. It must **not** be subtracted from HTTP wall time to invent a pure render duration. Isolated React render CPU time was not captured. Full streamed response time above is the measured server-response envelope including rendering and DB work; pure render timing remains unverified.

### First process requests

One sample per route, full response milliseconds; includes module/Prisma connection initialization after server readiness. **Not Vercel/Netlify serverless cold starts**. Do not infer a cold-start improvement from n=1.

| Route | First process request ms |
| --- | ---: |
| Home | 273.7 → 294.8 |
| Shop | 338.5 → 241.3 |
| Product Detail | 228.3 → 300.5 |
| Admin Dashboard | 235.0 → 259.2 |
| Admin Products | 242.4 → 256.8 |
| Admin Inventory | 234.6 → 248.8 |
| Admin Orders | 261.4 → 305.3 |

### Browser and bundle evidence

Chromium production-server tests at390px and1360px add a controlled600ms delay to non-prefetch RSC responses. Pending feedback appeared at61.3ms and51.8ms respectively (n=1 per viewport, includes Playwright click dispatch; not INP or live latency). Both keep the document instance during admin link/filter navigation, retain pagination/search on browser back, clamp out-of-range inventory pages and have no page exceptions/horizontal document overflow. Search controls measure at least44×44px; mobile inventory input is at least180px wide. Existing operational tests also cover768px.

Next build First Load JS (rounded): Home121→122kB, Shop120→121kB, Product Detail125→125kB, Dashboard106→107kB, Products111→112kB, Inventory106→107kB, Orders106→107kB. Shared First Load JS remains103kB. This small increase funds client transition feedback; there is no claim of bundle-size reduction. Maintainer's Home Lighthouse Mobile97 is prior evidence, **not rerun or certified here**. Images in the focused navigation test are blocked/synthetic; actual image/storage performance was not measured.

## Regression results

- npm ci: PASS; dependency/lockfile unchanged.
- Prisma generate, typecheck, ESLint, production build: PASS.
- Unit/component: **123 PASS**, including13 new pagination/session/navigation/product-save cases; no skips.
- Security containment: **20 PASS**, no skips.
- Real isolated PostgreSQL regression: **22 transaction +27 refund/shipping +18 product =67 PASS**, no skips. Covers stock1 parallel checkout, repeated checkout, parallel approval/cancellation, approval versus cancellation, generic PAID rejection, price conflicts, rollback, parallel refund, independent settlement authorization, physical return, and shipment/order atomicity/idempotency.
- Product browser/API/data flow: **14 PASS**. Operational browser/API/data flow: **18 PASS**. New navigation suite: **8 PASS**. Storage is the existing loopback contract double, not a real external storage service.

Run suites sequentially against their own disposable regression database:

```sh
npm test
npm run test:containment
npm run test:integration:transactions
npm run test:integration:refund-shipping
npm run test:integration:products
npm run test:e2e:products
npm run test:e2e:operations
node --import tsx tests/integration/navigation-browser.ts
npm run typecheck
npm run lint
npm run prisma:generate
npm run build
```

`SPRINT1_TEST_DATABASE_URL`, `DATABASE_URL` and `DIRECT_URL` must be loopback test URLs; browser suites require a prior production build. Optional `SPRINT1_ARTIFACT_DIR` collects local browser evidence.

## Remaining targeted verification

- Vercel project listing identifies Gheverhan, but project-detail API returns403 for the configured scope; no authenticated Vercel CLI is installed. Actual deployed Node version and effective runtime environment/pooler configuration are **unverified**. Repository engines require`>=22 <23`; local tests use22.22.0. Maintainer should confirm Vercel Node22.x. Any hosting-setting change requires approval.
- Cloud effective HTTPS policy does not allow the application hosts and has no database bindings. Live Vercel/Netlify cold/warm timing, authenticated mobile Lighthouse/CWV, regional latency and pure server-render CPU remain **external verification pending**. No live URLs or benchmark numbers were invented.
- Existing PrismaClient is constructed at module scope and reused; no per-request connect/disconnect was added. With Prisma5.22 on serverless, review the actual Supavisor transaction-mode URL and `pgbouncer=true` setting, start with a small measured connection limit, and keep a direct/session migration path separate. This is a recommendation only; no secret or platform setting was changed. Official sources: [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Prisma troubleshooting](https://supabase.com/docs/guides/database/prisma/prisma-troubleshooting).
- Nested RBAC relations still require multiple SQL statements under the current Prisma version. Global/auth caches, preview relation-join flags, dependency upgrades or schema/index changes were intentionally avoided. Larger-scale count/search cost needs representative load measurements before further changes.
- Operational mutation success still uses the validated document refresh, preserving committed state at the cost of a full reload. Replacing it requires separate stale-state/idempotency proof.

Ready for Draft PR review based on local regression evidence. Live performance acceptance remains pending; no merge, manual deployment or platform reconfiguration performed.

## Changed files

- `frontend/src/app/(storefront)/error.tsx`
- `frontend/src/app/(storefront)/layout.tsx`
- `frontend/src/app/(storefront)/loading.tsx`
- `frontend/src/app/(storefront)/page.tsx`
- `frontend/src/app/(storefront)/product/[slug]/page.tsx`
- `frontend/src/app/(storefront)/shop/page.tsx`
- `frontend/src/app/admin/error.tsx`
- `frontend/src/app/admin/inventory/[id]/page.tsx`
- `frontend/src/app/admin/inventory/page.tsx`
- `frontend/src/app/admin/layout.tsx`
- `frontend/src/app/admin/orders/[id]/page.tsx`
- `frontend/src/app/admin/orders/page.tsx`
- `frontend/src/app/admin/page.tsx`
- `frontend/src/app/admin/products/page.tsx`
- `frontend/src/app/globals.css`
- `frontend/src/app/layout.tsx`
- `frontend/src/components/admin/admin-nav.tsx`
- `frontend/src/components/admin/operations-layout.tsx`
- `frontend/src/components/admin/product-editor.tsx`
- `frontend/src/components/storefront/bottom-nav.tsx`
- `frontend/src/components/storefront/category-nav.tsx`
- `frontend/src/components/storefront/header.tsx`
- `frontend/src/components/storefront/product-card.tsx`
- `frontend/src/components/storefront/product-listing.tsx`
- `frontend/src/components/storefront/search-bar.tsx`
- `frontend/src/components/storefront/section-header.tsx`
- `frontend/src/components/ui/filter-form.tsx`
- `frontend/src/components/ui/navigation.tsx`
- `frontend/src/components/ui/route-error.tsx`
- `frontend/src/lib/auth/session.ts`
- `frontend/src/lib/pagination.ts`
- `frontend/src/modules/admin/backoffice-access.ts`
- `frontend/src/modules/admin/dashboard.service.ts`
- `frontend/src/modules/catalog/product-management.service.ts`
- `frontend/tests/integration/navigation-browser.ts`
- `frontend/tests/integration/operations-browser.ts`
- `frontend/tests/integration/product-browser.ts`
- `frontend/tests/performance/navigation-profile.ts`
- `frontend/tests/performance/prisma-profile.cjs`
- `frontend/tests/unit/admin-session.test.ts`
- `frontend/tests/unit/navigation.test.ts`
- `frontend/tests/unit/pagination.test.ts`

This report and its two raw JSON sample files complete the delivery evidence.
