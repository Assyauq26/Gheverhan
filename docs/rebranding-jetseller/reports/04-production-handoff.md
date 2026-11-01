# 04 — Production handoff

Verdict: NOT DEPLOYED. No merge, production DB mutation, publish, DNS, key/secret change or autodeploy enablement authorized/performed.

## Release gates

1. Owner reviews PR screenshots and exact final source SHA; all required CI, isolated DB/browser tests green. Review remaining legal/operator naming and any historical branded media.
2. Separate explicit approval for merge/release commit and production operator. Existing SSH identity was previously verified; current task does not execute deployment. HELI_POD_AUTODEPLOY observed disabled; retain it.
3. Read-only admin review of current appearance required: record draftVersion/publishedVersion/revision and logo asset IDs, export draft/published/history securely. Read-only snapshot: draftVersion 18, publishedVersion 14, both names Jetseller; published tagline Better Outfits, Brighter Days.; text logo without asset; primary #111111/background #FFFFFF; 15 revisions/latest 14. These versions are observational only: reload current versions before any later command.
4. Backup current app image/tag and source release manifest, DB per approved policy, StoreAppearance/StoreAppearanceRevision/StoreBrandAsset references and media. Verify recoverability without putting data/credentials in GitHub. Hold existing deploy lock; ensure no concurrent release.
5. Deploy approved Next image through established Helipod release path only. Keep technical gheverhan paths, image names, health app, JWT/env and both Caddy hosts. No migration/seed/reset for visual rebrand. Keep static jetseller.web.id unchanged.
6. Admin Customize → save current draft backup → select JetSeller Demo Store preset (or edit approved fields) → confirm text wordmark, identity JetSeller/tagline JetSeller Demo Store, all contrast checks, preserve desired header/toggles/custom content → preview desktop/mobile → Save Draft with current versions → Publish using existing authorized session. Reset affects full draft; do not discard customized settings without review. No SQL published update.
7. Text mode requires no uploaded asset. For image mode use existing official StoreBrandAsset upload/validation/session ownership; never fabricate an asset ID. Preserve old assets for rollback.
8. Record new publishedVersion and append-only revision; verify tag/path revalidation and PublishedVersionSync refresh in a second visitor tab. Source-only deploy is incomplete while DB still carries old identity/logo.
9. Smoke both hosts: storefront/PDP/cart/customer auth/OTP test provider/checkout safe fixtures/admin ACL/appearance; landing HTTP 200 and Lihat Demo → gheverhan.store. No customer email, real payment/order/AWB without separate permission. Monitor errors/hydration/4xx/5xx.

## Rollback

Roll back application image to recorded previous release if needed. Separately use Customize revision-history Rollback with current version guard; verify append-only revision, cached config refresh and correct asset references. Do not assume source rollback rolls back DB appearance. Retain old logo media. Verify health, storefront and landing after rollback. Document exact SHA/image, appearance versions, operator/time and LIVE_VERIFIED / BLOCKED / ROLLED_BACK.

Read-only DB evidence: [sanitized appearance summary](evidence/production-appearance-readonly.txt). Executed BEGIN READ ONLY, 5s statement timeout, two aggregate/config-only SELECTs, ROLLBACK; no customer/order/secret fields or data mutations. Existing DB branding/palette therefore needs explicit publish after an approved source release.
