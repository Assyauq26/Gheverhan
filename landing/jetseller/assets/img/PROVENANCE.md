# JetSeller V4 assets

- `hero-desktop.png`: user-supplied `ChatGPT Image Nov 1, 2026, 03_30_21 PM-1.png`, 1672×941 RGBA; copied byte-for-byte.
- `hero-mobile.png`: user-supplied `ChatGPT Image Nov 1, 2026, 03_30_27 PM-2.png`, 941×1672 RGBA; copied byte-for-byte.
- Mobile framing follow-up: use the unchanged landscape original at every viewport. The portrait source already cuts off the laptop on its right edge; CSS cannot restore those pixels. Both original PNG files remain byte-for-byte intact.
- `favicon.svg`: JetSeller text wordmark, red Jet and black Seller, replacing the old abstract icon. Self-contained SVG text uses local sans-serif fallbacks. `apple-touch-icon.png` is its 180×180 raster export for mobile bookmarks; both icon URLs carry `v=wordmark-1` to refresh old cached artwork.
- `jnt-express.png`: official https://jet.co.id/static/images/logo.png?t=1, linked by https://jet.co.id/, retrieved 2026-11-01. J&T trademark; no public redistribution license inferred. Owner explicitly confirmed permission to use this logo for JetSeller in chat. Original white transparent artwork retained; CSS renders it in brand red on the pale badge.
- `icons/step-register.svg` and `icons/step-launch.svg`: unmodified Lucide `user-round-plus` and `rocket`, from https://github.com/lucide-icons/lucide/tree/a630cec77eac6568b989e87e4947a8bfe45caacd/icons. Commit pinned instead of a moving package version. License retained in `icons/LICENSE-lucide.txt` (ISC with inherited MIT notices). CSS colors the external icons; paths are unchanged.
