# ADR-0001 — Independent store and narrow control plane

Status: PROPOSED. Date: 2026-11-02. Scope: new self-hosted product only.

Context: existing Next API and Prisma hold commerce in a single store. Old SaaS admin wording must not become a central commerce authority. PRD FR-06, FR-09, FR-12 and A25–A27 require offline-center store survival.

Decision proposal: retain Next store + local Postgres/media and `/admin` per VPS. Separate portal and operator console DB/auth realm from store users. Central registry holds seller account, install IDs/domains, public device keys, status enums, sanitized errors, app/schema/agent versions and release policy only. No customer/order/address/payment/shipping credential payload or shared store DSN. Heartbeat schema uses a strict allowlist and bounded lengths; diagnostic uploads require separate scoped consent and expiry.

Alternatives rejected: shared tenant runtime/database, central shipping credential broker, per-checkout license/auth call. These contradict the new boundary and introduce central outage/PII risk. Sharing pure contract types/testing patterns is acceptable; sharing runtime secret stores is not.

Consequences: identity, billing/install metadata and local admin require explicit separate lifecycle. Unpair revokes management only, preserving commerce/DB/keys. Future licensing decision cannot remotely break store checkout.

Review proof: network egress fault test with two hours center outage, payload schema rejection tests, cross-install IDOR tests and unpair/re-pair without resetting store. No such proof was executed in M0.
