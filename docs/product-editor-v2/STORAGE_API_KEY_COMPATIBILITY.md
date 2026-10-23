# Supabase Storage key-family compatibility — PR #87 isolated follow-up

Source-only patch based on Product Editor V2 exact head `5e59ca0c6fc729e05a4b37d5a9882d0cc355e343`. No Production data, runtime secrets, deployment, bucket or other infrastructure changed.

## Observed source limitation

The current Storage HTTP helper always sends a key in BOTH `apikey` and `Authorization: Bearer`. That is valid for the legacy JWT-based service_role key but not for a modern opaque secret key. Modern secret keys belong in `apikey` and should not be passed as a Bearer JWT. See:
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys

The patch preserves both headers for existing legacy keys and omits Authorization for modern secret keys. It rejects publishable keys on this privileged server-only Storage path. No new environment variable or actual key is required to review or test this patch. The existing variable name `SUPABASE_SERVICE_ROLE_KEY` is unchanged and can only be repointed to a reviewed modern secret key during a separately approved operator cutover.

Tests verify header shapes for old/new families, failure on missing/publishable keys and error redaction. The pinned disposable provider drill covers the existing legacy path. Actual managed Supabase Storage with an opaque secret key must be verified by a protected, non-destructive provider probe after operator attestation; unit checks do NOT prove remote behavior.

## Integration and release gates

Review this change separately. If migration to modern keys is approved, merge this small patch into PR #87, rerun full exact-HEAD CI, and refresh reviewer approval before maintenance. Confirm all legitimate consumers (including non-repository ones), test new API key, then retire legacy key through Supabase's official method. Merely creating new keys does not revoke legacy access. Database-password rotation, existing pooler sessions and old deployed secret snapshots are separate controls.

Do not rotate JWT signing keys as a shortcut or disclose secret values in chat, CI output, GitHub PR text or artifacts. Do not merge, deploy, mutate Production, change Storage privacy, or delete old deployments based solely on this patch.

## Release preflight follow-up

Independent review found that the private-bucket metadata probe still sent modern keys as Bearer JWTs. The probe now imports the same key-family policy as the runtime adapter. Regression tests reproduced the mismatch and rejection-before-fetch failure before the fix; all 13 targeted tests pass after the fix. Runtime contract tests cover upload, private download, compensating delete and provider-error containment for both key families. These mocked header contracts do not prove managed Supabase's opaque-key gateway behavior.

Local validation on pinned Node22/dependencies: 438 unit tests, security containment/mitigation, TypeScript and ESLint pass. The real disposable provider drill remains the legacy JWT provider proof; modern managed-provider verification and old credential revocation still require the trusted operator channel and separately approved cutover. No Production credential, Storage object, database or deployment is changed by this patch.
