# JetSeller RC combined workstreams (review only)

This integration branch collects independently developed code from:
- RC #154 security HEAD after PR #160: privileged disposable helper + domain reservation security.
- PR #161: seller-local J&T setup and simplified UI from source PRs #141/#149.
- PR #163: bounded proactive PoP/DPoP agent token renewal in control-plane and Go client.
- PR #162: minimal Codex handoff and release checklist.

Exact-head **combined** CI is mandatory; source PR check success is not sufficient. This branch is not live and does not authorize deployment to main or production.

Release blockers that this branch does NOT solve:
1. Complete canonical JETSELLER_STORE_PROFILE enforcement for local J&T in real self-hosted PostgreSQL/HTTPS fixture.
2. Production private registry grants per installation, signed trust-root custody/rotation, signed bootstrap distribution.
3. Agent renewal scheduler, expired/offline device recovery, rotation and seller-approved update rollout.
4. Real >=4 GiB RAM and >=40 GiB free disk Ubuntu 24.04 full installer acceptance; existing 2 GB staging remains a low-resource experiment.
5. Real portal OIDC/email provider, seller authorization, production DNS control and licensed release workflow.
6. Seller J&T account/mapping/provider UAT, Create Order/Tracking/Cancel safety, and verified checkout/payment.

Never touch Gheverhan production (43.173.21.197), change public DNS or enable J&T Production in this review.