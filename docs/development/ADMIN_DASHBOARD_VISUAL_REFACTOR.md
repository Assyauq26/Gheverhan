# Gheverhan admin dashboard — desktop/mobile visual refactor

## Scope (frontend only)
Implements the two owner-supplied screenshot references with a black/white minimal seller dashboard, white desktop sidebar, searchable top header, mobile welcome hero with compact shop controls, 2×2 mobile KPI cards, four-column desktop KPIs, chart surface, quick actions, inventory composition, recent orders, and five-slot fixed mobile bottom navigation.

The hero photo is a compressed crop of the owner's supplied reference artwork and is bundled locally at `frontend/public/images/dashboard-fashion-rack.webp`, with no third-party network or image CDN dependency.

### Existing behaviors explicitly preserved
- `getSellerDashboard(user)` remains the only dashboard data service. No API, Prisma, authorization, schema, migration, payment, stock or other business logic modified.
- KPI `data-testid` selectors `dashboard-products`, `dashboard-stock`, `dashboard-orders`, `dashboard-sales` remain.
- The same admin navigation destinations and actual RBAC permission rules are preserved. Mobile `Lainnya` reveals existing less-frequent routes; no invented Reports or Settings destinations.
- The all-time selection is descriptive, not a fake time-filter; per-period filtering requires a separately approved backend project.
- Notifications are icon/status indicators without misleading unread counts or invented notification actions.
- Latest orders show the data the service actually exposes: ID, buyer, status, total. No invented order images/dates.
- Product bestseller ranking and historical daily sales are **not available** in the existing backend. Their visually matched card regions explicitly say that data is unavailable rather than showing fabricated revenue data.
- Inventory chart reflects only actual available and reserved aggregate counts.

### Visual acceptance checks
- 390px: no horizontal overflow; banner copy legible; 2×2 KPI; mobile sales, quick actions, orders and fixed accessible bottom bar.
- 768px: balanced responsive spacing and persistent accessible navigation.
- 1360px: white 238px sidebar; search, shop and account topbar; banner; 4 KPI cards; 2-column analytics; bottom rows.
- Keep 44px minimum touch targets, readable text and keyboard focus.
- Run unit/security, TypeScript, ESLint, build, isolated database/browser regression; do not waive preexisting hydration #418 failures.
- Capture 390px/1360px screenshots and compare with reference before promoting from Draft PR.

### Limitation on requested >=90% fidelity
Structural, typography, spacing and interaction styling follow the supplied mockup closely. The reference's daily chart series, bestseller item photos and exact order row product/date fields cannot be reproduced accurately from the current dashboard service without new backend data. Those sections deliberately use truthful empty states. A quantified >=90% pixel-match must be checked from actual rendered browser screenshots; it is not claimed based on source review.
