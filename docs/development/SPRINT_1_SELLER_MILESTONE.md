# Sprint 1 — Seller Dashboard & Product Management, milestone 1

Baseline: `0b071d9`, PR #19. Branch: `feat/sprint-1-seller-dashboard`.
This extends the existing single-store `/admin` backoffice, Prisma models, RBAC,
UI components, inventory service, audit log, and configured storage adapter.

## Implemented

- Permission-filtered dashboard: actual product/status counts, available/reserved stock,
  order/status counts, paid-order totals, recent orders, and empty states.
- Product search/filter/pagination; create draft, edit, publish, return to draft, archive.
- Category create/edit with parent-cycle prevention; existing brand selection.
- Variant/SKU, integer Rupiah prices/discounts, stock, product details, featured/flash-sale flags.
- JPG/PNG/WebP uploads through existing storage, 5 MiB/file, 10 images/product;
  alt text, main-photo ordering, removal, and permission-controlled unpublished media.
- Serializable product transactions, optimistic revision/stock checks, inventory movements,
  audit records, and protection for reserved stock and historical variants/order images.
- Catalog tag/path invalidation; hidden products excluded from public detail, new cart adds,
  and wishlist views. Archived wishlist rows and order snapshots remain intact.
- Checkout rejects unavailable carts and holds published product rows through order creation,
  preventing a simultaneous archive/draft transition from admitting a hidden-product order.

## Validation

Node 22.22.0; strict typecheck (including unused locals/parameters), lint (no warnings),
Prisma generate and production build PASS. Unit tests: **84 PASS**; containment: **20 PASS**;
real PostgreSQL integration checks: **17 PASS**; production-server browser checks: **13 PASS**.
No skips. Desktop 1360px/mobile 390px verified without horizontal page overflow or JS exceptions.
Mobile validation retains input and focuses visible feedback; edit-only category confirmation
persists and returns keyboard focus. Create → edit → upload → publish → storefront → cart →
archive, cache invalidation, archived-cart rejection, and historical-media access are covered.

Reproduce from `frontend/`: `npm run test:ci`, `npm run typecheck`, `npm run lint`,
`npm run build`. Database/browser tests additionally require an explicitly disposable local
PostgreSQL database, with the current Prisma schema applied, and
`SPRINT1_TEST_DATABASE_URL` pointing to database **gheverhan_sprint1_test** on loopback.
Run `npm run test:integration:products`, then `npm run test:e2e:products` after a build.
The browser harness needs Chromium (optional `SPRINT1_CHROMIUM_PATH`), uses ports 3101/3102,
and starts its own local production server. These tests refuse non-local/non-test databases,
create namespaced fixtures without seeds, and do not fall back to production environment URLs.
Playwright runs separately from the unchanged contained Vitest runner; its error formatter
uses prototype assignment incompatible with `--disable-proto=throw`.

## Limits and remaining verification

- Storage browser testing uses a local HTTP contract double through the actual existing
  `putObject`/`getObject` adapter. Live configured storage credentials/connectivity need
  verification in an approved nonproduction environment; no new storage was provisioned.
- Existing storage exposes no delete operation. A successful upload followed by failed DB
  attachment, or a removed image, can leave an unused immutable object; no speculative delete API.
- No Prisma schema, migrations, seeds, dependencies or lockfile changed. No production database,
  Supabase production, destructive migration, production deployment or merge was performed.
- This milestone is ready for code review. Existing Sprint 0 security residuals remain governed
  by the remediation plan; this delivery does not grant production deployment clearance.
