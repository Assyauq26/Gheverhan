# Open Decisions and Safe Defaults

Open items should not block **read-only inventory and architecture PoC**. Codex may use safe defaults for a disposable prototype, but must not silently resolve significant business/security decisions as final product policy.

| Issue | MVP safe default | Final decision owner |
|---|---|---|
| Seller hosting OS | Ubuntu 24.04 LTS x86_64 VPS with sudo | JetSeller product + engineering |
| VPS min specs | Proposed 2 vCPU / 4 GiB RAM / 40 GiB free; benchmark | Engineering |
| Portal hostname / admin routes | jetseller.web.id / dashboard.jetseller.web.id | Product |
| Internal package layout | Incremental modularization; avoid risky repo-wide move | Engineering after audit |
| Agent language | Go static binary; review maintainability | Engineering |
| Pairing protocol | RFC 8628-like device flow; implement fully documented spec | Security |
| Agent credentials | mTLS or scoped PoP with rotation | Security |
| Image registry | GHCR private pull via short-lived scoped credentials; verify feasibility | Security/Operations |
| Signing | Cosign approved signer identity + signed metadata, anti-rollback | Security |
| Auto-update default | Notify-only during pilot; opt-in auto with maintenance window | Product/Seller |
| Critical security patch policy | Escalate and notify; never secretly brick store | Product/Legal |
| Licensing commercial terms | TBD; no per-request checkout licensing dependency | Product |
| Backup storage | Seller-controlled off-VPS encrypted location, guided setup | Product + Engineering |
| DB major version | Match existing app driver/migrations; pin after audit | Engineering |
| Custom domain ownership | TXT challenge, A/AAAA corroboration, Caddy HTTPS | Engineering |
| Non-empty VPS | Block in MVP if ownership/conflict unclear | Security |
| www redirect policy | Optional canonical root domain | Product |
| J&T API readiness | Per seller, endpoint-specific Sandbox/Production controls | Product + Seller |
| Emails for new stores | Seller-provided SMTP/Resend, no central secret sharing by default | Product |
| Production migration Gheverhan | Excluded; separate approved RFC | Owner |
| Support diagnostic access | Seller-consented, redacted, time-limited | Product/Security |
| Software EULA & trademark | Legal review, do not claim official J&T affiliation without authorization | Legal/Product |

**Hard constraints until resolution:** No production deploy, no shell/SSH access from center, no shared DB, no copying seller credentials or order data to center, no disabling a store during center outage, no rollback of destructive migrations by assumption.