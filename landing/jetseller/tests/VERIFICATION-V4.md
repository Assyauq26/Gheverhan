# Precision revision V4 — 2026-11-01

## Follow-up revision on PR #127

Four requested adjustments only: transparent hero badge, black larger X Seller
(30px desktop / 24px mobile); step icons 52px / 40px and numbers 26px / 23px;
remove brand pseudo-element subtext and its reserved padding; add `waktu` to
the visible hero description. Hero PNGs, icon assets, hrefs, JS and deployment
files unchanged. The original V4 evidence below remains as historical comparison.

Re-executed integrity, existing browser interactions, and `visual-v4.cjs`: PASS.
Visual assertions cover 360, 390, 428, 768, 1024, 1440, 1920px and now check
transparent badge, black text, exact icon/number sizes, missing brand subtext,
and hero copy. Existing V4 gap remains 38px desktop / 28px mobile. No overflow,
missing images or page errors in capture results. `git diff --check`: PASS.

Latest screenshots:
- [Desktop top](evidence/v4/revision-1440-top.png) / [full page](evidence/v4/revision-1440.png)
- [Mobile top](evidence/v4/revision-390-top.png) / [full page](evidence/v4/revision-390.png)
- [Desktop steps](evidence/v4/revision-1440-steps.png) / [mobile steps](evidence/v4/revision-390-steps.png)
- [Measurements](evidence/v4/revision.json)

Only `index.html`, `refactor.css`, `visual-v4.cjs`, this report and new revision
evidence changed in this follow-up. No merge or deploy performed.

Baseline: clean `origin/main` at `4e7af7e77407a420241b1492daf30bc6b3175437`.
Branch: `fix/jetseller-landing-visual-v4`.

## Scope

Only homepage HTML, scoped `refactor.css`, supplied/official image assets and
landing tests/evidence changed. The obsolete HTML/CSS device scene was removed.
Main stylesheet, JS, other pages, backend, deployment scripts/workflows and VPS
configuration are unchanged. No merge or production deployment performed.

- Hero grid: radial mask fades all four edges; 36px cells preserved.
- Eyebrow: Cara Buat Toko di JetSeller. Only the adjoining sections' padding changed.
- Daftar/Live: official Lucide user-round-plus/rocket assets; middle icon retained.
- CTA: white grid with vertical fade on the existing red background. Mobile footer centered.
- Hero: original landscape/portrait PNGs, byte-for-byte, RGBA, switched at 768px using picture.
- Badge: official J&T logo plus separate X Seller text. Owner confirmed permission.
  Source and license notices: [asset provenance](../assets/img/PROVENANCE.md).

## Measured spacing

Measured with bounding rectangles from benefit card group's bottom edge to the
Cara Kerja eyebrow's top edge, reduced motion enabled, same local server/browser.

| Viewport | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| 1440px | 153px | 38px | 75.16% |
| 390px | 113px | 28px | 75.22% |

Raw measurements: [before](evidence/v4/before.json), [after](evidence/v4/after.json).

## Executed QA

- `node landing/jetseller/tests/refactor.test.cjs`: PASS. Only obsolete mockup assertions replaced.
- `node landing/jetseller/tests/browser.cjs`: PASS at 1440, 1280, 1024, 768, 428, 390, 360.
  Existing navigation, Escape, FAQ, CTA destination, routes and reduced-motion checks retained.
- `node landing/jetseller/tests/visual-v4.cjs`: PASS at 360, 390, 428, 768, 1024, 1440, 1920.
  Checks currentSrc, loaded images, overflow, masks, spacing, label, heading, icons and badge.
- HTML comparison against baseline with just replaced hero/badge/icons and allowed label
  normalized: PASS; remaining copy, metadata and hrefs identical.
- `git diff --check`: PASS.
- Local Playwright ran headless Chromium build 1243 via an external executable override;
  test code itself has no workstation-specific path.
- Impeccable detector executed once. Existing contrast/font/shadow advisories and
  requested grid pattern advisories were recorded; no unrelated redesign applied.

## Visual evidence

| | Before | After |
| --- | --- | --- |
| Desktop full page | [1440](evidence/v4/before-1440.png) | [1440](evidence/v4/after-1440.png) |
| Mobile full page | [390](evidence/v4/before-390.png) | [390](evidence/v4/after-390.png) |
| Desktop hero | [before](evidence/v4/before-1440-hero.png) | [after](evidence/v4/after-1440-hero.png) |
| Mobile hero | [before](evidence/v4/before-390-hero.png) | [after](evidence/v4/after-390-hero.png) |
| Mobile steps | [before](evidence/v4/before-390-steps.png) | [after](evidence/v4/after-390-steps.png) |
| Mobile CTA | [before](evidence/v4/before-390-cta.png) | [after](evidence/v4/after-390-cta.png) |
| Mobile footer | [before](evidence/v4/before-390-footer.png) | [after](evidence/v4/after-390-footer.png) |

Desktop steps/CTA/footer detail crops are also retained in `evidence/v4/`.
Screenshots were rendered from repository code; baseline screenshots were not
provided among the two attached images. Source PNGs remain unoptimized originals
(about 2.06 MB desktop and 1.83 MB mobile); only the selected picture source loads.
Future rollout needs a separate review of the existing pinned asset manifest;
deployment files were intentionally left outside this PR's scope.
