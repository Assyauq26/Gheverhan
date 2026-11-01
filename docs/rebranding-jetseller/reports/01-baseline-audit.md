# 01 — Baseline audit

Status: DONE source audit; NOT VERIFIED production database/admin session.
Baseline main: a54a6d8 (docs plan #129); implementation branch feat/jetseller-demo-brand-ui. Clean starting tree. No AGENTS.md found.

## Inventory and boundaries

| Class | Sources | Decision |
|---|---|---|
| A user facing | root/auth/legal/admin layouts, storefront metadata/footer/PDP/category/shop, auth forms, OTP/reset email copy, icon.svg, appearance preview/editor | Rebrand copy and shared wordmark; preserve routes and behavior |
| B appearance data | schema makeDefault/legacyDefault, presets, service, published, runtime, StoreLogo | New red/white default; preserve exact legacy baseline and persisted custom themes; explicit admin publish required |
| C compatibility | JWT issuer/audience, GHEVERHAN envs, events/cache/storage keys, health app identifier, Prisma SQL functions, package name, domain, deploy paths/images/keys | Freeze |
| D history | migrations, prior audit/release docs, license provenance, comments, pins/checksums | Preserve |
| E tests | appearance unit/control/action/cache tests, integration lifecycle/browser suites | Update visual expectations only; add compatibility and red-preset validation |

Search audited frontend/src, public, scripts, landing, deploy and .github. Full residual inventory will accompany final QA. Legal operatorName and rights/contract operator text remain for legal review; public page headings may use JetSeller.

## Architecture

Next 15.5.28, React 18.3.1, Prisma 5.22.0, Appearance schema v1 with 53 tokens. One demo app, no multi-tenant changes. StoreAppearance draft → validated version-guarded transaction → revision/audit → published → tagged cache → runtime CSS/StoreLogo. Asset IDs require ownership/readiness/session checks. Legacy equality controls no-variable CSS path; freeze its serialized identity/colors/geometry. New source defaults cannot overwrite existing published JSON. Reset affects draft only; publish requires the existing permission, actor/session, contrast validation and version checks. Rollback uses revision history and cache revalidation. No production writes authorized.

## Live read-only evidence

Public baseline Chromium captures: tooling/rebrand-baseline (copied into report evidence before PR). Desktop/mobile home/login/register/cart HTTP 200. Checkout and admin redirect to customer login without a session; no authenticated baseline claimed. Home title currently combines `Jetseller — Better Outfits, Brighter Days. | Gheverhan`; login title still Gheverhan. This proves source/default-only edits are insufficient for existing published appearance.

GitHub variable HELI_POD_AUTODEPLOY observed `disabled`; no changes made. Open PR #119 J&T and #120 platform foundation overlap sensitive areas and will not be incorporated. #123 is separate landing redesign; landing remains unchanged. VPS SSH previously verified, but no deployment is authorized in this task.

## Risks / gates

- Production appearance row/revisions/logo IDs: NOT VERIFIED directly; require authorized admin review/export in phase B.
- Existing published identity/theme must remain authoritative until explicit publish.
- Legal entity and historical receipts must not be renamed as generic UI copy.
- Node host is 26; supported application toolchain requires Node 22. Provision isolated Node 22 locally without changing dependency versions.
- No local Docker/Postgres command detected. Determine isolated integration DB availability; never substitute production DB.
- No real mobile device access; screenshots/browser tests are emulation.
- Rename/private readiness is a report only; anonymous raw GitHub static-release downloads are an identified blocker.
