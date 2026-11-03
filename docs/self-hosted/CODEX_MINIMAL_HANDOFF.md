# JetSeller Self-Hosted — minimal Codex handoff (post-ChatGPT engineering)

> **Status:** development / review only. Never equate green CI or a 2-GB staging test with a production installer release.
> **Scope:** Assyauq26/Gheverhan. Control-plane and independent store runtime are separate from the existing Gheverhan store.
> **Last verified RC security merge:** PR #160 merged into RC branch `feat/jetseller-rc-integration-01` at `4f1f25614260d8cc8698495a387b777b2a6596c8`. This is **not merged to main**.

## Read this before spending agent tokens

**Already implemented and evidence available** (do not redesign or redo without relevant changes):

- PR #154: RC runtime, dedicated PostgreSQL, per-store media, Caddy, control-plane registry/OIDC, verified pairing, TXT domain ownership, signed disposable fixture provisioning, one-time local admin. CI must be read on the current PR HEAD, **not** on the old `267d334e` HEAD.
- PRs #158/#159: independently tested ownership and domain-reservation patches, consolidated through PR #160 and **merged into the RC branch only**. Root-run fixture helper now rejects untrusted directory ancestry. Paired but unverified DNS claims expire and require fresh TXT proof for recovery.
- Staging: Tencent Lighthouse `43.173.41.24`, Ubuntu 24.04.4, `staging.jetseller.web.id`; public Let's Encrypt TLS, reboot persistence, PostgreSQL/media and storefront/dashboard had been reported successful in LOW_RESOURCE_STAGING and PUBLIC_HTTPS_VERIFIED evidence. This environment is **2 GB RAM/40 GB total disk**, below production preflight requirements of >=4 GiB RAM and >=40 GiB **free** disk. These are experimental staging results, **not** proof of the full seller installer.
- PR #161: integration review branch `feat/jetseller-rc-jnt-seller-settings`, pulled from J&T stacked PRs #141/#149, adds seller-local encrypted configuration, warehouse and simple UI. It does **not** activate checkout or real J&T Production API calls. It must pass combined-head CI and then be synchronized with the new RC HEAD before any merge.
- PR #163: DPoP-bound **proactive** renewal for valid 10-minute agent credentials, with an API route and Go client atomic persistence. No shared refresh token, elevated scopes, or expired-token recovery is claimed. Exact-head CI and review required before integrating with RC. This reduces but does not remove the need for agent renewal scheduler, offline recovery, and key replacement.
- Legacy Gheverhan deployment gate PR #139 is merged. Keep Gheverhan production VPS `43.173.21.197` and database/DNS out of all test operations.

## Work Codex should NOT repeat

- Do not redo the RC branch composition from PRs #143–#153.
- Do not redo the 2-GB staging TLS certificate/reboot/persistence tests unless a changed runtime warrants revalidation. Read their evidence reports first.
- Do not rebuild the simplified J&T settings UI from scratch; review PR #161 and fix only demonstrable gaps.
- Do not generate new throwaway crypto or bypass signer/certificate validation to satisfy CI.
- Do not disable host preflight. Do not rebrand, redesign frontend, or change independent per-seller architecture.

## Remaining execution order

### Gate 1 — Finish RC combined reviews & CI
1. Check actual status, SHA, changed files and exact-HEAD checks for #154 and #161.
2. If full combined RC CI passes, review ownership/domain patch safety and review pending domain renewal policy; do not mislabel historical TXT proof as perpetual current DNS ownership.
3. Synchronize J&T branch with latest RC HEAD and rerun complete combined CI. Only integrate approved code into **RC branch**; no merge to `main` until release readiness is independently established.
4. J&T local scope still permits missing `JETSELLER_STORE_PROFILE` with valid UUID; enforce canonical **explicit** self-hosted installation identity under real independent PostgreSQL/HTTPS fixture. Do not insert a test-only security bypass or weaken runtime parseSelfHostedConfig.

### Gate 2 — Release supply chain
1. Choose/verify a private registry provider with **installation-scoped short-lived pull rights**. Prove upload/download/expiration/revocation of a synthetic private image with no shared PAT.
2. Set up independently trusted and versioned bootstrap root and signed image manifest. Signer custody, threshold/rotation/revocation, expiry and rollback prevention must be tested outside the fixture. Do not use test signing root for production.
3. Pin release compatibility between app, migrations, Go agent, protocol and installer. Unsafe schema rollback must be blocked.

### Gate 3 — Agent identity and update lifecycle
1. Current portal issues a 10-minute PoP-bound agent credential from pairing. Existing `agentIdentity` checks non-revoked device plus DPoP proof and replay DB. PR #163 adds proactive valid-token renewal (API + Go client); **this is not a complete offline-recoverable grant**.
2. Define and implement a reviewed short-lived renewal/revocation/recovery contract and tests (expired, rotated, replayed, revoked, wrong device/install, concurrent refresh). Ensure no arbitrary remote shell or shared root Docker socket.
3. Implement seller-approved update rollout, backup/checkpoint, readiness and compatible rollback using signed digests.
4. Preserve standalone storefront behavior if the control plane is offline.

### Gate 4 — Real installer acceptance
1. Prove a fresh Ubuntu 24.04/amd64 VPS or disposable runner meets >=4 GiB RAM and >=40 GiB free disk; **Tencent 2-GB staging does not meet this gate**.
2. Run genuine seller onboarding: signup/auth → installation intent → pairing → DNS TXT → verified bootstrap → private release retrieval → Docker/DB/Caddy/HTTPS → single-use local admin → storefront/dashboard.
3. Test failure recovery, backup + independent restore, rollback and no secret/PII leakage. Distinguish fixture emulation from verified public installer.

### Gate 5 — J&T seller ready and commerce gating
1. Make the local seller's **minimal** J&T form usable: official credentials + warehouse, hide technical endpoints unless advanced, no secret echo/central sharing.
2. Keep checkout closed until JNT-SH-02 fees, region mapping, quote revision binding, payment, durable external request identity, AWB tracking, and cancel/reconciliation succeed in authorized Sandbox/UAT.
3. Safe Check Fee read-only success is not evidence of Order/Cancel/Tracking readiness. Never fabricate live order probes.

## How to proceed without repeated planning

- Use separate reviewable branches and exact-head CI; provide concise reports only when a gate is completed or blocked.
- Prefer test fixtures and code-level work before asking the owner for registry endpoints, seller J&T agreements, OIDC/email configuration, or a larger disposable VPS.
- Never put passwords, private keys, SSH secrets or J&T keys into repository, PR descriptions, screenshots or chat.
- No DNS changes, production database mutations, VPS reboot or live J&T calls without explicit target-specific approval.
- **Do not touch Gheverhan production:** `43.173.21.197`.
- At the end, write `docs/self-hosted/FINAL_RELEASE_READINESS.md` with exact SHAs, positive/negative evidence, links to CI and remaining blockers, plus a concise approval-specific production rollout & rollback runbook.

## One-sentence Codex kickoff after quota returns

"Read `docs/self-hosted/CODEX_MINIMAL_HANDOFF.md` on the JetSeller RC branch; check the current PR #154/#161 CI HEAD, complete only the remaining unchecked gates in order, use disposable tests, and leave Gheverhan production untouched. Do not re-audit/rebuild work marked verified unless changed."

