# Rollback and operating gates

This task does not deploy, merge, migrate Production or change its theme.

## Before any separately authorized release

1. Review Draft PR and CI, compare mobile/desktop evidence, finish physical-device/touch/screen-reader QA.
2. Run existing protected release/database preflight with the normal operator process; do not copy Production bindings into tests.
3. Back up the database and existing media volume using the established runbook. Confirm trusted runtime CRUD grants for new tables and no public RLS policies.
4. Apply only the additive migration through the existing migration gate after separate release approval. The SQL uses a3s lock timeout; investigate blockers and retry normally. Never mark a failed migration applied without the official recovery drill.
5. Local storage uses the existing volume. If the actual installation selects Supabase instead, separately provision/verify a private branding bucket and its `SUPABASE_STORE_BRANDING_BUCKET` mapping before enabling logo uploads. No account or bucket was created remotely by this task.
6. Leave legacy published. Opening the editor or saving draft does not opt customers into a preset.

## Appearance rollback

Open Customize → Riwayat, select the intended revision and confirm Rollback. The server checks publish permission and both expected versions, publishes a new immutable revision, writes audit and invalidates cache. Draft remains intact. Revision0 restores the original compatibility appearance. Verify initial HTML, mobile navigation/cart badge, PDP and checkout afterward.

On a conflict, reload the latest draft/versions; do not force-overwrite another administrator's work.

## Application rollback

Redeploy the previous reviewed application artifact using the existing, separately authorized release process. Keep the new tables/migration ledger and media intact; old code ignores them. **Do not drop tables or delete historical assets** as part of rollback. No transaction-domain data migration is needed.

## Maintenance

Cleanup is bounded to100 expired candidates per run, checks all references under the appearance lock and removes expired rate buckets. It never deletes referenced revision assets. A failed storage delete leaves a retryable database row.

For an authorized disposable environment, run from `frontend/`:

```sh
node --conditions=react-server --import tsx scripts/appearance/preflight.ts
node --conditions=react-server --import tsx scripts/appearance/cleanup.ts
```

These scripts use the repo's database-operation guard. They do not grant Production access. Scheduling maintenance on the VPS is a separate operator/release action; no cron or deployment was installed here.

Monitor failed publish/save audit events, 409 conflicts,429 limits, logo read failures, expired unreferenced asset backlog and new revisions. Audit records contain IDs/versions/status/size only, never raw theme content, credentials or session tokens.
