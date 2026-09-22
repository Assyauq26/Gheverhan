# ADR-0001: Full-Stack Next.js Modular Monolith

Date: 2026-09-22
Status: Accepted

## Decision
Gheverhan is built as ONE full-stack Next.js (App Router) application with PostgreSQL + Prisma.
Storefront and Admin are separate route/layout boundaries within the same app. Business logic
lives in `src/modules/*` application services; database access is behind repositories/services;
payment and shipping vendors sit behind provider adapters in `src/infrastructure/*`.

No Laravel / Inertia / Vue / separate Express or FastAPI backend / MongoDB / Firebase.

## Platform integration note
The Emergent platform ingress routes external `/api/*` traffic to a service on port 8001 and all
other traffic to port 3000. Next.js serves the whole app (pages, Server Actions, and `/api/v1`
route handlers) on port 3000. A thin FastAPI reverse proxy at `/app/backend/server.py` (port 8001)
forwards `/api/*` to Next.js on `localhost:3000` so the documented `/api/v1` surface and webhooks
remain reachable. The proxy contains no business logic.

PostgreSQL 15 runs under supervisor with its data directory in `/app/.postgres` (the only
persisted path besides `/root`).

## MVP scope
- Payment: Manual Bank Transfer (`ManualTransferProvider`). Midtrans/Tripay adapters are stubbed & disabled.
- Shipping: Manual (`ManualShippingProvider`). J&T/KiriminAja adapters are stubbed & disabled.
- Auth: Email/Phone + Password (server-side sessions). WhatsApp/Google/OTP are UI-ready but disabled
  until credentials are configured.

## Status separation
Order, Payment, and Shipment statuses are stored in separate fields with independent state machines.
Order domain uses the detailed state list: PENDING_PAYMENT, PAID, PROCESSING, PACKED, SHIPPED,
DELIVERED, COMPLETED, CANCELLED, EXPIRED, REFUNDED.
