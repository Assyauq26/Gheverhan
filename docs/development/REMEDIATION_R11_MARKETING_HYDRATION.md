# Remediation R11 — deterministic Marketing SSR/hydration

## Verified static-code issue
`MarketingManager` (a client component rendered during Next.js SSR) used
`Date.now()` during render for voucher and scheduled-flash labels, and formatted
persisted UTC timestamps with `toLocaleString("id-ID")` without an explicit time zone.
Server and browser can therefore generate different initial HTML when clocks or
time zones differ. This is an independent hydration risk; it is **not proof**
that R11 caused the intermittent admin products navigation/hydration failure in
PRs #42–#45.

## Implementation
- Supply `asOfMs` from the authenticated Marketing server page into the client
  component; initialize display clock state with that serializable server value.
- Update display time only in `useEffect` after hydration, and once a minute
  while the dashboard is open. Server actions remain authoritative for actual
  voucher/flash sale eligibility and server-side price calculations.
- Render all displayed promotion timestamps in unambiguous **WIB (UTC+07)**
  using an ISO-based formatter so Node and browser do not depend on host time zones.
- Keep the user's `datetime-local` edit controls in local device time; their
  values are converted to ISO instants before server action submission.
- Pure regression tests cover midnight in Jakarta and promotion time boundaries.

## Constraints
This does not change the voucher quota, flash-sale price calculation, server
validation, database schema, migration, Supabase shared-development exception,
or Vercel environment settings. Requires review, typecheck, full isolated
PostgreSQL/Chromium CI, and preferably manual authenticated Marketing smoke testing
before merge. Existing separate diagnostics PR #43 still tracks intermittent
pagination and React hydration #418.
