# JetSeller domain rollout proposal — not executed

Owner confirmed on 2026-10-31 that jetseller.web.id was purchased at DomaiNesia and DNS has not been configured. This establishes the owner's statement, not completed DNS/SSL verification. Local resolver and direct 1.1.1.1 lookups timed out; do not describe that as NXDOMAIN or absence of ownership. Browser access to the previous DomaiNesia tab became unavailable. No DNS record was changed.

## Proposed records, conditional on ready deployment

| Name | Type | Target | Gate |
|---|---|---|---|
| @ | A | 43.173.21.197, only if the current Helipod VPS remains the approved deployment target | verified DomaiNesia zone control, capacity, platform runtime, proxy and release approval |
| dashboard | A | same approved target | dashboard tenant/session isolation and callback tests passed |
| <slug>.shops | A / individual record | approved tenant ingress | verified registry binding and TLS; wildcard remains unconfigured |

Use a short initial TTL such as 300 seconds if the DNS provider supports it. These are a proposal, not an instruction to overwrite existing records. Audit authoritative nameservers, existing A/AAAA/CNAME/TXT/MX/CAA and DNSSEC first. Preserve mail, verification and unrelated records. Do not publish an AAAA record without a tested IPv6 route. A custom domain must pass an independently checked ownership challenge; a user-supplied hostname or DNS resolution alone is insufficient.

## Application and ingress gates

Do not point a new platform domain at the current Gheverhan-only virtual host or serve store administrator pages as JetSeller Super Admin. Prepare separate host-aware platform routes with independent authentication/database authority. Decide whether a separate runtime fits measured VPS RAM and connection budgets; approve capacity expansion before any paid infrastructure change. Keep the existing Gheverhan Caddy site and persistent certificate volumes intact.

Before cutover, test the exact candidate locally/staging with the intended Host and both synthetic tenant databases: platform/seller/customer session rejection across audiences, exact Origin/CSRF rules, unknown-host rejection, ownership/TLS readiness, registry changes/suspension, cache isolation, trusted proxy headers, login code replay and callback redirects. Plan HTTPS issuance without weakening certificate validation. Use an explicit additive Caddy virtual host only after application and database readiness; never restart Production merely to test DNS.

After approved record changes, verify authoritative and public DNS, valid certificates for both platform hosts, HTTPS redirects, secure host-only cookies, authentication boundaries and public smoke results. Mark jetseller.web.id and dashboard.jetseller.web.id LIVE separately only after actual proof. Maintain a record-level DNS rollback and prior proxy/app configuration; neither rollback touches tenant data. gheverhan.store remains active and unchanged throughout.

## Outstanding gates

- Authenticated read-only inspection of the DomaiNesia zone and authoritative delegation.
- Implemented central runtime/authentication and tested multi-tenant dashboard (PR #120 currently provides foundation only).
- Separate central database, least-privilege credentials, private encryption key management, verified backup/restore and rollout approval.
- Measured memory/disk/connection capacity and tested rollback.
- Official J&T credential rotation/UAT/mapping/weights before LIVE_SHIPPING; DNS readiness never substitutes for these gates.
