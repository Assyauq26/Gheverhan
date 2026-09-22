# Gheverhan — Test Credentials

## Admin (Super Admin, all permissions)
- Email: `admin@gheverhan.com`
- Password: `Admin123!`
- Login at `/login`, then open `/admin`

## Customer
- Email: `budi@example.com`
- Password: `Customer123!`
- Phone login also works: `08123456789`

## Notes
- Auth uses server-side JWT sessions stored in an HTTP-only cookie (`gh_session`).
- Roles seeded: Super Admin, Admin, Manager, CS, Warehouse, Marketing, Finance, Customer.
- Coupon for testing: `GHEVER10` (10% off, min spend Rp 150.000, max Rp 50.000).
- Demo order already seeded for the customer: `GHV-DEMO-0001` (SHIPPED/PAID).

## Key endpoints (all under /api/v1, also reachable via the storefront UI server actions)
- POST /api/v1/auth/login | register | logout, GET /api/v1/auth/me
- GET /api/v1/products, GET /api/v1/products/[slug]
- POST /api/v1/cart/items, PATCH/DELETE /api/v1/cart/items/[id]
- POST /api/v1/checkout/preview, GET/POST /api/v1/orders, GET /api/v1/orders/[id]
- POST /api/v1/payments/confirm (multipart: proof file)
- POST /api/v1/admin/payments/[id]/approve | reject
- POST /api/v1/admin/shipments
- GET  /api/v1/admin/payments/proof?path=... (private, admin only)
