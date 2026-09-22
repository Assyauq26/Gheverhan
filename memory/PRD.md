# Gheverhan — PRD & Build Log

## Problem statement
Production-oriented, mobile-first monochrome fashion e-commerce ("Gheverhan") built as ONE
full-stack Next.js App Router application with PostgreSQL + Prisma + TypeScript + Tailwind +
shadcn-style UI + Zod, per Gheverhan PRD v1.6. Storefront + Admin in one app, provider-agnostic
payment/shipping, server-authoritative business logic.

## Stack (locked — see docs/architecture/adr/0001)
Next.js 14 (App Router) · React 18 · TypeScript · PostgreSQL 15 · Prisma 5 · Tailwind · Zod ·
Vitest · Playwright. Thin FastAPI proxy (port 8001 → Next 3000) is infra glue only.

## User personas
- Customer: browses, searches, wishlists, carts, checks out, transfers manually, uploads proof, tracks orders.
- Admin/roles (Super Admin, Admin, Manager, CS, Warehouse, Marketing, Finance): manage catalog,
  orders, verify payments, assign manual shipping.

## Implemented (2026-09-22)
- Full normalized Prisma schema (users/RBAC, catalog, inventory, cart/wishlist, orders, payments,
  shipments, reviews/QnA, promotions, notifications, audit) + migration + Indonesian seed data.
- Server-side JWT session auth (HTTP-only cookie), register/login/logout/forgot/reset, RBAC.
- Storefront: home, shop, search, category, brand, product detail (gallery, variants, reviews, Q&A,
  related, share), wishlist, cart (server-priced), checkout, payment instruction + proof upload,
  order history, order detail with tracking timeline, account. Floating pill bottom nav + header.
- Manual payment MVP: bank accounts, proof upload to private object storage, admin verification
  (approve/reject with reason, idempotent, transactional, audited, inventory sale commit).
- Manual shipping MVP: admin assigns courier/service/cost/resi/status; customer tracking timeline.
- Admin panel: dashboard, products, orders (state transitions), payments verification, shipping,
  bank accounts, customers, audit log.
- Provider adapters: Manual active; Midtrans/Tripay/J&T/KiriminAja stubbed behind contracts.
- API: /api/v1 route handlers for auth, products, cart, checkout, orders, payments, admin,
  webhooks (idempotent/verify-ready stubs). SEO metadata + JSON-LD on product.
- Tests: Vitest unit (order/payment state machines, money) + Playwright e2e specs.

## Backlog / next
- P1: Live coupon preview in checkout; product CRUD forms in admin; inventory adjust UI.

## Security audit (2026-09-22) — remediated & verified (iteration_2, 18/18)
- SEC-001 (HIGH) FIXED: shipping cost is now recalculated server-side from the trusted rate table
  in checkout.service.ts (resolveShippingCost) for both preview & order creation; client value ignored.
- SEC-002 (MEDIUM) FIXED: payment-proof viewer takes a PaymentConfirmation id (not a raw storage path);
  path traversal / arbitrary object read closed.
- Hardening FIXED: open-redirect allowlist on login; JWT pinned to HS256 + iss/aud + fail-closed secret;
  JSON-LD output escaped. Remaining P3s: auth rate limiting, session revocation on password reset.
- P1: OTP + WhatsApp + Google auth once credentials provided.
- P2: Notify-me persistence; recently-viewed on PDP; pagination controls on listings.
- P2: Enable Midtrans/Tripay/J&T/KiriminAja adapters with real credentials + webhook signature verify.
