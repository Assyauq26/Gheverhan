# Production release #114 — 2026-10-30

User authorizes release, official additive migration and the following explicit business outcomes. Authorization is not evidence that any Production operation occurred.

## Approved reconciliation

Read the CURRENT Production records, SKU prices, publication and stock first. Do not use stale timestamps or silently expand this mapping to other products. Archive original values through the official migration BEFORE clearing any legacy fields. Freeze pricing/Marketing writers through reconciliation and the traffic switch.

- Essential Tee (`seed_product_essential-tee`): verify the old schedule is expired; retire it without a new campaign. Preserve its legitimate regular pricing. Do not reactivate Rp99,000.
- Varsity Jacket (`seed_product_varsity-jacket`): verify base price Rp399,000 and current manual sale price Rp299,000. Retire with `retainManualPriceAsRegular: true`; this retains Rp299,000 as a regular discount in the same locked/audited transaction. No new campaign. Inspect explicit SKU prices separately; this option does not rewrite them.

The inventory CLI now includes `updatedAt`, publication status, SKU prices and stock/reservations so a reviewed mapping can use actual concurrency tokens. Do not print customer data or environment values. Supply an active authorized admin ID obtained through an approved operational path.

Mapping shape (placeholders MUST be replaced from fresh inventory, store file restricted outside Git):

```json
{
  "actorId": "CURRENT_AUTHORIZED_ADMIN_ID",
  "campaigns": [],
  "retire": [
    { "productId": "seed_product_essential-tee", "expectedUpdatedAt": "CURRENT_TEE_TIMESTAMP" },
    { "productId": "seed_product_varsity-jacket", "expectedUpdatedAt": "CURRENT_JACKET_TIMESTAMP", "retainManualPriceAsRegular": true }
  ]
}
```

Use the existing CLI `apply <restricted-mapping-file>` only with approved Production environment injection and `GHEVERHAN_FLASH_CUTOVER_APPROVED=CONVERT_LEGACY_FLASH_SALE`. Each retirement is atomic, the whole file is not; record progress and re-inventory after any failure rather than blindly retrying. Default retirement semantics are unchanged for other mappings.

## Access and execution evidence

The implementation workspace has no `~/.ssh`, no active SSH agent identity and no matching private key file found in bounded standard workspace/home/runtime locations for `gheverhan-codex-local`. An installed public key alone cannot establish access. Managed environment readiness reports no secret/file binding for that identity, and the network policy has no TCP grant to `43.173.21.197:22`. The existing deploy key is forced-command-only; it must not be reused for arbitrary SQL, backups or diagnostics. The configured `DIRECT_URL` is NOT proof of access to the local VPS database and has not been read or used for Production work.

Required setup: securely bind the existing authorized `gheverhan-codex-local` private key as a file (do not paste it in chat), provide a trusted pinned host-key binding, and grant SSH TCP access to `43.173.21.197:22`; alternatively provide an independently restricted operational executor supporting the reviewed backup/migration/cutover sequence. Do not remove forced-command restrictions, install a broad new root key or reset credentials to work around missing access.

Until setup is complete, backup verification, fresh database inventory, exact disk/free-space check, active/rollback image IDs and Production migration/cutover remain unexecuted. Do not merge: main triggers autodeploy, whose campaign preflight correctly blocks unresolved legacy records.

## Remaining release sequence

Follow [ROLLOUT.md](ROLLOUT.md): capacity and recovery checks, verified PostgreSQL backup, official migration, verify original archives, inventory and reviewed retirement, zero unresolved legacy count, regular/SKU/checkout prices and domain-count comparison, runtime grants and full preflight, exact-head green CI, merge and monitor official deployment. Verify both immutable images and local/public health, then non-destructive browser smoke. Retain backup, archives, media and rollback artifact; no volume deletion or destructive rollback.

Do not report `PRODUCTION_LIVE_SUCCESS` until the actual deployment and public smoke tests pass. Before that the release status is `PRODUCTION_RELEASE_BLOCKED`.

## Cutover patch verification

Local Node 22.23.4, disposable PostgreSQL 17 bound to loopback only:

- Official Prisma migration ledger applied successfully to the disposable database.
- `node --import tsx --test tests/integration/flash-campaign.test.ts`: 23/23 PASS (22 subtests plus parent). Added real database coverage proves authorized retention, denial without product update permission, rejection of arbitrary replacement fields/stale timestamps, archive preservation, unchanged base/stock/publication, audit metadata, and a checkout quote of Rp299,000. Scheduled/missing/invalid manual prices fail closed without mutation.
- `npm test`: 545/545 PASS, 69 files.
- `npm run lint`: PASS, existing hero-editor image warning only.
- `npm run typecheck`: PASS.
- `npm run build`: PASS on the updated source, using the disposable local database configuration.

The new option does not change the official SQL migration, default retirement behavior or customer business rules. Fresh exact-head CI is required for this patch; previous green checks for `5e781ace` are historical evidence only. The public health endpoint was HTTP 200 during this check; Helipod monitoring reported approximately 78.63% disk, 44.92% memory and 2.10% CPU. Monitoring is not an exact free-space or database integrity check. No Production backup, inventory, migration, merge or deployment was executed.
