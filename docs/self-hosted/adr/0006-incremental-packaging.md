# ADR-0006 — Incremental packaging and protected deployment profiles

Status: PROPOSED. Context: mature commerce app and site-specific Helipod config exist. A wholesale monorepo move creates needless regression and can trigger current main-push production deploy.

Proposal: keep `frontend/` and its module boundaries initially. Add self-hosted profile alongside unchanged Gheverhan profile, with canonical origin/domain, local storage path, DB roles, sender and integration ownership explicitly validated. Separate portal/control-plane package and Go agent/helper later; extraction into `apps/` is optional after stable seams, not M1 prerequisite. No tenant routing in storefront or tenant_id sweep.

Self-hosted builds use production command, locked dependencies, explicit toolchain/base digests, reviewed .dockerignore and non-root image; measure runtime contents/image transfer peak before choosing Next standalone output. Do not remove Supabase/Netlify support for current deployments as incidental cleanup. Keep 2-column product UI, commerce pricing, cart/checkout and admin invariants in regression suites.

New release CI must not inherit SSH/main-push fleet rollout. Any future edits affecting existing autodeploy paths need an explicit reviewed production boundary. Parameterized Caddy/Compose use seller-owned durable storage, private DB, no agent management ingress; validate on disposable Ubuntu24.04 amd64. Do not replace live Caddy or DNS during development.

Local setup is single-use, expiring and HTTPS-only, separate from INSTALLED and STORE_READY_TO_SELL. Keep J&T credentials and readiness local. Portal UI must reflect backend state and never simulate a completed install or display a working command before verified artifacts exist.

Exit: explicit lint/typecheck/build/unit/DB/browser checks on implementation PRs, fixture install/reboot/persistence and resource measurements, plus original-store regression. M0 is documentation-only and does not claim these checks passed.
