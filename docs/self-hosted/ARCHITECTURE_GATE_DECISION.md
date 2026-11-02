# JetSeller Self-Hosted — owner architecture direction and implementation authorization

**Decision date:** 2026-11-02 (Asia/Jakarta)  
**Status:** PRODUCT DIRECTION APPROVED; SECURITY / DELIVERY FEASIBILITY GATES OPEN  
**Evidence:** explicit owner instruction in project conversation: proceed with approved architecture and pursue release.  
**Sources:** `docs/self-hosted/PRD.md`, `m0-review-gate.md`, `adr/0001`–`0006`, `m1-pr-plan.md`; PR #136 and #137 merged.

## Authority and scope

The owner approves the six ADRs **as the target architectural direction** and authorizes M1 implementation in reviewable PRs. Approval does NOT claim security review, completed runtime tests, registry entitlements, signed artifact trust roots, safe schema migration, or seller pilot readiness. Existing Gheverhan production must remain operational and must not be altered by a JetSeller development merge.

| ADR | Approved product direction | Engineering exit gate |
|---|---|---|
| 0001 | Independent store runtime/DB/media/secrets; center receives allowlisted metadata only; commerce works offline | Outage/IDOR/telemetry privacy tests |
| 0002 | Seller-confirmed one-use pairing with installation-bound asymmetric identity; prefer standards-based PoP | Protocol transcript/library/security review; replay, nonce, rotation, revocation and recovery tests |
| 0003 | Unprivileged outbound Go agent with constrained local privileged helper over private Unix socket | Operation schema, UID/peer checks, path confinement and misuse tests |
| 0004 | Verified initial bootstrap, signed immutable image and TUF-compatible freshness; phased centrally managed updates | Independent bootstrap trust root, signing custody/rotation, private artifact credential proof and freeze/revocation drills |
| 0005 | Per-store private PostgreSQL; compatible migrations; off-VPS encrypted media/DB/config backup | Owner-approved RPO/RTO/retention and measured independent restore |
| 0006 | Incremental opt-in self-hosted packaging; preserve current Gheverhan deployment behavior | Isolated CI, regression tests and approved production release boundary |

The word **approved** here means a product architecture decision; an ADR still marked PROPOSED in its source document requires named specialist implementation validation before a production installer or update release can be deemed accepted. Do not re-block *isolated M1-01/M1-02 prototype work* solely because the cryptographic implementation has not yet been chosen. Conversely, do not fabricate a complete security solution or silently waive its acceptance tests.

## D01–D11 resolution direction (owner-approved, test evidence pending)

| ID | Direction |
|---|---|
| D01 | Define one versioned lifecycle and keep desired versus observed state separate |
| D02 | Verify domain, trusted artifacts, isolated database/app, TLS, then final readiness; never conflate statuses |
| D03 | Verify bootstrap/image/install manifest before first executable seller installation (P0), not only before updates |
| D04 | Show public device-key fingerprint only within authenticated confirmation; never log secrets |
| D05 | Create stable installation intent ID once; pairing atomically binds device to existing intent |
| D06 | Resolve channel to immutable release digest and explicit app/schema/agent/protocol compatibility |
| D07 | Reject shared PATs; evaluate Harbor installation-scoped expiring pull robots and alternatives experimentally; **registry not yet selected** |
| D08 | Agent/helper IPC via private Unix socket, peer authorization, no arbitrary shell operations |
| D09 | Encrypted off-server consistent backup and independent restore proof; **RPO/RTO/retention not yet set** |
| D10 | First-run admin claim generated/stored locally; single-use, bounded expiry, HTTPS-only form POST |
| D11 | Require reviewed explicit production-deploy boundary before frontend-affecting merge; no automatic production change from JetSeller feature PRs |

## Implementation approval

1. Begin M1-01 configuration work in a dedicated branch/PR; then M1-02 image/Compose/Caddy, M1-03 readiness, M1-04 disposable Ubuntu recovery tests.
2. Proceed iteratively to portal registry, signed bootstrap/pairing, domain setup, local install journal, Go agent/helper, and signed phased update orchestration, each with separate CI and tests.
3. Each code PR must preserve current default profile and include exact-HEAD CI evidence, unit/integration/browser regressions as applicable, security negatives, and rollback.
4. Do not silently change repository visibility, production DNS/secrets/VPS/databases, or run real J&T orders. Use synthetic disposable resources.
5. Production installation and update rollout require signed supply-chain trust, private distribution proof, backups and measured restore, health/readiness, seller consent, rollback/recovery, and a separately identified release target. A failing gate remains **BLOCKED**, not waived by this direction approval.
6. GitHub code PR merges affecting `frontend/**` must wait for an explicitly reviewed deploy isolation gate, as `.github/workflows/helipod-autodeploy.yml` can otherwise deploy Gheverhan on main pushes.

## Outstanding named technical decisions

Security lead: PoP library/profile, signer/trust-root and key recovery.  
Ops: registry credentials, quotas/ownership, Ubuntu fixture provisioning.  
DB/ops/product: RPO, RTO, retention, recovery key.  
Product/legal: license, source visibility policy, J&T trademarks.  
Release owner: final approved deployment operation and pilot rollback.

This record acknowledges owner authorization **to implement toward release now**, not a claim that the complete installer is already live or safe for production.
