# 03 — QA matrix

Status: local checks DONE with explicit Windows/DB limitations; CI PENDING at initial PR creation.
Baseline a54a6d8; implementation SHA recorded in PR commits. Node 22.23.4, locked dependencies; no dependency/lockfile changes.

| Check | Result / evidence |
|---|---|
| security:prepare / security:verify | PASS; existing braces mitigation retained |
| lint | PASS with existing hero-editor img warning |
| typecheck | PASS |
| build | PASS initial and final local build (exit 0); build logs include expected missing DATABASE_URL fallback diagnostics because no DB was configured. This is build evidence, not database-flow evidence |
| npm test | 573 PASS, 3 FAIL / 576; failures are Windows chmod semantics (2 Prisma TLS cases) and symlink permission (storage-local); do not suppress these security tests. Linux CI required |
| test:containment | 20 PASS |
| braces-mitigation Node tests | 9 PASS |
| JetSeller/Appearance | Red default contrast and exact legacy hash tests PASS; initial disabled-color defect fixed |
| Browser | 30 cases PASS at 360/390/428/768/1024/1440; real local auth/legal and component fixtures, no overflow/page errors |
| Integration DB / actual commerce | NOT RUN locally: no local Postgres/Docker available. Existing isolated PostgreSQL/browser CI runs on this PR and is authoritative for transaction/auth/appearance lifecycle tests |
| Physical devices | NOT VERIFIED (browser emulation only) |
| Production publish/deploy | NOT DONE / not authorized |

Existing Linux CI includes disposable PostgreSQL, migrations, auth/session/OTP, cart, checkout/transactions/refunds/stock, J&T offline boundaries, Customize lifecycle/media/concurrency and browser regression. Do not mistake mock UI fixtures for these tests. CI results must be reviewed at the final source SHA.

Residual inventory: residual-branding.tsv classifies every remaining source/script/public match. C compatibility and D history remain intentionally. B legacy snapshot and current published DB require explicit appearance publish. Legal operator/rights references require separate owner review. Historical product media were not rewritten.

Known advisories: detector found existing globals.css width transition; lint existing hero-editor image usage; existing ambiguous Tailwind easing warning. No safety check weakened.

CI started on implementation commit 49b33ad: isolated integration/browser run 41295139828; containment run 41295139874; Helipod build-only PR run 41295139986. The existing PR workflow does not deploy on pull_request, and autodeploy variable remains disabled. Final CI outcomes will be recorded after completion.
