# ADR-0005 — Local PostgreSQL and evidence-based recovery gates

Status: PROPOSED. Context: existing Prisma migrations precede full preflight and failed app startup restores the old image. This is safe only if old app remains compatible with the new schema; liveness is insufficient.

Proposal: retain PG17 as pilot target and durable local volume. Private DB network, distinct migration owner/runtime roles; review BYPASSRLS against real session/RLS invariants before reducing grants. No auto-upgrade PostgreSQL major. Migration artifact pinned to release digest and schema ledger; one local lock plus durable stage journal. Prechecks (disk including download/import/backup peak, schema compatibility, configuration, readiness prerequisites) occur before migration; runtime readiness repeated afterward. Concurrent index or interrupted Prisma migrations require tested resume/manual reconciliation, never automatic reset.

Default updates use expand-contract changes keeping previous verified app compatible. Manifest declares app/schema intervals and migration recovery class; schema-down not automatic. Incompatible migrations stop unattended rollout and require a separately reviewed recovery plan. Last working image is not itself a complete rollback strategy.

Back up PostgreSQL, media and encrypted recovery configuration consistently to seller-owned off-server encrypted storage. Key recovery separate from lost VPS, no credentials at control center. Track backup integrity and last successful isolated restore separately, agree freshness and RPO/RTO; restore drill proves orders/media/config, not merely archive listing. Never overwrite a live database in a drill. Center receives status/timestamps only.

Validation U05,U09,U11–U14 and A17–A19. Disk multiplier/minimum free bytes and recovery time are measured on representative fixtures, not guaranteed from the proposed 4GiB/40GiB baseline. Gheverhan data migration and production recovery are outside this ADR's execution scope.
