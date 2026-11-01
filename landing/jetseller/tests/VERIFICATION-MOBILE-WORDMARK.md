# Mobile hero and JetSeller wordmark follow-up

Baseline: main `7fc68324b6c0be03388fb76d65c08ad4b19d54cc`, merged PR #127.
The last PR head `ba2337a` passed both landing UI and containment workflows.

## Changes

- Use the original 1672×941 landscape artwork at every size, without resizing or editing the source PNG. The portrait source itself cuts off the laptop; it remains in the repository but is no longer selected.
- At widths up to 768px, center the artwork 4px from each viewport edge, independently of the text gutter. Keep intrinsic aspect ratio and `object-fit: contain`.
- At 390px, old image box: 350×621.9px. New image box: 382×215.0px; edges x=4 and x=386. Desktop image sizing stays unchanged.
- Replace the abstract favicon with the red/black JetSeller text wordmark. Version its URL on all four HTML pages and provide a matching 180×180 Apple touch icon.
- Preserve PR #127's transparent J&T badge, black X Seller text, larger step icons/smaller numbers, absent brand subtitle, and `dalam waktu ±10 menit` copy.

## Validation

- Static integrity checks: PASS.
- V4 visual assertions: PASS at 320, 360, 390, 428, 600, 601, 768, 769, 900, 1024, 1440, 1920px. Check actual image bounds as well as document overflow, original image ratio, missing images, and the earlier V4 revisions.
- Existing browser interactions: PASS at 360–1440px (menu open/close/Escape, FAQ, CTA, info routes, 404 status, reduced motion).
- The CI browser suite now also asserts full hero visibility and wordmark icon links; no workflow changes.
- Both favicon formats return the expected image MIME types on all four pages.
- Visually inspected the desktop/mobile screenshots and raster icon. Browser emulation only; physical iPhone/Android devices are unavailable.
- Impeccable detector: existing typography, contrast, card and requested-grid advisories recorded; unrelated design styles retained within the requested scope.

## Evidence

- [Mobile top](evidence/mobile-wordmark/after-390-top.png) · [Full mobile](evidence/mobile-wordmark/after-390.png)
- [Desktop top](evidence/mobile-wordmark/after-1440-top.png) · [Full desktop](evidence/mobile-wordmark/after-1440.png)

## Release gates

Merge only after the current-head GitHub landing and containment workflows pass and the PR is conflict-free. Generate a static-only release pinned to the final merged SHA, covering all runtime assets including the new Apple icon; verify every SHA256 before activation and over public HTTPS afterward.

Use the existing authorized SSH identity, deployment lock, verified archive backup, staging directory and rollback trap. Preserve non-manifest files. Keep the prior assets and backup paths for manual rollback using `deploy/RELEASE-V3.md`'s locked procedure. Do not execute the old V3 pin to release this revision.

No backend/DB operations, app/proxy restart, Caddy edit, routing, business logic, JS behavior or workflow changes. Verify JetSeller root/info/404 pages, assets, mobile/desktop framing and Gheverhan storefront plus API health after activation. Deployment success must be recorded separately with exact release, backup and previous-directory paths.
