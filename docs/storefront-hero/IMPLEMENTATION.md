
# Banner Hero — admin-managed storefront carousel

Branch: `feat/admin-hero-banner-content`. Route: `/admin/customize/hero`.

## User flow
Admin with `store.customize.read` can inspect the draft. Holders of
`store.customize.update` may add up to 6 slides, reorder them, upload independent
desktop/mobile files (PNG/JPEG/WebP, 2 MiB), edit alt/headline/description,
internal CTA URL, alignment, tone, overlay and rotation. `Simpan Draft` does
not affect visitors. `Terbitkan` requires `store.customize.publish`, and
is disabled while the local draft is dirty.

Mobile image falls back to desktop when absent. A configured disabled banner
intentionally hides the carousel. Until first publish, the two original static
Gheverhan slides stay publicly visible.

## Storage and permissions
Separate `StoreHero` draft/published versioned JSONB from the existing
appearance color schema (no mutation to Product or Order).
`StoreHeroAsset` stores idempotent, session-bound, private uploaded assets in
the existing validated `store-branding` storage bucket, under a separate DB
record type. Server optimizes and normalizes uploads into WebP.
Only published, enabled slides are served publicly by
`/api/v1/store-hero/[id]`; staging and draft files require existing
admin permission and an authorized session. CTA URLs must pass
`safeInternalUrl`. Existing RBAC and audit-log infrastructure are reused.
Outdated unreferenced media can be cleaned through the guarded
`scripts/appearance/cleanup.ts` operator command.

## Production rollout
Do NOT merge/deploy before all CI and human review succeed.
Apply migration `20261026110000_storefront_hero_cms` via the existing
controlled Helipod pipeline, then refresh runtime role grants.
Ensure the persistent `/opt/gheverhan/media` volume is mounted and
writable by the app identity; no reconfiguration is required for the
existing local provider.
Smoke-test anonymous homepage, gallery, image access, and admin-only endpoints.
Verify staging image returns 404 to anonymous visitors, while published
assets return 200, then test mobile/desktop and cart navigation.
No existing products, customers, orders, or appearance theme settings are
modified. Publishing the first banner is a separate admin operation.

## Scope boundary
This PR implements editable Hero content for today's one-store-per-database
architecture. Future multi-tenant control-plane deployment should manage
tenant databases and app versions independently, not share this table across
sellers. Advanced schedules and history/rollback can be a future feature.
