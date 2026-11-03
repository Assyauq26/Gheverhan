# RC-01 integration: seller-owned J&T settings

Combined review of PR #154 and stacked PRs #141 and #149.
Full combined exact-HEAD CI required before merge. No live J&T calls or checkout activation.

Open gate: local JNT_CONFIG_SCOPE can currently allow missing canonical JETSELLER_STORE_PROFILE; full self-hosted profile must be enforced with compatible browser/PG fixtures before release.
Open gate: local key generation and storage, seller J&T mapping, payment/checkout and Create Order/Tracking UAT remain unverified.
No deployment, production DNS, DB, secrets or J&T API changes.