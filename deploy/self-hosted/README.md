# JetSeller Self-Hosted — M1-01 configuration contract

**Status:** opt-in application configuration only. **This is not an installer and must not be used to deploy a seller.** The live Gheverhan profile remains the default.

## Scope of this PR

- `JETSELLER_STORE_PROFILE=self-hosted` is the sole activation switch.
- The parser checks a canonical HTTPS store domain/origin, v4 installation ID and new-install-only flag.
- Each installation uses a distinct PostgreSQL database identity, runtime and migration principals, media namespace, session issuer/audience, random JWT secret and session cookie.
- The media root must exist as a real directory without symlink components; no paths such as `/etc`, `/root`, system dirs or path traversal are allowed.
- PostgreSQL must be reachable by a private Compose service name (`db` or `postgres`), not a public hostname. Unknown/unsafe connection-string parameters are rejected.
- Only local storage is permitted, no Supabase service key or Vercel environment binding is accepted.
- Initial J&T production order submission stays disabled pending seller-owned J&T integration.
- The validated output contains *no passwords, tokens or database URLs* and exception messages never print their values.
- Existing Gheverhan auth/origin/storage behavior is unchanged when the flag is absent.

## Contract keys

See `.env.example` for the list. This file contains **only blank placeholders** and is not an install command.

The installer in later PRs will generate:

- a random RFC 4122 v4 `JETSELLER_INSTALLATION_ID`
- `STORAGE_APP_NAME`, `AUTH_COOKIE_NAME`, and database name from the install ID
- independent runtime/migration database credentials and private DSNs
- a unique 32-byte random hexadecimal `JWT_SECRET`
- a durable private `STORAGE_LOCAL_ROOT` volume mounted before application startup
- verified HTTPS domain and matching `PASSWORD_RESET_BASE_URL`

`APP_ORIGIN` and `JETSELLER_STORE_DOMAIN` must match. `DIRECT_URL` and `DATABASE_URL` must refer to the same install-specific database through separate principals. Runtime does not create an admin account automatically.

## Tests and safety

Run from `frontend/`: `npm run typecheck`, `npm test`, `npm run lint` and `npm run build`. Unit coverage includes malformed configuration, domain mismatch, absolute root/path attacks, symlinks, private DB isolation and absence of secret values in parsed output.

No production migration, DNS change, seller registration page, SSH access, Go agent, signed artifact or deployment takes place here. A **separate reviewed CI/autodeploy boundary is mandatory before merging frontend changes into main** because current `helipod-autodeploy.yml` triggers on `frontend/**`. Never set the opt-in flag on production Gheverhan.

The follow-up M1-02 adds a separately built immutable Docker image, private Compose PostgreSQL, durable media, Caddy templates and an explicit prestart validator. M1-03 adds independent readiness checks; M1-04 adds disposable Ubuntu recovery evidence. Verified bootstrap and install-time signature enforcement remain security gates before any seller installation.

Authoritative design: `docs/self-hosted/PRD.md`, `docs/self-hosted/adr/`, and `docs/self-hosted/m1-pr-plan.md`.
