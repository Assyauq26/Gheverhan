# JetSeller Self-Hosted — M1-01 configuration contract

**Status:** opt-in application configuration only. **This is not an installer and must not be used to deploy a seller.** The live Gheverhan profile remains the default.

## Scope of this PR

- `JETSELLER_STORE_PROFILE=self-hosted` is the sole activation switch.
- The parser checks a canonical HTTPS store domain/origin, v4 installation ID and new-install-only flag.
- Each installation uses a distinct PostgreSQL database identity, runtime and migration principals, media namespace, session issuer/audience, random JWT secret and session cookie.
- The media root is checked when local storage is initialized: it must exist as a real directory without symlink components; no paths such as `/etc`, `/root`, system dirs or path traversal are allowed.
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

The follow-up M1-02 must add a separately built immutable Docker image, private Compose PostgreSQL, durable media, Caddy templates and an explicit **Node-only prestart validator**, so malformed standalone configuration is rejected before Next serves traffic. The generic Next instrumentation hook was intentionally not added because existing multi-target bundling requires a separate compatibility review. M1-03 adds independent readiness checks; M1-04 adds disposable Ubuntu recovery evidence. Verified bootstrap and install-time signature enforcement remain security gates before any seller installation.

Authoritative design: `docs/self-hosted/PRD.md`, `docs/self-hosted/adr/`, and `docs/self-hosted/m1-pr-plan.md`.


## M1-02 disposable packaging (implementation, not seller release)

This branch adds digest-pinned linux/amd64 Node22, PG17 and Caddy images, production/non-root runtime, separate one-shot migration image, private database network, durable DB/media/Caddy volumes and local private secret files. `images.lock.json` records Docker Registry manifest digests resolved on 2026-11-02; tags are discovery metadata only. Digests provide immutability, not signer authorization. Supply-chain approval/signing remains required before seller delivery.

Run `node --test deploy/self-hosted/tests/packaging.test.mjs`. On an authorized disposable Ubuntu24.04 runner with Docker Compose, run `bash deploy/self-hosted/tests/runtime.sh` from repo root. This builds an explicit filtered frontend context, generates synthetic unique per-install secrets and IDs, runs migrations, grants runtime permissions, exercises storefront/admin/TLS, restarts DB/app and checks persisted data/media plus every exported image layer for a synthetic secret sentinel. No real shipping/payment/email calls, live credentials, DNS changes or deployment target are used.

Only the Caddy service publishes ports. Its config must be placed on a fresh authorized host after domain ownership/DNS/ingress checks; occupied ports fail rather than replacing another service. Runtime health is liveness only until M1-03 readiness lands; neither means ready-to-sell. Fixture TLS uses an internal test CA, validates hostname and chain, and does not prove public ACME/DNS or a VPS reboot. Backup/restore is M1-04. The harness retains named volumes and stops only its own Compose project; no production cleanup or prune.

`prepare.mjs fixture` refuses existing targets, known live Gheverhan domain and mutable image names. It is a synthetic fixture generator, not a public installer or authorization to provision a seller. Generated `private/` and `.env` are never committed. Linux private configs must be owned by container UID1000 with mode0600 (Compose file secrets preserve host ownership). The app receives runtime config only; migration DSN remains exclusive to the migration job. Runtime validates a non-secret `JETSELLER_MIGRATION_IDENTITY` when DIRECT_URL is absent; full migration configuration still validates distinct actual credentials. DB bootstrap superuser and migration owner are separate from the runtime role. Runtime BYPASSRLS preserves audited server authorization invariants; it has no superuser/create-role/schema-owner privileges, and only SELECT on the migration ledger.

No workflow here deploys production or publishes images. PR139's manual production gate remains unchanged. M1-02 exit depends on observed exact-HEAD CI; no Ubuntu/VPS/signing success is implied by the presence of files.
