# Remediation R10 — Admin product pagination navigation consistency

## Reproduction evidence (2026-10-16)
The isolated Chromium navigation suite intermittently fails at 1360px while
clicking "Berikutnya" on admin products: expected "Halaman 2 dari 2" but
the UI still displays "Halaman 1 dari 2" after 15 seconds. Its mobile run
can pass in the same execution.

The admin products page used **raw `next/link`** for previous/next links,
whereas the rest of its links, the filter form, and the inventory pagination
use Gheverhan's shared `NavigationLink` / `NavigationProvider`. Mixing
navigation paths is a plausible contributor to inconsistent transition
feedback; this is an isolated targeted remediation, **not proven root cause**.

## Change
- Use the same shared `Link` component for both admin products pagination links.
- Keep href, query parameters, disabled/visible states, and keyboard-accessible
  anchors unchanged.
- Preserve `prefetch={false}` to avoid extra filtered RSC requests.
- Assert the shared navigation pending indicator appears while switching to
  page 2 under the existing CI-injected 600 ms RSC delay.

## Acceptance
- Both viewport widths pass repeated real Chromium navigation with no
  exceptions, including hydration error #418.
- The filtered query and page number persist across forward/back navigation.
- Other Next.js pages, inventory, checkout and the public storefront remain
  unchanged.
- Main stays unchanged until full CI and review pass; see hydration diagnostic
  PR #43 for a different possible streaming-related issue.
