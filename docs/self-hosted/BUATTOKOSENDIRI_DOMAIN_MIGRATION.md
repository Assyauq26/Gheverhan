# Buat Toko Online Sendiri — domain migration — buattokosendiri.web.id

**Status: REVIEW ONLY.** This document and the Caddy draft are NOT deployed. Do not merge to main or apply production VPS config without a scoped release approval, verified backup/rollback, health checks, and a separate portal deployment plan.

**Owner-reported state, 4 November 2026:** apex HTTPS 200, www 301 to apex, legacy sites 200, Let’s Encrypt certificates issued. This session did not independently probe production. Do not repeat DNS/Caddy/certificate configuration unnecessarily.

## Desired URL mapping

| Service | Old | New | Server and readiness |
| --- | --- | --- | --- |
| Public landing | `https://jetseller.web.id/` | `https://buattokosendiri.web.id/` | Domainesia A to 43.173.21.197 (currently shares Gheverhan production); static landing only |
| Public www | `https://www.jetseller.web.id/` | `https://www.buattokosendiri.web.id/` | CNAME to new apex; redirect only after HTTPS verified |
| Seller portal/control API | Historical `dashboard.jetseller.web.id`, while Go CLI default was old apex | `https://dashboard.buattokosendiri.web.id/` | New DNS A currently shows 43.173.21.197, but no verified portal service/routing; DO NOT treat DNS as portal readiness |
| Staging | `staging.jetseller.web.id` | `staging.buattokosendiri.web.id` | Domainesia A to 43.173.41.24; requires independent Caddy/TLS staging vhost |
| Seller storefront | Seller-owned domain | **Unchanged** | Each seller still uses their own VPS, domain, PostgreSQL, media and `/admin` path |

**Final identity decision (4 November 2026): Buat Toko Online Sendiri.** The previous brand is retired. Technical identifiers remain compatible; this does not convert self-hosted architecture into wildcard tenant hosting. See `../rebranding-buattokosendiri/README.md` for the current release plan and evidence.

## Step-by-step gated cutover

1. **DNS preflight (read-only).** Confirm `Save Changes` was applied and the new zone is authoritative. Check all four records from at least two resolvers. Recheck AAAA/CAA/NS conflicts and existing mail MX/TXT if the new domain will send/receive mail. DNS answers alone are not web/TLS readiness:
   ```powershell
   nslookup buattokosendiri.web.id 1.1.1.1
   nslookup dashboard.buattokosendiri.web.id 1.1.1.1
   nslookup staging.buattokosendiri.web.id 1.1.1.1
   nslookup www.buattokosendiri.web.id 1.1.1.1
   ```
2. **Public landing staging.** Use a separately approved backup-first process to install the new Caddy vhost WITHOUT deleting Gheverhan or altering its reverse_proxy. Confirm Caddy `/data` mount from a fresh `docker inspect`, validate config, test HTTPS certificate chain + public HTTP status/content/redirects at both apex and www. Keep existing `jetseller.web.id` service during verification. Current `landing/jetseller/deploy/Caddyfile.jetseller.DRAFT` describes the **future complete cutover**, and must not be applied wholesale until the old origin is cleared.
3. **Dedicated seller portal.** Deploy `platform/installer` and `platform/installer-web` with a **real dedicated control PostgreSQL**, a configured OIDC provider with verified email (or reviewed equivalent), private runtime config, TLS reverse proxy, provider callback and secure cookies. The actual canonical portal `controlOrigin`, OIDC `redirectUri` (`https://dashboard.buattokosendiri.web.id/auth/callback`), pinned identity provider JWKS and agent audience/origin must align. A bare A record is insufficient. **Do not reuse Gheverhan storefront login or database.**
4. **Agent migration.** New Go CLI default is `https://dashboard.buattokosendiri.web.id`, but already paired agents may still have cached old URLs/audiences. Preserve existing sessions and agent identity until an explicitly tested re-pair/renewal/redirect strategy exists. Never forward device-bound credentials across origins or reinterpret JWT audience.
5. **Staging domain.** Add `staging.buattokosendiri.web.id` TLS vhost on **43.173.41.24** only after confirming ownership/access and current staging services. Existing staging app data must not be reset.
6. **Legacy redirect, final phase only.** Once new landing, portal, auth callback, installer and active clients have all passed checks, redirect old landing apex/www to new landing with 301/308. API/portal/auth traffic must have a deliberate versioned compatibility strategy; do not blindly redirect POSTs or bearer/DPoP requests. Preserve SSL on the old domain during transition. Do not remove `jetseller.web.id` DNS yet.
7. **Rollback and monitoring.** Keep dated backup of exact active Caddyfile and landing assets, verify Gheverhan `/api/v1/health` unchanged, have an atomic restore path for landing+Caddy and monitor all hosts. No automatic changes to GitHub secrets, real VPS, DNS or live integrations from this PR.

## Source changes in this PR

- Change platform landing canonical + Open Graph URLs and 404 references to new apex.
- Change default Go setup CLI control origin to dedicated new `dashboard` HTTPS host.
- Update Caddy **draft** to new static apex/www and preserved legacy apex/www hosting; explicitly leaves the dashboard route absent pending real portal deployment.
- Test static metadata, legacy-origin preservation and installer origin. Keep historical audit reports and old release-script rollback test fixtures unchanged as evidence.

## Public release acceptance

- [ ] Authoritative and public DNS resolvers agree for apex, www, dashboard, staging.
- [ ] New apex/www HTTPS certificate + content/redirects pass independently.
- [ ] Dedicated portal OIDC registration, verification, session/CSRF and callback verified on new control origin.
- [ ] Agent identity/issuer migration and real signed installer distribution are proven on dedicated disposable VPS.
- [ ] Fresh seller account -> server pairing -> locally installed storefront/admin -> uploaded and published catalog E2E pass.
- [ ] Gheverhan live health remains green and no DB/payment/J&T production checkout gate changes.
- [ ] Old domain redirects only after new domain works, with rollback available.

**Domain migration does not mean automated seller onboarding is ready.** That has its own release gates in `docs/self-hosted/MVP_PUBLIC_AUTO_STORE_LAUNCH.md`.
