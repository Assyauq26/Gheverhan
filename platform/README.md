# JetSeller foundation (isolated, not deployed)

Read `docs/jetseller/ARCHITECTURE.md` before connecting anything to Production.

This PR adds only a separate control-plane schema and deny-by-default host/identity policy primitives. No routes, session issuance, database provisioning, secrets broker, tenant client pool or legacy cutover are implemented. Platform identities passed to these primitives must originate from a future verified control-plane session service. Do not pass client-controlled claims.

`node --test platform/tests/*.test.mjs` runs dependency-free policy tests. Validate `platform/prisma/schema.prisma` with the repository's locked Prisma 5.22 CLI and an explicit `PLATFORM_DATABASE_URL` for a disposable local database. This schema has its own generated client output; never generate over the storefront Prisma client. No fallback to `DATABASE_URL` exists.

The existing storefront schema, CI deployment triggers and Production runtime remain unchanged. A separate reviewed control-plane migration and real two-tenant integration suite must precede live use. No Production credentials belong in this directory. Database secret references are identifiers to a future server-side vault, not DSNs.
