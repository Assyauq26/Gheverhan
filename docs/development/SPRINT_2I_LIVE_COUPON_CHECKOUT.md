# Sprint 2I — Live Coupon & Trusted Checkout Quote

**Baseline:** `main` after PR #31 (`95e49808c9492f40fc6f3c3e959cb4d9cb09f918`).
**Status:** candidate on feature branch, no production merge/deployment authorized by this sprint.
**Scope:** complete the remaining P1 live coupon preview entry in `memory/PRD.md`. No payment/shipping carrier integration, Prisma schema changes, new secrets or production data operations.

## Customer workflow

1. A signed-in customer opens checkout. The app immediately requests a server-priced quote using the currently selected manual shipping rate.
2. Coupon entry is normalized to uppercase without whitespace and debounced (350 ms). The customer sees whether the code applies, the discount in rupiah, and the resulting order total.
3. Choosing a different shipping method refreshes the quote. Outdated request results are canceled/ignored and cannot overwrite the currently selected coupon/kurir totals.
4. The submit button is unavailable while a quote is missing, pending, failed, or materially different from the checkout's initially confirmed subtotal/selected rate. Errors provide a retry or reload path; coupon invalidity alone does not block checkout, but is disclosed.
5. The actual `createOrder` service still recomputes authoritative prices, coupons, rates, stock and bank status inside its existing transaction with its idempotency and price-confirmation guards. Browser quotes are informational, never price authority.

## Server safety boundaries

- Existing authenticated POST `/api/v1/checkout/preview` reuses `previewCheckout` and `computeDiscount`; the user identity comes from the current session, not the browser payload.
- The client-supplied shipping cost is ignored by `resolveShippingCost`. The client never submits the preview total as a trusted field for order creation.
- Coupon code and shipping choice are length-bounded in preview input validation; no new coupon creation/administration functionality.
- Preview is read-only and does not reserve inventory, create an order or consume a coupon.
- No real payment, courier pickup, production order or Supabase production write is performed.

## Acceptance and checks

- Valid 10% coupon against synthetic Rp190.000 cart: discount Rp19.000; JNE REG shipping Rp20.000 -> total Rp191.000; J&T EZ Rp22.000 -> total Rp193.000.
- Invalid coupon shows a reason, removes discount, and returns full server-priced total.
- API ignores fraudulent browser shipping cost (e.g. Rp0); anonymous API callers receive HTTP 401.
- Repricing updates desktop/mobile summary without horizontal overflow.
- Existing checkout stale-price rejection stays intact, preventing orders against unconfirmed catalog edits.
- `npm test`, containment, TypeScript/lint/build, isolated PostgreSQL suites, and Chromium regression must pass on the exact PR head before approval.

## Release gate

Do **not** merge into `main` or deploy to Vercel production without maintainer review and explicit approval. CI works on isolated disposable PostgreSQL and browser fixtures only. A production READY badge proves the build, not successful live payment/coupon behavior. No live transaction canary is authorized by this change.
