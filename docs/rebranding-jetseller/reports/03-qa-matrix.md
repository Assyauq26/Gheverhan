# 03 — Final QA matrix

Verdict: prior source validation PASS; gradient follow-up awaits current-HEAD CI. NOT MERGED, NOT DEPLOYED.
Latest fully CI-verified source: 1a3fa9c6c85f33585b68f97202d0a5d94c206372. This follow-up changes StoreLogo gradient selection and adds two regression cases; historical source/tree equivalence does not apply to it. Before merge, verify every current-HEAD check against the exact proposed SHA.

## P2 follow-up verification

- First-boot draft persistence: `locked()` creates `makeDefault()` for draft and retains `legacyDefault()` for published; existing rows remain untouched. PostgreSQL regression covers publish without save, revisions 0/1, rollback to legacy at v2, and preserved draft.
- Contextual logo foreground: custom solid shells inherit text. Follow-up also excludes active header/footer gradients from the two-color wordmark, even when underlying solid tokens remain white. Two added tests use contrast-valid default dark gradients and ensure the logo does not override inherited foreground.
- Local follow-up checks: six branding/wordmark tests PASS; TypeScript check PASS. Full Linux/current-HEAD CI remains the release gate.
- On 1a3fa9c, all three workflows passed: [unit/containment](https://github.com/Assyauq26/Gheverhan/actions/runs/41312219727), [isolated PostgreSQL/browser](https://github.com/Assyauq26/Gheverhan/actions/runs/41312219724), [Helipod image build](https://github.com/Assyauq26/Gheverhan/actions/runs/41312219740). VPS SSH transfer and production health steps were skipped.
- Final source review and resolution of both P2 threads must follow successful current-HEAD CI. Production backup recoverability and current image/appearance versions remain unverified release gates, not inferred from historical snapshots.

## Historical source validation (21a95f4)

| Gate | Result | Run |
|---|---|---|
| Unit + containment/security policy | PASS — 77 files, 577 unit tests; hardened runner and offline container intact | [41308532224](https://github.com/Assyauq26/Gheverhan/actions/runs/41308532224) |
| Helipod PR image builds | PASS — build only; no deployment on PR | [41308532215](https://github.com/Assyauq26/Gheverhan/actions/runs/41308532215) |
| Disposable PostgreSQL + integration + Chromium | PASS — full workflow, 29m8s | [41308532159](https://github.com/Assyauq26/Gheverhan/actions/runs/41308532159) |

[CI screenshots/diagnostics artifact](https://github.com/Assyauq26/Gheverhan/actions/runs/41308532159/artifacts/13084792799) (38.7 MB, retention follows workflow policy). Machine-readable summary: evidence/ci-source-summary.json.

The isolated workflow passed lint, typecheck and production build; private storage contracts; auth/session/reset/rate limits; migrations/recovery; cart concurrency; product/variation lifecycle; checkout/pricing/inventory/refund/shipping; J&T boundaries without carrier calls; appearance schema/lifecycle/media/concurrency; hero and verified-review boundaries; product/editor/RBAC browser flows; payment-proof operations; registration OTP/conflicts; auth/legal; hydration replay; and 10 navigation/mobile regression iterations across four viewport configurations. No production DB, real customer email, payment or AWB was used.

## Branding and appearance acceptance

- New JetSeller preset/schema has all 53 tokens and passes AA contrast checks. Exact pre-rebrand legacy serialization is pinned by regression hash.
- Browser tests pass for all ten presets, draft-vs-published separation, private logo ownership/modes, publish/cache refresh, two-tab version conflict and append-only rollback.
- Local 30-case browser matrix covers 360/390/428/768/1024/1440: real local auth/legal plus explicitly labelled synthetic storefront/admin previews. No overflow/page errors. Evidence: evidence/browser.json and linked screenshots in report 02.
- CI artifacts add real app/browser tests on disposable PostgreSQL. Synthetic preview screenshots are not represented as production or transaction proof.
- Disabled purchase CTAs retain opaque dark state across light/red/dark palettes. Exact per-channel mix tolerance, no-gradient and disabled-state assertions remain.
- Custom non-white headers/footers use inherited logo foreground so red-on-red wordmarks are avoided. Existing custom identities/assets remain authoritative.

## Findings resolved without weakening checks

1. New muted text against the old disabled surface failed contrast: disabled surface adjusted; full contrast contract now passes.
2. Primary+white disabled purchase mix became pastel under the red preset: changed only purchase CTA styling to primary × .65 + dark ink × .35. Numerical expectations updated with unchanged tolerance; strict dark/opaque/no-gradient checks pass.
3. OTP email sink parsers and an admin text expectation still targeted old branding: aligned expected copy without changing OTP semantics.
4. Auth/legal test selected a hidden bottom-nav item via a.bg-black after primary CTAs changed class: replaced with exact main cart-login destination; hover/white foreground/focus still asserted.
5. One prior run had a read-only appearance GET socket reset. That GET permits one ECONNRESET retry only; HTTP response assertions and all mutation requests are unchanged. Full final run passed.

## Local evidence and limits

Node 22.23.4, locked dependencies, no package/lockfile version changes. Local lint/typecheck/build passed; build without a configured DB printed fallback diagnostics, so local build was never claimed as DB-flow proof. Local containment 20 and braces 9 tests passed. Three Windows filesystem failures (chmod semantics and symlink privileges) were retained; Linux CI passed all 577 unit tests. Existing hero-editor image/easing/width-transition advisories were not refactored outside scope.

Physical devices: NOT VERIFIED (emulation only). Production source/appearance: NOT CHANGED. Current production appearance summary is read-only evidence, not a publish. Legal operator/rights references remain for owner review. Rename/private readiness remains NOT READY pending phase-C gates.

Residual source inventory: residual-branding.tsv classifies legal-owner references, frozen legacy snapshots, compatibility identifiers and historical comments. Product records/historical media are not mass-rewritten.
