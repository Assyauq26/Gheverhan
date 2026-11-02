# Proposed architecture decisions — M0

All ADRs are **PROPOSED, awaiting review**; none authorizes implementation, production work or changes PR #136 defaults. Authority: documentation `6b576b6c35eda343b13352c16b995d3723f49cb7`; evidence main `fdf8d18ba90450fa1fe3d9c9392f1fc0eeefd96a`. Review with `../repo-audit.md`.

| ADR | Decision owner / evidence needed before acceptance |
|---|---|
| 0001 isolation | Product + architect: approve data ownership schema, explicit outbound metadata allowlist and outage test |
| 0002 pairing | Security + Go lead: threat-model device binding, formal transcript, expiry/race/rotation/revocation tests |
| 0003 local helper | Security + ops: peer authorization and privilege abuse tests on disposable Ubuntu24.04 |
| 0004 release trust | Security + release owner: signer identities, trusted-root distribution, freshness/recovery and compromised-key drill |
| 0005 data recovery | DB + ops + product: app/schema ranges, measured backup/restore and agreed RPO/RTO/key recovery |
| 0006 packaging | Next + ops: validated installation profile, measured image/disk budget and CI isolation |

Acceptance requires named review and resolution of OPEN_DECISIONS. Source availability/license policy remains unresolved; current master is public, despite private-master goal. Review clarifications D01–D11 in [architecture gate](../m0-review-gate.md), [visibility analysis](../visibility-impact.md), and [M1 PR plan](../m1-pr-plan.md). Recommendation finalized for review does not mean ADR accepted.

## Final review disposition after PRD merge

All six remain PROPOSED. #136 merge makes the PRD canonical; it does not accept this audit or authorize M1. Publication base is `5f6d21ed42c04ef7206e781edae09c728b52850b`; audited source baseline remains unchanged.

| ADR | Recommended disposition for owner review | Residual risk / approval required |
|---|---|---|
| 0001 isolation | Retain separate store runtime/data and narrow asynchronous center | Verify outage/egress and telemetry allowlist; product approves data ownership and diagnostic scope |
| 0002 pairing | Prefer reviewed application PoP; retain operated mTLS as alternative | Security approves transcript/library/replay and recovery parameters; no protocol implementation yet |
| 0003 helper | Unprivileged outbound Go agent and peer-authorized Unix socket helper | Root-capable helper remains attack surface; approve operation schemas/paths and pass abuse tests |
| 0004 trust/distribution | Cosign signer plus TUF metadata; independent bootstrap root; evaluate Harbor expiring project robots | Approve trust custodians, registry operations/cost and delivery credentials; all need disposable feasibility proof |
| 0005 recovery | Private PG17 target, compatible migrations, encrypted off-server consistent recovery | DB/ops/product approve RPO/RTO/retention/key recovery; measured restore and schema rollback evidence |
| 0006 packaging | Preserve frontend and default profile; add opt-in self-hosted templates | Owner approves deployment boundary before frontend merge; packaging/regression/resource measurements required |

No application test, installer, agent, restore drill or signed release was executed in M0. Final detailed recommendations and D01–D11 are in [review gate](../m0-review-gate.md).
