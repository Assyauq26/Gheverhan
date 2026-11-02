# M1-03 — Local runtime readiness

Status: IMPLEMENTED_PENDING_CI. Scope: opt-in self-hosted runtime; no production deployment or schema migration. Requirements: NFR-02/04/05, A18 partial, U11 prerequisite.

`GET /api/v1/health` retains its existing liveness response without database, storage, J&T, payment or center calls. `GET /api/v1/ready` is a separate Node runtime endpoint: 404 on the legacy profile; 200 only after valid self-hosted configuration plus local database/schema/media probes; otherwise generic 503 with Retry-After. Every result is no-store and reveals no dependency names, paths, credentials or raw errors. Maintenance middleware continues returning 503 for readiness while preserving liveness. Runtime readiness does not mean TLS verification, administrator onboarding or Store Ready to Sell.

## Database and schema

A dedicated Prisma client disables query/error logging, limits its pool to one connection, sets 1-second connect/pool wait, and uses a read-only transaction with 500ms lock wait, 1-second statement timeout, 500ms acquisition wait and 1500ms transaction deadline. It validates current database/runtime role identity, required core table presence and the completed migration ledger against packaged migration files and their LF/CRLF checksum variants. Missing, unfinished, duplicated, unknown or modified migrations fail closed; explicitly rolled-back attempts are ignored. It reads no customer rows and runs no migration/seed or provider call. Packaging must include `prisma/migrations` and grant the runtime principal SELECT on `_prisma_migrations`, without providing migration credentials.

## Media mount

The Ubuntu/Linux probe walks directories via opened descriptor paths and O_DIRECTORY/O_NOFOLLOW, refusing symlinks or absent roots. It requires the private regular file `.jetseller-installation-id` containing the exact installation UUID followed by a newline, with no group/world permissions. Initialization creates that marker; readiness never creates a missing mount or marker. It then exclusively creates a random private sentinel through the anchored directory descriptor, writes/reads/syncs it and removes only that sentinel. Root directory permission checks reject visibly read-only mounts even under a privileged fixture; the actual open/write additionally enforces effective filesystem/ACL behavior. No product/media object is read or changed. Wrong/missing volume identity fails closed. This is an installation marker check, not hardware attestation or proof against an administrator who controls the host.

## Load and timeout behavior

Each worker has at most one active dependency probe and a two-second status cache. The HTTP result times out after 2500ms and signals cancellation. The concurrency slot is retained until all underlying operations settle, so a broken mount cannot cause unbounded background probes. Database server-side limits also bound SQL work; Node cannot forcibly cancel every filesystem syscall. A hung filesystem can keep readiness unavailable until host recovery, while liveness remains independent. Credential/config changes invalidate cached success.

## Verification and limits

Targeted unit tests cover profile/config failure, generic redaction, unavailable database/storage, timeout/cancellation, concurrency under hung/failed dependencies, cache/credential rotation, exact migration compatibility and route/liveness semantics. Linux-only tests exercise real sentinel cleanup, missing/read-only/symlinked storage, volume identity and cancellation. Linux tests are skipped on Windows and must execute in Linux CI. Actual PostgreSQL disconnect/schema fixtures and container/browser/Ubuntu reboot evidence remain integration gates; no claim of them passing is made by unit tests.

Rollback: revert this endpoint/modules and its opt-in health consumer; existing liveness and business behavior are unchanged. No schema or data rollback is needed. Do not use readiness success to enable checkout, production J&T or fleet rollout.
