# M0 documentation review and architecture gate

Reviewed 2026-11-02 WIB. **READY_FOR_REVIEW for the audit PR. PR #136 merged; M1 NOT AUTHORIZED.** This review reuses the pinned M0 audit, not a new application audit.

## Historical pre-merge GitHub snapshot

Repository: Assyauq26/Gheverhan, currently public. [PR #136](https://github.com/Assyauq26/Gheverhan/pull/136): OPEN, not Draft, not merged; HEAD `6b576b6c35eda343b13352c16b995d3723f49cb7`; main `fdf8d18ba90450fa1fe3d9c9392f1fc0eeefd96a`. Local fetch confirms these refs unchanged from M0; all eight documentation blob IDs match the original manifest. No source re-audit was required.

| Gate | Actual result | Interpretation |
|---|---|---|
| Check runs on exact HEAD | 1: `unit-tests`, completed SUCCESS | [Run 41395883079](https://github.com/Assyauq26/Gheverhan/actions/runs/41395883079); no failed/pending check runs returned |
| Actions runs on exact HEAD, all events | 1, same successful pull_request run | Confirms connector's PR-only listing against REST all-event listing; no more than one page required |
| Legacy commit status contexts | 0; API combined state says `pending` | Empty legacy status response is not a pending job; use check-run rollup and ruleset |
| Reviews | 0 submitted reviews | No APPROVED architecture review established |
| Review threads | 0 | No unresolved inline thread, not evidence of human acceptance |
| Codex summary comment | Code review completed, no findings | Security review not recorded; automated comment is not an APPROVED review |
| Merge state | CLEAN / mergeable, `mergedAt=null` | Test merge SHA is not a real merge commit on main |
| Branch policy | Active default-branch ruleset, no bypass actors | Requires PR, resolved threads, `unit-tests`; disallows force push/deletion; only squash merge allowed |
| Approval policy | Ruleset requires 0 approving reviews | User's explicit approval/merge prerequisite is stricter and remains controlling |
| Classic branch protection | API returns 'Branch not protected' | Does not mean main is unprotected: active ruleset above applies |

Other path-filtered workflows (browser/DB/TLS/Helipod/landing) were not scheduled on this docs-only HEAD. Their absence is not fresh PASS evidence. No rerun, workflow dispatch, review submission or remote comment was made. No application test run or production observation was added by this documentation review.

## Eight-document consistency review

All source documents are from the pinned #136 commit, not overwritten or duplicated in the audit packet.

| Document | Alignment with audited main | Clarification required |
|---|---|---|
| README | Correctly labels proposed architecture, independent stores, seller-local J&T, excluded live migration | Update 'audit not complete' context by linking accepted audit after publication; reconcile required-read ordering (no security consequence). |
| PRD | FR-01–12/NFR-01–09 fit reusable Next/Postgres core; M1 portability before installer | Lifecycle and install order differ from Architecture; 40GiB means free disk, not VPS advertised total. P0 requires signature enforcement even though PR-07 is P1. |
| ARCHITECTURE | Target `apps/` layout is explicitly optional; no wholesale move needed | Resolve intent IDs versus pairing creates IDs; separate desired/observed state; define TLS/app readiness ordering and helper topology. |
| API_CONTRACTS | Proposed endpoints, separate identities and metadata allowlist fit new boundary | Version/channel naming; incomplete approve/cancel and token recovery schemas; sequence missing from heartbeat example; fingerprint/logging ambiguity; private registry delivery feasibility. |
| SECURITY_AND_RELEASES | Strong trust, local authority, off-server restore and independent commerce | Signature infrastructure must precede A03/A20, not wait for full P1 update engine; define verifier trust bootstrap and two-person release approval mechanism. |
| ACCEPTANCE_TESTS | A01–A28/U01–U17 correctly forbid fake readiness and real provider orders | Assign each test to milestone; A04 includes agent and cannot be claimed complete by M1 container startup. Backup restore and signed initial install remain P0. |
| OPEN_DECISIONS | Defaults are proposals, not silent product decisions | Add explicit registry credential feasibility, GitHub plan/visibility transition, canonical states and local first-run claim transport. |
| CODEX_EXECUTION_PROMPT | Correctly requires docs-first, separate PRs, no production or M1 before review | 'from approved base' exception is not used here: user's instruction requires #136 approved AND merged. Clarify PR-07 builds on P0 trust enforcement rather than introducing first verification. |

## Architecture review findings and recommended resolutions

These are proposed decisions for the audit PR, not edits to the eight canonical documents or new approved requirements.

| ID / priority | Evidence | Recommended resolution | Gate / owner |
|---|---|---|---|
| D01 High | PRD 6.1 vs Architecture E use different lifecycle enums; API only DRAFT and subset error codes | One versioned lifecycle contract; agent journal authoritative for actual actions, center stores intent/observations. Errors/phase/offline flags separate from terminal lifecycle. Supply explicit alias map and allowed retry transitions; no implicit enum guessing. | Before PR-02; architect + QA |
| D02 High | PRD FR-07 starts DB/app before Caddy TLS, Architecture E has TLS before DB | Recommend FR-07 as executable order: domain validation, verified artifacts, DB, app, Caddy TLS, final readiness. Portal cannot mark TLS or store ready before actual checks. If ACME-first route chosen instead, document its isolated bootstrap handler and keep app readiness separate. | Before PR-04/05; ops/security |
| D03 Critical | P0 signature/install tests vs P1 PR-07 'signing enforcement' | Split supply chain: P0 verified initial bootstrap/image/manifest; P1 fleet rollout/update scheduling. No functional one-liner or initial artifact execution without verification. | Before PR-03; security/release |
| D04 Critical | API auth 'all fingerprints/signatures sensitive; never browser local storage', while seller must review fingerprint | Public key fingerprint allowed only in authenticated confirmation UI; private key/device_code/access token always secret. No fingerprint in logs/URL/persistent browser storage. Verification bundles need local storage by definition: specify signed public metadata versus secret identity storage precisely. | Before PR-03; security |
| D05 High | Create intent already returns installation_id; Architecture D says pairing creates installation_id | Create stable intent ID once; pairing consumes session and binds one device to that ID, not a second install. Define lost token-response retry: bounded identical key-bound result with no second consume; after acknowledged exchange reject reuse. | Before PR-02/03; API/security |
| D06 High | `requested_install_version: stable`, generic Ubuntu profile, absent monotonic version/compose fields in example | Separate requested channel from resolved immutable release ID/digest; explicit supported OS release. Normative manifest schema includes separate metadata, app/schema/agent/protocol/template versions, freshness/revocation and compatibility ranges. JSON examples are illustrative, not complete schemas. | Before contract implementation |
| D07 Critical | OPEN_DECISIONS private GHCR short-lived pulls vs official registry authentication support | Keep GHCR decision pending. CI GITHUB_TOKEN is not a seller credential. Validate delegated token mechanism or select registry/distribution gateway with supported installation-scoped expiring pull grants. Reject shared PAT and exposing private source to obtain images. | Before PR-03 private install; security/ops |
| D08 High | Architecture 'localhost-only' helper vs API Unix socket | Require private Unix-domain socket + SO_PEERCRED/peer UID, no TCP/public helper. Exact operation schemas, local authorization, path/project allowlist and independent manifest verification. | Before helper implementation; Go/security |
| D09 High | Backup guidance ranges from recommended to required production readiness | Recommend mandatory off-server encrypted DB+media+recovery-config and measured isolated restore before production readiness/update eligibility; any exception needs separately recorded risk acceptance and cannot claim recoverable production. Pick RPO/RTO/retention/key recovery with seller. | Before PR-05/pilot; product/DB/ops |
| D10 High | Installer local admin token must be secret, but delivery/claim protocol not specified | Generate locally; display one-use setup claim to operator locally only, no secret in portal/URL/log. HTTPS form POST, short TTL, atomic consume, rate limit and no overwrite of existing admin. Document secure display/recovery path. | Before PR-05; security/auth |
| D11 High | Existing main push deploy and public repository; current approval count 0 | Require explicit deployment boundary decision before frontend M1 merges and separate governance approval for visibility change. Do not silently disable safeguards or rely on a review count of zero as architecture approval. | Before affected M1 merges; owner/DevSecOps |

## Final technical recommendations, pending acceptance

- **Installer:** version-pinned verified Go bootstrap; Ubuntu24.04 amd64 disposable-host target, non-empty host/conflict refusal, journal+lock, explicit permission for package changes. No SSH ingestion, generic exec or root agent Docker access.
- **Pairing/agent:** key-bound RFC8628-inspired flow, server-side TTL/rate/CAS, separate credentials/realms. Recommend one reviewed scoped PoP design unless an operated mTLS CA/revocation system is explicitly chosen. Store survival independent of revocation/center; no OAuth or mTLS compliance claim in advance.
- **Domain:** seller manual DNS; TXT ownership independent from A/AAAA, SSRF-hardened verification, actual SNI/chain HTTPS and durable Caddy state. Resolve D02 before implementation.
- **PostgreSQL:** PG17 recommended from audited driver/migration baseline, pin tested patch/digest later; private network, local unique secrets, separate migration/runtime privileges, immutable volume ownership; no automatic major upgrade. Review RLS bypass semantics, not blind privilege removal.
- **Signed releases:** authorized Cosign signer + provenance/SBOM + immutable OCI digest and an established TUF-compatible verification library. Resolve trust root/recovery and private distribution before executable installer. Initial-install verification is P0.
- **Update agent:** unprivileged outbound service + constrained local helper; signed desired state, metadata schema allowlist, local final policy. Notify-only pilot, opt-in window, durable journal, timeout/backoff, three-failure circuit breaker, explicit ring approval.
- **Rollback:** app/schema compatibility first, DB+media+config restore proof separately; never infer downgrade safety from old image presence or static health200. Incompatible schema requires stop/manual recovery, not automated schema downgrade.
- **J&T:** seller-owned local encrypted credentials and local owner permission; endpoint-specific sandbox/production UAT. No central shipping key, fabricated tariff or real order smoke. Existing webhook acknowledgement is not verified fulfillment.

These finalize the **recommendation**; all six ADRs remain PROPOSED until reviewers accept them. No product/security owner approval is inferred from this file.

## Post-merge finalization — 2026-11-02

GitHub confirms #136 CLOSED/MERGED at `5f6d21ed42c04ef7206e781edae09c728b52850b`; fetched origin/main matches. All eight source document blobs match the original manifest. Only those eight documents changed since application baseline `fdf8d18ba90450fa1fe3d9c9392f1fc0eeefd96a`; the static audit is reused without a full re-audit. The table above preserves historical pre-merge checks, not current merge status. Merge does not establish acceptance of six ADRs. The user explicitly authorized this documentation PR; no human APPROVED review is inferred.

Original local evidence and its validation remain intact. Publication copies update merge facts, handoff, ADR rationale and M1 details. Final validation records original/new hashes outside this packet. No canonical PRD, application or workflow is changed.

## Final recommendations requiring owner approval

| Area | Recommendation | Reason, risk and required proof |
|---|---|---|
| Bootstrap | Pinned signed Go installer for Ubuntu24.04 amd64; independent verifier/root trust; SHA and signature before execution | Never authenticate with a same-source checksum alone. Review verifier delivery/root recovery before functional one-liner; lock/journal plus interruption/concurrency/non-empty-host tests. |
| Pairing | Reviewed application PoP profile per ADR-0002; mTLS conditional alternative | Account/intent/key/scopes bound by atomic consent; replay/rotation/recovery tests mandatory. Library/profile selection requires security review. |
| Distribution | Evaluate project-scoped expiring Harbor robot per installation; GHCR seller grants remain unproven | No shared PAT. Robot is bearer and project scoped, not necessarily digest scoped; prove refresh/revocation/denial bound and operating cost before selection. |
| Data | Private PG17 target, durable DB/media/Caddy; local secrets; encrypted off-server recoverable backup | Agree RPO/RTO/retention/key recovery and consistent restore proof; schema compatibility determines app rollback. No automatic major upgrade. |
| Domain/TLS | FR-07: TXT ownership + A/AAAA/ingress validation, verified artifacts, private DB/migrations/app, Caddy TLS, final readiness | DNS_PENDING preserves journal; bounded retries for DNS/ACME/ports; no admin claim over HTTP. SSRF/rebinding/redirect/AAAA tests and persistent Caddy state. [Caddy reference](https://caddyserver.com/docs/automatic-https). |
| Updates | Signed immutable release, restricted helper, local consent/window, notify-only pilot, canary/ring approvals | Local refusal remains authoritative; three failures pause. Center outage must not gate commerce. Freeze/revoke/restore drills before pilot. |

Six ADRs and D01–D11 need named owner decisions. Also approve registry budget/operations, source policy, trust-root/signing custodians, backup objectives and the deployment boundary before frontend-affecting merges. Recommendations are not accepted decisions.

## Publication and implementation gates

1. Completed: verify #136 merge and user authorization to publish audit documentation.
2. Completed: docs-only delta and eight manifest blobs match; reuse original application audit.
3. Publish exactly the 13-file allowlist from a dedicated origin/main worktree; exclude raw/local evidence.
4. Validate staged docs-only paths, JSON, links, sensitive patterns and final hashes; commit/push/open audit PR and observe exact-HEAD CI. No merge or workflow dispatch.
5. Reviewers record accepted/rejected ADR decisions and owners. Begin M1 only after explicit architecture approval; preserve the four-PR plan.

See `visibility-impact.md`, `m1-pr-plan.md`, `adr/README.md` and `evidence/review-summary.json`. Production, DB, DNS, visibility and CI safeguards remain unchanged.
