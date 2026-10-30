# Helipod full release preflight

The full gate supports an explicit Helipod profile alongside the existing Supabase and isolated-test profiles. Set `GHEVERHAN_DEPLOYMENT_TARGET=helipod` and `GHEVERHAN_ALLOW_VPS_READ_ONLY=1` only in the reviewed one-shot operations container. Never set isolated-test flags on Production.

Both runtime URLs must target `gheverhan_runtime` at `db:5432/gheverhan`, public schema. `PREFLIGHT_LEDGER_DATABASE_URL` targets the migration owner on the same database; inject it privately only into the one-shot container. Its transaction is read-only and only queries the migration ledger. All schema and CRUD privilege checks continue through the runtime role. No migration-ledger grants are added to the application role.

Production origin must be `https://gheverhan.store`, provider `local`, and root `/data/media`. The preflight runs as UID 1000 and verifies a real directory owned by UID 1000, no group/world access, filesystem access, canonical path and a writable mount whose host root is `/opt/gheverhan/media`. It makes no media writes. The existing deploy cross-container probe separately verifies write/read persistence. Supabase requirements remain unchanged for Supabase deployments.

The official deploy script runs the full gate before switching the app. Install the reviewed script using the existing administrative access before the approved release; do not rerun bootstrap or regenerate SSH keys. Keep the deployment lock and restricted SSH forced-command protections unchanged.

The runtime preparation script grants EXECUTE only on `gheverhan_backfill_legacy_options(text)`, the SECURITY INVOKER function required by the existing product-options gate. PUBLIC remains revoked. Deploy this reviewed preparation script alongside the handler before the release; do not grant broad function execution or schema ownership.

Regression checks run with `node --test .github/tests/helipod-preflight.test.mjs` in the unit workflow. Database integration checks remain required, as do migration checksums, runtime privileges, campaign/appearance checks, backup verification and zero unresolved legacy rows. A profile match alone never establishes release readiness.
