# Gheverhan on Helipod VPS

Runtime: Next.js + PostgreSQL 17 + private filesystem media + Caddy. Resend remains external.

Build the image outside the 2 GB VPS: docker build -t IMAGE -f frontend/Dockerfile frontend
Use an immutable tested image tag or digest for GHEVERHAN_IMAGE.

On the VPS, place compose.yml, Caddyfile and a populated .env in /opt/gheverhan/deploy.
Keep .env mode 600. Create /opt/gheverhan/media owned by UID 1000, mode 700.
POSTGRES_PASSWORD must be URL-safe hexadecimal. JWT_SECRET and CRON_SECRET must be strong random secrets.
Never publish database port 5432 or serve the media volume as a static directory: application routes enforce access.
VPS integration settings do not automatically inject environment values into a standalone Docker container.

Start db first. Restore the approved database dump and migrate with the same source and migration files as the image.
Keep the existing _prisma_migrations ledger when restoring. Do not run seed or migrate reset.
Run Prisma tooling in the build image (the runtime image prunes dev dependencies).
Run app privately, verify health, login, OTP, products, uploads, cart and checkout before proxy/domain cutover.
Copy all storage objects preserving their exact application-relative keys. Database restore alone does not copy files.
Existing Supabase storage remains default on Vercel; explicitly select STORAGE_PROVIDER=local on the VPS.

The Compose database owner is reserved for migrations. Before a public launch, configure a separate restricted
runtime role, with privileges on application tables only and no direct network exposure. Run prepare-runtime.py after migrations to create the trusted server role. It has table-level CRUD grants,
no schema creation or migration-ledger access, and BYPASSRLS to preserve the existing server-side
application authorization and session-revocation checks. PostgreSQL remains on the private Docker network.
RLS stays enabled for all application tables.

Do not activate the proxy until DNS/HTTPS cutover is authorized and the VPS checks pass.

Set APP_ORIGIN=https://gheverhan.store for the VPS. Browser mutation checks use this configured origin
instead of Next.js's internal bind address; forwarded headers never expand the allowed origin.
The Caddyfile redirects www to the canonical apex domain.

After cutover, install the included expired-order service and timer in /etc/systemd/system, reload
systemd and enable gheverhan-expire-orders.timer. Its 02:00 UTC schedule matches the existing Vercel cron.
The runner reads the secret only from the application's environment and fails on non-success responses.
Do not enable the timer on a migration candidate until the production cutover is complete.
