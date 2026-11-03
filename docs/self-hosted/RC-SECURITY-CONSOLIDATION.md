# JetSeller RC-01 Security Consolidation

This branch integrates the **exact reviewed code** from:
- PR #158: root-owned directory ancestry for privileged **disposable** provisioning.
- PR #159: expiration of paired domain claims without DNS ownership and DNS-backed recovery under transactional locking.

No changes are made to source branches, main, production VPS, staging VPS, DNS, customer data, or secrets.

## Validation and release gates

The source PRs individually passed 4/4 and 3/3 workflows. That does **not** validate the combined code. Run the full RC-01 CI suite on this integrated commit, then review the changed paths before proposing merge to RC #154.

Known design limitations to retain:
- Privileged provisioning remains limited to a disposable fixture; no production installer is newly authorized.
- Historical TXT proof is not a substitute for fresh DNS revalidation on sensitive later operations. Production lease renewal and account recovery require additional policy/security review.
- Integration does not solve private per-installation registry credentials, signer custody, agent credential lifecycle, or production-profile VPS preflight.

Production-ready or public-seller-ready status is **NOT** claimed.
