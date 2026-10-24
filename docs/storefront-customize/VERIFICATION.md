# Verification ledger (in progress)

All runtime fixtures are synthetic and all database writes target the disposable loopback PostgreSQL17 container. No Production environment, customer data, migration or theme was used.

Baseline source: main `b452fd10d52e9d439a58b9d0466ba4991ac8dcf0`. Baseline local unit run: **447/447 PASS** on Node22.23.4. Current implementation adds strict schema, permission/action, published fallback, media and lifecycle tests.

## Results captured so far

| Check | Actual result |
| --- | --- |
| Node22 typecheck | PASS |
| Next lint | PASS; framework deprecation notice only on latest run |
| Production build | PASS on intermediate implementation; final revision rerun pending |
| Unit suite | 487 PASS on intermediate implementation; final additions rerun pending |
| Offline hardened container | 473 unit +25 containment +9 mitigation PASS on intermediate implementation; final revision rerun pending |
| Customize PostgreSQL lifecycle/media | 12/12 PASS |
| Existing PostgreSQL suites | Initial run185 PASS /8 FAIL; failures were migration-ledger count/latest-migration assumptions after additive migration |
| Targeted migration/preflight rerun | 22/22 PASS after updating count13 and preserving size-chart historical boundary |
| Real disposable Supabase Storage | Byte/authorization/upload/delete assertions PASS for product and branding namespace; report counter adjusted from2 to4 objects; final rerun pending |
| Chromium Customize |7 checkpoints PASS: RBAC, private draft/preview, publish+SSR color,11 viewport widths, two-tab conflict, append-only rollback, no editor runtime exceptions |
| Existing Chromium products | Reached flash-sale check; local seeded catalog introduced multiple active flash-sale fixtures. Rerun on clean disposable database pending; no assertion removed |

## Evidence conditions

`evidence/` contains synthetic before/after screenshots. Initial anonymous captures showed redirects for account/checkout and catalog cache differences caused by building before seeding. They are diagnostic only, not proof of parity. Authenticated, identical-data captures and final comparison results will replace them before completion.

Final screenshots focus390/1360. Additional overflow widths:320,360,375,390,430,768,1024,1280,1360,1440,1920. Preview widths390/768/1360.

## Reproduction

Use Node22 and an explicitly disposable loopback database named `gheverhan_sprint1_test`, with the existing CI fixture environment. Run `npm ci --ignore-scripts`, Prisma engine setup/generate/deploy, typecheck, lint, build and the exact existing isolated workflow. Customize integration is `node --disable-proto=throw --import tsx --test tests/integration/store-appearance.test.ts`. New browser checks run inside the existing product-browser runner before its unchanged commerce assertions.

`npm run test:ci` requires the repository's hardened offline container profile for its extra OS-boundary assertions; the managed host is not that profile. CA proxy trust was supplied through the existing BuildKit secret mount, without disabling TLS verification.

## Remaining gates

Final-source rebuild and complete reruns,10 navigation cycles, operations/auth/hydration browser suites, final CI/review status and physical-device/manual assistive-technology QA. This ledger deliberately does not claim100% completion or Production readiness.
