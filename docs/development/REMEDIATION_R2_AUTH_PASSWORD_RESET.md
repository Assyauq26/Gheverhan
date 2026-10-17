# Remediation R2 — Auth password reset

## Purpose
Replace reset-token logging with actual server-side email delivery. Tokens are
random 256-bit values, stored in PostgreSQL only as SHA-256 digests, and consumed
atomically once. Existing plaintext reset tokens issued by the old implementation
cannot be redeemed after this rollout.

## Required production configuration BEFORE merge
- `RESEND_API_KEY` — server-side secret for a Resend account
- `PASSWORD_RESET_FROM` — verified sender address, e.g. security@yourdomain.tld
- `PASSWORD_RESET_BASE_URL` — trusted public HTTPS origin, e.g. https://gheverhan.vercel.app

Do not put the API key in `NEXT_PUBLIC_*`. Verify the sender domain and run
provider sandbox tests before promotion. Unconfigured email delivery returns an
explicit error instead of silently logging a secret reset link.

## Security and limitations
- Unknown addresses receive the same successful form response when configured.
- Maximum three email reset attempts per known account per hour. Additional
  IP/device/global rate limiting should be implemented before scale.
- A failed provider request deletes the newly generated token.
- Successful reset consumes its token and invalidates all remaining reset tokens
  for the account; **existing login JWT sessions are not yet revoked**.
- Do not run this flow against production until delivery credentials and the
  verified sender domain are set.
