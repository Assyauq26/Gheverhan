# J&T seller configuration: explicit self-hosted profile security gate

**Status:** Development security remediation; this does not authorize a production launch, live J&T credentials, or checkout activation.

## Problem

The original `local_store` carrier mode accepted a syntactically valid `JETSELLER_INSTALLATION_ID` even if `JETSELLER_STORE_PROFILE` was missing. This allowed legacy or misconfigured application processes to be mistaken for an independent seller store and to enter local J&T configuration logic. Although encrypted settings use an installation-ID-associated data boundary, a UUID alone is not proof that an independent-store runtime is configured.

## Fix

- `frontend/src/infrastructure/shipping/jnt/seller-config.ts` now requires `JETSELLER_STORE_PROFILE=self-hosted` **exactly** in all code paths that derive the local seller identity, grant local J&T administrative permissions, or derive the AES-GCM installation AAD.
- Existing canonical UUIDv4 validation and optional `JNT_INSTALLATION_ID` consistency checks remain in place. The application does not accept legacy/absent/case-mismatched profile values as local seller identity.
- Legacy Gheverhan platform J&T mode remains independent: it does not enable local seller access merely by providing a UUID, and this patch does not change legacy owner allowlists.
- Unit tests cover missing, legacy, mistyped and whitespace-mismatched profiles; no DB write on rejected input; no encrypted read while profile is missing; positive local-store and separate legacy tests remain.
- Existing isolated PostgreSQL/browser fixtures explicitly set the valid self-hosted marker in local mode. No test-only bypass was inserted in production code.

## Still separate release gates

1. Complete `parseSelfHostedConfig`/runtime infrastructure validation occurs in the independently installed storefront launcher. A caller executing a partial application outside that launcher still needs deployment/identity attestation. This patch prevents the **missing profile** case but does not itself prove the running process belongs to a particular VPS or domain.
2. The existing HTTP localhost browser regression is not a substitute for a complete real HTTPS independent-store Postgres fixture. Production installer acceptance and cross-instance isolation must still be verified.
3. The local Check Fee-only safe test does not make Order, Cancel, Tracking, payment, shipping quotes or checkout ready. Keep `activeJntConfig()` fail-closed until authorized JNT-SH-02 UAT.
4. Credentials are encrypted per installation; central JetSeller portal must not store seller J&T secrets.

**No production VPS, DNS, database, API request or secret changes.** Exact-HEAD full RC integration CI and code review are required before merging to the RC branch.
