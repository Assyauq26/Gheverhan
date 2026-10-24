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


## GitHub Actions autodeploy

The `.github/workflows/helipod-autodeploy.yml` workflow builds both the Prisma migration image and the production app image on GitHub-hosted runners. Pull requests only build and syntax-check the deployment scripts. Once enabled, pushes to `main` build immutable images tagged with the commit SHA and stream them over SSH to the VPS. The SSH key is restricted to one root-owned deployment command, with shell, TTY, and forwarding disabled. The workflow pins the VPS SSH host key before connecting.

On the VPS, after this change is merged, run:

```sh
sudo bash /opt/gheverhan/source/deploy/helipod/bootstrap-autodeploy.sh
```

The bootstrap advances the clean source checkout to `main`, installs the forced-command deployment handler, creates a dedicated Ed25519 key, and prints the two GitHub Actions settings:

- Save `HELI_POD_DEPLOY_KEY_B64` as a repository Actions secret with the same name.
- Save `HELI_POD_SSH_KNOWN_HOSTS` as a repository Actions variable with the same name.
- Set the repository Actions variable `HELI_POD_AUTODEPLOY` to `enabled` only after both values are saved.

In GitHub, use **Settings → Secrets and variables → Actions**. The key is generated on the VPS, stored in the repository as an encrypted Actions secret, and never committed. Until the variable is enabled, pushes still build and validate images but do not contact the server.

For every deployment, the VPS applies Prisma migrations from the temporary build-stage image with the database owner account, refreshes the runtime role's grants for new tables and sequences, then replaces only the stateless app container. It checks the local health endpoint and restores the previous app image if the new app fails that check. Database migrations must remain forward-compatible; destructive schema changes still need a separate maintenance plan. The workflow then checks the public health endpoint.
