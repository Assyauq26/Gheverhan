# JetSeller Self-Hosted — Release Candidate Integration 01

**Status: CODE INTEGRATION PENDING COMBINED CI; NOT READY FOR PILOT OR PRODUCTION.**

This integration branch is a reproducible consolidated review surface based on main `913d5454bada484f3b6b9319d5b1abfb130c3b23`. It includes the code at the following exact reviewed branch tips (not merges of the original PRs):

- Runtime packaging, readiness, encrypted disposable recovery, and one-use local admin: PR #143 → #144 → #145 → #150 (tip `a97280c85e29595b87138ac0ddec29b172863179`).
- Portal registry, OIDC dashboard and actual Go pairing E2E: PR #146 → #148 → #151 (tip `cbf95404edf1699288ca9d8e6e92957202792e73`).
- Verified installer and disposable TUF provisioning: PR #147 → #152 (diff from #147 tip `eb68dc12507efa5e0f8b4c838a0c6f152d19029b`).
- Domain ownership DNS TXT and UI: PR #153 (diff from #148 tip `631f02fe058949458ee507a33af68b8b0a75ab87`).

## Conflict resolution

- `agent/cmd/jetseller-setup/main.go`, `agent/go.mod`, `agent/README.md` use the signed-provisioning additions from PR #152; they retain the CLI `pair`, `resume-pairing`, `preflight`, and `verify-artifact` foundation from PR #147 (also present in PR #151).
- Portal web/control code preserves PR #151 browser's actual Go CLI/pairing fixture and PR #153 DNS ownership flows simultaneously. The combined browser fixture injects DNS-only discovery and verifies pending-to-verified TXT without claiming TLS ready.
- All other source changes are nonoverlapping or taken from their nearest feature branch delta; the current `main` is preserved by this isolated candidate.

## Required release evidence

1. All CI checks on **this exact integration commit**, not just each source PR, including: runtime, unit, migrations/browser, portal registry, OIDC/browser actual Go pairing, signed installer, and real disposable provisioning.
2. Compare test workflows to ensure that no job checks a pinned older source instead of this combined HEAD. Any pinned fixture remains fixture-only and must not be used as combined-runtime evidence.
3. Cross-stack negative tests: invalid/expired installation, replay, sender origin/scope, DNS mismatch, signed metadata tampering, private PostgreSQL roles, database restore, single-use admin, startup readiness, agent interruption/resume and rollback. No live seller secrets, J&T Production order or irreversible operation.
4. Installer release gates still **NOT PROVEN**: private registry per-installation pull grants; independent production trust-root distribution and signer key custody/rotation; long-lived agent credential renewal/revocation/recovery; production version compatibility/rollback; verified bootstrap distribution; real VPS Ubuntu 24.04 host reboot and public DNS/ACME HTTPS.
5. Two distinct terms: `INSTALLED` is not `STORE_READY_TO_SELL`. J&T seller integration and payment checkout remain fail-closed pending provider UAT and separate shipping integration PRs.

## Isolation

Never deploy `gheverhan.store`, mutate its VPS, secrets, DNS, data or appearance, change its production environment or make an automatic release. This branch is only for CI/review and disposable fixtures. Preserve source PR branches untouched until a reviewed consolidated release decision.

## Next

After exact-HEAD combined CI and security review, remediate integration gaps on this branch and produce a release candidate report. Do **not** merge the entire feature to main or publicize an installer before explicit acceptance of the remaining security, infrastructure and deployment gates.
