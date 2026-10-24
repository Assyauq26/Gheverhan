# Product editor implementation and verification

PR: https://github.com/Assyauq26/Gheverhan/pull/102

Application baseline: main b719e9db83e7c7065a38421f28727f80b880c355. Full local browser run on application commit d5a91c19f8a24f8c858cf83e149743f1bee05481; the evidence commit adds documentation, screenshots and a scoped caption/placeholder contrast adjustment. GitHub checks on the latest PR commit are the final release gate; this document does not authorize release.

## Implementation

- ProductEditor uses a dedicated mobile header with dashboard header/bottom navigation suppressed only on editor routes. Desktop keeps the sidebar and bounded content layout.
- Sticky actions follow domain readiness and status: incomplete draft → Simpan sebagai Draft; ready draft → Terbitkan and Simpan Draft; published/archived edit → Simpan Perubahan. Archived publication is explicit. Save errors preserve form input; a failed publication leaves the saved draft intact.
- Draft requirements remain name, slug, positive price and a valid SKU. Publish requires gallery media and shipping weight. Server permissions, relation ownership, SKU uniqueness and optimistic revision checks are authoritative. No automatic publication occurs on field completion.
- Gallery supports up to 10 images, deterministic sequential multi-upload, per-file progress/previews, partial failures, individual retry with the same request identity, duplicate-file protection, and existing staged-media TTL/cancellation. Index zero remains the sole cover source. Existing alt metadata is preserved; new labels are automatic.
- One scoped SortableHandle supports pointer/touch and keyboard sorting for photos, groups, values and chart columns. Identity-based moves preserve IDs, SKU mappings and combination keys. Keyboard focus survives DOM movement. Sorting does not clear upload feedback and shift the drop targets.
- Variation modal has explicit collapse state, summaries, visible chevrons, neutral controls, sort mode, image picker, internal scrolling, and a local-state Save. Closing dirty edits offers discard; product saving remains the persistence boundary.
- Single-price controls are hidden for custom variations. After every SKU has an explicit price, the fallback follows the cheapest effective SKU without rewriting SKU prices. Inherited legacy pricing and scheduled flash-sale guards remain intact. Sparse option matrices remain supported.
- Product.sizeChart is nullable JSON, validated on the server with bounded columns, rows, cell lengths and payload size. The image mode accepts an owned media ID, never an arbitrary URL. The table builder supports custom labels/text, columns, rows, reordering and cm/inch/no unit.
- Storefront renders only valid nonempty size charts. Chart media uses the existing private storage abstraction and product image authorization: published media is public; draft/archived media retains existing staff/cart/order policies. Charts are excluded from gallery cover ordering.
- The editor Atribut card and care input are removed. Existing backend attributes and care metadata remain intact. CSS generations were consolidated into scoped neutral styles with safe-area and reduced-motion behavior.
- backend/server.py is an ingress reverse proxy; business logic stays in Next.js services. No proxy rewrite was needed.

## Local results

Node 22.22.0, PostgreSQL 17.11 on disposable loopback port 55438, Chromium 154.0.8037.57. No production database, external storage or customer data used.

| Check | Result |
| --- | --- |
| ESLint | PASS; no warnings/errors |
| TypeScript | PASS |
| Next.js production build | PASS |
| Unit suite | 447 tests / 56 files PASS |
| Security mitigation and containment | PASS via npm run test:ci |
| Product/media/custom-variation integration | 26 tests PASS |
| Lifecycle/checkout/refund/shipping/inventory integration | 80 tests PASS |
| Size-chart and editor V2 migration/retry drills | 5 tests PASS |
| Custom-variation/direct-checkout migration drills | PASS |
| Registration migration/index recovery drills | PASS |
| Read-only release preflight | 15 tests PASS |
| Full production-server browser suite | 34 checkpoints PASS; see browser-results.json |

Browser coverage includes empty/create/edit draft/edit published, explicit publish, browser Back cancel/confirm, dirty link guards, canonical revert, multi-upload failure/retry, mouse drag, CDP touch gesture, keyboard photo ordering, cover state, removal/recovery, chart table/columns/unit/reload, chart image upload/replacement/removal, public versus draft image access, sparse SKU availability, exact SKU add-to-cart/Buy Now, server checkout repricing, historical order images, group/option ordering, group disclosure, discard, bulk price/stock, protected SKU IDs and 50-SKU focus stability.

Responsive captures and document-clientWidth overflow checks: 320, 360, 375, 390, 430, 768, 1024, 1280, 1360, 1440 and 1920 px. The size table alone scrolls horizontally. Additional variation tests exercise enlarged text, reduced motion, modal focus and a shortened viewport representing keyboard occlusion. Browser suites check runtime exceptions/hydration failures; successful output is recorded in browser-results.json.

Full-page screenshots capture sticky actions at the original viewport boundary, so the bar can appear partway down the exported long page. This represents the sticky viewport behavior, not a second footer.

## Reproduction

Use a disposable local database named gheverhan_sprint1_test, export SPRINT1_TEST_DATABASE_URL, DATABASE_URL and DIRECT_URL to that same local URL, and set GHEVERHAN_ISOLATED_TESTS=1. Apply migrations and build before browser tests. The harness also pins direct service checks to the guarded test URL.

From frontend:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run prisma:generate
npm run prisma:deploy
npm run lint
npm run typecheck
npm run test:ci
npm run build
node --disable-proto=throw --import tsx --test tests/integration/product-editor-v2.test.ts tests/integration/custom-variations.test.ts
npm run test:integration:products
npm run test:integration:transactions
npm run test:integration:refund-shipping
node --disable-proto=throw --import tsx --test tests/integration/product-size-chart-migration.test.ts tests/integration/product-editor-v2-migration.test.ts
npm run test:e2e:products
```

The existing CI workflow also installs the server-only direct-import marker, Chromium and real private Storage provider fixtures. Local browser storage fixtures implement the existing adapter contract; they are not a production storage test.

## Compatibility and release

SKU IDs, stock reservations, cart/order references, existing care/attribute metadata and historical images remain protected. No checkout, inventory or order snapshot schema changes. Reorder changes display order only.

The new migration is additive, transactional, uses a 3-second lock timeout and stores SQL NULL for old products. Recovery: keep the nullable column when rolling application code back; older code ignores it. Export chart data before any future reviewed removal. See AUDIT.md for rationale.

Remaining manual QA: physical Android/iOS drag and real IME behavior, screen-reader usability, production storage/network latency, and comparison against any new reference screenshots. CDP touch passed for gallery reordering; it is emulation, not a physical-device certification. No pixel-perfect claim. Production migration/deployment and merging require separate explicit release approval.
